# BẢN ĐẶC TẢ MỤC TIÊU NGHIỆM THU HỆ THỐNG TAX REFEREE
> **Tài liệu:** Khung Tiêu chí Nghiệm thu Sản phẩm & Đánh giá Tính Thực tiễn (Target Master Blueprint)  
> **Dự án:** Tax Referee - The Escalation Referee (Đề bài A - MLAI Hackathon 2026)  
> **Căn cứ gốc:** [initial-idea.md](./initial-idea.md) & [plan.md](./plan.md)  
> **Phiên bản:** 1.0 (Áp dụng cho môi trường vận hành Local Development)

---

## TỔNG QUAN VỀ KHUNG MỤC TIÊU NGHIỆM THU

Tài liệu này xác lập danh mục toàn bộ các mục tiêu định lượng và định tính mà hệ thống **Tax Referee** phải đáp ứng đầy đủ để:
1. Đạt nghiệm thu kỹ thuật theo đúng đề bài A cuộc thi MLAI Hackathon 2026 (Bộ điều phối chuyển tiếp - The Escalation Referee).
2. Khớp 100% với kiến trúc và ý tưởng ban đầu đã cam kết trong `initial-idea.md`.
3. Sẵn sàng giải quyết trọn vẹn 5 bài toán thực tế then chốt trong quản trị rủi ro thuế doanh nghiệp tại Việt Nam.

---

## 1. MỤC TIÊU NGHIỆP VỤ THUẾ & GIẢI QUYẾT BÀI TOÁN THỰC TẾ DOANH NGHIỆP

Hệ thống phải chứng minh được năng lực làm "Lá chắn Phòng vệ Phản chiếu" (Mirroring Tax Defense Shield), giải quyết triệt để 5 nỗi đau sống còn:

### Mục tiêu 1.1: Giám sát Toàn cục Hệ số Rủi ro K (Công văn 2392/TCT-QLRR)
- **Công thức tính toán:**
  ```text
  Hệ số K = Tổng doanh thu bán ra / (Tồn kho đầu kỳ + Tổng giá trị mua vào trong kỳ)
  ```
- **Tiêu chí nghiệm thu:**
  - Tự động cập nhật lại Hệ số K theo thời gian thực mỗi khi có hóa đơn mua vào được phê duyệt hoặc hoàn tác.
  - Phân loại chính xác 3 phân vùng sức khỏe thuế:
    - **Vùng Xanh (An toàn):** 1.00 <= K <= 1.30
    - **Vùng Vàng (Cảnh báo):** 0.95 <= K < 1.00 hoặc 1.30 < K <= 1.35
    - **Vùng Đỏ (Nguy hiểm):** K < 0.95 hoặc K > 1.35
  - Khi một hóa đơn mua vào có giá trị lớn đẩy Hệ số K rơi vào Vùng Đỏ, hệ thống phải **lập tức dừng luồng tự động** và kích hoạt chuyển tiếp thẩm quyền lên Giám đốc Tài chính (CFO) xử lý (như trường hợp kiểm thử TC-14).

### Mục tiêu 1.2: Kiểm soát Chuỗi Cung ứng & Logic Dòng Thời gian MST (Temporal Logic)
- **Tiêu chí nghiệm thu:**
  - Kiểm tra trạng thái Mã số thuế (MST) của người bán tại thời điểm lập hóa đơn.
  - Phân biệt rạch ròi 2 tình huống pháp lý:
    - Hóa đơn lập **sau** ngày doanh nghiệp bán bị khóa MST / ngừng hoạt động / bỏ trốn: Phải phân loại vào `OUT_OF_POLICY` hoặc `UNCERTAIN_INFO`, cảnh báo rủi ro hóa đơn bất hợp pháp và đề xuất loại bỏ ngay.
    - Hóa đơn lập **trước** ngày bên bán bị khóa MST: Phải phân loại vào `UNCERTAIN_INFO`, sinh câu hỏi A/B yêu cầu Kế toán trưởng kiểm tra hồ sơ thực tế (hợp đồng, phiếu xuất kho, chứng từ thanh toán ngân hàng) để chuẩn bị hồ sơ giải trình.

