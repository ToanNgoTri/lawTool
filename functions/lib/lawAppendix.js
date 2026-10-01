// ─── Phụ lục / văn bản kèm theo (port nextLawTool app/lib/lawAppendix.js) ─────
//
// Lấy PHỤ LỤC / VĂN BẢN BAN HÀNH KÈM THEO (quy chế, quy định, danh mục…) nằm SAU
// khối chữ ký "Nơi nhận" (docitem-9) — KHÔNG lấy biểu mẫu ("Mẫu số …").
//
// Cách lưu (khớp lawMachine + lawRNTool):
//  - Mỗi phụ lục là 1 mục cấp cao NỐI VÀO CUỐI `content`:
//      { "\u2062" + tên phụ lục: <cùng dạng content: Chương/Điều…> }
//    hoặc khi không có Điều: { "\u2062" + tên: [{ " ": "nội dung" }] }
//  - Ký tự đầu khóa U+2062 (vô hình) để app mới nhận ra phụ lục; app cũ hiện tên
//    bình thường (như 1 Điều).
//  - Bảng trong phụ lục dùng chung cơ chế lib/lawTables.js.
//
// Luồng (cheerio, xem scrape.js parseDetail):
//  1. planAppendixBlocks  -> chia khối sau docitem-9 thành phụ lục, XOÁ biểu mẫu khỏi DOM
//     (phải TRƯỚC extractContentTables để bảng của biểu mẫu không bị lấy)
//  2. readAppendix        -> [{ title, text }] (sau khi đã thay bảng)

const APPENDIX_MARK = "\u2062";

function isAppendixKey(key) {
  return typeof key === "string" && key.startsWith(APPENDIX_MARK);
}

// không dùng \b: \b chỉ hiểu chữ ASCII, sau "ố"/"ụ" không có ranh giới từ
const FORM_HEAD_RE = /^m[ẫa]u\s*s[ốo](?=[\s.:]|$)/iu; // "Mẫu số 01", "MẪU SỐ 01"
const SECTION_HEAD_RE = /^ph[ụu]\s*l[ụu]c(?=[\s.:]|$)/iu; // "Phụ lục", "PHỤ LỤC II"
// đề mục BÊN TRONG phụ lục (không mở phụ lục mới): "Phần I", "Chương II", "Mục 1"
const INNER_HEAD_RE = /^(phần|chương|mục)\s+(thứ\s+\S+|[IVXLC]+|\d+)(?=[\s.:]|$)/iu;
// phụ lục chỉ gồm biểu mẫu (vd "CÁC MẪU VĂN BẢN…", "DANH MỤC BIỂU MẪU…")
const FORM_SECTION_TITLE_RE = /(biểu mẫu|các mẫu|mẫu văn bản)/iu;
// dòng rác / quốc hiệu, tiêu ngữ (chỉ lấy NỘI DUNG phụ lục)
const NOISE_LINE_RE =
  /^(tải biểu mẫu|đang theo dõi|_+|-+|cộng hòa xã hội chủ nghĩa việt nam|độc lập\s*[-–—]\s*tự do\s*[-–—]\s*hạnh phúc)$/iu;
const NATIONAL_TITLE_RE = /cộng hòa xã hội chủ nghĩa việt nam/iu;

function cleanLines(text) {
  return String(text || "")
    .replace(/ /g, " ")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter((l) => l && !NOISE_LINE_RE.test(l));
}

// Tách tên phụ lục ở đầu khối tiêu đề. Tên gồm các dòng tới hết cụm
// "(Ban hành) kèm theo …)"; không có cụm đó thì lấy dòng đầu (+ dòng 2 nếu dòng
// đầu chỉ là "Phụ lục I").
function splitAppendixTitle(text) {
  const lines = cleanLines(text);
  if (!lines.length) return { title: "", rest: [] };
  let end = -1;
  const k = lines.slice(0, 6).findIndex((l) => /^\(.*kèm theo/i.test(l));
  if (k !== -1) {
    end = k;
    for (let j = k; j < Math.min(lines.length, k + 4); j++) {
      end = j;
      if (/\)\s*$/.test(lines[j])) break;
    }
  } else if (/^ph[ụu]\s*l[ụu]c\s*[IVXLC\d]*\.?\s*$/i.test(lines[0]) && lines[1]) {
    end = 1;
  } else {
    end = 0;
  }
  return {
    title: lines.slice(0, end + 1).join(" "),
    rest: lines.slice(end + 1),
  };
}

