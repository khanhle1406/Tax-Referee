# Lỗi đã xác nhận

> 📌 **Ảnh chụp lịch sử** — lỗi ghi nhận khi kiểm thử 10/10/2026; cả 18 lỗi đã có bản sửa và kiểm tra lại trong [FIX-REPORT.md](FIX-REPORT.md). Số dòng ở mục "Vị trí" là của mã lúc kiểm thử (trước commit `bc27067`), liên kết mở file hiện hành. Thư mục `evidence/` là bằng chứng thô không commit (xem `.gitignore`). Số liệu hiện hành: [README](../../README.md), trang `/verify`, `/sop` và `docs/evidence/`.

Chỉ ghi nhận, chưa sửa mã nguồn hoặc cấu hình workspace. Mức ưu tiên theo kế hoạch người dùng.

## QA-01 — P0 — API mở rộng cho phép đọc/ghi nội bộ khi chưa đăng nhập

Vị trí: [app/api/banking/sync/route.ts:123](../../app/api/banking/sync/route.ts).

Không gửi cookie. POST sao kê hợp lệ ghi bank_transactions và sửa hóa đơn; POST suppliers ghi supplier_master. POST TCT ghi tct_invoices rồi trả500 khi gặp invoice đã lỗi. GET cả ba trả200. Cần xác thực/phân quyền ở backend trước mọi đọc/ghi.

Bằng chứng/ID: `BANK-UNAUTH-VALID, ANON-WRITE-suppliers, TCT-UNAUTH-VALID, ANON-14/15/16`. Tra ID trong [results.csv](results.csv) và thư mục `evidence/` (bằng chứng thô không commit, xem `.gitignore`).

## QA-02 — P0 — GET sao kê bỏ qua sandbox demo

Vị trí: [app/api/banking/sync/route.ts:103](../../app/api/banking/sync/route.ts).

Đăng nhập demo B trống, gọi GET banking/sync vẫn thấy QA-BANK-1 từ DB nội bộ. UI demo cũng hiển thị dữ liệu này. GET cần vớiRequestDatabase và kiểm tra phiên như đường POST. TCT GET đã cách ly đúng trong lượt kiểm tra riêng.

Bằng chứng/ID: `BANK-CROSS-LEAK, UI-BANK-LEAK`. Tra ID trong [results.csv](results.csv) và thư mục `evidence/` (bằng chứng thô không commit, xem `.gitignore`).

## QA-03 — P1 — Khớp ngân hàng ghi sai boolean và bỏ qua revision/audit

Vị trí: [services/bankMatcherService.ts:177](../../services/bankMatcherService.ts).

Fresh demo có hóa đơn hasBankSlip=false. Import giao dịch khớp: payload_json.hasBankSlip trở thành số1, revision vẫn1. Import lần sau và TCT validate InvoiceInputSchema trả500. Cập nhật bằng chứng cần workflow revision/audit và JSON boolean đúng.

Bằng chứng/ID: `BANK-NUMERIC-BOOLEAN, BANK-FRESH-REPEAT`. Tra ID trong [results.csv](results.csv) và thư mục `evidence/` (bằng chứng thô không commit, xem `.gitignore`).

## QA-04 — P1 — Import lỗi vẫn để lại dữ liệu đã ghi

Vị trí: [app/api/banking/sync/route.ts:138](../../app/api/banking/sync/route.ts).

Sau lỗi boolean, import giao dịch mới trả500 nhưng bank_transactions tăng; TCT tương tự đã lưu trước khi reconcile lỗi. Transaction cần bao trùm nhập và hiệu ứng/đối soát, hoặc xác nhận rõ kết quả commit thay vì thông báo toàn bộ thất bại.

Bằng chứng/ID: `BANK-SLIP-MATCH, TCT-UNAUTH-VALID, TCT-REPEAT`. Tra ID trong [results.csv](results.csv) và thư mục `evidence/` (bằng chứng thô không commit, xem `.gitignore`).

## QA-05 — P1 — Người bán CLOSED thiếu ngày đóng vẫn tự duyệt

Vị trí: [services/policyEngine.ts:480](../../services/policyEngine.ts).

Hóa đơn đầy đủ nhưng sellerStatus=CLOSED và không có sellerSuspensionDate trả ROUTINE/APPROVED, approvedTax=100000 và voucher. Khi không chứng minh được thời điểm đóng, phải chuyển tiếp xác minh thay vì bỏ qua cả hai nhánh CLOSED.

