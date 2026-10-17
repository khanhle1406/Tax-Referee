# Nội dung 5 slide — Tax Referee (Đề A · The Escalation Referee)

> 📌 **Ảnh chụp lịch sử** — bản nộp 15/10/2026, số liệu có thể đã cũ; số liệu hiện hành: [README](../../README.md), trang `/verify`, `/sop` và `docs/evidence/`. Ghi chú phiên bản (17/10): các ô [CẬP NHẬT 16/10] và `<hash>` giữ nguyên có chủ đích — buổi thử 16/10 không có phản hồi chi tiết bằng văn bản nên không điền số liệu. Hợp đồng quy tắc hiện hành có 25 quy tắc (`data/policyContract.ts`), bản này ghi 24.

Cấu trúc cố định theo đề: 1 Vấn đề · 2 Đầu vào → Xử lý → Đầu ra · 3 Tác động trước/sau + phương pháp · 4 Kiến trúc thật/giả lập · 5 Giới hạn & rủi ro.
Slide 3 và 5 có trọng số lớn: mọi con số phải có phương pháp và nguồn. Các ô **[CẬP NHẬT 16/10]** điền bằng phản hồi thật của 3 người dùng BTC; nếu chưa có thì ghi "chưa có", không ước đoán.

---

## Slide 1 — Vấn đề: hóa đơn đầu vào là tiền mặt bị mất, không phải giờ công

**Tiêu đề:** Mỗi hóa đơn đầu vào sai điều kiện = thuế GTGT bị loại + tiền phạt

- Mọi doanh nghiệp Việt Nam đều nhận hóa đơn điện tử; kế toán phải kiểm từng hóa đơn theo nhiều điều kiện:
  thanh toán không dùng tiền mặt từ 5 triệu, thuế suất 8%/10%, MST người mua, trạng thái MST người bán, hạn mức duyệt…
- Sai một điều kiện thì **thuế GTGT đầu vào bị loại** và có thể bị phạt khi thanh tra. Đây là tiền mặt.
- Thực tế hiện nay: kiểm tay hoặc phần mềm chỉ đọc số liệu; ca khó thì nhắn KTT/CFO **"anh xem giúp hóa đơn này"**,
  người duyệt phải mở lại chứng từ để hiểu đang hỏi gì.
- Hai lỗi ngược nhau đều đắt: tự động hóa duyệt bừa (mất tiền) và chuyển hết lên người duyệt (nghẽn cuối tháng).

*Lời nói (15s):* "Bài toán không phải đọc hóa đơn nhanh hơn, mà là biết khi nào được tự duyệt, khi nào phải dừng, và hỏi thế nào để người duyệt trả lời ngay."

---

## Slide 2 — Đầu vào → Xử lý → Đầu ra, và chỗ con người quyết định

> **Bản .pptx 15/10:** tiêu đề "Đầu vào → Xử lý → Đầu ra"; sơ đồ luồng xử lý (`docs/diagrams/s1-pipeline-slide.png`, bản chi tiết `01-pipeline.png`) tô nổi điểm Kế toán trưởng/CFO quyết định; bên dưới 3 thẻ ví dụ câu hỏi cho 3 kiểu dừng.

```
ĐẦU VÀO                    XỬ LÝ (tất định trước, AI sau)                      ĐẦU RA
XML HĐĐT (TT78)  ──►  1. Đọc & kiểm nguồn: thiếu / mờ / khác chứng từ gốc  ──►  Tự xử lý: duyệt thuế, chứng từ nội bộ, audit
PDF, ảnh         ──►  2. 24 quy tắc SOP (không AI)                        ──►  Chuyển tiếp: 1 câu hỏi, đúng người
Nhập tay         ──►  3. Phân 3 nhóm dừng + câu hỏi một câu                         ▼
                                                                         👤 KTT (< 200 triệu) / 👤 CFO (≥ 200 triệu)
                                                                         trả lời "1A, 2A" · dừng · hoàn tác · ghi lý do
```

- **Con người quyết định ở đúng 3 chỗ:** (1) xác nhận dữ kiện hệ thống không chắc; (2) chấp nhận/loại khoản ngoài quy định;
  (3) phê duyệt khoản vượt thẩm quyền. Mọi ca khác hệ thống tự hoàn tất.
