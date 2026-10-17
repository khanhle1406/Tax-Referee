# PROPOSAL · Tax Referee

> 📌 **Ảnh chụp lịch sử** — bản nộp 15/10/2026 (`referee-contract-2026-10-15`, 24 quy tắc; `RULE_CATALOG` 25 mục). Hiện hành: `referee-contract-2026-10-16`, 25 quy tắc (`data/policyContract.ts`), `RULE_CATALOG` 26 mục (13/10/3). Buổi thử người dùng 16/10 không có phản hồi chi tiết bằng văn bản nên repo không công bố số liệu người dùng. Số liệu hiện hành: [README](../../README.md), trang `/verify`, `/sop` và `docs/evidence/`.

**Trọng tài hóa đơn điện tử đầu vào cho kế toán doanh nghiệp Việt Nam: tự xử lý ca thường quy, dừng đúng lúc, hỏi đúng người.**

MLAI Hackathon 2026 · Track VNG · Đề A "The Escalation Referee" · Bản nộp ngày 15/10/2026

---

## Thông tin đội & liên kết

| Mục | Nội dung |
|---|---|
| Đội | **Fprinciples** |
| Thành viên | Khánh Lê ([@khanhle1406](https://github.com/khanhle1406)): trưởng nhóm, kiến trúc lõi · Minh ([@bminhnemhoi](https://github.com/bminhnemhoi)): logic lõi và gia cố hệ thống · Tiến ([@Towfienes](https://github.com/Towfienes)): đóng góp mã và tài liệu |
| Đề bài | A · The Escalation Referee |
| **Live URL** (không cần tài khoản, không cần cài đặt) | https://limegreen-salamander-517622.hostingersite.com |
| **Verify harness** (một nút, 9 ca, có dấu thời gian) | https://limegreen-salamander-517622.hostingersite.com/verify |
| SOP đang chạy (sinh từ chính bộ quy tắc) | https://limegreen-salamander-517622.hostingersite.com/sop |
| Phiên bản đang chạy (commit, policy hash, head hash nhật ký) | https://limegreen-salamander-517622.hostingersite.com/api/health |
| **Mã nguồn công khai** (đủ lịch sử commit) | https://github.com/khanhle1406/Tax-Referee |
| **Runbook** (clone sạch → chạy → kiểm chứng) | https://github.com/khanhle1406/Tax-Referee/blob/main/RUNBOOK.md |

**Thử trong 90 giây:** Trang chủ → **① Chạy Verify** → **Chạy Verify** (bảng 9 ca, PASS/FAIL, giờ chạy từng ca) → quay lại → **② Mở hộp chuyển tiếp — demo riêng** → mở ca 0009004 → đổi vai **CFO** → gõ "1A, 2A" kèm lý do → **Gửi** → tab **Nhật ký**.

---

## 1. Tóm tắt điều hành

Mỗi hóa đơn GTGT đầu vào là một quyết định bằng tiền. Hóa đơn đủ điều kiện thì doanh nghiệp được khấu trừ thuế. Hóa đơn không đủ điều kiện mà vẫn kê khai thì doanh nghiệp mất khoản khấu trừ và có thể bị phạt. Hiện nay quyết định này vẫn dựa vào kế toán viên kiểm tay từng tờ, còn ca khó được đẩy lên cấp trên bằng một tin nhắn kiểu "anh xem giúp hóa đơn này".

**Tax Referee** là trọng tài đứng trước bút toán. Hệ thống làm bốn việc:

- **Tự xử lý ca thường quy:** duyệt thuế, tạo chứng từ nội bộ và ghi nhật ký, không làm phiền ai.
- **Dừng đúng ba kiểu dừng của Đề A:** *chưa rõ thông tin*, *ngoài quy định*, *vượt thẩm quyền*. Dữ kiện không làm đổi kết quả thì không hỏi.
- **Hỏi đúng người bằng một câu trả lời được ngay:** câu hỏi gửi Kế toán trưởng (KTT) hoặc CFO, có số tiền và hệ quả của từng đáp án, trả lời một lần kiểu "1A, 2B" ngay trên hồ sơ.
- **Để con người nắm quyền:** người nhập không tự duyệt được, có công tắc dừng toàn hệ thống, hoàn tác có lý do, nhật ký chỉ ghi thêm và nối chuỗi hash.

Nguyên tắc cốt lõi: **AI chỉ đọc chứng từ, quy tắc tất định ra quyết định.** Gemini 2.5 Flash chỉ trích xuất trường từ ảnh và PDF scan, và tìm trích dẫn `.gov.vn` khi tra cứu MST bên bán. Mọi phân loại và mọi con số trong câu hỏi do 24 quy tắc TypeScript và template câu hỏi tất định tạo ra, nên cùng đầu vào luôn cho cùng kết quả và kiểm chứng được.

**Đã chạy thật, có bằng chứng tái lập** (toàn bộ trên dữ liệu tổng hợp, chưa phải đánh giá độc lập):

| Bằng chứng | Kết quả | Nguồn trong repo |
|---|---|---|
| Verify trên live, 15/10/2026 | 9/9 ca đạt, tổng 268 ms, không gọi AI | `docs/evidence/verify-live-2026-10-15.json` |
| 11 ca diễn tập kiểu giám khảo, trước/sau | Xử lý đúng 3/11 → 11/11 | `docs/evidence/before-after-judge-rehearsal-2026-10-14.md` |
| 72 ca bẫy do agent AI viết từ SOP | 66/72 → 72/72, nay là bộ hồi quy | `data/verification/redteam/cases.json`, `docs/handoff/bao-cao-cai-tien-2026-10-15.md` |
| Bộ kiểm thử và CI | `npm test` 16/16 bộ; CI Ubuntu + Windows | `scripts/qa/run-all.ts`, `.github/workflows/ci.yml`, `docs/build-log-1-page.md` |

Bản nhận xét của doanh nghiệp ở Sprint 1 xếp **tiềm năng thương mại ở mức "Cao"** (`docs/assessment/Feedback_Doanh_Nghiep_Fprinciples.md`). Ngày 16/10, ba người dùng do BTC điều phối sẽ thử hệ thống và ghi quyết định của mình *trước khi* xem kết quả máy. Đây là lớp đánh giá độc lập đầu tiên của dự án.

## 2. Vấn đề & người dùng

### 2.1. Điều kiện khấu trừ ngày càng nhiều và đổi theo ngày lập hóa đơn

Từ 01/07/2022, doanh nghiệp bắt buộc dùng hóa đơn điện tử (NĐ 123/2020/NĐ-CP, TT 78/2021/TT-BTC). Hóa đơn nay đến dưới dạng XML có cấu trúc, nhưng việc *quyết định* về hóa đơn vẫn do con người làm, và điều kiện để quyết định liên tục thay đổi:

- Từ 01/07/2025, Luật Thuế GTGT số 48/2024/QH15 và NĐ 181/2025/NĐ-CP hướng dẫn luật này hạ ngưỡng bắt buộc thanh toán không dùng tiền mặt từ 20 triệu xuống 5 triệu đồng.
- NQ 204/2025/QH15 (hướng dẫn tại NĐ 174/2025/NĐ-CP) giảm thuế suất GTGT từ 10% xuống 8% từ 01/07/2025 đến 31/12/2026, nhưng loại trừ nhiều nhóm hàng hóa, dịch vụ.
- NĐ 70/2025/NĐ-CP sửa đổi NĐ 123, hiệu lực 01/06/2025.

Một hóa đơn 12 triệu đồng trả tiền mặt có thể được khấu trừ nếu lập ngày 30/06/2025, nhưng bị loại nếu lập ngày 01/07/2025. Người kiểm phải nhớ đúng quy định theo từng mốc. Tax Referee tự chọn quy định theo ngày lập hóa đơn (`data/regulatoryRegistry.ts`).

### 2.2. Hai lỗi ngược nhau, lỗi nào cũng tốn tiền

- **Tự động duyệt bừa:** thuế GTGT đầu vào bị loại khi thanh tra. Nếu khai sai dẫn đến thiếu thuế, doanh nghiệp có thể bị phạt 20% số thuế thiếu và phải nộp tiền chậm nộp (Luật Quản lý thuế 38/2019/QH14, NĐ 125/2020/NĐ-CP).
- **Chuyển hết lên người duyệt:** KTT và CFO nghẽn việc, ngoại lệ dồn về cuối kỳ, câu hỏi chung chung buộc họ mở lại chứng từ gốc mới hiểu mình đang bị hỏi gì.

Giá trị nằm ở chỗ **dừng đúng lúc**: không bỏ sót ca có rủi ro, không hỏi thừa ca thường quy.

### 2.3. Người dùng mục tiêu

| Vai trò | Việc hằng ngày | Nỗi đau | Tax Referee giúp gì |
|---|---|---|---|
| Kế toán viên | Tiếp nhận, đối chiếu bên bán, MST, ký hiệu, số học, thuế suất, hình thức thanh toán | Kiểm tay từng hóa đơn; ca khó phải nhắn hỏi | Ca thường quy tự xử lý; ca khó được soạn sẵn câu hỏi gửi đúng người |
| Kế toán trưởng | Xác minh dữ kiện nghi vấn, xử lý ca ngoài quy chế, chịu trách nhiệm số liệu kê khai (Luật Kế toán 88/2015/QH13) | Câu hỏi thiếu số liệu, phải tra lại hồ sơ | Câu hỏi có số tiền và hệ quả A/B, trả lời một lần |
| CFO | Phê duyệt khoản vượt hạn mức KTT (SOP mẫu mặc định 200 triệu, cấu hình được), cấp tiền lệ cho quy chế nội bộ | Khó biết khoản nào thật sự cần mình; thiếu dấu vết khi thanh tra | Chỉ nhận ca vượt thẩm quyền hoặc nhà cung cấp có cảnh báo; mọi quyết định có nhật ký nối chuỗi |

Phân khúc: doanh nghiệp có nhiều hóa đơn đầu vào và nhiều cấp duyệt, từ doanh nghiệp vừa và nhỏ đến tập đoàn, cùng các công ty dịch vụ kế toán.

**Chúng tôi chưa có số liệu đo** về thời gian kiểm một hóa đơn hay tỉ lệ hóa đơn phải hỏi lại tại doanh nghiệp thật. Hai chỉ số này được hỏi trực tiếp ba người dùng (câu 1–3, nhóm A, Phụ lục A); kết quả có ngày 16/10.

## 3. Giải pháp & cách hoạt động

![Hình 1. Luồng xử lý hóa đơn](../diagrams/01-pipeline.png)

<p class="cap">Hình 1. Luồng xử lý hóa đơn</p>

Hình 1 mô tả đường đi của một hóa đơn qua năm bước:

1. **Tiếp nhận.** Kế toán viên tải lên XML, PDF, ảnh hoặc nhập tay. Hệ thống băm SHA-256 nội dung để dùng lại kết quả đọc khi cùng một tệp được tải lại, và lưu chứng từ gốc.
2. **Đọc.** XML đọc bằng parser, không qua AI, chặn DOCTYPE/ENTITY để chống tấn công XXE. PDF có lớp chữ đọc bằng PyMuPDF. Chỉ ảnh và PDF scan mới gửi Gemini Vision. Trường đọc từ ảnh chỉ được tin khi qua kiểm tra số học, chữ số MST và đối chiếu nguồn; trường thiếu, mờ, lệch hoặc mâu thuẫn bị gắn cờ "chưa xác minh".
3. **Kiểm nguồn.** Mỗi trường mang nguồn (XML, PDF, AI, sổ đăng ký chính thức, suy diễn) và trạng thái (đã xác minh, nghi vấn, mâu thuẫn, thiếu). Hệ thống kiểm tiền hàng + thuế có khớp tổng không và đối chiếu MST bên bán với nguồn `.gov.vn`.
4. **Đánh giá bằng quy tắc.** Policy engine chạy 23 quy tắc SOP đúng một lượt (cộng quy tắc rà soát nguồn do workflow thêm, tổng 24), không có vòng lặp agent. Không có phát hiện thì hồ sơ là *thường quy*. Có phát hiện thì hồ sơ *chuyển tiếp*, và số thuế được khấu trừ tạm tính bằng 0.
5. **Ra quyết định.** Ca thường quy được tự duyệt và tạo chứng từ nội bộ; nếu công tắc tự động hóa đang dừng, ca thường quy chuyển KTT duyệt tay. Ca chuyển tiếp nhận một câu hỏi và được gửi tới đúng người.

![Hình 2. Ba kiểu dừng và người nhận](../diagrams/02-escalation.png)

<p class="cap">Hình 2. Ba kiểu dừng và người nhận</p>

Hình 2 cho thấy ba kiểu dừng và người nhận câu hỏi. Các ví dụ dưới đây rút gọn từ câu hỏi thật do hệ thống tạo (`services/questionBuilder.ts`):

| Kiểu dừng | Khi nào | Ví dụ câu hỏi | Người nhận |
|---|---|---|---|
| **Chưa rõ thông tin** | Dữ kiện thiếu, mờ hoặc mâu thuẫn, và dữ kiện đó làm đổi kết quả | "Tổng in 480.000₫ lệch tiền hàng + thuế = 495.000₫. A: 495.000₫, sửa và đánh giá lại; hoặc B: 480.000₫ như in, yêu cầu bên bán điều chỉnh?" | KTT |
| **Ngoài quy định** | Vi phạm điều kiện khấu trừ, hoặc khoản chi ngoài phạm vi tự duyệt (tài trợ, phạt, quà biếu, chi cá nhân…) | "Tiếp khách đối tác – rượu vang (3.300.000₫) nằm ngoài nhóm chi được tự duyệt. A: Theo quy chế, khấu trừ 300.000₫; hoặc B: Chi cá nhân, loại 300.000₫ VAT?" | KTT |
| **Vượt thẩm quyền** | Từ hạn mức KTT (200 triệu), hoặc lô hàng làm hệ số K vào vùng đỏ | "330.000.000₫ ≥ hạn mức KTT 200.000.000₫. A: CFO phê duyệt, khấu trừ 30.000.000₫; hoặc B: Tạm dừng để thẩm tra hợp đồng?" | CFO |

Ba nguyên tắc giữ cho việc dừng chính xác:

- **Thứ tự ưu tiên: Ngoài quy định > Vượt thẩm quyền > Chưa rõ thông tin.** Chữ ký cấp cao không làm hợp lệ một vi phạm điều kiện khấu trừ, nên nhóm chính phải là điều không thể "ký cho qua". Người nhận được tính riêng: có phát hiện thẩm quyền, tổng tiền từ hạn mức KTT, hoặc nhà cung cấp nằm trong danh bạ cảnh báo thì gọi CFO.
- **Không kết luận trên dữ kiện chưa xác minh.** Nếu số tiền còn nghi vấn (ảnh mờ, hoặc tổng in và tiền hàng + thuế nằm hai phía một ngưỡng), hệ thống không nói "vượt quyền" hay "vi phạm" mà hỏi số đúng trước.
- **Không hỏi thừa.** Chỉ hỏi hình thức thanh toán khi tổng tiền (gộp cùng bên bán trong ngày) đạt ngưỡng không dùng tiền mặt (5 triệu với hóa đơn từ 01/07/2025); chỉ hỏi trạng thái MST bên bán từ 20 triệu; chỉ đòi bảng kê với hóa đơn tư vấn, tiếp khách, hội nghị, dịch vụ tổng hợp thiếu chi tiết dòng hàng.

Ca có nhiều vấn đề được gộp thành các ý đánh số trong *một* câu hỏi. Người duyệt gõ "1A, 2B" kèm lý do, hệ thống áp dụng hệ quả ngay và không hỏi lại ý đã trả lời; nếu còn phát hiện khác, hồ sơ nhận câu hỏi mới cho phát hiện đó.

## 4. Tính năng nổi bật

| # | Tính năng | Điểm khác biệt | Bằng chứng |
|---|---|---|---|
| 1 | **Kiểm chứng một nút, tất định** | `/verify` chạy 4 ca chung + 5 ca Đề A bằng quy tắc, không gọi AI, có run ID, policy hash, giờ từng ca, xuất JSON/CSV. Ca chỉ đạt khi đúng trạng thái **và** câu hỏi qua kiểm tra tự động | Live 15/10: 9/9, mỗi ca 22–50 ms (`docs/evidence/verify-live-2026-10-15.json`) |
| 2 | **Hỏi thay vì đoán** | Kiểm số học, so với chứng từ gốc; trường đọc từ ảnh bị thiếu, mờ, lệch hoặc mâu thuẫn được gắn cờ chưa xác minh và phải hỏi lại; hệ thống không tự sửa số | `lib/invoiceMathValidator.ts`, `services/workflowService.ts`, `app/api/documents/parse/route.ts` |
| 3 | **Đúng ba kiểu dừng, không hỏi thừa** | SOP, engine và workflow dùng chung một bảng phân loại; ngưỡng trọng yếu loại bỏ câu hỏi không làm đổi kết quả | 11 ca diễn tập: chuyển tiếp thừa 3/3 → 0/3 (`lib/riskTaxonomy.ts`, `docs/evidence/before-after-judge-rehearsal-2026-10-14.md`) |
| 4 | **Một câu hỏi, đúng người** | Câu hỏi có số hóa đơn, bên bán, số tiền, "VAT chờ quyết định" và hệ quả từng đáp án; trả lời "1A, 2A" ngay trên hồ sơ | Ca 10 laptop 330.000.000₫ → CFO, VAT chờ quyết định 30.000.000₫ (`services/questionBuilder.ts`, `components/HandoffAnswerPanel.tsx`) |
| 5 | **Con người nắm quyền kiểm soát** | Người duyệt phải khác người nhập; KTT không quyết thay CFO; công tắc dừng toàn hệ thống; dừng và hoàn tác là sự kiện mới, không xóa lịch sử | `services/automationControl.ts`, `tests/unit/automationSwitch.test.ts` |
| 6 | **AI đọc, quy tắc quyết định** | Parser XML cho mẫu của 5 nhà phát hành (Viettel, MISA, VNPT, FPT, TCT); ảnh/PDF scan qua Gemini Vision, kết quả điền vào biểu mẫu để kế toán soát trước khi gửi đánh giá | `lib/documentParser.ts`, `services/geminiService.ts`; đo thủ công 15/10: ảnh ~14 giây, PDF scan ~26 giây (`docs/submission/danh-muc-nop-bai.md`) |

Những điểm thiết kế đáng chú ý khác:

- **Chống "rửa" ca chờ CFO.** Nếu kế toán viên sửa số tiền, MST hay tên hàng sau khi hồ sơ đã chuyển tiếp, các trường đó phải được KTT/CFO xác nhận lại, nên kế toán viên không thể tự hạ số tiền trên hồ sơ đã chuyển tiếp để né CFO (`services/workflowService.ts`, `tests/unit/answerCombos.test.ts`). Hóa đơn tách nhỏ vẫn là giới hạn đã biết (mục 10).
- **Câu trả lời có hệ quả thật.** Chọn "tiền mặt" cho hóa đơn 12.100.000₫ thì hệ thống từ chối khấu trừ 1.100.000₫ ngay, không hỏi lại (`tests/unit/answerCombos.test.ts`).
- **AI diễn đạt có rào chắn.** Chức năng nhờ AI diễn đạt lại câu hỏi mặc định tắt. Khi bật (`QGEN_AI=1`), câu diễn đạt bị chặn nếu thiếu số hóa đơn, đổi người nhận, bỏ phương án hoặc khẳng định kiểu "đã duyệt" (`services/questionGuard.ts`).
- **So khớp từ khóa theo nguyên từ.** Vẫn bắt được khi gõ không dấu, nhưng không nhầm "bìa" với "bia" hay "mũ bảo hiểm" với dịch vụ bảo hiểm.
- **Phiên demo riêng.** Mỗi phiên một database, nạp sẵn 4 ca mẫu (1 tự xử lý và 1 ca cho mỗi kiểu dừng). Giám khảo đổi vai KTT/CFO mà không ảnh hưởng dữ liệu của người khác.

## 5. Nghiên cứu nền tảng

### 5.1. Pháp lý được mã hóa thành hợp đồng quy tắc

`data/policyContract.ts` (phiên bản `referee-contract-2026-10-15`) liệt kê 24 quy tắc đang chạy: 23 do policy engine kiểm và 1 quy tắc rà soát nguồn (`RULE_SOURCE_REVIEW`) do workflow thêm. Trang SOP hiển thị cho người dùng được sinh từ chính danh sách này, và nhóm dừng của mỗi quy tắc lấy từ cùng bảng phân loại với engine, nên SOP và engine không thể lệch nhau về danh mục quy tắc và nhóm dừng. Mỗi quy tắc mang hai nhãn độc lập: **tính chất** (luật định, dữ liệu, nội bộ, thẩm quyền) và **mức xác minh pháp lý**.

| Tính chất | Số quy tắc | Ví dụ | Căn cứ dẫn chiếu |
|---|---|---|---|
| Luật định | 8 | Tiền mặt từ ngưỡng; gộp mua cùng bên bán trong ngày; thuế suất 8% cho hàng bị loại trừ hoặc ngoài thời hạn; hóa đơn lập sau ngày bên bán đóng MST; sai MST người mua; hóa đơn trùng; nhà cung cấp có cảnh báo | Luật 48/2024/QH15, NĐ 181/2025/NĐ-CP; NQ 204/2025/QH15, NĐ 174/2025/NĐ-CP; NĐ 70/2025/NĐ-CP và NĐ 254/2026/NĐ-CP (theo ghi nhận trong repo, chọn theo ngày lập); CV 2392/TCT-QLRR |
| Chất lượng dữ liệu | 12 | Ảnh mờ, lệch số học, bên bán tạm ngừng, thiếu bảng kê, mã CQT, năm ký hiệu, ngày ký; dữ kiện nguồn chưa xác minh (`RULE_SOURCE_REVIEW`, do workflow thêm) | NĐ 123/2020/NĐ-CP, TT 78/2021/TT-BTC |
| Quy chế nội bộ | 2 | Tiếp khách có đồ uống có cồn; khoản chi ngoài phạm vi SOP | SOP mẫu, Điều 2.1, 2.3 |
| Thẩm quyền | 2 | Từ hạn mức KTT; lô hàng từ 1 tỷ làm hệ số K vào vùng đỏ | SOP mẫu, Điều 3.3, 4.3 |

Bốn quyết định thiết kế:

1. **Quy định chọn theo ngày lập.** Ngưỡng không dùng tiền mặt là 20 triệu cho hóa đơn trước 01/07/2025 (TT 219/2013/TT-BTC) và 5 triệu từ mốc này.
2. **Chỉ quy chế nội bộ mới được miễn bằng tiền lệ CFO**, và tiền lệ chỉ áp dụng đúng bên bán, mục đích, hạn mức, thời hạn đã cấp. Phát hiện luật định, dữ liệu, thẩm quyền không bao giờ được "học" từ tiền lệ.
3. **Văn bản mới không tự sửa quy tắc.** Văn bản lấy từ nguồn cập nhật chỉ trở thành ứng viên ở trạng thái `NEEDS_REVIEW`, phải có người duyệt và được ghi nhật ký (`services/legal/legalUpdateService.ts`).
4. **Ghi rõ mức xác minh.** Nhãn `DOCUMENT_CONFIRMED_RULE_PENDING` nghĩa là đã đối chiếu sự tồn tại và ngày hiệu lực của văn bản, **chưa** xác nhận diễn giải từng điều khoản. Chúng tôi công khai ba điểm cần chuyên gia thuế chốt: điều khoản dẫn chiếu cho ngưỡng 5 triệu; cách nhận diện danh mục loại trừ 8% (hiện so khớp từ khóa trên tên hàng, nên quy tắc chỉ chuyển tiếp để đối chiếu, không tự kết luận sai thuế suất); và hệ số K đang được xếp là ngưỡng nội bộ.

SOP "TAX-SOP-2026" và các hạn mức là quy chế mẫu của một doanh nghiệp giả định, cấu hình được (`lib/constants.ts`).

### 5.2. Thiết kế "dừng đúng lúc"

Ở Sprint 1, doanh nghiệp chấm hệ thống đạt **2/3 kiểu dừng**. Nguyên nhân gốc: SOP, engine và workflow mỗi nơi phân loại một kiểu nên lệch nhau. Giải pháp là **một bảng phân loại duy nhất** `RULE_CATALOG` trong `lib/riskTaxonomy.ts`. Với mỗi quy tắc, bảng ghi ba thuộc tính:

- **Nhóm dừng:** 13 Chưa rõ thông tin, 10 Ngoài quy định, 2 Vượt thẩm quyền (25 mục: 24 quy tắc của hợp đồng, gồm `RULE_SOURCE_REVIEW` do workflow thêm, cộng mục dự phòng `RULE_SOURCE_CONFLICT` hiện chưa có mã phát sinh).
- **Người có thẩm quyền có được chấp nhận phát hiện đó không** (`humanAcceptable`). Phát hiện về dữ liệu (trừ ngày ký lệch và hóa đơn lập trước ngày bên bán đóng MST), tiền mặt, thuế suất, hóa đơn trùng hay MST người mua không thể "duyệt cho qua"; phải sửa bằng chứng rồi đánh giá lại.
- **Trường dữ kiện kích hoạt** (`triggerFields`). Nếu trường đó còn nghi vấn, phát hiện bị xếp xuống cuối và hệ thống hỏi dữ kiện trước.

Câu hỏi được sinh từ template tất định (`services/questionBuilder.ts`). Mỗi ý nêu lý do bằng số cụ thể và đưa hai đáp án A/B có hệ quả tính bằng đồng, kèm một hệ quả máy đọc được (`AnswerEffect`). Thiết kế này nhắm thẳng vào mức 6 điểm của đề: *người xử lý quyết định ngay trong một câu trả lời mà không cần tra lại hồ sơ gốc*. Trước khi lưu, `checkHandoff` kiểm tra câu hỏi: đúng người nhận, có số hóa đơn, có căn cứ, không lộ giá trị kỹ thuật, không bỏ sót phát hiện.

### 5.3. Phương pháp đánh giá

Ba nguyên tắc: tách dữ liệu phát triển khỏi dữ liệu đánh giá, ghi nhãn trước khi chạy, và luôn báo mẫu số.

- **Diễn tập trước/sau:** cùng 11 ca, cùng script, hai commit, database tạm, không gọi AI, có lệnh tái lập.
- **Red team:** agent AI viết ca bẫy từ tài liệu SOP mà không đọc mã engine, để tránh việc viết ca "vừa khít" với quy tắc.
- **Tự điều chỉnh ngưỡng có kiểm chứng** (`services/feedbackService.ts`), chỉ áp dụng cho ngưỡng tiền lệ quy chế nội bộ, trong biên CFO đặt:
  - cần ít nhất 10 nhãn hậu kiểm của KTT/CFO, nhãn đã ghi không được sửa đè;
  - học trên 70% phản hồi cũ, kiểm trên 30% mới nhất (tập kiểm chứng chia theo thời gian, tối thiểu 3 mẫu);
  - chỉ nhận ngưỡng mới nếu tập kiểm chứng không bỏ sót thêm và không tăng chuyển tiếp thừa; tỉ lệ luôn kèm khoảng tin cậy Wilson 95%;
  - trước khi áp dụng, 4 ca đối kháng chạy trong savepoint có thể hoàn tác; mỗi lần đổi có phiên bản, được ghi nhật ký, và CFO khôi phục được.
- **Đánh giá độc lập:** công cụ khóa nhãn bằng SHA-256 và chấm độc lập đã có (`npm run labels:lock`, `npm run evaluate:independent`). Hiện chúng tôi **chưa công bố tỉ lệ chính xác độc lập nào**.

## 6. Kiến trúc & công nghệ

![Hình 3. Kiến trúc hệ thống](../diagrams/03-architecture.png)

<p class="cap">Hình 3. Kiến trúc hệ thống</p>

Hình 3 thể hiện một kiến trúc gọn, triển khai trên Hostinger Node.js. Trình duyệt gọi qua HTTPS tới ứng dụng Next.js 15. Mọi yêu cầu ghi vào `/api` (trừ webhook) đi qua `middleware.ts` (chống CSRF), tới route handler, rồi tới các dịch vụ: tiếp nhận chứng từ, policy engine, câu hỏi chuyển tiếp, workflow và audit. Dữ liệu nằm trong SQLite (WAL), mỗi phiên demo một file riêng. Dịch vụ ngoài duy nhất trên đường live là ShopAIKey → Gemini 2.5 Flash, dùng để đọc ảnh/PDF scan và tra cứu MST với nguồn `.gov.vn`.

| Tầng | Công nghệ | Vai trò | Thật / giả lập |
|---|---|---|---|
| Ứng dụng | Next.js 15.5.27 (App Router), React 19, TypeScript 5.8, Node ≥ 20.19 | Trang `/workspace`, `/verify`, `/sop`; API trong `app/api/**` | Thật |
| Giao diện | Tailwind CSS, Radix UI, lucide-react | Thành phần kiểu shadcn/ui, dùng được trên điện thoại | Thật |
| Kiểm tra dữ liệu | Zod | Quyết định sai schema thì không được ghi | Thật |
| Lưu trữ | SQLite qua better-sqlite3 12.11.1, chế độ WAL | Database nội bộ; mỗi phiên demo một file; Verify chạy trên `:memory:` | Thật |
| Đọc XML/PDF | fast-xml-parser (chặn XXE); PyMuPDF, dự phòng pypdf | Đọc hóa đơn điện tử và PDF có lớp chữ, không qua AI | Thật |
| Đọc ảnh/PDF scan | sharp (sàng lọc ảnh); Gemini 2.5 Flash qua ShopAIKey, temperature 0, timeout 35 giây | Chỉ trích xuất trường, không phân loại | Thật khi có khóa API |
| Quyết định | Policy engine TypeScript (24 quy tắc trong hợp đồng), `lib/riskTaxonomy.ts` | Phân luồng, chọn nhóm dừng, chọn người nhận | Thật |
| Kiểm toán | Chuỗi SHA-256, HMAC-SHA256, trigger SQLite | Nhật ký chỉ ghi thêm, phát hiện chuỗi bị sửa | Thật |
| Kiểm thử & CI | node:test + tsx; GitHub Actions | 16 bộ; Ubuntu + Windows, Node 22 | Thật |
| Triển khai | Hostinger Node.js (Passenger, 1 instance), Next standalone | Phát hành theo release, rollback bằng symlink | Thật |

![Hình 4. Máy trạng thái hồ sơ](../diagrams/04-states.png)

<p class="cap">Hình 4. Máy trạng thái hồ sơ</p>

Hình 4 là máy trạng thái của một hồ sơ. Sau bước đánh giá (`EVALUATING`), hồ sơ đi tới `APPROVED` (thường quy), `WAITING_CHIEF_ACCOUNTANT` hoặc `WAITING_CFO` (chuyển tiếp), hoặc `ON_HOLD` (lỗi, câu hỏi không qua kiểm tra, quá hạn lượt đánh giá). Từ trạng thái chờ, người duyệt có thể chấp nhận, từ chối (`REJECTED`), chuyển CFO (`FORWARDED`) hoặc yêu cầu bổ sung. Dừng (`PAUSED`) và hoàn tác dùng được ở mọi trạng thái hợp lệ. Mỗi lần chuyển trạng thái là một giao dịch SQLite, tăng revision và ghi một sự kiện audit. Khóa lạc quan theo revision và mã lượt đánh giá loại bỏ kết quả về trễ.

**Ba lựa chọn kỹ thuật có chủ đích:**

1. **Không có vòng lặp agent.** Mỗi revision chạy qua quy tắc đúng một lần. Lượt đánh giá có hạn 60–300 giây; quá hạn thì hồ sơ về `ON_HOLD`.
2. **Tất định để kiểm chứng.** Verify chạy từng ca trên database bộ nhớ riêng, không gọi AI, nên kết quả không phụ thuộc hạn mức API hay tính ngẫu nhiên của mô hình.
3. **Đơn giản để vận hành.** SQLite một file và một instance đủ cho quy mô thử nghiệm. Postgres và SSO là hướng nâng cấp dự kiến khi có khách hàng.

**Thật và giả lập** (thể lệ yêu cầu công bố rõ):

| | Thật | Giả lập / tổng hợp |
|---|---|---|
| Thành phần | Quy tắc, câu hỏi, workflow, audit, dừng/hoàn tác, SQLite, parser XML, Gemini Vision, Verify | Ngân hàng, đối soát Tổng cục Thuế, ERP, báo cáo thuế: nhóm "Mở rộng · beta", một phần giả lập hoặc chỉ xuất payload, ngoài phạm vi Đề A |
| Dữ liệu | File XML mẫu công khai theo định dạng 5 nhà phát hành (nguồn ghi trong `input-sample/README.md`) | Toàn bộ ca Verify, 60 ca phát triển, 72 ca red team; MST thử nghiệm (kể cả trong file XML mẫu) |
| Người dùng | 3 người dùng do BTC điều phối (16/10) | Vai trò Kế toán viên/KTT/CFO trong demo là mô phỏng |

## 7. Kết quả đo & phương pháp

### 7.1. Diễn tập 11 ca kiểu giám khảo: trước và sau cải tiến

**Phương pháp:** 11 ca nhập tay tối thiểu, giống cách giám khảo gõ ca mới, gồm 3 ca thường quy và 8 ca cần chuyển tiếp (3 Chưa rõ thông tin, 4 Ngoài quy định, 1 Vượt thẩm quyền). Nhãn kỳ vọng viết theo SOP trước khi chạy. Cùng script `scripts/qa/compare-rehearsal.ts` chạy trên commit `33522a0` (13/10) và bản cải tiến (nhánh `feat/track-a-hardening`, 14/10), mỗi ca một database tạm, không gọi AI. Lệnh tái lập có trong `docs/evidence/before-after-judge-rehearsal-2026-10-14.md`; kết quả "sau" được giữ trong `npm test` bằng `tests/unit/judgeRehearsal.test.ts`.

| Chỉ số | Trước (`33522a0`) | Sau (nhánh cải tiến) |
|---|---|---|
| Ca xử lý đúng (trạng thái và nhóm dừng) | 3/11 | **11/11** |
| Ca thường quy bị chuyển tiếp thừa | 3/3 | **0/3** |
| Ca cần chuyển tiếp bị bỏ sót | 0/8 | 0/8 |
| Ca chuyển tiếp sai nhóm dừng | 4/8 | **0/8** |
| Ca lỗi hệ thống (thuế suất 7% gây lỗi 400) | 1/11 | **0/11** |
| Câu hỏi có số tiền cụ thể, không bắt mở lại chứng từ* | 1/10 | **8/8** |

\* Mẫu số khác nhau: bản cũ chuyển tiếp 10 ca (gồm 3 ca thường quy bị hỏi thừa), bản mới 8 ca. Câu hỏi trước cải tiến: "cần xác minh Thanh toán… A: Xác minh dữ liệu từ chứng từ gốc". Sau cải tiến: "Hóa đơn 12.100.000₫ được thanh toán bằng hình thức nào? A: Chuyển khoản (có UNC); hoặc B: Tiền mặt → không được khấu trừ 1.100.000₫ VAT?".

### 7.2. Các lớp kiểm chứng khác

| Lớp | Kết quả | Giới hạn |
|---|---|---|
| Verify trên live (15/10/2026, 16:39 giờ Việt Nam) | 9/9 đạt (4 ca chung + 5 ca Đề A), tổng 268 ms, mọi quyết định hợp lệ schema | Ca công khai, do đội viết |
| Red team: 72 ca bẫy do 6 trợ lý AI viết từ tài liệu quy định (21 thường quy, 51 chuyển tiếp) | 66/72 lúc đầu → 72/72 sau khi sửa, nay là bộ hồi quy | Agent không đọc mã engine nhưng có đọc SOP và module ngưỡng; nhãn do AI gán, chưa được người nghiệp vụ duyệt |
| `npm test` | 16/16 bộ (44 unit test + 15 bộ hồi quy) | CI chạy không có khóa AI thật; các bộ có đường gọi AI dùng khóa giả (`scripts/qa/run-all.ts`) |
| CI GitHub Actions | Xanh trên Ubuntu và Windows, kèm bước build | — |
| Kiểm tra giao diện bằng Playwright (máy tính + điện thoại 390px) | 18/19 mục; mục còn lại là phản hồi 401 đúng thiết kế khi chưa đăng nhập | Chạy ngoài repo |

**Giới hạn trung thực:** mọi số liệu ở mục này là **dữ liệu tổng hợp do đội hoặc AI viết**, đo chất lượng engine trên tập phát triển. Đây **không phải đánh giá độc lập** và không phải kết quả người dùng thật. Tác động lên người dùng (thời gian, tỉ lệ hỏi lại, mức tin tưởng, gánh nặng mới) sẽ được đo với ba người dùng ngày 16/10 và cập nhật vào Slide 3 và Slide 5.

## 8. Con người kiểm soát & kiểm toán

![Hình 5. Trả lời "1A, 2B" và nhật ký kiểm toán](../diagrams/05-answer-audit.png)

<p class="cap">Hình 5. Trả lời "1A, 2B" và nhật ký kiểm toán</p>

| Yêu cầu của đề | Cách hệ thống đáp ứng | Thử trên live |
|---|---|---|
| Điểm quyết định của con người khớp Slide 2 | Con người quyết định ở đúng ba chỗ: xác nhận dữ kiện hệ thống không chắc; chấp nhận hoặc loại khoản ngoài quy định; phê duyệt khoản vượt thẩm quyền | Hộp chuyển tiếp, demo riêng |
| Truy vết: làm gì, khi nào, trên dữ liệu nào, vì sao | Mỗi sự kiện ghi người thao tác, vai trò, thời điểm, revision, `inputHash`, phiên bản và hash policy, snapshot trước/sau, lý do, commit | Tab **Nhật ký** |
| Dừng và ghi đè | Công tắc dừng tự động hóa toàn hệ thống (ghi người làm và lý do tối thiểu 8 ký tự); dừng từng hồ sơ; hoàn tác là sự kiện mới `INVOICE_ACTION_REVERTED` | Nút **Dừng / Hoàn tác** |
| Giải thích cho người không chuyên | Câu hỏi bằng tiếng Việt thường ngày, có số tiền, hệ quả từng đáp án và "VAT chờ quyết định" | Mọi ca chuyển tiếp |

**Chặn quyết định sai người.** Người duyệt không được là kế toán viên hay người nhập hồ sơ. Ca cần CFO thì KTT không được duyệt hay từ chối thay. Hồ sơ còn dữ kiện chưa xác minh, còn cờ cần đánh giá lại hoặc đang bị giữ thuế thì không duyệt được.

**Nhật ký chống sửa.** Mỗi sự kiện nối chuỗi theo công thức `eventHash = SHA256(prevHash | loại | đối tượng | người | payload | thời điểm)`. Khi đặt khóa bí mật nằm ngoài database, hệ thống ký thêm HMAC-SHA256 nối chuỗi, nên người có quyền ghi database cũng không tính lại được chuỗi. Trigger SQLite chặn mọi lệnh sửa và xóa trên hai bảng audit. `/api/health` công bố số sự kiện, head hash và trạng thái HMAC để bên ngoài đối chiếu.

## 9. Tiềm năng thương mại & lộ trình

### 9.1. Đánh giá của doanh nghiệp

Bản nhận xét Sprint 1 xếp tiềm năng thương mại ở mức **"Cao"** và viết:

> "Đây là bài toán có giá trị thương mại cao nhất cuộc thi, và khoảng cách không hề sát. […] Phạt thuế là tiền mặt. Thuế GTGT đầu vào bị loại là tiền mặt."
>
> "Bạn bóc tách đúng định dạng XML chuẩn quốc gia chứ không phải một định dạng demo tiện tay, nghĩa là bạn chạy được ngay ngày đầu tại doanh nghiệp thật thay vì sau sáu tháng tích hợp."

Cùng bản nhận xét chỉ ra năm điểm yếu: lưu dữ liệu trên RAM, lỗ hổng XXE, chưa có bộ test chuẩn, vòng lặp agent không trần, mới đạt 2/3 kiểu dừng. Cả năm điểm đã được xử lý trong Sprint 2 (README, mục "Phản hồi Sprint 1 → đã xử lý").

### 9.2. Vì sao dự án có tiềm năng

- **Nhu cầu do quy định tạo ra.** Mọi doanh nghiệp đều nhận hóa đơn điện tử, và điều kiện khấu trừ vừa thay đổi lớn từ 01/07/2025. Người mua không cần được thuyết phục rằng vấn đề tồn tại.
- **Giá trị đo được bằng tiền.** Mỗi câu hỏi đã hiển thị "VAT chờ quyết định"; cuối kỳ có thể cộng tổng VAT đã qua tay người có thẩm quyền. Theo gợi ý của doanh nghiệp, sản phẩm nên định giá theo thuế đầu vào thu hồi được và tiền phạt tránh được, không theo số giờ tiết kiệm.
- **Dễ gắn vào quy trình sẵn có.** Hệ thống đọc được XML mẫu của các nhà phát hành lớn và đứng như một lớp trọng tài trước bút toán, không thay phần mềm kế toán.
- **Được tin vì kiểm chứng được.** Quyết định tất định, nhật ký nối chuỗi, mỗi quy tắc dẫn nguồn pháp lý và mức xác minh: đúng những gì bộ phận pháp chế và thanh tra cần.

| | Kiểm thủ công | Công cụ chỉ đọc (OCR) | Tax Referee |
|---|---|---|---|
| Biết khi nào dừng | Theo kinh nghiệm từng người | Thường không | Ba kiểu dừng, ngưỡng trọng yếu |
| Câu hỏi cho người duyệt | Tin nhắn chung chung | Thường không | Một câu, có số tiền và VAT chờ quyết định |
| Dấu vết khi thanh tra | Rời rạc | Hạn chế | Nhật ký chỉ ghi thêm, nối chuỗi |

**Mô hình kinh doanh gợi ý:** thuê bao theo khối lượng hóa đơn, kèm báo cáo VAT được bảo vệ. Khách hàng: doanh nghiệp nhiều hóa đơn đầu vào và nhiều cấp duyệt; công ty dịch vụ kế toán phục vụ nhiều khách hàng. Kênh: tích hợp vào phần mềm kế toán/ERP; hợp tác với nhà cung cấp hóa đơn điện tử. Mức giá và quy mô thị trường là **ước tính cần kiểm chứng** qua thử nghiệm thật. Việc đọc được XML của các nhà phát hành là năng lực kỹ thuật, chưa phải quan hệ đối tác.

### 9.3. Lộ trình

| Giai đoạn | Việc chính |
|---|---|
| Ngay sau 16/10 | Cải tiến từ phản hồi ba người dùng, có commit trước/sau; chuyển nhận diện "ngoài phạm vi" từ từ khóa sang danh sách trắng nhóm chi; cộng dồn hóa đơn tách nhỏ cùng bên bán cùng ngày khi xét hạn mức CFO; chặn ngày lập ở tương lai gần (hiện chỉ chặn khi quá 6 tháng); KTT ký xác nhận bộ quy tắc |
| Trung hạn | Tích hợp thật ERP, ngân hàng, cổng thuế (đã cắt trong hackathon vì không có môi trường kiểm chứng, `docs/build-log-1-page.md`); đa doanh nghiệp; Postgres + SSO; chữ ký số trên hồ sơ giải trình |
| Kiểm chứng | Đánh giá độc lập trên hóa đơn thật có cho phép, mục tiêu 40 ca, tối thiểu 20 (`docs/referee-core-evaluation.md`); chuyên gia thuế xác nhận diễn giải từng quy tắc |

## 10. Giới hạn & rủi ro

| Giới hạn / rủi ro | Mức | Hướng xử lý |
|---|---|---|
| Danh mục "ngoài phạm vi SOP" hiện dựa trên từ khóa, chưa bao phủ mọi loại chi | Cao | Danh sách trắng nhóm chi; hậu kiểm ngẫu nhiên ca tự duyệt |
| Người dùng tin máy quá mức, chấp nhận ca "tự xử lý" mà không xem lại | Cao | Đo trực tiếp trong buổi thử 16/10; hiển thị lý do tự duyệt; hậu kiểm định kỳ |
| Ngoại lệ dồn về người duyệt vào cuối tháng | Trung bình | Câu hỏi gộp, trả lời một lần; đo áp lực bằng nhóm câu hỏi D trong buổi thử |
| Diễn giải pháp lý chưa được chuyên gia thuế xác nhận | Trung bình | Mỗi quy tắc dẫn nguồn và mức xác minh; KTT ký duyệt trước khi dùng thật |
| Hóa đơn tách nhỏ chưa được cộng dồn khi xét hạn mức CFO | Trung bình | Đã đưa vào lộ trình ngắn hạn |
| Ảnh hóa đơn gửi tới dịch vụ AI bên thứ ba qua proxy | Trung bình | XML không qua AI; triển khai thật dùng API trực tiếp có thỏa thuận dữ liệu |
| Đọc ảnh có thể sai và mất khoảng 14 giây mỗi ảnh | Trung bình | Số từ ảnh phải khớp phép tính; lệch hoặc mờ thì hỏi xác nhận |
| SQLite một instance, giới hạn tần suất trong bộ nhớ, đăng nhập dạng MVP | Thấp ở quy mô demo | Postgres + SSO khi có khách hàng |
| Chưa có đánh giá độc lập; mọi bộ ca hiện là tổng hợp | — | Nhãn độc lập từ người dùng (5 ca × 3 người); công cụ khóa nhãn đã sẵn sàng |

## 11. Kế hoạch thử nghiệm với 3 người dùng

- Ngày 16/10, ba người dùng do BTC điều phối thử hệ thống trên Live URL theo kịch bản 15–20 phút, không cần cài đặt.
- Mỗi người ghi quyết định của mình cho 5 ca **trước** khi xem kết quả hệ thống. Đây là nhãn độc lập để đo mức đồng thuận giữa người và máy.
- Bộ 20 câu hỏi đo hiện trạng (thời gian, tỉ lệ phải hỏi lại), chất lượng câu hỏi chuyển tiếp, niềm tin, gánh nặng mới, chi phí làm quen và mức phối hợp với đồng nghiệp.
- Phiếu thông tin có các mức đồng ý trích dẫn họ tên và chức danh. Kết quả, kể cả bất cập người dùng nêu, sẽ được báo cáo nguyên văn, cùng ít nhất một cải tiến có commit trước/sau.

**Chi tiết ở Phụ lục A — Câu hỏi cho người dùng.**

---

## Phụ lục A — Mục bổ sung Proposal — Kế hoạch thử nghiệm & bộ câu hỏi cho người dùng

*(Nguyên văn mục bổ sung Proposal đã gửi BTC trước 19:00 ngày 15/10/2026.)*

**Đội:** Fprinciples · **Sản phẩm:** Tax Referee (Đề A · The Escalation Referee) · **Track:** VNG
**Live URL:** https://limegreen-salamander-517622.hostingersite.com (không cần tài khoản)

Mục này dành cho 3 người dùng do Ban tổ chức điều phối. Chúng tôi muốn biết hệ thống có giúp người làm
kế toán thật hay không, và **nó tạo ra gánh nặng mới nào**, không chỉ nó có chạy nhanh hay không.
Thời lượng dự kiến: **15–20 phút/người**, làm online, không cần cài đặt.

---

### 1. Thông tin người tham gia (bắt buộc theo thể lệ)

| Mục | Trả lời |
|---|---|
| Họ và tên | |
| Chức danh hiện tại / đơn vị công tác | |
| Số năm làm kế toán – thuế | |
| Số hóa đơn đầu vào anh/chị xử lý trung bình mỗi tháng | |
| Vai trò trong quy trình duyệt (nhập liệu / kiểm soát / phê duyệt) | |
| Đồng ý cho đội **trích dẫn nguyên văn** câu trả lời kèm **họ tên và chức danh** trong slide và repo công khai? | ☐ Đồng ý ☐ Chỉ trích dẫn chức danh, không nêu tên ☐ Không đồng ý |

> Họ tên, chức danh và đơn vị luôn được cung cấp cho BTC và giám khảo để xác minh người dùng thật (theo thể lệ); lựa chọn ở dòng trên chỉ áp dụng cho việc **công bố** trên slide và repo công khai. Người chọn "Không" sẽ không bị trích nguyên văn.
> Dữ liệu thử nghiệm là hóa đơn **tổng hợp** (không phải dữ liệu thật của doanh nghiệp nào).
> Đội không thu thập dữ liệu cá nhân ngoài các mục trên.

---

### 2. Kịch bản thử (15 phút)

1. **Mở Live URL** → đọc dòng hướng dẫn trên trang chủ → bấm **"① Chạy Verify (90 giây)"** → bấm **Chạy Verify**.
   Xem bảng kết quả 9 ca (ca nào tự xử lý, ca nào bị chuyển tiếp, câu hỏi hệ thống đặt ra).
2. Sang tab **"Thử dữ liệu mới"** → dùng các nút **U1 … U5** (bộ thử người dùng).
   **Với mỗi ca: đọc dữ liệu, ghi quyết định của anh/chị vào bảng ở mục 3 TRƯỚC, rồi mới bấm "Đánh giá dữ liệu mới".**
3. Với mỗi ca bị chuyển tiếp: đọc câu hỏi của hệ thống và **trả lời ngay** (VD "1A, 2B"). Ghi lại nếu phải mở chứng từ gốc mới trả lời được.
4. Quay về trang chủ → **"② Mở hộp chuyển tiếp — demo riêng"** → chọn một hồ sơ → thử **Dừng** rồi **Hoàn tác**, mở tab **Nhật ký** xem hệ thống ghi gì.
5. Trả lời bảng câu hỏi ở mục 4.

---

### 3. Năm ca thử — anh/chị ghi quyết định **trước khi** xem kết quả hệ thống

Đây vừa là nhãn độc lập để đội đo độ chính xác, vừa để đo mức độ đồng thuận giữa người và máy.

| Ca | Nội dung (tóm tắt) | Quyết định của anh/chị: **Tự duyệt** / **Phải hỏi** (hỏi ai, hỏi gì?) | Thời gian anh/chị cần (ước tính, giây) | Hệ thống quyết định | Anh/chị đồng ý? (Có/Không, vì sao) |
|---|---|---|---|---|---|
| U1 | Văn phòng phẩm 2.200.000₫, chuyển khoản | | | | |
| U2 | Tiệc cưới người thân giám đốc 4.400.000₫, chuyển khoản | | | | |
| U3 | Cước Internet cáp quang, thuế suất 8%, 1.080.000₫ | | | | |
| U4 | Máy chiếu 27.500.000₫, chuyển khoản có UNC, chưa rõ trạng thái MST bên bán | | | | |
| U5 | Hợp đồng bảo trì máy chủ 242.000.000₫, chuyển khoản có UNC | | | | |

> Ghi chú phương pháp (để minh bạch): một trong năm ca được thiết kế để kiểm tra việc **tin máy quá mức**:
> hệ thống có thể tự duyệt một khoản mà người làm nghề sẽ nghi ngờ. Đội đo xem người dùng có phát hiện
> khi xem danh sách "tự xử lý" hay không. Đội sẽ công bố ca nào là ca kiểm tra sau buổi thử.

---

### 4. Bảng câu hỏi (thang 1–5: 1 = hoàn toàn không đồng ý, 5 = hoàn toàn đồng ý)

#### A. Hiện trạng (để so sánh trước/sau)
1. Hiện nay, một hóa đơn đầu vào bình thường mất bao lâu để anh/chị kiểm tra xong? ____ phút
2. Khoảng bao nhiêu % hóa đơn anh/chị phải hỏi lại người khác (KTT, CFO, người mua hàng, nhà cung cấp)? ____ %
3. Hiện anh/chị hỏi bằng kênh nào (Zalo, email, gặp trực tiếp…)? Một lần hỏi thường mất bao lâu mới có câu trả lời?

#### B. Chất lượng câu hỏi chuyển tiếp
4. Tôi trả lời được câu hỏi của hệ thống **trong một lần trả lời**, không cần mở lại chứng từ gốc. (1–5)
5. Hệ thống chuyển đúng người (Kế toán trưởng / CFO). (1–5)
6. Ba nhóm lý do dừng ("chưa rõ thông tin", "ngoài quy định", "vượt thẩm quyền") giúp tôi hiểu ngay vì sao hồ sơ bị dừng. (1–5)
7. Có câu hỏi nào của hệ thống **chung chung, thừa hoặc sai** không? Ghi rõ ca và lý do.

#### C. Niềm tin và nguy cơ ỷ lại vào máy
8. Tôi tin các hóa đơn hệ thống **tự xử lý** là đúng. (1–5)
9. Khi dùng hằng ngày, tôi vẫn sẽ tự kiểm tra lại các hóa đơn "tự xử lý". ☐ Luôn ☐ Thỉnh thoảng ☐ Không
10. Trong 5 ca, có ca nào hệ thống quyết định mà anh/chị **không đồng ý**? Vì sao?

#### D. Gánh nặng mới và cường độ công việc
11. Hệ thống có làm phát sinh **việc mới** cho anh/chị không (VD xác nhận dữ liệu, trả lời câu hỏi, kiểm tra cảnh báo)? Việc gì?
12. Nếu mọi hóa đơn ngoại lệ dồn về người duyệt vào ngày cao điểm cuối tháng, có tạo áp lực không? (1–5, 5 = áp lực nhiều)
13. Cảnh báo của hệ thống có quá nhiều đến mức dễ bị bỏ qua không? (1–5, 5 = quá nhiều)

#### E. Chi phí làm quen
14. Lần đầu dùng, anh/chị mất bao lâu để hiểu cách dùng? ____ phút
15. Điều gì gây khó hiểu nhất trên giao diện?

#### F. Phối hợp với đồng nghiệp
16. Hệ thống có làm **giảm** những trao đổi trực tiếp cần thiết với Kế toán trưởng/đồng nghiệp không? (1–5, 5 = giảm nhiều)
17. Trường hợp nào anh/chị vẫn muốn **gặp trực tiếp** thay vì trả lời qua hệ thống?

#### G. Cải tiến
18. **Một thay đổi** anh/chị muốn đội sửa ngay nhất là gì?
19. Điều gì khiến anh/chị **không dám** dùng hệ thống này cho hóa đơn thật?
20. Nhận xét khác (viết tự do).

---

### 5. Đội sẽ dùng phản hồi như thế nào

- Trích dẫn **nguyên văn** (đúng phạm vi anh/chị đồng ý ở mục 1), không chỉnh sửa nội dung.
- Mỗi thay đổi sản phẩm xuất phát từ phản hồi sẽ là **một commit riêng** trong repo công khai, ghi rõ phản hồi gốc,
  kèm ảnh/số liệu trước–sau. Đội cập nhật Slide 3 (tác động) và Slide 5 (rủi ro, bất cập phát sinh) theo phản hồi thật.
- Các chỉ số đội sẽ báo cáo: tỉ lệ đồng thuận người–máy trên 5 ca; số ca hệ thống chuyển tiếp thừa / bỏ sót theo nhãn của
  anh/chị; điểm trung bình câu 4–6 (chất lượng câu hỏi); câu 8–9 và ca kiểm tra (nguy cơ ỷ lại); câu 11–13, 16 (gánh nặng mới,
  phối hợp). Kết quả xấu cũng được công bố.

Cảm ơn anh/chị đã dành thời gian. Liên hệ đội Fprinciples nếu cần hỗ trợ trong lúc thử.
