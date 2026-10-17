# RUNBOOK — Tax Referee (Đề A · The Escalation Referee)

Tài liệu này liệt kê mọi lệnh từ **clone sạch → chạy được → kiểm chứng**. Triển khai Hostinger đang chạy:
[deployment/HOSTINGER.md](deployment/HOSTINGER.md) · bàn giao và tự deploy: [docs/handoff/huong-dan-ban-giao.md](docs/handoff/huong-dan-ban-giao.md) ·
backup/restore VPS và đánh giá tập độc lập: [docs/runbook-final.md](docs/runbook-final.md) (lưu trữ, có thể không còn khớp mã).

## 1. Yêu cầu
- Node.js 22 (giống CI và production) hoặc 24, kèm npm.
- Windows, macOS hoặc Linux. Các lệnh test chạy được trên cả Windows (không cần WSL).
- Tùy chọn cho PDF: Python 3 với `PyMuPDF` (đọc lớp chữ PDF); thiếu PyMuPDF thì `pypdf` được dùng làm phương án dự phòng chỉ đọc chữ. `Pillow` chỉ cần cho OCR Apple Vision trên macOS (`scripts/ocr/apple_vision_ocr.py`).
- Không cần AI key để chạy Verify và bộ test: quy tắc phân luồng là tất định. AI key (Gemini) chỉ cần cho đọc ảnh/PDF scan.

## 2. Clone sạch → chạy

```sh
git clone https://github.com/khanhle1406/Tax-Referee.git
cd Tax-Referee
npm ci
cp .env.example .env.local          # điền key AI nếu muốn đọc ảnh; để trống vẫn chạy Verify
python3 -m pip install PyMuPDF      # tùy chọn, cho PDF
npm run dev                          # http://localhost:3000
```

Bản production: `npm run build && npm start` (cần ~2 GB RAM trống khi build). Kiểm thử khởi động lại sau build: `npm run test:recovery`.

Workspace nội bộ (dùng chung) đăng nhập bằng email/mật khẩu: đặt `TAX_REFEREE_ACCOUNTANT_PASSWORD`, `TAX_REFEREE_KTT_PASSWORD`, `TAX_REFEREE_CFO_PASSWORD` trong env rồi khởi động lại (đặt sau lần chạy đầu vẫn có hiệu lực). Giám khảo/khách dùng **demo riêng** (không cần tài khoản).

| Vai trò | Email đăng nhập | Biến mật khẩu |
|---|---|---|
| Kế toán viên | `ke-toan@local` | `TAX_REFEREE_ACCOUNTANT_PASSWORD` |
| Kế toán trưởng | `ktt@local` | `TAX_REFEREE_KTT_PASSWORD` |
| Giám đốc tài chính | `cfo@local` | `TAX_REFEREE_CFO_PASSWORD` |

Chưa đặt biến trên production thì mật khẩu là chuỗi ngẫu nhiên không đoán được (tài khoản coi như khóa).

## 3. Kiểm chứng (một lệnh)

```sh
npm test          # toàn bộ bộ kiểm thử: unit (node:test) + các bộ hồi quy, mỗi bộ chạy trên DB tạm riêng
npm run typecheck
npm run lint
```

CI (GitHub Actions, Ubuntu + Windows) chạy cùng các lệnh trên khi đẩy mã lên `main`/`feat/**` và khi mở PR: `.github/workflows/ci.yml`.

## 4. Đường đi của giám khảo (8 phút)

| Thời gian | Thao tác | Kỳ vọng |
|---|---|---|
| 0:00–2:00 | Bấm **"Chạy Verify"** (trang `/verify`) | Bảng PASS/FAIL có dấu thời gian từng ca: 4 ca chung + 5 ca Đề A (3 tự xử lý, 2 chuyển tiếp) |
| 2:00–3:00 | Mở trang chủ → đọc dòng hướng dẫn → bấm **"Mở hộp chuyển tiếp — demo riêng"** | Vào workspace với database riêng cho phiên, không cần tài khoản |
| 3:00–5:00 | Nhập 2 hóa đơn mới (form "Nhập ca mới" hoặc tải XML/PDF/ảnh) | Ca thường quy → tự duyệt; ca nghi vấn → chuyển tiếp với câu hỏi cụ thể, không đoán |
| 5:00–6:30 | Mở ca chuyển tiếp → đọc câu hỏi → đổi vai trò KTT/CFO → trả lời | Quyết định được ghi lại, thuế chỉ được duyệt sau khi người có thẩm quyền xác nhận |
| 6:30–7:30 | Tab **Nhật ký** → chọn hồ sơ → xem từng sự kiện → **Dừng** / **Hoàn tác** | Thấy ai làm, lúc nào, dữ liệu đầu vào (inputHash, snapshot), quy tắc và lý do; hoàn tác tạo sự kiện mới, không xóa lịch sử |

Vai trò trong demo là **vai trò mô phỏng** (Kế toán viên / Kế toán trưởng / CFO), chỉ đổi được trong phiên demo riêng.
Không có người dùng thật nào được giả lập.

## 5. Phân định thật / giả lập
- **Thật:** quy tắc phân luồng, SQLite (WAL) bền vững qua khởi động lại, audit nối chuỗi hash, revision, chứng từ nội bộ,
  parser XML hóa đơn điện tử (TT78/NĐ123), gọi Gemini Vision khi có key.
- **Giả lập / chưa chứng minh:** dữ liệu Verify là tổng hợp; tích hợp ERP/ngân hàng/TCT chỉ là xuất payload hoặc màn hình demo
  (nhóm "Mở rộng"). Buổi thử với người dùng do BTC điều phối diễn ra 16/10; BTC xác nhận buổi thử ổn, không có phản hồi chi tiết bằng văn bản, nên repo không công bố số liệu người dùng.
