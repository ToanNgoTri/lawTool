// Cloudflare Worker "law-embed": Workers AI cho embedding (bge-m3) + LLM chat.
//
//   POST /api/embed            body { model?, input: string | string[] }  -> { model, embeddings: [[...]] }  (kiểu Ollama)
//   POST /api/embeddings       body { model?, prompt: string }            -> { embedding: [...] }          (kiểu Ollama cũ)
//   POST /v1/chat/completions  body kiểu OpenAI { model, messages, max_tokens?, temperature?, stream? }
//                              -> stream SSE kiểu OpenAI (chunk có delta.content), như OpenRouter
//   GET  /v1/usage             -> { day, llmNeurons, cap }
//
// EMBEDDING LÀ ƯU TIÊN: gói free 10.000 neuron/ngày dùng chung cho cả hai. LLM chỉ được dùng tới
// LLM_NEURON_CAP (mặc định 5000) neuron/ngày (đếm trong KV LLM_USAGE). Vượt mức -> trả 429 để bên gọi
// (askLawAI) chuyển sang OpenRouter; phần còn lại luôn để dành cho embedding.
//
// Bảo vệ bằng header `x-key` = secret API_KEY (wrangler secret put API_KEY).

const EMBED_MODEL = "@cf/baai/bge-m3";

// Model LLM được phép + giá (neuron / 1 triệu token) để ước tính phần prompt khi stream không báo.
// 1.000 neuron = 0,011 USD -> neuron/M = USD/M / 0.011 * 1000.
const LLM_MODELS = {
  "@cf/google/gemma-4-26b-a4b-it": { inPerM: 9091, outPerM: 27273 },
  "@cf/qwen/qwen3.8-27b": { inPerM: 40909, outPerM: 290909 },
};
const DEFAULT_CAP = 5000;

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/$/, "");

    if (req.method === "GET" && path === "") {
      return new Response("embed-worker OK (bge-m3 + chat)");
    }
    if (!env.API_KEY || req.headers.get("x-key") !== env.API_KEY) {
      return json({ error: "unauthorized" }, 401);
    }
    if (req.method === "GET" && path === "/v1/usage") {
      const day = today();
      return json({ day, llmNeurons: await usedToday(env, day), cap: cap(env) });
    }
    if (req.method !== "POST") return json({ error: "POST only" }, 405);

    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: "body phải là JSON" }, 400);
    }

    if (path === "/v1/chat/completions") return chat(body, env, ctx);
    return embed(body, path, env);
  },
};

// ── Embedding (giữ nguyên hành vi cũ) ─────────────────────────────────────────
async function embed(body, path, env) {
  const legacy = path === "/api/embeddings";
  const raw = legacy ? body.prompt : body.input ?? body.prompt;
  const texts = (Array.isArray(raw) ? raw : [raw]).filter(
    (t) => typeof t === "string" && t.length > 0,
  );
  if (texts.length === 0) return json({ error: "thiếu input/prompt" }, 400);

  try {
    const out = await env.AI.run(EMBED_MODEL, { text: texts });
    const embeddings = out.data;
    if (legacy) return json({ embedding: embeddings[0] });
    return json({ model: "bge-m3", embeddings });
  } catch (e) {
    return json({ error: errMsg(e) }, 500);
  }
}

// ── LLM chat ─────────────────────────────────────────────────────────────────
async function chat(body, env, ctx) {
  const price = LLM_MODELS[body.model];
  if (!price) return json({ error: { message: `model không được phép: ${body.model}` } }, 400);
  if (!Array.isArray(body.messages) || !body.messages.length) {
    return json({ error: { message: "thiếu messages" } }, 400);
  }

  const day = today();
  const used = await usedToday(env, day);
  const limit = cap(env);
  if (used >= limit) {
    return json(
      { error: { code: "llm_quota", message: `LLM đã dùng ${Math.round(used)}/${limit} neuron hôm nay (phần còn lại để dành cho embedding)` } },
      429,
    );
  }

  const input = {
    messages: body.messages,
    max_tokens: Math.min(Number(body.max_tokens) || 2048, 4096),
    temperature: body.temperature ?? 0.2,
    stream: true,
    // Tắt "nghĩ" (reasoning): nếu không model nghĩ hết max_tokens, tốn neuron mà không ra chữ.
    chat_template_kwargs: { enable_thinking: false },
  };

  let upstream;
  try {
    upstream = await env.AI.run(body.model, input);
  } catch (e) {
    const msg = errMsg(e);
    // 4006 = hết neuron free trong ngày; capacity = hết GPU tạm thời -> 429 để bên gọi chuyển model.
    const busy = /4006|daily free|neuron|capacity|rate limit|too many/i.test(msg);
    return json({ error: { message: msg } }, busy ? 429 : 502);
  }

  // Chuyển nguyên stream cho bên gọi; đọc lén usage.neurons từng chunk để cộng vào KV khi xong.
  const promptEstimate = (JSON.stringify(body.messages).length / 3 / 1e6) * price.inPerM;
  let neurons = 0; // cộng dồn usage.neurons của từng chunk
  let summary = null; // dòng tổng kết cuối stream ({"response":"","usage":{...}}) = tổng chính xác
  let sawPrompt = false;
  let buf = "";
  const decoder = new TextDecoder();
  const tally = (text) => {
    buf += text;
    const lines = buf.split("\n");
    buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const j = JSON.parse(data);
        const u = j.usage;
        if (!u) continue;
        if (!j.choices && "response" in j) {
          summary = Number(u.neurons) || 0;
        } else {
          neurons += Number(u.neurons) || 0;
          if (u.prompt_tokens > 0) sawPrompt = true;
        }
      } catch {}
    }
  };

  const { readable, writable } = new TransformStream({
    transform(chunk, controller) {
      tally(decoder.decode(chunk, { stream: true }));
      controller.enqueue(chunk);
    },
    flush() {
      tally("\n");
      const total = summary ?? neurons + (sawPrompt ? 0 : promptEstimate);
      ctx.waitUntil(addUsage(env, day, total));
    },
  });
  upstream.pipeTo(writable).catch(() => {});

  return new Response(readable, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
    },
  });
}

// ── Bộ đếm neuron LLM trong KV ───────────────────────────────────────────────
function today() {
  return new Date().toISOString().slice(0, 10); // UTC, trùng mốc reset gói free của Cloudflare
}
function cap(env) {
  return Number(env.LLM_NEURON_CAP) || DEFAULT_CAP;
}
async function usedToday(env, day) {
  if (!env.LLM_USAGE) return 0;
  return Number(await env.LLM_USAGE.get(`llm:${day}`)) || 0;
}
async function addUsage(env, day, n) {
  if (!env.LLM_USAGE || !(n > 0)) return;
  // Đọc-cộng-ghi: có thể hụt chút khi nhiều request cùng lúc, chấp nhận được với lưu lượng hiện tại.
  const key = `llm:${day}`;
  const cur = Number(await env.LLM_USAGE.get(key)) || 0;
  await env.LLM_USAGE.put(key, String(cur + n), { expirationTtl: 3 * 86400 });
}

function errMsg(e) {
  return String(e && e.message ? e.message : e);
}
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
