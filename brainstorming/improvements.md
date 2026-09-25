# KẾ HOẠCH CẢI THIỆN TOÀN DIỆN TAX REFEREE
> **Hệ thống:** Tax Referee — Trọng tài Thuế Tiền Hạch toán & Điều phối Chuyển tiếp  
> **Mục tiêu:** Nâng tầm hệ thống từ MVP/Prototype lên chuẩn B2B Enterprise SaaS tiệm cận các nền tảng quốc tế (AppZen, Vic.ai, Blue dot)  
> **Nguyên tắc sắp xếp:** Đánh giá và trình bày theo thứ tự **ĐỘ ƯU TIÊN TỪ THẤP ĐẾN CAO (Low ➔ Medium ➔ High ➔ Critical)**

---

## MA TRẬN TỔNG QUAN CÁC HẠNG MỤC CẢI THIỆN

| Mã | Hạng mục Cải thiện | Phân nhóm | Độ phức tạp (Effort) | Giá trị mang lại (Impact) | Mức độ Ưu tiên |
| :---: | :--- | :--- | :---: | :---: | :---: |
| **IMP-01** | Trợ lý Giọng nói AI / Voice Query Hỏi đáp Quy chế | AI & UX | Cao (3 tuần) | Thấp - Trung bình | **1. THẤP (Low)** |
| **IMP-02** | Khớp 3 bên Mua hàng (3-Way Matching: PO - HĐ - Kho) | Cơ chế Engine | Rất cao (4 tuần) | Trung bình (Tùy DN) | **1. THẤP (Low)** |
| **IMP-03** | Tích hợp Chữ ký số HSM / USB Token vào Hồ sơ Thuế | Pháp lý & Bảo mật | Trung bình (2 tuần) | Trung bình | **1. THẤP (Low)** |
| **IMP-04** | Thông báo Đa kênh & Cảnh báo SLA (Zalo ZNS / Telegram / Slack) | Luồng vận hành | Thấp (1 tuần) | Khá cao | **2. TRUNG BÌNH (Medium)** |
| **IMP-05** | Tự động Thu nhận Hóa đơn 24/7 (Virtual Email Ingestion) | Luồng vận hành | Trung bình (1.5 tuần) | Rất cao | **2. TRUNG BÌNH (Medium)** |
| **IMP-06** | Xuất Dữ liệu Chuẩn hóa sang Phần mềm Kế toán VN (MISA, FAST) | Tích hợp Hệ sinh thái | Thấp - Trung bình (1 tuần)| Rất cao | **2. TRUNG BÌNH (Medium)** |
| **IMP-07** | Báo cáo Trực quan Hóa Tỷ lệ Tự động hóa (Touchless Metrics) | Giao diện & Analytics| Thấp (4 ngày) | Khá cao | **2. TRUNG BÌNH (Medium)** |
| **IMP-08** | Xác thực Chi tiết đến Từng Dòng Hàng & Đa Thuế suất (Line-item) | Cơ chế Engine | Trung bình (1.5 tuần) | Cực cao | **3. CAO (High)** |
| **IMP-09** | Xử lý Hàng loạt Ca Thường quy 1-Click (Bulk Confirm Routine) | Giao diện & Thao tác | Rất thấp (2 ngày) | Cực cao (Xóa điểm nghẽn)| **3. CAO (High)** |
| **IMP-10** | Bộ lọc Chuyên sâu & Tìm kiếm Đa tiêu chí trong Inbox | Giao diện & Tìm kiếm | Thấp (3 ngày) | Rất cao | **3. CAO (High)** |
| **IMP-11** | Trình Xem Hóa đơn Gốc Song Song (Side-by-Side PDF Viewer) | Giao diện & Niềm tin | Trung bình (1 tuần) | Sống còn với Kế toán | **4. TỐI CAO (Critical)** |
| **IMP-12** | Bộ nhớ Tiền lệ & Vòng Tự học (AI Feedback Loop / Zenlearn) | Trí tuệ Nhân tạo | Trung bình (1.5 tuần) | Sống còn với CFO | **4. TỐI CAO (Critical)** |
| **IMP-13** | Phát hiện Hóa đơn Trùng lặp & Gian lận Kê khai (Duplicate Check) | Phòng ngừa Rủi ro | Thấp (3 ngày) | Sống còn Pháp lý | **4. TỐI CAO (Critical)** |

