# KẾ HOẠCH TÁI CẤU TRÚC, LƯỢC GIẢM VÀ CHUẨN HÓA MÃ NGUỒN CHO ĐỀ BÀI A
## DỰ ÁN: TAX REFEREE — THE ESCALATION REFEREE
### Căn cứ: Challenge Brief OrganizationAI VN & Thang điểm 100 Vòng Chung kết (17/10/2026)

---

## 1. MỤC TIÊU & TÔN CHỈ CHIẾN LƯỢC (NORTH STAR)

### 1.1. Mục tiêu duy nhất: Đạt điểm tối đa trên Thang điểm 100
Mọi dòng mã nguồn được giữ lại hoặc bổ sung trong giai đoạn này phải trực tiếp phục vụ việc ghi điểm trong **8 phút chấm thi của Ban giám khảo**:
- **Khả năng vận hành (40 điểm):**
  - URL trực tuyến truy cập được ngay, **không cần tạo tài khoản, không cần cài đặt** (10đ).
  - Bấm nút **Verify** 1-click: chạy tự động và in bảng kết quả đạt/không đạt kèm timestamp (12đ).
  - Xử lý mượt mà **2 dữ liệu đầu vào mới của Giám khảo** (8đ).
  - 5 Slide thuyết trình chuẩn cấu trúc + Video demo dưới 3 phút (10đ).
- **Người dùng thực tế & Tổ chức thực tế (20 điểm):**
  - 3 nhân sự thật (KTV, KTT, CFO) + Trích dẫn nguyên văn phản hồi (10đ).
  - 1 thay đổi cụ thể trong code từ phản hồi + 1 bất cập thực tế phát sinh (10đ).
- **Vai trò con người & Nhật ký kiểm toán (20 điểm):**
  - Điểm quyết định con người ở Slide 2 khớp với hệ thống (6đ).
  - Tra cứu Audit Log hành động bất kỳ (thao tác, thời gian, input, lý do) (6đ).
  - Nút **Can thiệp dừng và Ghi đè (Override / Undo)** hoạt động hiệu quả (4đ).
  - Hệ thống giải thích quyết định dễ hiểu cho người không chuyên (4đ).
- **Kiểm thử xác thực Đề bài A (20 điểm):**
  - Phát hiện đúng 2 ca cần chuyển tiếp và phân loại chính xác 3 nhóm rủi ro (8đ).
  - Xử lý tự động hoàn toàn 3 ca thường quy đơn giản (6đ).
  - Chất lượng câu hỏi chuyển tiếp cụ thể, ra quyết định ngay không cần xem lại hồ sơ gốc (6đ).

### 1.2. Tôn chỉ: "Thà làm ít tính năng mà hoàn hảo tuyệt đối, còn hơn làm nhiều tính năng nhưng dở dang hoặc sai nghiệp vụ"
- **Loại bỏ triệt để Scope Creep của Đề bài B (ERP toàn diện):** Tax Referee không phải là MISA hay FAST. Tax Referee là **Trọng tài chuyển tiếp thông minh (The Escalation Referee)**.

---

## 2. BẢNG KIỂM KÊ & ĐỊNH HƯỚNG TÁI CẤU TRÚC MÃ NGUỒN

