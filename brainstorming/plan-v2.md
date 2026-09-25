# KẾ HOẠCH NÂNG CẤP & CẢI THIỆN TOÀN DIỆN DỰ ÁN TAX REFEREE (PLAN V2.0)
> **Tài liệu Kế hoạch Kỹ thuật & Lộ trình Triển khai Chi tiết dành cho Đội ngũ Phát triển**  
> **Dự án:** Tax Referee - The Escalation Referee (Đề bài A - Cuộc thi Trí tuệ Nhân tạo trong Tổ chức 2026)  
> **Không gian phát triển:** `competitions/tax-referee` | **Công nghệ:** Next.js 15 (App Router), TypeScript, Tailwind CSS, Zod  
> **Căn cứ nghiệp vụ:** [quy-trinh-nghiep-vu-ke-toan.md](file:///Users/xuannguyen/Desktop/Competitions/2026/MLAI%20-%20Track%202/Tax%20Referee/brainstorming/quy-trinh-nghiep-vu-ke-toan.md)  
> **Căn cứ workflow:** [workflow-v2.md](file:///Users/xuannguyen/Desktop/Competitions/2026/MLAI%20-%20Track%202/Tax%20Referee/brainstorming/workflow-v2.md)  
> **Căn cứ đề bài:** [Challenge_Brief_OrganizationAI_VN.docx](file:///Users/xuannguyen/Desktop/Competitions/2026/MLAI%20-%20Track%202/Tax%20Referee/brainstorming/Challenge_Brief_OrganizationAI_VN.docx)

---

## MỤC LỤC CHI TIẾT
1. [MỤC TIÊU NÂNG CẤP & CÁC TRỤ CỘT ĐỔI MỚI](#1-mục-tiêu-nâng-cấp--các-trụ-cột-đổi-mới)
2. [MA TRẬN KHOẢNG TRỐNG HIỆN TẠI VÀ YÊU CẦU NÂNG CẤP (GAP ANALYSIS)](#2-ma-trận-khoảng-trống-hiện-tại-và-yêu-cầu-nâng-cấp-gap-analysis)
3. [KIẾN TRÚC KỸ THUẬT V2.0: TEMPORAL & DYNAMIC REGULATORY ENGINE](#3-kiến-trúc-kỹ-thuật-v20-temporal--dynamic-regulatory-engine)
4. [ĐẶC TẢ CHI TIẾT CẢI THIỆN TỪNG TỆP TIN & MODULE MÃ NGUỒN](#4-đặc-tả-chi-tiết-cải-thiện-từng-tệp-tin--module-mã-nguồn)
   - [4.1 Tầng Schema & Cấu Hình (`lib/schemas.ts`, `lib/constants.ts`)](#41-tầng-schema--cấu-hình)
   - [4.2 Tầng Dữ Liệu Pháp Lý & Dữ Liệu Mẫu (`data/regulatoryRegistry.ts`, `data/sopText.ts`, `data/mockInvoices.ts`)](#42-tầng-dữ-liệu-pháp-lý--dữ-liệu-mẫu)
   - [4.3 Tầng Logic Điều Phối & AI Lõi (`services/policyEngine.ts`, `services/jevService.ts`, `services/geminiService.ts`)](#43-tầng-logic-điều-phối--ai-lõi)
   - [4.4 Tầng API Endpoints (`app/api/evaluate`, `app/api/verify`, `app/api/policy`)](#44-tầng-api-endpoints)
   - [4.5 Tầng Giao Diện Người Dùng & Component Mới (`components/`)](#45-tầng-giao-diện-người-dùng--component-mới)
5. [DANH MỤC 15 CA KIỂM THỬ CHUẨN MỰC NIÊN ĐỘ 2025 - 2026](#5-danh-mục-15-ca-kiểm-thử-chuẩn-mực-niên-độ-2025---2026)
6. [LỘ TRÌNH TRIỂN KHAI 5 GIAI ĐOẠN CHI TIẾT (5-PHASE ROADMAP)](#6-lộ-trình-triển-khai-5-giai-đoạn-chi-tiết-5-phase-roadmap)
7. [BỘ CHỈ SỐ ĐO LƯỜNG & PHƯƠNG PHÁP NGHIỆM THU (ACCEPTANCE CRITERIA)](#7-bộ-chỉ-số-đo-lường--phương-pháp-nghiệm-thu-acceptance-criteria)

---

## 1. MỤC TIÊU NÂNG CẤP & CÁC TRỤ CỘT ĐỔI MỚI

Kế hoạch này nhằm nâng cấp toàn diện dự án Tax Referee từ phiên bản Prototype ban đầu thành một **Hệ thống Trọng tài Thuế Chuyên nghiệp Cấp Doanh nghiệp (Enterprise-Ready Tax Referee)**, giải quyết trọn vẹn các yêu cầu:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                    4 TRỤ CỘT NÂNG CẤP TRỌNG YẾU CỦA TAX REFEREE             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  [TRỤ CỘT 1] CHUẨN XÁC PHÁP LÝ THUẾ NIÊN ĐỘ 2025 - 2026                     │
│  • Cập nhật ngưỡng thanh toán không dùng tiền mặt 5.000.000 VNĐ             │
│  • Cập nhật chính sách giảm thuế GTGT 8% theo NQ 204/2025/QH15              │
│  • Áp dụng thuế suất TNDN phân tầng 15% - 17% - 20% theo Luật 67/2025/QH15  │
│  • Cập nhật biểu mẫu Tờ khai thuế GTGT 01/GTGT mới (TT 89/2026/TT-BTC)      │
│  • Định vị đúng bản chất tham số rủi ro K (CV 2392) & Hóa đơn điện tử mới   │
│                                                                             │
│  [TRỤ CỘT 2] TÍCH HỢP CƠ CHẾ CẬP NHẬT PHÁP LUẬT ĐỘNG (TEMPORAL REGULATORY)   │
│  • Quản lý phiên bản pháp lý có mốc hiệu lực thời gian (Bi-temporal audit)  │
│  • Giao diện Dynamic Policy Studio cho phép KTT/Giám khảo đổi luật trực tiếp│
│  • Tự động thích ứng khi chính sách thuế thay đổi mà không cần sửa code     │
│                                                                             │
│  [TRỤ CỘT 3] ĐÁP ỨNG 100% TIÊU CHÍ ĐỀ BÀI A (CHALLENGE BRIEF)               │
│  • Xử lý tự động 100% hóa đơn thường quy (ROUTINE) trong < 15ms             │
│  • Dừng ngay lập tức và phân loại chuẩn 3 Nhóm Chuyển tiếp (Zero-Hallucination)│
│  • Câu hỏi đóng A/B hành động tức thì trong 3 giây (Zero-Research Decision) │
│  • Verify Harness 90 giây kiểm thử 1-chạm đạt 100% tỷ lệ thành công         │
│  • Tiếp nhận và phân tích tức thì dữ liệu đầu vào mới của Giám khảo         │
│                                                                             │
│  [TRỤ CỘT 4] ĐO LƯỜNG TÁC ĐỘNG THỰC TẾ & MINH CHỨNG PHÒNG VỆ THUẾ          │
│  • Bảng so sánh định lượng Before vs After (nhanh hơn 12.000 lần)           │
│  • Báo cáo trung thực điểm bất cập phát sinh & giải pháp đối ứng            │
│  • Lưu vết kiểm toán SHA-256 bất biến & Xuất 1-Click Tax Defense Dossier    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. MA TRẬN KHOẢNG TRỐNG HIỆN TẠI VÀ YÊU CẦU NÂNG CẤP (GAP ANALYSIS)

Đối chiếu mã nguồn hiện tại trong kho lưu trữ với các tài liệu chuẩn hóa:

| Module / Thành Phần | Hiện Trạng Trong Mã Nguồn (v1.0) | Yêu Cầu Cải Thiện Trong Kế Hoạch v2.0 | Mức Độ Ưu Tiên |
| :--- | :--- | :--- | :---: |
| **Ngưỡng thanh toán tiền mặt** | Hard-code `>= 20_000_000` VNĐ trong `policyEngine.ts` và `regulatoryRegistry.ts`. | Chuyển sang biến động `NON_CASH_PAYMENT_THRESHOLD = 5_000_000` VNĐ (Luật GTGT 48/2024/QH15 & NĐ 320/2025/NĐ-CP) có mốc hiệu lực thời gian. | **P0 (Bắt buộc)** |
| **Căn cứ giảm thuế GTGT 8%** | Dẫn chiếu NĐ 72/2024 và NQ 142/2024 (cũ). | Cập nhật căn cứ Nghị quyết 204/2025/QH15 & Nghị định 174/2025/NĐ-CP (áp dụng đến hết 31/12/2026). Làm rõ nguyên tắc loại trừ không cào bằng CNTT. | **P0 (Bắt buộc)** |
| **Biểu mẫu Tờ khai 01/GTGT** | Mô tả theo Thông tư 80/2021/TT-BTC. | Cập nhật cấu trúc Thông tư 89/2026/TT-BTC: Chỉ tiêu [21] (không phát sinh), [22] (kỳ trước), [25] (được khấu trừ), [30]-[33] (doanh thu/thuế 8% & 10%). | **P1 (Quan trọng)** |
| **Thuế TNDN & TNCN** | Chỉ ghi nhận TNDN 20% và TNCN 11M/4,4M cũ. | Bổ sung khung TNDN phân tầng 15% - 17% - 20% (Luật 67/2025/QH15); TNCN giảm trừ 15,5M / 6,2M và biểu 5 bậc (NQ 110/2025/UBTVQH15). | **P1 (Quan trọng)** |
| **Khung pháp lý HĐĐT** | Lấy NĐ 123/2020 và TT 78/2021 làm gốc. | Cập nhật hệ thống Nghị định 254/2026/NĐ-CP, Nghị định 70/2025/NĐ-CP và Thông tư 91/2026/TT-BTC. Xử lý đúng sai tên/địa chỉ nhưng đúng MST. | **P1 (Quan trọng)** |
| **Bản chất Tham số K** | Đề xuất "trì hoãn kê khai sang kỳ sau để giữ K an toàn". | Xóa bỏ hoàn toàn việc hoãn kê khai; thay bằng chỉ đạo lập Bộ Hồ sơ Giải trình Nguồn hàng (Tax Defense Dossier). Ghi rõ K là chỉ số rủi ro nội bộ tham chiếu. | **P0 (Bắt buộc)** |
| **Cơ chế Cập nhật Luật Động** | Cấu hình quy định cứng trong file tĩnh; modal xem chính sách chỉ đọc (Read-only). | Bổ sung module **Temporal Regulatory Engine** + Modal cấu hình quy định động (**Dynamic Policy Studio**) cho phép KTT/Giám khảo sửa ngưỡng trên UI. | **P0 (Tính năng then chốt)** |
| **Bộ 15 Ca Kiểm Thử** | Một số ca còn ghi chú "Dưới 20M" hoặc HĐ tiền mặt 25M. | Chuẩn hóa toàn bộ 15 ca: Bổ sung ca tiền mặt 12M vi phạm ngưỡng 5M mới; ca viễn thông 8% chuẩn NQ 204; ca HĐ xuất trước/sau ngày đóng MST; ca K-factor Vùng Đỏ. | **P0 (Bắt buộc)** |

---

## 3. KIẾN TRÚC KỸ THUẬT V2.0: TEMPORAL & DYNAMIC REGULATORY ENGINE

Để hệ thống vừa đảm bảo tính bất biến của Luật pháp Nhà nước, vừa thích ứng linh hoạt khi có văn bản mới hoặc cho phép Giám khảo tùy chỉnh chính sách trong bài thi:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│             KIẾN TRÚC TEMPORAL & DYNAMIC REGULATORY ENGINE                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  [1. PERSISTENT STORAGE LAYER]                                              │
│  • LocalStorage / SQLite / In-Memory Cache:                                 │
│    - `tax_referee_temporal_registry_v2` (Danh mục văn bản pháp luật)        │
│    - `tax_referee_dynamic_sop_v2` (Quy chế nội bộ và hạn mức thẩm quyền)    │
│                                                                             │
│  [2. DYNAMIC POLICY STUDIO (UI COMPONENT)]                                  │
│  • Giao diện cho phép Kế toán trưởng hoặc Giám khảo điều chỉnh:             │
│    + Ngưỡng thanh toán không tiền mặt (Mặc định 5M; có thể đổi thành 10M)   │
│    + Hạn mức phê duyệt KTT / CFO (Mặc định 200M; có thể đổi thành 300M)    │
│    + Thêm/bớt danh mục hàng hóa loại trừ thuế 8%                            │
│    + Thiết lập dải ngưỡng an toàn Tham số K                                 │
│    + Nút "Khôi phục mặc định pháp lý 2026" (Reset to Standard 2026)         │
│                                                                             │
│  [3. BI-TEMPORAL AUDIT ENGINE]                                              │
│  • Hàm `getApplicableRules(invoiceDate: string)`                            │
│    - Đầu vào: Ngày phát hành của hóa đơn (`invoiceDate`)                    │
│    - Xử lý: Tra cứu văn bản luật có hiệu lực tại ngày đó                    │
│      * Ví dụ: HĐ ngày 20/05/2025 -> Kích hoạt Luật cũ (ngưỡng 20M)          │
│      * Ví dụ: HĐ ngày 20/08/2025 -> Kích hoạt Luật mới 48/2024 (ngưỡng 5M)  │
│                                                                             │
│  [4. TYPE-SAFE REFEREE CORE]                                                │
│  • Áp dụng đúng bộ quy tắc đã được resolve theo thời gian và cấu hình       │
│  • Đảm bảo 100% tính nhất quán: Không sửa code logic cốt lõi                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. ĐẶC TẢ CHI TIẾT CẢI THIỆN TỪNG TỆP TIN & MODULE MÃ NGUỒN

### 4.1 Tầng Schema & Cấu Hình

#### [file:///Users/xuannguyen/Desktop/Competitions/2026/MLAI%20-%20Track%202/Tax%20Referee/lib/schemas.ts]
- **Bổ sung Dynamic Configuration Schema:**
  ```typescript
  export const SystemPolicyConfigSchema = z.object({
    nonCashThreshold: z.number().default(5_000_000), // Mặc định 5 triệu theo Luật 48/2024
    kttApprovalLimit: z.number().default(200_000_000), // Hạn mức KTT 200 triệu
    kFactorSafeMin: z.number().default(1.05),
    kFactorSafeMax: z.number().default(1.25),
    vatReductionRate: z.number().default(8),
    vatStandardRate: z.number().default(10),
    allowStaffReimbursement: z.boolean().default(true), // Cho phép hoàn ứng ủy quyền nhân viên
    excludedVat8Categories: z.array(z.string()).default([
      'VIỄN THÔNG', 'TÀI CHÍNH', 'NGÂN HÀNG', 'CHỨNG KHOÁN', 'BẢO HIỂM',
      'BẤT ĐỘNG SẢN', 'KIM LOẠI', 'KHAI KHOÁNG', 'HÓA CHẤT', 'TIÊU THỤ ĐẶC BIỆT'
    ])
  });
  export type SystemPolicyConfig = z.infer<typeof SystemPolicyConfigSchema>;
  ```
- **Chuẩn hóa Referee Decision Type:** Bổ sung trường `appliedLawBasis`, `temporalVersion` và tùy biến action của CFO (không dùng `REJECT_TAX_DEDUCTION` cho K-Factor mà dùng `ACCEPT_WITH_DEFENSE_DOSSIER`).

#### [file:///Users/xuannguyen/Desktop/Competitions/2026/MLAI%20-%20Track%202/Tax%20Referee/lib/constants.ts]
- Cập nhật các hằng số mặc định chuẩn xác:
  ```typescript
  export const LEGAL_CONSTANTS_2026 = {
    NON_CASH_THRESHOLD_CURRENT: 5_000_000,
    NON_CASH_THRESHOLD_LEGACY: 20_000_000,
    LAW_48_EFFECTIVE_DATE: '2025-07-01',
    VAT_8_EXPIRY_DATE: '2026-12-31',
    PIT_PERSONAL_DEDUCTION: 15_500_000,
    PIT_DEPENDENT_DEDUCTION: 6_200_000,
    CIT_SME_TIER_1: 0.15, // <= 3 tỷ
    CIT_SME_TIER_2: 0.17, // 3 - 50 tỷ
    CIT_STANDARD: 0.20
  };
  ```

---

### 4.2 Tầng Dữ Liệu Pháp Lý & Dữ Liệu Mẫu

#### [file:///Users/xuannguyen/Desktop/Competitions/2026/MLAI%20-%20Track%202/Tax%20Referee/data/regulatoryRegistry.ts]
- Thay thế toàn bộ hệ thống văn bản cũ bằng danh mục quy phạm pháp luật 2025 - 2026:
  + `LUAT-108-2025`: Luật Quản lý thuế số 108/2025/QH15.
  + `LUAT-48-2024`: Luật Thuế Giá trị gia tăng số 48/2024/QH15 (Ngưỡng 5M không tiền mặt).
  + `NQ-204-2025`: Nghị quyết số 204/2025/QH15 & NĐ 174/2025/NĐ-CP (VAT 8% đến 31/12/2026).
  + `LUAT-67-2025`: Luật Thuế Thu nhập doanh nghiệp số 67/2025/QH15 & NĐ 320/2025/NĐ-CP (15% - 17% - 20%).
  + `LUAT-109-2025`: Luật Thuế Thu nhập cá nhân số 109/2025/QH15 & NQ 110/2025/UBTVQH15 (Giảm trừ 15,5M / 6,2M).
  + `ND-254-2026`: Nghị định số 254/2026/NĐ-CP, NĐ 70/2025/NĐ-CP & TT 91/2026/TT-BTC (HĐĐT và xử lý sai sót).
  + `TT-89-2026`: Thông tư số 89/2026/TT-BTC (Biểu mẫu Tờ khai 01/GTGT mới).
  + `TT-94-2026`: Thông tư số 94/2026/TT-BTC & CV 2392/TCT-QLRR (Quản lý tuân thủ, rủi ro và Tham số K).
- Xây dựng hàm `resolveTemporalPolicy(invoiceDate: string): ResolvedPolicy` để tự động chọn đúng ngưỡng luật theo ngày xuất hóa đơn.

#### [file:///Users/xuannguyen/Desktop/Competitions/2026/MLAI%20-%20Track%202/Tax%20Referee/data/sopText.ts]
- Cập nhật toàn văn Quy chế Quản trị Thuế Doanh nghiệp `TAX-SOP-2026` đồng bộ với 10 chương của [quy-trinh-nghiep-vu-ke-toan.md](file:///Users/xuannguyen/Desktop/Competitions/2026/MLAI%20-%20Track%202/Tax%20Referee/brainstorming/quy-trinh-nghiep-vu-ke-toan.md).

#### [file:///Users/xuannguyen/Desktop/Competitions/2026/MLAI%20-%20Track%202/Tax%20Referee/data/mockInvoices.ts]
- Hiệu chỉnh bộ 15 ca kiểm thử chuẩn xác 100% niên độ 2025 - 2026 (chi tiết tại Mục 5).

---

### 4.3 Tầng Logic Điều Phối & AI Lõi

#### [file:///Users/xuannguyen/Desktop/Competitions/2026/MLAI%20-%20Track%202/Tax%20Referee/services/policyEngine.ts]
- **Nâng cấp hàm kiểm tra điều kiện không tiền mặt:**
  ```typescript
  const threshold = policyConfig.nonCashThreshold; // Mặc định 5_000_000
  if (inv.totalAmount >= threshold && (inv.paymentMethod === 'CASH' || !inv.hasBankSlip)) {
    // Trừ trường hợp ủy quyền nhân viên hoàn ứng hợp lệ theo SOP
    if (!(policyConfig.allowStaffReimbursement && inv.isStaffReimbursed)) {
      return {
        status: 'ESCALATED',
        riskGroup: 'OUT_OF_POLICY',
        flaggedReason: 'Hóa đơn từ ' + formatVND(threshold) + ' trở lên thanh toán TIỀN MẶT vi phạm Luật Thuế GTGT 48/2024/QH15',
        // ...
      };
    }
  }
  ```
- **Nâng cấp phản ứng Tham số K:**
  + Khi K rơi vào Vùng Đỏ, đổi phương án B từ "Hoãn kê khai" thành "Phê duyệt kê khai kèm chỉ đạo lập Hồ sơ Phòng vệ Nguồn hàng (Tax Defense Dossier)".
- **Tích hợp Dynamic Policy Ingestion:** Hàm `evaluateInvoiceLocally` nhận thêm tham số tùy chọn `customConfig?: SystemPolicyConfig` để Giám khảo có thể test với cấu hình tùy biến ngay lập tức.

#### [file:///Users/xuannguyen/Desktop/Competitions/2026/MLAI%20-%20Track%202/Tax%20Referee/services/jevService.ts] & [file:///Users/xuannguyen/Desktop/Competitions/2026/MLAI%20-%20Track%202/Tax%20Referee/services/geminiService.ts]
- Đồng bộ các prompt và context pháp lý mới nhất (2025 - 2026) vào hệ thống TypeSafe AI Jev và Gemini 2.5 Flash, đảm bảo AI sinh câu hỏi đóng A/B dẫn chiếu đúng điều khoản luật mới.

---

### 4.4 Tầng API Endpoints

- **[file:///Users/xuannguyen/Desktop/Competitions/2026/MLAI%20-%20Track%202/Tax%20Referee/app/api/verify/route.ts]:**
  + Tích hợp bộ quy chuẩn mới; đo thời gian thực thi chính xác của từng ca; xuất bảng tóm tắt kết quả theo đúng chuẩn format chấm điểm của Ban Giám khảo.
- **[file:///Users/xuannguyen/Desktop/Competitions/2026/MLAI%20-%20Track%202/Tax%20Referee/app/api/policy/route.ts] (API Mới):**
  + Hỗ trợ GET (lấy cấu hình quy định hiện hành) và POST (cập nhật cấu hình quy định động từ giao diện quản trị).

---

### 4.5 Tầng Giao Diện Người Dùng & Component Mới

#### [file:///Users/xuannguyen/Desktop/Competitions/2026/MLAI%20-%20Track%202/Tax%20Referee/components/PolicyViewerModal.tsx] & Bổ Sung Tab "Dynamic Policy Studio"
- Bổ sung thanh công cụ cho phép chuyển đổi giữa:
  + **Tab 1: Tra Cứu Văn Bản Luật 2025 - 2026 (Căn Cứ Chân Lý)**: Đọc toàn văn các luật, nghị định, thông tư mới.
  + **Tab 2: Trình Quản Trị Quy Định Động (Dynamic Policy Studio)**: Form trực quan cho phép Giám khảo/KTT:
    * Kéo thanh trượt thay đổi Ngưỡng thanh toán không tiền mặt (5M -> 10M -> 20M).
    * Thay đổi Hạn mức tự duyệt của KTT (200M -> 300M).
    * Bật/tắt cơ chế Cho phép hoàn ứng nhân viên.
    * Nút "Lưu Cấu Hình & Chạy Thử Ngay" (Test Live).
    * Nút "Khôi Phục Chuẩn Luật 2026".

#### [file:///Users/xuannguyen/Desktop/Competitions/2026/MLAI%20-%20Track%202/Tax%20Referee/components/VerifyHarness.tsx]
- Bổ sung nhãn trực quan: Hiển thị rõ mốc thời gian pháp lý áp dụng cho từng ca (Ví dụ: `[Luật GTGT 48/2024]`, `[NQ 204/2025]`, `[NĐ 254/2026]`).
- Bổ sung nút chạy lại Verify khi cấu hình luật bị thay đổi để chứng minh tính thích ứng động.

#### [file:///Users/xuannguyen/Desktop/Competitions/2026/MLAI%20-%20Track%202/Tax%20Referee/components/EscalationCard.tsx]
- Hiển thị rõ ràng: Căn cứ pháp lý (Legal Basis) + Dữ liệu thực tế từ bill + Đúng 2 nút bấm A/B to, rõ, dễ bấm.
- Nút "Xem Bộ Hồ Sơ Phòng Vệ" (View Tax Defense Dossier) liên kết trực tiếp.

#### [file:///Users/xuannguyen/Desktop/Competitions/2026/MLAI%20-%20Track%202/Tax%20Referee/components/MacroHealthWidget.tsx]
- Cập nhật giải thích chuẩn mực: K là Tham số rủi ro nguồn hàng tham chiếu (CV 2392/TCT-QLRR & TT 94/2026/TT-BTC), không gọi là tỷ số bắt buộc của luật.
- Hiển thị hướng dẫn hành động khi chạm Vùng Đỏ: *"Chủ động chuẩn bị Hồ sơ Phòng vệ Nguồn hàng để sẵn sàng giải trình với Cục Thuế."*

---

## 5. DANH MỤC 15 CA KIỂM THỬ CHUẨN MỰC NIÊN ĐỘ 2025 - 2026

Bộ dữ liệu kiểm thử được thiết kế hoàn chỉnh, phản ánh chính xác các case thực tế:

```text
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                      BẢNG DANH MỤC 15 CA KIỂM THỬ CHUẨN MỰC TAX REFEREE                 │
├─────┬─────────┬──────────────────────────────────┬─────────────────┬────────────────────┤
│ STT │ MÃ CA   │ TÌNH HUỐNG THỰC TẾ               │ PHÂN LUỒNG      │ CĂN CỨ PHÁP LÝ     │
├─────┼─────────┼──────────────────────────────────┼─────────────────┼────────────────────┤
│  1  │ TC-01   │ Mua VPP Fahasa 4.5M tiền mặt     │ ROUTINE         │ Luật GTGT 48 (<5M) │
│  2  │ TC-02   │ Tiền điện EVN 12M có UNC         │ ROUTINE         │ Luật GTGT 48 (UNC) │
│  3  │ TC-03   │ Tiếp khách Sen Tây Hồ 8.8M có BK │ ROUTINE         │ SOP Điều 5 (Đủ BK) │
│  4  │ TC-04   │ Tiếp khách Hoàn Mỹ 4.8M tiền mặt │ ROUTINE         │ Luật GTGT 48 (<5M) │
│  5  │ TC-05   │ Thuê server CMC 22M có UNC       │ ROUTINE         │ NĐ 254 (Hợp lệ)    │
│  6  │ TC-06   │ Nước uống Lavie 3.2M tiền mặt    │ ROUTINE         │ Luật GTGT 48 (<5M) │
├─────┼─────────┼──────────────────────────────────┼─────────────────┼────────────────────┤
│  7  │ TC-07   │ Taxi Vinasun mờ số tiền          │ UNCERTAIN_INFO  │ SOP Điều 2 (Mờ số) │
│  8  │ TC-08   │ HĐ điều chỉnh thiếu mã HĐ gốc    │ UNCERTAIN_INFO  │ NĐ 254/2026 Điều 19│
│  9  │ TC-09   │ Lập TRƯỚC ngày bên bán đóng MST  │ UNCERTAIN_INFO  │ SOP 2.2 (Treo XM)  │
├─────┼─────────┼──────────────────────────────────┼─────────────────┼────────────────────┤
│ 10  │ TC-10   │ Cước viễn thông VNPT áp thuế 8%  │ OUT_OF_POLICY   │ NQ 204/2025 (Loại) │
│ 11  │ TC-11   │ Tiệc rượu vang xa xỉ 9.2M        │ OUT_OF_POLICY   │ Luật TNDN (Phi KD) │
│ 12  │ TC-12   │ Máy lạnh Daikin 25M TIỀN MẶT     │ OUT_OF_POLICY   │ Luật GTGT 48 (≥5M) │
├─────┼─────────┼──────────────────────────────────┼─────────────────┼────────────────────┤
│ 13  │ TC-13   │ Chiết khấu Hòa Phát 250M (≥200M) │ EXCEED_AUTHORITY│ SOP Điều 3 (CFO)   │
│ 14  │ TC-14   │ Vật tư lớn 4.5 tỷ đẩy K < 0.95   │ EXCEED_AUTHORITY│ CV 2392 (K Vùng Đỏ)│
│ 15  │ TC-15   │ Doanh thu tăng vọt đẩy K > 1.35  │ EXCEED_AUTHORITY│ CV 2392 (K Vùng Đỏ)│
└─────┴─────────┴──────────────────────────────────┴─────────────────┴────────────────────┘
```

---

## 6. LỘ TRÌNH TRIỂN KHAI 5 GIAI ĐOẠN CHI TIẾT (5-PHASE ROADMAP)

```text
GIAI ĐOẠN 1: SCHEMA & DATA REFACTORING
├── Cập nhật SystemPolicyConfigSchema trong lib/schemas.ts
├── Cập nhật LEGAL_CONSTANTS_2026 trong lib/constants.ts
├── Viết lại danh mục văn bản 2025-2026 trong data/regulatoryRegistry.ts
└── Cập nhật nội dung 15 ca kiểm thử trong data/mockInvoices.ts
      │
      ▼
GIAI ĐOẠN 2: POLICY ENGINE & TEMPORAL INTEGRATION
├── Cập nhật hàm evaluateInvoiceLocally với ngưỡng 5M và K-factor mới
├── Thêm cơ chế giải quyết mốc thời gian (Bi-temporal rule resolution)
├── Cập nhật prompt context trong jevService.ts và geminiService.ts
└── Kiểm tra đơn vị (Unit testing) cho logic phân loại 3 nhóm
      │
      ▼
GIAI ĐOẠN 3: DYNAMIC POLICY STUDIO & UI ENHANCEMENT
├── Thêm Tab "Dynamic Policy Studio" trong PolicyViewerModal.tsx
├── Bổ sung thanh điều chỉnh cấu hình luật linh hoạt
├── Nâng cấp VerifyHarness.tsx hiển thị căn cứ luật và thời gian
├── Nâng cấp EscalationCard.tsx tối ưu phán quyết 3 giây
└── Nâng cấp MacroHealthWidget.tsx phản ánh đúng tinh thần CV 2392
      │
      ▼
GIAI ĐOẠN 4: SYSTEM INTEGRATION & VERIFY HARNESS PASS
├── Cập nhật app/api/verify/route.ts chạy trơn tru 5 ca chuẩn
├── Cập nhật app/page.tsx tích hợp state cấu hình chính sách động
├── Kiểm tra tương tác: Sửa luật trên UI -> Chạy Verify -> Kết quả cập nhật ngay
└── Kiểm tra tính năng Custom Invoice Input với dữ liệu mới của Giám khảo
      │
      ▼
GIAI ĐOẠN 5: FINAL POLISHING, DOCUMENTATION & SUBMISSION ASSETS
├── Kiểm tra tuân thủ quy tắc no_latex_formatting
├── Cập nhật README.md, RUNBOOK.md và testing.md
├── Chuẩn bị nội dung 5 Slide thuyết trình chuẩn cấu trúc cuộc thi
└── Chuẩn bị kịch bản quay Video Demo 3 phút thực tế
```

---

## 7. BỘ CHỈ SỐ ĐO LƯỜNG & PHƯƠNG PHÁP NGHIỆM THU (ACCEPTANCE CRITERIA)

Mỗi giai đoạn được nghiệm thu khi đạt đầy đủ các chỉ số định lượng sau:

| Tiêu Chí Đo Lường | Chỉ Số Mục Tiêu | Phương Pháp Kiểm Tra & Công Cụ Nghiệm Thu |
| :--- | :--- | :--- |
| **Tốc độ xử lý ca thường quy (Routine Latency)** | **< 15 ms/hóa đơn** | Benchmark trực tiếp qua Performance API trên trình duyệt. |
| **Tốc độ ra quyết định chuyển tiếp (HITL Decision)** | **< 3 giây** | Thử nghiệm người dùng thực tế với 2 nút bấm A/B trên Escalation Card. |
| **Độ chính xác phân luồng 3 nhóm (Precision)** | **100% trên bộ 15 ca chuẩn** | Chạy toàn bộ test suite trong `testing.md`, không có false positive. |
| **Không ảo giác (Zero-Hallucination Guardrail)** | **100% đạt** | Khẳng định `approvedTaxAmount = 0` trên 100% hóa đơn bị gắn cờ rủi ro. |
| **Tỷ lệ Pass Verify Harness 90s** | **5/5 ca PASS (100%)** | Bấm 1 nút `RUN VERIFY 90s` trên giao diện, bảng kết quả hiện xanh toàn bộ. |
| **Khả năng tiếp nhận dữ liệu mới** | **100% xử lý hợp lý** | Dán hóa đơn mới lạ vào ô Custom Input, hệ thống phân loại đúng trong < 1 giây. |
| **Tính thích ứng khi đổi luật (Dynamic Adaptation)** | **Tức thì (< 100ms)** | Đổi ngưỡng 5M -> 10M trên UI, hóa đơn 7M tự động đổi từ `OUT_OF_POLICY` sang `ROUTINE` ngay lập tức. |
| **Toàn vẹn kiểm toán (Audit Integrity)** | **100% có mã băm SHA-256** | Mọi thao tác đều sinh log bất biến, hỗ trợ Hoàn tác (Undo) và Ghi đè (Override). |

---

*Bản kế hoạch Master Blueprint v2.0 này là kim chỉ nam toàn diện, kết nối hoàn hảo giữa chuẩn mực nghiệp vụ kế toán thuế thực tế niên độ 2025 - 2026 với 100% tiêu chí đánh giá của Ban Giám khảo Đề bài A - MLAI Hackathon 2026.*
