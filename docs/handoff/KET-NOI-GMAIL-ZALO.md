# Bật Gmail và Zalo THẬT cho demo (10 phút)

Mã đã có sẵn: `services/channels/*`. Cần tài khoản và **6 biến môi trường**: 5 biến kênh (`GMAIL_IMAP_USER`, `GMAIL_APP_PASSWORD`, `GMAIL_NOTIFY_TO`, `ZALO_BOT_TOKEN`, `ZALO_NOTIFY_CHAT_ID`) và `TAX_REFEREE_ALLOW_REAL_CHANNELS_IN_DEMO=1` khi demo trong phiên demo (mục 3). Thiếu cờ thứ 6 thì phiên demo luôn dùng kênh **mô phỏng**, dù đã đặt đủ 5 biến kênh. **Giá trị chỉ đặt trên máy demo, không gửi vào chat, không commit.**

## 1. Gmail (hộp thư nhận hóa đơn của công ty)
1. Dùng một Gmail riêng cho demo (VD hộp thư kế toán). Vào **myaccount.google.com → Bảo mật → Xác minh 2 bước**: bật.
2. Cùng trang → **Mật khẩu ứng dụng (App passwords)** → tạo một mật khẩu cho "Tax Referee" → nhận chuỗi 16 ký tự.
3. Gmail → Cài đặt → **Chuyển tiếp và POP/IMAP → Bật IMAP**.
4. Đặt biến:
   - `GMAIL_IMAP_USER` = địa chỉ Gmail đó
   - `GMAIL_APP_PASSWORD` = chuỗi 16 ký tự (bỏ dấu cách)
   - `GMAIL_NOTIFY_TO` = email Kế toán trưởng nhận tin tóm tắt (có thể chính hộp thư đó)

## 2. Zalo Bot
1. Mở Zalo → tìm **"Zalo Bot Manager"** (bot.zaloplatforms.com) → tạo bot → nhận **token**.
2. Đặt `ZALO_BOT_TOKEN` = token đó.
3. Dùng Zalo cá nhân **nhắn một tin bất kỳ cho bot** (bot chỉ gửi được cho người đã nhắn nó trước).
4. Chạy `npx tsx --env-file=<file biến của bạn> scripts/ops/channels-check.ts` → dòng "chat id gần đây" hiện chat id của bạn → đặt `ZALO_NOTIFY_CHAT_ID` = chat id đó.
5. Lưu ý: **Zalo Bot chỉ nhận ảnh** (không nhận file XML/PDF). Ảnh hóa đơn nhận qua Zalo (và ảnh/PDF qua Gmail) được **lưu nhưng chưa tự đọc**: trạng thái `QUEUED`, nhãn "Ảnh/PDF đã lưu — chưa tự đọc". Muốn đọc thì tải ảnh lên ở màn **Lô hóa đơn** hoặc **Tiếp nhận**. Zalo user id của người gửi phải có trong danh bạ; nếu chưa, ảnh chờ KTT/CFO xác nhận người gửi.

## 3. Cho phép kênh thật trong phiên demo trên máy của đội
Đặt `TAX_REFEREE_ALLOW_REAL_CHANNELS_IN_DEMO=1`. Mặc định hệ thống **chặn** kênh thật trong phiên demo để người lạ không kéo được hộp thư của đội về: phiên demo dùng hộp thư và bot mô phỏng, tin gửi ghi `SIMULATED` và không bao giờ dùng người nhận thật (`GMAIL_NOTIFY_TO`, `ZALO_NOTIFY_CHAT_ID`). Bật cờ này cũng nạp danh bạ thật (`TAX_REFEREE_STAFF_SEED`) vào phiên demo.

**Chỉ bật trên máy local của đội.** Nếu cờ này bật trên production, `/api/health` có cảnh báo `real_channels_in_demo`. Tắt cờ ngay sau buổi demo.

## 4. Kiểm tra trước khi lên sân khấu
```bash
npx tsx --env-file=<file biến của bạn> scripts/ops/channels-check.ts             # phải ra ĐẠT cho Gmail IMAP, SMTP, Zalo
npx tsx --env-file=<file biến của bạn> scripts/ops/channels-check.ts --send-test # nhận được 1 email + 1 tin Zalo thử
```

## 5. Chạy app local có nạp biến
```bash
npm run build
cp -r .next/static .next/standalone/.next/static && cp -r public .next/standalone/public
PORT=3060 HOSTNAME=127.0.0.1 NODE_ENV=production TAX_REFEREE_DATA_DIR=$(mktemp -d) node --env-file=<file biến của bạn> .next/standalone/server.js
```

## 6. Kịch bản demo kênh thật (60 giây)
Chỉ **Kế toán viên** (người nhập) bấm lấy thư; KTT/CFO thêm người vào danh bạ và xác nhận người gửi lạ (bất kiêm nhiệm).
1. Vai **Kế toán trưởng** → **Hộp thư vào** → **Danh bạ người gửi** → thêm email Gmail của một thành viên (và Zalo user id nếu có).
2. Thành viên đó gửi email có đính kèm `data/demo-batch/01-van-phong-pham.xml` tới hộp thư demo (mỗi thư tối đa 5 đính kèm; mỗi lượt lấy tối đa 50 file, trong đó tối đa 10 file từ người gửi chưa xác thực — phần vượt bị từ chối).
3. Đổi sang vai **Kế toán viên** → bấm **"Lấy hóa đơn từ Gmail"** → file hiện nhãn **✓ Nhân viên đã xác thực** → hóa đơn tự vào một lô mới → Kế toán trưởng nhận email/Zalo tóm tắt, người gửi nhận email kết quả.
4. Gửi thử từ một email **không có trong danh bạ** rồi lấy thư (vai Kế toán viên) → nhãn **? Ngoài danh bạ**, trạng thái "Chờ xác nhận người gửi", hệ thống không xử lý. Đổi sang vai **Kế toán trưởng** → **"Xác nhận và xử lý"** → file được xử lý dưới tên Kế toán viên đã lấy thư.
5. Chụp một hóa đơn giấy gửi cho bot Zalo → vai Kế toán viên bấm **"Lấy hóa đơn từ Zalo"** → ảnh được lưu với nhãn "Ảnh/PDF đã lưu — chưa tự đọc"; nếu Zalo user id của người gửi đã có trong danh bạ (bước 1), người đó nhận tin Zalo báo đã nhận. Muốn đọc ảnh thì tải lên ở màn Lô hóa đơn hoặc Tiếp nhận.
