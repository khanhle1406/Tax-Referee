# Báo cáo cải thiện UI và triển khai Tax Referee

> Bản redesign trong báo cáo này đã được gỡ theo yêu cầu người dùng ngày 11/10/2026. Giao diện hiện đã khôi phục về trước redesign trong release r10. Báo cáo dưới đây là lịch sử triển khai; xem [ghi chú khôi phục](khoi-phuc-giao-dien-2026-10-11.md).

Ngày: 11/10/2026. Đã thực hiện năm chặng của [kế hoạch UI](ke-hoach-cai-thien-ui-2026-10-11.md), áp dụng ui-ux-pro-max và hướng dẫn redesign của Taste. Bản live: [Tax Referee](https://limegreen-salamander-517622.hostingersite.com), release `codex-20261011-r9`.

## Kết quả giao diện

| Phần | Thay đổi đã thực hiện |
| --- | --- |
| Nền tảng | Inter tự lưu trữ, nền trắng/slate, hành động xanh đậm, trạng thái có màu riêng; thống nhất typography, spacing, radius và focus ring. Có reduced motion và skip link. |
| Đăng nhập | Chọn Kế toán viên/Kế toán trưởng/CFO theo yêu cầu MVP; menu người dùng cho đổi role và đăng xuất. Nhãn Nội bộ/Demo riêng rõ ràng. |
| Workspace | Sidebar bốn mục Hóa đơn/Tiếp nhận/Nhật ký/Chính sách, thu gọn trên desktop, menu trên mobile; công cụ phụ chuyển vào menu. |
| Danh sách | Tab trạng thái và số lượng thay các thẻ thống kê lớn; tìm kiếm luôn hiện, bộ lọc nâng cao thu gọn; trạng thái và việc cần làm đọc được. Số tiền thiếu dữ liệu hiển thị chưa xác minh. |
| Thẩm định | Panel cạnh bảng trên desktop; overlay tablet/mobile. Bốn tab Xử lý/Chứng từ/Căn cứ/Lịch sử. Giữ câu hỏi canonical và lý do chặn; chọn phương án bằng radio và một nút ghi nhận. |
| Quyết định | Giữ yêu cầu lý do, xác nhận từng finding, quyền từ server và revision/evaluation ID. Thao tác bổ sung và phản hồi tiền lệ nằm trong disclosure. Hồ sơ hoàn tất có PDF/JSON/biểu mẫu. |
| Bản nháp | Đổi tab không xóa dữ liệu đang nhập; cảnh báo khi điều hướng/đổi role/logout/refresh có thay đổi. Dialog cho hủy điều hướng hoặc bỏ bản nháp. Có beforeunload. |
| Tiếp nhận | Mặc định tải XML/PDF/ảnh; Nhập tay riêng, dán văn bản nâng cao. Nhóm thông tin hóa đơn/thuế/thanh toán; desktop đối chiếu hai cột, mobile chuyển Nguồn/Dữ liệu. Bỏ robot tự bật. |
| Nguồn | DocumentViewer tải artifact gốc qua API: ảnh/PDF nguyên bản, XML/text raw có escape. Nhập tay không dựng ảnh hóa đơn giả. Trường nghi vấn xác minh riêng; sửa giá trị hủy xác nhận cũ. |
| Nhật ký | Tìm kiếm và phân nhóm; lịch sử hồ sơ đọc được before/after và lý do, JSON/hash thu gọn. Bảng và tab lớn có vùng cuộn riêng, không làm tràn toàn trang mobile. |
| Chính sách | Nhúng vào workspace, ba tab Quy chế/Tiền lệ/Phiên bản. Kế toán viên chỉ đọc. Draft chưa publish không được hiển thị như bản đang có hiệu lực; giữ các gate phía server. |
| Verify/SOP | Ưu tiên bộ ca, nút chạy, kết quả và JSON export; chi tiết câu hỏi/options/effects mở theo ca. Metrics/hash và form custom thu gọn. Ghi rõ hồi quy tổng hợp nội bộ. SOP dùng cùng typography. |

Design system: [MASTER.md](../docs/archive/design-system-MASTER.md) (đã lưu trữ). Hướng dẫn tham khảo: [ui-ux-pro-max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill), [Taste redesign](https://github.com/Leonxlnx/taste-skill/blob/main/skills/redesign-skill/SKILL.md). Thiết kế được điều chỉnh cho công cụ nghiệp vụ; không lấy nguyên một template trang quảng bá.

## Ràng buộc nghiệp vụ được giữ

- Không đổi API/schema/rule engine để làm đơn giản UI. `allowedActions` phía server vẫn quyết định thao tác được phép.
- Sau evaluate, UI đọc workflow thực tế từ server, không dựng trạng thái phê duyệt giả.
- HTTP 409 tải lại hồ sơ mới, bỏ lựa chọn/xác nhận cũ, giữ lý do đang nhập và yêu cầu người dùng chọn lại; không tự retry quyết định.
- Hồ sơ thiếu nguồn/bằng chứng không được tự xem là hợp lệ. Canonical question và điều kiện xác nhận findings vẫn hiện đầy đủ.
- Đề xuất thường quy cũ dẫn về đánh giá lại, không gọi luồng xác nhận đã bị loại bỏ.
- Chứng từ/voucher vẫn là nội bộ. Công cụ ERP chỉ xuất payload; giao diện không tuyên bố đã hạch toán bên ngoài.

## Kiểm chứng

| Kiểm tra | Kết quả |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run build` trên mã UI cuối | PASS, gồm kiểm tra TypeScript; root `/` dynamic. Next build bỏ lint theo cấu hình hiện có, không tính là đã chạy lint. |
| `npm run test:acceptance` | PASS: manifest 4/4, 5/5, 15/15; workflow 20; AI fallback 2; review regressions 5; QA regressions 39; cải tiến Đề A 16. Không cộng ba bộ manifest thành ca độc lập. |
| API production local | PASS: demo isolation, routine voucher, pause, stale 409, undo, nguồn text, Verify 4/5/15 và input không chắc chắn. |
| Standalone recovery | PASS: restart giữ session/revision/voucher/audit/artifact; phục hồi evaluation hết hạn và retry; backup/restore offline. |
| API Hostinger | PASS cùng bộ API smoke, trong các phiên demo riêng. |
| Browser responsive | Kiểm tra 375/768/1024/1440px. Desktop có panel cạnh bảng; tablet/mobile có overlay. Nhật ký mobile live sau sửa: viewport 375, scrollWidth 375. Chính sách mobile không làm tràn toàn trang. |
| Keyboard/overlay | Escape đóng, focus quay về dòng hóa đơn; vòng focus giữ trong overlay; nền inert và khóa body scroll; tab chi tiết hỗ trợ End. |
| Form/xác nhận | Nhập tay hoàn tất và tạo voucher; sửa giá trị đã xác nhận bỏ checkbox; dữ liệu giữ khi đổi tab; hủy dialog bỏ nháp giữ dữ liệu. |
| Duyệt CFO | Chưa xác nhận finding thì nút ghi nhận bị khóa; đủ reason và finding mới gửi. Sau duyệt có voucher và audit trước/sau. |
| Stale revision trên UI production | Session khác dừng hồ sơ; quyết định cũ nhận 409, UI cập nhật Đã dừng xử lý, giữ reason, không tự gửi lại. |
| Chính sách readonly | Đổi CFO sang Kế toán viên: không còn nút sửa/tạo draft; vẫn đọc phiên bản được. |
| Verify trên browser | 5/5; mở ca xem câu hỏi/options; ở 375px không tràn toàn trang. |
| Nguồn XML | Upload fixture tổng hợp qua API; browser hiển thị chính raw XML và marker gốc, không dựng hóa đơn thay thế. |
| Root/font live | HTTP 200 tại `/` không query; `Cache-Control: no-store, max-age=0`, HCDN DYNAMIC. Font woff2 HTTP 200; browser dùng Inter. |
| `git diff --check` | PASS |

Log và ảnh: [thư mục bằng chứng](../docs/evidence/ui-2026-10-11/), [QA manifest](../docs/evidence/ui-2026-10-11/qa-summary.json), [Verify live JSON](../docs/evidence/ui-2026-10-11/verify-live.json). Một số ảnh local được chụp trong dev nên có chỉ báo Next; ảnh có `live` trong tên được chụp trên Hostinger.

## Triển khai và khôi phục

- Release cuối: `hbuilds/versions/codex-20261011-r9/nodejs`; `hbuilds/current` đổi atomically qua symlink rồi restart Passenger.
- Bundle standalone local: 1.748.239 byte; SHA-256 `fcefff9d906db9f55daf7ad6d2bf69b9102fd0e6428f406ac1502dbac558d00e`. Đã kiểm tra đủ compiled routes; không chứa secret, runtime hoặc native modules macOS.
- Linux dependencies dùng lại release r3 sau kiểm tra lockfile trùng khớp; Next 15.5.27 và better-sqlite3 12.11.1. Không build native module macOS trên host.
- Config/env, SQLite và artifacts ở ngoài release. Dữ liệu nội bộ trước/sau vẫn 0 invoices và 8 audit events; không reset dữ liệu nội bộ. Kiểm thử sinh dữ liệu trong demo riêng.
- Release r8 và r6 vẫn được giữ. Rollback mã bằng cách đổi `hbuilds/current` về `versions/codex-20261011-r8`, touch `nodejs/tmp/restart.txt`, rồi kiểm tra health/API. Không restore runtime khi chỉ rollback mã.
- Chỉ cập nhật domain Tax Referee; không sửa website khác trong tài khoản hosting. Chi tiết vận hành tại [HOSTINGER.md](../deployment/HOSTINGER.md).

## Giới hạn kiểm chứng

- Chrome extension chặn tự động chọn file vì chưa bật “Allow access to file URLs”. Không đổi quyền extension. Đã kiểm tra upload qua API và đọc artifact gốc trên browser; chưa nghiệm thu đường chọn file trên browser từ đầu tới cuối trong lần UI này. Cần một lượt kiểm tra thủ công bằng XML/PDF/ảnh trong phiên demo.
- Browser dev có cảnh báo hydration do ColorZilla thêm thuộc tính `cz-shortcut-listen` vào body. Không tắt extension người dùng hoặc che cảnh báo bằng cấu hình ứng dụng.
- Bộ kiểm thử là dữ liệu tổng hợp/nội bộ. Chưa có nhãn độc lập và feedback của ba nhân sự thật; không dùng PASS hồi quy để thay số liệu nghiên cứu người dùng hoặc accuracy OCR.
- Shared hosting chưa nghiệm thu Docker OCR worker; chưa có giao dịch thật với ERP/ngân hàng/TCT. Các giới hạn nghiệp vụ và đánh giá độc lập trong báo cáo cải tiến trước vẫn còn.
- Đăng nhập chọn role là chủ đích MVP, không phải cơ chế xác thực danh tính cho vận hành thực tế.

## Ảnh minh chứng

![Workspace live](../docs/evidence/ui-2026-10-11/workspace-live.png)

![Nhật ký mobile live](../docs/evidence/ui-2026-10-11/audit-mobile-live.png)

![Hồ sơ và lựa chọn xử lý mobile](../docs/evidence/ui-2026-10-11/review-mobile.png)
