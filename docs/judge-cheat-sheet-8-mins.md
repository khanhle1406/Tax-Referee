# Tax Referee · Hướng dẫn giám khảo 8 phút

Live: https://limegreen-salamander-517622.hostingersite.com — không cần tài khoản. Phiên bản đang chạy: `/api/health` (commit).

| Thời gian | Thao tác | Điều cần quan sát |
|---|---|---|
| 0:00–2:00 | **① Chạy Verify** (`/verify`) → **Chạy Verify** | PASS 9/9: 4 ca chung + 5 ca Đề A (3 tự xử lý, 2 chuyển tiếp); thời điểm từng ca; câu hỏi chuyển tiếp hiện ngay dưới ca |
| 2:00–3:00 | Trang chủ → đọc dòng hướng dẫn → **② Mở hộp chuyển tiếp — demo riêng** | Vào workspace với database riêng của phiên, vai Kế toán viên, có sẵn 4 ca mẫu (1 tự xử lý + 1 ca mỗi kiểu dừng); đổi vai trò mô phỏng ở góc trên |
| 3:00–5:00 | Verify → **Thử dữ liệu mới** (sửa JSON, bỏ trống trường chưa biết) hoặc workspace → **Tiếp nhận** (XML/PDF/ảnh) | Ca thường quy tự xử lý; ca nghi vấn chuyển tiếp với nhóm dừng + câu hỏi có số tiền, trả lời một lần; không lỗi khi dữ liệu lạ (VD thuế suất 7%) |
| 5:00–6:30 | Bài kiểm tra Đề A: nhập ca không rõ ràng theo `/sop`; hoặc mở ca mẫu 0009004 (10 laptop 330 triệu) → đổi vai **CFO** → bảng **Trả lời** trên hồ sơ: bấm A/B từng ý hoặc gõ "1A, 2A" + lý do | Đúng nhóm (Chưa rõ thông tin / Ngoài quy định / Vượt thẩm quyền), đúng người nhận (KTT / CFO), câu hỏi quyết định được ngay; câu trả lời được áp dụng thật (gán giá trị → đánh giá lại; chấp nhận → duyệt; từ chối) |
| 6:30–7:30 | Workspace → **Nhật ký** → chọn hồ sơ → xem sự kiện → **Dừng** → **Hoàn tác**; công tắc **Dừng tự động hóa** (vai KTT/CFO) | Ai, lúc nào, dữ liệu đầu vào (snapshot + inputHash), policy/contract/commit, lý do; hoàn tác là sự kiện mới; khi dừng tự động hóa, ca thường quy chờ duyệt tay, lịch sử bật/tắt ở mục "Sự kiện hệ thống" |

Ghi chú trung thực: dữ liệu Verify là tổng hợp, không phải đánh giá độc lập. Nhóm "Mở rộng · beta" (ngân hàng, đối soát TCT, ERP, báo cáo) là một phần giả lập, ngoài phạm vi Đề A. Buổi thử với người dùng do BTC điều phối diễn ra 16/10; BTC xác nhận buổi thử ổn, không có phản hồi chi tiết bằng văn bản, nên repo không công bố số liệu người dùng.
