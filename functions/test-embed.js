// Test nhanh chức năng embed (Ollama). File này KHÔNG deploy (đã ignore trong firebase.json).
//
// 1) Test với cấu hình mặc định trong code (OLLAMA_EMBED_URL remote):
//      node test-embed.js "Điều 1. Phạm vi điều chỉnh"
//
// 2) Test với Ollama LOCAL của bạn:
//      OLLAMA_EMBED_URL=http://localhost:11434/api/embed OLLAMA_MODEL=bge-m3 node test-embed.js "abc"
//
// convert.js đọc OLLAMA_EMBED_URL / OLLAMA_MODEL lúc nạp module -> đặt env TRƯỚC lệnh node.

const { embedText } = require("./lib/convert.js");

(async () => {
  const text = process.argv[2] || "Điều 1. Phạm vi điều chỉnh của Nghị định";
  console.log("URL   :", process.env.OLLAMA_EMBED_URL || "(mặc định remote trong code)");
  console.log("MODEL :", process.env.OLLAMA_MODEL || "bge-m3");
  console.log("TEXT  :", text);

  const t0 = Date.now();
  const v = await embedText(text);
  const ms = Date.now() - t0;

  if (!Array.isArray(v)) {
    console.error("❌ Kết quả KHÔNG phải mảng vector:", v);
    process.exit(1);
  }
  console.log(`✅ OK — vector ${v.length} chiều, ${ms}ms`);
  console.log("5 giá trị đầu:", v.slice(0, 5));
})().catch((e) => {
  console.error("❌ EMBED LỖI:", e.message);
  process.exit(1);
});