- **AI làm gì:** đọc ảnh/PDF scan (Gemini Vision). **AI không làm:** phân loại, quyết định thuế, đổi người nhận. Quy tắc TypeScript là thẩm quyền duy nhất.
- **Ba kiểu dừng** (ví dụ thật từ hệ thống):
  - *Chưa rõ thông tin:* "Tổng in 480.000₫ lệch tiền hàng + thuế = 495.000₫. A: 495.000₫ — sửa; hay B: 480.000₫ — yêu cầu NCC điều chỉnh?"
  - *Ngoài quy định:* "Tiếp khách có rượu vang 3.300.000₫. A: Theo quy chế — khấu trừ 300.000₫; hay B: Chi cá nhân — loại 300.000₫ VAT?"
  - *Vượt thẩm quyền:* "330.000.000₫ ≥ hạn mức KTT 200.000.000₫. A: CFO duyệt, khấu trừ 30.000.000₫; hay B: Tạm dừng thẩm tra hợp đồng?"

*Lưu ý trình bày:* khớp đúng màn hình demo (Verify → hộp chuyển tiếp → đổi vai trò → trả lời → nhật ký).

---

## Slide 3 — Tác động: đo trước/sau và phương pháp

**A. Đo trên hệ thống (đã có, tái lập được)**

| Chỉ số (11 ca diễn tập kiểu giám khảo) | Bản 13/10 | Bản 15/10 |
|---|---|---|
| Ca xử lý đúng (trạng thái + nhóm dừng) | 3/11 | **11/11** |
| Ca thường quy bị chuyển tiếp thừa | 3/3 | **0/3** |
| Ca chuyển tiếp sai nhóm | 4/8 | **0/8** |
| Câu hỏi đạt kiểm tra tự động (có số tiền ₫, không bắt mở lại chứng từ)* | 1/10 | **8/8** |

*Phương pháp:* cùng 11 ca, cùng script, hai phiên bản mã nguồn (commit `33522a0` và bản hiện tại), mỗi ca một database tạm, không gọi AI.
*Giới hạn ghi rõ trên slide:* ca do đội viết → tập phát triển, **không phải đánh giá độc lập**. Nguồn: `docs/evidence/before-after-judge-rehearsal-2026-10-14.md`.

Thêm: Verify 9 ca (4 chung + 5 Đề A) PASS 9/9 (chạy lại trên live sau khi deploy, lưu JSON có timestamp); 60 ca phát triển tổng hợp 60/60; 72 ca "đánh lừa" do agent viết từ SOP (không đọc `policyEngine.ts`; có đọc SOP và module ngưỡng) 66/72 → 72/72, nay là bộ hồi quy; `npm test` 16/16 bộ, CI Ubuntu + Windows khi đẩy mã và khi mở PR.
*Giới hạn:* ca red team do AI viết và gán nhãn theo SOP, chưa được người nghiệp vụ duyệt; không thay cho người dùng thật hay đánh giá độc lập.
\* Mẫu số khác nhau: bản cũ chuyển tiếp 10 ca (gồm 3 ca thường quy bị hỏi thừa), bản mới 8 ca. Phần A là **chất lượng engine trên tập phát triển**; tác động lên người dùng ở phần B (pilot 3 người, 16/10).

**B. Đo với người dùng thật — [CẬP NHẬT 16/10]**

| Chỉ số | Trước (cách làm hiện tại, người dùng tự báo) | Với Tax Referee |
|---|---|---|
| Thời gian kiểm 1 hóa đơn thường quy | [__ phút, người dùng tự ước tính] | [__ giây, người dùng tự ước tính trên 5 ca] |
| Tỉ lệ hóa đơn phải hỏi người khác | [__ %] | [__ /5 ca bị chuyển tiếp] |
| Câu hỏi trả lời được ngay trong một lần (thang 1–5) | — | [điểm TB câu 4] |
| Đồng thuận người–máy trên 5 ca | — | [__/15 quyết định] |
| Ca kiểm tra "tin máy quá mức" được phát hiện | — | [__/3 người] |

*Phương pháp:* 3 người dùng do BTC điều phối; mỗi người ghi quyết định cho 5 ca **trước** khi xem kết quả hệ thống
(nhãn độc lập), trả lời 20 câu hỏi (chất lượng câu hỏi, niềm tin, gánh nặng mới, làm quen, phối hợp).
Bộ câu hỏi công khai: `docs/submission/proposal-user-questions.md`. Chỉ báo cáo con số thật; ô chưa có dữ liệu ghi "chưa có".

**Định giá (theo gợi ý doanh nghiệp):** giá trị = VAT đầu vào được bảo vệ + tiền phạt tránh được, không phải giờ công.
Mỗi câu hỏi chuyển tiếp hiển thị "VAT chờ quyết định" để người duyệt thấy số tiền đang bị đe dọa.

---

## Slide 4 — Kiến trúc: thành phần thật / giả lập, dữ liệu thật / tổng hợp