---

## CHI TIẾT TỪNG HẠNG MỤC THEO ĐỘ ƯU TIÊN (TỪ THẤP ĐẾN CAO)

---

### PHẦN I: NHÓM ĐỘ ƯU TIÊN THẤP (LOW PRIORITY)
*Nhóm tính năng mở rộng, tạo hiệu ứng ấn tượng (Nice-to-have) hoặc phụ thuộc nhiều vào hạ tầng ngoài của khách hàng, chưa cần thiết cho giai đoạn đầu thương mại hóa.*

#### 1. [IMP-01] Trợ lý Giọng nói AI / Voice Query Hỏi đáp Quy chế
*   **Mô tả:** Cho phép Kế toán trưởng hoặc CFO bấm nút micro và đặt câu hỏi bằng tiếng Việt: *"Tháng này có bao nhiêu hóa đơn mua vào vượt hạn mức?"* hoặc *"Quy chế hoàn ứng chi phí xăng dầu quy định thế nào?"*.
*   **Hiện trạng:** Người dùng phải tự vào Policy Studio để đọc văn bản hoặc chuyển đổi qua các tab.
*   **Mục tiêu sau cải tiến:** Trợ lý ảo sử dụng Gemini Flash Audio / Whisper để trả lời nhanh bằng giọng nói hoặc văn bản trích dẫn chính xác điều khoản SOP.
*   **Đánh giá:** Tính năng này mang tính trình diễn cao nhưng không phải là nhu cầu tác nghiệp hàng ngày bắt buộc của kế toán. Xếp mức ưu tiên thấp.

#### 2. [IMP-02] Khớp 3 bên Mua hàng (3-Way Matching: PO - HĐ - Kho)
*   **Mô tả:** Đối chiếu chéo 3 chiều: Hóa đơn điện tử (Invoice) vs Đơn đặt hàng đã duyệt (Purchase Order) vs Phiếu nhập kho thực tế (Goods Receipt Note).
*   **Hiện trạng:** Hệ thống đang kiểm tra dựa trên các cờ đánh dấu logic (`hasItemManifest`, `hasBankSlip`) và dữ liệu hóa đơn độc lập.
*   **Mục tiêu sau cải tiến:** Kết nối dữ liệu kho và đơn mua hàng từ ERP để phát hiện trường hợp hóa đơn xuất đúng nhưng hàng chưa giao hoặc giá trên HĐ cao hơn giá trong hợp đồng nguyên tắc.
*   **Đánh giá:** Phức tạp vì mỗi doanh nghiệp dùng một phần mềm kho/mua hàng khác nhau. Cần triển khai theo dạng module tích hợp riêng biệt ở giai đoạn doanh nghiệp lớn (Enterprise Custom).

#### 3. [IMP-03] Tích hợp Chữ ký số HSM / USB Token vào Hồ sơ Thuế
*   **Mô tả:** Tích hợp ký số điện tử chuẩn cơ quan Thuế (chữ ký số doanh nghiệp qua USB Token hoặc Cloud HSM) trực tiếp lên file PDF Hồ sơ Giải trình Thuế (Tax Defense Dossier).
*   **Hiện trạng:** Hồ sơ mới tạo mã băm kiểm toán SHA-256 nội bộ và ghi chú trạng thái *"Chưa tích hợp chữ ký số pháp lý"*.
*   **Mục tiêu sau cải tiến:** Khi CFO bấm phê duyệt phương án A/B, hệ thống có thể gọi dịch vụ ký số từ xa (VNPT-CA, Viettel-CA, MISA eSign) để đóng dấu mộc số pháp lý ngay lên biên bản giải trình.
*   **Đánh giá:** Rất giá trị về pháp lý nhưng đòi hỏi tích hợp phần cứng và chứng thư số của từng công ty, nên làm sau khi luồng duyệt lõi đã hoàn thiện.

