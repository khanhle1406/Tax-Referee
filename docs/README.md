# Tài liệu Tax Referee

Mục lục toàn bộ tài liệu, xếp theo người đọc. Tổng quan dự án: [README](../README.md).

## Bắt đầu từ đâu

| Bạn là | Đọc trước |
|---|---|
| Giám khảo, người xem demo | [Hướng dẫn giám khảo 8 phút](judge-cheat-sheet-8-mins.md) · [Tính năng nổi bật](submission/tinh-nang-noi-bat.md) |
| Thành viên đội, người deploy | [Bàn giao Demo Day 17/10](handoff/BAN-GIAO-DEMO-DAY-17-10.md) · [Hướng dẫn bàn giao](handoff/huong-dan-ban-giao.md) |
| Lập trình viên mới | [README](../README.md) · [RUNBOOK](../RUNBOOK.md) · [CONTRIBUTING](../CONTRIBUTING.md) |
| Người rà bảo mật | [Mô hình mối đe dọa](security/threat-model.md) · [SECURITY](../SECURITY.md) · trang `/trust` |
| Trợ lý AI | [AGENTS.md](../AGENTS.md) · [CLAUDE.md](../CLAUDE.md) |

## Kiến trúc và bảo mật

- [Kiến trúc và lộ trình từ demo lên production](architecture/demo-to-production.md) — 7 lớp, đánh đổi, cái gì vỡ khi mở rộng, lộ trình D0/30/90 ngày, SLO, ánh xạ VNG Cloud.
- [Nối chatbot Zalo (Goblin) vào Tax Referee](integrations/zalo-goblin-relay.md) — luồng ảnh/PDF/XML từ Zalo vào hộp thẩm định, cầu nối đọc ảnh, quyết định, cách dựng lại, sự cố thường gặp.
- [Mô hình mối đe dọa và bảo mật hệ có agent AI](security/threat-model.md) — tài sản, ranh giới tin cậy, 4 trụ, STRIDE, lỗi tự phát hiện → bản sửa → test.
- [Bảng đối chiếu SOP và quy tắc thực thi](referee-core-rule-matrix.md) — mỗi quy tắc SOP ứng với mã nào. Ảnh chụp ngày 12/10, chưa có quy tắc thêm sau đó; bảng hiện hành ở trang `/sop`.
- [Đối chiếu danh tính nhà cung cấp](supplier-identity-resolution.md) — luồng tra cứu, trạng thái VERIFIED/CONFLICT/NOT_FOUND, cấu hình nguồn.
- [Đánh giá năng lực chuyển tiếp theo Đề A](referee-core-evaluation.md) — ảnh chụp lịch sử, số liệu có thể đã cũ.
- [Sơ đồ (`diagrams/`)](diagrams/) — 5 sơ đồ PNG dùng trong Proposal và hồ sơ kỹ thuật (luồng xử lý, ba kiểu dừng, kiến trúc, máy trạng thái, trả lời "1A, 2B") và 2 sơ đồ cho slide; nguồn Mermaid ở `diagrams/src/*.mmd`, dựng lại PNG bằng `python docs/diagrams/render.py` (cần Playwright).

## Hồ sơ nộp thi (`submission/`)

- [Proposal](submission/proposal-tax-referee.md) · [Bộ câu hỏi thử nghiệm người dùng](submission/proposal-user-questions.md)
- [Hồ sơ kỹ thuật và nghiên cứu](submission/ho-so-ky-thuat.md)
- [Nội dung 5 slide](submission/slides-content.md) · bản trình chiếu [`Tax-Referee-5-slides.pptx`](submission/Tax-Referee-5-slides.pptx)
- [Verify harness và 4 trường hợp kiểm thử](submission/verify-harness-4-ca-kiem-thu.md)
- [Danh mục nộp bài](submission/danh-muc-nop-bai.md) · [Liên kết dự án](submission/lien-ket.md)
- [Build log 1 trang](build-log-1-page.md) · [Kịch bản video 3 phút](video-script-3-minutes.md)

