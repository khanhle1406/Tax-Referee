# Kịch bản trình bày 5 slide và demo trực tiếp — Demo Day 17/10/2026

> Người trình bày đọc trên sân khấu.
> Slide dùng bản **`NOP-BAI-Fprinciples/02_Slide-5-trang/Tax-Referee_5-slide_trinh-bay-17-10.pptx`**. Bản đã nộp giữ nguyên; bản này chỉ sửa 4 đoạn chữ, nêu ở mục 4.
> Mọi câu hỏi và số liệu trong kịch bản đã chạy thật trên live lúc 09:40 ngày 17/10, commit `94d7452`. Không nói số nào ngoài kịch bản này.

## 0. Hai phút trước khi lên

| Việc | Kỳ vọng |
|---|---|
| Mở slide bản `_trinh-bay-17-10.pptx`, chế độ trình chiếu | 5 slide, không còn ô "[Cập nhật…]" |
| Tab 1: `https://limegreen-salamander-517622.hostingersite.com/` | Trang chủ có nút **"① Chạy Verify (90 giây)"** |
| Tab 2: `…/verify` | Chọn sẵn **"9 ca giám khảo · 4 ca chung + 5 ca Đề A (khuyến nghị)"** |
| Tab 3, **cửa sổ ẩn danh**: trang chủ | Để tạo phiên demo mới, sạch |
| Tab 4: `…/trust` · Tab 5: `…/api/health` | health: `status ok`, `commit 94d7452…`, `audit.hmac: true`, `warnings: []` |
| Không bấm "Chạy 12 phép thử" liên tục | Giới hạn 10 lần / 10 phút |

---

## 1. Kịch bản 5 slide (khoảng 5 phút)

### Slide 1 — Hóa đơn sai điều kiện = tiền thuế bị mất (45 giây)
> "Mỗi hóa đơn đầu vào phải đạt nhiều điều kiện cùng lúc: từ 5 triệu phải thanh toán không dùng tiền mặt; thuế suất 8% có danh mục loại trừ thay đổi theo từng kỳ; MST người mua, người bán; và đúng người duyệt theo hạn mức.
> Sai một điều kiện là thuế GTGT đầu vào bị loại. Đó là tiền mặt, không phải giờ công.
> Có hai cách làm sai. Tự động duyệt bừa thì mất tiền. Chuyển hết cho người duyệt thì Kế toán trưởng và CFO nghẽn cuối tháng, tự động hóa không còn giá trị.
> Bài toán của chúng tôi không phải đọc hóa đơn nhanh hơn. Bài toán là **biết khi nào được tự duyệt, khi nào phải dừng, và hỏi thế nào để người duyệt trả lời ngay bằng một câu**."

### Slide 2 — Đầu vào → Xử lý → Đầu ra (75 giây)
> "Đầu vào là XML hóa đơn điện tử, PDF, ảnh hoặc nhập tay. XML đọc tất định, không qua AI. AI chỉ đọc ảnh, và chỉ được khai 14 trường nhìn thấy trên chứng từ.
> Quyết định do bộ quy tắc tất định: 24 quy tắc, không có AI, đường quyết định gọi LLM 0 lần. Căn cứ pháp lý chọn theo **ngày lập hóa đơn**: hóa đơn tháng 6/2025 xét ngưỡng 20 triệu theo Thông tư 219, hóa đơn từ 1/7/2025 xét 5 triệu theo Nghị định 181.
> Con người quyết định ở đúng ba chỗ, đúng ba kiểu dừng của đề bài:
> - **Chưa rõ thông tin:** tổng in 480 nghìn lệch tiền hàng cộng thuế 495 nghìn, hỏi Kế toán trưởng số nào đúng.
> - **Ngoài quy định:** tiếp khách có rượu vang, hỏi mục đích; chọn A thì khấu trừ 300 nghìn, chọn B thì loại 300 nghìn VAT.
> - **Vượt thẩm quyền:** 330 triệu vượt hạn mức 200 triệu của Kế toán trưởng, chuyển thẳng CFO.
> Mỗi câu hỏi có số tiền, có hai đáp án mang hệ quả bằng đồng. Người duyệt trả lời một lần, kiểu '1A, 2A'."