---

### PHẦN II: NHÓM ĐỘ ƯU TIÊN TRUNG BÌNH (MEDIUM PRIORITY)
*Nhóm tính năng kết nối hệ sinh thái, tự động hóa kênh giao tiếp và nâng cao năng suất vận hành thực tế.*

#### 4. [IMP-04] Thông báo Đa kênh & Cảnh báo SLA (Zalo ZNS / Telegram / Slack)
*   **Mô tả:** Khi phát sinh hóa đơn rơi vào Nhóm 3 (Vượt thẩm quyền / Exceed Authority - cần CFO phê duyệt), hệ thống tự động bắn tin nhắn thông báo kèm tóm tắt và link xử lý nhanh.
*   **Hiện trạng:** Chỉ hiển thị Toaster thông báo trên màn hình web khi người dùng đang mở trình duyệt. Nếu CFO không đăng nhập thì hồ sơ sẽ bị ứ đọng.
*   **Mục tiêu sau cải tiến:** 
    *   Tích hợp Bot Telegram / Slack / Zalo Doanh nghiệp gửi thông báo: *"Cảnh báo: HĐ Tân Á Đại Thành 4.86 tỷ vượt trần K-factor đang chờ CFO phê duyệt trước kỳ thanh toán ngày 25."*
    *   Cung cấp bộ đếm thời gian cam kết SLA (ví dụ: cảnh báo hồ sơ chờ quá 24h).
*   **Đánh giá:** Giúp loại bỏ hoàn toàn tình trạng "nghẽn cổ chai" phê duyệt ở cấp lãnh đạo.

#### 5. [IMP-05] Tự động Thu nhận Hóa đơn 24/7 (Virtual Email Ingestion)
*   **Mô tả:** Cung cấp cho mỗi doanh nghiệp một hòm thư tiếp nhận hóa đơn riêng biệt (ví dụ: `tax-referee@doanhnghiep.vn`).
*   **Hiện trạng:** Kế toán phải tải file XML/PDF thủ công từ máy tính lên hệ thống.
*   **Mục tiêu sau cải tiến:** 
    *   Nhà cung cấp gửi email hóa đơn đến, dịch vụ nền (Worker / Cloud Function) tự động trích xuất file đính kèm XML/PDF, đẩy vào hàng đợi Inbox và chạy tiền kiểm ngay lập tức.
    *   Sáng hôm sau kế toán mở máy chỉ việc xem các ca bị cắm cờ ngoại lệ.
*   **Đánh giá:** Đây là bước chuyển từ "công cụ hỗ trợ" sang "hệ thống vận hành tự chủ hoàn toàn".

#### 6. [IMP-06] Xuất Dữ liệu Chuẩn hóa sang Phần mềm Kế toán VN (MISA, FAST, Bravo)
*   **Mô tả:** Xuất dữ liệu chứng từ đã được thẩm định an toàn ra các định dạng chuẩn để nhập khẩu (Import) trực tiếp vào phần mềm kế toán.
*   **Hiện trạng:** Mới chỉ xuất file JSON kỹ thuật hoặc bản in PDF giải trình. Kế toán vẫn phải mở MISA/FAST ra để gõ tay lại số liệu.
*   **Mục tiêu sau cải tiến:**
    *   Cung cấp nút: *"Xuất file nhập khẩu MISA AMIS"* (file Excel/XML cấu trúc chuẩn MISA).
    *   Hỗ trợ webhook đẩy trực tiếp chứng từ đã duyệt vào phần mềm kế toán thông qua API đối tác.
