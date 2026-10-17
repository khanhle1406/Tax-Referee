# Tính năng nổi bật — Tax Referee

**Đội:** Fprinciples · **Đề A:** The Escalation Referee · **Live:** https://limegreen-salamander-517622.hostingersite.com (không cần tài khoản)

Tax Referee là trọng tài hóa đơn điện tử đầu vào cho kế toán doanh nghiệp: **tự xử lý ca thường quy, dừng đúng lúc và hỏi đúng người** khi hóa đơn chưa rõ thông tin, ngoài quy định hoặc vượt thẩm quyền. Quy tắc quyết định, AI chỉ đọc chứng từ, con người giữ quyền quyết định cuối và mọi bước đều để lại dấu vết.

| # | Tính năng | Giám khảo tự thử trên live |
|---|---|---|
| 1 | **Kiểm chứng một nút, tất định** | Trang chủ → ① Chạy Verify → Chạy Verify: 9 ca, có giờ từng ca |
| 2 | **Hỏi thay vì đoán** | /verify → Thử dữ liệu mới → "Lệch tổng: 480.000₫ hay 495.000₫?" |
| 3 | **Đúng ba kiểu dừng, không hỏi thừa** | ② Demo riêng → 4 ca mẫu: 1 tự xử lý + 1 ca mỗi kiểu dừng |
| 4 | **Một câu hỏi, đúng người** | Mở ca 0009004 → đổi vai CFO → gõ "1A, 2A" + lý do |
| 5 | **Con người nắm quyền kiểm soát** | Hoàn tác (ghi lý do) · tab Nhật ký · công tắc Tự động hóa |
| 6 | **AI đọc, quy tắc quyết định** | Tiếp nhận → tải XML/PDF/ảnh hóa đơn (ảnh ~14 giây, PDF ~26 giây) |

## 1. Kiểm chứng một nút, tất định
Trang `/verify` chạy 4 ca kiểm thử chung và 5 ca Đề A bằng quy tắc tất định, **không gọi AI**. Mỗi ca hiện kỳ vọng, thực tế, nhóm dừng, người nhận, câu hỏi chuyển tiếp và thời điểm chạy; chỉ tính đạt khi đúng trạng thái *và* câu hỏi qua kiểm tra tự động; xuất JSON/CSV. Trên live ngày 15/10: **9/9 đạt**, mỗi ca 22–50 ms. Phía sau là `npm test` 16 bộ (44 unit test + 15 bộ hồi quy, gồm 72 ca "đánh lừa" do AI viết từ SOP: lúc đầu 66/72, sau khi sửa 72/72), CI trên Ubuntu và Windows.
*Bằng chứng:* `services/verificationService.ts`, `data/verification/challengeCases.ts`, `docs/evidence/verify-live-2026-10-15.json`, `scripts/qa/run-all.ts`, `.github/workflows/ci.yml`.

## 2. Hỏi thay vì đoán
Hệ thống kiểm tra tiền hàng cộng thuế có khớp tổng, so giá trị nhập với chứng từ gốc, và **không coi trường đọc từ ảnh là đã xác minh**. Khi số tiền còn nghi vấn, nó hỏi số đúng trước rồi mới kết luận vượt thẩm quyền hay vi phạm. Ví dụ: tổng in 480.000₫ nhưng 450.000₫ + 45.000₫ thuế = 495.000₫ → Kế toán trưởng chọn A (495.000₫, sửa và đánh giá lại) hay B (480.000₫ như in, yêu cầu bên bán điều chỉnh, chưa khấu trừ).
*Bằng chứng:* `lib/invoiceMathValidator.ts`, `services/workflowService.ts`, `services/questionBuilder.ts`, `components/VerifyHarness.tsx`.

## 3. Đúng ba kiểu dừng, không hỏi thừa
SOP (25 quy tắc), engine và workflow dùng **một bảng phân loại duy nhất**, ưu tiên Ngoài quy định → Vượt thẩm quyền → Chưa rõ thông tin. Dữ kiện không làm đổi kết quả thì không hỏi: chỉ hỏi cách thanh toán khi tổng tiền (cộng cùng bên bán trong ngày) từ 5 triệu, chỉ hỏi trạng thái mã số thuế bên bán từ 20 triệu. Trên 11 ca diễn tập kiểu giám khảo (dữ liệu tổng hợp do đội viết): xử lý đúng **3/11 → 11/11**, chuyển tiếp thừa **3/3 → 0/3**.
*Bằng chứng:* `lib/riskTaxonomy.ts`, `services/policyEngine.ts`, `lib/refereeRequirements.ts`, `tests/unit/judgeRehearsal.test.ts`, `tests/unit/taxonomy.test.ts`.

