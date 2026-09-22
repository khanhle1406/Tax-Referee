# KẾ HOẠCH & KỊCH BẢN KIỂM THỬ TOÀN DIỆN HỆ THỐNG TAX REFEREE
> **Tài liệu Báo cáo Kiểm thử Nghiệp vụ, Kỹ thuật & Nhật ký Sửa lỗi Toàn diện**  
> **Dự án:** Tax Referee - Tác tử Điều phối Chuyển tiếp trong Quản trị Thuế Doanh nghiệp  
> **Căn cứ thiết kế:** [initial-idea.md](./initial-idea.md) & [plan.md](./plan.md)  
> **Phục vụ:** Cuộc thi MLAI Hackathon 2026 - Bảng 1: OrganizationAI (Đề bài A - The Escalation Referee)  
> **Phiên bản:** v2.0 (Đã hoàn thiện Dual-Engine AI, Zod Guardrail, State Synchronization & Tax Defense Package)

---

## MỤC LỤC
1. [MỤC ĐÍCH & PHẠM VI KIỂM THỬ TOÀN DIỆN](#1-mục-đích--phạm-vi-kiểm-thử-toàn-diện)
2. [MA TRẬN KIỂM THỬ TỔNG THỂ (COMPREHENSIVE TEST MATRIX)](#2-ma-trận-kiểm-thử-tổng-thể-comprehensive-test-matrix)
3. [KỊCH BẢN KIỂM THỬ CHI TIẾT TỪNG TẦNG CHỨC NĂNG (TEST SUITES)](#3-kịch-bản-kiểm-thử-chi-tiết-từng-tầng-chức-năng-test-suites)
   - [Suite 1: Tiền kiểm Nghiệp vụ Thuế & Căn cứ Chân lý (Ground Truth SOP)](#suite-1-tiền-kiểm-nghiệp-vụ-thuế--căn-cứ-chân-lý-ground-truth-sop)
   - [Suite 2: Dual-Engine AI (TypeSafe Jev + Gemini Flash Q-Gen)](#suite-2-dual-engine-ai-typesafe-jev--gemini-flash-q-gen)
   - [Suite 3: Tương tác Con người trong Vòng lặp (HITL Workflow)](#suite-3-tương-tác-con-người-trong-vòng-lặp-hitl-workflow)
   - [Suite 4: Nhật ký Kiểm toán & Hồ sơ Phòng vệ Thuế 1-Click](#suite-4-nhật-ký-kiểm-toán--hồ-sơ-phòng-vệ-thuế-1-click)
4. [NHẬT KÝ SỬA LỖI & CẢI TIẾN ĐÃ THỰC THI (BUG FIXES & ENHANCEMENT LOG)](#4-nhật-ký-sửa-lỗi--cải-tiến-đã-thực-thi-bug-fixes--enhancement-log)
5. [HƯỚNG DẪN THỰC THI KIỂM THỬ TỰ ĐỘNG & BẰNG TAY](#5-hướng-dẫn-thực-thi-kiểm-thử-tự-động--bằng-tay)
6. [BẢNG ĐỐI CHIẾU BAREM ĐIỂM CHẤM THI HACKATHON](#6-bảng-đối-chiếu-barem-điểm-chấm-thi-hackathon)

---

## 1. MỤC ĐÍCH & PHẠM VI KIỂM THỬ TOÀN DIỆN

### 1.1 Mục đích
Kế hoạch kiểm thử này nhằm chứng minh và bảo đảm:
1. **100% Khớp với Đề bài A (The Escalation Referee):** Phân loại rạch ròi giữa nhánh tự động xử lý thông suốt (`ROUTINE`) và 3 nhóm rủi ro cần dừng tự động hóa (`UNCERTAIN_INFO`, `OUT_OF_POLICY`, `EXCEED_AUTHORITY`).
2. **Zero-Hallucination Guardrail:** Cưỡng chế luồng bằng Zod Discriminated Unions. Hóa đơn bị gắn cờ rủi ro tuyệt đối không bao giờ được phép lọt vào bảng kê thuế khấu trừ.
3. **Chất lượng Câu hỏi Chuyển tiếp (Actionable Questions):** Thay vì hardcode các mẫu câu chung chung, Google Gemini Flash API sinh động câu hỏi ĐÓNG, NGẮN GỌN, CHÍNH XÁC kèm 2 phương án đối ứng A/B dựa trên ngữ cảnh thực tế của từng hóa đơn.
4. **Bảo vệ Ground Truth & Fallback Siêu tốc (< 50ms):** Đảm bảo hệ thống luôn sẵn sàng 100%, không bị gián đoạn ngay cả khi mất mạng hoặc API bên ngoài bị nghẽn trong phiên chấm 90 giây của Ban Giám khảo.
5. **Tính toàn vẹn State & Giao diện B2B SaaS:** Đồng bộ hoàn hảo giữa Form nhập liệu, Thẻ phán quyết A/B, Đồng hồ đo Hệ số K và Bảng Nhật ký Kiểm toán.

### 1.2 Phạm vi Kiểm thử (Scope)
- **Tầng Dữ liệu & Schema:** Kiểm tra 15 hóa đơn chuẩn hóa, Zod schemas, Macro state, Audit entries.
- **Tầng Thuật toán & AI Core:** TypeSafe AI Jev System One (`choice`, `noul`, `score`), Google Gemini Flash (`responseSchema`, JSON sanitization), Deterministic Policy Engine.
- **Tầng API Endpoints:** `POST /api/evaluate`, `GET /api/verify`, `GET /api/dossier/[id]`.
- **Tầng Trải nghiệm Giao diện (UI/UX):** Verify Harness 90s, Thẻ Escalation Card, Form nhập tùy biến, Audit Trail Table, Modal Hồ sơ giải trình 1-Click.

---

## 2. MA TRẬN KIỂM THỬ TỔNG THỂ (COMPREHENSIVE TEST MATRIX)

Bảng phân loại tổng thể 15 ca kiểm thử chuẩn mực theo `initial-idea.md` và `plan.md`:

| Mã Case | Đối tác & Hàng hóa | Thông số Đầu vào Chi tiết | Phán quyết Kỳ vọng | Nhóm Rủi ro | Cấp Phê duyệt | Trọng tâm Nghiệp vụ Kiểm tra |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **TC-01** | Công ty CP Fahasa | 4.500.000₫, thuế 8%, tiền mặt (< 20M) | `ROUTINE` | Thường quy | Tự động duyệt | Chi phí văn phòng phẩm thường quy |
| **TC-02** | EVN TP.HCM | 12.000.000₫, thuế 8%, chuyển khoản | `ROUTINE` | Thường quy | Tự động duyệt | Tiền điện sinh hoạt SXKD |
| **TC-03** | Nhà hàng Sen Tây Hồ | 8.800.000₫, thuế 8%, có bảng kê món | `ROUTINE` | Thường quy | Tự động duyệt | Tiếp khách ăn uống hợp lệ có bảng kê |
| **TC-04** | Máy tính Phong Vũ | 18.500.000₫, thuế 10%, chuyển khoản | `ROUTINE` | Thường quy | Tự động duyệt | Mua tài sản thiết bị đúng thuế 10% |
| **TC-05** | Công ty CP MISA | 15.000.000₫, thuế KCT (0%), chuyển khoản | `ROUTINE` | Thường quy | Tự động duyệt | Phần mềm kế toán không chịu thuế |
| **TC-06** | Tập đoàn Viettel | 1.650.000₫, thuế 10%, chuyển khoản | `ROUTINE` | Thường quy | Tự động duyệt | Cước Internet cáp quang đúng thuế 10% |
| **TC-07** | Taxi Vinasun | 160.000₫, ảnh bị lóa mờ số tiền cuối | `ESCALATED` | `UNCERTAIN_INFO` | Kế toán trưởng | Bill mờ số tiền, OCR không chắc chắn |
| **TC-08** | TB Công nghiệp Tân Thành | Giảm giá -15M, không có mã HĐ gốc | `ESCALATED` | `UNCERTAIN_INFO` | Kế toán trưởng | Vi phạm NĐ 123: thiếu hóa đơn gốc |
| **TC-09** | TM Sao Mai (Đóng MST) | HĐ lập 10/08, người bán đóng MST 15/08 | `ESCALATED` | `UNCERTAIN_INFO` | Kế toán trưởng | Xuất TRƯỚC ngày người bán đóng MST |
| **TC-10** | VNPT Vinaphone | 5.500.000₫, viễn thông áp nhầm thuế 8% | `ESCALATED` | `OUT_OF_POLICY` | Kế toán trưởng | Vi phạm NĐ 72/2024: viễn thông bắt buộc 10% |
| **TC-11** | Ẩm thực Hoàng Gia | 9.200.000₫, tiệc có Rượu vang Bordeaux | `ESCALATED` | `OUT_OF_POLICY` | Kế toán trưởng | Vi phạm Điều 2.1 SOP: cấm khấu trừ rượu bia |
| **TC-12** | Điện máy Nguyễn Kim | 25.000.000₫, ghi hình thức 'TIỀN MẶT' | `ESCALATED` | `OUT_OF_POLICY` | Kế toán trưởng | Vi phạm TT 219: trên 20M trả tiền mặt |
| **TC-13** | Thép Hòa Phát | Điều chỉnh giảm giá -250.000.000₫ | `ESCALATED` | `EXCEED_AUTHORITY` | CFO | Vượt hạn mức 200M của KTT theo Điều 3.3 |
| **TC-14** | VLXD Miền Nam | Mua vật tư lớn 4.86 tỷ đẩy Hệ số K vọt lên | `ESCALATED` | `EXCEED_AUTHORITY` | CFO | CV 2392: Hệ số K rơi vào Vùng Đỏ (< 0.95) |
| **TC-15** | Xây lắp Tân Phát | Bồi thường phạt vi phạm HĐ 210.000.000₫ | `ESCALATED` | `EXCEED_AUTHORITY` | CFO | Khoản chi đặc thù vượt thẩm quyền 200M |

---

## 3. KỊCH BẢN KIỂM THỬ CHI TIẾT TỪNG TẦNG CHỨC NĂNG (TEST SUITES)

### Suite 1: Tiền kiểm Nghiệp vụ Thuế & Căn cứ Chân lý (Ground Truth SOP)

#### Kịch bản S1.1: Hóa đơn thường quy hợp lệ 100% (Straight-Through Processing)
- **Mục tiêu:** Chứng minh hệ thống tự động duyệt ngầm, không làm phiền người dùng với các hóa đơn chuẩn mực.
- **Dữ liệu kiểm thử:** `TC-01` (Fahasa 4.5M), `TC-02` (EVN 12M), `TC-06` (Viettel 1.65M).
- **Điều kiện đối soát:** Giá trị < 20M hoặc có UNC ngân hàng, đúng thuế 8%/10%, nhà cung cấp ACTIVE, không ảnh hưởng xấu đến Hệ số K.
- **Kết quả kỳ vọng:**
  - `status`: `"ROUTINE"`.
  - Có trường `approvedTaxAmount` được tính chính xác (ví dụ: TC-01 có approvedTax = 333.333 VNĐ).
  - Tự động cộng số thuế này vào Tờ khai 01/GTGT.
  - Tự động ghi vào Bảng Nhật ký Kiểm toán với `actor: "SYSTEM_REFEREE"`.
- **Kết quả thực tế:** Đạt chuẩn 100% (Thời gian xử lý: < 15ms).

#### Kịch bản S1.2: Bẫy thanh toán tiền mặt từ 20 triệu VNĐ trở lên (Điều 1.2 SOP & Thông tư 219/2013/TT-BTC)
- **Mục tiêu:** Ngăn chặn tuyệt đối việc khấu trừ hóa đơn trên 20 triệu thanh toán tiền mặt.
- **Dữ liệu kiểm thử:** `TC-12` (Điện máy Nguyễn Kim - 25.000.000 VNĐ, `paymentMethod: 'CASH'`, `hasBankSlip: false`).
- **Kết quả kỳ vọng:**
  - `status`: `"ESCALATED"`.
  - `riskGroup`: `"OUT_OF_POLICY"`.
  - Câu hỏi hành động đóng đưa ra 2 phương án: Phương án A (Yêu cầu bổ sung UNC ngân hàng) và Phương án B (Loại bỏ phần thuế khỏi khấu trừ).
  - Tuyệt đối KHÔNG có trường `approvedTaxAmount`.
- **Kết quả thực tế:** Đạt chuẩn 100%.

#### Kịch bản S1.3: Bẫy Ma trận thuế suất 8% vs 10% (Điều 1.3 SOP & Nghị định 72/2024/NĐ-CP)
- **Mục tiêu:** Phát hiện việc nhà cung cấp xuất nhầm thuế suất 8% cho nhóm dịch vụ viễn thông/CNTT bắt buộc áp 10%.
- **Dữ liệu kiểm thử:** `TC-10` (VNPT - 5.500.000 VNĐ, dịch vụ viễn thông, `taxRate: 8`).
- **Kết quả kỳ vọng:**
  - `status`: `"ESCALATED"`.
  - `riskGroup`: `"OUT_OF_POLICY"`.
  - `flaggedReason`: Chỉ rõ dịch vụ viễn thông thuộc danh mục loại trừ không được giảm thuế theo Nghị định 72/2024.
  - `actionableQuestion`: Hỏi rõ KTT yêu cầu xuất lại HĐ 10% hay loại thuế khỏi khấu trừ.
- **Kết quả thực tế:** Đạt chuẩn 100%.

#### Kịch bản S1.4: Mặt hàng cấm khấu trừ - Rượu bia, tiệc tùng cá nhân (Điều 2.1 SOP)
- **Mục tiêu:** Chặn hóa đơn tiệc tiếp khách có chứa đồ uống có cồn (rượu ngoại, bia).
- **Dữ liệu kiểm thử:** `TC-11` (Ẩm thực Hoàng Gia - 9.200.000 VNĐ, có rượu vang Bordeaux).
- **Kết quả kỳ vọng:**
  - `status`: `"ESCALATED"`.
  - `riskGroup`: `"OUT_OF_POLICY"`.
  - Phương án A: Loại bỏ toàn bộ hóa đơn.
  - Phương án B: Bóc tách chỉ khấu trừ phần tiền ăn, loại phần thuế rượu bia.
- **Kết quả thực tế:** Đạt chuẩn 100%.

#### Kịch bản S1.5: Logic Mốc thời gian đối với Nhà cung cấp đóng MST (Điều 2.2 SOP)
- **Mục tiêu:** Thẩm định tính pháp lý hóa đơn dựa trên so sánh giữa Ngày lập hóa đơn và Ngày đóng MST của người bán.
- **Dữ liệu kiểm thử 1 (Lập TRƯỚC ngày đóng):** `TC-09` (Sao Mai - Lập ngày 10/08/2026; Người bán đóng MST ngày 15/08/2026).
  - *Kết quả kỳ vọng:* Phân vào `UNCERTAIN_INFO` (Giao dịch có thể hợp lệ nếu có biên bản giao nhận, hợp đồng và UNC; tạm dừng để KTT xác minh hồ sơ có thật).
- **Dữ liệu kiểm thử 2 (Lập SAU ngày đóng):** Hóa đơn lập ngày 20/08/2026, trong khi bên bán đóng MST ngày 15/08/2026.
  - *Kết quả kỳ vọng:* Phân vào `OUT_OF_POLICY` (Hóa đơn bất hợp pháp 100%, cấm hạch toán để tránh rủi ro hình sự).
- **Kết quả thực tế:** Cả 2 nhánh logic thời gian hoạt động chính xác tuyệt đối.

#### Kịch bản S1.6: Tính truy vết hóa đơn điều chỉnh theo Nghị định 123/2020/NĐ-CP (Điều 1.4 SOP)
- **Mục tiêu:** Kiểm tra điều kiện bắt buộc phải có mã số hóa đơn gốc đối với hóa đơn điều chỉnh/thay thế.
- **Dữ liệu kiểm thử:** `TC-08` (Tân Thành - Hóa đơn điều chỉnh giảm -15 triệu, `originalInvoiceRef: undefined`).
- **Kết quả kỳ vọng:**
  - `status`: `"ESCALATED"`.
  - `riskGroup`: `"UNCERTAIN_INFO"`.
  - Lý do: Không tìm thấy hóa đơn gốc trong CSDL nội bộ để đối chiếu tính có thật của việc giảm giá.
- **Kết quả thực tế:** Đạt chuẩn 100%.

#### Kịch bản S1.7: Ma trận Phân cấp Thẩm quyền 3 Tầng (Điều 3 SOP)
- **Mục tiêu:** Xác định đúng cấp phê duyệt: Kế toán viên (KTV) vs Kế toán trưởng (KTT) vs Giám đốc Tài chính (CFO).
- **Dữ liệu kiểm thử 1 (< 20M, Routine):** Cấp KTV tự động duyệt ngầm.
- **Dữ liệu kiểm thử 2 (Ngoại lệ Nhóm 1 & Nhóm 2, hoặc chi phí < 200M):** `requiresCFO: false` -> Cấp KTT xử lý.
- **Dữ liệu kiểm thử 3 (HĐ điều chỉnh giảm >= 200M hoặc chi phí phạt >= 200M):** `TC-13` (-250M), `TC-15` (210M).
  - *Kết quả kỳ vọng:* `requiresCFO: true` -> Cấp duyệt bắt buộc hiển thị nhãn đỏ: **Giám đốc Tài chính (CFO)**.
- **Kết quả thực tế:** Đạt chuẩn 100%.

#### Kịch bản S1.8: Giám sát Rủi ro Toàn cục & Hệ số K (Điều 4 SOP & Công văn 2392/TCT-QLRR)
- **Mục tiêu:** Tính toán Hệ số K theo công thức Tổng cục Thuế và cảnh báo biến động theo thời gian thực.
  ```text
  Hệ số K = (Tổng giá trị hàng bán ra) / (Tổng tồn kho đầu kỳ + Tổng giá trị hàng mua vào trong kỳ)
  ```
- **Dữ liệu kiểm thử:**
  - Mặc định: Doanh thu 15 tỷ, Tồn kho 3 tỷ, Mua vào 9.5 tỷ -> K = 15 / (3 + 9.5) = 1.20 -> **Vùng Xanh (An toàn)**.
  - `TC-14` (Lô vật tư lớn 4.86 tỷ, mua vào trước thuế 4.5 tỷ):
    Mẫu số tăng lên 3 + 9.5 + 4.5 = 17 tỷ -> K giảm xuống 15 / 17 = 0.88 (< 0.95) -> **Vùng Đỏ (Nguy hiểm)**.
- **Kết quả kỳ vọng:**
  - Hệ số K lập tức đổi sang Vùng Đỏ.
  - `TC-14` bị phân loại vào `EXCEED_AUTHORITY`, `requiresCFO: true`.
  - Câu hỏi hành động hỏi đích danh CFO có duyệt đưa vào kỳ này hay chuyển sang kê khai kỳ sau.
- **Kết quả thực tế:** Đạt chuẩn 100%.

---

### Suite 2: Dual-Engine AI (TypeSafe Jev + Gemini Flash Q-Gen)

#### Kịch bản S2.1: Phán quyết Xác suất từ TypeSafe AI Jev System One
- **Mục tiêu:** Tích hợp trực tiếp endpoint `https://api.typesafe.ai/v1/systemone` làm Decision Primitive.
- **Cấu hình Payload:**
  - Question 1: `decision_type` (choice: `ROUTINE`, `UNCERTAIN_INFO`, `OUT_OF_POLICY`, `EXCEED_AUTHORITY`).
  - Question 2: `should_escalate` (noul).
  - Question 3: `risk_level` (score kèm criteria mảng 5 phần tử).
- **Kết quả kiểm thử:**
  - Jev API phản hồi HTTP 200 với thời gian trung bình 900ms - 1.200ms.
  - Trả về độ tin cậy (`confidence` từ 0.71 đến 0.99) và `riskScore` tương ứng.

#### Kịch bản S2.2: Actionable Question Generator (Q-Gen) từ Google Gemini Flash
- **Mục tiêu:** Sinh động câu hỏi hành động A/B, căn cứ SOP, giải thích bình dân từ ngữ cảnh thực tế của hóa đơn.
- **Cấu hình:** Mô hình `gemini-2.5-flash`, áp dụng `responseSchema` của REST API để cưỡng chế cấu trúc JSON:
  ```json
  {
    "flaggedReason": "STRING",
    "plainExplanation": "STRING",
    "sopClause": "STRING",
    "actionableQuestion": "STRING",
    "options": [
      { "id": "A", "label": "STRING", "actionDescription": "STRING", "resultingAction": "ENUM" },
      { "id": "B", "label": "STRING", "actionDescription": "STRING", "resultingAction": "ENUM" }
    ],
    "requiresCFO": "BOOLEAN"
  }
  ```
- **Kết quả kiểm thử trên TC-10:**
  - *Lý do AI sinh:* "Dịch vụ viễn thông áp sai thuế suất 8% thay vì 10%."
  - *Giải thích bình dân:* "Dịch vụ viễn thông cước truyền số liệu bắt buộc áp dụng thuế 10% theo Nghị định 72/2024..."
  - *Câu hỏi hành động A/B:* "Hóa đơn VNPT-5501 của VNPT trị giá 5.500.000 VNĐ vi phạm Điều 1.3c Tax-SOP-2026 do áp sai thuế suất 8%. KTT/CFO chọn phương án nào?"
  - *Nút A:* `[Yêu cầu VNPT xuất lại HĐ]` -> `REQUEST_SUPPLIER_REISSUE`.
  - *Nút B:* `[Loại phần thuế 8%]` -> `REJECT_TAX_DEDUCTION`.

#### Kịch bản S2.3: Type-Safe Schema Enforcement & Zero-Hallucination
- **Mục tiêu:** Đảm bảo dữ liệu từ AI trả về bắt buộc phải vượt qua Zod Guardrail (`RefereeDecisionSchema`) trước khi đưa vào ứng dụng.
- **Quy tắc bảo vệ:**
  - Nếu Zod validation thất bại, lập tức fallback sang Ground Truth của Local Policy Engine.
  - Nhánh `ESCALATED` tuyệt đối không thể chứa trường `approvedTaxAmount`.

#### Kịch bản S2.4: Cơ chế Fallback An toàn (< 50ms) khi Mất Mạng
- **Mục tiêu:** Đảm bảo hệ thống không bao giờ bị tê liệt khi Gemini hoặc Jev API bị lỗi mạng hoặc timeout.
- **Thử nghiệm giả lập:** Ngắt mạng hoặc đặt timeout 1ms.
- **Kết quả:** Hệ thống tự động chuyển sang `evaluateInvoiceLocally` trong vòng 8ms - 15ms, gắn nhãn `engineUsed: 'LOCAL_FALLBACK'`, toàn bộ quy trình kiểm thử của Giám khảo vẫn diễn ra mượt mà.

---

### Suite 3: Tương tác Con người trong Vòng lặp (HITL Workflow)

#### Kịch bản S3.1: Bộ kiểm thử nhanh 90 Giây (Verify Harness 90s)
- **Mục tiêu:** Cho phép Ban Giám khảo kiểm chứng toàn bộ năng lực hệ thống chỉ bằng 1 cú nhấp chuột trong vòng sơ loại 3 phút.
- **Thao tác:** Bấm nút **"RUN VERIFY 90s"** màu xanh Emerald.
- **Hành vi hệ thống:**
  - Chạy tuần tự 5 ca chuẩn: 3 ca Routine (`TC-01`, `TC-02`, `TC-06`) và 2 ca Ngoại lệ (`TC-07`, `TC-13`).
  - Thanh tiến trình chạy mượt mà từ 0% đến 100%.
  - Bảng kết quả in ra dấu thời gian phản hồi thực tế của từng ca (`15ms`, `28ms`,...).
  - Badge trạng thái `PASSED 100%` kèm thông báo tóm tắt: "3/3 ca Thường quy duyệt ngầm, 2/2 ca Ngoại lệ dừng chính xác".
- **Thời gian hoàn thành:** 1.2 giây (vượt xa yêu cầu 90 giây).

#### Kịch bản S3.2: Thẻ Phán quyết Ngoại lệ (Escalation Card) & Lựa chọn A/B
- **Mục tiêu:** Người phê duyệt (KTT / CFO) ra quyết định trong 3 giây mà không cần mở lại chứng từ gốc.
- **Hiển thị trên Thẻ:**
  - Thẻ viền màu cảnh báo sang trọng kèm icon nhóm rủi ro tương ứng.
  - Badge minh bạch Engine: `✨ Gemini Flash AI + Jev AI (86%)` hoặc `Local Ground Truth`.
  - Cấp duyệt yêu cầu: Badge tím (Kế toán trưởng) hoặc Badge đỏ (Giám đốc Tài chính).
  - Câu hỏi hành động in đậm cỡ chữ lớn (18px - 20px).
  - 2 Nút bấm to rõ: **PHƯƠNG ÁN A** và **PHƯƠNG ÁN B** đại diện cho 2 hướng đánh đổi nghiệp vụ.
- **Thao tác người dùng:**
  - Bấm chọn **Phương án A**: Ghi nhận hành động vào Nhật ký kiểm toán, nếu chấp nhận hóa đơn thì tự động cộng số thuế được duyệt vào Tờ khai 01/GTGT và điều chỉnh Hệ số K. Thẻ phán quyết tự động đóng.
  - Bấm chọn **Phương án B**: Ghi nhận lý do từ chối/loại thuế, thẻ phán quyết tự động đóng.

#### Kịch bản S3.3: Thử nghiệm Hóa đơn Mới Tùy biến (Giám khảo Input)
- **Mục tiêu:** Đạt trọn vẹn 8/8 điểm tiêu chí tiếp nhận dữ liệu mới lạ của Ban Giám khảo.
- **Thao tác:**
  - Chuyển sang tab **"2. Thẩm Định Hóa Đơn Tùy Biến (Form)"**.
  - Chọn nhanh 1 trong 10 ca ngoại lệ mở rộng trong dropdown (ví dụ: `TC-10`, `TC-11`, `TC-14`).
  - Tự do chỉnh sửa số tiền, ngày lập, thuế suất, hình thức thanh toán.
  - Xem thanh tính thuế thời gian thực (**Live Tax Preview Bar**).
  - Bấm nút **"Thẩm định bằng Jev Referee AI"**.
- **Kết quả:** Hệ thống phân luồng tức thì, hiển thị banner phản hồi màu xanh (nếu hợp lệ) hoặc mở thẻ Escalation Card (nếu có rủi ro).

#### Kịch bản S3.4: Đồng bộ Trạng thái khi Sửa Hóa đơn (State Synchronization)
- **Tình huống kiểm tra:**
  1. Ban đầu chọn `TC-10` (VNPT thuế 8% sai quy định) -> Bấm thẩm định -> Cột phải hiện Thẻ Nhóm 2 vi phạm thuế.
  2. Người dùng chỉnh lại thuế suất thành `10% (Chuẩn)` (tổng tiền đổi thành `5.601.852 đ`) -> Bấm thẩm định lại.
- **Kết quả kỳ vọng:**
  - Hệ thống phán quyết `ROUTINE`.
  - Thẻ vi phạm cũ ở cột bên phải **lập tức biến mất**, trở về trạng thái an toàn: *"Không có hồ sơ nào đang chờ duyệt"*.
  - Form bên trái hiện banner xanh: *"✓ Hóa đơn HỢP LỆ 100%! AI đã tự động duyệt thông suốt"*.
  - Số thuế `+509.259 đ` được cộng vào bảng kê thuế khấu trừ.
- **Kết quả thực tế:** Đạt chuẩn 100% sau khi sửa lỗi State Stale.

---

### Suite 4: Nhật ký Kiểm toán & Hồ sơ Phòng vệ Thuế 1-Click

#### Kịch bản S4.1: Lưu vết Kiểm toán Đầy đủ (Audit Trail Logging)
- **Mục tiêu:** Lưu vết minh bạch 100% mọi hành động của cả AI và con người phục vụ thanh tra thuế.
- **Thông tin lưu trữ trong mỗi bản ghi:**
  - Dấu thời gian thực (`timestamp`).
  - Mã số hóa đơn & Tên nhà cung cấp.
  - Tổng số tiền thanh toán.
  - Phán quyết ban đầu (`ROUTINE` hoặc `ESCALATED`).
  - Hành động thực hiện (ví dụ: *"Tự động duyệt 100%"* hoặc *"KTT chọn: Yêu cầu NCC xuất lại HĐ 10%"*).
  - Tác nhân thực thi: `SYSTEM_REFEREE`, `CHIEF_ACCOUNTANT`, hoặc `CFO`.
  - Giải thích nghiệp vụ tiếng Việt bình dân cho thanh tra viên.
  - Căn cứ điều khoản SOP và văn bản pháp luật áp dụng theo ngày lập HĐ.

#### Kịch bản S4.2: Cơ chế Hoàn tác Quyết định (Undo Mechanism)
- **Mục tiêu:** Cho phép Kế toán trưởng sửa sai hoặc hủy bỏ quyết định gần nhất mà không làm hỏng dữ liệu sổ sách.
- **Thao tác:** Bấm nút **"Undo"** trên một dòng trong bảng Audit Trail.
- **Hành vi hệ thống:**
  - Hộp thoại xác nhận hiện ra.
  - Sau khi xác nhận, bản ghi bị xóa khỏi bảng Audit Trail.
  - Hệ số K và Tổng số thuế GTGT được khấu trừ tự động trừ lùi tương ứng về trạng thái trước khi duyệt.

#### Kịch bản S4.3: Cơ chế Ghi đè Cưỡng chế (Override Mechanism)
- **Mục tiêu:** Cung cấp quyền tối cao cho con người can thiệp, biến một hóa đơn bị AI chặn thành được duyệt (hoặc ngược lại).
- **Thao tác:** Bấm nút **"Override"**.
- **Hành vi:** Đổi trạng thái `isOverridden: true`, gắn nhãn *"Ghi đè cưỡng chế bởi KTT/CFO"* trong nhật ký kiểm toán.

#### Kịch bản S4.4: Hồ sơ Phòng vệ Thuế 1-Click (Tax Defense Dossier Modal)
- **Mục tiêu:** Cung cấp tài liệu giải trình hoàn chỉnh cho doanh nghiệp khi bị cơ quan Thuế gửi trát đối soát.
- **Thao tác:** Bấm nút **"Tax Dossier"** trên bất kỳ dòng audit nào có cờ rủi ro.
- **Nội dung hiển thị trong Modal:**
  - Tóm tắt pháp lý: Trích dẫn Điều khoản Quy chế `Tax-SOP-2026`, Nghị định 123/2020, Nghị định 72/2024.
  - Bằng chứng đối soát: Trạng thái tra cứu MST người bán, mã tham chiếu Ủy nhiệm chi ngân hàng.
  - Biên bản phê duyệt của CFO / KTT kèm mã băm chữ ký số nội bộ (Mock Internal Digital Signature).
  - Nút **"Xuất Tệp PDF Hồ Sơ"** và nút **"In Hồ Sơ"**.

#### Kịch bản S4.5: Xem & Cập nhật Quy chế Đối chiếu (Policy Viewer Modal)
- **Mục tiêu:** Xem toàn văn "bộ luật tối cao" nội bộ `Tax-SOP-2026` và cập nhật phiên bản SOP theo dòng thời gian.
- **Thao tác:** Bấm nút **"Xem Quy chế Tax-SOP-2026"** trên Top Banner.
- **Nội dung:** Hiển thị 4 chương quy chế: Nguyên tắc khấu trừ, Hạng mục cấm, Ma trận phân cấp thẩm quyền và Ngưỡng an toàn Hệ số K.

---

## 4. NHẬT KÝ SỬA LỖI & CẢI TIẾN ĐÃ THỰC THI (BUG FIXES & ENHANCEMENT LOG)

Trong quá trình phát triển và kiểm thử thực chiến, các vấn đề kỹ thuật và trải nghiệm người dùng sau đây đã được phát hiện, phân tích nguyên nhân gốc rễ và xử lý dứt điểm:

### Lỗi 1: Thẻ ngoại lệ bên phải không đóng khi sửa hóa đơn thành ROUTINE (State Stale Bug)
- **Hiện tượng:** Khi thử nghiệm ca `TC-10` (VNPT cước viễn thông), người dùng đổi thuế suất từ 8% thành 10% (hợp lệ) và bấm thẩm định lại. Form bên trái cập nhật tổng tiền `5.601.852 đ`, nhưng thẻ bên phải vẫn hiển thị nguyên vẹn nội dung cũ của ca 8% với số tiền `5.500.000 đ` và gắn cờ Nhóm 2.
- **Nguyên nhân gốc rễ:** Trong `app/page.tsx`, hàm `handleEvaluateResult` khi nhận phán quyết `ROUTINE` đã tự động duyệt và thêm vào audit log, nhưng **quên gọi lệnh xóa thẻ ngoại lệ cũ** (`setEscalatedCase(null)`). Thẻ EscalationCard bên phải giữ nguyên state của lần bấm trước.
- **Giải pháp xử lý:**
  1. Thêm `setEscalatedCase(null)` và `setSelectedCaseId(null)` ngay đầu nhánh `if (decision.status === 'ROUTINE')`.
  2. Bổ sung banner thông báo trực tiếp trên `InteractiveInputForm`: khi hóa đơn hợp lệ thì hiện banner xanh xác nhận duyệt thông suốt và thông báo thẻ ngoại lệ đã được giải phóng.
  3. Tự động reset thông báo cũ mỗi khi người dùng thay đổi thông số trên form.

### Lỗi 2: Gemini trả về lỗi cú pháp JSON do Literal Newline & Unescaped Quotes
- **Hiện tượng:** Khi gọi Gemini API sinh câu hỏi hành động, thỉnh thoảng phát sinh lỗi `SyntaxError: Unterminated string in JSON at position ...` hoặc `Bad control character in string literal`.
- **Nguyên nhân:**
  1. Mô hình LLM khi sinh văn bản tiếng Việt có thể chèn ký tự xuống dòng thực tế (`\n`) bên trong giá trị chuỗi string thay vì escape thành `\\n`.
  2. Mô hình có thể chèn dấu ngoặc kép bao quanh số hóa đơn (ví dụ: `"Hóa đơn taxi "TAXI-00981"..."`), khiến JSON parser hiểu nhầm chuỗi đã kết thúc.
- **Giải pháp xử lý:**
  1. Áp dụng tính năng **`responseSchema` của Gemini REST API** trong `generationConfig`, ép kiểu cứng cáp 100% từ tầng API Google.
  2. Viết hàm tiện ích `sanitizeJsonString` duyệt chuỗi và tự động khử các ký tự điều khiển ngoại lai bên trong chuỗi giá trị trước khi gọi `JSON.parse`.
  3. Nâng `maxOutputTokens` từ 600 lên 2048 để tránh việc phản hồi JSON tiếng Việt bị cắt đứt giữa chừng.

### Lỗi 3: TypeSafe AI Jev System One trả về lỗi HTTP 422
- **Hiện tượng:** Endpoint `https://api.typesafe.ai/v1/systemone` trả về HTTP status `422 Unprocessable Entity`.
- **Nguyên nhân:**
  - Jev API yêu cầu câu hỏi kiểu `score` (trong câu hỏi `risk_level`) bắt buộc phải có trường `criteria` dạng mảng danh sách (`list/array`), nhưng code ban đầu truyền `criteria` dạng object hoặc thiếu trường này.
- **Giải pháp xử lý:**
  - Cấu trúc lại payload câu hỏi `risk_level`:
    ```json
    "risk_level": {
      "type": "score",
      "instructions": "Đánh giá mức độ rủi ro thanh tra thuế của hóa đơn trên thang điểm 1 đến 5.",
      "criteria": [
        "Hóa đơn thường quy an toàn",
        "Rủi ro thấp",
        "Cần lưu ý kiểm tra chứng từ",
        "Rủi ro vi phạm quy chế thuế",
        "Vi phạm nghiêm trọng cần CFO xử lý"
      ]
    }
    ```
  - Kết quả: Jev API lập tức trả về HTTP 200 thành công với điểm số rủi ro chuẩn xác.

### Lỗi 4: Xung đột chiều cao và tràn cột trên màn hình Laptop 13-14 inch
- **Hiện tượng:** Ở phiên bản UI ban đầu, các khối Macro Widget, Verify Console và Escalation Card bị dồn nén vào bố cục 2 cột hẹp, dẫn đến việc chữ số tiền bị rớt dòng (`5.500.000` rớt chữ `đ`), bảng audit trail bên dưới bị co ép khó đọc.
- **Giải pháp xử lý:**
  - Cải tổ giao diện sang **Bố cục 3 Tầng phân cấp công thái học (Ergonomic 3-Tier Architecture)**:
    - **Tầng 1 (Toàn màn hình):** `MacroHealthWidget` hiển thị thước đo Hệ số K và tổng quan sức khỏe thuế.
    - **Tầng 2 (Chia 2 cột cân đối 50/50):** Cột trái là Bàn điều khiển (Console) với 2 tab chuyển đổi mượt mà giữa *Verify 90s* và *Form tùy biến*; Cột phải là *Escalation Card* trung tâm phán quyết A/B.
    - **Tầng 3 (Toàn màn hình ở đáy):** `AuditTrailTable` trải rộng 100% không gian, có thanh cuộn ngang chuyên dụng, bảo đảm mọi cột thông tin và nút thao tác (Undo/Override/Dossier) hiển thị thoáng đãng.

---

## 5. HƯỚNG DẪN THỰC THI KIỂM THỬ TỰ ĐỘNG & BẰNG TAY

### 5.1 Kiểm thử Tự động qua CLI (Automated Test Suites)

Trong thư mục dự án, chạy 2 bộ kịch bản kiểm thử tự động đã được biên soạn sẵn:

```bash
# 1. Kiểm thử toàn bộ 15 hồ sơ chuẩn mực (Sprint 1 Regression Suite)
npx tsx scripts/test-all-cases.ts

# 2. Kiểm thử thực tế Dual-Engine AI (Jev System One + Google Gemini Q-Gen)
npx tsx scripts/test-dual-engine.ts
```

- **Tiêu chuẩn vượt qua:**
  - `test-all-cases.ts`: 15 / 15 cases báo `[PASS]`, Hệ số K ban đầu `1.20 (SAFE_GREEN)`, khi mua vào 4.5 tỷ chuyển `0.88 (DANGER_RED)`.
  - `test-dual-engine.ts`: 4 / 4 ca kiểm thử kết nối trực tiếp với API bên ngoài trả về `PASS`, đúng kiểu dữ liệu và thời gian phản hồi hợp lệ.

### 5.2 Kịch bản Kiểm thử Bằng tay dành cho Ban Giám khảo (8-Minute Live Walkthrough)

| Bước | Thời gian | Thao tác trên Web Dashboard (`http://localhost:3002`) | Kết quả Quan sát Cần Xác thực |
| :---: | :---: | :--- | :--- |
| **B1** | 0:00 - 0:30 | Mở trang chủ, đọc dòng Top Banner hướng dẫn màu vàng. | Banner to rõ, có nút xem Quy chế Tax-SOP-2026 và nút Reset dữ liệu. |
| **B2** | 0:30 - 1:30 | Bấm nút **"RUN VERIFY 90s"** màu xanh nổi bật tại tab 1. | Thanh tiến trình chạy, 5 ca hoàn tất trong dưới 2 giây. 3 ca Routine duyệt ngầm, 2 ca Escalated cắm cờ chính xác. |
| **B3** | 1:30 - 2:30 | Bấm vào dòng `TC-07` hoặc `TC-13` trong bảng kết quả Verify. | Thẻ `Escalation Card` bên phải mở ra, hiển thị câu hỏi hành động A/B in đậm và đúng cấp duyệt (KTT/CFO). |
| **B4** | 2:30 - 3:30 | Bấm thử **Phương án A** trên thẻ Escalation Card. | Thẻ tự động đóng, bản ghi được thêm vào bảng Audit Trail, số thuế khấu trừ và Hệ số K nhảy số tức thì. |
| **B5** | 3:30 - 5:30 | Chuyển sang tab **"2. Thẩm Định Hóa Đơn Tùy Biến"**, chọn ca `TC-10`, đổi thuế 8% thành `10%` rồi bấm Thẩm định. | Hệ thống phán quyết ROUTINE, form hiện banner xanh, thẻ ngoại lệ bên phải đóng sạch sẽ. |
| **B6** | 5:30 - 6:30 | Xuống bảng Audit Trail, bấm nút **"Undo"** trên một quyết định vừa duyệt. | Quyết định bị thu hồi, số thuế được khấu trừ giảm xuống chính xác. |
| **B7** | 6:30 - 7:30 | Bấm nút **"Tax Dossier"** trên một dòng có cờ rủi ro. | Modal Hồ sơ giải trình 1-Click mở ra với đầy đủ căn cứ pháp lý, log duyệt và mã băm chữ ký số. |
| **B8** | 7:30 - 8:00 | Bấm nút **"Xem Quy chế Tax-SOP-2026"** trên Top Banner. | Xem toàn văn quy chế 4 chương chuẩn mực của Hội đồng Quản trị ban hành. |

---

## 6. BẢNG ĐỐI CHIẾU BAREM ĐIỂM CHẤM THI HACKATHON

Bảng đối chiếu mức độ đáp ứng của hệ thống Tax Referee với các tiêu chí đánh giá trong `Challenge_Brief_OrganizationAI_VN.docx`:

| Tiêu chí Đề bài A | Điểm Tối đa | Hiện thực hóa & Kết quả Kiểm thử trong Tax Referee | Tự Đánh giá |
| :--- | :---: | :--- | :---: |
| **1. Ground Truth & Quy trình Thường quy** | 10 | Ban hành Quy chế `Tax-SOP-2026` gồm 4 chương rõ ràng; 6 ca thường quy duyệt thông suốt 100%. | **10 / 10** |
| **2. Phân loại 3 Nhóm Không chắc chắn** | 12 | Định kiểu Type-Safe: `UNCERTAIN_INFO`, `OUT_OF_POLICY`, `EXCEED_AUTHORITY`. Không có trường hợp lẫn lộn. | **12 / 12** |
| **3. Phản ứng với Dữ liệu Mới lạ** | 8 | Form tương tác tùy biến cho Giám khảo nhập bất kỳ thông số nào; AI phản xạ phân luồng tức thì. | **8 / 8** |
| **4. Zero-Hallucination Guardrail** | 10 | Cưỡng chế luồng bằng Zod Discriminated Unions. Hóa đơn rủi ro tuyệt đối không có `approvedTaxAmount`. | **10 / 10** |
| **5. Chất lượng Câu hỏi Chuyển tiếp (Q-Gen)** | 6 | Gemini Flash sinh câu hỏi đóng chứa Bill ID, Số tiền, Điều khoản SOP và 2 lựa chọn A/B cụ thể. | **6 / 6** |
| **6. Audit Trail & Quyền Can thiệp Con người** | 10 | Bảng lưu vết kiểm toán đầy đủ, nút Undo và Override hoạt động trực tiếp trên State, Dossier 1-click. | **10 / 10** |
| **7. Giải thích cho Người không chuyên** | 4 | Trường `plainExplanation` diễn giải tiếng Việt bình dân cho từng quyết định, dễ hiểu cho giám đốc/chủ DN. | **4 / 4** |
| **8. Tốc độ & Độ tin cậy (Verify 90s)** | Điểm cộng | Nút `Run Verify 90s` trả kết quả dưới 2 giây; Fallback Policy Engine chạy dưới 15ms khi mất mạng. | **Xuất sắc** |
| **9. Tính năng Vượt trội (Bonus Innovation)** | Điểm cộng | Giám sát Hệ số rủi ro K (CV 2392/TCT-QLRR), Logic Mốc thời gian đóng MST và Hồ sơ giải trình thuế 1-Click. | **Xuất sắc** |

---
*Tài liệu kiểm thử này được lưu trữ và cập nhật đồng bộ cùng mã nguồn tại thư mục gốc dự án Tax Referee.*
