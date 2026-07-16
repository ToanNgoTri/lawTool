// ─── Scrape luatvietnam.vn bằng fetch + cheerio (thay cho puppeteer) ───────────
// Đã kiểm chứng: cả trang danh sách lẫn trang chi tiết đều render sẵn HTML tĩnh,
// không cần JS/đăng nhập. Xem nextLawTool/app/api/{check,url}/route.js là bản gốc.

const cheerio = require("cheerio");
const { normalizeLawKey } = require("./normalize");

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Referer: "https://luatvietnam.vn/" },
  });
  if (!res.ok) throw new Error(`Fetch ${res.status} ${res.statusText} cho ${url}`);
  return res.text();
}

// Mô phỏng element.innerText của trình duyệt cho 1 phần tử cheerio:
//  - bỏ các span nhiễu "Đang theo dõi" (span.bg-theo-doi) và .bg_phantich
//  - chèn "\n" ở ranh giới các thẻ block (p, div, br, tr, li, h1..h6)
//  - gộp khoảng trắng / xuống dòng thừa (kể cả non-breaking space U+00A0)
function innerText($, node) {
  const $c = $(node).clone();
  $c.find(".bg-theo-doi, .bg_phantich, script, style").remove();
  $c.find("br").replaceWith("\n");
  $c.find("p, div, tr, li, h1, h2, h3, h4, h5, h6").each((_, el) => {
    $(el).append("\n");
  });
  return $c
    .text()
    .replace(/ /g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

// Text 1 ô bảng (.div-table) — không cần xuống dòng, gộp trắng.
function cellText($, node) {
  const $c = $(node).clone();
  $c.find(".bg-theo-doi, .bg_phantich, script, style").remove();
  return $c.text().replace(/ /g, " ").replace(/\s+/g, " ").trim();
}

// ─── /api/check: quét trang danh sách -> { "tên/số hiệu": href } ───────────────
// Tương đương route check gốc: lấy .doc-title a, rút số hiệu từ innerText.
function parseList(html) {
  const $ = cheerio.load(html);
  const content = {};
  $(".doc-title a").each((_, a) => {
    const text = $(a).text().replace(/\s+/g, " ").trim();
    let href = $(a).attr("href") || "";
    if (href && !/^https?:/i.test(href)) href = "https://luatvietnam.vn" + href;

    // Bỏ qua Dự thảo (chưa ký/ban hành -> không có người ký, không push được).
    if (/^dự thảo/i.test(text) || /du-thao/i.test(href)) return;

    let key = text;
    const t = text.replace(":", "");
    const m1 = t.match(/((?<= )\d*\/\D+\-[^\s,.:"';{}”)]+)(?=\b)/);
    const year = t.match(/20\d{2}/);
    const m2 = t.match(/(\d+\/\d*\/\S+\-?[^ :"';{}”)]+)(?=\b)/);
    if (m1 && year) key = `${m1[0]}(${year[0]})`;
    else if (m2) key = m2[0];
    // Chuẩn hoá homoglyph (Cyrillic -> Latin) để khớp _id lúc dedup ở /check.
    content[normalizeLawKey(key)] = href;
  });
  return content;
}

// ─── /api/url: quét trang chi tiết 1 văn bản -> các trường thô ─────────────────
// Cấu trúc tĩnh: .div-table (bảng thông tin), .the-document-body > .docitem-*
// (bản puppeteer thấy .noidungtracuu do JS đổi tên lúc runtime).
function parseDetail(html) {
  const $ = cheerio.load(html);

  // Có 2 .the-document-body: bản ".doc-summary" (tóm tắt) và thân thật.
  // Phải lấy thân thật (không phải doc-summary), nếu không sẽ trượt hết docitem.
  let body = $(".the-document-body").not(".doc-summary").first();
  if (!body.length) body = $(".the-document-body").first();

  // Nội dung: docitem-1,2,5,11,12 nhưng CẮT tại docitem-9 (khối "Nơi nhận")
  // -> mọi thứ sau docitem-9 (phụ lục) bị loại, giống :not(.docitem-9 ~ div) gốc.
  const contentClasses = ["docitem-1", "docitem-2", "docitem-5", "docitem-11", "docitem-12"];
  const parts = [];
  let reachedRoleSign = false;
  body.children().each((_, el) => {
    const cls = $(el).attr("class") || "";
    if (/\bdocitem-9\b/.test(cls)) reachedRoleSign = true;
    if (reachedRoleSign) return;
    if (contentClasses.some((c) => new RegExp(`\\b${c}\\b`).test(cls))) {
      const t = innerText($, el);
      if (t) parts.push(t);
    }
  });
  let content = parts.join("\n").replace(/\n{2,}/g, "\n").trim();

  // Fallback: không tách được docitem -> lấy cả .the-document-body
  if (!content) content = innerText($, body);

  // lawRelated = docitem-14 + docitem-15 (phần "Căn cứ...")
  let lawRelated = "";
  const d14 = body.children(".docitem-14").first();
  const d15 = body.children(".docitem-15").first();
  if (d14.length) lawRelated += innerText($, d14);
  if (d15.length) lawRelated += "\n" + innerText($, d15);
  lawRelated = lawRelated.replace(/_+/g, "").replace(/\n+/g, "\n").trim();

  // roleSign = docitem-9 ("Nơi nhận:")
  let roleSign = "";
  const d9 = body.children(".docitem-9").first();
  if (d9.length) roleSign = innerText($, d9);

  // ─── Bảng thông tin (.div-table) — chỉ số hàng khớp y hệt bản gốc ───────────
  const table = $(".div-table").first();
  const cell = (tr, td) =>
    cellText($, table.find(`tr:nth-child(${tr}) td:nth-child(${td})`).first());

  const isVBHN = /VBHN/.test(table.text());
  let lawNumber;
  let unitPublish;
  let lawKind;
  let nameSign;
  let lawDaySign;

  if (isVBHN) {
    lawNumber = cell(1, 2);
    unitPublish = cell(2, 4);
    lawKind = cell(2, 2);
    nameSign = cell(3, 4);
    lawDaySign = cell(1, 4);
  } else {
    lawNumber = cell(2, 2);
    unitPublish = cell(1, 2);
    lawKind = cell(3, 2);
    nameSign = cell(3, 4);
    lawDaySign = cell(5, 2);
  }
  lawNumber = lawNumber.replace(/(^ | $)/g, "");
  if (/^\d\//.test(lawNumber)) lawNumber = "0" + lawNumber;

  const lawDescription = cell(4, 2).replace(/Sửa đổi/, "sửa đổi");

  return {
    content,
    lawNumber,
    unitPublish,
    lawKind,
    nameSign,
    lawDaySign,
    lawDescription,
    lawRelated,
    roleSign,
  };
}

async function scrapeList(url) {
  return parseList(await fetchHtml(url));
}

async function scrapeDetail(url) {
  return parseDetail(await fetchHtml(url));
}

module.exports = { scrapeList, scrapeDetail, parseList, parseDetail, fetchHtml };
