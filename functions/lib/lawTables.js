// ─── Giữ nguyên BẢNG trong nội dung văn bản (port nextLawTool app/lib/lawTables.js) ─
//
// Cách lưu (tương thích ngược với app cũ) — PHẢI khớp nextLawTool + lawMachine:
//  - Trong chuỗi nội dung điều luật, mỗi hàng của bảng vẫn là 1 dòng text đọc được
//    ("ô 1 | ô 2 | ..."), nên app cũ hiển thị như text bình thường.
//  - Đầu mỗi dòng có tiền tố VÔ HÌNH: U+2063 + U+2064×id + U+2063 để app mới biết
//    dòng đó thuộc bảng nào.
//  - Cấu trúc bảng (ô gộp rowspan/colspan, in đậm, căn lề, độ rộng cột) lưu riêng
//    ở field `tables` của document LawCollection: [{ id, w, rows }].
//    rows: [[{ t, cs?, rs?, b?, a? }]] — chỉ các ô gốc, theo thứ tự cột như HTML.
//
// Khác bản nextLawTool: không có trình duyệt (cheerio, không getComputedStyle/layout)
// nên viền / in đậm / căn lề / độ rộng cột đọc từ thuộc tính + style inline — HTML
// của luatvietnam.vn ghi đủ inline (vd "border-left: solid windowtext 1.0pt",
// "width: 7.8%", <span style="font-weight: bold">, <p style="text-align: center">).

const TABLE_MARK = "\u2063";
const TABLE_ID_MARK = "\u2064";
// không neo ^ vì content có thể là JSON.stringify (xuống dòng thành "\n")
const TABLE_PREFIX_RE = /\u2063(\u2064*)\u2063/g;

// Bỏ ký tự đánh dấu vô hình (dùng cho fullText tìm kiếm, embed RAG…): tiền tố
// bảng U+2063/U+2064 và đánh dấu phụ lục U+2062 (lib/lawAppendix.js).
function stripTableMarks(text) {
  if (typeof text !== "string") return text;
  return text.replace(/[\u2062\u2063\u2064]/g, "");
}

// Chỉ giữ các bảng còn được tham chiếu trong nội dung cuối cùng
// (phần mở đầu / chữ ký bị cắt bỏ thì bảng ở đó cũng bỏ).
function pruneTables(tables, content) {
  if (!Array.isArray(tables) || !tables.length) return [];
  const text = typeof content === "string" ? content : JSON.stringify(content);
  const used = new Set();
  for (const m of text.matchAll(TABLE_PREFIX_RE)) used.add(m[1].length);
  return tables.filter((t) => used.has(t.id));
}

// "a: b; c: d" -> { a: "b", c: "d" } (key thường hoá)
function parseStyle(el) {
  const out = {};
  const s = (el.attribs && el.attribs.style) || "";
  for (const part of s.split(";")) {
    const i = part.indexOf(":");
    if (i < 0) continue;
    out[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).trim().toLowerCase();
  }
  return out;
}

// Cạnh có viền thật? Đọc border-<side> rồi tới border (shorthand), cùng
// border-<side>-style / -width nếu có. Không ghi gì -> coi như không viền.
function hasBorder(st, side) {
  const vals = [st[`border-${side}`], st.border].filter((v) => v != null);
  let style = st[`border-${side}-style`];
  let width = st[`border-${side}-width`];
  const sh = vals[0];
  if (sh != null) {
    if (/\b(none|hidden)\b/.test(sh) && style == null) return false;
    if (style == null) {
      const m = sh.match(/\b(solid|dotted|dashed|double|groove|ridge|inset|outset)\b/);
      style = m ? m[1] : null;
    }
    if (width == null) {
      const m = sh.match(/(^|\s)(\d*\.?\d+)(pt|px|em|cm|mm|in)?\b/) || sh.match(/\b(thin|medium|thick)\b/);
      width = m ? m[0] : style ? "1px" : null;
    }
  }
  if (!style || style === "none" || style === "hidden") return false;
  if (width == null) return true;
  if (/thin|medium|thick/.test(width)) return true;
  return parseFloat(width) > 0;
}