| Thành phần mã nguồn | Hiện trạng | Vấn đề so với Đề bài A | Hành động đề xuất |
|---|---|---|:---:|
| **Trang chủ (`app/page.tsx`)** | Yêu cầu đăng nhập mật khẩu (`accountant-local`, `ktt-local`...) | Vi phạm Tiêu chí 1: *"truy cập URL và thao tác ngay, không cần tài khoản, không cài đặt"* (mất 4-10 điểm). | **SỬA NGAY**: Thêm chế độ *"Vào trải nghiệm ngay (Chế độ Giám khảo)"* vào thẳng Workspace chỉ với 1 click, tự động gán role CFO/KTT. |
| **Bộ kiểm thử Verify (`app/api/verify`, `VerifyHarness.tsx`)** | Đang query bảng `invoices` trong SQLite (số lượng tùy thuộc dữ liệu đã upload, không cố định). | Đề bài A yêu cầu: **Đúng 5 ca (3 Routine, 2 Escalated)**; Tiêu chí 2 yêu cầu: **4 ca kiểm thử chung**. Hiện tại kết quả có thể ra 50 ca gây rối bảng kết quả. | **SỬA NGAY**: Đóng gói cố định bộ 5 ca chuẩn (3 Routine, 2 Escalated) vào tệp fixture riêng; thêm tab kiểm tra nhanh 90 giây; hiển thị rõ timestamp và câu hỏi A/B. |
| **Giao diện Workspace (`ProductionWorkspace.tsx`)** | Có quá nhiều tab: `reconciliation`, `banking`, `suppliers`, `reports`, `receive`, `inbox`, `approval`, `dossier`... | Quá tải thị giác (cognitive overload). Giám khảo trong 8 phút không biết bấm vào đâu, dễ bị phân tâm khỏi tính năng Escalation. | **LƯỢC GIẢM**: Tinh gọn thanh điều hướng thành **4 phân hệ cốt lõi** bám sát thang điểm. |
| **Đối soát cổng TCT (`reconciliation/`)** | Giao diện riêng mô phỏng đồng bộ hàng trăm hóa đơn từ TCT. | Thuộc Đề bài B (quá trình đối chiếu cuối tháng của kế toán). | **LƯỢC GIẢM**: Chuyển thành một card thông tin nhỏ trong màn hình Thẩm định, không để thành tab độc lập cồng kềnh. |
| **Đối soát sổ phụ (`banking/`)** | Giao diện riêng quản lý tài khoản ngân hàng và sao kê. | Làm phức tạp hóa hệ thống không cần thiết. | **LƯỢC GIẢM**: Tích hợp trực tiếp thành tính năng "Đối chiếu chứng từ thanh toán" ngay tại thẻ hóa đơn đang xét. |
| **Nhật ký kiểm toán (`AuditTrailTable.tsx`)** | Đã có chuỗi băm Merkle SHA-256. | Cần thêm tính năng bấm vào 1 bản ghi bất kỳ để **Xem chi tiết lý do** và nút **Thử nghiệm Hoàn tác/Ghi đè (Undo/Override)** theo đúng kịch bản phút 6:30 - 7:30. | **NÂNG CẤP**: Bổ sung modal chi tiết kiểm toán và nút thao tác trực quan. |
| **Bộ máy quy tắc (`policyEngine.ts`, `jevService.ts`)** | Đã sửa xong 4 lỗi P0 (P0-1 -> P0-4). | Đang hoạt động rất tốt, cần giữ nguyên tính tất định và thứ tự ưu tiên: `STATUTORY` > `DATA_QUALITY` > `INTERNAL_POLICY` > `AUTHORITY`. | **GIỮ NGUYÊN & BẢO VỆ**. |
| **Quản lý tiền lệ (`precedentService.ts`, `precedents/route.ts`)** | Đã có Tường lửa tiền lệ (Precedent Firewall) chặn luật cứng. | Cần hiển thị bảng thống kê các tiền lệ đang áp dụng và tỷ lệ thích ứng ngưỡng rủi ro cho Giám khảo xem. | **NÂNG CẤP NHẸ**: Thêm widget hiển thị các tiền lệ đang có hiệu lực. |

---

## 3. KẾ HOẠCH LƯỢC GIẢM & TINH GỌN (PRUNING PLAN)

### 3.1. Tinh giản cấu trúc Menu Điều hướng (Sidebar Navigation)
Hiện tại hệ thống có 8 tab phân tán. Sẽ gom lại thành **4 thẻ duy nhất**, mỗi thẻ tương ứng với một trọng số điểm của Ban Giám Khảo:

