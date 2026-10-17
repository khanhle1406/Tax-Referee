# Phạm vi demo gọn theo đề A

Tài liệu xác định phạm vi giao diện và kết quả rà soát mã tĩnh ngày 17/10/2026.
Ba component legacy đã được xóa sau khi kiểm tra caller. Phần cuối ghi kết quả
kiểm chứng thực tế và các kiểm tra thiết bị chưa thực hiện.
Không thay thuật toán phân luồng, thẩm quyền, dữ kiện bắt buộc hay nguồn xác minh.

## Đường đi chính

Giữ một luồng ngắn để giám khảo theo dõi: tiếp nhận một hoặc nhiều hóa đơn →
đọc dữ liệu → thẩm định → tự xử lý thường quy hoặc chuyển đúng Kế toán trưởng/
CFO → trả lời câu hỏi với bằng chứng → lưu kết quả và nhật ký.

| Mục | Phạm vi demo |
| --- | --- |
| Tổng quan | Màn làm việc theo vai trò Kế toán trưởng hoặc CFO; số liệu và lối vào hồ sơ cần xử lý |
| Thẩm định | Danh sách hóa đơn, tìm kiếm, lọc thường quy/ba nhóm ngoại lệ, mở hồ sơ |
| Tiếp nhận | Chọn tệp, đọc lô, chụp điện thoại khi cấu hình mạng cho phép, xem nguồn và xác nhận dữ liệu |
| Chờ duyệt | Câu hỏi, số tiền, người xử lý, phương án và toàn bộ vấn đề còn mở |
| Nhật ký | Truy vết dữ kiện, đánh giá, quyết định và thay đổi trước/sau |
| Quy chế | Tham số thực thi, ghi chú riêng, gate và báo cáo tác động; không bỏ các bước kiểm soát |
| Verify, SOP, Bảo mật | Giữ đường vào rõ ràng tới `/verify`, `/sop`, `/trust` để kiểm chứng đề A và giới hạn hệ thống |

ERP, đối soát ngân hàng, đối soát TCT, thông báo và tờ khai báo cáo là phần mở
rộng, ẩn khỏi điều hướng demo. Danh mục nhà cung cấp là công cụ hỗ trợ tiếp
nhận, không chiếm vị trí mục chính trong demo. Điều hướng nội bộ và các route
mở rộng tiếp tục được giữ tương thích.
Ẩn menu không đồng nghĩa được xóa API, thu hồi quyền hoặc thay đổi hồ sơ cũ.

## Tổng quan cho Kế toán trưởng và CFO

Không tạo số liệu minh họa hoặc biểu đồ tăng trưởng khi không có dữ liệu.
Dashboard có tổng hóa đơn, số tự duyệt, số được kế toán duyệt và số cần xử lý; phân tách KTT/CFO trong phần đã duyệt và hàng đợi. Liên kết mở danh sách xử lý.

| Vai trò | Nội dung cần thấy trước | Hành động chính |
| --- | --- | --- |
| Kế toán trưởng | Số hóa đơn tự duyệt, duyệt tay; số chờ KTT/CFO và chưa hoàn tất | Mở hồ sơ để kiểm tra và trả lời; chuyển CFO khi backend yêu cầu |
| CFO | Số hóa đơn tự duyệt, duyệt tay; số chờ CFO và tình trạng xử lý | Mở hồ sơ cần quyết định; xem phương án và căn cứ tại cùng màn |

`GET /api/dashboard` chỉ cho KTT/CFO và tổng hợp toàn bộ database của phiên,
không phụ thuộc 200 hóa đơn gần nhất của Inbox. Nguồn duyệt được dựng từ audit
thực tế, có xét hoàn tác và revision; không suy từ nhánh ROUTINE. Hồ sơ thiếu
bằng chứng nguồn được ghi “Chưa rõ nguồn duyệt”. Tỷ lệ tự duyệt tính trên số
hóa đơn hiện đã duyệt, không phải tỷ lệ chính xác AI. Phê duyệt và dữ liệu của
phiên khác không được gộp vào dashboard.

Danh sách Inbox giữ giới hạn 200 hồ sơ và ghi rõ phạm vi. Không tự tính lại
quyền ở dashboard: `allowedActions` và revision từ backend tiếp tục quyết định
thao tác.

## Đơn giản hóa biểu mẫu mà vẫn giữ kiểm soát

- Giữ các trường định danh hóa đơn, bên bán, hàng hóa, tiền/thuế và thanh toán
  dễ thấy; dữ liệu từ ảnh không đọc được phải được giữ là chưa biết.
- Chứng từ ngân hàng, bảng kê, điều chỉnh, hoàn ứng và trạng thái bên bán có thể
  đặt trong phần bổ sung. Tự mở khi hồ sơ có vấn đề liên quan; không mặc định
  “đã có”, “đã xác minh” hoặc “đang hoạt động” để làm demo thuận lợi.
- Dữ liệu danh mục chuẩn bị trước phải hiện `DEMO_MATCH`, giữ nguồn và cảnh báo.
  Không trình bày thành xác minh chính thống hoặc dữ liệu AI nhìn thấy trên ảnh.
- Trạng thái xử lý, vấn đề còn mở và căn cứ là dữ liệu nghiệp vụ bền vững. Phản
  hồi thao tác và lỗi ngắn dùng toaster, không dùng banner làm nhảy bố cục.
- Giữ tài liệu nguồn, câu hỏi, bằng chứng và phương án trong màn chi tiết; không
  xóa vấn đề phụ chỉ để giảm chữ.

## Kết quả rà soát mã thừa