function borderSides($td) {
  const st = parseStyle($td[0]);
  return ["top", "right", "bottom", "left"].filter((s) => hasBorder(st, s)).length;
}

// Phần tử (hoặc tổ tiên trong ô) có in đậm?
function elBold($, el, stopEl) {
  for (let cur = el; cur && cur !== stopEl.parent; cur = cur.parent) {
    if (cur.type !== "tag") continue;
    const name = cur.name;
    const fw = parseStyle(cur)["font-weight"];
    if (fw != null) {
      if (fw === "bold" || fw === "bolder" || parseInt(fw, 10) >= 600) return true;
      if (fw === "normal" || fw === "lighter" || parseInt(fw, 10) < 600) return false;
    }
    if (name === "b" || name === "strong" || name === "th") return true;
    if (cur === stopEl) break;
  }
  return false;
}

// Mọi đoạn chữ thật trong ô đều in đậm -> ô in đậm.
function isBold($, td) {
  let any = false;
  let all = true;
  const walk = (node) => {
    if (!all) return;
    if (node.type === "text") {
      if (!node.data.replace(/[\s\u00A0]/g, "")) return;
      any = true;
      if (!elBold($, node.parent, td)) all = false;
      return;
    }
    if (node.type !== "tag") return;
    if (/^(script|style)$/.test(node.name)) return;
    const cls = (node.attribs && node.attribs.class) || "";
    if (/\b(bg-theo-doi|bg_phantich)\b/.test(cls)) return;
    (node.children || []).forEach(walk);
  };
  (td.children || []).forEach(walk);
  return any && all;
}

function alignOf($, $td) {
  const p = $td.find("p").first();
  const read = (el) => {
    if (!el) return null;
    const a = parseStyle(el)["text-align"] || (el.attribs && el.attribs.align);
    return a ? a.toLowerCase() : null;
  };
  const a = read(p[0]) || read($td[0]);
  if (a === "center") return "c";
  if (a === "right" || a === "end") return "r";
  return "";
}

// Độ rộng khai báo của ô (style width hoặc thuộc tính width). Trả số (đơn vị
// tuỳ ý — chỉ dùng tỉ lệ giữa các cột trong cùng bảng) hoặc 0 nếu không có.
function declaredWidth(td) {
  const raw = parseStyle(td)["width"] || (td.attribs && td.attribs.width) || "";
  const m = String(raw).match(/(\d*\.?\d+)\s*(%|pt|px|in|cm|mm)?/);
  if (!m) return 0;
  const v = parseFloat(m[1]);
  const unit = m[2] || "px";
  // quy về px gần đúng để trộn được các đơn vị tuyệt đối
  const k = { "%": 1, px: 1, pt: 4 / 3, in: 96, cm: 37.8, mm: 3.78 }[unit] || 1;
  return v > 0 ? v * k : 0;
}