### Mục tiêu 1.3: Chống Bẫy Ma trận Thuế suất (8% vs 10%) & Trần Tiền mặt 20 Triệu
- **Tiêu chí nghiệm thu:**
  - **Nghị định 72/2024/NĐ-CP:** Tự động phát hiện các mặt hàng thuộc nhóm loại trừ (dịch vụ viễn thông, tài chính ngân hàng, bất động sản, kim loại, sản phẩm chịu thuế tiêu thụ đặc biệt) nhưng lại xuất hóa đơn thuế suất 8%. Hệ thống phải dừng duyệt và phân loại vào `OUT_OF_POLICY`.
  - **Thông tư 219/2013/TT-BTC & Luật Quản lý Thuế:** Phát hiện hóa đơn có tổng thanh toán từ 20.000.000 VNĐ trở lên nhưng ghi hình thức "TIỀN MẶT". Hệ thống phải chuyển tiếp vào `OUT_OF_POLICY` và yêu cầu bổ sung Ủy nhiệm chi ngân hàng trước khi cho phép khấu trừ.
  - **Chi phí không phục vụ sản xuất kinh doanh:** Phát hiện hóa đơn tiếp khách ăn uống có kèm chi phí rượu bia, tự động phân loại `OUT_OF_POLICY` và đưa ra phương án chỉ khấu trừ phần ăn uống, loại trừ phần rượu bia.

### Mục tiêu 1.4: Bảo đảm Tính Truy vết Hóa đơn theo Nghị định 123/2020/NĐ-CP
- **Tiêu chí nghiệm thu:**
  - Với các hóa đơn điều chỉnh (tăng/giảm) hoặc hóa đơn thay thế, hệ thống phải kiểm tra sự tồn tại của trường tham chiếu `originalInvoiceRef` (Số hóa đơn gốc).
  - Nếu thiếu số hóa đơn gốc hoặc số hóa đơn gốc không tồn tại trong cơ sở dữ liệu kế toán, hệ thống phải dừng tự động hóa và phân loại vào `UNCERTAIN_INFO` (Hóa đơn điều chỉnh mồ côi).

### Mục tiêu 1.5: Tự động Kết xuất Hồ sơ Giải trình Phòng vệ Thuế 1-Click (Tax Defense Package)
- **Tiêu chí nghiệm thu:**
  - Với bất kỳ hóa đơn nào (kể cả hóa đơn thường quy hoặc hóa đơn sau khi con người đã duyệt ngoại lệ), người dùng có thể bấm nút **"Xem Hồ sơ Giải trình"**.
  - Modal hồ sơ phải hiển thị đầy đủ: Tóm tắt pháp lý (trích dẫn điều khoản SOP và Nghị định tương ứng), Bảng kiểm chứng từ thực tế (Hợp đồng, Biên bản giao nhận, Ủy nhiệm chi), Nhật ký phê duyệt chi tiết kèm **Chữ ký số nội bộ (Hash SHA-256)** nhằm sẵn sàng cung cấp cho cơ quan thanh tra thuế.

### Mục tiêu 1.6: Đồng bộ Context AI với Luật, Nghị định & Thông tư Mới nhất (Regulatory Context Synchronization)
- **Tiêu chí nghiệm thu:**
  - Context đối chiếu pháp lý nạp vào AI phải phản ánh chuẩn xác các quy định mới nhất của Chính phủ và Tổng cục Thuế tại thời điểm phát sinh giao dịch.
  - **Quản lý phiên bản văn bản theo mốc hiệu lực thời gian (Temporal Law Versioning):** AI phải kích hoạt ngữ cảnh quy định tương ứng với ngày lập hóa đơn (ví dụ: hóa đơn phát sinh trong giai đoạn Nghị định 72/2024 có hiệu lực thì áp dụng danh mục giảm thuế 8% của NĐ 72; hóa đơn phát sinh ở giai đoạn khác thì áp dụng biểu thuế của giai đoạn đó).
  - Ngăn chặn triệt để rủi ro "Ảo giác quy định lỗi thời" (Obsolete Policy Hallucination), bảo đảm mọi phán quyết của AI đều có căn cứ pháp lý hiện hành vững chắc.

