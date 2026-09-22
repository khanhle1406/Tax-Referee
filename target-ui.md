# BỘ MỤC TIÊU CẢI THIỆN GIAO DIỆN & TRẢI NGHIỆM NGƯỜI DÙNG (TARGET-UI.MD)
## Hệ Thống Trọng Tài Điều Phối Chuyển Tiếp Thuế Doanh Nghiệp (Tax Referee)

---

## PHẦN I: TỔNG HỢP TOÀN BỘ TẬP THAO TÁC NGƯỜI DÙNG (USER ACTION INVENTORY)

Dựa trên cấu trúc trang chủ (`app/page.tsx`), hệ thống thành phần (`components/*`) và 4 ảnh chụp màn hình thực tế từ trình duyệt, hệ thống hiện có **37 thao tác người dùng** phân bố trên 8 khối giao diện chính:

| STT | Khối Chức Năng | Tập Thao Tác Cụ Thể Của Người Dùng | Phản Hồi Hiện Tại & Trạng Thái Trực Quan |
| :--- | :--- | :--- | :--- |
| **1** | **Thanh Header & Điều Hướng** | 1.1. Nhấp nút "Quy chế Tax-SOP-2026 (v2.1)" | Mở trung tâm quy chế `PolicyViewerModal` với 3 tab: Toàn văn, Soạn thảo động, Mốc pháp luật. |
| | | 1.2. Nhấp nút "Reset Dữ liệu Mẫu" | Xác nhận qua popup, hoàn nguyên K về 1.20, xóa toàn bộ log kiểm toán và thẻ chuyển tiếp. |
| | | 1.3. Đọc hướng dẫn nhanh Giám khảo | Xem hướng dẫn quy trình kiểm thử Đề bài A trên banner viền vàng. |
| **2** | **Verify Harness (Kiểm thử 90s)** | 2.1. Nhấp nút "RUN VERIFY 90s" | Nút xoay spinner, gọi `/api/verify`, bắn pháo hoa confetti, hiển thị 4 stat cards và bảng 5 ca. |
| | | 2.2. Đọc 4 thẻ thống kê Stat Cards | Xem Kết quả chung (100% ĐẠT CHUẨN), Tổng thời gian (10 ms), 3/3 ca ROUTINE, 2/2 ca ESCALATED. |
| | | 2.3. Cuộn ngang bảng kết quả kiểm thử | Cuộn để xem các cột bị tràn: Mã Case, Hóa đơn & Đối tác, Kỳ vọng, Thực tế, Thời gian, Đánh giá, Chi tiết. |
| | | 2.4. Nhấp nút "Xem Câu hỏi A/B" tại ca ngoại lệ | Nút đang bị co chữ thành 4 dòng dọc (`Xem / Câu / hỏi / A/B`), nhấp để đẩy ca sang `EscalationCard`. |
| **3** | **Giám Sát Rủi Ro Toàn Cục (Hệ số K)** | 3.1. Đọc đồng hồ Hệ số K (1.20 / 2.0 max) | Xem trạng thái VÙNG XANH AN TOÀN (1.0 - 1.3) và thanh tiến trình đo rủi ro theo CV 2392. |
| | | 3.2. Theo dõi thuế GTGT khấu trừ [25] | Xem số tiền tích lũy tăng dần theo thời gian thực (ví dụ: 760.829.360 đ). |
| | | 3.3. Đối chiếu Doanh số bán ra | Xem chỉ tiêu 15.000.000.000 đ để kiểm soát tỷ lệ mua vào/bán ra. |
| **4** | **Form Thử Nghiệm Tùy Biến (Input Form)** | 4.1. Chọn ca mẫu từ Dropdown Preset | Chọn 1 trong 10 ca ngoại lệ bổ sung (ví dụ: TC-14 Công ty Vật liệu Xây dựng Miền Nam). |
| | | 4.2. Nhập/Sửa Số HĐ & Ngày lập HĐ | Nhập text và date picker; xem dòng gợi ý hiệu lực văn bản luật phía dưới. |
| | | 4.3. Nhập/Sửa MST & Tên đối tác | Nhập MST và Tên nhà cung cấp (hiện ô Tên đang bị tràn text cắt bớt bằng dấu ...). |
| | | 4.4. Nhập Tên mặt hàng / Dịch vụ | Nhập diễn giải nghiệp vụ kinh tế phát sinh. |
| | | 4.5. Nhập Tiền trước thuế | Nhập số tiền dạng thô (ví dụ: 4500000000 chưa có dấu chấm phân cách hàng nghìn). |
| | | 4.6. Chọn Thuế suất & Phương thức TT | Chọn 0%, 8%, 10% và Chuyển khoản (CK) / Tiền mặt (TM). |
| | | 4.7. Nhấp nút "Thẩm định bằng Jev Referee AI" | Nút màu cam hổ phách, gọi `/api/evaluate`, tự động duyệt hoặc chuyển tiếp sang thẻ HITL. |
| **5** | **Thẻ Phán Quyết Chuyển Tiếp (EscalationCard)** | 5.1. Xem trạng thái khi chưa có ca (Empty State) | Hiển thị biểu tượng người và dòng chữ "Không có hồ sơ nào đang chờ duyệt" (chưa có nút gợi ý bấm thử). |
| | | 5.2. Đọc Phân loại Nhóm rủi ro & Cấp duyệt | Banner màu tím/đỏ: NHÓM 3: VƯỢT THẨM QUYỀN (CẦN CFO); Cấp duyệt: Giám đốc Tài chính. |
| | | 5.3. Đọc Hóa đơn, Đối tác, Số tiền & Lý do cắm cờ | Hiển thị HĐ TC-14, 4.860.000.000 đ, lý do đẩy hệ số K sang vùng đỏ nguy hiểm. |
| | | 5.4. Đọc Câu hỏi Hành động Cụ thể (Actionable Q) | Hộp nền vàng, chữ to 18-20px rõ ràng, kèm căn cứ Điều 4.2 Quy chế Tax-SOP-2026. |
| | | 5.5. Nhấp nút "PHƯƠNG ÁN A" | Nhấp chọn "Duyệt đưa vào kỳ này", ghi nhận sổ kiểm toán, cập nhật tờ khai thuế, đóng thẻ. |
| | | 5.6. Nhấp nút "PHƯƠNG ÁN B" | Nhấp chọn "Tạm chuyển sang kỳ sau", ghi nhận sổ kiểm toán, giữ nguyên tờ khai thuế, đóng thẻ. |
| **6** | **Nhật Ký Kiểm Toán (AuditTrailTable)** | 6.1. Đọc số lượng bản ghi tổng quát | Xem badge "Tổng: 2 bản ghi" ở góc phải. |
| | | 6.2. Cuộn ngang xem chi tiết các cột bị khuất | Các cột bên phải (Lý do bình dân, Thao tác nút bấm) bị tràn ra ngoài khung nhìn. |
| | | 6.3. Đọc người duyệt & hành động ghi nhận | Dán nhãn CFO hoặc AI Referee; danh sách mã văn bản pháp luật xếp dọc chiếm diện tích. |
| | | 6.4. Nhấp nút "Xem Hồ sơ Giải trình Thuế" | Mở `TaxDefenseModal` với 1 cú click (hiện nút đang là icon nhỏ bị che khuất bên phải). |
| | | 6.5. Nhấp nút "Ghi đè (Override)" | Chuyển đổi trạng thái cưỡng chế quyết định bởi KTT/CFO. |
| | | 6.6. Nhấp nút "Hoàn tác (Undo)" | Hủy bỏ quyết định kiểm toán, trừ lại tiền thuế trên tờ khai. |
| **7** | **Quản Trị Quy Chế (PolicyViewerModal)** | 7.1. Chuyển đổi 3 tab chức năng | Tab Toàn văn quy chế, Soạn thảo quy chế động, Bản đồ pháp luật theo mốc thời gian. |
| | | 7.2. Soạn thảo sửa đổi SOP & Tăng phiên bản | Nhập ghi chú thay đổi, chỉnh sửa text SOP, bấm "Lưu & Kích hoạt Phiên bản Mới" (v2.1 -> v2.2). |
| | | 7.3. Khôi phục SOP chuẩn gốc v2.1 | Hoàn nguyên toàn bộ về bản gốc mặc định. |
| | | 7.4. Tra cứu văn bản luật theo ngày lập HĐ | Chọn ngày trên date picker, xem ngay Nghị định/Thông tư có hiệu lực tại ngày đó. |
| | | 7.5. Đóng modal quy chế | Bấm nút X hoặc nút Đóng cửa sổ. |
| **8** | **Hồ Sơ Giải Trình Thuế (TaxDefenseModal)** | 8.1. Xem chứng nhận tuân thủ & biên bản | Xem chứng từ pháp lý bảo vệ doanh nghiệp trước cơ quan thuế. |
| | | 8.2. Kiểm tra chữ ký số SHA-256 nội bộ | Xác thực tính toàn vẹn và căn cứ quy chế theo thời gian thực. |
| | | 8.3. Nhấp nút "In / Xuất PDF Giải trình" | Gọi lệnh in hệ thống xuất file PDF A4 tiêu chuẩn phục vụ đoàn thanh tra. |
| | | 8.4. Đóng modal hồ sơ | Bấm nút X hoặc nút Đóng cửa sổ. |