// blocks: [{ idx, cls, text, hasTable }] — các khối sau docitem-9, theo thứ tự.
// Trả về { sections: [{ blocks: [idx…], titled }], remove: [idx…] }.
//  - Mở phụ lục mới: "Phụ lục …", docitem-13 (tên văn bản kèm theo, vd "ĐỊNH MỨC
//    CHI PHÍ … (Ban hành kèm theo …)"), docitem-1 không phải "Phần/Chương/Mục".
//  - "Phần I", "Chương II"… là đề mục BÊN TRONG phụ lục đang mở.
//  - Bỏ: quốc hiệu (docitem-8 / khối chỉ có "CỘNG HÒA XÃ HỘI…"), biểu mẫu.
function planAppendix(blocks) {
  const sections = [];
  const remove = [];
  let cur = null;
  let inForm = false;

  for (const b of blocks || []) {
    const cls = b.cls || "";
    if (/\bdocitem-(8|9)\b/.test(cls)) continue; // quốc hiệu / nơi nhận
    const lines = cleanLines(b.text);
    if (!lines.length) continue;
    // khối chỉ là đầu văn bản (cơ quan + quốc hiệu) không nằm trong docitem-8
    if (NATIONAL_TITLE_RE.test(b.text) && lines.join(" ").length < 400) {
      remove.push(b.idx);
      continue;
    }
    const head = lines[0];

    if (FORM_HEAD_RE.test(head)) {
      // biểu mẫu: bỏ khối này + các khối sau nó cho tới tiêu đề kế tiếp
      inForm = true;
      if (cur) cur.forms++;
      remove.push(b.idx);
      continue;
    }

    const isInner = INNER_HEAD_RE.test(head);
    const isHead =
      SECTION_HEAD_RE.test(head) ||
      /\bdocitem-13\b/.test(cls) ||
      (/\bdocitem-1\b/.test(cls) && !isInner);
    if (isHead) {
      inForm = false;
      const { title, rest } = splitAppendixTitle(b.text);
      cur = {
        title,
        titled: true,
        blocks: [b.idx],
        forms: 0,
        body: 0,
        // khối tiêu đề tự mang nội dung (vd bảng danh mục nằm chung khối)
        headHasBody: !!b.hasTable || rest.join(" ").length > 200,
      };
      sections.push(cur);
      continue;
    }

    if (inForm && !isInner) {
      remove.push(b.idx);
      continue;
    }
    inForm = false;
    if (!cur) {
      // nội dung sau chữ ký mà không có tên phụ lục (vd bắt đầu luôn bằng "Phần I")
      cur = { title: "", titled: false, blocks: [], forms: 0, body: 0, headHasBody: false };
      sections.push(cur);
    }
    cur.blocks.push(b.idx);
    cur.body++;
  }

  const kept = [];
  for (const s of sections) {
    const onlyForms =
      FORM_SECTION_TITLE_RE.test(s.title) ||
      (s.forms > 0 && s.body === 0 && !s.headHasBody) ||
      (s.body === 0 && !s.headHasBody);
    if (onlyForms) remove.push(...s.blocks);
    else kept.push({ blocks: s.blocks, titled: s.titled });
  }
  return { sections: kept, remove };
}

// texts: [[text khối 1, text khối 2…], …] theo plan.sections (đọc SAU khi thay bảng)
function buildAppendixSections(texts, sections) {
  const out = [];
  (texts || []).forEach((blockTexts, k) => {
    if (!blockTexts || !blockTexts.length) return;
    const titled = !sections || !sections[k] || sections[k].titled !== false;
    const { title, rest } = titled
      ? splitAppendixTitle(blockTexts[0])
      : { title: "", rest: cleanLines(blockTexts[0]) };
    const body = [...rest, ...blockTexts.slice(1).flatMap((t) => cleanLines(t))].join("\n");
    if (!body.trim()) return;
    out.push({ title: title || "Phụ lục", text: body });
  });
  return out;
}

// ─── Text phụ lục -> cấu trúc content ─────────────────────────────────────────
// Không dùng convertContent: nó chỉ hiểu văn bản BẮT ĐẦU bằng Chương/Phần/Điều và
// đòi mỗi Phần/Chương phải có Điều (Phần chỉ có mục "1.", "1.1." -> lỗi
// RemoveNoOrder). Ở đây tách theo đề mục Phần > Chương > Mục, Điều thành mục lá,
// đoạn chữ còn lại thành mục lá " ".
//   [{ "Phần I: TÊN": [ { " ": "…" }, { "Chương I: TÊN": [ { "Điều 1: …": "…" } ] } ] }]
const HEADINGS = [
  { level: 1, label: "Phần", re: /^phần\s+(thứ\s+\S+|[IVXLC]+|\d+)(?=[\s.:]|$)[.:]?\s*(.*)$/iu },
  { level: 2, label: "Chương", re: /^chương\s+([IVXLC]+|\d+)(?=[\s.:]|$)[.:]?\s*(.*)$/iu },
  { level: 3, label: "Mục", re: /^mục\s+([IVXLC]+|\d+)(?=[\s.:]|$)[.:]?\s*(.*)$/iu },
];
const ARTICLE_RE = /^(Điều|Ðiều)\s+(\d+[a-zđ]*)(?=[\s.:]|$)[.:]?\s*(.*)$/iu;
const TABLE_LINE_RE = /^[\u2063\u2064]/;

