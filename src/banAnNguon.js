/**
 * Tra cứu bản án trên congbobanan.toaan.gov.vn — chạy NGAY TRÊN ĐIỆN THOẠI.
 *
 * ⚠️ Không đưa lên Firebase Functions: máy chủ tòa án cắt kết nối (ECONNRESET) từ IP Google Cloud
 *    (Singapore), chỉ cho IP Việt Nam. Đã thử deploy 11/2026 và gỡ.
 * ⚠️ Máy chủ thiếu chứng chỉ trung gian GlobalSign -> android/app/src/{main,debug}/res/xml/
 *    network_security_config.xml tin thêm res/raw/gsrsaovsslca2018.pem cho riêng tên miền này.
 *
 * Trang là ASP.NET WebForms (postback + VIEWSTATE ~175KB + cookie phiên):
 *   GET trang -> postback cấp tòa (nếu có) -> postback loại vụ việc -> bấm Tìm -> postback trang (nếu > 1).
 * Cookie ASP.NET_SessionId do cookie jar của OkHttp (fetch RN) tự giữ; không có phiên thì postback
 * trang bị bỏ lọc và trả TOÀN BỘ ~2,2 triệu bản (100 giây). Vì dùng chung 1 phiên nên mọi lượt
 * postback chạy nối tiếp qua hàng đợi `noiTiep`.
 */
import * as cheerio from "cheerio/slim";
import { load, save } from "./session";

export const GOC = "https://congbobanan.toaan.gov.vn";
const URL_TIM = GOC + "/0t15at1cvn/Tra-cu-ban-an";
const P = "ctl00$Content_home_Public$ctl00$";
const ID = "ctl00_Content_home_Public_ctl00_";

// Tên trường của form tìm kiếm (cột bên trái của trang).
const TRUONG = {
  loai: "Drop_CASES_STYLES_SEARCH", // loại vụ việc: 50 = Hình sự
  toiDanh: "Ra_Case_shows_search", // tội danh / quan hệ pháp luật (phụ thuộc loại)
  tuKhoa: "txtKeyword",
  capToa: "Drop_Levels", // TW, CW, T, H
  toaAn: "Ra_Drop_Courts", // phụ thuộc cấp tòa
  capXetXu: "Drop_LEVEL_JUDGMENT_SEARCH",
  loaiVanBan: "Drop_STATUS_JUDGMENT_SEARCH", // 0 bản án, 1 quyết định
  tuNgay: "Rad_DATE_FROM",
  denNgay: "Rad_DATE_TO",
  anLe: "check_anle",
};

const sach = (s) => (s || "").replace(/\s+/g, " ").trim();

function loiMang(e) {
  const m = String(e?.message || e);
  if (/abort|timeout/i.test(m)) return new Error("Trang công bố bản án phản hồi quá lâu, thử lại sau");
  if (/ssl|certificate|trust anchor|handshake/i.test(m))
    return new Error("Lỗi chứng chỉ SSL trang tòa án — cần build lại app (network_security_config)");
  return new Error("Không kết nối được trang công bố bản án: " + m);
}

async function taiHtml(url, form) {
  const ctrl = new AbortController();
  const hen = setTimeout(() => ctrl.abort(), 60000);
  let r;
  try {
    r = await fetch(url, {
      method: form ? "POST" : "GET",
      signal: ctrl.signal,
      credentials: "include",
      headers: {
        "Accept-Language": "vi-VN,vi;q=0.9",
        ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      },
      body: form ? maHoaForm(form) : undefined,
    });
    if (r.status >= 400) throw new Error("Trang công bố bản án trả lỗi HTTP " + r.status);
    return await r.text();
  } catch (e) {
    throw e.message?.startsWith("Trang công bố") ? e : loiMang(e);
  } finally {
    clearTimeout(hen);
  }
}

// URLSearchParams của RN không có toString() đầy đủ -> tự mã hoá.
function maHoaForm(f) {
  return Object.entries(f)
    .map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v ?? "").replace(/%20/g, "+"))
    .join("&");
}

// Hàng đợi: mọi thao tác trên phiên chạy lần lượt.
let hang = Promise.resolve();
function noiTiep(fn) {
  const p = hang.then(fn, fn);
  hang = p.catch(() => {});
  return p;
}

class Phien {
  constructor() {
    this.$ = null;
    this.chon = {}; // giá trị đang chọn, gửi kèm mọi postback để trang không reset
  }

  async gui(form) {
    this.$ = cheerio.load(await taiHtml(URL_TIM, form));
    if (!this.$("#aspnetForm").length) throw new Error("Trang công bố bản án trả về nội dung lạ, có thể đang bảo trì");
    return this.$;
  }