```text
CŨ (8 tab rải rác):
[Tiếp Nhận] -> [Chờ Duyệt] -> [Đã Xử Lý] -> [Báo Cáo Thuế] -> [Đối Soát TCT] -> [Sổ Phụ NH] -> [Nhà Cung Cấp] -> [Verify]

MỚI (4 Phân hệ Chiến lược chuẩn hóa theo Đề bài A):
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 1. BÀN LÀM VIỆC ĐIỀU PHỐI (ESCALATION WORKSPACE)                                       │
│    - Tiếp nhận hóa đơn kéo thả / XML / PDF                                             │
│    - Hóa đơn thường quy tự động xử lý (STP)                                            │
│    - Hóa đơn rủi ro dừng lại hiển thị Thẻ Escalation Card (A/B Action)                 │
│                                                                                        │
│ 2. BỘ CÔNG CỤ XÁC THỰC 90 GIÂY (VERIFY & BENCHMARK) - [TIÊU CHÍ 2 & 7: 32 ĐIỂM]       │
│    - 1-Click Verify: Chạy 5 ca chuẩn mực Đề bài A (3 Routine, 2 Escalated)             │
│    - Sandbox thử nghiệm dữ liệu mới của Giám khảo (Test with Judge New Inputs)         │
│    - Báo cáo độ chính xác Sprint 2: False Negative (0%), False Positive (7.7%), STP    │
│                                                                                        │
│ 3. NHẬT KÝ KIỂM TOÁN & GHI ĐÈ CON NGƯỜI (AUDIT & HUMAN OVERRIDE) - [TIÊU CHÍ 6: 20 ĐIỂM]│
│    - Chuỗi băm Merkle SHA-256 bất biến của từng sự kiện                                │
│    - Tra cứu chi tiết: Ai làm, lúc nào, dữ liệu gì, lý do pháp lý nào                  │
│    - Nút can thiệp dừng khẩn cấp và nút Hoàn tác quyết định (Undo / Override)          │
│                                                                                        │
│ 4. HỌC TIỀN LỆ & HỒ SƠ NGƯỜI DÙNG (LEARNING & REAL EVIDENCE) - [TIÊU CHÍ 5: 20 ĐIỂM]   │
│    - Tường lửa tiền lệ (Chỉ học chính sách nội bộ, cấm học luật cứng)                  │
│    - Danh sách 3 nhân sự thực tế (KTV, KTT, CFO) và trích dẫn phản hồi                 │
│    - Minh chứng 1 điểm cải tiến từ phản hồi và 1 bất cập thực tế phát sinh             │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 3.2. Đóng băng các tính năng Scope Creep
1. **Không mở rộng màn hình TCT Reconciliation phức tạp:** Dữ liệu hóa đơn từ cổng thuế được coi là một nguồn đầu vào được nạp qua tệp XML/Excel, không cố gắng tạo giao diện ERP giả lập.
2. **Không mở rộng màn hình Banking độc lập:** Thông tin sao kê ngân hàng đối ứng (để kiểm tra ngưỡng 5 triệu) được tích hợp trực tiếp vào trường dữ liệu của hóa đơn đang kiểm tra.
3. **Không làm báo cáo thuế phức tạp ngoài phạm vi:** Giữ bản nháp bảng kê hóa đơn mua vào có cảnh báo trung thực; không làm hóa đơn bán ra hay tờ khai nộp eTax.

---

## 4. KẾ HOẠCH CHỈNH SỬA & NÂNG CẤP CHỨC NĂNG TRỌNG TÂM

### 4.1. Hạng mục 1: Trải nghiệm Giám khảo không cần mật khẩu (Instant Judge Mode)
- **Tập tin tác động:** [app/page.tsx](../app/page.tsx)
- **Công việc:**
  - Ngay trên đầu trang chủ, thêm một nút lớn nổi bật: **"TRẢI NGHIỆM NHANH DÀNH CHO GIÁM KHẢO (1-CLICK KHÔNG CẦN TÀI KHOẢN)"**.
  - Khi Giám khảo bấm vào, hệ thống tự động đăng nhập vai trò Kế toán trưởng / CFO và đưa thẳng vào màn hình làm việc.
  - Thêm nút tắt dẫn trực tiếp sang **`/verify`** với chú thích: *"Chạy bộ kiểm thử tự động 90 giây theo Đề bài A"*.

### 4.2. Hạng mục 2: Tinh chỉnh Bộ công cụ Verify chuẩn hóa Đề bài A
- **Tập tin tác động:** [app/api/verify/route.ts](../app/api/verify/route.ts), [components/VerifyHarness.tsx](../components/VerifyHarness.tsx), [data/verification/manifest.json](../data/verification/manifest.json)
- **Công việc:**
  - Tách bạch rõ 2 chế độ kiểm thử:
    1. **Tab 1: Kiểm thử 5 Ca Đề bài A (Benchmark 90 giây):**
       - Đúng 5 ca chuẩn mực: **3 ca ROUTINE** (xử lý tự động hoàn toàn) và **2 ca ESCALATED** (chuyển tiếp kèm câu hỏi A/B).
       - In bảng kết quả đạt/không đạt kèm dấu thời gian thực (real timestamp).
       - Hiển thị đầy đủ câu hỏi cụ thể và lý do phân loại cho 2 ca chuyển tiếp.
    2. **Tab 2: Hộp cát kiểm thử dữ liệu mới của Giám khảo (Judge Sandbox):**
       - Cung cấp sẵn 2 nút nạp nhanh dữ liệu mẫu chưa từng thấy (1 ca hợp lệ thường quy, 1 ca bất thường biên vi phạm thanh toán tiền mặt hoặc thuế 8%) để Giám khảo kiểm tra xem hệ thống có dừng đúng lúc không.
  - Bổ sung bảng đo lường các chỉ số Sprint 2:
    - Tỷ lệ bỏ sót ca cần dừng (False Negative): 0.0%
    - Tỷ lệ chuyển tiếp thừa (False Positive): 7.7%
    - Tỷ lệ xử lý thẳng (STP Rate): 92.3%

### 4.3. Hạng mục 3: Nâng cấp Màn hình Audit Trail & Nút Can thiệp dừng / Hoàn tác
- **Tập tin tác động:** [components/AuditTrailTable.tsx](../components/AuditTrailTable.tsx), [app/api/audit/route.ts](../app/api/audit/route.ts)
- **Công việc:**
  - Đảm bảo phục vụ hoàn hảo cho **phút thứ 6:30 - 7:30** của Giám khảo:
    1. Giám khảo bấm vào một dòng sự kiện bất kỳ -> Mở modal chi tiết hiển thị: *Ai thực hiện, Thời điểm chính xác, Dữ liệu đầu vào, Căn cứ pháp lý, Mã băm SHA-256 liên kết*.
    2. Nút **"Can thiệp Ghi đè / Dừng khẩn cấp" (Human Override / Emergency Stop)**: Cho phép con người lật ngược phán quyết của hệ thống kèm lý do ghi đè, hệ thống ngay lập tức tạo một khối băm kiểm toán mới.
    3. Nút **"Giải thích cho người không chuyên" (Plain Explanation)**: Hiển thị giải thích dễ hiểu, không dùng thuật ngữ kỹ thuật phức tạp.

### 4.4. Hạng mục 4: Đóng gói Bảng Người dùng Thực tế & Bất cập Phát sinh
- **Tập tin tác động:** [components/ProductionWorkspace.tsx](../components/ProductionWorkspace.tsx) (Tab Học tiền lệ & Khảo sát thực tế)
- **Công việc:**
  - Hiển thị trực quan hồ sơ của 3 nhân sự thực tế (Kế toán viên Mai, Kế toán trưởng Đức, CFO Nam) kèm ảnh đại diện/chức danh và trích dẫn nguyên văn phản hồi.
  - Nêu rõ đối chiếu Trước/Sau khi có phản hồi của KTT Đức: Cải tiến quy tắc rượu bia từ cấm đoán cứng sang phân loại dòng hàng.
  - Nêu trung thực bất cập phát sinh khi hóa đơn bị treo và tính năng hạn xử lý SLA.

---

## 5. KỊCH BẢN CHUẨN BỊ CHO PHIÊN CHẤM 8 PHÚT CỦA GIÁM KHẢO

Kế hoạch tái cấu trúc phải bảo đảm Giám khảo trải nghiệm hoàn hảo từng phút theo quy định:

```text
THỜI GIAN         THAO TÁC CỦA GIÁM KHẢO                  HỆ THỐNG PHẢN HỒI TƯƠNG ỨNG
───────────────────────────────────────────────────────────────────────────────────────────
Phút 0:00–1:00   Truy cập link trực tuyến                Trang chủ mở ngay. Bấm 1 nút "Vào Workspace Giám khảo",
                                                         không cần gõ tài khoản/mật khẩu. (Ăn trọn 10 điểm)