Đã tìm tên component trong `app`, `components`, `lib`, `services`, `tests`,
`scripts` bằng `rg`, đồng thời đối chiếu các nhắc tới trong tài liệu. Tên file
không xuất hiện trong caller tĩnh chỉ chứng minh trạng thái của checkout lúc
rà soát; vẫn cần typecheck/lint/test/build sau khi xóa.

| Mã | Bằng chứng | Đề xuất |
| --- | --- | --- |
| `components/HeaderBanner.tsx` | Trước khi xóa chỉ có interface và export trong chính file; không import/caller/test trực tiếp trong mã chạy | Đã xóa. Khung và link Quy chế hiện nằm ở `WorkspaceShell` |
| `components/MacroHealthWidget.tsx` | Trước khi xóa chỉ có interface và export trong chính file; không import/caller/test trực tiếp | Đã xóa. Giữ `MacroState` và tính toán backend còn được dùng |
| `components/EscalationCard.tsx` | Trước khi xóa chỉ có interface và export trong chính file; không import/caller/test trực tiếp | Đã xóa component cũ; giữ thẻ/câu hỏi đang dùng trong `ProductionWorkspace` |
| Robot trong `InteractiveInputForm.tsx` | Không có JSX đọc message hoặc gắn handler | Đã xóa state/handler/effect robot và highlight chỉ ghi; giữ thông báo toaster, overlay và focus trường |
| `HandoffContext`, `HandoffAnswerPanel`, `WorkflowControls`, `SourceReviewForm` | Caller thực trong chi tiết hồ sơ; `HandoffContext` còn dùng ở Verify | Giữ; đây là luồng quyết định/bổ sung bằng chứng của đề A |
| `InvoiceImageViewer`, `InvoiceDataSummary`, `PhoneInvoicePreview` | Caller thực ở tiếp nhận, `DocumentViewer`, chụp điện thoại | Giữ; không phải component trùng dư chỉ vì cùng thể hiện chứng từ |
| `BankStatementView`, `TctReconciliationView`, `NotificationCenterView`, `LedgerSyncModal`, `ReportsView` | Đang import/mount theo route trong `ProductionWorkspace`; `BankStatementView` còn được QA đọc source trực tiếp | Chỉ ẩn khỏi menu demo. Không xóa trong đợt dọn mã thừa này |
| `PagePanel`, `PolicyViewerModal` | Quy chế và ERP đang dùng `PagePanel`; Quy chế có caller thật | Giữ; không bỏ kiểm tra ban hành policy |

Đã bỏ thêm hai modal Quy chế/ERP luôn đóng, state sidebar/initials không dùng và thanh duyệt hàng loạt cũ không có nút chọn dòng kích hoạt. Giữ API duyệt hàng loạt tương thích; luồng đọc nhiều tệp mới vẫn hoạt động.

Các tài liệu cũ `brainstorming/*` và bằng chứng redesign còn nhắc ba component
legacy. Giữ chúng làm lịch sử; việc nhắc trong tài liệu không phải caller runtime.
Không sửa lại bằng chứng cũ để làm như những component đó chưa từng tồn tại.

Lệnh rà soát có thể chạy lại trước khi xóa:

```sh
rg -n 'HeaderBanner|MacroHealthWidget|EscalationCard' app components lib services tests scripts --glob '*.{ts,tsx}'
rg -n 'isRobotSpeechOpen|robotMessage|robotPos|handleRobotPointer|isDraggingRobot' components/InteractiveInputForm.tsx
rg -n 'HandoffContext|HandoffAnswerPanel|SourceReviewForm|BankStatementView' app components tests scripts --glob '*.{ts,tsx}'
```

## Kiểm tra trước bàn giao

Thay đổi điều hướng phải giữ truy cập trực tiếp, Back/Forward, vai trò demo và
cách ly dữ liệu; nút Dashboard không được mở rộng quyền tài khoản. Sau khi sửa,
chạy tuần tự typecheck, lint, toàn bộ test và build theo hướng dẫn repo. Rà soát
trình duyệt cho hai vai KTT/CFO, các trường hợp thường quy/ba nhóm ngoại lệ,
đọc lô, hồ sơ có nhiều vấn đề và phiên không đủ quyền. Tài liệu này chưa khẳng
định các bước kiểm tra đó đã đạt.

### Kết quả ngày 17/10/2026

- `npx tsc --noEmit`: đạt.
- `npm run lint`: đạt.
- `npm test`: 16/16 bộ đạt, 146 kiểm tra unit, gồm dashboard, đọc lô và danh mục demo (chạy lại trước khi push ngày 17/10/2026).
- `npm run build`: đạt.
- `npm run test:capture`: đạt kiểm thử API chụp; chưa thử lại camera trên thiết bị thật trong đợt này.
- Trình duyệt local: KTT/CFO mở được Tổng quan; Kế toán viên không thấy mục và không đọc được dashboard. Mở trực tiếp URL hoạt động.
- Dữ liệu phiên đang thử: 4 hóa đơn, 1 tự duyệt, 0 duyệt tay, 3 chưa hoàn tất. Đây là dữ liệu demo của phiên, không phải thống kê người dùng thực.
- Biểu mẫu mặc định hiện 8 trường chính, phần bổ sung đóng khi không có điều kiện yêu cầu. Chọn 2 XML cùng lúc vẫn nhận đủ 2 kết quả riêng sau khi dọn mã.
- Unit đã kiểm trên hơn 200 hồ sơ, duyệt tay của hai vai trò, hoàn tác/duyệt lại, revision mới, thiếu lịch sử nguồn và cách ly dữ liệu.
- Chưa đo lại Core Web Vitals hoặc kiểm thử thiết bị iPhone/Android thật; chưa triển khai production.
