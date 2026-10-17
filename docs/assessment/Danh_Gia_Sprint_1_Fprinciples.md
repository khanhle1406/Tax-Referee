> 📌 Bản sao đánh giá Sprint 1 của Ban giám khảo, giữ nguyên văn (ngoại lệ: commit `6b1143e` đổi đường dẫn `services/legalUpdateService.ts` → `services/legal/legalUpdateService.ts` khi sắp xếp lại thư mục). Đường dẫn `team_repos/Fprinciples/…` trong bài theo cấu trúc thư mục của BTC, tương ứng thư mục gốc repo này (ví dụ `team_repos/Fprinciples/lib/server/db.ts` → [`lib/server/db.ts`](../../lib/server/db.ts)); mã đã thay đổi nhiều sau Sprint 1.

# ĐÁNH GIÁ KỸ THUẬT SPRINT 1 — BAN GIÁM KHẢO HACKATHON

---

# Team Fprinciples (Dự án: Tax & Invoice Referee)

---

## 1. What the Team Built

Nhóm **Fprinciples** xây dựng **Tax & Invoice Referee** — hệ thống trọng tài thẩm định tính hợp lệ pháp lý, đối chiếu hóa đơn và bảo vệ rủi ro thuế (Tax Defense & Invoice Compliance) chuyên sâu theo quy chuẩn kế toán và quy định thuế tại Việt Nam:
* **Xử lý Đa định dạng Chứng từ thực tế**: Khác biệt với các nhóm chỉ xử lý ảnh chụp, Fprinciples hỗ trợ bóc tách trực tiếp file **Hóa đơn điện tử XML chuẩn Thông tư 78 / Nghị định 123** của các nhà cung cấp phổ biến nhất Việt Nam (Viettel SInvoice, MISA MeInvoice, VNPT, FPT, Tổng cục Thuế) bên cạnh hóa đơn PDF và ảnh chụp bán lẻ.
* **Động cơ Kép (Dual-Engine Architecture)**:
  * *Deterministic Policy Engine*: Kiểm tra mã số thuế, trạng thái hoạt động của doanh nghiệp, tính toán số học (tiền trước thuế + VAT = tổng tiền), thời hạn kê khai và rà soát trùng lặp SHA-256.
  * *AI Engine (Gemini)*: Hỗ trợ phân tích nội dung diễn giải mập mờ, phát hiện dấu hiệu bất thường về mặt nghiệp vụ kinh tế.
* **Giao diện Demo Tối ưu cho Pitching**: Xây dựng trên Next.js App Router với tính năng chuyển đổi vai trò tức thì (`/api/auth/switch`), bảng điều khiển hàng đợi (Inbox), bảng thẩm định chuyên sâu (Tax Defense Modal), và Verify Harness kiểm thử hàng loạt.

---

## 2. Architecture

Kiến trúc thành phần theo mô hình Next.js Full-Stack App Router:

