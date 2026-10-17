# Danh mục nộp bài — Tax Referee (khóa bài 15/10/2026)

> 📌 **Ảnh chụp lịch sử** — danh mục khóa bài 15/10/2026, giữ nguyên để đối chiếu. Ô "[Cập nhật 16/10]" không được điền: buổi thử người dùng 16/10 không có phản hồi chi tiết bằng văn bản nên repo không công bố số liệu người dùng. Số liệu hiện hành: [README](../../README.md), trang `/verify`, `/sop` và `docs/evidence/`.

**Đội:** Fprinciples · **Track:** VNG · **Đề:** A — The Escalation Referee · **Live:** https://limegreen-salamander-517622.hostingersite.com · **GitHub:** https://github.com/khanhle1406/Tax-Referee

## Cấu trúc thư mục nộp

| Thư mục | Nội dung | Hạng mục thể lệ |
|---|---|---|
| `00_DOC-TRUOC_Danh-muc-nop-bai.pdf` | Trang này: danh mục, đối chiếu thể lệ, ghi chú minh bạch | — |
| `01_Proposal/` | **Proposal đầy đủ** (PDF + Word) và **Mục câu hỏi người dùng** (hạn 19:00 15/10, PDF + Word) | Proposal |
| `02_Slide-5-trang/` | Bộ 5 slide đúng cấu trúc đề (PPTX + PDF) | e |
| `03_Video-demo/` | Video demo 2:41 (1920×1080) + kịch bản và lời thuyết minh | d |
| `04_Lien-ket/` | Live URL, Verify, SOP, /api/health, GitHub, Runbook (PDF + TXT) | a, c |
| `05_Verify-va-kiem-thu/` | Verify harness + bảng 4 ca kiểm thử; bằng chứng chạy trên live (JSON) | b |
| `06_Tai-lieu-ky-thuat/` | Hồ sơ kỹ thuật & nghiên cứu (PDF + Word), Tính năng nổi bật, Build log 1 trang, 5 sơ đồ (`So-do/`) | f + tài liệu liên quan |

## Đối chiếu sáu hạng mục theo thể lệ

| # | Hạng mục | Trạng thái |
|---|---|---|
| a | Live URL + dòng hướng dẫn ở trang chủ | ✅ Bản mới đã triển khai 15/10; trang chủ có dòng "Giám khảo: bấm ① … sau đó ②"; không cần tài khoản |
| b | Verify harness + 4 ca kiểm thử dạng bảng + runbook | ✅ Một nút chạy 9 ca (4 chung + 5 Đề A) có dấu thời gian; trên live 9/9 PASS; RUNBOOK từ clone sạch |
| c | Repo công khai, đủ lịch sử commit | ✅ Không squash, không force-push (PR merge bằng merge commit) |
| d | Video demo ≤ 3 phút | ✅ 2:41, quay trực tiếp trên Live URL; màn mở đầu 6 tính năng nổi bật; giọng đọc AI và phụ đề; nêu giới hạn ở cuối |
| e | 5 slide đúng cấu trúc (không thêm slide) | ✅ Slide 2 có sơ đồ luồng và điểm con người quyết định; Slide 4 có sơ đồ kiến trúc và bảng công nghệ thật/giả lập; ô "[Cập nhật 16/10]" chờ phản hồi người dùng thật |
| f | Build log 1 trang | ✅ Đủ 4 ý: công cụ AI và cách dùng, chỗ hiệu quả, chỗ tốn kém, tính năng lớn nhất đã cắt |
| + | Mục câu hỏi người dùng trong Proposal (hạn 19:00 15/10) | Có trong `01_Proposal/` — dán vào Proposal trên Drive |

## Ghi chú minh bạch
- **Video** quay tự động bằng Playwright trên Live URL ngày 15/10/2026 (thao tác thật trên hệ thống đang chạy, không dựng cảnh); **giọng đọc do AI tạo** (edge-tts, giọng nam vi-VN-NamMinhNeural), phụ đề in sẵn; lời thuyết minh được đối chiếu từng câu với mã nguồn.
- **Số liệu** trên slide, Proposal và build log là dữ liệu tổng hợp do đội/AI viết, chưa phải đánh giá độc lập. Kết quả 3 người dùng do BTC điều phối có ngày 16/10; ô tương ứng chỉ được điền bằng phản hồi thật.
- Đọc ảnh/PDF scan dùng Gemini Vision qua ShopAIKey (kiểm với key thật 15/10: ảnh ~14 giây, PDF ~26 giây, luôn cần kế toán kiểm tra lại). Quyết định thuế do quy tắc tất định.

## Kiểm tra trên Live URL ngày 15/10/2026
- `GET /api/verify?mode=judge`: 9/9 PASS (runId `79f02bce-a485-4877-a206-4768bd802aae`), mỗi ca 22–50 ms.
- Smoke test API: đạt — phiên demo có 4 ca mẫu, trả lời "1A, 2A", dừng/hoàn tác, công tắc tự động hóa, bộ lớn cần phiên.
- Playwright trên máy tính và điện thoại 390px: các luồng chính đạt; trang chủ ~1,3–2,2 giây.
- Còn thiếu trên live: `/api/health` hiện `commit: unknown` (cần biến `GIT_COMMIT_SHA`) và `hmac: false` (cần `TAX_REFEREE_AUDIT_KEY`; chuỗi hash vẫn hoạt động).