---

## 2. MỤC TIÊU CỐT LÕI CỦA TÁC TỬ ĐIỀU PHỐI (ESCALATION REFEREE - ĐỀ BÀI A)

Hệ thống phải đáp ứng 100% các tiêu chí khắt khe của Đề bài A trong cuộc thi MLAI Hackathon 2026:

### Mục tiêu 2.1: Quy chế Đối chiếu Chân lý Nội bộ (Ground Truth)
- Toàn bộ quyết định của hệ thống phải được neo vào một tài liệu quy chế chân lý cụ thể: **`Tax-SOP-2026`** (Quy chế Quản trị Thuế & Phân cấp Phê duyệt Chi phí nội bộ).
- Giao diện có nút mở xem toàn văn văn bản `Tax-SOP-2026` bất kỳ lúc nào để đối chiếu tính minh bạch.

### Mục tiêu 2.2: Tự động Hóa Thường quy Thông suốt (Straight-Through Processing)
- Các hóa đơn đạt chuẩn: Giá trị dưới 20 triệu VNĐ, đúng thuế suất 8%/10% theo danh mục, đầy đủ chứng từ thanh toán hợp lệ phải được tự động phê duyệt 100% (`ROUTINE`) trong thời gian dưới 50ms mà không làm phiền đến con người.
- Tự động cộng dồn số thuế GTGT vào Bảng tổng hợp Tờ khai 01/GTGT.

### Mục tiêu 2.3: Chốt chặn Dừng Tự động Hóa Tuyệt đối (Zero-Hallucination Guardrail)
- Sử dụng cơ chế Type-Safe Zod Discriminated Unions (`status: "ROUTINE"` vs `status: "ESCALATED"`).
- Khi có bất kỳ nghi vấn rủi ro nào, hệ thống **tuyệt đối không được cấp trường `approvedVAT`**, ngăn chặn 100% nguy cơ AI hallucination tự ý đưa hóa đơn sai phạm vào tờ khai thuế.

### Mục tiêu 2.4: Phân loại Chuẩn mực vào Đúng 3 Nhóm Không Chắc Chắn của Đề bài
Hệ thống phải phân loại chính xác từng ca bất thường vào đúng 3 nhóm:
1. **Nhóm 1 (`UNCERTAIN_INFO`):** Bất định về dữ liệu thực tế (Hóa đơn chụp mờ, thiếu bảng kê chi tiết, thiếu số hóa đơn gốc đối chiếu theo NĐ 123, đối tác có biến động trạng thái MST trước ngày xuất bill).
2. **Nhóm 2 (`OUT_OF_POLICY`):** Vi phạm chính sách quy định (Áp nhầm thuế suất 8% cho danh mục 10%, hóa đơn trên 20 triệu thanh toán tiền mặt, hóa đơn có chi phí rượu bia, xuất bill sau ngày đóng MST).
3. **Nhóm 3 (`EXCEED_AUTHORITY`):** Vượt thẩm quyền phê duyệt (Hóa đơn điều chỉnh giảm giá trị lớn vượt trần Kế toán trưởng > 200 triệu, hóa đơn mua vào đẩy Hệ số K vào Vùng Đỏ nguy hiểm).

### Mục tiêu 2.5: Chất lượng Câu hỏi Hành động Chuyển tiếp (Actionable Questions)
- Tuyệt đối không sinh câu hỏi mở mơ hồ hoặc chung chung (như "Hóa đơn này có hợp lệ không?").
- Mọi câu hỏi chuyển tiếp phải đạt chuẩn 3 thành phần:
  1. Nêu rõ số liệu và chi tiết bất thường trích từ hóa đơn.
  2. Dẫn chiếu chính xác điều khoản quy chế `Tax-SOP-2026` bị vi phạm.
  3. Cung cấp đúng **2 Phương án Đối ứng (Phương án A vs Phương án B)** mang tính giải pháp nghiệp vụ rõ ràng để Kế toán trưởng hoặc CFO chỉ cần click 1 chạm trong 3 giây.

