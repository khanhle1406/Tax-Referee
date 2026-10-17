# Build log — Tax Referee (Đề A · The Escalation Referee)

> 📌 **Ảnh chụp lịch sử** — bản nộp 15/10/2026, số liệu là của lúc đó (44 unit test). Hiện hành: `npm test` 16 bộ, 110 kiểm tra unit; buổi thử người dùng 16/10 không có phản hồi chi tiết bằng văn bản nên repo không công bố số liệu người dùng. Số liệu hiện hành: [README](../README.md), trang `/verify`, `/sop` và `docs/evidence/`.

**Đội:** Fprinciples · **Sprint 1:** 19–22/09 · **Sprint 2:** 28/09–15/10/2026 · **Live:** https://limegreen-salamander-517622.hostingersite.com

## 1. Công cụ AI đã dùng và cách dùng
| Công cụ | Cách dùng |
|---|---|
| ChatGPT, Claude (chat) | Brainstorm, đọc đề, phác SOP và luồng nghiệp vụ (ghi chú nháp trong `brainstorming/`, không phải bằng chứng) |
| OpenAI Codex, Claude Code | Viết/refactor mã Next.js–TypeScript, test, tài liệu. Đội đọc lại và chạy test trước mỗi commit |
| Claude Code (agent) | Rà soát như giám khảo, phản biện chéo mã nguồn, viết 72 ca bẫy từ SOP; chỉ sửa lỗi tái hiện được bằng test |
| Gemini 2.5 Flash Vision (ShopAIKey) | **Trong sản phẩm:** đọc ảnh/PDF scan hóa đơn. Không tham gia phân loại hay quyết định thuế |
| Playwright, edge-tts | Kiểm thử giao diện; quay video demo tự động trên live và tạo giọng đọc AI (có ghi chú trong video) |

## 2. AI giúp nhanh ở đâu
- Dựng khung Next.js + SQLite + workflow có revision/audit; sinh dữ liệu tổng hợp và kịch bản test.
- Rà soát diện rộng tìm lỗi đội bỏ sót: ai cũng thành CFO được, ca không khớp quy tắc bị tự duyệt, cước di động 8% lọt qua, có thể "rửa" ca chờ CFO bằng cách hạ số tiền.
- Câu hỏi chuyển tiếp có số liệu: trên 11 ca diễn tập, câu hỏi qua kiểm tra tự động tăng 1/10 → 8/8; ca xử lý đúng 3/11 → 11/11.
- Red team: 72 ca bẫy lúc đầu đúng 66/72, sau khi sửa 72/72 và thành bộ hồi quy (nhãn do AI gán, chưa được người nghiệp vụ duyệt).

## 3. AI gây tốn thời gian / rủi ro ở đâu
- **Commit khổng lồ** (216 file, +28.859 dòng) khó review, khó chứng minh quá trình → từ 14/10 chuyển sang commit nhỏ.
- **Nội dung bịa:** bản nháp AI chứa 3 "người dùng thật" và số liệu "42 ca, STP 92,3%" không có thật → đã gỡ, đính chính công khai; quy định không đưa nội dung AI sinh vào bằng chứng.
- **Claim sai và lan man phạm vi** ("0% bỏ sót", module ngân hàng/ERP/crawler) → xóa claim, gom module phụ vào "Mở rộng · beta".
- Môi trường: build trên Hostinger lỗi EAGAIN (phải đóng gói local); máy thiếu RAM khiến build/agent song song bị sập.

## 4. Tính năng lớn nhất đã cắt
**Tích hợp thật với ERP, ngân hàng và Cổng thuế** (tự hạch toán, đối soát sao kê, nộp tờ khai): không có môi trường và dữ liệu thật để kiểm chứng trong thời gian thi; làm giả sẽ trái nguyên tắc "không khẳng định điều chưa chứng minh". Thời gian dồn vào lõi Đề A: dừng đúng lúc, câu hỏi một lần, audit/dừng/hoàn tác. Cũng cắt chữ ký số trên hồ sơ giải trình (cần chứng thư số thật).

## 5. Kiểm chứng
`npm test` 16/16 bộ (44 unit test + 15 bộ hồi quy, gồm 72 ca red team); CI GitHub Actions xanh (Ubuntu, Windows, build); Playwright trên bản build 18/19 mục; Verify 9 ca có dấu thời gian. Dữ liệu là tổng hợp, chưa phải đánh giá độc lập; kết quả 3 người dùng thật có ngày 16/10.