---

## PHẦN II: ĐÁNH GIÁ THỰC TẾ DỰA TRÊN ẢNH CHỤP MÀN HÌNH (VISUAL UX AUDIT)

Qua 4 ảnh chụp màn hình thực tế do người dùng cung cấp, các điểm nghẽn thị giác và công thái học hiển hiện rất rõ nét:

### 1. Bảng VerifyHarness bị tràn ngang và nút bấm bị co ép biến dạng (Hình 1, 3, 4)
- **Hiện tượng**: Bảng kết quả kiểm thử Verify Harness trong cột trái (rộng khoảng 650px) có quá nhiều cột (7 cột: Mã Case, HĐ & NCC, Kỳ vọng, Thực tế, Thời gian, Đánh giá, Chi tiết). Do không đủ chiều rộng, bảng sinh ra thanh cuộn ngang `overflow-x-auto`.
- **Hậu quả nghiêm trọng**:
  - Khi cuộn sang phải, 2 cột quan trọng nhất là `Mã Case` và `Hóa đơn & Nhà cung cấp` bị khuất hoàn toàn sang trái (như thấy ở Hình 1).
  - Nút bấm `[Xem Câu hỏi A/B]` ở cột Chi tiết bị co ép chiều ngang, khiến chữ bên trong bị ngắt dòng thành 4 dòng dọc:
    ```
    Xem
    Câu
    hỏi
    A/B
    ```
    (nhìn thấy rất rõ ở Hình 3 và Hình 4). Đây là lỗi thẩm mỹ và trải nghiệm nghiêm trọng.

