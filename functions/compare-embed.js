// So sánh vector bge-m3 giữa 2 endpoint (Ollama hiện tại vs Cloudflare Worker).
// File này KHÔNG deploy (đã ignore trong firebase.json).
//
//   node --use-system-ca compare-embed.js <URL_B> <KEY_B> [URL_A]
//   URL_A mặc định = https://ollama.pixelplaces.net/api/embed
//
// cos ≥ 0.999 ở mọi câu -> đổi thẳng, KHÔNG cần embed lại ragdb.

const URL_B = process.argv[2];
const KEY_B = process.argv[3] || "";
const URL_A = process.argv[4] || "https://ollama.pixelplaces.net/api/embed";

const TEXTS = [
  "Điều 1. Phạm vi điều chỉnh",
  "Người lao động có quyền đơn phương chấm dứt hợp đồng lao động nhưng phải báo trước cho người sử dụng lao động.",
  "Mức phạt tiền đối với hành vi điều khiển xe ô tô chạy quá tốc độ quy định từ 05 km/h đến dưới 10 km/h.",
  "Thời hạn đăng ký tạm trú của công dân là bao lâu?",
];

async function embed(url, key, text) {
  const headers = { "Content-Type": "application/json" };
  if (key) headers["x-key"] = key;
  const t0 = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ model: "bge-m3", input: text }),
  });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return { v: data.embeddings[0], ms: Date.now() - t0 };
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

(async () => {
  if (!URL_B) {
    console.error("Cách dùng: node --use-system-ca compare-embed.js <URL_B> <KEY_B> [URL_A]");
    process.exit(1);
  }
  console.log("A:", URL_A);
  console.log("B:", URL_B, "\n");
  let min = 1;
  for (const t of TEXTS) {
    const [a, b] = await Promise.all([embed(URL_A, "", t), embed(URL_B, KEY_B, t)]);
    if (a.v.length !== b.v.length) {
      console.log(`❌ Lệch số chiều: A=${a.v.length} B=${b.v.length}`);
      process.exit(1);
    }
    const c = cosine(a.v, b.v);
    min = Math.min(min, c);
    console.log(`cos=${c.toFixed(5)}  dim=${a.v.length}  A ${a.ms}ms  B ${b.ms}ms  | ${t.slice(0, 50)}`);
  }
  console.log(
    min >= 0.999
      ? "\n✅ Khớp — đổi endpoint được, không cần embed lại."
      : min >= 0.98
        ? "\n⚠️ Gần khớp — tìm kiếm vẫn dùng được nhưng nên embed lại ragdb cho chuẩn."
        : "\n❌ Không khớp — phải embed lại toàn bộ ragdb.chunks (và đổi askLawAI lawMachine cùng lúc).",
  );
})().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});