  form(them = {}) {
    const $ = this.$;
    const f = {};
    $("#aspnetForm input[type=hidden]").each((i, e) => {
      f[$(e).attr("name")] = $(e).attr("value") || "";
    });
    f.__EVENTTARGET = "";
    f.__EVENTARGUMENT = "";
    for (const [k, v] of Object.entries(this.chon)) if (v !== undefined && v !== "") f[P + TRUONG[k]] = v;
    return Object.assign(f, them);
  }

  mo() {
    return this.gui();
  }

  doi(k, v) {
    this.chon[k] = v;
    return this.gui(this.form({ __EVENTTARGET: P + TRUONG[k] }));
  }

  luaChon(k) {
    const $ = this.$;
    return $("#" + ID + TRUONG[k] + " option")
      .map((i, e) => ({ id: $(e).attr("value") || "", ten: sach($(e).text()) }))
      .get()
      .filter((o) => o.id !== "");
  }
}

// "173.Tội trộm cắp tài sản (Bộ luật hình sự năm 2015)" -> {dieu, ten, boLuat}
function tachToiDanh(o) {
  const m = o.ten.match(/^(\d+[a-zđ]?)\s*\.\s*(.*?)\s*(?:\(([^()]*(?:\([^()]*\)[^()]*)*)\))?\s*$/i);
  if (!m) return { id: o.id, dieu: "", ten: o.ten, boLuat: "" };
  return { id: o.id, dieu: m[1], ten: m[2], boLuat: m[3] || "" };
}

// Danh mục (loại vụ việc, tội danh, tòa án) ít đổi -> nhớ trong RAM + MMKV 3 ngày.
const boNho = new Map();
const HAN_DANH_MUC = 3 * 24 * 3600 * 1000;
async function nho(khoa, lam) {
  const c = boNho.get(khoa) || load("banAnDM:" + khoa);
  if (c && c.het > Date.now()) return c.gt;
  const gt = await lam();
  const muc = { gt, het: Date.now() + HAN_DANH_MUC };
  boNho.set(khoa, muc);
  save("banAnDM:" + khoa, muc);
  return gt;
}

export function banAnDanhMuc() {
  return nho("danhMuc", () =>
    noiTiep(async () => {
      const p = new Phien();
      await p.mo();
      return { loai: p.luaChon("loai"), capToa: p.luaChon("capToa"), loaiVanBan: p.luaChon("loaiVanBan") };
    }),
  );
}

// Tội danh (Hình sự) hoặc quan hệ pháp luật của một loại vụ việc: [{id, dieu, ten, boLuat}]
export function banAnToiDanh(loai = "50") {
  return nho("toiDanh:" + loai, () =>
    noiTiep(async () => {
      const p = new Phien();
      await p.mo();
      await p.doi("loai", String(loai));
      return p.luaChon("toiDanh").map(tachToiDanh);
    }),
  );
}

// Tòa án theo cấp + cấp xét xử tương ứng.
export function banAnToaAn(capToa) {
  return nho("toaAn:" + capToa, () =>
    noiTiep(async () => {
      const p = new Phien();
      await p.mo();
      await p.doi("capToa", capToa);
      return { toaAn: p.luaChon("toaAn"), capXetXu: p.luaChon("capXetXu") };
    }),
  );
}

// Cặp <label>Nhãn:</label><span>giá trị</span> trong một khối.
function nhanTruong($, goc) {
  const kq = {};
  goc.find("label").each((i, e) => {
    const k = sach($(e).text()).replace(/:$/, "");
    const span = $(e).nextAll("span").first();
    if (k && span.length) kq[k] = sach(span.text());
  });
  return kq;
}

const boTime = (el) => sach(el.clone().find("time").remove().end().text());
const ngayCB = (el) => sach(el.find("time").text()).replace(/[()]/g, "").replace(/\./g, "/");

function docKetQua($) {
  return $("#List_group_pub .list-group-item")
    .map((i, e) => {
      const it = $(e);
      const a = it.find("a.echo_id_pub").first();
      const m0 = (a.attr("href") || "").match(/\/2ta(\d+)t1cvn/);
      if (!m0) return null;
      const h4 = a.find("h4");
      const span = h4.find("span").first();
      const tieuDe = boTime(span);
      const m = tieuDe.match(/^số\s*(.*?)\s+ngày\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+của\s+(.*)$/i);
      const tr = nhanTruong($, it);
      const dem = it
        .find(".list_count_pub li")
        .map((j, li) => sach($(li).text()))
        .get();
      return {
        id: m0[1],
        loaiVanBan: sach(h4.find("label").first().text()).replace(/:$/, ""),
        so: m ? m[1] : "",
        ngay: m ? m[2] : "",
        toaAn: sach((m ? m[3] : tieuDe).replace(/\s+,/g, ",")),
        ngayCongBo: ngayCB(span),
        ten: sach(it.find("p span").first().text()),
        capXetXu: tr["Cấp xét xử"] || "",
        loaiAn: tr["Loại án"] || "",
        apDungAnLe: tr["Áp dụng án lệ"] || "",
        thongTin: tr["Thông tin về vụ án"] || "",
        luotXem: Number(dem[0]) || 0,
        luotTai: Number(dem[1]) || 0,
      };
    })
    .get()
    .filter(Boolean);
}

