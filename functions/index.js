/**
 * Cloud Functions cho lawRNTool.
 * Thay puppeteer bằng fetch + cheerio; embed qua Ollama remote; push toàn bộ vào MongoDB.
 *
 * Endpoints (HTTP v2):
 *   GET  /check?url=...      -> quét trang danh sách  -> { content: {tên: href} }
 *   GET  /scrapeLaw?url=...  -> quét 1 văn bản        -> { data: {...trường thô} }
 *   POST /processLaw         -> chuẩn hoá + chuyển đổi -> { lawInfo, output, fullText, data, lawNumberForPush }
 *   POST /pushLaw            -> embed + Mongo (metadata + ragdb.chunks) -> { success, lawNumberForPush, ... }
 */

const { onRequest } = require("firebase-functions/https");
const { setGlobalOptions } = require("firebase-functions");
const logger = require("firebase-functions/logger");

const crypto = require("crypto");
const { MongoClient } = require("mongodb");

const scrape = require("./lib/scrape");
const convert = require("./lib/convert");
const pipeline = require("./lib/pipeline");

// Chuỗi kết nối Mongo đọc từ .env — KHÔNG hardcode để tránh lộ trên GitHub.
//   MONGODB_URI      -> LawMachine (metadata: LawCollection, LawSearch*)
//   MONGODB_URI_RAG  -> ragdb (collection `chunks` + index $vectorSearch cho AI)

setGlobalOptions({ region: "asia-southeast1", maxInstances: 10 });

// ─── Mongo client dùng lại giữa các lần gọi (warm instance) ────────────────────
let mongoClientPromise = null;
function getMongo() {
  if (!mongoClientPromise) {
    mongoClientPromise = new MongoClient(process.env.MONGODB_URI).connect();
  }
  return mongoClientPromise;
}

// Client riêng cho ragdb (chunks vector search) — server/cred khác MONGODB_URI.
let ragClientPromise = null;
function getRagMongo() {
  if (!ragClientPromise) {
    ragClientPromise = new MongoClient(process.env.MONGODB_URI_RAG).connect();
  }
  return ragClientPromise;
}
const RAG_DB = "ragdb";
const RAG_CHUNKS = "chunks";

// ─── ObjectLawPair: bản đồ tra "luật liên quan" ─────────────────────────────────
// Trước đây bundle sẵn functions/lib/ObjectLawPair.json (read-only, đóng băng theo
// mỗi lần deploy -> lỗi thời). Giờ dựng trực tiếp từ Mongo LawMachine.LawSearchDescription
// — CHÍNH collection mà pushLaw đã ghi và backend web đang đối chiếu -> web + RN dùng
// chung một nguồn, tự cập nhật sau mỗi push, không cần collection/migration riêng.
//
// Map 2 CHIỀU — khớp hệt nextLawTool /api/getlawjson để convert.getLawRelated
// resolve được cả trích dẫn dạng TÊN lẫn dạng SỐ HIỆU:
//   - normalize(lawNameDisplay) -> _id  : chỉ với luật có chữ "Luật". Nhờ chiều này,
//     trích dẫn "Căn cứ Luật ... năm YYYY" (không có số hiệu trong văn bản) được
//     nhánh 1 của getLawRelated tra ra số hiệu -> { số hiệu: tên trích dẫn }.
//   - _id -> lawDescription             : trích dẫn bằng số hiệu -> lấy mô tả DB.
// Số hiệu là key sạch (không dấu cách) nên qua được bộ lọc cuối; trích dẫn không
// tra được vẫn ở dạng { số hiệu: 0 }. Trích dẫn dạng tên KHÔNG khớp DB (key có dấu
// cách) bị bộ lọc cuối loại — đúng như nextLawTool.
//
// Cache trong RAM mỗi warm instance, refresh sau TTL để bắt bản push từ nền tảng khác.
let _lawPairCache = null;
let _lawPairLoadedAt = 0;
const LAW_PAIR_TTL_MS = 10 * 60 * 1000; // 10 phút