## Demo Day và bàn giao (`handoff/`)

- [Bàn giao Demo Day 17/10 — đọc trước](handoff/BAN-GIAO-DEMO-DAY-17-10.md)
- [Thẻ nhắc thuyết trình Q1/Q2](handoff/the-nhac-thuyet-trinh-17-10.md)
- [Hướng dẫn bàn giao và tự deploy](handoff/huong-dan-ban-giao.md)
- [Báo cáo cải tiến 14–15/10](handoff/bao-cao-cai-tien-2026-10-15.md)

## Nghiên cứu (`research/`)

- [Nghiên cứu liên quan, so sánh và cải tiến](research/nghien-cuu-lien-quan.md) — paper, chuẩn mực, luật, sản phẩm tương tự; ý nào đã làm, ý nào hoãn.

## Bằng chứng (`evidence/`)

Kết quả chạy thật, lưu kèm ngày và commit.

- Live 16/10 sau deploy [PR #8](https://github.com/khanhle1406/Tax-Referee/pull/8): [`live-2026-10-16-post-deploy.json`](evidence/live-2026-10-16-post-deploy.json) (commit [`e496ab4`](https://github.com/khanhle1406/Tax-Referee/commit/e496ab4), HMAC bật, Verify 9/9, 12/12 phép thử bảo mật) · trước đó: [`live-2026-10-16-trust-probes.json`](evidence/live-2026-10-16-trust-probes.json) (12/12, lúc đó commit còn `unknown`)
- Verify trên live: [`verify-live-2026-10-15.json`](evidence/verify-live-2026-10-15.json), [`verify-export-live-2026-10-10.json`](evidence/verify-export-live-2026-10-10.json)
- [Trước / sau 11 ca diễn tập kiểu giám khảo (14/10)](evidence/before-after-judge-rehearsal-2026-10-14.md)
- [Giao thức thử nghiệm người dùng](evidence/user-study-protocol.md) · mẫu kết quả [`user-study/`](evidence/user-study/)
- Đo đạc, benchmark, ảnh chụp UI: `measurements.csv`, `improvement-trace.csv`, `benchmarks/`, `referee-core/`, `ui-*`
- Chứng từ mẫu: [`input-sample/`](../input-sample/README.md) — hóa đơn XML, PDF và ảnh tải từ nguồn công khai; nguồn và trạng thái giấy phép từng file trong `input-sample/manifest.json`.

## Đánh giá Sprint 1 (`assessment/`)

- [Đánh giá kỹ thuật của Ban giám khảo](assessment/Danh_Gia_Sprint_1_Fprinciples.md)
- [Phản hồi của doanh nghiệp](assessment/Feedback_Doanh_Nghiep_Fprinciples.md)

## Vận hành

- [RUNBOOK](../RUNBOOK.md) — clone sạch → chạy → kiểm chứng.
- [Runbook chung kết Đề A](runbook-final.md) — ảnh chụp lịch sử, có thể không còn khớp mã.
- [Hostinger: cấu hình đã triển khai](../deployment/HOSTINGER.md)
- [Mục lục `scripts/`](../scripts/README.md) — script nào `npm test` chạy, script nào chạy tay, benchmark hay lưu trữ.

## Lưu trữ (tham khảo lịch sử)

Giữ lại để đối chiếu lịch sử; có thể không còn khớp mã hiện tại.

- [Trạng thái triển khai 09–10/10](implementation-status.md) · [Kiểm thử 10/10](qa-2026-10-10/REPORT.md) · [Bàn giao redesign](taste-redesign-handoff.md) · [5 slide — đã chuyển](presentation-5-slides.md)
- [`archive/`](archive/design-system-MASTER.md) — design system của bản redesign 11/10 (đã bỏ khi khôi phục giao diện cũ; trước đây ở `design-system/tax-referee/MASTER.md`).
- [`brainstorming/`](../brainstorming/README.md) — ghi chú nháp do AI hỗ trợ soạn, **không phải bằng chứng**.
