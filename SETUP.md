# lawRNTool — hướng dẫn cài đặt & deploy

App React Native lấy văn bản luật từ **luatvietnam.vn** rồi push lên **MongoDB** + **Firestore**.
Backend chạy trên **Firebase Functions** (không dùng puppeteer — thay bằng `fetch` + `cheerio`).

## Kiến trúc

```
📱 RN app (src/)                🖥️ Firebase Functions (functions/)
  CheckScreen ──check──────────►  GET  /check       cheerio quét danh sách
  LawScreen  ──scrapeLaw───────►  GET  /scrapeLaw   cheerio quét 1 văn bản
             ──processLaw──────►  POST /processLaw  chuẩn hoá + chuyển đổi (convert.js)
   Detail5View◄─ soi format      GET  /checkExists  dedup (đã có trong Mongo?)
             ──pushLaw─────────►  POST /pushLaw     embed (Ollama) + Firestore + Mongo
```

**Luồng dùng:** chọn loại VB → `check` ra danh sách → chạm 1 văn bản → `scrapeLaw`
điền các trường (sửa được) → **Xử lý** → chuyển sang **Detail5View** (mô phỏng
`lawMachine/screens/Detail5.js`) để xem chương/điều/khoản + thông tin, kiểm tra
data đúng format chưa → **Push**. Nếu đã tồn tại (`checkExists`) sẽ hỏi ghi đè.

- `functions/lib/scrape.js` — thay puppeteer bằng cheerio (đã test với HTML thật).
- `functions/lib/convert.js` — port từ `nextLawTool/app/main.js` (đã bỏ code trình duyệt, `embedText` trỏ Ollama remote).
- `functions/lib/pipeline.js` — port `getValueinArea` + `getInfo` từ trang `once`.
- `functions/lib/ObjectLawPair.json` — bản đồ tra cứu luật liên quan (4.4MB, bundle sẵn).

## Điều kiện bắt buộc trước khi deploy

1. **Gói Blaze** (pay-as-you-go) — cần để Functions gọi ra internet (scrape + Ollama + Mongo).
2. **MongoDB** (self-hosted tại `46.225.145.42:6980`): firewall phải cho phép kết nối từ
   Cloud Functions. IP egress của Functions là **động** → hoặc mở firewall rộng, hoặc cấu hình
   **static egress IP** (VPC connector + Cloud NAT) rồi whitelist IP đó.
3. **Firestore**: đã bật, và tạo **vector index** cho collection `chunks` field `embedding` (1024 chiều) nếu cần truy vấn vector.

## Deploy backend

```bash
cd functions
npm install

# (tuỳ chọn) đổi Ollama trong functions/.env nếu cần
#   OLLAMA_EMBED_URL=https://ollama.pixelplaces.net/api/embed
#   OLLAMA_MODEL=bge-m3

cd ..
firebase deploy --only functions
```

> MongoDB: chuỗi kết nối đang hardcode trong `functions/index.js` (`MONGODB_URI`)
> vì đây là app nội bộ. Muốn kín hơn thì đổi lại thành `defineSecret("MONGODB_URI")`
> và `firebase functions:secrets:set MONGODB_URI`.

Sau deploy, URL các hàm có dạng:
`https://asia-southeast1-lawtool-f8b15.cloudfunctions.net/<tên hàm>`

## Chạy app RN

```bash
npm install
npm run android      # hoặc: npm run ios
```

Nếu project/region khác `lawtool-f8b15` / `asia-southeast1`, sửa `src/config.ts`
→ `FUNCTIONS_BASE_URL`. Muốn test với emulator, xem ghi chú trong `config.ts`.

## Trạng thái kiểm thử

| Phần | Trạng thái |
|------|-----------|
| Quét danh sách + chi tiết (cheerio) | ✅ Đã test với HTML thật của luatvietnam.vn |
| `processLaw` (convert + resolve luật liên quan) | ✅ Đã test end-to-end (fullText 31k ký tự đúng) |
| Push Mongo / Firestore / embed Ollama | ⚠️ Port trung thực từ bản cũ, **chưa test live** (cần secret + Blaze) |

## Việc còn lại / lưu ý

- **Dedup**: bản cũ dùng `addJSONFile` ghi thêm vào `ObjectLawPair.json` sau mỗi lần push để tránh trùng.
  Bản này bỏ bước đó → danh sách dedup sẽ cũ dần. Nên chuyển sang kiểm tra tồn tại trong Mongo/Firestore.
- `processLaw` chạy `concurrency: 1` (convert.js dùng biến module-level) → xử lý tuần tự, chấp nhận được cho tool nội bộ.
- `pushLaw` timeout 540s vì embedding nhiều chunk qua Ollama remote khá chậm.