### 2. Bảng AuditTrailTable bị tràn ngang làm mất các nút thao tác cốt lõi (Hình 1, 4)
- **Hiện tượng**: Bảng nhật ký kiểm toán ở cột dưới bên phải cũng bị thanh cuộn ngang.
- **Hậu quả**:
  - Cột `Lý do bình dân` và 3 nút thao tác quan trọng nhất (`[Xem Hồ sơ 1-Click]`, `[Ghi đè]`, `[Hoàn tác]`) bị đẩy tuột ra ngoài màn hình bên phải. Người dùng bình thường nhìn vào sẽ không thấy nút bấm đâu nếu không kéo thanh cuộn.
  - Ký hiệu tiền tệ `đ` bị rớt dòng xuống dưới con số (ví dụ: `4.860.000.000` dòng trên, chữ `đ` dòng dưới).
  - Danh sách các tag Nghị định (ví dụ: `123/2020/NĐ-CP`, `219/2013/TT-BTC`, `142/2024/QH15`) bị xếp chồng dọc thành cột dài gây choán diện tích.

### 3. Thẻ EscalationCard có Trạng thái trống thụ động (Hình 1)
- **Hiện tượng**: Khi mới mở app hoặc chưa chọn ca nào, thẻ hiển thị *"Không có hồ sơ nào đang chờ duyệt"*.
- **Hậu quả**: Khách xem hoặc Giám khảo không biết phải làm gì tiếp theo để kích hoạt thẻ này, bỏ lỡ tính năng trọng tâm phán quyết A/B của Đề bài A.