Phút 1:00–3:00   Bấm vào nút "Verify"                    Hệ thống chạy tự động, in bảng kết quả có timestamp thực,
                                                         hiển thị 100% Schema Valid trong 20ms. (Ăn trọn 12 điểm)

Phút 3:00–5:00   Nạp 2 dữ liệu mới của Giám khảo         Kéo thả 2 tệp hóa đơn mới vào ô tiếp nhận. Hệ thống bóc
                                                         tách và dừng đúng lúc nếu có lỗi. (Ăn trọn 8 điểm)

Phút 5:00–6:30   Kiểm tra 90s Đề bài A (Verify Escalation) Chạy 5 ca: hiển thị đúng 3 Routine tự động duyệt, 
                                                         2 ca Escalated dừng lại với câu hỏi A/B. (Ăn trọn 20 điểm)

Phút 6:30–7:30   Tra cứu Audit Trail & Thử nút Ghi đè    Bấm vào 1 dòng log kiểm tra chuỗi SHA-256. Thử bấm nút 
                                                         "Ghi đè phán quyết", hệ thống cập nhật tức thì. (Ăn trọn 20 điểm)

Phút 7:30–8:00   Giám khảo chấm điểm                     Tổng kết điểm cao trên toàn bộ các tiêu chí.
```

---

## 6. LỘ TRÌNH THỰC THI CHI TIẾT TỪNG BƯỚC (SPRINT 2 ROADMAP)

### Bước 1: Chuẩn hóa Bộ kiểm thử Đề bài A (Tiêu chí 2 & 7)
- Cập nhật [data/verification/manifest.json](../data/verification/manifest.json) và [app/api/verify/route.ts](../app/api/verify/route.ts) để tách biệt rõ:
  - 5 ca kiểm thử Đề bài A: Đúng 3 ca `ROUTINE` và 2 ca `ESCALATED` cố định, có câu hỏi A/B rõ ràng.
  - Tích hợp 2 ca kiểm thử mới cho Giám khảo thử nghiệm trực tiếp.
- Cập nhật [components/VerifyHarness.tsx](../components/VerifyHarness.tsx) hiển thị các KPI: Tỷ lệ Schema, Thời gian thực thi, False Negative (0%), False Positive (7.7%), STP Rate (92.3%).

### Bước 2: Tối ưu Trang chủ & Trải nghiệm Đăng nhập (Tiêu chí 1)
- Cập nhật [app/page.tsx](../app/page.tsx): Thêm nút "Vào Workspace Giám khảo (1-Click Không cần mật khẩu)".
- Thiết lập đường dẫn nhanh `/verify` trên thanh điều hướng đầu trang.

### Bước 3: Lược giảm và Tái cấu trúc Giao diện Workspace
- Tinh giản Sidebar trong [components/ProductionWorkspace.tsx](../components/ProductionWorkspace.tsx) về 4 phân hệ chính.
- Ẩn các tab phụ gây loãng (`reconciliation`, `banking`, `reports`) vào các thành phần tích hợp trực tiếp trên thẻ hồ sơ.

### Bước 4: Hoàn thiện tính năng Can thiệp dừng & Hoàn tác trên Audit Trail (Tiêu chí 6)
- Cập nhật [components/AuditTrailTable.tsx](../components/AuditTrailTable.tsx): Thêm modal xem bằng chứng kiểm toán chi tiết và nút Ghi đè phán quyết (Override Action).

### Bước 5: Đóng gói Hồ sơ Thuyết trình & Đo lường (Tiêu chí 4 & 5)
- Chuẩn bị nội dung cho bộ 5 Slide thuyết trình theo đúng khung quy định (nhấn mạnh Slide 2: Human-in-the-loop, Slide 3: Đo lường tác động, Slide 5: Giới hạn & rủi ro).
- Viết kịch bản Video Demo sản phẩm dưới 3 phút.
- Soạn thảo tài liệu Nhật ký phát triển (Build Log) độ dài 1 trang A4.

---

## 7. BỘ KIỂM THỬ NGHIỆM THU (ACCEPTANCE TEST SUITE)

Sau khi hoàn tất tái cấu trúc, toàn bộ các bài kiểm tra sau phải vượt qua 100%:
1. `npm run test:phase0`: 30/30 ca an toàn pháp lý đạt chuẩn (Pass).
2. `npm run test:phase1:sprint1`: 17/17 ca phân luồng và câu hỏi A/B đạt chuẩn (Pass).
3. `npm run test:phase1:sprint2`: 24/24 ca kiểm soát tiền lệ đạt chuẩn (Pass).
4. `npm run test:phase1:sprint3`: 42/42 ca đa dạng loại hình hóa đơn đạt chuẩn (Pass).
5. `GET /api/verify`: Trả về đúng 5 ca chuẩn mực của Đề bài A (3 Routine, 2 Escalated) kèm timestamp và `allSchemaValid: true`.
6. `npx tsc --noEmit`: 0 lỗi biên dịch TypeScript.
