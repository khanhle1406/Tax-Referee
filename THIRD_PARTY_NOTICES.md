# Thông báo về tài nguyên bên thứ ba

Mã nguồn của Tax Referee phát hành theo [MIT License](LICENSE). Giấy phép MIT **không** áp dụng cho các tài nguyên bên thứ ba dưới đây; mỗi tài nguyên theo điều khoản riêng của chủ sở hữu.

## Chứng từ mẫu (`input-sample/`)

Các file được tải từ kho công khai để thử parser và luồng đọc chứng từ. Trạng thái giấy phép ghi trong [`input-sample/manifest.json`](input-sample/manifest.json) (trường `licenseStatus`); nguồn tải chi tiết ở [`input-sample/README.md`](input-sample/README.md).

| File | Nguồn | `licenseStatus` |
|---|---|---|
| `01`–`05_*.xml` (Viettel, MISA, VNPT, FPT, TCT) | [rezonia/invoice-processor](https://github.com/rezonia/invoice-processor) — dữ liệu test, MST thử nghiệm | `UNVERIFIED` |
| `06_real_einvoice_vinhlong.pdf` | [thuyetbao/einvoice-lens](https://github.com/thuyetbao/einvoice-lens) — dữ liệu test | `UNVERIFIED` |
| `07`–`10_real_bill_*.jpg` | Bộ dữ liệu MC-OCR 2021 qua [huyhoang17/KIE_invoice_minimal](https://github.com/huyhoang17/KIE_invoice_minimal) | `RESEARCH_ONLY_OR_UNVERIFIED` |
| `11_real_invoice_photo.jpg` | [TranThanh159/Doc_Hoa_Don](https://github.com/TranThanh159/Doc_Hoa_Don) | `UNVERIFIED` |

- Chỉ dùng cho nghiên cứu, thử nghiệm và trình diễn. Không dùng để công bố độ chính xác: theo `licensePolicy` của manifest, chỉ mẫu `REDISTRIBUTABLE` mới được dùng cho tuyên bố công khai về độ chính xác. Hiện không mẫu nào có trạng thái này.
- Nếu bạn là chủ sở hữu và muốn gỡ một file, hãy mở issue hoặc liên hệ maintainer (xem [SECURITY.md](SECURITY.md)); đội sẽ gỡ khỏi bản mới.

## Tài liệu của Ban tổ chức và doanh nghiệp đồng hành

| Tài liệu | Chủ sở hữu | Ghi chú |
|---|---|---|
| Đề bài gốc `Challenge_Brief_OrganizationAI_VN.docx` | Ban tổ chức MLAI Hackathon 2026 | Đã gỡ khỏi bản hiện tại của repo này; vẫn còn trong lịch sử git do lịch sử không được viết lại |
| [`docs/assessment/*.md`](docs/assessment) | Ban giám khảo và doanh nghiệp đồng hành Sprint 1 | Nhận xét gốc, giữ để minh bạch việc xử lý phản hồi |

Giấy phép MIT không áp dụng cho các tài liệu này. Chủ sở hữu muốn gỡ, xin liên hệ maintainer (xem [SECURITY.md](SECURITY.md)).

## Font

| Tài nguyên | Giấy phép |
|---|---|
| [Inter](https://github.com/rsms/inter) — `public/fonts/InterVariable.woff2` | SIL Open Font License 1.1 — toàn văn tại [`public/fonts/LICENSE.txt`](public/fonts/LICENSE.txt) |

## Logo và biểu tượng

Logo TR và các favicon trong `public/` do đội tạo bằng công cụ sinh ảnh rồi xử lý bằng `sharp`; quy trình và prompt ghi tại [`public/brand/README.md`](public/brand/README.md).

## Phụ thuộc phần mềm

- **Gói npm** (Next.js, React, better-sqlite3, Zod, fast-xml-parser, sharp, Radix UI, lucide-react…) được cài qua `npm ci`, không nằm trong repo. Phần lớn theo MIT, ISC, BSD hoặc Apache-2.0; danh sách đầy đủ và phiên bản khóa trong [`package-lock.json`](package-lock.json). Kiểm tra giấy phép: `npx license-checker --summary`.
- **PyMuPDF** (tùy chọn, dùng để đọc lớp chữ PDF trong `lib/server/pdfToImage.ts`) theo **AGPL-3.0** hoặc giấy phép thương mại của Artifex. Repo không chứa PyMuPDF; `Dockerfile` cài nó vào image. Nếu phân phối image hoặc cung cấp dịch vụ có PyMuPDF, hãy tuân thủ AGPL-3.0 hoặc mua giấy phép thương mại.
- **Poppler** (`poppler-utils`, GPL) được `Dockerfile` cài từ kho của hệ điều hành.

## Dịch vụ bên ngoài

Khi có khóa API, ảnh và PDF scan được gửi tới Gemini 2.5 Flash (model mặc định) qua proxy ShopAIKey để đọc chứng từ. Tra cứu danh tính bên bán có thể gửi MST tới API công khai VietQR (`api.vietqr.io`, không cần khóa), gửi tên/MST tới cùng proxy (grounding) và, nếu đặt khóa `XINVOICE_*` hoặc `DOANHNGHIEP_API_KEY`, tới các API dữ liệu doanh nghiệp tương ứng (`services/taxLookupService.ts`). Việc dùng các dịch vụ này theo điều khoản của nhà cung cấp; không gửi dữ liệu thật của doanh nghiệp lên bản demo.
