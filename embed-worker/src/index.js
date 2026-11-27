// Cloudflare Worker: embed bge-m3 qua Workers AI, giả lập API Ollama `/api/embed`
// để functions/lib/convert.js (embedText) dùng được mà không sửa logic.
//
//   POST /api/embed       body { model?, input: string | string[] }  -> { model, embeddings: [[...]] }
//   POST /api/embeddings  body { model?, prompt: string }            -> { embedding: [...] }  (kiểu Ollama cũ)
//
// Bảo vệ bằng header `x-key` = secret API_KEY (wrangler secret put API_KEY).

const MODEL = "@cf/baai/bge-m3";

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname === "/") {
      return new Response("embed-worker OK (bge-m3)");
    }
    if (req.method !== "POST") return json({ error: "POST only" }, 405);
    if (!env.API_KEY || req.headers.get("x-key") !== env.API_KEY) {
      return json({ error: "unauthorized" }, 401);
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: "body phải là JSON" }, 400);
    }

    const legacy = url.pathname.replace(/\/$/, "") === "/api/embeddings";
    const raw = legacy ? body.prompt : body.input ?? body.prompt;
    const texts = (Array.isArray(raw) ? raw : [raw]).filter(
      (t) => typeof t === "string" && t.length > 0,
    );
    if (texts.length === 0) return json({ error: "thiếu input/prompt" }, 400);

    try {
      const out = await env.AI.run(MODEL, { text: texts });
      const embeddings = out.data;
      if (legacy) return json({ embedding: embeddings[0] });
      return json({ model: "bge-m3", embeddings });
    } catch (e) {
      return json({ error: String(e && e.message ? e.message : e) }, 500);
    }
  },
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