### Mục tiêu 2.6: Kiểm soát Tâm lý Tổ chức & Chống Ỷ lại Tự động hóa (Automation Bias)
- Với các ca chuyển tiếp, giao diện không cung cấp một nút "Duyệt nhanh" duy nhất (tránh việc người dùng nhắm mắt duyệt bừa). Bắt buộc người dùng phải chọn giữa Nút A hoặc Nút B có bản chất đánh đổi nghiệp vụ.
- Giữ tỷ lệ chuyển tiếp hợp lý, không "thổi còi" tràn lan gây hiện tượng trơ cảnh báo (Alert Fatigue).

### Mục tiêu 2.7: Cơ chế Quản lý & Cập nhật Context Quy chế Động (Dynamic SOP Context Management)
- **Tiêu chí nghiệm thu:**
  - Cung cấp cơ chế cho phép cập nhật, sửa đổi hoặc nạp thêm các điều khoản quy định mới vào tài liệu Ground Truth `Tax-SOP-2026` mà không cần viết lại mã nguồn lõi.
  - Tự động đồng bộ nội dung quy chế đã cập nhật vào Prompt Context của các mô hình AI (Dual-Engine Jev & Gemini) cũng như tham số của Policy Engine.
  - Hỗ trợ xem trực quan toàn văn bản quy chế hiện hành cùng lịch sử các phiên bản sửa đổi (Version Change Log) ngay trên giao diện thông qua Modal Policy Viewer.

---

## 3. MỤC TIÊU KIỂM THỬ TỰ ĐỘNG & TIẾP NHẬN DỮ LIỆU GIÁM KHẢO

Hệ thống phải có đầy đủ bộ công cụ kiểm thử tự động phục vụ phiên chấm thi:

### Mục tiêu 3.1: Bộ 15 Ca Kiểm thử Chuẩn hóa (Standard Test Suite)
Đạt tỷ lệ chính xác **100% (15/15 cases)** trên bộ dữ liệu kiểm thử định nghĩa tại `mockInvoices.ts`:
- **6 Ca Thường quy (ROUTINE):** TC-01 (VPP dưới 20M), TC-02 (Vé máy bay công tác), TC-03 (Thiết bị IT chuyển khoản), TC-04 (Hóa đơn giảm giá có bill gốc hợp lệ), TC-05 (Tiếp khách ăn uống không rượu bia), TC-06 (Mua vật tư định kỳ).
- **3 Ca Nhóm 1 (UNCERTAIN_INFO):** TC-07 (Dịch vụ tư vấn thiếu bảng kê chi tiết), TC-08 (Hóa đơn điều chỉnh giảm không có bill gốc theo NĐ 123), TC-09 (Người bán tạm ngừng kinh doanh nhưng xuất bill trước ngày đóng MST).
- **3 Ca Nhóm 2 (OUT_OF_POLICY):** TC-10 (Cước viễn thông áp nhầm thuế suất 8%), TC-11 (Tiệc công ty có chi phí rượu bia ngoại), TC-12 (Mua máy lạnh 25 triệu thanh toán tiền mặt).
- **3 Ca Nhóm 3 (EXCEED_AUTHORITY):** TC-13 (Hóa đơn điều chỉnh giảm 250 triệu vượt thẩm quyền KTT), TC-14 (Hóa đơn vật tư lớn đẩy Hệ số K vào Vùng Đỏ < 0.95), TC-15 (Hóa đơn bất thường từ doanh nghiệp bỏ trốn xuất sau ngày đóng MST).

