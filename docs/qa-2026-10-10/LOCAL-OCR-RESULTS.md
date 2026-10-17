# Thử nghiệm OCR cục bộ trên ảnh hóa đơn — 10/10/2026

## Kết quả

Phương pháp thử là worker OCR giữ model **PP-OCRv5 mobile Latin** trong bộ nhớ, chạy ONNX Runtime CPU và trích các trường hóa đơn bằng parser cục bộ. Đây là thử nghiệm định tuyến qua app thật trên máy Apple M1, RAM 8 GB; không gửi ảnh tới OpenRouter hay dịch vụ AI bên ngoài.

| Ảnh | Thời gian hiển thị trên UI |
|---|---:|
| 07 — Circle K | 1,41 giây |
| 08 — Co.op Food | 1,34 giây |
| 09 — cửa hàng bán lẻ | 1,52 giây |
| 10 — nhà hàng | 1,44 giây |
| 11 — hóa đơn gaming | 1,52 giây |

Trung vị là **1,44 giây**, P95 nearest-rank của mẫu 5 ảnh là **1,52 giây**, và **5/5 ảnh** dưới 2 giây. Đây là kết quả của bộ mẫu thử hiện tại, chưa phải cam kết cho mọi loại hóa đơn. Kết quả đo chi tiết nằm trong `local-ocr-evidence/ui-results.json` (bằng chứng thô không commit, xem `.gitignore`).

Worker được khởi động và nạp model trước khi bấm tải ảnh. Thời gian nạp model là **1,922 giây** riêng, chưa tính vào con số trên UI. Trong 15 lượt gọi trực tiếp worker sau khi đã nạp model, profile giới hạn cạnh dài 960px có trung vị **832 ms**, P95 nearest-rank **1,052 ms**, tối đa **1,052 ms** ở vòng chạy cải thiện. Cold start vẫn mất khoảng **1,922 ms** và được đo riêng.

## Độ chính xác có thể xác nhận

Đáp án được đọc thủ công từ 5 ảnh nguồn, không lấy README làm đáp án. Trên 22 giá trị trường hiện diện được chấm gồm số hóa đơn, ngày, tổng tiền, cách thanh toán, MST nhà cung cấp, thuế suất và tiền thuế, lượt chạy cải thiện đúng **22/22 (100%)**. Mười chín lần kiểm tra các trường được xác định là không in trên ảnh đều tiếp tục để trống (**19/19**), không suy ra mã số/thuế/phương thức thanh toán. Chỉ số này không chấm chất lượng nhận dạng tên nhà cung cấp hoặc tên hàng; tên hàng tiếng Việt vẫn có lỗi dấu rõ rệt.

Kết quả 100% đạt được sau khi bổ sung các biến thể nhãn bị OCR làm sai ("ngy", "Hạ số thuế", "Tiền MT"), nối tiếp số tiền ở dòng kế bên và nhận tiền thuế chỉ khi ảnh có nhãn VAT rõ ràng. Guard ở route cũng chặn việc tự điền MST từ danh bạ nhà cung cấp và chặn suy ra tiền trước thuế từ tổng tiền + thuế suất cho local OCR. Vì vậy, 100% là độ đúng của các trường đã chọn trên đúng 5 ảnh, không phải độ chính xác tổng quát hay cam kết cho dữ liệu thực tế.

Bằng chứng worker theo từng lần chạy: `local-ocr-evidence/max960-accuracy-final/benchmark.json` (không commit, xem `.gitignore`). Các file JSON kèm theo giữ kết quả OCR và đối chiếu trường cho từng ảnh.

## Cách diễn giải và giới hạn

Thời gian UI bao gồm xử lý upload, tối ưu ảnh, OCR/parse và cập nhật form; đây là con số sát thao tác người dùng hơn thời gian inference riêng. Thử nghiệm có một lượt không cache trên mỗi ảnh và chỉ năm ảnh, nên đủ để xác nhận cấu hình hiện tại đạt ngưỡng trên bộ mẫu, nhưng chưa đủ ước lượng SLO production. Cần tập ảnh lớn hơn, nhiều lượt trên từng loại máy và đo cold/warm riêng trước khi công bố cam kết.

Local OCR có thể giúp ảnh rõ đạt độ trễ thấp mà không dùng token suy luận hình ảnh, nhưng không thể kết luận là nhanh hơn và chính xác ngang hơn model vision trên toàn bộ hóa đơn. Với mức lỗi trường như trên, hồ sơ vẫn cần kiểm tra người dùng và các trường thiếu phải tiếp tục được xem là chưa xác minh.

## Định tuyến hybrid sau lần đo

Ảnh rõ được xử lý bằng worker local. Khi worker không đọc được ảnh, thiếu số hóa đơn/ngày/tổng tiền, có quá ít vùng chữ, hoặc vượt ngưỡng tin cậy cấu hình (`0,82` trung bình hay `35%` dòng thấp), app tự chuyển ảnh sang `qwen/qwen3.7-flash` qua OpenRouter. Worker bị ngắt cũng bị giới hạn chờ khoảng `2,2 giây` (`LOCAL_OCR_TIMEOUT_MS`) để không làm UI treo lâu trước khi chuyển tầng. Nếu hai nguồn đưa ra giá trị khác nhau, trường đó được đánh dấu cần xác minh thay vì âm thầm ghi đè; nếu Qwen lỗi hoặc không có API key, kết quả local được giữ lại cùng cảnh báo để không tạo dữ liệu chắc chắn giả.

Các điều kiện này chỉ dùng độ tin cậy, trường bắt buộc và kiểm tra đối chiếu; không dùng tên file, tên nhà cung cấp hoặc bố cục của năm ảnh mẫu. Vì vậy đây là cơ chế giảm rủi ro overfitting, không phải bằng chứng rằng mọi ảnh camera đều đúng 100%.