*   **Đánh giá:** Tạo ra giá trị thực tiễn khép kín luồng công việc của kế toán viên, tiết kiệm 90% thời gian nhập liệu.

#### 7. [IMP-07] Báo cáo Trực quan Hóa Tỷ lệ Tự động hóa (Touchless Metrics)
*   **Mô tả:** Xây dựng Dashboard đồ thị đo lường hiệu quả hoạt động của AI Referee theo chuẩn của AppZen.
*   **Hiện trạng:** Tab Báo cáo hiện tại mới chỉ hiển thị dạng số thẻ tĩnh (K-factor, phiên bản policy).
*   **Mục tiêu sau cải tiến:**
    *   Đồ thị tròn biểu diễn Tỷ lệ tự động hóa: Ví dụ **82% Touchless (AI tự duyệt)** vs **18% Human-in-the-Loop (Chuyển tiếp KTT/CFO)**.
    *   Biểu đồ cột phân loại nguyên nhân bị cắm cờ (Sai thuế suất 8%, Rủi ro tiền mặt > 20M, Đóng MST...).
    *   Ước tính số tiền phạt thuế tiềm ẩn mà hệ thống đã giúp doanh nghiệp phòng ngừa được.
*   **Đánh giá:** Báo cáo trực quan là công cụ thuyết phục mạnh nhất để CFO quyết định móc hầu bao mua bản quyền phần mềm.

---