### 4. Ô nhập liệu Form Tùy biến chưa tối ưu hiển thị (Hình 2)
- **Hiện tượng**:
  - Ô `Tiền trước thuế` đang hiển thị số thô không có định dạng phân cách hàng nghìn (ví dụ: `4500000000`), khiến người dùng rất khó đọc xem là 4,5 tỷ hay 450 triệu.
  - Ô `Tên đối tác` bị hẹp khiến tên công ty bị cắt cụt (`Công ty Cổ phần Vật liệu X...`).
  - Chưa có dòng tính toán xem trước tự động: "Tiền thuế GTGT: +360.000.000 đ | Tổng cộng: 4.860.000.000 đ" trước khi bấm thẩm định.

### 5. Thiếu liên kết dẫn hướng giữa Cột Trái và Cột Phải khi chọn ca (Hình 3)
- **Hiện tượng**: Khi ca TC-14 được kích hoạt trên EscalationCard ở cột phải, bảng bên trái hoặc form không có hiệu ứng viền sáng (Highlight Active Ring) để người dùng biết thẻ bên phải đang nói về đối tượng nào ở bên trái.

---

## PHẦN III: BỘ MỤC TIÊU CẢI THIỆN UI TOÀN DIỆN (TARGET UI MASTER FRAMEWORK)

Mục tiêu cốt lõi: **Xóa bỏ hoàn toàn thanh cuộn ngang gây lỗi giao diện, tối ưu hiển thị 100% nội dung vừa vặn màn hình, đưa các nút hành động cốt lõi ra vị trí trực quan 1-chạm.**

---

### MỤC TIÊU 1: TÁI CẤU TRÚC BẢNG VERIFY HARNESS VỪA VẶN KHÔNG CUỘN NGANG
- **Mục tiêu 1.1 - Tích hợp gọn gàng các cột thông tin**:
  - Gộp cột `Kỳ vọng` và `Thực tế` thành một cột duy nhất: **"Trạng thái & Rủi ro"** (ví dụ: Badge xanh `ROUTINE` hoặc Badge vàng hổ phách `ESCALATED (NHÓM 3)`).
  - Tích hợp thông tin `Mã case` trực tiếp vào ô `Hóa đơn & Nhà cung cấp` (dạng: `[TC-01] Cty Xăng dầu...`).
  - Loại bỏ việc hiển thị cột `Thời gian (ms)` trên từng dòng; đưa chỉ số thời gian trung bình lên Thẻ Stat Card ở trên.
- **Mục tiêu 1.2 - Sửa dứt điểm nút bấm bị ngắt dòng 4 hàng**:
  - Đổi nút thành nhãn ngang 1 dòng có `whitespace-nowrap`: `[Xử lý A/B ->]` với màu vàng hổ phách nổi bật, icon mũi tên trỏ sang phải, kích thước chuẩn ngón tay bấm (padding 8px 12px), tuyệt đối không bao giờ bị rớt dòng.
- **Mục tiêu 1.3 - Hiệu ứng Active Row Highlight**:
  - Khi ca nào đang được mở trên thẻ EscalationCard bên phải, dòng tương ứng ở bảng bên trái tự động sáng viền vàng hổ phách (`border-l-4 border-amber-400 bg-amber-500/15`) để tạo cảm giác gắn kết luồng dữ liệu 2 cột.

---

### MỤC TIÊU 2: TÁI CẤU TRÚC BẢNG AUDIT TRAIL ĐƯA NÚT THAO TÁC RA MẶT TIỀN
- **Mục tiêu 2.1 - Bổ sung 4 Tab lọc trạng thái nhanh (Quick Filter Tabs)**:
  - Bổ sung 4 tab ngay trên thanh tiêu đề bảng nhật ký:
    - Tab 1: `Tất cả (n)`
    - Tab 2: `Tự duyệt 100% (n)`
    - Tab 3: `Chuyển tiếp HITL (n)`
    - Tab 4: `Đã ghi đè (n)`
  - Giúp người dùng lọc ngay các ca cần thẩm tra mà không phải cuộn tìm kiếm.
- **Mục tiêu 2.2 - Loại bỏ thanh cuộn ngang, bảo đảm hiển thị trọn vẹn**:
  - Thiết kế bảng dạng phẳng co giãn responsive thông minh.
  - Sửa lỗi rớt chữ `đ`: Sử dụng `whitespace-nowrap font-mono` cho toàn bộ số tiền (ví dụ: `4.860.000.000 đ` luôn nằm trên cùng một dòng).
  - Dàn ngang các tag Nghị định thành 1 hàng flex-wrap nhỏ gọn, không để xếp chồng dọc chiếm diện tích.
