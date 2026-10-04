// Bảng trong nội dung văn bản (do functions/lib/lawTables.js tạo ra — cùng format
// với nextLawTool lib/lawTables.js và lawMachine utils/lawTables.js).
//
// Trong chuỗi nội dung, mỗi hàng của bảng là 1 dòng text "ô 1 | ô 2 | ..." có
// tiền tố VÔ HÌNH: U+2063 + U+2064×id + U+2063. App cũ chỉ thấy dòng text thường;
// app mới gom các dòng liền nhau cùng id thành 1 bảng và vẽ theo cấu trúc trong
// field `tables` của document ([{ id, w, rows }]).

const LINE_PREFIX_RE = /^\u2063(\u2064*)\u2063/;

export function stripTableMarks(text) {
  return typeof text === "string" ? text.replace(/[\u2062\u2063\u2064]/g, "") : text;
}

export function hasTableMarks(text) {
  return typeof text === "string" && text.indexOf("\u2063") !== -1;
}

// mảng tables của document -> { id: table }
export function indexTables(tables) {
  const map = {};
  if (Array.isArray(tables)) {
    tables.forEach(t => {
      if (t && typeof t.id === "number" && Array.isArray(t.rows)) map[t.id] = t;
    });
  }
  return map;
}

// Tách chuỗi thành các đoạn: { type: "text", text } | { type: "table", id, lines }
export function splitTableSegments(text) {
  const segments = [];
  const lines = String(text).split("\n");
  let textBuf = [];
  let table = null;

  const flushText = () => {
    if (textBuf.length) segments.push({ type: "text", text: textBuf.join("\n") });
    textBuf = [];
  };

  for (const line of lines) {
    const m = line.match(LINE_PREFIX_RE);
    if (m) {
      const id = m[1].length;
      const rest = line.slice(m[0].length);
      if (table && table.id === id) {
        table.lines.push(rest);
      } else {
        flushText();
        table = { type: "table", id, lines: [rest] };
        segments.push(table);
      }
    } else {
      table = null;
      textBuf.push(line);
    }
  }
  flushText();
  return segments;
}

// Dựng lưới từ rows (chỉ chứa ô gốc) theo thuật toán đặt ô của HTML.
// Trả về { nCols, grid } với grid[r][c] = { cell, r0, c0, isOrigin, isLastRow }
export function buildTableGrid(rows) {
  const grid = rows.map(() => []);
  rows.forEach((row, r) => {
    let c = 0;
    (row || []).forEach(cell => {
      while (grid[r][c]) c++;
      const cs = Math.max(1, cell.cs || 1);
      const rs = Math.max(1, Math.min(cell.rs || 1, rows.length - r));
      for (let i = 0; i < rs; i++) {
        for (let j = 0; j < cs; j++) {
          grid[r + i][c + j] = {
            cell,
            r0: r,
            c0: c,
            cs,
            rs,
            isOrigin: i === 0 && j === 0,
            isLastRow: i === rs - 1,
            isFirstCol: j === 0,
          };
        }
      }
      c += cs;
    });
  });
  const nCols = Math.max(0, ...grid.map(row => row.length));
  return { nCols, grid };
}

// ─── Đồng bộ bảng với nội dung ĐÃ SỬA ở màn sửa trường ───────────────────────
// Bảng được vẽ từ `tables` (cấu trúc lúc scrape), KHÔNG từ dòng text -> sửa chữ
// trong dòng bảng (content / phụ lục) mà không đồng bộ thì Detail5 vẫn hiện bản cũ.
// baseTexts: các chuỗi ứng với `tables` hiện tại (lần xử lý trước);
// editedTexts: các chuỗi sau khi sửa (cùng thứ tự). Trả về mảng tables mới.
//  - Dòng không đổi -> giữ nguyên ô (cả ô gộp, in đậm, căn lề).
//  - Dòng đổi, cùng số dòng & số ô -> chỉ thay chữ ô bị sửa.
//  - Thêm/bớt dòng hoặc ô -> dựng lại bảng dạng lưới đơn giản theo text đã sửa.
const ROW_SEP = " | ";

function linesById(texts) {
  const map = {};
  for (const text of texts) {
    if (!hasTableMarks(text)) continue;
    for (const line of String(text).split("\n")) {
      const m = line.match(LINE_PREFIX_RE);
      if (m) (map[m[1].length] = map[m[1].length] || []).push(line.slice(m[0].length));
    }
  }
  return map;
}

function sameLines(a, b) {
  return a.length === b.length && a.every((l, i) => l === b[i]);
}

function rebuildTable(table, lines) {
  const cellsOf = lines.map(l => l.split(ROW_SEP));
  const nCols = Math.max(1, ...cellsOf.map(c => c.length));
  const rows = cellsOf.map(cells => {
    const row = cells.map(t => ({ t: t.trim() }));
    // dòng thiếu ô -> ô cuối kéo dài hết bảng cho khỏi lệch lưới
    if (row.length < nCols) row[row.length - 1].cs = nCols - row.length + 1;
    return row;
  });
  const w = Array.isArray(table.w) && table.w.length === nCols ? table.w : new Array(nCols).fill(Math.round(100 / nCols));
  return { id: table.id, w, rows };
}

function patchTable(table, baseLines, editedLines) {
  // chỉ hàng có chữ mới sinh ra dòng text (xem functions/lib/lawTables.js)
  const textRows = [];
  table.rows.forEach((row, r) => {
    if ((row || []).some(cell => cell && cell.t)) textRows.push(r);
  });
  if (textRows.length !== baseLines.length || editedLines.length !== baseLines.length) return null;

  const rows = table.rows.map(row => (row || []).map(cell => ({ ...cell })));
  for (let k = 0; k < editedLines.length; k++) {
    if (editedLines[k] === baseLines[k]) continue;
    const cells = rows[textRows[k]].filter(cell => cell.t);
    const baseParts = baseLines[k].split(ROW_SEP);
    const parts = editedLines[k].split(ROW_SEP);
    if (parts.length !== cells.length || baseParts.length !== cells.length) return null;
    cells.forEach((cell, j) => {
      // ô không sửa giữ nguyên chữ gốc (có xuống dòng, "(1)"... đã bị convert bỏ khỏi dòng)
      if (parts[j] !== baseParts[j]) cell.t = parts[j].trim();
    });
  }
  return { ...table, rows };
}

export function syncEditedTables(tables, baseTexts, editedTexts) {
  if (!Array.isArray(tables) || !tables.length) return tables;
  const base = linesById(baseTexts);
  const edited = linesById(editedTexts);
  return tables.map(table => {
    if (!table || !Array.isArray(table.rows)) return table;
    const b = base[table.id] || [];
    const e = edited[table.id] || [];
    if (sameLines(b, e) || !e.length) return table; // không sửa / bảng bị xoá (pruneTables lo)
    return patchTable(table, b, e) || rebuildTable(table, e);
  });
}
