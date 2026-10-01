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