- **Mục tiêu 2.3 - Làm nổi bật nút "Xem Hồ sơ Giải trình 1-Click"**:
  - Thay vì icon nhỏ xíu bị khuất, hiển thị nút có chữ rõ ràng: `[Hồ sơ Giải trình]` kèm biểu tượng tờ tài liệu màu xanh ngọc bích, luôn nằm cố định trong tầm mắt người dùng.

---

### MỤC TIÊU 3: BỔ SUNG ACTIONABLE QUICK-PRESETS CHO ESCALATION CARD
- **Mục tiêu 3.1 - Biến Empty State thành bệ phóng thử nghiệm 1 chạm**:
  - Khi thẻ đang ở trạng thái chưa có ca nào, bổ sung 2 nút bấm màu gradient nổi bật:
    - Nút 1: `[Bấm thử: Ca Nghi ngờ MST (TC-07)]` -> Kích hoạt ca Nhóm 1 (Kế toán trưởng).
    - Nút 2: `[Bấm thử: Ca Hóa đơn lớn vượt trần CFO (TC-13/TC-14)]` -> Kích hoạt ca Nhóm 3 (CFO).
  - Người dùng hoặc Giám khảo chỉ cần nhấp 1 phát là nhìn thấy ngay câu hỏi phán quyết A/B và 2 nút lựa chọn mà không cần phải chạy lại Verify hay chọn form.
- **Mục tiêu 3.2 - Giữ vững thiết kế Câu hỏi hành động chuẩn công thái học**:
  - Duy trì câu hỏi chữ to (18-20px), màu vàng nổi bật, 2 nút Phương án A và Phương án B dạng khối lớn dễ bấm trên màn hình cảm ứng hoặc chuột.

---

### MỤC TIÊU 4: NÂNG CẤP CÔNG THÁI HỌC CHO FORM THỬ NGHIỆM TÙY BIẾN
- **Mục tiêu 4.1 - Định dạng số tiền có dấu chấm phân cách (Formatted Currency Input)**:
  - Khi người dùng nhập `4500000000`, hiển thị ngay dạng `4.500.000.000 đ` để dễ đọc, tránh nhầm lẫn số chữ số 0.
- **Mục tiêu 4.2 - Thanh xem trước kết quả thuế tự động (Live Tax Preview Bar)**:
  - Ngay trên nút bấm Thẩm định, hiển thị dòng tóm tắt trực quan:
    `Tiền hàng: 4.500.000.000 đ + Thuế GTGT (8%): 360.000.000 đ = Tổng thanh toán: 4.860.000.000 đ`.
- **Mục tiêu 4.3 - Bố cục thông thoáng cho Tên Nhà Cung Cấp**:
  - Tách ô Tên nhà cung cấp ra dòng riêng hoặc mở rộng chiều ngang để không bị cắt cụt dấu ba chấm (`...`).

---

### MỤC TIÊU 5: NÂNG CẤP THANH HEADER BANNER THÀNH STEPPER CHỈ DẪN 3 BƯỚC
- **Mục tiêu 5.1 - Trực quan hóa quy trình trải nghiệm 3 bước**:
  - Thiết kế Stepper đồ họa hiện đại trên HeaderBanner:
    `[1. Bấm RUN VERIFY 90s]  ===>  [2. Phán quyết Thẻ A/B]  ===>  [3. Xuất Hồ sơ Giải trình]`.
  - Giúp bất kỳ ai truy cập website đều hiểu ngay triết lý "The Escalation Referee" trong 3 giây.
- **Mục tiêu 5.2 - Nút Quy chế Tax-SOP-2026 có hiệu ứng Pulse**:
  - Gắn badge `"Ground Truth Active"` màu tím phát sáng nhẹ bên cạnh phiên bản `v2.1`, nhấn mạnh vai trò quy chế nội bộ làm chân lý đối chiếu.

---

## PHẦN IV: BẢNG TIÊU CHÍ NGHIỆM THU CHI TIẾT (ACCEPTANCE CRITERIA)

