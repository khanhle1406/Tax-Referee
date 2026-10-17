# Báo cáo sửa lỗi và kiểm tra lại — 10/10/2026

18 lỗi QA đã có sửa và bằng chứng kiểm tra lại; thêm một lỗi lệch cột sao kê mẫu được phát hiện và sửa trong vòng này. Các bộ kiểm tra local đã chạy đều PASS. Đây là nghiệm thu vòng sửa lỗi đã xác nhận, chưa đủ để tuyên bố toàn bộ ma trận kiểm thử hoặc triển khai công khai đã đạt.

Giữ nguyên báo cáo QA ban đầu để truy vết. Không dùng database/chứng từ workspace, không sửa policy nghiệp vụ đang sử dụng. Test trực tiếp handler dùng SQLite memory và thư mục tạm; test HTTP/UI chạy production standalone cổng3001, database mới riêng từng phiên. Thay đổi source/dependency có sẵn trước vòng này được giữ nguyên.

## Đối chiếu lỗi

| ID | Sửa | Bằng chứng kiểm tra lại |
|---|---|---|
| QA-01 | Xác thực API ngân hàng/TCT/nhà cung cấp; kế toán viên không ghi supplier | 31 regression: 401/403; production HTTP |
| QA-02 | GET sao kê dùng database đúng phiên | Regression cách ly; production demo khác có 0 giao dịch |
| QA-03 | Bằng chứng ngân hàng qua workflow: boolean, revision, audit; giữ thuế0 và bỏ voucher tới đánh giá lại | Regression + production revision2/ON_HOLD/tax0/no voucher; gửi lặp giữ revision |
| QA-04 | Transaction bao trùm import và đối soát | Regression gây lỗi schema sau nhập; bank/TCT không tăng số dòng |
| QA-05 | CLOSED thiếu ngày đóng tạo phát hiện dữ liệu chưa rõ | Regression + production chuyển tiếp, thuế0 |
| QA-06 | UI TCT đọc report GET/POST | API regression + FIX-TCT.png: 3 kết quả |
| QA-07 | Nguồn OCR thiếu/mờ và money0 bị gắn nghi vấn; bỏ confidence.98 từ phép cộng | Mock zero-balanced + ảnh mờ OCR thật cần review, không sinh tiền |
| QA-08 | Đổi model mặc định; ánh xạ model đã ngừng sang qwen/qwen3.7-flash; tăng giới hạn token OCR | Regression config; 2 OpenRouter request thật HTTP200 |
| QA-09 | Chữ ký hiển thị chưa xác minh; ký hiệu lấy từ nguồn | FIX-XML-PREVIEW.png: 1C26TQA / Signature Unverified |
| QA-10 | Parser phân biệt MST bên mua/bên bán, nhãn song ngữ | Regression raw-text fixture seller0100000001/buyer0100109106 |
| QA-11 | TCT bắt buộc identity/date/amount/rate; không tự tạo số hóa đơn hoặc ngày | Regression [{}]/thiếu/hỏng400, VAT0 và alias UI đúng; production400 |
| QA-12 | Kiểm tra XML cấu trúc trước lưu artifact; chặn DTD/entity | Regression invalid/empty/DTD400 và artifact count giữ nguyên; production400 |
| QA-13 | UI sao kê đọc summary, importedCount và gửi content đúng contract | FIX-BANK-SAMPLE.png: tổng3, chưa khớp3 |
| QA-14 | Validate ERP target/regime/voucher IDs | Regression + production adapter sai400 |
| QA-15 | Lỗi AUTH_REQUIRED ledger chuyển401 | Regression + production401 |
| QA-16 | Lỗi JSON/Zod input API mở rộng trả400 | Regression4 endpoint; production TCT400 |
| QA-17 | Mobile có Mở rộng & SOP | FIX-MOBILE-NAV.png viewport375; SOP mở được |
| QA-18 | Dialog lưu/khôi phục focus; opener SOP/supplier chủ động focus | FIX-SOP-FOCUS và FIX-SUPPLIER-FOCUS: Escape về BUTTON mở |
| FIX-19 | Sao kê mẫu dùng reference/date/debit/account/description/taxCode đúng cột, không đọc số TK thành số tiền | Regression kiểm đúng 11M/5.5M/3.3M + UI phiên sạch3 dòng |