```text
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ Next.js 14/15 App Router Frontend & Server Actions                                      │
│   ├── app/page.tsx                 (Bàn làm việc kế toán: Inbox, Duyệt ca, Đối chiếu)  │
│   ├── components/TaxDefenseModal   (Hồ sơ bảo vệ thuế và giải trình chi phí hợp lý)    │
│   ├── components/AuditTrailTable   (Nhật ký kiểm toán thời gian thực)                   │
│   └── components/VerifyHarness     (Bảng điều khiển chạy kiểm thử tự động)              │
└──────────────────────────┬──────────────────────────────────────────────────────────────┘
                           │ Route Handlers (app/api/*)
                           ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ Business Services & Dual-Engine Core                                                    │
│   ├── services/policyEngine.ts      (Bộ luật thẩm định thuế tất định)                   │
│   ├── services/geminiService.ts     (AI phân tích bất thường ngữ nghĩa)                 │
│   ├── services/duplicateDetector.ts (Phát hiện trùng lặp hóa đơn theo hash & MST)       │
│   ├── services/legal/legalUpdateService.ts(Cập nhật văn bản pháp luật & chính sách thuế mới)  │
│   └── lib/server/db.ts              (Persistence layer lưu trữ chứng từ và audit log)   │
└──────────────────────────┬──────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ Data & Input Registry                                                                   │
│   ├── input-sample/                 (Kho mẫu XML hóa đơn thật: Viettel, VNPT, MISA, FPT)│
│   └── data/regulatoryRegistry.ts    (Sổ bộ danh mục quy định thuế và trần hạn mức)      │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. What Works Well (Concrete Strengths)

1. **Hiểu Biết Sâu Sắc Nghiệp Vụ Kế Toán Thuế Việt Nam (Verified)**:
   * Thư mục `input-sample/` chứa các file hóa đơn XML thật từ Viettel S-Invoice, VNPT, MISA, FPT. Nhóm xử lý trực tiếp cây XML để lấy chữ ký số và dữ liệu gốc thay vì chỉ OCR mù mờ, giúp độ chính xác đạt 100% đối với hóa đơn điện tử.
2. **Cơ chế Chống Trùng Lặp Hóa Đơn Bài Bản (Verified)**:
   * Module [`services/duplicateDetector.ts`](team_repos/Fprinciples/services/duplicateDetector.ts) không chỉ băm SHA-256 nội dung file mà còn đối chiếu tổ hợp khóa: `Mã số thuế bán + Ký hiệu hóa đơn + Số hóa đơn`, ngăn chặn triệt để hành vi cố tình xuất lại hoặc khai khống 2 lần.
3. **Tính Năng Chuyển Đổi Vai Trò Phục Vụ Demo Tiện Lợi (Verified)**:
   * Endpoint [`app/api/auth/switch/route.ts`](team_repos/Fprinciples/app/api/auth/switch/route.ts) cho phép người trình bày demo đổi nhanh persona (Kế toán viên -> Kế toán trưởng -> Giám đốc) chỉ bằng một cú nhấp chuột trên thanh điều hướng, giúp buổi thuyết trình diễn ra liền mạch.
4. **Hồ Sơ Giải Trình Thuế (Tax Defense Dossier) Độc Đáo (Verified)**:
   * Chức năng tự động tổng hợp hồ sơ giải trình chi phí hợp lý để sẵn sàng phục vụ thanh tra thuế (`app/api/dossiers/[id]/export`), mang lại giá trị thực tế vượt trội cho doanh nghiệp.

---

## 4. Critical Problems

### Problem 1: Cơ Sở Dữ Liệu Tạm Trong Bộ Nhớ RAM (In-Memory Database Mock)
* **Evidence (VERIFIED)**: Trong [`lib/server/db.ts`](team_repos/Fprinciples/lib/server/db.ts), dữ liệu được lưu trữ trong biến JavaScript toàn cục (Global In-Memory Map).
* **Why it matters**: Khi triển khai lên các nền tảng serverless (như Vercel) hoặc khi server Next.js restart, toàn bộ hóa đơn đã tải lên và nhật ký kiểm toán sẽ bị xóa sạch.
* **Impact**: Không thể duy trì dữ liệu bền vững giữa các phiên làm việc độc lập.
* **Recommended fix**: Kết nối với cơ sở dữ liệu quan hệ thực tế (PostgreSQL qua Prisma/Drizzle ORM).
* **Priority**: **P1**

---

### Problem 2: Nguy Cơ Lỗi Phân Tích XML Khi Gặp File XML Lạ
* **Evidence (INFERRED)**: Trình bóc tách XML hóa đơn dựa vào cấu trúc thẻ cố định của 4 nhà mạng lớn.
* **Why it matters**: Một số đơn vị phát hành hóa đơn tự in hoặc giải pháp nhỏ lẻ có thể đặt tên thẻ XML khác biệt (ví dụ `<TotalAmount>` thay vì `<TongTienThanhToan>`), dễ khiến parser ném ngoại lệ chưa được xử lý.
* **Impact**: Làm đứt gãy luồng xử lý tự động khi gặp hóa đơn từ nhà cung cấp hiếm gặp.
* **Recommended fix**: Thêm tầng chuẩn hóa schema XML (XML Schema Normalizer) có cơ chế fallback xử lý lỗi mềm.
* **Priority**: **P2**

---

## 5. Crash / Failure Risks

| Failure Mode | Trigger | Impact | Severity | Fix |
| ------------ | ------- | ------ | -------- | --- |
| **Mất toàn bộ dữ liệu hồ sơ** | Tiến trình Node.js khởi động lại hoặc Vercel spin-down container. | Mất sạch các hóa đơn đã nhập và kết quả đối chiếu. | **High** | Chuyển sang lưu trữ trên PostgreSQL/MySQL bền vững. |
| **Lỗi XML Parser Crash** | File XML tải lên bị lỗi cú pháp hoặc encoding không phải UTF-8. | API parse trả về lỗi HTTP 500. | **Medium** | Bọc khối try-catch an toàn quanh bộ parser XML. |
| **Lỗi Rate Limit Gemini API** | Chạy kiểm thử hàng loạt trên trang Verify ở chế độ gọi AI. | Quá hạn mức request/phút, trả về lỗi 429. | **Medium** | Tận dụng kết quả từ Deterministic Engine trước khi gọi LLM. |

---

## 6. Pipeline Analysis

```text
CURRENT PIPELINE:
[Tải lên XML / PDF / Ảnh hóa đơn]
       │
       ▼