## 4. Một câu hỏi, đúng người
Mỗi câu hỏi ghi số hóa đơn, bên bán, số tiền, **phần thuế chờ quyết định** (ca 10 laptop: 30.000.000₫) và hệ quả của từng đáp án; gửi Kế toán trưởng, hoặc CFO khi từ 200 triệu. Ca nhiều vấn đề gộp thành ý đánh số, **trả lời một lần ngay trên hồ sơ** ("1A, 2A"). Đáp án nào cũng có hệ quả thật: chọn "đã trả tiền mặt" cho hóa đơn từ 5 triệu thì hồ sơ bị từ chối khấu trừ 1.100.000₫, không bị hỏi lại; mọi tổ hợp A/B của 3 ca mẫu đều có unit test.
*Bằng chứng:* `services/questionBuilder.ts`, `components/HandoffAnswerPanel.tsx`, `app/api/invoices/[id]/answer/route.ts`, `tests/unit/answerCombos.test.ts`.

## 5. Con người nắm quyền kiểm soát
Người duyệt phải là tài khoản khác người nhập; ca từ 200 triệu chỉ CFO được quyết; ai sửa số tiền, mã số thuế hay tên hàng sau khi hồ sơ đã chuyển tiếp thì Kế toán trưởng/CFO phải xác nhận lại. **Nhật ký chỉ ghi thêm** (trigger SQLite chặn sửa/xóa), mỗi sự kiện nối chuỗi SHA-256 (ký thêm HMAC khi đặt khóa `TAX_REFEREE_AUDIT_KEY`), ghi ai làm, lúc nào, dữ liệu trước/sau, quy chế, lý do; dừng và hoàn tác là sự kiện mới. **Công tắc Tự động hóa** dừng toàn hệ thống: ca thường quy chờ duyệt tay, mỗi lần bật/tắt ghi người làm và lý do.
*Bằng chứng:* `services/workflowService.ts`, `lib/server/audit.ts`, `lib/server/db.ts`, `services/automationControl.ts`, `tests/unit/auditIntegrity.test.ts`, `tests/unit/automationSwitch.test.ts`.

## 6. AI đọc, quy tắc quyết định
Parser hóa đơn điện tử XML theo định dạng Viettel, MISA, VNPT, FPT và Tổng cục Thuế (chặn DOCTYPE/ENTITY để tránh XXE); ảnh và PDF scan đọc qua Gemini Vision (đo 15/10 với key thật: ảnh ~14 giây, PDF ~26 giây); từ 16/10 hệ thống chỉ nhận đúng 14 trường nhìn thấy trên chứng từ — các sự kiện không thể thấy trên ảnh (UNC, trạng thái MST, bảng kê…) AI có "khai" cũng bị loại, phải do người cung cấp và xác minh; trường đọc chưa chắc phải được KTT/CFO khác người nhập xác minh. **Mọi quyết định thuế do quy tắc tất định** trong một lượt, không có vòng lặp agent; lượt đánh giá quá hạn chuyển "chờ bổ sung".
*Bằng chứng:* `lib/documentParser.ts`, `services/geminiService.ts`, `app/api/documents/parse/route.ts`, `input-sample/`.

## Giá trị cho doanh nghiệp
Định giá theo **thuế đầu vào được bảo vệ và tiền phạt tránh được**, không theo giờ công: mỗi câu hỏi hiện "VAT chờ quyết định", người duyệt chỉ xem những ca thật sự cần mình.

> Giới hạn (nói thật): dữ liệu kiểm thử là tổng hợp, chưa phải đánh giá độc lập; "ngoài phạm vi" nhận diện bằng từ khóa nên chi cá nhân đặt tên khác có thể lọt; đọc ảnh/PDF cần người kiểm tra. Buổi thử với người dùng do BTC điều phối diễn ra 16/10; BTC xác nhận buổi thử ổn, không có phản hồi chi tiết bằng văn bản, nên repo không công bố số liệu người dùng. Chi tiết: [README](../../README.md) mục "Bằng chứng và giới hạn".