/**
 * q: { loai, toiDanh, tuKhoa, capToa, toaAn, capXetXu, loaiVanBan, tuNgay, denNgay (dd/MM/yyyy), anLe, trang }
 * -> { tong, soTrang, trang, ketQua }
 */
export function banAnTim(q = {}) {
  const chon = {};
  for (const k of Object.keys(TRUONG)) {
    const v = q[k];
    if (v === undefined || v === null || v === "" || v === false) continue;
    chon[k] = k === "anLe" ? "on" : String(v);
  }
  if (chon.toiDanh && !chon.loai) chon.loai = "50";
  const trang = Math.max(1, parseInt(q.trang, 10) || 1);

  return noiTiep(async () => {
    const p = new Phien();
    await p.mo();
    // Ô phụ thuộc: cấp tòa -> danh sách tòa; loại vụ việc -> danh sách tội danh.
    if (chon.capToa) await p.doi("capToa", chon.capToa);
    if (chon.loai) await p.doi("loai", chon.loai);
    Object.assign(p.chon, chon);
    let $ = await p.gui(p.form({ [P + "cmd_Left_search"]: "Tìm kiếm" }));
    const tong = Number(sach($("#" + ID + "lbl_count_record_top").text()).replace(/\D/g, "")) || 0;
    const soTrang = tong ? $("#" + ID + "DropPages option").length || 1 : 0;
    if (trang > soTrang) return { tong, soTrang, trang, ketQua: [] };
    if (trang > 1) $ = await p.gui(p.form({ __EVENTTARGET: P + "DropPages", [P + "DropPages"]: String(trang) }));
    return { tong, soTrang, trang, ketQua: docKetQua($) };
  });
}

// href tương đối -> tuyệt đối, mã hoá ký tự tiếng Việt (URL của RN không ghép base đầy đủ).
function tuyetDoi(href) {
  if (!href) return "";
  const u = /^https?:/i.test(href) ? href : GOC + (href.startsWith("/") ? "" : "/") + href;
  try {
    return encodeURI(decodeURI(u));
  } catch {
    return encodeURI(u);
  }
}

// Chi tiết 1 bản án (trang /2ta{id}t1cvn/chi-tiet-ban-an, không cần phiên).
export async function banAnChiTiet(id) {
  const url = `${GOC}/2ta${id}t1cvn/chi-tiet-ban-an`;
  const $ = cheerio.load(await taiHtml(url));
  const head = $(".panel-heading")
    .filter((i, e) => /(Bản án|Quyết định)\s*số/i.test($(e).text()))
    .first();
  if (!head.length) throw new Error("Không tìm thấy bản án " + id);
  const khoi = head.parent();
  const [so, ngayTxt] = (head.find("span").first().html() || "")
    .split(/<br\s*\/?>/i)
    .map((s) => sach(cheerio.load(s).text()));
  const tr = nhanTruong($, khoi);
  const tenSpan = khoi
    .find("label")
    .filter((i, e) => /^Tên (bản án|quyết định)/i.test(sach($(e).text())))
    .first()
    .nextAll("span")
    .first();
  const pdfA = $("a[href*='.pdf']").first();
  return {
    id: String(id),
    loaiVanBan: sach(head.find("label").first().text()).replace(/\s*số:?$/i, ""),
    so: so || "",
    ngay: (ngayTxt || "").replace(/^ngày\s*/i, ""),
    ten: boTime(tenSpan),
    ngayCongBo: ngayCB(tenSpan),
    capXetXu: tr["Cấp xét xử"] || "",
    loaiAn: tr["Loại án"] || "",
    toaAn: (tr["Tòa án xét xử"] || "").replace(/\s+,/g, ","),
    apDungAnLe: tr["Áp dụng án lệ"] || "",
    dinhChinh: tr["Đính chính"] || "",
    thongTin: tr["Thông tin về vụ án"] || "",
    tenFilePdf: sach(pdfA.text()),
    // PDF mở bằng trình duyệt (Chrome tự bù chứng chỉ trung gian qua AIA)
    pdfGoc: tuyetDoi(pdfA.attr("href")),
    url,
  };
}
