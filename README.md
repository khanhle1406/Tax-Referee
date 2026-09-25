# TAX REFEREE · TÁC TỬ ĐIỀU PHỐI CHUYỂN TIẾP TRONG QUẢN TRỊ THUẾ DOANH NGHIỆP

> **Dự án dự thi Cuộc thi MLAI Hackathon 2026**  
> **Bảng 1: OrganizationAI · Đề bài A: The Escalation Referee (Bộ điều phối chuyển tiếp con người)**  
> **Repository:** [https://github.com/khanhle1406/Tax-Referee.git](https://github.com/khanhle1406/Tax-Referee.git)  
> **Phiên bản:** v2.5 Production Ready (100% Hóa đơn Thực tế từ Internet · Google Gemini AI Trực tiếp)  
> **Trải nghiệm trực tiếp:** [http://localhost:3000](http://localhost:3000)

---

## 1. TỔNG QUAN HỆ THỐNG

### 1.1 Bối Cảnh & Thách Thức Thực Tế Tại Doanh Nghiệp Việt Nam
Trước làn sóng siết chặt quản lý thuế bằng hóa đơn điện tử tập trung và dữ liệu lớn của cơ quan thuế, mọi doanh nghiệp tại Việt Nam đang đối mặt với các rủi ro pháp lý lớn:
1. **Bẫy Hệ số rủi ro K (Công văn 2392/TCT-QLRR):** Cơ quan thuế tự động giám sát tỷ lệ xuất nhập hàng kỳ này: `K = Tổng doanh thu bán ra / (Tồn kho đầu kỳ + Tổng mua vào)`. Nếu Hệ số K rơi vào Vùng Đỏ (K < 0.95 hoặc K > 1.35), doanh nghiệp bị đưa vào danh sách kiểm tra đột xuất.
2. **Bẫy Thuế suất 8% vs 10% (Nghị quyết 204/2025/QH15 & Nghị định 174/2025/NĐ-CP):** Hàng hóa dịch vụ viễn thông, công nghệ thông tin, tài chính, bất động sản bắt buộc áp 10%. Nếu nhà cung cấp xuất nhầm 8%, doanh nghiệp bị loại trừ chi phí khấu trừ và phạt khai sai.
3. **Bẫy Thanh toán tiền mặt từ 5 triệu VNĐ (Khoản 2 Điều 14 Luật Thuế GTGT 48/2024/QH15 & NĐ 320/2025/NĐ-CP):** Mua hàng hóa, dịch vụ từ 5.000.000 VNĐ trở lên bắt buộc có chứng từ thanh toán không dùng tiền mặt (Ủy nhiệm chi ngân hàng). Thiếu UNC = mất quyền khấu trừ thuế GTGT đầu vào.
4. **Bẫy Nhà cung cấp đóng mã số thuế (Nghị định 123/2020/NĐ-CP & Điều 2.2 Quy chế Tax-SOP-2026):** Cần phân biệt rõ: hóa đơn xuất *trước* ngày bên bán đóng MST có thể giải trình nếu đủ bộ hồ sơ mua bán thực tế; nhưng hóa đơn xuất *sau* ngày đóng MST là bất hợp pháp 100%, tuyệt đối cấm hạch toán.
5. **Hóa đơn điều chỉnh/thay thế (Nghị định 254/2026/NĐ-CP):** Bắt buộc phải có mã hóa đơn gốc tham chiếu để bảo đảm tính liên tục và truy vết nguồn gốc.

### 1.2 Giải Pháp Trọng Tài Thuế (Tax Referee)
**Tax Referee** đóng vai trò là một "Trọng tài Thuế thông minh" đứng giữa luồng tiếp nhận hóa đơn và sổ cái kế toán doanh nghiệp:
- **Đề xuất thường quy (Routine Proposed):** Hóa đơn đáp ứng đầy đủ điều kiện 3H (Hợp pháp - Hợp lệ - Hợp lý) được chuyển vào luồng thường quy, hỗ trợ Kế toán viên bấm xác nhận đơn lẻ hoặc xác nhận hàng loạt (Bulk Confirm) trong 1 giây.
- **Chốt chặn Zero-Hallucination:** Ngay khi dữ liệu có dấu hiệu rủi ro, hệ thống cưỡng chế dừng tự động hóa thông qua Zod Discriminated Unions. Tuyệt đối không tự động cấp số thuế khấu trừ khi hóa đơn có nghi vấn.
- **Phân loại chính xác 3 Nhóm Rủi ro theo Đề bài A:**
  - `UNCERTAIN_INFO`: Thông tin chưa đủ độ chắc chắn thực tế (ảnh mờ, thiếu HĐ gốc NĐ 254, nhà cung cấp đóng MST trước ngày xuất).
  - `OUT_OF_POLICY`: Nằm ngoài phạm vi quy định (áp sai thuế suất 8%, thanh toán tiền mặt từ 5 triệu VNĐ, chi phí nhạy cảm rượu bia không phục vụ SXKD).
  - `EXCEED_AUTHORITY`: Vượt thẩm quyền phê duyệt (hóa đơn giảm giá hoặc bồi thường từ 200 triệu VNĐ, mua sắm lớn đẩy Hệ số K vào Vùng Đỏ).
- **Hỗ trợ quyết định trong 3 giây (Actionable Human-in-the-Loop):** Tích hợp Google Gemini AI sinh câu hỏi đóng ngữ cảnh hóa kèm đúng 2 phương án đối ứng (**Phương án A** vs **Phương án B**), chuyển tiếp đúng Kế toán trưởng (KTT) hoặc Giám đốc Tài chính (CFO) ra quyết định tức thì.

---

## 2. KIẾN TRÚC KỸ THUẬT & DỮ LIỆU THỰC TẾ

```text
[TIẾP NHẬN CHỨNG TỪ THỰC TẾ]
(XML Nhà cung cấp · PDF Hóa đơn · Ảnh MC-OCR)
                 │
                 ▼
┌────────────────────────────────────────────────────────┐
│               TẦNG TRÍ TUỆ KÉP (DUAL-ENGINE)            │
│  - Engine 1: Policy Engine Deterministic (Ground Truth) │
│    + Luật 48/2024, NĐ 254/2026, NQ 204/2025            │
│    + Giám sát Hệ số K (CV 2392) & Trùng lặp HĐ         │
│  - Engine 2: Google Gemini AI Cascade (Q-Gen)          │
│    + Gemini 3.5 Flash-lite / 2.5 Flash / 2.5 Lite      │
│    + Tự động xử lý giới hạn hạn ngạch (429 Fallback)   │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│            HỘP THƯ ĐIỀU PHỐI (INBOX WORKSPACE)         │
│  - KTV: Duyệt hàng loạt ca Thường quy (Bulk Confirm)  │
│  - KTT: Phê duyệt ngoại lệ rủi ro < 200M (Thẻ A/B)     │
│  - CFO: Phê duyệt ca vượt hạn mức ≥ 200M & Vùng Đỏ     │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│            LƯU VẾT & BẢO VỆ PHÁP LÝ (AUDIT)            │
│  - Chuỗi băm SHA-256 (Hash Chain) trong SQLite         │
│  - Bộ nhớ Tiền lệ CFO (Precedent Memory)               │
│  - Bản thể hiện HĐĐT song song (Side-by-Side Viewer)   │
│  - Xuất Hồ sơ Phòng vệ Thuế 1-Click (Dossier Snapshot) │
└────────────────────────────────────────────────────────┘
```

### 2.1 Bộ Dữ Liệu 11 Hóa Đơn Thực Tế 100% Từ Internet (`input-sample/`)
Hệ thống sử dụng bộ dữ liệu chứng từ thực tế tải trực tiếp từ các kho mã nguồn mở và cuộc thi thị giác máy tính quốc gia MC-OCR 2021:
1. `01_real_viettel_sinvoice.xml`: Viettel Telecom - Hóa đơn điện tử XML Viettel S-Invoice (4.510.000 VNĐ).
2. `02_real_misa_meinvoice.xml`: MISA Office Supplies - Hóa đơn điện tử XML meInvoice (11.935.000 VNĐ, có UNC).
3. `03_real_vnpt_einvoice.xml`: VNPT Software Company - Hóa đơn điện tử XML S-Invoice (52.250.000 VNĐ).
4. `04_real_fpt_einvoice.xml`: FPT Information System - Hóa đơn dịch vụ phần mềm XML (297.000.000 VNĐ > 200M hạn mức KTT).
5. `05_real_tct_invoice.xml`: ABC Technology Company - Hóa đơn XML theo định dạng chuẩn Tổng Cục Thuế (Nghị định 123).
6. `06_real_einvoice_vinhlong.pdf`: Hộ kinh doanh Vĩnh Long 999 - File PDF bản thể hiện có mã xác thực CQT và chữ ký số.
7. `07_real_bill_circle_k.jpg`: Circle K / VinCommerce - Ảnh chụp bill bán lẻ thực tế (Bộ dữ liệu MC-OCR).
8. `08_real_bill_coopfood.jpg`: Co.op Food HN THE K-PARK - Ảnh chụp phiếu thanh toán siêu thị (MC-OCR).
9. `09_real_bill_retail_store.jpg`: Chuỗi cửa hàng bán lẻ - Ảnh chụp phiếu mua hàng tiêu dùng (MC-OCR).
10. `10_real_bill_restaurant.jpg`: Nhà hàng ẩm thực - Ảnh chụp hóa đơn ăn uống có rượu bia nhạy cảm.
11. `11_real_invoice_photo.jpg`: Cửa hàng Game & Hobby - Ảnh chụp hóa đơn thực địa ngoài đời.

---

## 3. CÁC TÍNH NĂNG MỞ RỘNG ĐÃ TRIỂN KHAI

| Mã Tính Năng | Tên Tính Năng | Mô Tả Kỹ Thuật |
| :--- | :--- | :--- |
| **IMP-08** | **Line-Item Validation** | Rà soát từng dòng hàng chi tiết, bóc tách đơn giá x số lượng, phát hiện sai thuế suất ưu đãi 8% đối với danh mục loại trừ (NQ 204/2025/QH15) và cảnh báo chi phí nhạy cảm rượu bia. |
| **IMP-09** | **Bulk Confirmation** | Nút bấm 1-click cho phép Kế toán viên xác nhận đồng loạt tất cả các hóa đơn thường quy sạch (`ROUTINE_PROPOSED`), giảm 95% thao tác thủ công. |
| **IMP-10** | **Duplicate Detector** | Phát hiện trùng lặp 100% số hóa đơn và số tiền hoặc trùng số hóa đơn cùng nhà cung cấp đã tiếp nhận trong hệ thống; tự động gắn cờ `OUT_OF_POLICY`. |
| **IMP-11** | **Side-by-Side Viewer** | Trình xem bản thể hiện hóa đơn điện tử song song chuẩn Nghị định 123/2020/NĐ-CP; hỗ trợ thu phóng, xem toàn màn hình, in trực tiếp và tải XML gốc. |
| **IMP-12** | **Precedent Memory** | Bộ nhớ tiền lệ doanh nghiệp: Khi CFO/KTT phê duyệt ngoại lệ có thể lưu thành tiền lệ đặc cách. Các hóa đơn tương tự sau đó được tự động thông qua kèm trích dẫn căn cứ phê duyệt trước đó. |
| **IMP-03** | **SHA-256 Audit Chain** | Chuỗi băm mật mã học liên kết sự kiện kiểm toán (`previous_hash` -> `event_hash`), bảo đảm nhật ký phê duyệt không thể bị can thiệp hay sửa đổi. |

---

## 4. HƯỚNG DẪN CÀI ĐẶT & KHỞI CHẠY (LOCAL)

### 4.1 Yêu Cầu Môi Trường
- **Node.js:** Phiên bản `>= 20.0.0` (Khuyến nghị Node.js 22 hoặc 24).
- **Trình quản lý gói:** `npm`.

### 4.2 Cấu Hình Biến Môi Trường
Sao chép tệp cấu hình mẫu và điền API key:
```bash
cp .env.example .env.local
```

Nội dung `.env.local` cơ bản:
```env
# Google Gemini API Key (Bắt buộc cho OCR và Q-Gen)
# Lấy miễn phí tại: https://aistudio.google.com
GEMINI_API_KEY=your_gemini_api_key_here

# Cổng khởi chạy (Mặc định 3000)
PORT=3000
```

### 4.3 Biên Dịch & Khởi Chạy Production
```bash
# 1. Cài đặt thư viện phụ thuộc
npm install

# 2. Biên dịch gói ứng dụng production
npm run build

# 3. Khởi chạy máy chủ production trên cổng 3000
npm run start -- -p 3000
```
Truy cập ứng dụng tại: **[http://localhost:3000](http://localhost:3000)**.

---

## 5. TÀI KHOẢN ĐĂNG NHẬP KIỂM THỬ

Hệ thống phân quyền 3 tầng kiểm soát (RBAC). Bạn có thể đăng nhập với các tài khoản mặc định:

| Vai Trò | Email Đăng Nhập | Mật Khẩu | Quyền Hạn Nghiệp Vụ |
| :--- | :--- | :--- | :--- |
| **Kế toán viên (KTV)** | `ke-toan@local` | `accountant-local` | Tải chứng từ, nhập form, bấm duyệt xác nhận hàng loạt hóa đơn thường quy (`ROUTINE`). |
| **Kế toán trưởng (KTT)** | `ktt@local` | `ktt-local` | Thẩm định các ca ngoại lệ rủi ro Nhóm 1 và Nhóm 2 (hạn mức chi phí < 200 triệu VNĐ). |
| **Giám đốc Tài chính (CFO)** | `cfo@local` | `cfo-local` | Thẩm định các ca vượt thẩm quyền (≥ 200 triệu VNĐ), quyết định khi Hệ số K rơi vào Vùng Đỏ, ban hành và thu hồi Tiền lệ đặc cách. |

---

## 6. KỊCH BẢN KIỂM THỬ TỰ ĐỘNG (CLI TEST RUNNERS)

Hệ thống cung cấp các bộ script kiểm thử tự động toàn diện:

```bash
# 1. Kiểm thử 17 hóa đơn thực tế qua Policy Engine Ground Truth
npm run test:real

# 2. Kiểm thử hồi quy 5 tệp XML theo manifest chuẩn hóa
npm run test:manifest

# 3. Kiểm thử kết nối Dual-Engine AI (Local Policy + Google Gemini Q-Gen)
npm run test:dual-engine

# 4. Kiểm thử toàn diện 17/17 ca kết hợp kiểm tra độ bền AI khi gặp 429
npm run test:comprehensive

# 5. Khôi phục dữ liệu demo SQLite sạch về trạng thái ban đầu
npm run demo:reset

# 6. Đồng bộ cập nhật quy định pháp luật mới
npm run legal:sync
```

---

## 7. CẤU TRÚC THƯ MỤC DỰ ÁN

```text
Tax-Referee/
├── app/
│   ├── api/
│   │   ├── audit/                   # API tra cứu nhật ký chuỗi băm kiểm toán SHA-256
│   │   ├── auth/                    # API xác thực phiên đăng nhập 3 vai trò (RBAC)
│   │   ├── documents/               # API bóc tách đa định dạng (XML local, PDF/Ảnh Gemini)
│   │   ├── dossiers/                # API xuất Hồ sơ Phòng vệ Thuế 1-Click (HTML/JSON)
│   │   ├── evaluate/                # API thẩm định kép (Policy Engine + Gemini Q-Gen)
│   │   ├── inbox/                   # API quản lý hộp thư và duyệt hàng loạt (Bulk Confirm)
│   │   ├── invoices/duplicates      # API rà soát và nhóm hóa đơn trùng lặp
│   │   ├── legal-updates/           # API tiếp nhận và tích hợp quy định thuế mới
│   │   ├── policy/                  # API cấu hình quy chế động và xuất bản SOP
│   │   ├── precedents/              # API đăng ký và thu hồi tiền lệ đặc cách của CFO
│   │   ├── resolutions/             # API ghi nhận quyết định phê duyệt A/B
│   │   ├── tax-forms/               # API tổng hợp tờ khai thuế 01/GTGT nội bộ
│   │   └── verify/                  # Endpoint kiểm tra tự động nhanh (Verify 90s)
│   ├── verify/                      # Trang giao diện kiểm thử Verify Harness
│   ├── globals.css                  # Toàn bộ CSS giao diện B2B Dark Mode
│   ├── layout.tsx                   # Khung ứng dụng chuẩn Next.js App Router
│   └── page.tsx                     # Màn hình làm việc Production Workspace chính
├── components/
│   ├── AuditTrailTable.tsx          # Bảng nhật ký kiểm toán SHA-256 và nút xuất Dossier
│   ├── DocumentViewer.tsx           # Trình xem bản thể hiện HĐĐT song song (IMP-11)
│   ├── EscalationCard.tsx           # Thẻ chuyển tiếp ngoại lệ A/B cho KTT/CFO
│   ├── InboxFilterToolbar.tsx       # Thanh công cụ lọc hộp thư chứng từ
│   ├── InteractiveInputForm.tsx     # Form thẩm định thủ công và tải tệp chứng từ
│   ├── PolicyViewerModal.tsx        # Modal xem văn bản quy chế và Sổ Tiền lệ
│   ├── ProductionWorkspace.tsx      # Giao diện không gian làm việc chính của kế toán
│   ├── TaxDefenseModal.tsx          # Modal hiển thị Hồ sơ Phòng vệ Thuế 1-Click
│   └── VerifyHarness.tsx            # Bảng điều khiển Verify Harness 90s
├── data/
│   ├── runtime/                     # CSDL SQLite tax-referee.sqlite và kho artifacts
│   ├── verification/                # Manifest kiểm thử hồi quy 5 fixtures XML
│   ├── regulatoryRegistry.ts        # Cơ sở dữ liệu văn bản quy phạm pháp luật
│   └── sopText.ts                   # Toàn văn Quy chế Quản trị Thuế Tax-SOP-2026
├── input-sample/                    # 11 Hóa đơn thực tế từ Internet (XML, PDF, JPG)
├── lib/
│   ├── server/                      # Tầng truy xuất CSDL SQLite, Auth và Token
│   ├── constants.ts                 # Cấu hình ngưỡng pháp lý, hạn mức và API
│   ├── schemas.ts                   # Zod Schemas và Discriminated Unions
│   └── utils.ts                     # Hàm tiện ích định dạng tiền tệ và thời gian
├── scripts/
│   ├── ingest-real-samples.ts       # Script nạp 11 hóa đơn thực tế vào CSDL
│   ├── reset-demo-data.ts           # Script dọn dẹp và reset dữ liệu demo
│   ├── sync-legal-updates.ts        # Script cập nhật văn bản luật mới
│   ├── test-all-cases.ts            # Runner kiểm thử 17 ca thực tế
│   ├── test-comprehensive-suites.ts # Runner kiểm thử toàn diện 17/17 ca
│   ├── test-dual-engine.ts          # Runner kiểm thử AI Dual-Engine
│   └── test-regression-manifest.ts  # Runner kiểm thử manifest fixtures
├── services/
│   ├── duplicateDetector.ts         # Module phát hiện hóa đơn trùng lặp (IMP-10)
│   ├── geminiService.ts             # Module kết nối Google Gemini OCR & Q-Gen Cascade
│   ├── jevService.ts                # Bộ điều phối thẩm định kép (Dual-Engine Orchestrator)
│   ├── legalUpdateService.ts        # Dịch vụ phân tích và tích hợp thông tư mới
│   ├── policyEngine.ts              # Trọng tài tiền kiểm quy chế nội bộ (Ground Truth)
│   └── precedentService.ts          # Dịch vụ quản lý tiền lệ CFO (IMP-12)
├── brainstorming/
│   └── evaluation.md                # Báo cáo đánh giá khách quan Mục tiêu vs Thực tế
├── .env.example                     # Tệp mẫu cấu hình môi trường
├── .gitignore                       # Cấu hình bảo mật bỏ qua tệp nhạy cảm
├── LICENSE                          # Giấy phép mã nguồn mở MIT
├── README.md                        # Tài liệu tổng quan dự án
└── RUNBOOK.md                       # Hướng dẫn vận hành nhanh cho Ban Giám khảo
```

---

## 8. GIẤY PHÉP (LICENSE)

Dự án được phát hành theo giấy phép mã nguồn mở [MIT License](./LICENSE).  
Bản quyền thuộc về **Tax Referee Contributors (2026)**.
