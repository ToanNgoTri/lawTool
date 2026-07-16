// ─── Chuẩn hoá ký tự đồng hình (homoglyph) trong số hiệu văn bản ────────────────
// luatvietnam.vn đôi khi trộn ký tự Cyrillic nhìn HỆT chữ Latin vào số hiệu, ví dụ
// "280/2026/NĐ-CР" — chữ "Р" cuối là Cyrillic U+0420, không phải "P" Latin U+0050.
// Trang danh sách và trang chi tiết có thể dùng khác bộ ký tự cho cùng một văn bản,
// nên key ở /check và _id lúc push lệch byte -> dedup so khớp chính xác trượt.
// Map Cyrillic -> Latin cho các chữ hoa/thường hay xuất hiện trong số hiệu VN.
const HOMOGLYPH = {
  // hoa
  А: "A", В: "B", Е: "E", К: "K", М: "M", Н: "H", О: "O", Р: "P",
  С: "C", Т: "T", У: "Y", Х: "X", І: "I", Ј: "J", Ѕ: "S",
  // thường
  а: "a", в: "b", е: "e", к: "k", м: "m", н: "h", о: "o", р: "p",
  с: "c", т: "t", у: "y", х: "x", і: "i", ј: "j", ѕ: "s",
};

// Đổi mọi homoglyph Cyrillic -> Latin. Giữ nguyên "Đ"/"đ" (ký tự tiếng Việt thật).
function normalizeLawKey(str) {
  if (str == null) return str;
  return String(str).replace(/[А-Яа-яІіЈјЅѕ]/g, (ch) => HOMOGLYPH[ch] || ch);
}

module.exports = { normalizeLawKey };