## Kiểm tra tự động và production

- `npm run typecheck`: PASS.
- `NEXT_BUILD_DIR=.next-production TAX_REFEREE_DB_PATH=:memory: npm run build`: PASS.
- `npm run test:acceptance`: PASS — Verify4/5/15, 20 kiểm tra an toàn, 2 fallback, 4 review regression, 31 QA regression mới. Các tập có ca trùng nhau, không cộng thành số mẫu đánh giá độc lập.
- `TEST_BASE_URL=http://127.0.0.1:3001 npm run test:api`: PASS — cách ly phiên, routine/voucher, pause, stale409, undo, text source, Verify và input nghi vấn.
- `NEXT_BUILD_DIR=.next-production TAX_REFEREE_DB_PATH=:memory: npm run test:recovery`: PASS — restart giữ session/revision/voucher/audit/artifact, snapshot/restore vào môi trường riêng.
- Kiểm tra HTTP thực tế bổ sung: chặn anonymous, tác động khớp ngân hàng, gửi lặp, cách ly phiên, CLOSED, XML lỗi, TCT lỗi, ERP sai; API và database phù hợp.
- UI IAB: TCT3 kết quả, sao kê3 dòng đúng tiền/MST, XML ký hiệu đúng và chữ ký chưa xác minh, mobile375 có menu và SOP, Escape trả focus ở SOP và snapshot NCC. Verify5/5 đúng3 routine/2 chuyển tiếp; thời gian backend15ms, thao tác UI khoảng0.53s, dưới90s. Viewport là mô phỏng, không phải thiết bị di động thật. Vòng này không chạy lại toàn bộ ma trận Chrome/Safari, mọi modal, hoặc diễn tập8 phút.
- Race mới: Q-Gen chờ trong lúc ngân hàng thêm bằng chứng. Revision thay đổi, kết quả đến muộn không được ghi và không tự duyệt. Approval guard yêu cầu đánh giá lại.

## OCR thật và giới hạn request

Chỉ gửi ảnh giả lập `clear.png` và `blurred.jpg` từ fixture QA. 2 request OpenRouter HTTP200. Ảnh rõ khớp cả10 trường trong truth.json; ảnh mờ trả isImageBlurry=true, needsReview=true, không đọc ra số tiền. Trạng thái người bán không được suy thành ACTIVE, hình thức thanh toán/bằng chứng còn thiếu vẫn phải qua policy. Confidence còn là mức quy ước của app, không phải xác suất đã hiệu chuẩn.

Tổng cộng xuyên suốt QA và sửa lỗi:18/20 request, gồm16 lượt trước và2 lượt vòng này; mock không gọi nhà cung cấp. Proxy quay về offline sau hai lượt. Log provider chỉ lưu số lượt/status/thời gian. Không lưu token, mật khẩu hoặc API key trong bằng chứng.

## Phần chưa thể nghiệm thu toàn bộ

Docker/Linux, liveHTTPS và nguồn pháp lý thật vẫn BLOCKED do môi trường chưa có. Những ca NOT_RUN/BLOCKED trong báo cáo gốc không tự chuyển PASS sau khi sửa lỗi. Chưa có bằng chứng người dùng thật, tập độc lập được nghiệp vụ gán nhãn hoặc độ chính xác OCR trên tập đại diện. Chưa sửa dữ liệu lịch sử trong database thật đã bị phiên bản cũ ghi boolean dạng số; vòng này sửa đường ghi mới và kiểm tra rollback khi gặp dữ liệu hỏng.

Không còn lỗi P0/P1 đã xác nhận mở trong phạm vi19 lỗi được kiểm tra lại ở đây. Cần hoàn thành các ca local bắt buộc còn NOT_RUN và kiểm tra triển khai trước khi chốt “local đạt toàn bộ”/“live đạt”.

Log, phản hồi HTTP, before/after table counts/hashes và ảnh nằm trong thư mục `fix-evidence/` (bằng chứng thô không commit, xem `.gitignore`). Test chạy lại tại `scripts/qa/test-qa-regressions.ts`, tích hợp trong `test:acceptance`.