> **Bản .pptx 15/10:** tiêu đề "Kiến trúc & công nghệ: thật và giả lập"; trái: sơ đồ kiến trúc (`docs/diagrams/s3-architecture-slide.png`, bản chi tiết `03-architecture.png`); phải: bảng 9 tầng công nghệ (giao diện, lõi quyết định, đọc chứng từ, dữ liệu/kiểm toán, bảo mật, kiểm thử/CI, triển khai — Thật; ERP/ngân hàng/TCT — Giả lập; dữ liệu kiểm thử — Tổng hợp).

```
Next.js 15 (Hostinger Node) ── API routes ── Policy engine (24 quy tắc, TypeScript, tất định)
        │                         │                 └─ lib/riskTaxonomy: 1 bảng cho 3 nhóm dừng
        │                         ├─ Workflow: revision, kiểm nguồn, duyệt, dừng, hoàn tác
        │                         └─ SQLite WAL (bền qua khởi động lại) + audit nối chuỗi SHA-256
        └─ Gemini 2.5 Flash Vision (đọc ảnh/PDF scan, timeout 35s) — không tham gia quyết định
```

| | Thật | Giả lập / chưa chứng minh |
|---|---|---|
| **Thành phần** | Quy tắc, câu hỏi, workflow, audit, dừng/hoàn tác, SQLite, parser XML, Gemini Vision, Verify | Ngân hàng, đối soát TCT, ERP (chỉ xuất payload), báo cáo thuế — gom trong "Mở rộng · beta" |
| **Dữ liệu** | XML mẫu công khai của 5 nhà phát hành (Viettel, MISA, VNPT, FPT, TCT) | Toàn bộ ca Verify/60 ca phát triển do đội tổng hợp; MST thử nghiệm; ảnh mẫu bộ MC-OCR (chỉ dùng nghiên cứu) |
| **Người dùng** | 3 người dùng BTC điều phối [CẬP NHẬT 16/10] | Vai trò KTT/CFO trong demo là mô phỏng |

- **Không có vòng lặp agent:** một lượt quy tắc/hồ sơ; AI có timeout; lượt quá hạn → giữ hồ sơ `ON_HOLD`, kết quả trễ bị loại.
- **Kiểm chứng:** `/api/health` hiện commit đang chạy; Verify in run ID + commit; CI chạy typecheck/lint/test/build mỗi lần đẩy mã.

---

## Slide 5 — Giới hạn, rủi ro và hướng xử lý

| Rủi ro / giới hạn | Mức | Hướng xử lý |
|---|---|---|
| **Khoản chi lạ không thuộc danh mục rủi ro vẫn có thể tự duyệt** (VD chi cá nhân đặt tên khác) | Cao | Danh mục "ngoài phạm vi SOP" mở rộng theo phản hồi; hậu kiểm ngẫu nhiên 5% ca tự duyệt |
| **Tin máy quá mức:** người dùng chấp nhận ca "tự xử lý" mà không xem lại | Cao | Đo bằng ca kiểm tra trong buổi thử [kết quả 16/10]; hiển thị lý do tự duyệt; hậu kiểm định kỳ |
| **Dồn việc cho người duyệt cuối tháng** (mọi ngoại lệ về KTT/CFO cùng lúc) | Trung bình | Câu hỏi gộp một lần trả lời; [ghi bất cập người dùng nêu 16/10] |
| Diễn giải pháp lý của quy tắc **chưa được chuyên gia thuế xác nhận** (ghi rõ trong SOP) | Trung bình | Mỗi quy tắc dẫn nguồn văn bản; cần kế toán trưởng ký xác nhận bộ quy tắc trước khi dùng thật |
| Ảnh/PDF gửi tới dịch vụ AI bên thứ ba (qua proxy) | Trung bình | Chỉ dùng cho ảnh; XML không qua AI; triển khai thật cần API trực tiếp có thỏa thuận dữ liệu |
| Đọc ảnh có thể sai số; hệ thống chỉ chặn khi nhận biết được là mờ/mâu thuẫn | Trung bình | Số liệu từ ảnh phải khớp phép tính; lệch hoặc mờ → hỏi xác nhận |
| SQLite một máy, đăng nhập nội bộ dạng MVP | Thấp (demo) | Đường nâng cấp Postgres + SSO khi có khách hàng |
| Chưa có đánh giá độc lập quy mô lớn; 60 ca phát triển do đội gán nhãn | — | Nhãn độc lập từ người dùng (5 ca × 3 người); công cụ khóa nhãn đã có |

**Tác động tiêu cực / bất cập phát sinh từ người dùng — [CẬP NHẬT 16/10, trích nguyên văn]** (thể lệ: trả lời "không có bất cập" = 0 điểm).

**Một cải tiến từ phản hồi — [CẬP NHẬT 16/10]:** phản hồi gốc → thay đổi → commit `<hash>` → trước/sau.