Bằng chứng/ID: `SELLERCLOSED-BUSINESS; CLOSED-KNOWN-BUSINESS đối chứng`. Tra ID trong [results.csv](results.csv) và thư mục `evidence/` (bằng chứng thô không commit, xem `.gitignore`).

## QA-06 — P1 — UI TCT luôn báo lỗi dù API nhập thành công

Vị trí: [components/reconciliation/TctReconciliationView.tsx:47](../../components/reconciliation/TctReconciliationView.tsx).

Mở TCT rồi Nạp Bảng Kê TCT Mẫu. API trả success=true với report và lưu dữ liệu, UI yêu cầu reconciliation nên báo lỗi, bảng rỗng. Thống nhất response contract GET/POST với component.

Bằng chứng/ID: `UI-TCT-CONTRACT, TCT-INCOMPLETE-FRESH`. Tra ID trong [results.csv](results.csv) và thư mục `evidence/` (bằng chứng thô không commit, xem `.gitignore`).

## QA-07 — P1 — OCR ảnh mờ trả số0 như dữ liệu chắc chắn

Vị trí: [app/api/documents/parse/route.ts:491](../../app/api/documents/parse/route.ts).

Dùng fixture blurred.jpg với model qwen/qwen3.7-flash trong QA. API200, preTax/tax/total=0, confidence các tiền=0.98, isImageBlurry=false, needsReview=false, uncertainFields=[]. Nguồn thực tế là1M/100k/1.1M. Số học cân bằng không chứng minh độ đúng OCR; thiếu/mờ phải giữ cảnh báo nguồn.

Bằng chứng/ID: `OCR-RESERVE-SAFETY-blurred.jpg, 002-OCR-RESERVE-blurred.jpg.json`. Tra ID trong [results.csv](results.csv) và thư mục `evidence/` (bằng chứng thô không commit, xem `.gitignore`).

## QA-08 — P1 — Model Vision cấu hình hiện tại đã bị nhà cung cấp ngừng

Vị trí: [lib/constants.ts:11](../../lib/constants.ts).

QA chạy với OPENROUTER_MODEL của môi trường hiện tại qwen/qwen3-vl-32b-instruct. Cả6 request Vision trả404 thông báo deprecated Oct9. QA chuyển riêng sang model .env.example qwen/qwen3.7-flash thì2 lượt trả200. Cần cập nhật cấu hình triển khai và fallback mặc định; workspace .env không bị sửa trong QA.

Bằng chứng/ID: `provider-requests.jsonl, OCR-REAL-clear.jpg, OCR-RESERVE-clear.jpg`. Tra ID trong [results.csv](results.csv) và thư mục `evidence/` (bằng chứng thô không commit, xem `.gitignore`).

## QA-09 — P1 — Bản thể hiện tuyên bố chữ ký hợp lệ khi chưa xác minh

Vị trí: [components/InteractiveInputForm.tsx:1265](../../components/InteractiveInputForm.tsx).

Upload XML giả lập không chứa chữ ký. UI vẫn ghi Chữ ký số bên bán hợp lệ / Digital Signature Verified, trong khi artifact được lưu UNVERIFIED. Chỉ hiển thị kết quả xác minh thực tế. Ký hiệu1C26TBB cũng hardcode, khác nguồn1C26TQA.

Bằng chứng/ID: `UI-XML-SIGNATURE, fixtures/invoice.xml`. Tra ID trong [results.csv](results.csv) và thư mục `evidence/` (bằng chứng thô không commit, xem `.gitignore`).

## QA-10 — P2 — PDF có lớp chữ nhận MST người mua thành người bán

Vị trí: [lib/rawTextParser.ts:30](../../lib/rawTextParser.ts).

text.pdf chứa Seller tax code0100000001 và Buyer tax code0100109106. Heuristic bỏ seller không hợp checksum và chọn buyer; API trả supplierTaxCode0100109106 confidence0.85 không đánh dấu trường này nghi vấn, rồi enrich tên Viettel. Phải phân biệt nhãn mua/bán và cảnh báo khi suy đoán.

Bằng chứng/ID: `OCR-FIELDS-text.pdf, OCR-REAL-text.pdf`. Tra ID trong [results.csv](results.csv) và thư mục `evidence/` (bằng chứng thô không commit, xem `.gitignore`).

## QA-11 — P2 — TCT tự tạo danh tính hóa đơn khi input rỗng

Vị trí: [lib/reconciliation/tctParser.ts:65](../../lib/reconciliation/tctParser.ts).

POST content="[{}]" trên demo sạch trả200 và tạo số0000001, series1C26TBB, MST0100109106, ngày hiện tại, thuế suất10. Cần từ chối cấu trúc thiếu dữ liệu hoặc giữ unknown, không sinh đối soát trên danh tính bịa.