// Thay mỗi bảng có viền trong `root` (cheerio) bằng các dòng text có tiền tố, trả
// về cấu trúc các bảng. Phải chạy TRƯỚC khi đọc innerText. innerText(el) là hàm
// lấy text giống trình duyệt của scrape.js (truyền vào để khỏi require vòng).
function extractContentTables($, root, innerText) {
  const clean = (s) =>
    (s || "")
      .replace(/\u00A0/g, " ")
      .replace(/[ \t\r\f\v]+/g, " ")
      .replace(/ *\n */g, "\n")
      .replace(/\n+/g, "\n")
      .trim();

  const tables = [];

  root.find("table").each((_, table) => {
    const $table = $(table);
    // bảng lồng: để bảng ngoài xử lý (text bảng trong nằm trong ô)
    if ($table.parent().closest("table").length) return;
    // đầu văn bản, chữ ký, VB liên quan, bảng thuộc tính: giữ như cũ
    if ($table.closest(".docitem-8, .docitem-9, .docitem-14, .docitem-15, .div-table").length) return;

    // các hàng của chính bảng này (không lấy hàng của bảng lồng)
    const trs = $table
      .find("tr")
      .filter((__, tr) => $(tr).closest("table")[0] === table)
      .toArray();
    if (!trs.length) return;

    // dựng lưới theo đúng thuật toán đặt ô của HTML
    const grid = [];
    const cells = [];
    trs.forEach((tr, r) => {
      grid[r] = grid[r] || [];
      let c = 0;
      $(tr)
        .children("td, th")
        .each((__, td) => {
          while (grid[r][c]) c++;
          const cs = Math.max(1, parseInt(td.attribs.colspan, 10) || 1);
          const rs = Math.max(1, Math.min(parseInt(td.attribs.rowspan, 10) || 1, trs.length - r));
          const info = { td, r, c, cs, rs };
          cells.push(info);
          for (let i = 0; i < rs; i++) {
            grid[r + i] = grid[r + i] || [];
            for (let j = 0; j < cs; j++) grid[r + i][c + j] = info;
          }
          c += cs;
        });
    });
    if (!cells.length) return;
    const nCols = Math.max(...grid.map((row) => row.length));

    cells.forEach((ci) => {
      ci.bordered = borderSides($(ci.td)) >= 2;
    });
    // bảng không viền = bảng dàn trang (quốc hiệu, nơi nhận, công thức…) → giữ như text cũ
    if (!cells.some((ci) => ci.bordered)) return;

    // cột "ma": không ô có viền nào phủ lên (Word hay sinh cột thừa ở mép bảng)
    const keep = [];
    for (let c = 0; c < nCols; c++) {
      keep[c] = cells.some((ci) => ci.bordered && ci.c <= c && c < ci.c + ci.cs);
    }
    const newIndex = [];
    let k = 0;
    for (let c = 0; c < nCols; c++) newIndex[c] = keep[c] ? k++ : -1;
    if (!k) return;

    // độ rộng cột theo độ rộng khai báo của ô (không có layout thật)
    const widths = new Array(k).fill(0);
    cells.forEach((ci) => {
      if (ci.cs === 1 && keep[ci.c]) {
        const w = declaredWidth(ci.td);
        const nc = newIndex[ci.c];
        if (w > widths[nc]) widths[nc] = w;
      }
    });
    // cột không khai báo -> lấy trung bình các cột có khai báo
    const known = widths.filter((x) => x > 0);
    const avg = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 1;
    for (let i = 0; i < k; i++) if (!widths[i]) widths[i] = avg;
    const total = widths.reduce((a, b) => a + b, 0);
    const w = widths.map((x) => Math.max(1, Math.round((x / total) * 100)));

    const rows = trs.map(() => []);
    const lines = trs.map(() => []);
    const trailing = [];

    cells.forEach((ci) => {
      let ncs = 0;
      for (let j = 0; j < ci.cs; j++) if (keep[ci.c + j]) ncs++;
      const t = clean(innerText($, ci.td));
      if (!ncs) {
        if (t) trailing.push(t);
        return;
      }
      const cell = { t };
      if (ncs > 1) cell.cs = ncs;
      if (ci.rs > 1) cell.rs = ci.rs;
      if (t && isBold($, ci.td)) cell.b = 1;
      const a = t ? alignOf($, $(ci.td)) : "";
      if (a) cell.a = a;
      rows[ci.r].push(cell);
      if (t) lines[ci.r].push(t.replace(/\n/g, " "));
    });

    const textLines = lines.map((l) => l.join(" | ")).filter(Boolean);
    if (!textLines.length) return;

    const id = tables.length;
    const prefix = TABLE_MARK + TABLE_ID_MARK.repeat(id) + TABLE_MARK;
    const box = $("<div></div>");
    textLines.forEach((line) => box.append($("<div></div>").text(prefix + line)));
    // chữ nằm trong cột ma (vd dấu đóng ngoặc .” của đoạn trích) → dòng thường
    trailing.forEach((line) => box.append($("<div></div>").text(line)));
    $table.replaceWith(box);

    tables.push({ id, w, rows });
  });

  return tables;
}

module.exports = {
  TABLE_MARK,
  TABLE_ID_MARK,
  stripTableMarks,
  pruneTables,
  extractContentTables,
};
