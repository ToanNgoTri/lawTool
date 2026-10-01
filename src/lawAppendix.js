// Phụ lục / văn bản ban hành kèm theo (do functions/lib/lawAppendix.js tạo ra — cùng format với nextLawTool và lawMachine).
//
// Mỗi phụ lục là 1 mục cấp cao nối vào CUỐI `content`, khóa bắt đầu bằng ký tự
// vô hình U+2062: { "\u2062" + tên: [ {Chương…: [...]}, {Điều…: "..."} ] } hoặc
// { "\u2062" + tên: [{ " ": "nội dung" }] }. App cũ hiện như 1 Điều; app mới vẽ riêng.

export const APPENDIX_MARK = "\u2062";

export function isAppendixKey(key) {
  return typeof key === "string" && key.startsWith(APPENDIX_MARK);
}

// "Phụ lục IV DANH MỤC … (Kèm theo …)" ->
//   { badge: "PHỤ LỤC IV", name: "DANH MỤC …", sub: "(Kèm theo …)", short: "Phụ lục IV" }
// "QUY CHẾ … (Ban hành kèm theo …)" ->
//   { badge: "VĂN BẢN KÈM THEO", name: "QUY CHẾ …", sub: "(Ban hành kèm theo …)", short: "QUY CHẾ …" }
export function parseAppendixTitle(key) {
  const title = String(key || "")
    .replace(/^\u2062/, "")
    .trim();
  const m = title.match(/^(.*?)\s*(\(.*)$/);
  const head = m && m[1] ? m[1] : title;
  const sub = m && m[1] ? m[2] : "";
  // số hiệu phụ lục phải đứng riêng (không nuốt chữ "C" của "CÁC …")
  const pl = head.match(/^(ph[ụu]\s*l[ụu]c(?:\s+[IVXLC\d]+(?=[\s.]|$))?)\.?\s*(.*)$/iu);
  if (pl) {
    return {
      badge: pl[1].toUpperCase(),
      name: pl[2] || "",
      sub,
      short: pl[1],
    };
  }
  return { badge: "VĂN BẢN KÈM THEO", name: head, sub, short: head };
}
