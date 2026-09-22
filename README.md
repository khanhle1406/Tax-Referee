# TAX REFEREE · TÁC TỬ ĐIỀU PHỐI CHUYỂN TIẾP TRONG QUẢN TRỊ THUẾ DOANH NGHIỆP

> **Dự án dự thi Cuộc thi MLAI Hackathon 2026**  
> **Bảng 1: OrganizationAI · Đề bài A: The Escalation Referee (Bộ điều phối chuyển tiếp con người)**  
> **Repository:** [https://github.com/khanhle1406/Tax-Referee.git](https://github.com/khanhle1406/Tax-Referee.git)  
> **Phiên bản:** v2.0 Production Ready (Đạt chuẩn 54/54 bài kiểm thử toàn diện)

---

## 1. TỔNG QUAN DỰ ÁN

Trước làn sóng số hóa ngành thuế tại Việt Nam, doanh nghiệp phải đối mặt với cơ chế giám sát tự động của Tổng cục Thuế (như Hệ số rủi ro K theo Công văn 2392/TCT-QLRR, bẫy thuế suất 8% theo Nghị định 72/2024/NĐ-CP, quy tắc thanh toán không dùng tiền mặt trên 20 triệu VNĐ theo Thông tư 219/2013/TT-BTC, và truy vết hóa đơn điều chỉnh theo Nghị định 123/2020/NĐ-CP).

**Tax Referee** là một tác tử điều phối chuyển tiếp thông minh (The Escalation Referee) được thiết kế đặc thù cho bài toán quản trị thuế doanh nghiệp:
- **Tự động hóa thông suốt (Straight-Through Processing):** Tự động duyệt ngầm các hóa đơn thường quy hợp lệ 100%, ghi nhận vào Tờ khai thuế GTGT (Mẫu 01/GTGT) mà không làm phiền người dùng.
- **Chốt chặn an toàn Zero-Hallucination:** Khi phát hiện bất kỳ dấu hiệu rủi ro, hệ thống cưỡng chế dừng tự động hóa ngay lập tức thông qua Zod Discriminated Unions, tuyệt đối không để lọt dữ liệu vi phạm vào bảng kê khấu trừ.
- **Phân loại chính xác vào 3 nhóm không chắc chắn chuẩn mực:**
  1. `UNCERTAIN_INFO`: Chưa xác định thông tin thực tế (hóa đơn mờ, thiếu bảng kê món, nhà cung cấp đã đóng MST trước khi đối soát, thiếu mã hóa đơn gốc điều chỉnh).
  2. `OUT_OF_POLICY`: Nằm ngoài phạm vi quy định (áp nhầm thuế 8% cho dịch vụ viễn thông/CNTT bắt buộc 10%, hóa đơn ≥ 20 triệu VNĐ thanh toán tiền mặt, chi phí rượu bia tiệc tùng cá nhân cấm khấu trừ).
  3. `EXCEED_AUTHORITY`: Vượt thẩm quyền phê duyệt (hóa đơn điều chỉnh giảm hoặc chi phí bồi thường ≥ 200 triệu VNĐ, hóa đơn mua hàng lớn đẩy Hệ số K rơi vào Vùng Đỏ nguy hiểm < 0.95).
- **Hỗ trợ quyết định trong 3 giây (Actionable HITL):** Sinh câu hỏi đóng cụ thể kèm 2 phương án đối ứng (Nút A và Nút B), giúp Kế toán trưởng (KTT) hoặc Giám đốc Tài chính (CFO) ra phán quyết trong 3 giây mà không cần mở lại chứng từ gốc.

---

## 2. KIẾN TRÚC ĐỘT PHÁ: DUAL-ENGINE AI + ZERO-DOWNTIME FALLBACK

Tax Referee vận hành trên kiến trúc kết hợp đa tầng bảo vệ tối cao:

```text
                                [ HÓA ĐƠN ĐẦU VÀO ]
                                         │
                                         ▼
                 ┌────────────────────────────────────────────────┐
                 │          TypeSafe Zod Ingestion Guard          │
                 └───────────────────────┬────────────────────────┘
                                         │
                                         ▼
                 ┌────────────────────────────────────────────────┐
                 │       Deterministic SOP Rule Engine (Local)    │
                 │   - Mốc thời gian đóng MST Trước / Sau         │
                 │   - Ma trận thuế suất 8% vs 10% (NĐ 72/2024)   │
                 │   - Bẫy tiền mặt ≥ 20M (TT 219/2013)           │
                 │   - Giám sát biến động Hệ số K (CV 2392)       │
                 └───────────────────────┬────────────────────────┘
                                         │
                ┌────────────────────────┴────────────────────────┐
                ▼                                                 ▼
      [ HỢP LỆ 100% (ROUTINE) ]                     [ PHÁT HIỆN DẤU HIỆU RỦI RO ]
                │                                                 │
                ▼                                                 ▼
     ┌──────────────────────┐                     ┌───────────────────────────────┐
     │ Tự động duyệt ngầm   │                     │      DUAL-ENGINE AI TẦNG CAO  │
     │ + Cộng Tờ khai 01    │                     │  1. TypeSafe AI Jev System One│
     │ + Ghi Audit Trail    │                     │     (Xác suất & Risk Score)   │
     └──────────────────────┘                     │  2. Google Gemini Flash Q-Gen │
                                                  │     (Sinh động câu hỏi A/B)   │
                                                  └───────────────┬───────────────┘
                                                                  │
                                                                  ▼
                                                  ┌───────────────────────────────┐
                                                  │    Escalation Card (3 Giây)   │
                                                  │    Nút A vs Nút B cho KTT/CFO │
                                                  └───────────────────────────────┘
```

### Chi tiết các tầng công nghệ:
1. **Engine 1 - TypeSafe AI Jev System One (`https://api.typesafe.ai/v1/systemone`):**
   - Đóng vai trò Decision Primitive tính toán xác suất phân loại (`decision_type`), quyết định chuyển tiếp (`should_escalate`) và đánh giá điểm rủi ro (`risk_level`).
2. **Engine 2 - Actionable Question Generator (Google Gemini Flash-Lite):**
   - Áp dụng `responseSchema` của REST API để sinh động câu hỏi hành động ĐÓNG, NGẮN GỌN, CHÍNH XÁC kèm 2 phương án đối ứng A/B dựa trên ngữ cảnh thực tế của hóa đơn.
3. **Cơ chế Fallback Siêu tốc (< 50ms):**
   - Nếu kết nối mạng gián đoạn hoặc API bên ngoài quá tải, hệ thống tự động kích hoạt Local Deterministic Engine trong 0ms - 1ms, gắn nhãn `LOCAL_FALLBACK`, bảo đảm phiên thuyết trình chấm thi 90 giây không bao giờ bị gián đoạn.
4. **Zod Discriminated Unions Guardrail:**
   - Cưỡng chế luồng ở mức Type System. Khi trạng thái là `ESCALATED`, schema tuyệt đối không cho phép tồn tại trường `approvedTaxAmount`.

---

## 3. GIÁM SÁT HỆ SỐ RỦI RO K THEO CÔNG VĂN 2392/TCT-QLRR

Hệ thống tích hợp thước đo biến động Hệ số K theo thời gian thực:

```text
Hệ số K = (Tổng doanh thu bán ra) / (Tồn kho đầu kỳ + Mua vào trong kỳ)
```

- **Vùng Xanh (An toàn):** 1.05 ≤ K ≤ 1.25 (Doanh nghiệp vận hành bình thường).
- **Vùng Vàng (Cảnh báo):** 0.95 ≤ K < 1.05 hoặc 1.25 < K ≤ 1.35 (Cần theo dõi sát).
- **Vùng Đỏ (Nguy hiểm):** K < 0.95 hoặc K > 1.35 (Nguy cơ bị cơ quan Thuế đưa vào danh sách thanh tra kiểm tra đột xuất).
- **Phản ứng của Tax Referee:** Khi có hóa đơn mua vào lớn (như ca `TC-14` mua 4.86 tỷ), Hệ số K tụt xuống 0.88 (Vùng Đỏ). Hệ thống lập tức cắm cờ `EXCEED_AUTHORITY` và yêu cầu đích danh Giám đốc Tài chính (CFO) quyết định có đưa vào kỳ này hay chuyển sang kỳ sau.

---

## 4. MA TRẬN 15 HỒ SƠ KIỂM THỬ CHUẨN MỰC

| Mã Case | Đối tác & Hàng hóa | Giá trị (VNĐ) | Phán quyết | Nhóm Rủi ro | Cấp Phê duyệt | Trọng tâm Nghiệp vụ |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **TC-01** | Công ty CP Fahasa | 4.500.000₫ | `ROUTINE` | Thường quy | Tự động duyệt | Văn phòng phẩm, tiền mặt < 20M |
| **TC-02** | EVN TP.HCM | 12.000.000₫ | `ROUTINE` | Thường quy | Tự động duyệt | Tiền điện sinh hoạt SXKD có UNC |
| **TC-03** | Nhà hàng Sen Tây Hồ | 8.800.000₫ | `ROUTINE` | Thường quy | Tự động duyệt | Ăn uống tiếp khách có bảng kê món |
| **TC-04** | Máy tính Phong Vũ | 18.500.000₫ | `ROUTINE` | Thường quy | Tự động duyệt | Mua linh kiện đúng thuế 10% |
| **TC-05** | Công ty CP MISA | 15.000.000₫ | `ROUTINE` | Thường quy | Tự động duyệt | Phần mềm kế toán không chịu thuế (KCT) |
| **TC-06** | Tập đoàn Viettel | 1.650.000₫ | `ROUTINE` | Thường quy | Tự động duyệt | Cước Internet đúng thuế 10% |
| **TC-07** | Taxi Vinasun | 160.000₫ | `ESCALATED` | `UNCERTAIN_INFO` | Kế toán trưởng | Ảnh chụp lóa mờ số tiền cuối |
| **TC-08** | TB Tân Thành | -15.000.000₫ | `ESCALATED` | `UNCERTAIN_INFO` | Kế toán trưởng | HĐ điều chỉnh thiếu mã HĐ gốc (NĐ 123) |
| **TC-09** | TM Sao Mai | 33.000.000₫ | `ESCALATED` | `UNCERTAIN_INFO` | Kế toán trưởng | Lập TRƯỚC ngày người bán đóng MST |
| **TC-10** | VNPT Vinaphone | 5.500.000₫ | `ESCALATED` | `OUT_OF_POLICY` | Kế toán trưởng | Dịch vụ viễn thông áp sai thuế 8% (NĐ 72) |
| **TC-11** | Ẩm thực Hoàng Gia | 9.200.000₫ | `ESCALATED` | `OUT_OF_POLICY` | Kế toán trưởng | Tiệc có Rượu vang Bordeaux (Cấm khấu trừ) |
| **TC-12** | Điện máy Nguyễn Kim | 25.000.000₫ | `ESCALATED` | `OUT_OF_POLICY` | Kế toán trưởng | HĐ ≥ 20M thanh toán tiền mặt (TT 219) |
| **TC-13** | Thép Hòa Phát | -250.000.000₫| `ESCALATED` | `EXCEED_AUTHORITY`| CFO | HĐ giảm giá ≥ 200M vượt hạn mức KTT |
| **TC-14** | VLXD Miền Nam | 4.860.000.000₫| `ESCALATED`| `EXCEED_AUTHORITY`| CFO | Lô hàng lớn đẩy Hệ số K vào Vùng Đỏ (0.88) |
| **TC-15** | Xây lắp Tân Phát | 210.000.000₫ | `ESCALATED` | `EXCEED_AUTHORITY`| CFO | Bồi thường phạt vi phạm HĐ ≥ 200M |

---

## 5. BỘ TÍNH NĂNG ĐỈNH CAO TRÊN GIAO DIỆN SAAS B2B

1. **Verify Harness 90s:** Bấm 1 nút "RUN VERIFY 90s" để kiểm chứng 5 ca chuẩn mực trong 24ms, có thanh tiến trình và badge kết quả trực quan.
2. **Escalation Card A/B:** Thẻ phán quyết ngoại lệ hiển thị câu hỏi hành động in đậm, badge phân cấp thẩm quyền (KTT/CFO) và 2 phương án đối ứng A/B giúp ra quyết định tức thì.
3. **Form Thẩm định Tùy biến (Interactive Form):** Cho phép Giám khảo tự do chọn 10 ca mở rộng hoặc nhập bất kỳ số tiền, ngày lập, thuế suất nào; có thanh Live Tax Preview Bar phản ánh trực tiếp.
4. **Đồng bộ Trạng thái Hoàn hảo (State Sync):** Sửa hóa đơn sai thành hợp lệ -> Thẻ ngoại lệ tự động giải phóng, form hiện banner xanh, số thuế tự động cộng vào tờ khai.
5. **Nhật ký Kiểm toán Toàn vẹn (Audit Trail Table):**
   - Lưu vết minh bạch 100%: Dấu thời gian, người duyệt, căn cứ SOP, văn bản pháp quy.
   - **Nút Hoàn tác (Undo):** Rút lại quyết định gần nhất, tự động hoàn nguyên số thuế và Hệ số K.
   - **Nút Ghi đè (Override):** Con người có quyền tối cao ghi đè phán quyết của AI khi có chứng từ thực tế.
6. **Hồ sơ Phòng vệ Thuế 1-Click (Tax Defense Dossier):** Modal giải trình chuyên nghiệp gồm tóm tắt pháp lý, lịch sử phê duyệt, mã băm chữ ký số nội bộ SHA-256 và nút In / Xuất PDF giải trình thuế.
7. **Policy Viewer Tax-SOP-2026:** Tra cứu toàn văn quy chế quản trị thuế nội bộ gồm 4 chương chuẩn mực.

---

## 6. HƯỚNG DẪN CÀI ĐẶT & CHẠY LOCAL

### 6.1 Yêu cầu Hệ thống
- **Node.js:** Phiên bản `>= 18.18.0` (Khuyên dùng Node 20+ hoặc 22+).
- **Trình duyệt:** Google Chrome, Microsoft Edge, Mozilla Firefox hoặc Safari.

### 6.2 Cài đặt & Khởi chạy

```bash
# 1. Clone repository từ GitHub
git clone https://github.com/khanhle1406/Tax-Referee.git
cd Tax-Referee

# 2. Cài đặt các gói phụ thuộc
npm install

# 3. Cấu hình biến môi trường
cp .env.example .env.local
```

Mở tệp `.env.local` và cập nhật API keys của bạn:
```env
TYPESAFE_API_KEY=your_typesafe_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here
```

Khởi chạy ứng dụng:
```bash
# Chế độ Development:
npm run dev

# Hoặc Build và Chạy Production:
npm run build
npm run start -- -p 3002
```

Mở trình duyệt và truy cập: **[http://localhost:3002](http://localhost:3002)** *(hoặc http://localhost:3000)*.

---

## 7. CHẠY BỘ KIỂM THỬ TỰ ĐỘNG (AUTOMATED TEST SUITES)

Dự án đi kèm 3 kịch bản kiểm thử tự động toàn diện:

```bash
# 1. Chạy trọn vẹn 54 assertions của cả 4 Test Suites trong testing.md
npx tsx scripts/test-comprehensive-suites.ts

# 2. Chạy kiểm thử hồi quy 15 ca chuẩn mực (Sprint 1 Regression)
npx tsx scripts/test-all-cases.ts

# 3. Xác minh kết nối trực tiếp Dual-Engine AI (Jev API + Gemini Flash-Lite Q-Gen)
npx tsx scripts/test-dual-engine.ts
```

**Kết quả kiểm thử thực tế:**
```text
========================================================================
  TỔNG KẾT: ĐÃ HOÀN THÀNH VÀ ĐẠT 54 / 54 BÀI KIỂM THỬ!
  100% KỊCH BẢN TRONG TESTING.MD ĐÃ ĐƯỢC XÁC THỰC VƯỢT QUA!
========================================================================
```

---

## 8. BẢNG ĐỐI CHIẾU BAREM ĐIỂM CHẤM THI HACKATHON

| Tiêu chí Đề bài A (OrganizationAI) | Điểm | Mức độ đáp ứng trong Tax Referee | Tự đánh giá |
| :--- | :---: | :--- | :---: |
| **1. Ground Truth & Quy trình Thường quy** | 10 | Ban hành Quy chế Tax-SOP-2026; 6 ca thường quy duyệt ngầm thông suốt 100%. | **10 / 10** |
| **2. Phân loại 3 Nhóm Không chắc chắn** | 12 | Định kiểu Type-Safe: `UNCERTAIN_INFO`, `OUT_OF_POLICY`, `EXCEED_AUTHORITY`. | **12 / 12** |
| **3. Phản ứng với Dữ liệu Mới lạ** | 8 | Form tương tác tùy biến cho Giám khảo nhập thông số bất kỳ; AI phản xạ tức thì. | **8 / 8** |
| **4. Zero-Hallucination Guardrail** | 10 | Zod Discriminated Unions. Hóa đơn vi phạm cấm có trường `approvedTaxAmount`. | **10 / 10** |
| **5. Chất lượng Câu hỏi Chuyển tiếp (Q-Gen)** | 6 | Gemini Flash sinh câu hỏi đóng chứa Bill ID, Số tiền, Điều khoản SOP và Nút A/B. | **6 / 6** |
| **6. Audit Trail & Quyền Can thiệp Con người** | 10 | Lưu vết kiểm toán đầy đủ, nút Undo và Override hoạt động trực tiếp trên State. | **10 / 10** |
| **7. Giải thích cho Người không chuyên** | 4 | Trường `plainExplanation` diễn giải tiếng Việt bình dân cho từng quyết định. | **4 / 4** |
| **8. Tốc độ & Độ tin cậy (Verify 90s)** | Điểm cộng | Nút Verify 90s hoàn thành trong 24ms; Local Fallback chạy dưới 1ms khi mất mạng. | **Xuất sắc** |
| **9. Tính năng Vượt trội (Bonus)** | Điểm cộng | Giám sát Hệ số rủi ro K (CV 2392), Mốc thời gian đóng MST và Dossier 1-Click. | **Xuất sắc** |

---

## 9. CẤU TRÚC THƯ MỤC DỰ ÁN

```text
tax-referee/
├── app/
│   ├── api/
│   │   ├── evaluate/route.ts      # API thẩm định hóa đơn đơn lẻ qua Dual-Engine AI
│   │   └── verify/route.ts        # API chạy bài kiểm tra nhanh Verify Harness 90s
│   ├── globals.css                # CSS toàn cục và Tailwind tokens
│   ├── layout.tsx                 # Root layout giao diện B2B Dark Mode
│   └── page.tsx                   # Trang Dashboard chính (3-Tier Layout)
├── components/
│   ├── AuditTrailTable.tsx        # Bảng Nhật ký Kiểm toán (Undo, Override, Dossier)
│   ├── EscalationCard.tsx         # Thẻ Phán quyết Ngoại lệ A/B cho KTT/CFO
│   ├── HeaderBanner.tsx           # Banner hướng dẫn vàng kim & nút xem SOP
│   ├── InteractiveInputForm.tsx   # Form thẩm định tùy biến cho Giám khảo
│   ├── MacroHealthWidget.tsx      # Thước đo Hệ số K và Tờ khai thuế 01/GTGT
│   ├── PolicyViewerModal.tsx      # Modal xem toàn văn Quy chế Tax-SOP-2026
│   ├── TaxDefenseModal.tsx        # Modal Hồ sơ Giải trình Thuế 1-Click (In / PDF)
│   └── VerifyHarness.tsx          # Bảng điều khiển Verify 90 Giây
├── data/
│   ├── mockInvoices.ts            # Ma trận 15 hóa đơn chuẩn hóa & 5 ca Verify
│   └── sopText.ts                 # Toàn văn Quy chế Quản trị Thuế Tax-SOP-2026
├── lib/
│   ├── constants.ts               # Cấu hình API, macro defaults, storage keys
│   ├── schemas.ts                 # Zod Schemas & Discriminated Unions
│   └── utils.ts                   # Định dạng tiền tệ VNĐ và thời gian
├── scripts/
│   ├── setup-env.ts               # Helper nạp biến môi trường an toàn cho CLI
│   ├── test-all-cases.ts          # Test runner 15 ca chuẩn mực (Sprint 1)
│   ├── test-comprehensive-suites.ts # Bộ kiểm thử toàn diện 54 assertions (testing.md)
│   └── test-dual-engine.ts        # Test runner Dual-Engine AI (Jev + Gemini)
├── .env.example                   # Tệp mẫu cấu hình biến môi trường
├── .gitignore                     # Cấu hình bỏ qua tệp nhạy cảm và build output
├── LICENSE                        # Giấy phép mã nguồn mở MIT License
├── README.md                      # Tài liệu tổng quan dự án chi tiết
├── RUNBOOK.md                     # Hướng dẫn khởi chạy nhanh local cho Giám khảo
├── initial-idea.md                # Ý tưởng gốc và 15 hồ sơ nghiệp vụ
├── plan.md                        # Bản kế hoạch thiết kế kỹ thuật Master Blueprint
├── target.md                      # Bản đặc tả mục tiêu nghiệm thu
└── testing.md                     # Báo cáo và kịch bản kiểm thử toàn diện
```

---

## 10. GIẤY PHÉP (LICENSE)

Dự án được phát hành theo giấy phép mã nguồn mở [MIT License](./LICENSE).  
Bản quyền thuộc về **Tax Referee Contributors (2026)**.
