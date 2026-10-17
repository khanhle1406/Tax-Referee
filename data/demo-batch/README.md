# Bộ hóa đơn demo xử lý theo lô — DỮ LIỆU TỔNG HỢP

Đội tự tạo toàn bộ 25 file này để demo (video và trình bày trực tiếp). **Đây không phải hóa đơn thật** của doanh nghiệp nào:
tên công ty có hậu tố "(MẪU)", MST bên bán do script sinh với chữ số kiểm tra hợp lệ, MST người mua là MST mẫu của workspace
(`0102030405`). Sinh lại bằng: `python scripts/demo/generate_demo_invoices.py`.

Kết quả khi chạy theo thứ tự và luật của màn hình Lô hóa đơn (đọc XML → làm sạch → bỏ file trùng → máy kiểm theo thứ tự MST → ngày → số) với engine hiện tại. Không có test khóa số chính xác: số có thể đổi khi engine đổi, khi trình bày đọc theo màn hình.

| Nhóm kết quả | Số file | Ví dụ |
|---|---|---|
| Máy đề xuất duyệt | 10 | Văn phòng phẩm, nước uống tiền mặt dưới 5 triệu, internet 10%, thuê xe, **một hóa đơn hai thuế suất 8% + 10%** |
| Cần người quyết, trả lời chung được | 3 | Chuyển khoản từ 5 triệu: "đã có ủy nhiệm chi chưa?" (cùng một câu hỏi) |
| Cần người quyết, trả lời chung được | 2 | Tiếp khách có rượu, bia (hai nhà hàng khác nhau) |
| Cần người quyết | 7 | Tiền mặt 10,8 triệu; thuê văn phòng áp 8%; quà tặng khách hàng; sai MST người mua; tổng in lệch; cụm tiền mặt cùng ngày; laptop 330 triệu (CFO) |
| Tạm giữ | 1 | Tờ đầu của cụm tiền mặt cùng ngày (giữ lại khi tờ thứ hai làm cụm vượt 5 triệu) |
| Không đọc được | 1 | `not-an-invoice.xml` (báo giá, không làm hỏng cả lô) |
| Trùng | 1 | `24-trung-van-phong-pham.xml` giống hệt `01`: bị bỏ theo mã băm **trước khi máy kiểm**, không tạo hóa đơn trùng (lô dựng sẵn còn 24 dòng; màn hình Lô hóa đơn đánh dấu "trùng") |

> Lô dựng sẵn (`TAX_REFEREE_DEMO_PRESET_BATCHES=1`, chỉ máy local) không tra cứu bên bán qua mạng. Trên giao diện Lô hóa đơn, bước đọc chứng từ còn tra cứu danh tính bên bán; với MST mẫu không có trong sổ, một vài tờ
> thường quy có thể bị hỏi thêm để xác minh (lần quay demo 17/10: 8 tờ máy đề xuất duyệt thay vì 10). Hành vi này là có chủ ý: không chắc thì hỏi.

`manifest.json` ghi kịch bản, kết quả kỳ vọng và người gửi mẫu (email `@example.com`, tên miền dự phòng) của từng file —
dùng khi demo kênh Gmail: mỗi thành viên gửi file của mình từ email đã khai trong danh bạ người gửi.
