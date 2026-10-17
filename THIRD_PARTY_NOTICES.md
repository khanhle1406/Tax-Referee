# Thông báo về tài nguyên bên thứ ba

Mã nguồn của Tax Referee phát hành theo [MIT License](LICENSE). Giấy phép MIT **không** áp dụng cho các tài nguyên bên thứ ba dưới đây; mỗi tài nguyên theo điều khoản riêng của chủ sở hữu.

## Chứng từ mẫu (`input-sample/`)

Các file được tải từ kho công khai để thử parser và luồng đọc chứng từ. Trạng thái giấy phép ghi trong [`input-sample/manifest.json`](input-sample/manifest.json) (trường `licenseStatus`); nguồn tải chi tiết ở [`input-sample/README.md`](input-sample/README.md).

| File | Nguồn | `licenseStatus` |
|---|---|---|
| `tests/fixtures/legacy-invoices/01`–`05_*.xml` | [rezonia/invoice-processor](https://github.com/rezonia/invoice-processor) — fixture giả lập đã tách khỏi bộ demo | `UNVERIFIED` |
| `tests/fixtures/legacy-invoices/06_real_einvoice_vinhlong.pdf` | [thuyetbao/einvoice-lens](https://github.com/thuyetbao/einvoice-lens) — PDF minh họa đã tách khỏi bộ demo | `UNVERIFIED` |
| `07`–`10_real_bill_*.jpg` | Bộ dữ liệu MC-OCR 2021 qua [huyhoang17/KIE_invoice_minimal](https://github.com/huyhoang17/KIE_invoice_minimal) | `RESEARCH_ONLY_OR_UNVERIFIED` |
| `11_real_invoice_photo.jpg` | [TranThanh159/Doc_Hoa_Don](https://github.com/TranThanh159/Doc_Hoa_Don) | `UNVERIFIED` |
| `12`–`14_public_hai_phong_*.pdf` | [Báo cáo công khai trên cổng Hải Phòng](https://cdn.haiphong.gov.vn/gov-hpg/1/tintuc/2026/5/bc-cap-gpmt639134816288045391.pdf), trích nguyên trang 98/131/138. Nguồn, số trang và SHA-256 ghi trong manifest; bản trích không bảo toàn chữ ký số | `UNVERIFIED` |

- Chỉ dùng cho nghiên cứu, thử nghiệm và trình diễn. Không dùng để công bố độ chính xác: theo `licensePolicy` của manifest, chỉ mẫu `REDISTRIBUTABLE` mới được dùng cho tuyên bố công khai về độ chính xác. Hiện không mẫu nào có trạng thái này.
- Nếu bạn là chủ sở hữu và muốn gỡ một file, hãy mở issue hoặc liên hệ maintainer (xem [SECURITY.md](SECURITY.md)); đội sẽ gỡ khỏi bản mới.

## Font

| Tài nguyên | Giấy phép |
|---|---|
| [Inter](https://github.com/rsms/inter) — `public/fonts/InterVariable.woff2` | SIL Open Font License 1.1 — toàn văn tại [`public/fonts/LICENSE.txt`](public/fonts/LICENSE.txt) |

## Logo và biểu tượng

Logo TR và các favicon trong `public/` do đội tạo bằng công cụ sinh ảnh rồi xử lý bằng `sharp`; quy trình và prompt ghi tại [`public/brand/README.md`](public/brand/README.md).

## Phụ thuộc phần mềm

- **Gói npm** (Next.js, React, better-sqlite3, Zod, fast-xml-parser, sharp, Radix UI, lucide-react…) được cài qua `npm ci`, không nằm trong repo. Phần lớn theo MIT, ISC, BSD hoặc Apache-2.0; danh sách đầy đủ và phiên bản khóa trong [`package-lock.json`](package-lock.json). Kiểm tra giấy phép: `npx license-checker --summary`.
- **PyMuPDF** (tùy chọn, dùng để đọc lớp chữ và dựng ảnh từ PDF trong `lib/server/pdfToImage.ts`) theo **AGPL-3.0** hoặc giấy phép thương mại của Artifex. Repo không chứa PyMuPDF; `Dockerfile` cài nó vào image. Nếu phân phối image hoặc cung cấp dịch vụ có PyMuPDF, hãy tuân thủ AGPL-3.0 hoặc mua giấy phép thương mại.
- **Poppler** (`poppler-utils`, GPL) được `Dockerfile` cài từ kho của hệ điều hành.

## Dịch vụ bên ngoài

Khi có cấu hình `DEV_LLM_BASE_URL`, `DEV_LLM_API_KEY`, `DEV_LLM_MODEL`, ảnh và PDF được gửi tới dịch vụ AI đó để đọc chứng từ. Tra cứu danh tính có thể gửi MST tới API công khai VietQR hoặc API doanh nghiệp được cấu hình; tên/MST có thể gửi tới dịch vụ AI cấu hình để tìm nguồn. Danh mục local chuẩn bị trước chỉ phục vụ demo, không là bằng chứng xác minh chính thống. Việc dùng dịch vụ theo điều khoản của nhà cung cấp; bộ demo chỉ dùng chứng từ đã công bố công khai, không tải tài liệu nội bộ của người khác khi chưa được phép.