async function getObjectLawPair() {
  if (_lawPairCache && Date.now() - _lawPairLoadedAt < LAW_PAIR_TTL_MS) {
    return _lawPairCache;
  }
  const client = await getMongo();
  const rows = await client
    .db("LawMachine")
    .collection("LawSearchDescription")
    .find({}, { projection: { _id: 1, "info.lawNameDisplay": 1, "info.lawDescription": 1 } })
    .toArray();
  const map = {};
  for (const r of rows) {
    const info = r.info || {};
    const lawNameDisplay = info.lawNameDisplay || "";
    const lawDescription = info.lawDescription || "";
    if (lawNameDisplay.match(/Luật/gim)) {
      map[lawNameDisplay.toLowerCase().replace(/( và| của|,|&)/gim, "")] = r._id;
    }
    map[r._id] = lawDescription;
  }
  _lawPairCache = map;
  _lawPairLoadedAt = Date.now();
  console.log(`ObjectLawPair dựng từ LawSearchDescription: ${rows.length} mục`);
  return map;
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

    // Tính sẵn lawDayActive (ngày hiệu lực) để màn sửa hiển thị & sửa được ngay —
    // không scrape trực tiếp được, phải suy từ nội dung + ngày ký.
    try {
      const daySign = String(data.lawDaySign || "").replace(/\s/g, "");
      const da = convert.getLawDayActive(data.content || "", daySign);
      data.lawDayActive = da instanceof Date && !isNaN(da) ? da.toISOString() : "";
    } catch {
      data.lawDayActive = "";
    }

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
      const objectLawPair = await getObjectLawPair();
      const result = await pipeline.processLaw(raw, objectLawPair);
      res.json({ success: true, ...result });
    } catch (err) {
      sendErr(res, err);
    }
  },
);

// ─── POST /pushLaw ───────────────────────────────────────────────────────────────
// Body: { lawInfo, data, fullText }. Embed (Ollama remote) -> Mongo (metadata + ragdb.chunks).
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

      // 2) Push chunks -> MongoDB ragdb.chunks (bắt lỗi riêng để lộ vì sao chunk không lên)
      let chunksOk = false;
      let chunksError = null;
      try {
        chunksOk = await pushLawChunk(chunks);
      } catch (e) {
        chunksError = e.message || String(e);
        console.error("❌ pushLawChunk (Mongo ragdb) lỗi:", e);
      }

      // 3) Push -> MongoDB (3 collection: LawCollection, LawSearchContent, LawSearchDescription).
      //    LawSearchDescription cũng chính là nguồn của ObjectLawPair -> văn bản vừa push
      //    tự động được nhận diện là "luật liên quan" về sau, không cần bước ghi riêng
      //    (thay hẳn addJSONFile cũ). Cập nhật luôn cache in-memory nếu instance này đã nạp.
      const mongoOk = await pushMongo(lawInfo, data, fullText, lawNumberForPush);
      // Cập nhật cache in-memory theo ĐÚNG cấu trúc 2 chiều của getObjectLawPair()
      // (khớp nextLawTool /api/getlawjson): tên -> số hiệu (chỉ luật), số hiệu -> mô tả.
      if (mongoOk && _lawPairCache) {
        const nameDisplay = lawInfo.lawNameDisplay || "";
        if (nameDisplay.match(/Luật/gim)) {
          _lawPairCache[nameDisplay.toLowerCase().replace(/( và| của|,|&)/gim, "")] = lawNumberForPush;
        }
        _lawPairCache[lawNumberForPush] = lawInfo.lawDescription || "";
      }

      res.json({
        success: chunksOk && mongoOk,
        lawNumberForPush,
        chunks: chunks.length,
        chunksOk,
        chunksError,
        mongoOk,
      });
    } catch (err) {
      sendErr(res, err);
    }
  },
);

// ─── Ghi chunk (embedding) vào MongoDB ragdb.chunks ───────────────────────────
// $vectorSearch cần `embedding` là MẢNG số thường (không phải kiểu vector đặc biệt
// như FieldValue.vector của Firestore). Upsert theo _id để push đè an toàn — khớp
// schema mà scripts/firestoreToMongo.mjs của nextLawTool đã dựng.
async function pushLawChunk(lawEmbedding) {
  if (!lawEmbedding || lawEmbedding.length === 0) return false;
  const client = await getRagMongo();
  const col = client.db(RAG_DB).collection(RAG_CHUNKS);
  const batchSize = 500;
  for (let i = 0; i < lawEmbedding.length; i += batchSize) {
    const ops = lawEmbedding.slice(i, i + batchSize).map((item) => {
      const _id = item._id ? String(item._id) : crypto.randomUUID();
      const { embedding, ...rest } = item;
      const doc = { ...rest, _id, ...(embedding ? { embedding } : {}) };
      return { replaceOne: { filter: { _id }, replacement: doc, upsert: true } };
    });
    await col.bulkWrite(ops, { ordered: false });
  }
  return true;
}

// Xoá bản cũ khi ghi đè (force): 3 collection metadata + chunks trên ragdb.
async function removeExisting(dbm, id) {
  await Promise.all([
    dbm.collection("LawCollection").deleteOne({ _id: id }),
    dbm.collection("LawSearchContent").deleteOne({ _id: id }),
    dbm.collection("LawSearchDescription").deleteOne({ _id: id }),
  ]);
  // ragdb.chunks lưu field lawId = lawNumberForPush
  const rag = await getRagMongo();
  await rag.db(RAG_DB).collection(RAG_CHUNKS).deleteMany({ lawId: id });
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