[Parse XML trực tiếp (lấy MST, Ký hiệu, Số, Thuế suất, Tổng tiền)]
       │
       ▼
[duplicateDetector: Kiểm tra trùng lặp SHA256 & Khóa hóa đơn]
       │
       ▼
[policyEngine: Kiểm tra hạn mức chi & quy chuẩn thuế theo luật]
       │
       ▼
[geminiService: Phân tích ngữ nghĩa diễn giải nếu có nghi vấn]
       │
       ▼
[Lưu In-Memory DB & Trả kết quả về Workspace Dashboard]
```

---

## 7. Code / Repository Issues

* Mã nguồn TypeScript viết rất đẹp, phân định rõ ràng giữa Client Components và Server Actions.
* Nhóm có các script tự động hóa hữu ích trong `scripts/` (như `ingest-real-samples.ts`, `test-dual-engine.ts`).

---

## 8. Database / API / Integration Issues

* Cần thay thế tầng `lib/server/db.ts` dạng in-memory bằng kết nối DB thật.

---

## 9. Security Issues

* Xử lý file XML cần lưu ý chống tấn công XXE (XML External Entity injection). Cần đảm bảo parser XML tắt hoàn toàn tính năng nạp DTD/entity ngoài.

---

## 10. Deployment / DevOps Issues

* Ứng dụng Next.js tiêu chuẩn, build nhanh và dễ dàng deploy lên Vercel.

---

## 11. Testing Gaps

* Nhóm có nhiều script test trong `scripts/`. Cần tích hợp thành bộ test tự động chuẩn bằng Vitest/Jest.

---

## 12. Recommended Improvements

| Priority | Thành phần | Hành động cụ thể | Lợi ích mang lại |
| -------- | ---------- | ---------------- | ---------------- |
| **P1** | **Database** | Chuyển In-Memory Map sang cơ sở dữ liệu PostgreSQL thực tế. | Đảm bảo tính bền vững và an toàn cho dữ liệu tài chính. |
| **P2** | **Security** | Cấu hình bảo vệ chống XXE Injection khi đọc file XML. | Ngăn ngừa rủi ro bảo mật nghiêm trọng từ file XML độc hại. |
| **P2** | **XML Parser** | Thêm adapter chuẩn hóa linh hoạt cho các chuẩn XML hóa đơn khác nhau. | Tăng độ tương thích với 100% các nhà phát hành hóa đơn tại VN. |

---

## 13. Sprint 2 Action Plan

### P1 — Should Fix
1. Kết nối cơ sở dữ liệu PostgreSQL (qua Supabase hoặc Neon) để lưu trữ hồ sơ bền vững.
2. Kiểm tra và vô hiệu hóa nạp DTD ngoài trong bộ phân tích XML để triệt tiêu nguy cơ XXE.

### P2 — Improvement
1. Hoàn thiện tính năng xuất hồ sơ giải trình thuế trọn gói định dạng PDF kèm chữ ký số.

---

## 14. Reviewer Conclusion

* **Current System State**: Một giải pháp có tính thực tiễn kinh doanh cực cao, giải quyết trúng nhu cầu cấp bách của phòng kế toán doanh nghiệp Việt Nam trong thời kỳ hóa đơn điện tử.
* **Most Important Strength**: Hỗ trợ xuất sắc định dạng XML hóa đơn điện tử chuẩn Thông tư 78 của các nhà mạng lớn, đối chiếu số học tất định không sợ ảo giác, bộ tài liệu và mẫu test cực kỳ phong phú.
* **Most Important Technical Risk**: Tầng lưu trữ dữ liệu hiện tại chỉ lưu trên RAM máy chủ (In-Memory), dễ mất trắng khi khởi động lại.
* **Most Important Next Action**: Thay thế kho dữ liệu in-memory bằng cơ sở dữ liệu quan hệ bền vững để sẵn sàng đưa vào vận hành thực tế.
