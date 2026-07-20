import { FUNCTIONS_BASE_URL } from "./config";

// Các trường thô trả về từ scrapeLaw (giống output /api/url gốc).
export type RawLaw = {
  content: string;
  lawNumber: string;
  unitPublish: string;
  lawKind: string;
  nameSign: string;
  lawDaySign: string;
  lawDayActive: string; // không scrape được; tính khi processLaw, có thể override
  lawNameDisplay: string; // tên hiển thị, tính khi processLaw
  lawDescription: string;
  lawRelated: string;
  roleSign: string;
};

export type ProcessResult = {
  lawInfo: Record<string, any>;
  output: string;
  fullText: string;
  data: any;
  lawNumberForPush: string;
};

async function getJSON(path: string): Promise<any> {
  const res = await fetch(`${FUNCTIONS_BASE_URL}/${path}`);
  const json = await res.json();
  if (!res.ok || json.success === false) {
    throw new Error(json.error || `HTTP ${res.status}`);
  }
  return json;
}

async function postJSON(path: string, body: any): Promise<any> {
  const res = await fetch(`${FUNCTIONS_BASE_URL}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok || json.success === false) {
    throw new Error(json.error || `HTTP ${res.status}`);
  }
  return json;
}

// GET /check -> danh sách đã lọc bỏ văn bản đã có trong Mongo
export async function check(
  url: string,
): Promise<{ content: Record<string, string>; total: number; hidden: number; dedupError: string | null }> {
  const json = await getJSON(`check?url=${encodeURIComponent(url)}`);
  return {
    content: json.content || {},
    total: json.total || 0,
    hidden: json.hidden || 0,
    dedupError: json.dedupError || null,
  };
}

// GET /scrapeLaw -> các trường thô của 1 văn bản
export async function scrapeLaw(url: string): Promise<RawLaw> {
  const json = await getJSON(`scrapeLaw?url=${encodeURIComponent(url)}`);
  return json.data as RawLaw;
}

// POST /processLaw -> chuẩn hoá + chuyển đổi (chưa ghi DB)
export async function processLaw(raw: RawLaw): Promise<ProcessResult> {
  const json = await postJSON("processLaw", raw);
  return json as ProcessResult;
}

// GET /checkExists -> văn bản đã có trong Mongo chưa
export async function checkExists(id: string): Promise<boolean> {
  const json = await getJSON(`checkExists?id=${encodeURIComponent(id)}`);
  return !!json.exists;
}

// POST /pushLaw -> embed + Firestore + Mongo. force=true để ghi đè bản cũ.
export async function pushLaw(payload: {
  lawInfo: Record<string, any>;
  data: any;
  fullText: string;
  force?: boolean;
}): Promise<{
  success: boolean;
  duplicate?: boolean;
  lawNumberForPush: string;
  chunks?: number;
  chunksOk?: boolean;
  chunksError?: string | null;
  mongoOk?: boolean;
}> {
  // Không dùng postJSON: cần giữ lại cờ duplicate (server trả success:false khi trùng).
  const res = await fetch(`${FUNCTIONS_BASE_URL}/pushLaw`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok && !json.duplicate) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}
