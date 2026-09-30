# RUNBOOK CUỘC THI TAX REFEREE

## 1. Yêu Cầu Môi Trường
- **Node.js:** `>= 20.0.0` (Khuyến nghị Node 20 hoặc 22/24).
- **Python (Tùy chọn):** `>= 3.10` nếu muốn chạy DeepSeek Server Agent cục bộ.
- **Trình duyệt:** Chrome, Edge, Safari hoặc Firefox.

---

## 2. Khởi Động Nhanh (Quick Start)

### Bước 1: Khởi chạy DeepSeek Server Agent (Tùy chọn)
Nếu muốn kích hoạt Vision OCR và Q-Gen thông minh qua DeepSeek cục bộ (Cổng 8000):
```bash
cd deepseek-agent
pip install -r requirements.txt
python -m patchright install chromium

# Đăng nhập tạo session an toàn (chỉ làm lần đầu):
python deepseek_login.py

# Khởi chạy API server:
python deepseek_server.py
```
*(Nếu bỏ qua bước này, hệ thống sẽ tự động fallback sang Google Gemini AI hoặc Policy Engine tất định mà không bị lỗi).*

### Bước 2: Khởi chạy Ứng dụng Tax Referee
Trong thư mục gốc của dự án:
```bash
# 1. Cài đặt dependencies
npm install

# 2. Tạo tệp môi trường
cp .env.example .env.local

# 3. Khởi chạy server production:
npm run build
npm run start -- -p 3000

# Hoặc khởi chạy chế độ phát triển:
# npm run dev
```
Mở trình duyệt truy cập: **`http://localhost:3000`**.

---

## 3. Tài Khoản Đăng Nhập Mặc Định

| Vai Trò | Email | Mật Khẩu | Chức Năng Chính |
| :--- | :--- | :--- | :--- |
| **Kế toán viên (KTV)** | `ke-toan@local` | `accountant-local` | Tiếp nhận chứng từ, duyệt hàng loạt hóa đơn thường quy (`ROUTINE`), xem định khoản Sổ cái kế toán. |
| **Kế toán trưởng (KTT)** | `ktt@local` | `ktt-local` | Thẩm định ngoại lệ rủi ro (< 200M), xem Diff luật mới cào từ Cổng Chính phủ/TCT, đồng bộ ERP (MISA, FAST, XML TT99). |
| **Giám đốc Tài chính (CFO)** | `cfo@local` | `cfo-local` | Phê duyệt ca vượt hạn mức (≥ 200M) và Vùng Đỏ K-factor, ban hành & thu hồi Tiền lệ đặc cách. |

---

## 4. Kịch Bản Trình Diễn Demo (Step-by-Step)

1. **Khôi phục dữ liệu demo sạch:** Nhấn nút **"Khôi phục dữ liệu mẫu" (Reset Demo)** trên thanh điều hướng hoặc chạy lệnh:
   ```bash
   npm run demo:reset
   ```
2. **Tiếp nhận & Bóc tách chứng từ:** Vào mục **"Tiếp nhận"**, upload hóa đơn thực tế từ thư mục `input-sample/` (hỗ trợ XML, PDF và Ảnh thực tế).
3. **Thẩm định tự động & Q-Gen:** Bấm **"Thẩm định rủi ro"**. 
   - Nếu là ca thường quy (`ROUTINE`), KTV bấm xác nhận duyệt ngay vào Sổ cái.
   - Nếu có rủi ro (`ESCALATION`), DeepSeek/Gemini AI sinh câu hỏi đóng ngữ cảnh hóa và 2 phương án đối ứng (Phương án A vs Phương án B) cho KTT/CFO.
4. **Sổ cái Kế toán & Tích hợp ERP:** Sau khi duyệt, hóa đơn tự động sinh bút toán định khoản Nợ/Có theo Thông tư 99 và Thông tư 133, có thể xuất XML hoặc adapter MISA/FAST.
5. **Trung tâm Thông báo & Giám sát Pháp lý:** Vào tab **"Thông báo"** để xem trạng thái Hệ số K an toàn và bấm nút **"Cào & Quét luật mới"** đối soát tự động từ các Cổng Chính phủ.
6. **Lưu vết Kiểm toán (Audit Trail):** Mở bảng Audit Trail để xem chuỗi băm bảo mật SHA-256 (`previous_hash` -> `event_hash`) và xuất Hồ sơ Phòng vệ Thuế 1-Click.

---

## 5. Kiểm Thử Hệ Thống (CLI Tests)

```bash
# Kiểm thử định khoản Sổ cái Kế toán (Thông tư 99, 133, MISA, FAST):
npx tsx scripts/test-ledger-integration.ts

# Kiểm thử 10 dạng hóa đơn đặc thù niên độ 2025 - 2026:
npx tsx scripts/test-diverse-invoice-types.ts

# Kiểm thử kết nối Dual-Engine AI:
npm run test:dual-engine
```