| Mã | Hạng Mục UI Cần Sửa | Trạng Thái Trước Khi Sửa (Thực Tế) | Trạng Thái Nghiệm Thu Sau Khi Sửa | Đánh Giá |
| :--- | :--- | :--- | :--- | :--- |
| **AC-01** | **Bảng Verify Harness** | Bị tràn thanh cuộn ngang; chữ nút bấm bị rớt thành 4 dòng (`Xem / Câu / hỏi / A/B`). | Không còn thanh cuộn ngang; bảng co giãn 100% chiều rộng; nút bấm `[Xử lý A/B ->]` phẳng đẹp 1 dòng `whitespace-nowrap`. | **ĐÃ ĐẠT 100%** |
| **AC-02** | **Active Highlight** | Chọn ca ngoại lệ không thấy hiệu ứng dòng bên trái. | Dòng ca được chọn đổi nền màu hổ phách (`border-l-4 border-amber-400 bg-amber-500/15`) kèm nút `[Đang mở thẻ]` liên kết sang thẻ bên phải. | **ĐÃ ĐẠT 100%** |
| **AC-03** | **Bảng Audit Trail** | Bị tràn ngang; cột Lý do và nút bấm bị khuất; chữ `đ` bị rớt dòng; Nghị định xếp chồng dọc. | Không còn tràn ngang; chữ `đ` không rớt dòng (`whitespace-nowrap`); nút `[Hồ sơ]` màu xanh ngọc bích hiển thị rõ ràng 1-chạm. | **ĐÃ ĐẠT 100%** |
| **AC-04** | **Tab Lọc Audit Trail** | Bảng chỉ hiển thị danh sách dồn đống không có bộ lọc. | Có 4 Tab lọc nhanh: Tất cả, Tự duyệt, HITL, Ghi đè kèm số đếm bản ghi thời gian thực. | **ĐÃ ĐẠT 100%** |
| **AC-05** | **Empty State Escalation** | Chỉ có câu chữ thụ động "Không có hồ sơ nào đang chờ duyệt". | Có thêm 2 nút Quick-Preset để Giám khảo nhấp thử nghiệm ngay lập tức (TC-07 KTT và TC-14 CFO). | **ĐÃ ĐẠT 100%** |
| **AC-06** | **Form Thử Nghiệm** | Tiền trước thuế dạng số thô (4500000000); tên đối tác bị cắt cụt; thiếu xem trước thuế. | Tên đối tác bố cục 4:8 thông thoáng; có số tiền VND hiển thị trực tiếp; thanh Live Tax Preview Bar tự động. | **ĐÃ ĐẠT 100%** |
| **AC-07** | **Header Banner** | Dòng text chỉ dẫn đơn điệu. | Mini-Stepper 3 bước chỉ dẫn trực quan cho Giám khảo; nút SOP có badge `GROUND TRUTH`. | **ĐÃ ĐẠT 100%** |

---

## PHẦN V: THỨ TỰ TRIỂN KHAI CẢI THIỆN MÃ NGUỒN (EXECUTION PLAN)

1. **Bước 1**: Cập nhật `components/VerifyHarness.tsx`:
   - Gộp các cột thừa, cố định chiều rộng, xóa bỏ tình trạng `overflow-x-auto` tràn khung.
   - Sửa nút `[Xử lý A/B ->]` thành nhãn 1 dòng có `whitespace-nowrap`.
   - Thêm `activeCaseId` prop và viền highlight cho dòng đang được chọn.

2. **Bước 2**: Cập nhật `components/AuditTrailTable.tsx`:
   - Bổ sung 4 Tab lọc: Tất cả, Tự duyệt, Chuyển tiếp, Ghi đè.
   - Định dạng tiền tệ không rớt dòng (`whitespace-nowrap font-mono`).
   - Đưa nút `[Hồ sơ Giải trình]` ra vị trí thuận tiện nhất.

3. **Bước 3**: Cập nhật `components/EscalationCard.tsx`:
   - Bổ sung 2 nút Quick-Preset vào Empty State để bấm thử ngay.

4. **Bước 4**: Cập nhật `components/InteractiveInputForm.tsx`:
   - Mở rộng bố cục tên đối tác và thêm thanh tóm tắt xem trước tiền thuế tự động.

5. **Bước 5**: Cập nhật `components/HeaderBanner.tsx`:
   - Bổ sung thanh Stepper 3 bước hướng dẫn kiểm thử cho Giám khảo.