Bằng chứng/ID: `TCT-FABRICATED-ROW, TCT-INCOMPLETE-FRESH`. Tra ID trong [results.csv](results.csv) và thư mục `evidence/` (bằng chứng thô không commit, xem `.gitignore`).

## QA-12 — P2 — XML rỗng hoặc hỏng vẫn nhận200

Vị trí: [app/api/documents/parse/route.ts:200](../../app/api/documents/parse/route.ts).

empty.xml0byte và broken.xml có tag chưa đóng đều200, lưu artifact/extraction. Kiểm tra XML well-formed và dữ liệu rỗng trước tiếp nhận; phân biệt thiếu nghiệp vụ với sai cấu trúc.

Bằng chứng/ID: `FILE-broken.xml, FILE-empty.xml`. Tra ID trong [results.csv](results.csv) và thư mục `evidence/` (bằng chứng thô không commit, xem `.gitignore`).

## QA-13 — P2 — Thống kê sao kê luôn0

Vị trí: [components/banking/BankStatementView.tsx:43](../../components/banking/BankStatementView.tsx).

API trả summary.total/matchedCount/unmatchedCount; component đọc ở root. Có2 giao dịch trên bảng nhưng ba card đều0. Đọc đúng summary.

Bằng chứng/ID: `UI-BANK-LEAK`. Tra ID trong [results.csv](results.csv) và thư mục `evidence/` (bằng chứng thô không commit, xem `.gitignore`).

## QA-14 — P2 — Adapter ERP không hợp lệ vẫn báo thành công

Vị trí: [app/api/ledger/sync/route.ts:134](../../app/api/ledger/sync/route.ts).

POST targetSystem=INVALID trả200 success dù exportedData rỗng. Validate enum trước tạo batch/audit.

Bằng chứng/ID: `ADAPTER-INVALID`. Tra ID trong [results.csv](results.csv) và thư mục `evidence/` (bằng chứng thô không commit, xem `.gitignore`).

## QA-15 — P2 — API ledger trả500 cho phiên chưa đăng nhập

Vị trí: [app/api/ledger/sync/route.ts:76](../../app/api/ledger/sync/route.ts).

GET ledger/sync hoặc ledger/export không cookie trả500 AUTH_REQUIRED. Phân biệt lỗi xác thực401 và lỗi server; tránh UI hiểu sai lỗi tạm thời.

Bằng chứng/ID: `ANON-9, ANON-10`. Tra ID trong [results.csv](results.csv) và thư mục `evidence/` (bằng chứng thô không commit, xem `.gitignore`).

## QA-16 — P2 — JSON hỏng ở các API mở rộng trả500

Vị trí: [app/api/banking/sync/route.ts:156](../../app/api/banking/sync/route.ts).

POST body="{" với phiên hợp lệ tới banking/sync, reconciliation/tct, suppliers đều500. Bắt lỗi parse/validate trả400; các response lỗi không nên chứa chi tiết nội bộ.

Bằng chứng/ID: `IMPORT-BAD-JSON-banking/reconciliation/suppliers`. Tra ID trong [results.csv](results.csv) và thư mục `evidence/` (bằng chứng thô không commit, xem `.gitignore`).

## QA-17 — P2 — Điều hướng mobile mất SOP và Mở rộng

Vị trí: [components/ProductionWorkspace.tsx:869](../../components/ProductionWorkspace.tsx).

Viewport375px chỉ có Bàn thẩm định, Tiếp nhận, Nhật ký và Verify; không còn đường mở SOP/ngân hàng/TCT/ERP. Cần menu mobile cho các chức năng này. Chỉ kiểm thử viewport, không phải thiết bị thật.

Bằng chứng/ID: `UI-375-NAV`. Tra ID trong [results.csv](results.csv) và thư mục `evidence/` (bằng chứng thô không commit, xem `.gitignore`).

## QA-18 — P2 — Đóng modal không trả focus về nút mở

Vị trí: [components/PolicyViewerModal.tsx:256](../../components/PolicyViewerModal.tsx).

Mở Tiền Lệ & SOP bằng Enter, đóng Escape: activeElement trở về BODY. Modal snapshot nhà cung cấp cũng quan sát BODY sau Escape. Cần lưu và phục hồi focus về trigger để tiếp tục bằng bàn phím.

Bằng chứng/ID: `UI-MODAL-FOCUS`. Tra ID trong [results.csv](results.csv) và thư mục `evidence/` (bằng chứng thô không commit, xem `.gitignore`).