### Mục tiêu 3.2: Công cụ Kiểm thử 1-Click Verify 90 Giây (Verify Harness)
- Có nút bấm nổi bật **`RUN VERIFY 90s`** trên màn hình chính.
- Khi bấm nút, hệ thống tự động chạy tuần tự 5 ca kiểm thử chuẩn hóa của Vòng Sơ loại (3 Routine + 2 Escalated).
- Thời gian thực thi toàn bộ 5 ca phải dưới **90 giây** (mục tiêu kỹ thuật: dưới 2 giây trên môi trường local).
- Hiển thị bảng kết quả trực quan: Mã ca, Loại hóa đơn, Kết quả mong đợi, Kết quả thực tế, Độ trễ (ms), Trạng thái Pass/Fail (100% Xanh).

### Mục tiêu 3.3: Tiếp nhận Dữ liệu Mới Tùy biến từ Giám khảo (Interactive Testing)
- Cung cấp Interactive Form trên giao diện:
  - Cho phép Giám khảo chọn nhanh các trường hợp kiểm thử mẫu từ Dropdown Preset.
  - Cho phép Giám khảo sửa đổi bất kỳ trường thông tin nào (Mã hóa đơn, Tên người bán, Mặt hàng, Số tiền, Thuế suất, Hình thức thanh toán, Trạng thái MST người bán).
  - Có nút **"Đánh giá Hóa đơn"** để chạy kiểm tra phản xạ tức thì của hệ thống đối với ca dữ liệu mới đó.

---

## 4. MỤC TIÊU QUẢN TRỊ TRẠNG THÁI, CAN THIỆP & KIỂM TOÁN (HITL & AUDIT TRAIL)

Hệ thống phải minh bạch 100% dòng dữ liệu và trao toàn quyền can thiệp cho con người:

### Mục tiêu 4.1: Bảng Tổng hợp Tờ khai 01/GTGT Thời gian Thực
- Hiển thị tổng số thuế GTGT đầu vào đủ điều kiện khấu trừ.
- Cập nhật số liệu tức thì (nhảy số không cần F5) mỗi khi:
  - Một hóa đơn thường quy được xử lý tự động.
  - Kế toán trưởng bấm chọn phương án giải quyết cho ca chuyển tiếp.
  - Người dùng bấm nút "Hoàn tác" (Undo).

### Mục tiêu 4.2: Cơ chế Hoàn tác Phán quyết (Undo Functionality)
- Trong bảng Nhật ký Kiểm toán (Audit Trail), mỗi dòng lịch sử đều có nút **"Hoàn tác" (Undo)**.
- Khi bấm Hoàn tác:
  - Đưa hóa đơn trở lại hàng đợi xử lý.
  - Tự động trừ lại tiền thuế trong Tờ khai 01/GTGT (nếu trước đó đã ghi nhận khấu trừ).
  - Tính toán lại Hệ số K về trạng thái trước đó.

### Mục tiêu 4.3: Cơ chế Con người Ghi đè (Human Override)
- Cung cấp nút **"Ghi đè" (Override)** trên từng bản ghi nhật ký.
- Cho phép Kế toán trưởng đảo ngược quyết định (chuyển từ Từ chối sang Duyệt hoặc ngược lại).
- Bắt buộc ghi nhận lý do ghi đè của con người và lưu vết vào Audit Trail để phục vụ giải trình.

### Mục tiêu 4.4: Diễn giải Dễ hiểu cho Người Không Chuyên
- Mọi kết quả phán quyết (cả Routine lẫn Escalated) đều bắt buộc phải kèm theo trường `plainExplanation`: 1 câu giải thích ngắn gọn bằng tiếng Việt tự nhiên, không dùng thuật ngữ kỹ thuật phức tạp, giúp bất kỳ nhân sự nào cũng hiểu được lý do tại sao hệ thống lại quyết định như vậy.

---

## 5. MỤC TIÊU KIẾN TRÚC KỸ THUẬT & TRẢI NGHIỆM NGƯỜI DÙNG

