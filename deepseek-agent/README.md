# DeepSeek Server Agent (Patchright Stealth Engine)

Hệ thống Agent Python cục bộ đóng vai trò là cầu nối API tương thích chuẩn OpenAI (`/v1/chat/completions`) kết nối với DeepSeek để phục vụ:
1. **OCR Đa thể thức (Vision OCR):** Bóc tách hóa đơn dạng ảnh, PDF, hóa đơn chụp thực tế sang định dạng JSON `InvoiceInput`.
2. **Actionable Q-Gen:** Sinh câu hỏi phán quyết A/B đóng và diễn giải pháp lý dễ hiểu cho Kế toán trưởng trong 3 giây.

---

## 1. Yêu cầu môi trường
- Python >= 3.10 (khuyến nghị Python 3.11 hoặc 3.12, 3.13).
- Trình duyệt Chromium được cài đặt qua Patchright.

---

## 2. Cài đặt các thư viện cần thiết

```bash
cd deepseek-agent
pip install -r requirements.txt
python -m patchright install chromium
```

---

## 3. Khởi tạo phiên đăng nhập (Chỉ làm lần đầu)

Chạy script đăng nhập một lần để lưu trữ phiên làm việc an toàn vào tệp `deepseek_auth.json`:

```bash
python deepseek_login.py
```
> Trình duyệt ẩn danh sẽ mở ra, tiến hành đăng nhập tài khoản DeepSeek. Sau khi đăng nhập thành công, script sẽ tự động lưu cookie phiên vào `deepseek_auth.json` và đóng lại.

---

## 4. Khởi chạy DeepSeek Server Agent

```bash
python deepseek_server.py
```

Server sẽ lắng nghe tại cổng `8000`:
- **Base URL:** `http://127.0.0.1:8000`
- **OpenAI Compatible Endpoint:** `http://127.0.0.1:8000/v1/chat/completions`
- **Health Check:** `http://127.0.0.1:8000/v1/models`

---

## 5. Kết nối với ứng dụng Next.js Tax Referee

Trong tệp `.env.local` của thư mục gốc dự án Tax Referee:

```env
DEEPSEEK_API_URL=http://127.0.0.1:8000/v1/chat/completions
DEEPSEEK_BASE_URL=http://127.0.0.1:8000
DEEPSEEK_MODEL=deepseek-chat
```

*Lưu ý: Nếu không khởi động DeepSeek Server, ứng dụng Tax Referee sẽ tự động chuyển sang chế độ dự phòng (Fallback) sang Google Gemini hoặc Policy Engine tất định nội bộ mà không làm gián đoạn trải nghiệm người dùng.*