### Slide 3 — Tác động: đo trước/sau có phương pháp (60 giây)
> "Chúng tôi đo trên cùng 11 ca diễn tập kiểu giám khảo, giữa bản 13/10 và bản 15/10. Ca xử lý đúng tăng từ 3 lên 11 trên 11. Ca thường quy bị hỏi thừa giảm từ 3 về 0. Ca chuyển sai nhóm giảm từ 4 về 0. Câu hỏi có số tiền và không đòi mở chứng từ gốc tăng từ 1 trên 10 lên 8 trên 8.
> Phương pháp: hai bản mã, mỗi ca một database tạm, không gọi AI. Thêm 72 ca bẫy do agent viết từ SOP: từ 66 lên 72 trên 72.
> **Giới hạn chúng tôi nói thẳng:** đây là ca do đội và AI viết, chưa phải đánh giá độc lập. Buổi thử 3 người dùng ngày 16/10 chưa cho số liệu định lượng, nên chúng tôi không báo số ước đoán.
> Giá trị tính bằng VAT đầu vào được bảo vệ và tiền phạt tránh được. Vì thế mỗi câu hỏi đều hiện 'VAT chờ quyết định'."

### Slide 4 — Kiến trúc: thật và giả lập (45 giây)
> "Phần thật: giao diện Next.js; lõi 24 quy tắc tất định; đọc XML 5 định dạng; Gemini Vision chỉ đọc ảnh; SQLite bền qua khởi động lại; nhật ký chỉ ghi thêm, nối chuỗi băm có HMAC; phân quyền, chống CSRF; 16 bộ test và CI trên Ubuntu, Windows.
> Phần giả lập: ERP, ngân hàng, cơ quan thuế, chỉ xuất payload. Dữ liệu kiểm thử là dữ liệu tổng hợp, ghi rõ trên slide.
> Không có vòng lặp agent: mỗi hồ sơ một lượt quy tắc, AI có timeout, quá hạn thì giữ hồ sơ. Giám khảo kiểm được bản đang chạy qua /api/health có commit."

### Slide 5 — Giới hạn, rủi ro và hướng xử lý (60 giây)
> "Rủi ro lớn nhất: khoản chi lạ ngoài danh mục rủi ro vẫn có thể tự duyệt, và người dùng tin danh sách tự xử lý mà không xem lại. Hướng xử lý: hậu kiểm ngẫu nhiên 10% ca máy tự duyệt, gấp 3 khi số tiền sát ngưỡng, và hiện lý do tự duyệt.
> Bất cập phát sinh, đội tự đánh giá: Kế toán trưởng và CFO thêm việc trả lời câu hỏi có cấu trúc; ô 'đã có ủy nhiệm chi' vẫn do kế toán tự khai; kỹ năng tự kiểm có thể mai một nếu tin máy.
> Cải tiến theo góp ý của BTC: trang /trust chạy 12 phép thử bảo mật trên chính bản đang deploy; căn cứ pháp lý đối chiếu nguyên văn và chọn theo ngày lập hóa đơn.
> Mời Ban giám khảo xem demo trực tiếp."

---

## 2. Kịch bản demo trực tiếp (khoảng 5 phút, đã chạy thử trên live)

### Bước 1 — Verify một thao tác (60 giây) · Tab 2 `/verify`
1. Chọn **"9 ca giám khảo · 4 ca chung + 5 ca Đề A (khuyến nghị)"** → bấm **"Chạy Verify"**.
2. Kết quả kỳ vọng: **9/9 đúng kỳ vọng**, có run ID và commit `94d7452`. Riêng bộ 5 ca Đề A: 3 tự xử lý, 2 chuyển tiếp, khoảng 80 ms.
3. Chỉ vào 2 ca chuyển tiếp:
   - **A-04**, tiền mặt 11.000.000₫: *Ngoài quy định*, gửi Kế toán trưởng, VAT chờ quyết định 1.000.000₫.
   - **A-05**, 275.000.000₫: *Vượt thẩm quyền*, gửi CFO, VAT chờ quyết định 25.000.000₫.
> "Một thao tác, 9 ca, kết quả kèm commit để đối chiếu. Đường quyết định không gọi AI."

### Bước 2 — Ca mới chưa từng có trong Verify (75 giây) · Tab **"Thử dữ liệu mới"**
1. Bấm ca mẫu **"Rượu vang tiếp khách"** → **"Đánh giá dữ liệu mới"**. Kỳ vọng: *Ngoài quy định*, gửi Kế toán trưởng, **2 ý**.
   - Ý 1: mục đích khoản chi. A: tiếp khách theo quy chế, khấu trừ 300.000₫. B: chi cá nhân, loại 300.000₫ VAT.
   - Ý 2: đã có bảng kê chi tiết chưa.
   - Dòng cuối: "Trả lời một lần, ví dụ: 1A, 2A".
