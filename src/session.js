// Lưu phiên làm việc xuống máy (MMKV) — Android hay TẮT HẲN app khi chạy nền
// (thiếu RAM), mở lại là khởi động từ đầu -> mọi state trong RAM mất hết.
// Dùng MMKV thay AsyncStorage: AsyncStorage Android giới hạn ~2MB / giá trị,
// văn bản luật dài + bảng có thể vượt.
//
// Khóa:
//  - "check"            : { url, items, note } màn danh sách (CheckScreen)
//  - "openLaw"          : url văn bản đang mở (App)
//  - "law:<url>"        : { raw, scraped, tableBase, showDetail, exists, pushed } (LawScreen)
//  - "law:<url>:result" : kết quả processLaw (lưu riêng, chỉ khi có kết quả mới)
//  - "lawKeys"          : danh sách url đã lưu, mới nhất cuối — giữ tối đa MAX_LAWS
import { createMMKV } from "react-native-mmkv";

const MAX_LAWS = 5;

let storage = null;
try {
  storage = createMMKV({ id: "lawRNTool-session" });
} catch (e) {
  // chưa build lại bản native có MMKV -> app vẫn chạy, chỉ không lưu phiên
  console.warn("MMKV không khả dụng, không lưu phiên:", e?.message || e);
}

export function load(key) {
  if (!storage) return null;
  try {
    const s = storage.getString(key);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

export function save(key, value) {
  if (!storage) return;
  try {
    if (value === undefined || value === null) storage.remove(key);
    else storage.set(key, JSON.stringify(value));
  } catch (e) {
    console.warn("Lưu phiên lỗi:", key, e?.message || e);
  }
}

const lawKey = (url) => `law:${url}`;

export function loadLaw(url) {
  const state = load(lawKey(url));
  if (!state) return null;
  return { ...state, processed: load(`${lawKey(url)}:result`) };
}

export function saveLaw(url, state) {
  save(lawKey(url), state);
  // đưa url lên cuối danh sách, xoá phiên cũ nhất nếu quá MAX_LAWS
  const keys = (load("lawKeys") || []).filter((u) => u !== url);
  keys.push(url);
  while (keys.length > MAX_LAWS) clearLaw(keys.shift(), false);
  save("lawKeys", keys);
}

export function saveLawResult(url, processed) {
  save(`${lawKey(url)}:result`, processed);
}

export function clearLaw(url, updateIndex = true) {
  save(lawKey(url), null);
  save(`${lawKey(url)}:result`, null);
  if (updateIndex) save("lawKeys", (load("lawKeys") || []).filter((u) => u !== url));
}
