# Chứng từ công khai để demo Tax Referee

Thư mục chính có **8 chứng từ công khai**: 5 ảnh bill và 3 trang hóa đơn PDF
trích từ tài liệu công khai. Danh mục [`demo-suppliers.json`](demo-suppliers.json)
có **6 nhà cung cấp** tương ứng. Không tạo hóa đơn giả, thay tên/MST hoặc sửa
ngày, số tiền để chứng từ trông như giao dịch khác.

Nguồn công khai không chứng minh tính hợp pháp của giao dịch hoặc quyền tái
phân phối. Các mẫu hiện tại **chưa đủ điều kiện công bố độ chính xác**: quyền
sử dụng chưa xác minh đầy đủ và chưa có nhãn nghiệp vụ độc lập. Manifest lưu
nguồn, hash và trạng thái từng mẫu; không dùng tên file hoặc README làm đáp án.

## 1. Ba hóa đơn PDF công khai

Nguồn: [phụ lục báo cáo cấp phép môi trường công khai trên cổng Hải Phòng](https://cdn.haiphong.gov.vn/gov-hpg/1/tintuc/2026/5/bc-cap-gpmt639134816288045391.pdf).
Các tệp chỉ trích riêng một trang từ PDF nguồn 162 trang, giữ nguyên bố cục và
nội dung. Số trang dưới đây tính từ 1 theo trình xem PDF.

| Tệp | Bên bán trên chứng từ | MST bên bán | Số hóa đơn | Tổng tiền | Trang nguồn |
| --- | --- | --- | --- | --- | --- |
| `12_public_hai_phong_waste.pdf` | Công trình công cộng và Dịch vụ du lịch Hải Phòng | `0200534908` | `00033167` | 8.270.837 đ | [98](https://cdn.haiphong.gov.vn/gov-hpg/1/tintuc/2026/5/bc-cap-gpmt639134816288045391.pdf#page=98) |
| `13_public_hai_phong_water.pdf` | Cấp nước Hải Phòng | `0200171274` | `72265` | 34.998.003 đ | [131](https://cdn.haiphong.gov.vn/gov-hpg/1/tintuc/2026/5/bc-cap-gpmt639134816288045391.pdf#page=131) |
| `14_public_hai_phong_electricity.pdf` | Điện lực Hải Phòng – chi nhánh Tổng công ty Điện lực miền Bắc | `0100100417-069` | `24681` | 40.545.992 đ | [138](https://cdn.haiphong.gov.vn/gov-hpg/1/tintuc/2026/5/bc-cap-gpmt639134816288045391.pdf#page=138) |

Tên đầy đủ được chép trong danh mục, MST chi nhánh giữ nguyên. Manifest có hash
cả tài liệu nguồn và từng tệp trích, số trang, cách trích và các trường đối chiếu
thủ công. Không đưa toàn bộ báo cáo, thông tin cá nhân hay phụ lục không liên
quan vào bộ demo. Chưa kiểm tra chữ ký số; việc trích trang **không bảo toàn chữ
ký số tệp gốc**, dù ảnh trình bày có dòng “Signature Valid”.

Lưu ý khi trình diễn:

- Cả ba hóa đơn ghi phương thức thanh toán không xác định duy nhất (TM/CK hoặc
  tiền mặt/chuyển khoản). Không tự chọn tiền mặt hoặc coi đã có chứng từ ngân hàng.
- Hóa đơn nước có **hai thuế suất 5% và 8%**. Không ép thành một thuế suất chung
  hoặc tự suy ra số thuế từ tổng tiền; đây là trường hợp cần rà soát theo khả năng
  biểu diễn hiện hành của ứng dụng.
- Hóa đơn điện có MST đơn vị cung cấp phần mềm ở chân trang. MST bên bán là
  **`0100100417-069`**, không phải MST phần mềm EVN.
- Giữ ngày lập gốc; không đổi thành ngày demo để vượt điều kiện nghiệp vụ.

## 2. Năm ảnh bill

Nguồn ảnh: [KIE_invoice_minimal](https://github.com/huyhoang17/KIE_invoice_minimal)
và [Doc_Hoa_Don](https://github.com/TranThanh159/Doc_Hoa_Don). Các giá trị sau đối
chiếu từ [`ground-truth/camera-truth.json`](ground-truth/camera-truth.json), là
bản chép thủ công, chưa phải nhãn đánh giá độc lập.

| Tệp | Bên bán đọc trên ảnh | Số bill | Tổng tiền | Nguồn |
| --- | --- | --- | --- | --- |
| `07_real_bill_circle_k.jpg` | VinCommerce; không phải Circle K theo tên file | `00180477` | 11.500 đ | [Ảnh gốc](https://raw.githubusercontent.com/huyhoang17/KIE_invoice_minimal/master/images/mcocr_val_145115twueq.jpg) |
| `08_real_bill_coopfood.jpg` | Co.op Food HN THE K-PARK | `09336` | 13.832 đ | [Ảnh gốc](https://raw.githubusercontent.com/huyhoang17/KIE_invoice_minimal/master/images/mcocr_val_145115alcfe.jpg) |
| `09_real_bill_retail_store.jpg` | VinCommerce | `00230250` | 26.400 đ | [Ảnh gốc](https://raw.githubusercontent.com/huyhoang17/KIE_invoice_minimal/master/images/mcocr_val_145115cdskc.jpg) |
| `10_real_bill_restaurant.jpg` | VinCommerce; không phải nhà hàng theo tên file | `00177774` | 28.200 đ | [Ảnh gốc](https://raw.githubusercontent.com/huyhoang17/KIE_invoice_minimal/master/images/mcocr_val_145115vfxzi.jpg) |
| `11_real_invoice_photo.jpg` | nShop / Game & Hobby | `HD198735` | 1.380.000 đ | [Ảnh gốc](https://raw.githubusercontent.com/TranThanh159/Doc_Hoa_Don/main/z6122928388575_a749b59718e26d2f9d400cdc0aac4188.jpg) |

Tên file cũ được giữ để không làm hỏng nhãn và liên kết. Các bill VinCommerce
không in MST. MST pháp nhân **0104918404** tham chiếu từ [website VinMart](https://vinmart.com/),
chưa chứng minh MST chi nhánh/điểm bán. Bill nShop không in MST; **0316713247**
và tên pháp nhân tham chiếu [website nShop](https://www.nshop.com.vn/pages/gioi-thieu-nshop),
chưa xác minh chi nhánh. Co.op giữ đúng MST chi nhánh **0309129418-115** in trên
bill; tên cửa hàng chưa được xác minh thành tên pháp lý. Thuế không nhìn thấy
phải để thiếu, không suy ra từ tổng tiền.

## 3. Fixture giả lập đã tách riêng

Năm XML `01`–`05` và PDF minh họa `06` trước đây đã chuyển nguyên bytes sang
[`tests/fixtures/legacy-invoices`](../tests/fixtures/legacy-invoices/). Manifest
riêng lưu nguồn/hash cũ. Chúng phục vụ hồi quy parser, **không nằm trong bộ
chứng từ giao dịch dùng demo**, không được nạp vào danh mục nhà cung cấp demo.
Không coi giá trị tên/MST trong fixture là danh tính doanh nghiệp đã xác minh.

## 4. Nạp danh mục local và đọc lô

Chạy từ thư mục gốc:

```sh
npm run dataset:verify
npm run demo:suppliers
```

Lệnh nạp đối chiếu SHA-256 chứng từ rồi lưu 6 nhà cung cấp / 8 chứng từ vào
`data/runtime/demo-supplier-catalog.sqlite` (mặc định). Không gọi AI hoặc cần
khóa API cho bước này. Danh mục chỉ tra trong **phiên demo**, tách khỏi hồ sơ và
nguồn xác minh chính thống. Nếu thay tệp, phải rà soát nguồn, nhãn và manifest
trước khi nạp lại; không thay hash chỉ để bỏ qua cảnh báo.

Kết quả khớp là **`DEMO_MATCH` / `DEMO_CATALOG`**, không phải `VERIFIED`. Dữ liệu
tham chiếu không xác nhận doanh nghiệp đang hoạt động, không miễn kiểm tra
nghiệp vụ. Tên/MST mâu thuẫn được giữ để đối chiếu; không tự ghi đè.

1. Mở [localhost:3000](http://localhost:3000), vào phiên demo → **Tiếp nhận**.
2. Chọn hoặc kéo thả một lô tối đa **20 tệp**, mỗi tệp **15 MB**; hỗ trợ XML,
   PDF, JPG/JPEG, PNG và WEBP. Thư mục demo hiện không có XML giao dịch thực.
3. App gửi tối đa **3 request đọc song song**, mỗi tệp có trạng thái riêng.
4. Chọn từng hóa đơn, đối chiếu nguồn và bổ sung dữ kiện rồi **Thẩm định**.
   Đọc lô không tự phê duyệt cả lô.
5. Có thể dừng và thử lại tệp lỗi/đã dừng; kết quả tệp đã đọc được giữ lại.
   Kiểm tra bản nháp trước khi đóng lô hoặc rời trang.

XML dùng parser cấu trúc. Ảnh/PDF gửi trực tiếp cho AI; PDF có lớp chữ gửi thêm
lớp chữ hỗ trợ, **không chạy OCR cục bộ**. Danh mục hỗ trợ nhận diện nhà cung cấp,
không bảo đảm tìm được khi dữ liệu đọc sai và không bảo đảm trích xuất đúng mọi
trường. `dataset:verify` chỉ kiểm tra cấu trúc, tồn tại tệp và hash; không chứng
nhận tính pháp lý, quyền sử dụng hoặc accuracy.
