# RUNBOOK CUỘC THI TAX REFEREE

## Yêu cầu

- Node.js >= 18.18.0, khuyến nghị Node 20 hoặc 22+.
- Chrome, Edge, Safari hoặc Firefox.
- Gemini API key nếu muốn chạy AI Q-Gen/OCR; local policy vẫn có fallback an toàn.

## Khởi động

```bash
npm install
cp .env.example .env.local
npm run dev
```

Mở `http://localhost:3000`.

## Chuẩn bị demo tái lập

Reset dữ liệu invoice/artifact/evaluation nhưng giữ audit history:

```bash
npm run demo:reset
```

Sau đó đăng nhập và vào **Tiếp nhận**. Upload file thật từ `input-sample/` hoặc nhập một invoice mới. Không có preset hóa đơn hard-code trong runtime.

## Kịch bản trình diễn

1. Upload XML/PDF/ảnh thật.
2. Kiểm tra trường đã parse và cảnh báo nguồn dữ liệu.
3. Bấm thẩm định.
4. Nếu Routine, Kế toán viên xác nhận.
5. Nếu Escalated, chuyển đúng KTT/CFO và chọn phương án A/B.
6. Mở Audit Trail và kiểm tra trạng thái audit.
7. Xuất dossier JSON hoặc bản in.
8. Mở bản nháp 01/GTGT từ **Báo cáo** hoặc 04/SS-HĐĐT từ hồ sơ đang chọn.

Dossier và form thuế hiện là bản nội bộ/bản nháp; chưa thay thế file chính thức, chưa ký số và chưa nộp cơ quan thuế.

## Regression

Build và diagnostics:

```bash
npm run build
```

Policy regression trên invoice đang lưu trong SQLite:

```bash
npm run test:real
```

Dual-engine regression:

```bash
npm run test:dual-engine
```

Regression manifest có expected status/risk/authority:

```bash
npm run test:manifest
```

Manifest nằm tại `data/verification/manifest.json`. Cần upload các file nguồn trong manifest trước khi chạy; nếu thiếu artifact, test sẽ báo lỗi thay vì tự tạo dữ liệu.

## Kiểm tra duplicate

Vào **Báo cáo** để xem nhóm số hóa đơn trùng. KTT/CFO có thể giữ bản đầu và chuyển bản sau sang `ON_HOLD`. Thao tác được ghi vào audit.

API báo cáo duplicate:

```text
GET /api/invoices/duplicates
```

## Giới hạn hiện tại

- Artifact được lưu local tại `data/runtime/artifacts`.
- Chữ ký số CA chưa được xác minh.
- Form 01/GTGT và 04/SS-HĐĐT là bản nháp theo mapping, chưa phải file HTKK/eTax chính thức.
- Khi Gemini hết quota, hệ thống hiển thị/fallback về local policy.