### PHẦN III: NHÓM ĐỘ ƯU TIÊN CAO (HIGH PRIORITY)
*Nhóm tính năng giải quyết trực tiếp các bài toán thực tế phức tạp và tăng tốc độ xử lý của người dùng. Kế hoạch kỹ thuật & lộ trình triển khai chi tiết xem tại [plan-high-priority.md](file:///Users/xuannguyen/Desktop/Competitions/2026/MLAI%20-%20Track%202/Tax%20Referee/brainstorming/plan-high-priority.md).*

#### 8. [IMP-08] Xác thực Chi tiết đến Từng Dòng Hàng & Đa Thuế suất (Line-item Validation) — **[ĐÃ TRIỂN KHAI 100%]**
*   **Chi tiết kế hoạch & Kết quả nghiệm thu:** Xem [plan-high-priority.md](file:///Users/xuannguyen/Desktop/Competitions/2026/MLAI%20-%20Track%202/Tax%20Referee/brainstorming/plan-high-priority.md).
*   **Hiện trạng:** Đã hoàn thành. Hệ thống bóc tách `items` từ XML và Gemini multimodal OCR, đối soát số học từng dòng (`amount == quantity * unitPrice`), kiểm tra danh mục loại trừ 8% theo NQ 204/2025/QH15, phát hiện chi phí nhạy cảm và đối chiếu tổng dòng hàng vs số tiền trên Header (`mismatchHeader`). Render chi tiết trên Data Grid của [DocumentViewer.tsx](file:///Users/xuannguyen/Desktop/Competitions/2026/MLAI%20-%20Track%202/Tax%20Referee/components/DocumentViewer.tsx).

#### 9. [IMP-09] Xử lý Hàng loạt Ca Thường quy 1-Click (Bulk Confirm Routine) — **[ĐÃ TRIỂN KHAI 100%]**
*   **Chi tiết kế hoạch & Kết quả nghiệm thu:** Xem [plan-high-priority.md](file:///Users/xuannguyen/Desktop/Competitions/2026/MLAI%20-%20Track%202/Tax%20Referee/brainstorming/plan-high-priority.md).
*   **Hiện trạng:** Đã hoàn thành. Đã xây dựng API endpoint [app/api/inbox/bulk-confirm/route.ts](file:///Users/xuannguyen/Desktop/Competitions/2026/MLAI%20-%20Track%202/Tax%20Referee/app/api/inbox/bulk-confirm/route.ts) có guardrails kiểm tra ca `ROUTINE`, hạn mức 200M, ghi Batch Audit Trail. Giao diện [ProductionWorkspace.tsx](file:///Users/xuannguyen/Desktop/Competitions/2026/MLAI%20-%20Track%202/Tax%20Referee/components/ProductionWorkspace.tsx) tích hợp cột Checkbox và **Floating Bulk Action Bar** trượt lên khi có ca được chọn.

#### 10. [IMP-10] Bộ lọc Chuyên sâu & Tìm kiếm Đa tiêu chí trong Inbox — **[ĐÃ TRIỂN KHAI 100%]**
*   **Chi tiết kế hoạch & Kết quả nghiệm thu:** Xem [plan-high-priority.md](file:///Users/xuannguyen/Desktop/Competitions/2026/MLAI%20-%20Track%202/Tax%20Referee/brainstorming/plan-high-priority.md).
*   **Hiện trạng:** Đã hoàn thành. Đã phát triển component [components/InboxFilterToolbar.tsx](file:///Users/xuannguyen/Desktop/Competitions/2026/MLAI%20-%20Track%202/Tax%20Referee/components/InboxFilterToolbar.tsx) cho phép tìm kiếm tức thì không dấu (`removeAccents`), lọc theo Nhóm rủi ro (ROUTINE, Nhóm 1, Nhóm 2, Nhóm 3), lọc theo khoảng tiền (< 5M, 5M-20M, 20M-200M, > 200M), lọc theo trạng thái duyệt và nút Đặt lại bộ lọc.

---

### PHẦN IV: NHÓM ĐỘ ƯU TIÊN TỐI CAO / CỐT LÕI (CRITICAL PRIORITY)
*Nhóm tính năng sống còn, quyết định trực tiếp niềm tin của Kế toán trưởng và sự khác biệt đẳng cấp của sản phẩm so với đối thủ.*

#### 11. [IMP-11] Trình Xem Hóa đơn Gốc Song Song (Side-by-Side PDF Viewer)
*   **Mô tả:** Khi chọn một hóa đơn cần xử lý ngoại lệ, màn hình tự động chia làm 2 nửa: Cột bên trái hiển thị toàn bộ bản thể hiện PDF/Ảnh scan hóa đơn gốc (hỗ trợ zoom, xoay); Cột bên phải hiển thị bảng phân tích của AI Referee và Thẻ Phán quyết A/B.
*   **Vì sao tối quan trọng?** 
    *   Tâm lý của Kế toán trưởng và CFO là **"Mắt thấy tai nghe"**. Họ không bao giờ dám bấm phê duyệt một khoản tiền hàng trăm triệu chỉ dựa trên các dòng chữ text trích xuất mà không nhìn thấy hóa đơn gốc có đúng tên công ty, đúng con dấu và chữ ký số hay không.
    *   Việc phải tải file về máy rồi mở ứng dụng đọc PDF riêng làm gián đoạn dòng chảy công việc (Context switching).
*   **Giải pháp kỹ thuật:** Tích hợp `react-pdf` hoặc `pdfjs-dist` nhúng trực tiếp trình đọc PDF chuyên nghiệp vào giao diện Inbox.

#### 12. [IMP-12] Bộ nhớ Tiền lệ & Vòng Tự học (AI Feedback Loop / Zenlearn)
*   **Mô tả:** Cơ chế lưu vết và học từ tiền lệ phê duyệt của lãnh đạo để xây dựng "Danh sách Ngoại lệ Doanh nghiệp chấp thuận" (Corporate Exception Memory).
*   **Vì sao tối quan trọng?**
    *   Hiện tại, nếu CFO bấm *Chấp nhận điều chỉnh* cho một hóa đơn vi phạm nhẹ của nhà cung cấp A, thì tháng sau khi nhà cung cấp A xuất hóa đơn tương tự, AI vẫn cắm cờ đỏ và bắt CFO phải trả lời lại đúng câu hỏi đó.
    *   Điều này khiến lãnh đạo cảm thấy hệ thống "máy móc, rập khuôn và làm phiền".
*   **Giải pháp kỹ thuật:**
    *   Khi CFO duyệt phương án ghi đè (Override), hệ thống cho phép tích chọn: *"Áp dụng tiền lệ này cho nhà cung cấp [Tên NCC] trong 6 tháng tới"*.
    *   Lần sau tiếp nhận hóa đơn của NCC này, AI sẽ tự động phân loại vào nhóm ngoại lệ đã được duyệt (Approved Precedent), tự động thông qua và chỉ ghi chú trong nhật ký kiểm toán mà không ngắt quy trình của sếp.

#### 13. [IMP-13] Phát hiện Hóa đơn Trùng lặp & Gian lận Kê khai (Duplicate Invoice Check)
*   **Mô tả:** Tự động phát hiện trường hợp một hóa đơn bị nộp 2 lần (cố tình hoặc vô ý) qua email, scan hoặc nhập tay.
*   **Vì sao tối quan trọng?**
    *   Đây là một trong những rủi ro thuế nghiêm trọng nhất tại Việt Nam: Kê khai trùng hóa đơn đầu vào dẫn đến khai khống thuế GTGT được khấu trừ. Khi thanh tra phát hiện, doanh nghiệp bị phạt rất nặng tội trốn thuế/gian lận thuế.
    *   Các hệ thống lớn như AppZen luôn đặt bộ lọc **Duplicate Detection** ở cổng đầu tiên.
*   **Giải pháp kỹ thuật:**
    *   Tạo chỉ mục duy nhất kết hợp: `Mã số thuế bán hàng + Ký hiệu mẫu số + Số hóa đơn + Ngày lập`.
    *   Tạo mã băm nội dung hóa đơn (Content Hash). Nếu phát hiện trùng lặp, lập tức cắm cờ đỏ cảnh báo: *"Hóa đơn này đã được tiếp nhận và xử lý vào ngày dd/mm/yyyy trong hồ sơ [Mã hồ sơ]"*.

---

## LỘ TRÌNH THỰC THI KHUYẾN NGHỊ (ROADMAP)

```
        THÁNG 1: HOÀN THIỆN CỐT LÕI (CRITICAL & HIGH)
        ├── [IMP-13] Duplicate Invoice Check (3 ngày)
        ├── [IMP-09] Bulk Confirm Routine (2 ngày)
        ├── [IMP-10] Bộ lọc nâng cao & Search (3 ngày)
        ├── [IMP-11] Side-by-Side PDF Viewer (1 tuần)
        └── [IMP-12] AI Feedback Loop / Tiền lệ ngoại lệ (1.5 tuần)
                         │
                         ▼
        THÁNG 2: MỞ RỘNG VẬN HÀNH & KẾT NỐI (HIGH & MEDIUM)
        ├── [IMP-08] Line-item Level Validation đa thuế suất (1.5 tuần)
        ├── [IMP-06] Xuất dữ liệu chuẩn sang MISA / FAST (1 tuần)
        ├── [IMP-07] Báo cáo Touchless Automation Rate (4 ngày)
        └── [IMP-04] Thông báo đa kênh Zalo / Telegram / Slack (1 tuần)
                         │
                         ▼
        THÁNG 3: TỰ ĐỘNG HÓA HOÀN TOÀN & BẢO MẬT (MEDIUM & LOW)
        ├── [IMP-05] Virtual Email Ingestion 24/7 (1.5 tuần)
        ├── [IMP-03] Ký số HSM / Token lên Hồ sơ giải trình (2 tuần)
        └── [IMP-02] Thí nghiệm Khớp 3 bên PO - Kho (3 tuần)
```

---
*Tài liệu được biên soạn và lưu trữ độc lập tại thư mục `brainstorming/` phục vụ công tác nâng cấp và phát triển thương mại hóa dự án Tax Referee.*
