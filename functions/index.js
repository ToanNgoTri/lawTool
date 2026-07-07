/**
 * Cloud Functions cho lawRNTool.
 * Thay puppeteer bằng fetch + cheerio; embed qua Ollama remote; push Mongo + Firestore.
 *
 * Endpoints (HTTP v2):
 *   GET  /check?url=...      -> quét trang danh sách  -> { content: {tên: href} }
 *   GET  /scrapeLaw?url=...  -> quét 1 văn bản        -> { data: {...trường thô} }
 *   POST /processLaw         -> chuẩn hoá + chuyển đổi -> { lawInfo, output, fullText, data, lawNumberForPush }
 *   POST /pushLaw            -> embed + Firestore + Mongo -> { success, lawNumberForPush, ... }
 */

const { onRequest } = require("firebase-functions/https");
const { setGlobalOptions } = require("firebase-functions");
const logger = require("firebase-functions/logger");

const { initializeApp, getApps, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { MongoClient } = require("mongodb");

const scrape = require("./lib/scrape");
const convert = require("./lib/convert");
const pipeline = require("./lib/pipeline");

// Chuỗi kết nối Mongo đọc từ .env (MONGODB_URI) — KHÔNG hardcode để tránh lộ trên GitHub.


// Khởi tạo LAZY: KHÔNG gọi cert()/getFirestore() ở top-level, vì lúc Firebase CLI
// phân tích code (deploy/discovery) .env CHƯA được nạp -> process.env rỗng -> crash.
// Chỉ init khi handler chạy (lúc đó .env đã có). Ghi Firestore của project2-197c0.
let _db = null;
function getDb() {
  if (!getApps().length) {
    initializeApp({
      // Dùng SA_* vì Firebase Functions cấm key .env bắt đầu bằng FIREBASE_.
      credential: cert({
        projectId: process.env.SA_PROJECT_ID,
        clientEmail: process.env.SA_CLIENT_EMAIL,
        privateKey: process.env.SA_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    });
  }
  if (!_db) _db = getFirestore();
  return _db;
}

setGlobalOptions({ region: "asia-southeast1", maxInstances: 10 });

// ─── Mongo client dùng lại giữa các lần gọi (warm instance) ────────────────────
let mongoClientPromise = null;
function getMongo() {
  if (!mongoClientPromise) {
    mongoClientPromise = new MongoClient(process.env.MONGODB_URI).connect();
  }
  return mongoClientPromise;
}

function sendErr(res, err, code = 500) {
  logger.error(err);
  res.status(code).json({ success: false, error: err?.message || String(err) });
}

// ─── GET /check ────────────────────────────────────────────────────────────────
exports.check = onRequest({ cors: true, timeoutSeconds: 60 }, async (req, res) => {
  try {
    const url = req.query.url;
    if (!url) return res.status(400).json({ success: false, error: "Thiếu ?url=" });
    const content = await scrape.scrapeList(String(url));

    // Dedup: ẩn các văn bản đã có trong Mongo (đối chiếu key = _id trong LawSearchDescription).
    // Không để lỗi Mongo làm sập cả request -> báo dedupError để app biết.
    const keys = Object.keys(content);
    let filtered = content;
    let hidden = 0;
    let dedupError = null;
    if (keys.length) {
      try {
        const client = await getMongo();
        const rows = await client
          .db("LawMachine")
          .collection("LawSearchDescription")
          .find({ _id: { $in: keys } }, { projection: { _id: 1 } })
          .toArray();
        const have = new Set(rows.map((r) => r._id));
        filtered = {};
        for (const k of keys) if (!have.has(k)) filtered[k] = content[k];
        hidden = keys.length - Object.keys(filtered).length;
        console.log(`check dedup: total=${keys.length}, hidden=${hidden}, matched=${rows.length}`);
      } catch (e) {
        dedupError = e.message || String(e);
        console.error("check dedup lỗi (trả danh sách chưa lọc):", dedupError);
      }
    }

    res.json({ success: true, content: filtered, total: keys.length, hidden, dedupError, URL: url });
  } catch (err) {
    sendErr(res, err);
  }
});

// ─── GET /scrapeLaw ──────────────────────────────────────────────────────────────
exports.scrapeLaw = onRequest({ cors: true, timeoutSeconds: 60 }, async (req, res) => {
  try {
    const url = req.query.url;
    if (!url) return res.status(400).json({ success: false, error: "Thiếu ?url=" });
    const data = await scrape.scrapeDetail(String(url));
    res.json({ success: true, data });
  } catch (err) {
    sendErr(res, err);
  }
});

// ─── GET /checkExists?id=... ────────────────────────────────────────────────────
// Dedup: kiểm tra lawNumberForPush đã có trong Mongo LawCollection chưa.
exports.checkExists = onRequest(
  { cors: true, timeoutSeconds: 30 },
  async (req, res) => {
    try {
      const id = req.query.id;
      if (!id) return res.status(400).json({ success: false, error: "Thiếu ?id=" });
      const client = await getMongo();
      const doc = await client
        .db("LawMachine")
        .collection("LawSearchDescription")
        .findOne({ _id: String(id) }, { projection: { _id: 1 } });
      res.json({ success: true, exists: !!doc, id });
    } catch (err) {
      sendErr(res, err);
    }
  },
);

// ─── POST /processLaw ────────────────────────────────────────────────────────────
// concurrency:1 vì convert.js dùng biến module-level mutable (không an toàn song song).
exports.processLaw = onRequest(
  { cors: true, concurrency: 1, memory: "512MiB", timeoutSeconds: 120 },
  async (req, res) => {
    try {
      const raw = req.body || {};
      const result = await pipeline.processLaw(raw);
      res.json({ success: true, ...result });
    } catch (err) {
      sendErr(res, err);
    }
  },
);

// ─── POST /pushLaw ───────────────────────────────────────────────────────────────
// Body: { lawInfo, data, fullText }. Embed (Ollama remote) -> Firestore + Mongo.
exports.pushLaw = onRequest(
  {
    cors: true,
    concurrency: 1,
    memory: "1GiB",
    timeoutSeconds: 540,
  },
  async (req, res) => {
    try {
      const { lawInfo, data, fullText } = req.body || {};
      if (!lawInfo || !data || !fullText) {
        return res.status(400).json({ success: false, error: "Thiếu lawInfo/data/fullText" });
      }

      // GIỮ date dạng CHUỖI ISO (khớp data hiện có, vd "2024-11-10T17:00:00.000Z").
      // Chỉ chuẩn hoá lại thành chuỗi ISO nếu lỡ nhận Date/khác kiểu.
      if (lawInfo.lawDaySign) lawInfo.lawDaySign = new Date(lawInfo.lawDaySign).toISOString();
      if (lawInfo.lawDayActive) lawInfo.lawDayActive = new Date(lawInfo.lawDayActive).toISOString();

      const lawNumberForPush = convert.createNameLawForPush(lawInfo);
      const force = req.body.force === true;

      // Dedup: đã tồn tại trong Mongo?
      const client = await getMongo();
      const dbm = client.db("LawMachine");
      const existing = await dbm
        .collection("LawSearchDescription")
        .findOne({ _id: lawNumberForPush }, { projection: { _id: 1 } });
      if (existing && !force) {
        return res.json({ success: false, duplicate: true, lawNumberForPush });
      }
      if (existing && force) {
        await removeExisting(dbm, lawNumberForPush); // ghi đè: xoá bản cũ trước
      }

      // 1) Embed toàn bộ chunk (gọi Ollama — hiện trỏ localhost:11434 trong convert.js)
      const law = { info: lawInfo, content: data };
      const chunks = await convert.processAllLaws(law);
      if (!chunks || chunks.length === 0) {
        return res.status(500).json({ success: false, error: "Không tạo được chunk nào để embed" });
      }

      // 2) Push chunks -> Firestore (bắt lỗi riêng để lộ chính xác vì sao chunk không lên)
      let firestoreOk = false;
      let firestoreError = null;
      try {
        firestoreOk = await pushLawChunk(chunks);
      } catch (e) {
        firestoreError = e.message || String(e);
        console.error("❌ pushLawChunk (Firestore) lỗi:", e);
      }

      // 3) Push -> MongoDB (3 collection: LawCollection, LawSearchContent, LawSearchDescription)
      const mongoOk = await pushMongo(lawInfo, data, fullText, lawNumberForPush);

      res.json({
        success: firestoreOk && mongoOk,
        lawNumberForPush,
        chunks: chunks.length,
        firestoreOk,
        firestoreError,
        mongoOk,
      });
    } catch (err) {
      sendErr(res, err);
    }
  },
);

// ─── Firestore: port pushLawChunk từ nextLawTool/app/api/embedlaw ─────────────────
async function pushLawChunk(lawEmbedding) {
  if (!lawEmbedding || lawEmbedding.length === 0) return false;
  const db = getDb();
  // Firestore emulator (bản cũ) không nhận FieldValue.vector -> lưu mảng thường khi test local.
  const inEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;
  const colRef = db.collection("chunks");
  const chunkSize = 500; // Firestore batch tối đa 500 op
  for (let i = 0; i < lawEmbedding.length; i += chunkSize) {
    const batch = db.batch();
    for (const item of lawEmbedding.slice(i, i + chunkSize)) {
      const docRef = item._id ? colRef.doc(String(item._id)) : colRef.doc();
      const { embedding, ...rest } = item;
      let embeddingField = {};
      if (embedding) {
        embeddingField = { embedding: inEmulator ? embedding : FieldValue.vector(embedding) };
      }
      batch.set(docRef, { ...rest, ...embeddingField });
    }
    await batch.commit();
  }
  return true;
}

// Xoá bản cũ khi ghi đè (force): 3 collection Mongo + chunks trên Firestore.
async function removeExisting(dbm, id) {
  await Promise.all([
    dbm.collection("LawCollection").deleteOne({ _id: id }),
    dbm.collection("LawSearchContent").deleteOne({ _id: id }),
    dbm.collection("LawSearchDescription").deleteOne({ _id: id }),
  ]);
  // Firestore: chunks lưu field lawId = lawNumberForPush
  const db = getDb();
  const snap = await db.collection("chunks").where("lawId", "==", id).get();
  for (let i = 0; i < snap.docs.length; i += 500) {
    const batch = db.batch();
    snap.docs.slice(i, i + 500).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

// ─── Mongo: port /api/push (3 thao tác) ─────────────────────────────────────────
async function pushMongo(lawInfo, dataLaw, fullText, id) {
  const client = await getMongo();
  const dbm = client.db("LawMachine");

  await dbm.collection("LawCollection").insertOne({ _id: id, info: lawInfo, content: dataLaw });

  await dbm.collection("LawSearchContent").insertOne({
    _id: id,
    info: {
      lawNumber: lawInfo.lawNumber,
      lawDescription: lawInfo.lawDescription,
      lawNameDisplay: lawInfo.lawNameDisplay,
      lawDaySign: lawInfo.lawDaySign,
      lawDayActive: lawInfo.lawDayActive,
    },
    fullText,
  });

  await dbm.collection("LawSearchDescription").insertOne({
    _id: id,
    info: {
      lawDescription: lawInfo.lawDescription,
      lawNameDisplay: lawInfo.lawNameDisplay,
      lawDaySign: lawInfo.lawDaySign,
      lawDayActive: lawInfo.lawDayActive,
    },
  });

  return true;
}
