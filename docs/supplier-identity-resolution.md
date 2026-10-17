# Đối chiếu danh tính nhà cung cấp

## Luồng tự động

1. Vision đọc tên, MST, địa chỉ và dữ liệu hóa đơn một lần. Giữ giá trị gốc.
2. Tìm bản ghi còn hiệu lực theo MST chính xác, tên pháp lý chuẩn hóa hoặc alias đã có bằng chứng. Bỏ qua master nhập tay. Không rút MST chi nhánh về MST công ty mẹ.
3. Nếu có MST hợp lệ nhưng chưa có bản ghi, gọi adapter dữ liệu thuế. Chỉ chấp nhận mã trả về trùng chính xác, tên có dữ liệu, nguồn còn mới. Nếu tên ảnh không khớp tên/alias thì vẫn cần chứng minh liên hệ qua tra cứu.
4. Nếu thiếu MST và có khóa tìm doanh nghiệp, tìm ứng viên theo tên; kết quả tìm kiếm chỉ là manh mối. Trùng tên/chi nhánh phải được phân biệt bằng bằng chứng, không dùng độ giống tên hoặc confidence của AI để tự chọn.
5. API LLM dùng chung có thể gợi ý URL nguồn cho các ca thương hiệu, tên sai hoặc tên cũ. Máy chủ chỉ chấp nhận URL HTTPS thuộc cơ quan nhà nước, tự tải trang và xác nhận tên pháp lý cùng MST xuất hiện trên chính trang đó; gợi ý của AI không được coi là bằng chứng.
6. Chỉ kết quả VERIFIED mới điền tên/MST. CONFLICT, AMBIGUOUS, NOT_FOUND hoặc SOURCE_UNAVAILABLE giữ thông tin ảnh. Nguồn và trạng thái lưu trong extraction review và workflow review.

## Lưu và hiệu năng

- SQLite có index cho tên pháp lý và alias; kho riêng theo database nội bộ hoặc phiên demo.
- Thành công lưu 7 ngày, kèm nguồn và thời điểm truy vấn. Thời điểm truy vấn khác thời điểm cập nhật nguồn; `sourceUpdatedAt` chỉ có khi nguồn thực sự cung cấp.
- Alias theo cửa hàng có phạm vi địa chỉ; địa chỉ khác phải đối chiếu lại. Thương hiệu đã biết gắn nhiều pháp nhân không được tự chọn khi thiếu địa chỉ/MST.
- Lưu lịch sử kết quả và tên cũ cùng MST. Không mặc định doanh nghiệp đang hoạt động chỉ vì tìm được danh tính.
- WeakMap theo database gom lời gọi đang chạy cùng truy vấn; không chia sẻ kết quả giữa các phiên. Cache lỗi giới hạn 200 truy vấn mỗi database, lỗi dịch vụ 15 giây, không tìm được/mơ hồ 60 giây.
- Đọc lại ảnh sử dụng kết quả Vision đã lưu và kiểm tra lại danh tính. Nếu nguồn hết hạn mà không xác minh lại được, khôi phục tên/MST gốc và bỏ dấu xác minh.

## Cấu hình nguồn

Vision, sinh câu hỏi và gợi ý tra cứu dùng chung `DEV_LLM_BASE_URL`, `DEV_LLM_API_KEY`, `DEV_LLM_MODEL` qua API tương thích OpenAI. Mọi yêu cầu LLM đều gửi `stream: false` để nhận JSON chuẩn.

Adapter tra MST Xinvoice dùng `XINVOICE_CLIENT_ID` và `XINVOICE_API_KEY` theo [tài liệu chính thức](https://xinvoice.vn/docs/api-tich-hop/api-tra-mst/). API này phục vụ tra theo MST, không thay thế API tìm theo tên.

Adapter tìm ứng viên dùng `DOANHNGHIEP_API_KEY` theo [tài liệu nhà cung cấp](https://doanhnghiep.vn/api/docs). Nguồn này không được coi là cơ quan thuế; ứng viên phải được đối chiếu dữ liệu thuế trước khi tự điền.

Không có khóa API vẫn có kho cục bộ và dữ liệu tra cứu thuế có cấu trúc. Nếu mô hình không tìm được trang nguồn hoặc trang không thể tải/không chứa cả tên và MST thì hệ thống giữ nguyên dữ liệu ảnh, không tự điền danh tính.

## Kiểm thử

`npm run test:official-supplier` gồm kiểm tra bộ lọc grounding và bộ đối chiếu mới: nhớ alias, giữ tên ảnh, MST chính xác, xung đột, nhiều chi nhánh, địa chỉ khác, hết hạn, lịch sử tên, yêu cầu đồng thời, phân vùng database, master nhập tay, cache lỗi, kiểm chứng ứng viên và ảnh → API → dữ liệu chuẩn hóa → cache.

`npm run test:acceptance` chạy bộ hồi quy toàn dự án. Kiểm thử giả lập xác nhận quy tắc và luồng dữ liệu, không đo độ chính xác trên hóa đơn thực tế. Muốn công bố tỷ lệ tự điền đúng cần bộ hóa đơn có nhãn, gồm thương hiệu đa pháp nhân và chi nhánh.
