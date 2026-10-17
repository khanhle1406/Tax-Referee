# Thiết kế lại Tax Referee theo Taste Skill

Đặc tả triển khai local, ngày 13/10/2026. Giữ dữ liệu, các thay đổi có sẵn, logo TR và favicon. Báo cáo kiểm tra: `docs/taste-redesign-handoff.md`; bảng kiểm component: `docs/evidence/taste-redesign/component-inventory.md`.

## 1. Định hướng

Ứng dụng kế toán đơn giản, hiện đại, ít chữ, ưu tiên quyết định và dữ kiện. Tham khảo cách phân cấp, màu và khoảng trắng của [Taste Skill](https://www.tasteskill.dev/). Áp dụng skill `design-taste-frontend` đã cài trên máy thành viên theo ngữ cảnh sản phẩm nghiệp vụ; không áp đặt bố cục landing page lên biểu mẫu và bảng dữ liệu.

`DESIGN_VARIANCE: 3`, `MOTION_INTENSITY: 3`, `VISUAL_DENSITY: 5`. Next.js, Tailwind 3, Radix, Sonner, Lucide hiện hành; không thêm thư viện animation. Chỉ chế độ sáng.

| Token | Giá trị / hành vi |
| --- | --- |
| Canvas / surface | `#F6F6F4` / `#FCFCFB` |
| Text / secondary | `#18181B` / `#52525B` |
| Accent | Lime `#D9F99D`, chữ tối, dùng tiết chế |
| Primary action | Gần đen / chữ sáng |
| Status | Xanh, vàng, đỏ kèm nhãn hoặc icon |
| Font | Inter tự phục vụ qua next/font; số dùng tabular-nums |
| Radius | Input/nút 10px; panel/dialog 16px; pill cho badge |
| Spacing | 4/8/12/16/24/32; desktop 24; mobile 16 + safe area |
| Type | Body 14–16; tiêu đề 24–28; metadata 12–13; mobile input ít nhất 16 |
| Motion | Tương tác ngắn; chỉ opacity/transform; reduced motion |

Không trang trí bằng ảnh nền, mesh, card lồng card hoặc animation kéo dài giả. MST và số hóa đơn giữ chuỗi để không mất số 0 đầu. JSON mới dùng mono; tiền và dữ liệu nghiệp vụ cùng font Inter.

## 2. Component và trạng thái

- Khung workspace chung: sidebar, breadcrumb, bộ chọn vai trò MVP, vùng demo/nội bộ, menu tài khoản và drawer Radix trên điện thoại. Menu luôn có Chờ duyệt.
- Chuẩn hóa button/input/select/checkbox/tabs/badge/table/dialog/tooltip/toaster theo token. Dialog có gutter, giới hạn chiều cao và cuộn an toàn.
- Một Toaster toàn ứng dụng: desktop dưới trái, mobile trên trái trong safe area. Lỗi thao tác ngắn; không thêm banner đẩy nội dung. Lỗi tải thay thế vùng dữ liệu và có Thử lại.
- Danh sách dùng tìm kiếm, bộ lọc, empty state và phân trang trong phạm vi tối đa 200 bản ghi đã tải. Không gọi số này là tổng hệ thống.
- Biểu mẫu đánh dấu trường nghi vấn/sai, focus trường đầu tiên và giữ giải thích truy cập được. Trạng thái nghiệp vụ tồn tại trong hồ sơ; khác với thông báo thao tác.
- Tách phần tiếp nhận, layout, nguồn ảnh, submit bar và điều phối. Giữ tên/thứ tự trường và API nghiệp vụ.
- Dùng chung viewer fit ảnh, zoom, fullscreen và overlay cho laptop/điện thoại. Dữ liệu dựng lại phải ghi “Bản trình bày dữ liệu”; artifact là nguồn thực.
- Giữ component legacy có lý do và kiểm tra nơi dùng; không xóa public interface chỉ vì chưa mount. Bảng kiểm liệt kê từng file, caller, hành động và bằng chứng.

## 3. Route và màn hình

| Route | Nội dung / hành vi |
| --- | --- |
| `/` | Logo, câu giới thiệu, chọn vai trò, vào làm việc; có phiên thì chuyển workspace |
| `/workspace` | Redirect Inbox |
| `/workspace/inbox` | Dải số liệu ngắn, tìm kiếm/bộ lọc, danh sách, Tiếp nhận |
| `/workspace/receive` | File / điện thoại / văn bản; nguồn và dữ liệu; thanh thẩm định |
| `/workspace/approvals` | Hồ sơ theo vai trò; rủi ro, tiền, người nhận, mốc theo dõi nội bộ |
| `/workspace/invoices/[id]` | Xử lý / Chứng từ / Lịch sử; mở trực tiếp qua API riêng |
| `/workspace/audit` | Sự kiện, lọc người xử lý, chi tiết hồ sơ và trước/sau |
| `/workspace/suppliers` | Tên/MST, nguồn xác minh, trạng thái; kỹ thuật mở rộng |
| `/workspace/banking` | Giao dịch/chứng từ thanh toán, khớp và thao tác hiện có |
| `/workspace/reconciliation` | Chênh lệch với bảng kê nhập; không giả định kết nối TCT trực tiếp |
| `/workspace/reports` | Số thực từ máy chủ, phạm vi danh sách, kỳ báo cáo, tờ khai nháp |
| `/workspace/notifications` | Loại, đã đọc, đường tới quy chế/hồ sơ |
| `/workspace/policy` | SOP thực thi, tham số, ghi chú, gate, tác động, tiền lệ |
| `/workspace/ledger` | Xem bút toán, chọn định dạng, xuất payload; không báo đồng bộ ERP thật |
| `/verify` | Bộ kiểm thử / Kết quả / Thử tình huống; kỹ thuật thu gọn |
| `/sop` | Quy trình, tìm và mở quy tắc; căn cứ mở rộng |
| `/capture/[id]` | Chụp / preview / gửi / chụp tiếp; quyền theo token |

### Tiếp nhận và chứng từ

Desktop rộng hai cột; màn hẹp dùng tab Chứng từ / Thông tin nhưng cả hai vẫn mount. Hành động thẩm định nằm ngoài vùng cuộn của trường dữ liệu. Nhóm bổ trợ thu gọn và tự mở theo dữ kiện mà engine yêu cầu.

Fit = `min(viewWidth/imageWidth, viewHeight/imageHeight, 1)`. Không cắt cạnh hoặc phóng lớn ảnh nhỏ. Fit lại khi nguồn/kích thước khung thay đổi; nút Vừa khung đưa về trạng thái này, phần trăm là tỷ lệ thật. Không có hướng dẫn nổi che ảnh.

### Hồ sơ và chuyển tiếp

Câu hỏi, căn cứ, dữ kiện đối chiếu và phương án ở cùng màn. Nhiều phát hiện luôn hiện đầy đủ. Dữ kiện bổ trợ mở rộng tại chỗ. Quyền thao tác dựa `allowedActions`, evaluationId, revision; lỗi xung đột tải lại dữ liệu. Lý do/bằng chứng dùng chung cho phần xử lý, không nhập hai lần.

### Điện thoại

Header gọn, preview co giãn, footer trong safe area. Chụp tiếp mở rear-camera picker trực tiếp; có gallery thay thế. Beam lime nhẹ chỉ chạy khi gửi/xử lý thực, nằm đúng ảnh và dừng khi xong/lỗi. Không giả “đã gửi” là “AI đã phân tích xong”. Màn thấp hoặc phóng chữ cho cuộn an toàn; không cắt nút hay thu font quá nhỏ.

## 4. Bảo toàn luồng

- Workspace layout giữ phiên và bản nháp trong điều hướng client. Thay vùng demo/nội bộ remount state thuộc vùng cũ; role switch giữ màn/draft nhưng tải lại quyền.
- Query có kiểm tra giá trị cho search/risk/amount/status/page/tab/pane. Back/Forward và direct reload dùng đúng URL. Quay lại danh sách giữ filter/page.
- Chỉ cảnh báo rời khi thực sự có dữ liệu chưa lưu. Không lưu ảnh hoặc token vào localStorage.
- Abort/generation guard cho upload/AI và detail load; kết quả muộn không ghi đè lượt tiếp nhận mới.
- `GET /api/invoices/[id]` đọc cùng read model/auth/database scope với Inbox, không phụ thuộc LIMIT 200.
- Không đổi thuật toán phân luồng, ngưỡng SOP, nhận diện nhà cung cấp hoặc dịch vụ ngoài trong đợt redesign.

## 5. Trình tự và kiểm tra bàn giao

1. Chụp baseline và hash UI hiện tại, lưu trước/sau, giữ mọi thay đổi chưa commit.
2. Token/font/primitives/shell, đối chiếu Inbox, Receive, Capture.
3. Route/deep detail/session/draft/capture và xử lý ngoại lệ.
4. Các công cụ, Policy, Verify, SOP; rà soát tất cả component.
5. Typecheck, lint, build, manifest/core/workflow/review/capture/workspace-ui; browser production local; ghi hạn chế còn lại.

Viewport: 1280×720, 1440×900, 768×1024, 360×640, 390×844, 430×932 và landscape. Kiểm tra trống/tải/lỗi/không có quyền/hết phiên, camera/gửi lặp, phản hồi muộn, focus dialog, nhãn trường, bàn phím, reduced motion, tương phản. Production LCP mục tiêu <2,5s, CLS <0,1 với điều kiện đo ghi rõ; thời gian AI báo riêng.

Camera thật trên iPhone/Android là mục nghiệm thu thiết bị: quyền, hủy chụp, dọc/ngang, chụp tiếp, token hết hạn, laptop nhận ảnh và đóng QR. Không lấy viewport mô phỏng thay cho kiểm tra phần cứng.

Hoàn thành khi cùng hệ thiết kế, không banner thao tác gây shift, ảnh lần đầu chứa toàn bộ, mobile đầy đủ điều hướng, không mất rủi ro/quyền, các hồi quy giữ nguyên, có coverage và báo cáo thực tế. Chỉ deploy Hostinger khi người dùng yêu cầu riêng.