function matchHeading(line) {
  if (line.length > 250 || TABLE_LINE_RE.test(line)) return null;
  for (const h of HEADINGS) {
    const m = line.match(h.re);
    if (m) return { level: h.level, label: h.label, num: m[1], name: m[2] };
  }
  return null;
}

// dòng tên đề mục viết HOA nằm ở dòng sau ("Phần I" / "ĐỊNH MỨC CHI PHÍ …")
function isUpperTitleLine(line) {
  return (
    line.length <= 200 &&
    !TABLE_LINE_RE.test(line) &&
    !/^\d/.test(line) &&
    /\p{Lu}/u.test(line) &&
    line === line.toLocaleUpperCase("vi")
  );
}

function parseAppendixBody(text) {
  const lines = String(text || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const root = { children: [] };
  const stack = [{ level: 0, node: root }];
  let buf = [];
  let article = null;
  const cur = () => stack[stack.length - 1].node;
  const flushText = () => {
    if (buf.length) cur().children.push({ " ": buf.join("\n") });
    buf = [];
  };
  const flushArticle = () => {
    if (article) cur().children.push({ [article.title]: article.lines.join("\n") });
    article = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const h = matchHeading(line);
    if (h) {
      flushArticle();
      flushText();
      // tên đề mục + các dòng viết HOA ngay sau (tên dài bị xuống dòng; tối đa 3 dòng)
      const parts = h.name.trim() ? [h.name.trim()] : [];
      while (
        parts.length < 3 &&
        i + 1 < lines.length &&
        !matchHeading(lines[i + 1]) &&
        !ARTICLE_RE.test(lines[i + 1]) &&
        isUpperTitleLine(lines[i + 1])
      ) {
        parts.push(lines[++i]);
      }
      const name = parts.join(" ");
      const key = `${h.label} ${h.num}${name ? `: ${name}` : ""}`;
      while (stack.length > 1 && stack[stack.length - 1].level >= h.level) stack.pop();
      const node = { children: [] };
      cur().children.push({ [key]: node.children });
      stack.push({ level: h.level, node });
      continue;
    }
    const a = line.match(ARTICLE_RE);
    if (a) {
      flushArticle();
      flushText();
      article = { title: `Điều ${a[2]}${a[3] ? `: ${a[3]}` : ""}`, lines: [] };
      continue;
    }
    if (article) article.lines.push(line);
    else buf.push(line);
  }
  flushArticle();
  flushText();
  return root.children;
}

// ─── cheerio ───────────────────────────────────────────────────────────────────

// Chia các khối sau docitem-9 (con trực tiếp của body) thành phụ lục và XOÁ khối
// biểu mẫu / quốc hiệu khỏi DOM. Trả về [{ els: [phần tử…], titled }] cho readAppendix.
// innerText($, el): hàm lấy text giống trình duyệt của scrape.js.
function planAppendixBlocks($, body, innerText) {
  const children = body.children().toArray();
  const start = children.findIndex((el) => /\bdocitem-9\b/.test($(el).attr("class") || ""));
  if (start === -1) return [];
  const after = children.slice(start + 1);
  const blocks = after.map((el, idx) => ({
    idx,
    cls: $(el).attr("class") || "",
    text: innerText($, el).slice(0, 1500),
    hasTable: $(el).find("table").length > 0,
  }));
  const plan = planAppendix(blocks);
  plan.remove.forEach((i) => $(after[i]).remove());
  return plan.sections.map((s) => ({ els: s.blocks.map((i) => after[i]), titled: s.titled }));
}

// Đọc text từng phụ lục (gọi SAU extractContentTables) -> [{ title, text }]
function readAppendix($, sections, innerText) {
  const list = sections || [];
  const texts = list.map((s) =>
    s.els.map((el) => {
      $(el).find(".div-taibieumau, .document-tip").remove();
      // bảng dàn trang đầu văn bản (cơ quan + quốc hiệu): chỉ lấy NỘI DUNG
      $(el)
        .find("table")
        .each((_, t) => {
          if (/CỘNG HÒA XÃ HỘI CHỦ NGHĨA/i.test($(t).text())) $(t).remove();
        });
      return innerText($, el);
    }),
  );
  return buildAppendixSections(texts, list);
}

module.exports = {
  APPENDIX_MARK,
  isAppendixKey,
  splitAppendixTitle,
  planAppendix,
  buildAppendixSections,
  parseAppendixBody,
  planAppendixBlocks,
  readAppendix,
};
