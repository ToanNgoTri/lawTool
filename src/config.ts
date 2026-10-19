// Base URL của Cloud Functions (region asia-southeast1, project lawtool-f8b15).
//
// ⚠️ Vì embedText đang trỏ Ollama LOCAL (http://localhost:11434), phải TEST QUA
//    EMULATOR chạy trên chính máy có Ollama (bản deploy trên cloud KHÔNG gọi được
//    localhost). Chạy emulator: `cd functions && npm run serve`.
//
// MÁY THẬT (điện thoại) — 2 cách:
//   [A] USB + adb reverse (khuyên dùng): chạy `adb reverse tcp:5001 tcp:5001`
//       rồi dùng localhost -> gọn, không cần mở firewall.
//   [B] WiFi cùng mạng: dùng IP LAN của PC (192.168.80.11) + firewall mở port 5001.
//
//   - [A] USB adb reverse:     http://localhost:5001/lawtool-f8b15/asia-southeast1
//   - [B] WiFi (IP PC):        http://192.168.80.11:5001/lawtool-f8b15/asia-southeast1
//   - Đã deploy (Ollama remote): https://asia-southeast1-lawtool-f8b15.cloudfunctions.net
export const FUNCTIONS_BASE_URL =
  "https://asia-southeast1-lawtool-f8b15.cloudfunctions.net";
// export const FUNCTIONS_BASE_URL =
//   "http://192.168.80.11:5001/lawtool-f8b15/asia-southeast1";

// Các URL preset (bê nguyên từ nextLawTool/app/check/page.js).
// ⚠️ Không thêm lại `OrganIds=0` / `FieldIds=0` / `SignerIds=0`: từ bản
//    luatvietnam.vn 09/2026, `=0` bị coi là id thật thay vì "tất cả" nên trang
//    trả về "Có 0 văn bản". scrape.js cũng tự lọc bỏ (xem sanitizeListUrl).
// ⚠️ Lọc nhiều loại văn bản phải gộp bằng dấu phẩy (`DocTypeIds=58,10`, đã
//    encode thành %2C): nếu lặp tham số (`DocTypeIds=58&DocTypeIds=10`) trang
//    chỉ đọc giá trị đầu tiên -> "Luật" chỉ ra Bộ luật và rỗng sau khi lọc Dự thảo.
export const CHECK_BUTTONS: { label: string; key: string }[] = [
  { label: "Check URL nhập tay", key: "manual" },
  { label: "Nghị Định", key: "nghidinh" },
  { label: "Thông Tư", key: "thongtu" },
  { label: "Văn bản hợp nhất", key: "vanbanhopnhat" },
  { label: "Nghị quyết", key: "nghiquyet" },
  { label: "Luật", key: "luat" },
  { label: "VKSND", key: "vksnd" },
  { label: "TANDTC", key: "tandtc" },
  { label: "Pháp lệnh", key: "phaplenh" },
  { label: "BCA", key: "bca" },
];

export const URL_MAP: Record<string, string> = {
  nghidinh:
    "https://luatvietnam.vn/van-ban/tim-van-ban.html?keywords=&SearchOptions=1&SearchByDate=issueDate&DateFromString=01%2F01%2F2025&DateToString=&search=ngh%E1%BB%8B&search=&search=&DocTypeIds=11&LanguageId=0&PageSize=100&PageIndex=1",
  thongtu:
    "https://luatvietnam.vn/van-ban/tim-van-ban.html?keywords=&SearchOptions=1&SearchByDate=issueDate&DateFromString=01%2F01%2F2025&DateToString=&search=&search=&search=&DocTypeIds=21%2C22&LanguageId=0&PageSize=100&PageIndex=1",
  vanbanhopnhat:
    "https://luatvietnam.vn/van-ban/tim-van-ban.html?keywords=&SearchOptions=1&SearchByDate=issueDate&DateFromString=01%2F01%2F2025&DateToString=&search=v%C4%83&search=v%C4%83n+ph%C3%B2ng+q&search=&DocTypeIds=59&OrganIds=325&LanguageId=0&PageSize=100&PageIndex=1",
  nghiquyet:
    "https://luatvietnam.vn/van-ban/tim-van-ban.html?keywords=&SearchOptions=1&SearchByDate=issueDate&DateFromString=01%2F01%2F2025&DateToString=&search=&DocTypeIds=13&search=h%E1%BB%99i+%C4%91%E1%BB%93ng+th%E1%BA%A9m+p&OrganIds=141&search=&LanguageId=0&PageSize=100&PageIndex=1",
  luat:
    "https://luatvietnam.vn/van-ban/tim-van-ban.html?keywords=&SearchOptions=1&SearchByDate=issueDate&DateFromString=01%2F01%2F2025&DateToString=&search=lu%E1%BA%ADt&search=&search=&DocTypeIds=58%2C10&LanguageId=0&PageSize=100&PageIndex=1",
  vksnd:
    "https://luatvietnam.vn/van-ban/tim-van-ban.html?keywords=&SearchOptions=1&SearchByDate=issueDate&DateFromString=01%2F01%2F2024&DateToString=&search=c%C3%B4ng&DocTypeIds=3&search=&OrganIds=225&search=&LanguageId=0&PageSize=100&PageIndex=1",
  tandtc:
    "https://luatvietnam.vn/van-ban/tim-van-ban.html?keywords=h%C6%B0%E1%BB%9Bng+d%E1%BA%ABn&SearchOptions=1&SearchByDate=issueDate&DateFromString=01%2F01%2F2025&DateToString=&search=&search=T%C3%92A+%C3%81N+NH%C3%82&search=&DocTypeIds=3&OrganIds=193&LanguageId=0&PageSize=100&PageIndex=1",
  phaplenh:
    "https://luatvietnam.vn/van-ban/tim-kiem.html?SearchKeyword=&SearchOptions=1&SearchByDate=issue&DateFromString=&DateToString=&search=&search=&search=&DocTypeIds=14&LanguageId=0&RowAmount=100&PageSize=100&PageIndex=1",
  bca:
    "https://luatvietnam.vn/van-ban/tim-kiem.html?SearchKeyword=&SearchOptions=1&SearchByDate=issue&DateFromString=&DateToString=&search=&search=&search=&DocTypeIds=17%2C4%2C3%2C20%2C16%2C5%2C1%2C28%2C34%2C35%2C52%2C92&OrganIds=41&LanguageId=0&RowAmount=100&PageSize=100&PageIndex=1",
};
