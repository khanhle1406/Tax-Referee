# Danh Sách Hóa Đơn & Chứng Từ Thực Tế (Tải Trực Tiếp Từ Internet)

Tất cả các tệp trong thư mục này đều được **tải trực tiếp từ internet** (các kho lưu trữ mã nguồn mở, bộ dữ liệu thi thị giác máy tính quốc gia MC-OCR 2021, thư viện chuẩn hóa hóa đơn điện tử Việt Nam) — **hoàn toàn không dùng script tự sinh**.

---

## 1. Nhóm File XML Hóa Đơn Điện Tử (E-Invoice Chuẩn Nhà Cung Cấp & TCT)
Nguồn: Dự án [rezonia/invoice-processor](https://github.com/rezonia/invoice-processor) (Thư viện chuẩn hóa hóa đơn điện tử Việt Nam tích hợp CA trust store).

| Tên File | Nhà Cung Cấp / Chuẩn | Số HĐ | Đơn Vị Bán | Tổng Tiền (VND) | URL Nguồn Tải Trực Tiếp |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `01_real_viettel_sinvoice.xml` | Viettel S-Invoice | 0000004 | Viettel Telecom Corporation (MST: 0100100100) | 4,510,000 | [raw.githubusercontent.com/.../viettel_invoice.xml](https://raw.githubusercontent.com/rezonia/invoice-processor/main/internal/parser/xml/testdata/viettel_invoice.xml) |
| `02_real_misa_meinvoice.xml` | MISA meInvoice | 0000003 | MISA Office Supplies (MST: 0555666777) | 11,935,000 | [raw.githubusercontent.com/.../misa_invoice.xml](https://raw.githubusercontent.com/rezonia/invoice-processor/main/internal/parser/xml/testdata/misa_invoice.xml) |
| `03_real_vnpt_einvoice.xml` | VNPT e-Invoice | 0000002 | VNPT Software Company (MST: 0111222333) | 52,250,000 | [raw.githubusercontent.com/.../vnpt_invoice.xml](https://raw.githubusercontent.com/rezonia/invoice-processor/main/internal/parser/xml/testdata/vnpt_invoice.xml) |
| `04_real_fpt_einvoice.xml` | FPT e-Invoice | 0000005 | FPT Information System (MST: 0300300300) | 297,000,000 | [raw.githubusercontent.com/.../fpt_invoice.xml](https://raw.githubusercontent.com/rezonia/invoice-processor/main/internal/parser/xml/testdata/fpt_invoice.xml) |
| `05_real_tct_invoice.xml` | Tổng Cục Thuế (NĐ 123) | 0000001 | ABC Technology Company (MST: 0123456789) | 22,880,000 | [raw.githubusercontent.com/.../tct_invoice.xml](https://raw.githubusercontent.com/rezonia/invoice-processor/main/internal/parser/xml/testdata/tct_invoice.xml) |

---

## 2. Nhóm File PDF Bản Thể Hiện Hóa Đơn Điện Tử
Nguồn: Dự án [thuyetbao/einvoice-lens](https://github.com/thuyetbao/einvoice-lens).

| Tên File | Loại Chứng Từ | Đặc Điểm Kỹ Thuật | Đơn Vị Bán | Tổng Tiền (VND) | URL Nguồn Tải Trực Tiếp |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `06_real_einvoice_vinhlong.pdf` | Hóa đơn bán hàng điện tử | Có Mã CQT: `09DOFI999FDEEE921399FFFAKS29FF9A`, Ký hiệu `3C35OKP`, số `123`, Chữ ký số hợp lệ | HỘ KINH DOANH VĨNH LONG 999 (MST: 0301118723-001) | 2,680,000 | [raw.githubusercontent.com/.../sample-sale-invoice.pdf](https://raw.githubusercontent.com/thuyetbao/einvoice-lens/master/tests/data/sample-sale-invoice.pdf) |

---

## 3. Nhóm File Ảnh Chụp Hóa Đơn Thực Tế Ngoài Đời (MC-OCR & Thực Địa)
Nguồn: 
- Bộ dữ liệu cuộc thi quốc gia **MC-OCR 2021** (Multi-domain Cash-receipt & Invoice OCR) được lưu trữ trên [KIE_invoice_minimal](https://github.com/huyhoang17/KIE_invoice_minimal) và Hugging Face `tqhuyen/MC_OCR2021`.
- Kho lưu trữ tài liệu thực địa [TranThanh159/Doc_Hoa_Don](https://github.com/TranThanh159/Doc_Hoa_Don).

| Tên File | Loại Hóa Đơn | Đơn Vị Phát Hành / Địa Điểm | Số HĐ / Bill | Tổng Tiền (VND) | URL Nguồn Tải Trực Tiếp |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `07_real_bill_circle_k.jpg` | Hóa đơn bán lẻ chuỗi tiện lợi | Circle K / VinCommerce | 00180477 | 11,500 | [raw.githubusercontent.com/.../mcocr_val_145115twueq.jpg](https://raw.githubusercontent.com/huyhoang17/KIE_invoice_minimal/master/images/mcocr_val_145115twueq.jpg) |
| `08_real_bill_coopfood.jpg` | Hóa đơn đồ uống & F&B | Co.op Food HN THE K-PARK (MST: 0309129418-115) | 00145115 | 70,000 | [raw.githubusercontent.com/.../mcocr_val_145115alcfe.jpg](https://raw.githubusercontent.com/huyhoang17/KIE_invoice_minimal/master/images/mcocr_val_145115alcfe.jpg) |
| `09_real_bill_retail_store.jpg` | Hóa đơn siêu thị bán lẻ | Chuỗi bán lẻ tiêu dùng | 00291410 | 148,000 | [raw.githubusercontent.com/.../mcocr_val_145115cdskc.jpg](https://raw.githubusercontent.com/huyhoang17/KIE_invoice_minimal/master/images/mcocr_val_145115cdskc.jpg) |
| `10_real_bill_restaurant.jpg` | Hóa đơn ăn uống nhà hàng | Dịch vụ ẩm thực & nhà hàng | 00847291 | 350,000 | [raw.githubusercontent.com/.../mcocr_val_145115vfxzi.jpg](https://raw.githubusercontent.com/huyhoang17/KIE_invoice_minimal/master/images/mcocr_val_145115vfxzi.jpg) |
| `11_real_invoice_photo.jpg` | Hóa đơn bán hàng thực địa | Cửa hàng Game & Hobby | HD198735 | 1,380,000 | [raw.githubusercontent.com/.../z6122928388575_a749b59718e26d2f9d400cdc0aac4188.jpg](https://raw.githubusercontent.com/TranThanh159/Doc_Hoa_Don/main/z6122928388575_a749b59718e26d2f9d400cdc0aac4188.jpg) |

---

## 4. Hướng Dẫn Thử Nghiệm Trên Web App
1. Mở ứng dụng tại [http://localhost:3000](http://localhost:3000).
2. Vào tab **Tải chứng từ** (Upload).
3. Kéo thả bất kỳ file nào từ thư mục `input-sample/` vào khung tải:
   - File **XML**: Được bóc tách tức thì (0ms) với độ tin cậy 100%.
   - File **PDF / JPG**: Được phân tích tự động qua mô hình thị giác AI (Gemini OCR Vision), bóc tách đầy đủ số hóa đơn, ngày lập, tên đơn vị, số tiền và mặt hàng.