2. Bấm **"Laptop 330 triệu (vượt quyền)"** → **"Đánh giá dữ liệu mới"**. Kỳ vọng: *Vượt thẩm quyền*, trạng thái **WAITING_CFO**, "330.000.000₫ ≥ hạn mức tự duyệt của Kế toán trưởng 200.000.000₫".
3. (Nếu còn giờ) **"Thường quy: nước uống 540.000₫"**: tự duyệt **APPROVED**, không hỏi gì.
> "Ba kiểu dừng, ba cách hỏi khác nhau. Ca thường quy đi thẳng, không làm phiền ai."

### Bước 3 — Người duyệt trả lời, nhật ký ghi lại (90 giây) · Tab 3 ẩn danh
1. Trang chủ → chọn vai **Kế toán trưởng** → **"② Mở hộp chuyển tiếp — demo riêng"**. Phiên có sẵn 4 ca mẫu `MAU-0009001…0009004`.
2. Mục **"Thẩm định"**: mở ca **MAU-0009003** (tiếp khách, rượu vang) → khung **"Trả lời một lần"** → chọn **1A, 2A** → ghi lý do (từ 8 ký tự) → gửi. Hồ sơ đổi trạng thái theo đáp án.
3. Thử quyền: vẫn vai Kế toán trưởng, mở **MAU-0009004** (10 laptop, 330 triệu) và trả lời. Hệ thống **chặn**: "Hồ sơ cần CFO trả lời." (đã thử trên live 17/10).
4. Đổi vai **CFO** ở góc trên → mở lại MAU-0009004 → trả lời → duyệt.
5. Mục **"Nhật ký"**: từng thao tác có người, vai trò, thời điểm; nhật ký chỉ ghi thêm, nối chuỗi băm.
> "Ai quyết, lúc nào, dựa trên dữ liệu nào đều có trong nhật ký. Kế toán trưởng không duyệt thay CFO được, kể cả khi sửa số tiền."

### Bước 4 — Bằng chứng bảo mật trên chính bản đang chạy (45 giây) · Tab 4 `/trust`
1. Chỉ dòng "Bản đang chạy: commit … · HMAC bật".
2. Bấm **"Chạy 12 phép thử tấn công"** → **12/12 đạt**.
3. Đọc dòng **D2**: "tin AI: ROUTINE → có ranh giới: ESCALATED".
> "Đây là agent đọc ảnh bị chiếm, tự khai đã có ủy nhiệm chi. Qua ranh giới, khai báo đó bị loại và ca phải hỏi người."

### Bước 5 — `/api/health` (15 giây) · Tab 5
Chỉ lần lượt: `commit` · `audit.hmac: true` · `warnings: []` · `ai.decisionPathLlmCalls: 0`.
> "Truy được bản mã đang chạy; nhật ký có HMAC; không có LLM trên đường quyết định."

### Nếu sự cố
- **Live chậm hoặc lỗi:** dùng bằng chứng trong `docs/evidence/` (JSON live 16/10: Verify 9/9, /trust 12/12) và video demo trong `NOP-BAI-Fprinciples/03_Video-demo/`. Nói rõ giờ chụp và commit.
- **Ca mẫu trong workspace không thấy:** mở cửa sổ ẩn danh mới để tạo phiên demo khác.
- **Không nói** tính năng của PR #13 (nhiều thuế suất, ô tô tải, thuê văn phòng…) như đã có trên live, khi PR này chưa merge.

---

## 3. Bản rút gọn 3 phút (khi bị cắt giờ)
Slide 1 (20 giây) → Slide 2 (40 giây) → Demo bước 1 và bước 2 (90 giây) → Slide 5 (30 giây).

## 4. Những gì đã sửa trong bản slide `_trinh-bay-17-10`
| Slide | Bản đã nộp | Bản trình bày | Lý do |
|---|---|---|---|
| 1 | "8% có danh mục loại trừ (viễn thông, **CNTT**, tài chính…)" | "…theo kỳ (viễn thông, tài chính, bất động sản, hàng chịu TTĐB…)" | Từ 01/7/2025, NQ 204/2025 cho CNTT được giảm 8%; mã đã chọn danh mục theo kỳ |
| 3 | Ô "[Cập nhật 16/10] … __/15 … __/5 … __/3" | Ghi chưa có số liệu định lượng của buổi thử, cộng số đo trên live 17/10 | Không để ô trống, không bịa số người dùng |
| 5 | Hai ô "[Cập nhật 16/10]" | Bất cập do đội tự đánh giá (ghi rõ), cải tiến theo góp ý BTC | Như trên |

Câu hỏi đáp Q1/Q2 và 12 câu hỏi khó: xem `docs/handoff/the-nhac-thuyet-trinh-17-10.md`.
