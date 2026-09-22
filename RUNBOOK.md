# HƯỚNG DẪN CHẠY DỰ ÁN TAX REFEREE TRÊN LOCAL (RUNBOOK)
> **Dự án:** Tax Referee - The Escalation Referee (Đề bài A - MLAI Hackathon 2026)  
> **Môi trường:** Local Development Server (Next.js 15, React 19, TypeScript, Tailwind CSS)

---

## 1. YÊU CẦU HỆ THỐNG
- **Node.js:** Phiên bản `>= 18.18.0` (Khuyến nghị Node 20 hoặc 22+).
- **Trình duyệt web:** Chrome, Edge, Safari hoặc Firefox.

---

## 2. KHỞI ĐỘNG NHANH 3 BƯỚC

### Bước 1: Cài đặt các gói thư viện
Mở terminal tại thư mục gốc của dự án (`Tax Referee`):
```bash
npm install
```

### Bước 2: Cấu hình API Keys (.env.local)
Sao chép tệp mẫu `.env.example` thành `.env.local` và điền 2 khóa API tương ứng:
```bash
cp .env.example .env.local
```
Nội dung tệp `.env.local`:
```env
TYPESAFE_API_KEY=your_typesafe_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here
```

### Bước 3: Khởi chạy Local Dev Server
```bash
npm run dev
```

Mở trình duyệt và truy cập:
👉 **[http://localhost:3002](http://localhost:3002)** *(hoặc [http://localhost:3000](http://localhost:3000))*

---

## 3. KỊCH BẢN TỰ KIỂM THỬ DÀNH CHO NGƯỜI DÙNG & GIÁM KHẢO (5 BƯỚC)

### Thao tác 1: Chạy bài Kiểm tra Nhanh 90 Giây (Verify 90s)
1. Trên giao diện, tìm nút màu xanh **"RUN VERIFY 90s"** ở góc trên cột trái.
2. Bấm nút và quan sát:
   - Hệ thống thực thi tuần tự 5 trường hợp kiểm thử trong vòng **dưới 1.5 giây**.
   - Xuất bảng kết quả: **3 ca Routine (Tự động duyệt 100%)** và **2 ca Escalated (Dừng chuyển tiếp chính xác)**.
   - Bảng hiển thị đầy đủ dấu thời gian và đánh giá ĐẠT chuẩn 100%.

### Thao tác 2: Xử lý Chuyển tiếp trên Thẻ Escalation Card
1. Tại bảng kết quả Verify, bấm nút **"Xem Câu hỏi A/B"** ở ca `TC-07` (Taxi mờ tiền) hoặc `TC-13` (Thép Hòa Phát -250M).
2. Nhìn sang cột phải: Thẻ **Escalation Card** sẽ xuất hiện với đường viền vàng/đỏ nổi bật:
   - Đọc câu hỏi hành động cụ thể in đậm kèm căn cứ điều khoản `Tax-SOP-2026`.
   - Bấm thử **"PHƯƠNG ÁN A"** hoặc **"PHƯƠNG ÁN B"**.
   - Quan sát: Hồ sơ được giải quyết ngay lập tức, đồng hồ đo **Hệ số K** và số tiền **Thuế khấu trừ [25]** tự động nhảy số theo thời gian thực.

### Thao tác 3: Thử nghiệm Hóa đơn Mới Tùy biến (Tiêu chí 8 điểm Dữ liệu Mới)
1. Tại khối **"Thử nghiệm Hóa đơn Mới Tùy biến"** ở cột trái:
2. Bạn có thể chọn nhanh từ dropdown các ca ngoại lệ khác (ví dụ: `TC-10` viễn thông áp sai 8%, `TC-12` máy lạnh 25 triệu thanh toán tiền mặt, hoặc `TC-09` nhà cung cấp đóng MST).
3. Thử đổi ngày lập hóa đơn và quan sát dòng chữ màu xanh hiển thị các văn bản pháp luật có hiệu lực tại ngày đó.
4. Hoặc bạn có thể tự tay sửa số tiền thành `250.000.000₫` và bấm **"Thẩm định bằng Jev Referee AI"**.
5. Quan sát: Hệ thống lập tức nhận diện vượt thẩm quyền và định tuyến sang cho CFO phê duyệt.

### Thao tác 4: Kiểm soát Nhật ký Kiểm toán & Mở Hồ sơ Giải trình Thuế 1-Click
1. Cuộn xuống bảng **Nhật ký Kiểm toán (Audit Trail)** ở cột phải:
2. Bấm nút **Undo (Mũi tên cong)**: Kiểm tra xem quyết định có được hoàn tác và số thuế có được trừ lại chính xác hay không.
3. Bấm nút **Tax Dossier (Biểu tượng tờ tài liệu)**: Mở xem toàn văn **"Hồ sơ Giải trình Thuế 1-Click"** với đầy đủ chứng cứ đối soát, văn bản pháp quy áp dụng, log phê duyệt có timestamp và mã chữ ký số nội bộ.

### Thao tác 5: Khám phá Trung tâm Quản trị Quy chế & Tra cứu Pháp luật theo Thời gian
1. Trên thanh Header trên cùng, bấm nút **"Quy chế Tax-SOP-2026 (v2.1)"**:
2. **Tab 1 (Toàn văn Quy chế):** Xem văn bản quy chế hiện hành và lịch sử các phiên bản sửa đổi (Version Change Log).
3. **Tab 2 (Cập nhật Quy chế Động):** Kế toán trưởng có thể soạn thảo, thêm điều khoản mới và bấm **"Lưu & Kích hoạt Phiên bản Mới"** -> Hệ thống tự động tăng phiên bản (ví dụ v2.2) và nạp vào Context của AI ngay lập tức!
4. **Tab 3 (Bản đồ Pháp luật theo Thời gian):** Chọn một ngày bất kỳ trên công cụ Date Picker để xem danh mục các Nghị định, Thông tư của Chính phủ đang có hiệu lực tại mốc thời gian đó.

---

## 4. CÁC LỆNH KIỂM TRA MÃ NGUỒN (TEST, BUILD & LINT)
- **Chạy kiểm thử toàn bộ 15 ca chuẩn hóa (100% Pass):**
  ```bash
  npx tsx scripts/test-all-cases.ts
  ```
- **Kiểm tra biên dịch Type-Safe:**
  ```bash
  npm run build
  ```
- **Kiểm tra format và lint:**
  ```bash
  npm run lint
  ```

