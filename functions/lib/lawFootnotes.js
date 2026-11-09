// ─── Bỏ chú thích (footnote) của luatvietnam.vn ────────────────────────────────
// Văn bản hợp nhất (VBHN) có chú thích dạng:
//   - số tham chiếu trong thân bài: `p)<sup>2</sup><span id="footnote-ref-2">`
//     (có chỗ thiếu span footnote-ref, vd `…Bộ luật<sup>1</sup>`)
//   - nội dung chú thích ngay sau khối được tham chiếu, trong 1 khối riêng
//     (thường `.docitem-48`): `<p id="footnote-2"><sup>2</sup> Điểm này được …</p>`
// Cả hai đều không thuộc nội dung văn bản -> xoá khỏi DOM TRƯỚC khi đọc text.
//
// Số tham chiếu của chú thích N = thẻ <sup> có text "N" GẦN NHẤT ĐỨNG TRƯỚC
// <p id="footnote-N"> (theo thứ tự tài liệu). Không xoá mọi <sup> là số vì còn
// chỉ số thật như m<sup>2</sup>. Bản trong trang (puppeteer) ở
// nextLawTool/app/lib/lawFootnotes.js — giữ 2 bản giống nhau.

const FOOTNOTE_ID = /^footnote-(\d+)$/;

function removeFootnotes($, body) {
  const lastSup = {}; // "N" -> <sup> gần nhất có text N
  const markers = [];
  const notes = [];
  body.find("sup, [id^='footnote-']").each((_, el) => {
    const $el = $(el);
    const id = $el.attr("id") || "";
    const m = id.match(FOOTNOTE_ID);
    if (m) {
      notes.push($el);
      if (lastSup[m[1]]) markers.push(lastSup[m[1]]);
      delete lastSup[m[1]];
      return;
    }
    if (el.tagName !== "sup") return;
    if ($el.closest("[id^='footnote-']").filter((_, p) => FOOTNOTE_ID.test($(p).attr("id") || "")).length) return;
    const n = $el.text().trim();
    if (/^\d+$/.test(n)) lastSup[n] = $el;
  });

  markers.forEach(($s) => $s.remove());
  body.find("[id^='footnote-ref-']").remove();
  notes.forEach(($p) => {
    // Khối bọc chú thích (con trực tiếp của body) chỉ chứa chú thích -> xoá cả khối
    // để không còn dòng rác; nếu khối còn nội dung khác thì chỉ xoá đoạn chú thích.
    const block = $p.parentsUntil(body).last();
    const onlyNote =
      block.length && block.find("p").not($p).not($p.find("p")).length === 0;
    if (onlyNote) block.remove();
    else $p.remove();
  });
  return notes.length;
}

module.exports = { removeFootnotes };