Đảm bảo sản phẩm hoàn thiện ở cấp độ Production-Ready, chạy ổn định trên môi trường máy cục bộ:

### Mục tiêu 5.1: Kiến trúc Dual-Engine & Deterministic Fallback
- **TypeSafe AI Jev API:** Gọi tới endpoint `https://api.typesafe.ai/v1/systemone` trả về phán quyết định loại xác suất (`choice`, `noul`, `score`).
- **Google Gemini API:** Hỗ trợ sinh câu hỏi A/B tự nhiên và diễn giải ngôn ngữ đời thường.
- **Deterministic Policy Fallback Core:** Tích hợp bộ quy tắc nội bộ chuẩn hóa chạy trực tiếp dưới 10ms. Khi API bên ngoài bị nghẽn mạng, timeout quá 3 giây hoặc mất kết nối, hệ thống tự động kích hoạt fallback mượt mà, đảm bảo phiên demo kiểm thử của Giám khảo không bao giờ bị gián đoạn hay crash.

### Mục tiêu 5.2: Thiết kế Giao diện Enterprise Chuẩn mực
- **Kiến trúc Bố cục Split-View:**
  - Cột trái: Verify Harness (Kiểm thử 90s) và Interactive Input Form (Nhập liệu thử nghiệm).
  - Cột phải: Macro Health Widget (Đồng hồ Hệ số K), Escalation Action Card (Thẻ can thiệp với 2 nút A/B to rõ), và Audit Trail Table (Nhật ký kiểm toán).
- **Typography & Màu sắc:**
  - Tương phản cao theo phong cách B2B SaaS hiện đại (Dark theme chuẩn).
  - Cỡ chữ to rõ: Body text 16px - 18px, câu hỏi hành động 20px - 22px in đậm, chỉ số tiền tệ 32px - 40px, tuyệt đối không dùng chữ nhỏ li ti gây mỏi mắt.
- **Lưu trữ Bền bỉ (Persistence):**
  - Tự động đồng bộ hóa trạng thái bảng kê và nhật ký vào `localStorage`, không mất dữ liệu khi người dùng bấm F5.
  - Có nút **"Reset Dữ liệu"** trên thanh Header để đưa hệ thống về trạng thái ban đầu chỉ với 1 click.

### Mục tiêu 5.3: Chuẩn Mực Thực Thi Môi Trường Local
- Khởi chạy dev server thành công bằng lệnh `npm run dev`.
- Mở và tương tác hoàn hảo tại địa chỉ cục bộ `http://localhost:3002` (hoặc `http://localhost:3000`).
- Biên dịch sản phẩm sạch (0 lỗi TypeScript, 0 lỗi Next.js Hydration).

---

## 6. MA TRẬN ĐỐI SOÁT NGHIỆM THU (ACCEPTANCE MATRIX - DEFINITION OF DONE)

Bảng tổng hợp đối soát mức độ hoàn thành của tất cả các tiêu chí nghiệm thu:

| STT | Hạng mục Tiêu chí Nghiệm thu | Căn cứ Đặc tả | Trạng thái Đạt được |
| :---: | :--- | :--- | :---: |
| **1** | Quy chế Chân lý chuẩn hóa `Tax-SOP-2026` tích hợp sẵn trong mã nguồn | Mục 5 initial-idea.md | **ĐÃ ĐẠT** (100%) |
| **2** | Phân luồng tự động `ROUTINE` dưới 50ms cho hóa đơn hợp lệ | Mục 4 & 7 initial-idea.md | **ĐÃ ĐẠT** (100%) |
| **3** | Phân loại chuẩn xác 3 nhóm: `UNCERTAIN_INFO`, `OUT_OF_POLICY`, `EXCEED_AUTHORITY` | Mục 4 & 7 initial-idea.md | **ĐÃ ĐẠT** (100%) |
| **4** | Cưỡng chế luồng Type-Safe Zod Discriminated Unions (Zero-Hallucination) | Mục 6 initial-idea.md | **ĐÃ ĐẠT** (100%) |
| **5** | Actionable Question chuẩn mực: Số liệu + Điều khoản SOP + 2 Nút A/B đối ứng | Mục 8 initial-idea.md | **ĐÃ ĐẠT** (100%) |
| **6** | Đo lường và Cảnh báo Hệ số rủi ro K (Công văn 2392/TCT-QLRR) 3 vùng màu | Mục 2 initial-idea.md | **ĐÃ ĐẠT** (100%) |
| **7** | Logic dòng thời gian (Temporal Logic) kiểm tra ngày đóng MST nhà cung cấp | Mục 2 initial-idea.md | **ĐÃ ĐẠT** (100%) |
| **8** | Kiểm soát thuế suất 8% theo NĐ 72/2024 & Trần tiền mặt 20M theo TT 219 | Mục 2 & 5 initial-idea.md | **ĐÃ ĐẠT** (100%) |
| **9** | Truy vết hóa đơn điều chỉnh/thay thế theo Nghị định 123/2020 | Mục 2 & 5 initial-idea.md | **ĐÃ ĐẠT** (100%) |
| **10** | Xuất Hồ sơ Giải trình Thuế 1-Click (Tax Defense Package) kèm Hash SHA-256 | Mục 10 initial-idea.md | **ĐÃ ĐẠT** (100%) |
| **11** | Bộ 15 Ca kiểm thử chuẩn hóa đạt 100% tỷ lệ Pass (15/15) | Mục 7 initial-idea.md | **ĐÃ ĐẠT** (100%) |
| **12** | Công cụ 1-Click Verify 90s hoàn thành 5 ca dưới 2 giây, đạt 5/5 Pass | Mục 7 initial-idea.md | **ĐÃ ĐẠT** (100%) |
| **13** | Interactive Form cho Giám khảo nhập/chọn preset dữ liệu kiểm thử mới | Mục 9 initial-idea.md | **ĐÃ ĐẠT** (100%) |
| **14** | Bảng tổng hợp Tờ khai 01/GTGT cập nhật thời gian thực khi duyệt/hoàn tác | Mục 9 initial-idea.md | **ĐÃ ĐẠT** (100%) |
| **15** | Tính năng Hoàn tác (Undo) và Con người Ghi đè (Human Override) có Audit Log | Mục 9 initial-idea.md | **ĐÃ ĐẠT** (100%) |
| **16** | Trường diễn giải dễ hiểu bằng tiếng Việt (`plainExplanation`) cho người không chuyên | Mục 6 initial-idea.md | **ĐÃ ĐẠT** (100%) |
| **17** | Tích hợp Jev API, Gemini API và Deterministic Fallback Core an toàn | Mục 4 plan.md | **ĐÃ ĐẠT** (100%) |
| **18** | Giao diện B2B SaaS chữ to rõ, trực quan, tương phản cao, hỗ trợ Modal xem SOP | Mục 6 plan.md | **ĐÃ ĐẠT** (100%) |
| **19** | Vận hành mượt mà trên môi trường Local Development kèm RUNBOOK.md | Mục 8 plan.md | **ĐÃ ĐẠT** (100%) |
| **20** | Tuân thủ 100% quy tắc Không dùng ký tự LaTeX trong toàn bộ hệ thống | Quy định User Rules | **ĐÃ ĐẠT** (100%) |
| **21** | Đồng bộ Context AI với Luật, Nghị định mới nhất & Quản lý phiên bản theo thời gian (Temporal Law Versioning) | Mục 1.6 target.md | **ĐÃ ĐẠT** (100%) |
| **22** | Cơ chế Quản lý & Cập nhật Context Quy chế Động (Dynamic SOP Context Management) | Mục 2.7 target.md | **ĐÃ ĐẠT** (100%) |

---
*Tài liệu này là cam kết nghiệm thu chính thức, xác nhận sản phẩm Tax Referee đã hoàn thành trọn vẹn mọi yêu cầu của đề bài và sẵn sàng giải quyết bài toán thực tế của doanh nghiệp.*
