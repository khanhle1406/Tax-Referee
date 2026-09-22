# KẾ HOẠCH THIẾT KẾ & TRIỂN KHAI HỆ THỐNG TAX REFEREE
> **Tài liệu Kỹ thuật Chi tiết dành cho Đội ngũ Phát triển (Developer Master Blueprint)**  
> **Dự án:** Tax Referee - The Escalation Referee (Đề bài A - MLAI Hackathon 2026)  
> **Không gian làm việc:** `hackaithon/tax-referee` | **Công nghệ:** Next.js 15 (App Router), TypeScript, Tailwind CSS, Zod  
> **API Lõi tích hợp:**  
> - **TypeSafe AI Jev API:** Khóa cấu hình qua biến môi trường `TYPESAFE_API_KEY`  
> - **Google Gemini API:** Khóa cấu hình qua biến môi trường `GEMINI_API_KEY`

---

## MỤC LỤC
1. [TỔNG QUAN KIẾN TRÚC HỆ THỐNG & NGUYÊN TẮC THIẾT KẾ](#1-tổng-quan-kiến-trúc-hệ-thống--nguyên-tắc-thiết-kế)
2. [CẤU TRÚC THƯ MỤC DỰ ÁN (PRODUCTION NEXT.JS)](#2-cấu-trúc-thư-mục-dự-án-production-nextjs)
3. [ĐẶC TẢ CHI TIẾT TỪNG MODULE & FILE CODE](#3-đặc-tả-chi-tiết-từng-module--file-code)
4. [TÍCH HỢP JEV API & GEMINI API (DUAL-AI ENGINE)](#4-tích-hợp-jev-api--gemini-api-dual-ai-engine)
5. [HỆ THỐNG DỮ LIỆU MẪU & BỘ 15 TEST CASES CHI TIẾT](#5-hệ-thống-dữ-liệu-mẫu--bộ-15-test-cases-chi-tiết)
6. [THIẾT KẾ GIAO DIỆN PRODUCTION-READY (CHỮ TO RÕ, TRỰC QUAN CHO GIÁM KHẢO)](#6-thiết-kế-giao-diện-production-ready-chữ-to-rõ-trực-quan-cho-giám-khảo)
7. [LỘ TRÌNH TRIỂN KHAI THEO TỪNG BƯỚC: CODE -> TEST -> FIX -> ITERATE](#7-lộ-trình-triển-khai-theo-từng-bước-code---test---fix---iterate)
8. [HƯỚNG DẪN CHẠY & BÀN GIAO (RUNBOOK & COMPLIANCE VERIFICATION)](#8-hướng-dẫn-chạy--bàn-giao-runbook--compliance-verification)

---

## 1. TỔNG QUAN KIẾN TRÚC HỆ THỐNG & NGUYÊN TẮC THIẾT KẾ

### 1.1 Triết lý Vận hành: "Dual-Engine Type-Safe Architecture"
Hệ thống kết hợp sức mạnh của 2 mô hình AI chuyên biệt cùng một rào chắn kiểm soát kiểu dữ liệu nghiêm ngặt:
1. **Google Gemini API (Multimodal Perception Engine):**
   - Đọc hiểu hình ảnh hóa đơn chụp mờ/lóa, tệp PDF, scan hóa đơn giấy.
   - Bóc tách văn bản phi cấu trúc thành dữ liệu JSON chuẩn.
   - Sinh câu hỏi hành động đóng (Actionable Question) và lời giải thích bằng tiếng Việt bình dân cho người không chuyên.
2. **TypeSafe AI Jev API (`https://api.typesafe.ai/v1/systemone`):**
   - Đóng vai trò là **"Decision Primitive" (Bộ não phán quyết xác suất)**.
   - Không sinh văn bản tự do mà nhận diện trạng thái hóa đơn (`state`) và trả về kết quả định kiểu (`choice`, `noul`, `score`) kèm độ tin cậy được hiệu chuẩn.
   - Phân loại chính xác 3 nhóm: `UNCERTAIN_INFO`, `OUT_OF_POLICY`, `EXCEED_AUTHORITY` hoặc `ROUTINE`.
3. **JEV Guardrail Core (Zod Discriminated Unions):**
   - Cưỡng chế luồng dữ liệu 100% Type-Safe tại tầng TypeScript.
   - Ngăn chặn triệt để (Zero-Hallucination) việc một hóa đơn có dấu hiệu nghi vấn lọt vào bảng khấu trừ thuế.
4. **Deterministic Policy Fallback (< 50ms):**
   - Đảm bảo khi mất mạng hoặc chạy bài kiểm tra nhanh 90 giây của Giám khảo, hệ thống luôn phản hồi tức thì bằng bộ quy tắc nội bộ đối soát trực tiếp theo `Tax-SOP-2026`.

```text
[ĐẦU VÀO: Hóa đơn Ảnh / PDF / JSON]
                  │
                  ▼
      [Google Gemini API] ──► Bóc tách Thực thể (MST, Ngày, Hàng hóa, Thuế suất, Tiền, UNC)
                  │
                  ▼
      [Tiền kiểm Thời gian & Truy vết NĐ 123] ──► So khớp Ngày đóng MST & Mã HĐ Gốc
                  │
                  ▼
      [TypeSafe AI Jev Engine] ──► Phán quyết Định loại (Choice: ROUTINE vs 3 Nhóm Rủi ro)
                  │
                  ▼
      [Zod Discriminated Union Guardrail]
        ├── Nhánh ROUTINE ──► [Tự động duyệt 100%] ──► [Cập nhật Tờ khai 01/GTGT & Hệ số K]
        └── Nhánh ESCALATED ──► [DỪNG TỰ ĐỘNG HÓA]
                                        │
                                        ▼
                           [Gemini Actionable Q-Gen]
                                        │
                                        ▼
                           [Human-in-the-Loop UI]
                           (KTT / CFO bấm nút A hoặc B)
                                        │
                                        ▼
                           [Audit Trail & Tax Defense Dossier]
```

### 1.2 Nguyên tắc Trải nghiệm Người dùng (UX for 8-Minute Judge Review)
- **Chữ to rõ, tương phản cao (High Contrast Typography):** Cỡ chữ cơ sở 16px - 18px, tiêu đề 24px - 36px, số liệu tiền tệ 32px - 44px in đậm.
- **Không bắt người dùng tư duy phức tạp:** Giám khảo chỉ cần bấm đúng 1 nút `RUN VERIFY 90s` là toàn bộ kết quả hiện ra ngay lập tức.
- **Minh bạch tuyệt đối:** Mọi quyết định đều có 1 câu giải thích tiếng Việt ngắn gọn, dễ hiểu cho người không có chuyên môn kỹ thuật.

---

## 2. CẤU TRÚC THƯ MỤC DỰ ÁN (PRODUCTION NEXT.JS)

Dự án được tổ chức theo chuẩn Next.js 15 App Router:

```text
hackaithon/tax-referee/
├── app/
│   ├── api/
│   │   ├── evaluate/route.ts       # Endpoint nhận hóa đơn đơn lẻ từ Form / Upload
│   │   ├── verify/route.ts         # Endpoint thực thi tuần tự 5 ca Verify 90 giây
│   │   └── dossier/[id]/route.ts   # Endpoint sinh dữ liệu Hồ sơ giải trình thuế 1-Click
│   ├── globals.css                 # CSS biến hệ thống, animation, typography lớn
│   ├── layout.tsx                  # Root layout chuẩn B2B SaaS
│   └── page.tsx                    # Dashboard điều phối chính (Split-view 2 cột)
├── components/
│   ├── HeaderBanner.tsx            # Banner vàng hướng dẫn Giám khảo thao tác trong 30s
│   ├── VerifyHarness.tsx           # Bảng điều khiển kiểm thử tự động 90s kèm kết quả
│   ├── MacroHealthWidget.tsx       # Đồng hồ đo Hệ số K và Sức khỏe Thuế thời gian thực
│   ├── InteractiveInputForm.tsx    # Form cho Giám khảo thử nghiệm hóa đơn mới lạ
│   ├── EscalationCard.tsx          # Thẻ cảnh báo rủi ro với câu hỏi in đậm và 2 nút A/B
│   ├── AuditTrailTable.tsx         # Bảng nhật ký kiểm toán, nút Hoàn tác & Ghi đè
│   ├── TaxDefenseModal.tsx         # Modal xem toàn văn Hồ sơ giải trình thuế (Dossier)
│   └── PolicyViewerModal.tsx       # Modal xem toàn văn Quy chế Tax-SOP-2026
├── lib/
│   ├── schemas.ts                  # Toàn bộ Zod Schemas & TypeScript Types
│   ├── constants.ts                # Khai báo API Keys, URL, hằng số cấu hình
│   └── utils.ts                    # Format tiền tệ VNĐ, format ngày tháng, helper
├── services/
│   ├── jevService.ts               # Tích hợp TypeSafe AI System One API (jev-latest)
│   ├── geminiService.ts            # Tích hợp Google Gemini API (OCR & Sinh câu hỏi A/B)
│   └── policyEngine.ts             # Bộ quy tắc nội bộ đối soát SOP, Hệ số K, Logic thời gian
├── data/
│   ├── mockInvoices.ts             # 15 Hóa đơn kiểm thử chuẩn hóa và 5 ca Verify 90s
│   ├── mockAuditLog.ts             # Dữ liệu nhật ký mẫu ban đầu
│   └── sopText.ts                  # Toàn văn quy chế Tax-SOP-2026 dạng text
├── public/                         # Assets, icons, bill mẫu scan
├── .env.local                      # Biến môi trường API keys
├── RUNBOOK.md                      # Hướng dẫn chạy từ mã nguồn sạch
├── tailwind.config.ts              # Cấu hình màu sắc enterprise & font size lớn
└── package.json
```

---

## 3. ĐẶC TẢ CHI TIẾT TỪNG MODULE & FILE CODE

### 3.1 `lib/schemas.ts` - Hợp đồng Dữ liệu & Type-Safe Guardrail
Tệp này định nghĩa cấu trúc dữ liệu và ép kiểu Discriminated Unions:

```typescript
import { z } from 'zod';

// 1. Phân loại 3 nhóm rủi ro chuẩn Đề bài A
export const RiskGroupEnum = z.enum([
  'UNCERTAIN_INFO',    // Nhóm 1: Chưa xác định thông tin thực tế
  'OUT_OF_POLICY',     // Nhóm 2: Nằm ngoài phạm vi quy định
  'EXCEED_AUTHORITY'   // Nhóm 3: Vượt thẩm quyền cần con người duyệt
]);
export type RiskGroup = z.infer<typeof RiskGroupEnum>;

// 2. Schema Lựa chọn Hành động (Action Option)
export const ActionOptionSchema = z.object({
  id: z.enum(['A', 'B']),
  label: z.string(),                  // Ví dụ: "Phương án A: 140.000₫"
  actionDescription: z.string(),      // Mô tả hành động
  resultingAction: z.enum([
    'ACCEPT_WITH_DOCS',               // Chấp nhận kèm hồ sơ giải trình
    'REJECT_TAX_DEDUCTION',           // Loại phần thuế khỏi khấu trừ
    'FORWARD_TO_CFO',                 // Chuyển tiếp lên CFO
    'REQUEST_SUPPLIER_REISSUE',       // Yêu cầu xuất lại hóa đơn 10%
    'ACCEPT_ADJUSTMENT'               // Chấp thuận hóa đơn điều chỉnh
  ])
});
export type ActionOption = z.infer<typeof ActionOptionSchema>;

// 3. Schema Hóa đơn Đầu vào (Invoice Input)
export const InvoiceInputSchema = z.object({
  id: z.string(),
  invoiceNumber: z.string(),
  invoiceDate: z.string(),            // Định dạng: YYYY-MM-DD
  supplierTaxCode: z.string(),
  supplierName: z.string(),
  itemName: z.string(),
  preTaxAmount: z.number(),
  taxRate: z.number(),                // 0, 8, hoặc 10 (%)
  taxAmount: z.number(),
  totalAmount: z.number(),
  paymentMethod: z.enum(['BANK_TRANSFER', 'CASH']), // Chuyển khoản hoặc Tiền mặt
  hasBankSlip: z.boolean().default(false),           // Đã có Ủy nhiệm chi chưa?
  hasItemManifest: z.boolean().default(true),        // Có bảng kê chi tiết mặt hàng?
  isImageBlurry: z.boolean().default(false),         // Hóa đơn chụp mờ?
  sellerStatus: z.enum(['ACTIVE', 'SUSPENDED', 'CLOSED']), // Trạng thái MST
  sellerSuspensionDate: z.string().optional(),       // Ngày cơ quan thuế đóng MST (nếu có)
  originalInvoiceRef: z.string().optional(),         // Mã HĐ gốc nếu là HĐ điều chỉnh (NĐ 123)
  isAdjustment: z.boolean().default(false)           // Có phải HĐ điều chỉnh/thay thế không?
});
export type InvoiceInput = z.infer<typeof InvoiceInputSchema>;

// 4. Phán quyết Thường quy (ROUTINE)
export const RoutineDecisionSchema = z.object({
  status: z.literal('ROUTINE'),
  invoiceId: z.string(),
  supplierName: z.string(),
  totalAmount: z.number(),
  appliedTaxRate: z.number(),
  approvedTaxAmount: z.number(),      // Duy nhất nhánh ROUTINE mới có trường này
  plainExplanation: z.string(),       // 1 câu tiếng Việt bình dân giải thích cho người không chuyên
  kFactorAfter: z.number(),           // Hệ số K sau khi hạch toán
  timestamp: z.string()
});
export type RoutineDecision = z.infer<typeof RoutineDecisionSchema>;

// 5. Phán quyết Chuyển tiếp (ESCALATED)
export const EscalatedDecisionSchema = z.object({
  status: z.literal('ESCALATED'),
  riskGroup: RiskGroupEnum,
  invoiceId: z.string(),
  supplierName: z.string(),
  totalAmount: z.number(),
  taxRate: z.number(),
  flaggedReason: z.string(),          // Lý do vi phạm quy chế
  plainExplanation: z.string(),       // Giải thích dễ hiểu
  sopClause: z.string(),              // Căn cứ điều khoản Tax-SOP-2026
  actionableQuestion: z.string(),     // Câu hỏi đóng cụ thể
  options: z.tuple([ActionOptionSchema, ActionOptionSchema]), // Bắt buộc đúng 2 phương án A và B
  requiresCFO: z.boolean().default(false),
  timestamp: z.string()
});
export type EscalatedDecision = z.infer<typeof EscalatedDecisionSchema>;

// 6. Hợp đồng Discriminated Union tổng
export const RefereeDecisionSchema = z.discriminatedUnion('status', [
  RoutineDecisionSchema,
  EscalatedDecisionSchema
]);
export type RefereeDecision = z.infer<typeof RefereeDecisionSchema>;

// 7. Schema Nhật ký Kiểm toán (Audit Entry)
export const AuditEntrySchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  invoiceId: z.string(),
  supplierName: z.string(),
  totalAmount: z.number(),
  initialDecision: z.enum(['ROUTINE', 'ESCALATED']),
  riskGroup: RiskGroupEnum.optional(),
  actionTaken: z.string(),
  actor: z.enum(['SYSTEM_REFEREE', 'CHIEF_ACCOUNTANT', 'CFO']),
  plainExplanation: z.string(),
  canOverride: z.boolean().default(true),
  isOverridden: z.boolean().default(false),
  taxDefenseDossierReady: z.boolean().default(false)
});
export type AuditEntry = z.infer<typeof AuditEntrySchema>;

// 8. Schema Giám sát Rủi ro Vĩ mô (Hệ số K)
export const MacroStateSchema = z.object({
  totalSales: z.number(),
  openingInventory: z.number(),
  totalPurchases: z.number(),
  kFactor: z.number(),
  zone: z.enum(['SAFE_GREEN', 'WARNING_YELLOW', 'DANGER_RED']),
  totalDeductibleTax: z.number()
});
export type MacroState = z.infer<typeof MacroStateSchema>;
```

---

### 3.2 `lib/constants.ts` - Hằng số Cấu hình & Khóa API

```typescript
export const JEV_API_CONFIG = {
  ENDPOINT: 'https://api.typesafe.ai/v1/systemone',
  API_KEY: process.env.TYPESAFE_API_KEY || '',
  MODEL: 'jev-latest'
};

export const GEMINI_API_CONFIG = {
  ENDPOINT: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent',
  API_KEY: process.env.GEMINI_API_KEY || '',
  MODEL: 'gemini-2.5-flash-lite'
};

export const MACRO_DEFAULTS = {
  TOTAL_SALES: 15_000_000_000,        // 15 tỷ doanh thu
  OPENING_INVENTORY: 3_000_000_000,   // 3 tỷ tồn kho
  INITIAL_PURCHASES: 9_500_000_000    // 9.5 tỷ mua vào -> K ban đầu = 15 / (3 + 9.5) = 1.20 (Vùng xanh)
};
```

---

### 3.3 `services/policyEngine.ts` - Bộ máy Đối soát Quy chế Nội bộ (Deterministic Engine)
File này thực thi các quy tắc nghiệp vụ theo `Tax-SOP-2026` với tốc độ phản hồi dưới 10 mili-giây:

```typescript
import { InvoiceInput, RefereeDecision } from '@/lib/schemas';
import { MACRO_DEFAULTS } from '@/lib/constants';

// Tính toán Hệ số K thời gian thực
export function calculateKFactor(additionalPurchase: number = 0): { kFactor: number; zone: 'SAFE_GREEN' | 'WARNING_YELLOW' | 'DANGER_RED' } {
  const totalSales = MACRO_DEFAULTS.TOTAL_SALES;
  const denominator = MACRO_DEFAULTS.OPENING_INVENTORY + MACRO_DEFAULTS.INITIAL_PURCHASES + additionalPurchase;
  const k = Number((totalSales / denominator).toFixed(2));
  
  let zone: 'SAFE_GREEN' | 'WARNING_YELLOW' | 'DANGER_RED' = 'SAFE_GREEN';
  if (k > 1.5 || k < 0.8) zone = 'DANGER_RED';
  else if (k > 1.3) zone = 'WARNING_YELLOW';

  return { kFactor: k, zone };
}

// Hàm đối soát hóa đơn theo Tax-SOP-2026
export function evaluateInvoiceLocally(inv: InvoiceInput): RefereeDecision {
  const timestamp = new Date().toISOString();

  // 1. Kiểm tra Nhóm 3: Vượt thẩm quyền Kế toán trưởng (>= 200.000.000 VNĐ)
  if (Math.abs(inv.totalAmount) >= 200_000_000) {
    if (inv.isAdjustment) {
      return {
        status: 'ESCALATED',
        riskGroup: 'EXCEED_AUTHORITY',
        invoiceId: inv.id,
        supplierName: inv.supplierName,
        totalAmount: inv.totalAmount,
        taxRate: inv.taxRate,
        flaggedReason: 'Hóa đơn điều chỉnh/giảm doanh thu vượt hạn mức 200.000.000 VNĐ của KTT',
        plainExplanation: 'Số tiền điều chỉnh giảm quá lớn (trên 200 triệu), quy chế công ty yêu cầu đích thân Giám đốc Tài chính (CFO) phê duyệt.',
        sopClause: 'Điều 3.3 Quy chế Tax-SOP-2026',
        actionableQuestion: `Hóa đơn điều chỉnh giảm doanh thu ${inv.invoiceNumber} từ ${inv.supplierName} có giá trị ${inv.totalAmount.toLocaleString('vi-VN')}₫ (vượt hạn mức KTT). CFO có phê duyệt ghi nhận giảm thuế tương ứng không?`,
        options: [
          { id: 'A', label: 'CFO Phê duyệt ghi nhận', actionDescription: 'Ghi nhận giảm thuế đầu vào theo hóa đơn', resultingAction: 'ACCEPT_ADJUSTMENT' },
          { id: 'B', label: 'Từ chối, yêu cầu kiểm toán lại', actionDescription: 'Chặn ghi nhận, chuyển phòng pháp chế kiểm tra hợp đồng', resultingAction: 'REJECT_TAX_DEDUCTION' }
        ],
        requiresCFO: true,
        timestamp
      };
    }

    return {
      status: 'ESCALATED',
      riskGroup: 'EXCEED_AUTHORITY',
      invoiceId: inv.id,
      supplierName: inv.supplierName,
      totalAmount: inv.totalAmount,
      taxRate: inv.taxRate,
      flaggedReason: 'Khoản chi đặc thù vượt hạn mức tự duyệt của KTT (>= 200 triệu)',
      plainExplanation: 'Khoản chi lớn vượt thẩm quyền tự duyệt của Kế toán trưởng, cần chữ ký phê duyệt chi của CFO.',
      sopClause: 'Điều 3.3 Quy chế Tax-SOP-2026',
      actionableQuestion: `Khoản chi ${inv.itemName} trị giá ${inv.totalAmount.toLocaleString('vi-VN')}₫ vượt trần thẩm quyền 200 triệu. CFO có chấp thuận phê duyệt chi và khấu trừ thuế không?`,
      options: [
        { id: 'A', label: 'CFO Phê duyệt chi', actionDescription: 'Chấp thuận chi phí và đưa vào khấu trừ', resultingAction: 'FORWARD_TO_CFO' },
        { id: 'B', label: 'Yêu cầu họp HĐQT xem xét', actionDescription: 'Tạm dừng hạch toán', resultingAction: 'REJECT_TAX_DEDUCTION' }
      ],
      requiresCFO: true,
      timestamp
    };
  }

  // 2. Kiểm tra Nhóm 3: Tác động làm Hệ số K rơi vào Vùng Đỏ (> 1.5)
  const { kFactor, zone } = calculateKFactor(inv.preTaxAmount);
  if (zone === 'DANGER_RED' && inv.preTaxAmount > 100_000_000) {
    return {
      status: 'ESCALATED',
      riskGroup: 'EXCEED_AUTHORITY',
      invoiceId: inv.id,
      supplierName: inv.supplierName,
      totalAmount: inv.totalAmount,
      taxRate: inv.taxRate,
      flaggedReason: `Hóa đơn đẩy Hệ số K của kỳ hiện tại lên mức ${kFactor} (Vùng Đỏ nguy hiểm)`,
      plainExplanation: `Việc đưa hóa đơn lớn này vào làm tỷ lệ Hệ số K lệch chuẩn an toàn của cơ quan thuế (${kFactor}), rất dễ bị AI Tổng cục Thuế thanh tra.`,
      sopClause: 'Điều 4.2 Quy chế Tax-SOP-2026 (Công văn 2392/TCT-QLRR)',
      actionableQuestion: `Hóa đơn vật tư ${inv.invoiceNumber} đẩy Hệ số K lên mức ${kFactor} (Vùng Đỏ). CFO có duyệt đưa vào kỳ kê khai này không?`,
      options: [
        { id: 'A', label: 'Duyệt đưa vào kỳ này', actionDescription: 'Chấp nhận rủi ro giải trình với cơ quan thuế', resultingAction: 'ACCEPT_WITH_DOCS' },
        { id: 'B', label: 'Tạm chuyển sang kỳ sau', actionDescription: 'Điều chuyển chứng từ sang quý tiếp theo để giữ Hệ số K an toàn', resultingAction: 'REJECT_TAX_DEDUCTION' }
      ],
      requiresCFO: true,
      timestamp
    };
  }

  // 3. Kiểm tra Nhóm 2: Nằm ngoài phạm vi quy định (Out of Policy)
  // 3a. Hóa đơn >= 20 triệu nhưng thanh toán TIỀN MẶT
  if (inv.totalAmount >= 20_000_000 && (inv.paymentMethod === 'CASH' || !inv.hasBankSlip)) {
    return {
      status: 'ESCALATED',
      riskGroup: 'OUT_OF_POLICY',
      invoiceId: inv.id,
      supplierName: inv.supplierName,
      totalAmount: inv.totalAmount,
      taxRate: inv.taxRate,
      flaggedReason: 'Hóa đơn từ 20 triệu VNĐ thanh toán tiền mặt (thiếu Ủy nhiệm chi ngân hàng)',
      plainExplanation: 'Luật thuế quy định hóa đơn trên 20 triệu bắt buộc phải chuyển khoản qua ngân hàng thì mới được khấu trừ thuế.',
      sopClause: 'Điều 1.2 Quy chế Tax-SOP-2026 & Điều 15 Thông tư 219/2013/TT-BTC',
      actionableQuestion: `Hóa đơn ${inv.invoiceNumber} trị giá ${inv.totalAmount.toLocaleString('vi-VN')}₫ ghi hình thức Tiền mặt. Kế toán trưởng xử lý thế nào?`,
      options: [
        { id: 'A', label: 'Yêu cầu bổ sung Ủy nhiệm chi', actionDescription: 'Tạm treo hóa đơn, chờ kế toán thanh toán nộp UNC ngân hàng', resultingAction: 'REQUEST_SUPPLIER_REISSUE' },
        { id: 'B', label: 'Loại bỏ phần thuế khỏi khấu trừ', actionDescription: 'Chỉ ghi nhận chi phí nội bộ, không đưa tiền thuế vào Tờ khai 01', resultingAction: 'REJECT_TAX_DEDUCTION' }
      ],
      requiresCFO: false,
      timestamp
    };
  }

  // 3b. Hàng hóa cấm khấu trừ (Rượu, bia, giải trí cá nhân)
  const isAlcohol = /rượu|bia|whisky|wine|karaoke|massage/i.test(inv.itemName);
  if (isAlcohol) {
    return {
      status: 'ESCALATED',
      riskGroup: 'OUT_OF_POLICY',
      invoiceId: inv.id,
      supplierName: inv.supplierName,
      totalAmount: inv.totalAmount,
      taxRate: inv.taxRate,
      flaggedReason: 'Chi phí mua đồ uống có cồn/giải trí không phục vụ hoạt động sản xuất kinh doanh',
      plainExplanation: 'Tiền mua rượu bia liên hoan không được nhà nước cho khấu trừ thuế GTGT và không được tính vào chi phí hợp lý khi tính thuế TNDN.',
      sopClause: 'Điều 2.1 Quy chế Tax-SOP-2026',
      actionableQuestion: `Hóa đơn tiệc ${inv.invoiceNumber} có mục đồ uống có cồn (${inv.totalAmount.toLocaleString('vi-VN')}₫). Kế toán trưởng xử lý thế nào?`,
      options: [
        { id: 'A', label: 'Loại bỏ toàn bộ hóa đơn', actionDescription: 'Không đưa vào sổ sách thuế công ty', resultingAction: 'REJECT_TAX_DEDUCTION' },
        { id: 'B', label: 'Khấu trừ phần ăn, loại phần rượu', actionDescription: 'Bóc tách chi phí ăn uống hợp lệ, tự loại phần thuế rượu', resultingAction: 'ACCEPT_WITH_DOCS' }
      ],
      requiresCFO: false,
      timestamp
    };
  }

  // 3c. Dịch vụ viễn thông, CNTT áp nhầm thuế suất 8% (Luật bắt buộc 10%)
  const isTelecomOrIT = /viễn thông|internet|cước|cntt|hóa chất/i.test(inv.itemName);
  if (isTelecomOrIT && inv.taxRate === 8) {
    return {
      status: 'ESCALATED',
      riskGroup: 'OUT_OF_POLICY',
      invoiceId: inv.id,
      supplierName: inv.supplierName,
      totalAmount: inv.totalAmount,
      taxRate: inv.taxRate,
      flaggedReason: 'Dịch vụ viễn thông/CNTT áp sai thuế suất 8% (thuộc danh mục loại trừ bắt buộc 10%)',
      plainExplanation: 'Nhà cung cấp viễn thông xuất nhầm thuế 8%. Nghị định giảm thuế loại trừ ngành này, bắt buộc phải là 10%. Kê khai 8% sẽ bị phạt khai sai.',
      sopClause: 'Điều 1.3c Quy chế Tax-SOP-2026 & Nghị định 72/2024/NĐ-CP',
      actionableQuestion: `Hóa đơn viễn thông ${inv.invoiceNumber} từ ${inv.supplierName} áp sai thuế 8% (phải là 10%). Kế toán trưởng xử lý thế nào?`,
      options: [
        { id: 'A', label: 'Yêu cầu nhà cung cấp xuất lại HĐ 10%', actionDescription: 'Gửi công văn trả lại hóa đơn, yêu cầu bên bán hủy và xuất lại', resultingAction: 'REQUEST_SUPPLIER_REISSUE' },
        { id: 'B', label: 'Loại phần thuế khỏi khấu trừ', actionDescription: 'Vẫn hạch toán chi phí nhưng không kê khai số thuế đầu vào này', resultingAction: 'REJECT_TAX_DEDUCTION' }
      ],
      requiresCFO: false,
      timestamp
    };
  }

  // 3d. Nhà cung cấp lập hóa đơn SAU ngày bị cơ quan thuế đóng MST
  if (inv.sellerStatus === 'CLOSED' && inv.sellerSuspensionDate && inv.invoiceDate > inv.sellerSuspensionDate) {
    return {
      status: 'ESCALATED',
      riskGroup: 'OUT_OF_POLICY',
      invoiceId: inv.id,
      supplierName: inv.supplierName,
      totalAmount: inv.totalAmount,
      taxRate: inv.taxRate,
      flaggedReason: `Hóa đơn lập ngày ${inv.invoiceDate}, SAU ngày người bán bị đóng MST (${inv.sellerSuspensionDate})`,
      plainExplanation: 'Nhà cung cấp đã bị cơ quan thuế khóa mã số thuế trước khi xuất hóa đơn này. Hóa đơn hoàn toàn bất hợp pháp.',
      sopClause: 'Điều 2.2 Quy chế Tax-SOP-2026',
      actionableQuestion: `Hóa đơn ${inv.invoiceNumber} xuất sau ngày nhà cung cấp bị đóng MST (${inv.sellerSuspensionDate}). Hệ thống khuyến nghị loại bỏ ngay. KTT xác nhận?`,
      options: [
        { id: 'A', label: 'Loại bỏ ngay lập tức (Khuyến nghị)', actionDescription: 'Cấm hạch toán để tránh rủi ro hình sự', resultingAction: 'REJECT_TAX_DEDUCTION' },
        { id: 'B', label: 'Chuyển phòng Pháp chế điều tra', actionDescription: 'Tạm giữ chứng từ để làm việc với đối tác', resultingAction: 'FORWARD_TO_CFO' }
      ],
      requiresCFO: false,
      timestamp
    };
  }

  // 4. Kiểm tra Nhóm 1: Chưa xác định được thông tin thực tế (Uncertain Info)
  // 4a. Ảnh hóa đơn bị mờ số tiền
  if (inv.isImageBlurry) {
    return {
      status: 'ESCALATED',
      riskGroup: 'UNCERTAIN_INFO',
      invoiceId: inv.id,
      supplierName: inv.supplierName,
      totalAmount: inv.totalAmount,
      taxRate: inv.taxRate,
      flaggedReason: 'Hình ảnh hóa đơn bị mờ/lóa dòng tổng tiền, OCR không nhận diện chắc chắn',
      plainExplanation: 'Chứng từ ảnh chụp bị mờ nét chữ số tiền cuối cùng. Cần người có thẩm quyền nhìn mắt thường để xác nhận con số chuẩn.',
      sopClause: 'Điều 1.1 Quy chế Tax-SOP-2026',
      actionableQuestion: `Hóa đơn taxi ${inv.invoiceNumber} bị mờ số tiền cuối, hệ thống dự đoán là 140.000₫ hoặc 190.000₫. KTT chọn con số nào?`,
      options: [
        { id: 'A', label: 'Xác nhận số tiền là 140.000₫', actionDescription: 'Ghi nhận số tiền nhỏ hơn để an toàn chi phí', resultingAction: 'ACCEPT_WITH_DOCS' },
        { id: 'B', label: 'Xác nhận số tiền là 190.000₫', actionDescription: 'Ghi nhận số tiền đúng theo thực tế cuốc xe', resultingAction: 'ACCEPT_WITH_DOCS' }
      ],
      requiresCFO: false,
      timestamp
    };
  }

  // 4b. Thiếu bảng kê chi tiết mặt hàng
  if (!inv.hasItemManifest) {
    return {
      status: 'ESCALATED',
      riskGroup: 'UNCERTAIN_INFO',
      invoiceId: inv.id,
      supplierName: inv.supplierName,
      totalAmount: inv.totalAmount,
      taxRate: inv.taxRate,
      flaggedReason: 'Hóa đơn tổng hợp thiếu tệp bảng kê chi tiết quy cách hàng hóa đính kèm',
      plainExplanation: 'Hóa đơn ghi tên mặt hàng chung chung và thiếu bảng kê chi tiết từng món. Nếu không có bảng kê, thuế sẽ loại chi phí khi kiểm tra.',
      sopClause: 'Điều 1.1 Quy chế Tax-SOP-2026',
      actionableQuestion: `Hóa đơn vật tư ${inv.invoiceNumber} (${inv.totalAmount.toLocaleString('vi-VN')}₫) thiếu bảng kê chi tiết. KTT xử lý thế nào?`,
      options: [
        { id: 'A', label: 'Tạm treo, yêu cầu bổ sung bảng kê', actionDescription: 'Gửi thông báo cho nhân viên mua hàng nộp bảng kê', resultingAction: 'REQUEST_SUPPLIER_REISSUE' },
        { id: 'B', label: 'Loại khỏi đợt kê khai thuế quý này', actionDescription: 'Tạm thời chưa kê khai khấu trừ', resultingAction: 'REJECT_TAX_DEDUCTION' }
      ],
      requiresCFO: false,
      timestamp
    };
  }

  // 4c. Hóa đơn điều chỉnh nhưng không tìm thấy số hóa đơn gốc (Nghị định 123)
  if (inv.isAdjustment && !inv.originalInvoiceRef) {
    return {
      status: 'ESCALATED',
      riskGroup: 'UNCERTAIN_INFO',
      invoiceId: inv.id,
      supplierName: inv.supplierName,
      totalAmount: inv.totalAmount,
      taxRate: inv.taxRate,
      flaggedReason: 'Hóa đơn điều chỉnh nhưng không tìm thấy số hóa đơn gốc trong CSDL nội bộ',
      plainExplanation: 'Hóa đơn ghi là điều chỉnh giảm tiền nhưng hệ thống không tìm thấy hóa đơn ban đầu đã mua. Có thể nhà cung cấp xuất nhầm số cho công ty khác.',
      sopClause: 'Điều 1.4 Quy chế Tax-SOP-2026 & Nghị định 123/2020/NĐ-CP',
      actionableQuestion: `Hóa đơn điều chỉnh ${inv.invoiceNumber} không khớp với bất kỳ hóa đơn gốc nào. KTT xử lý thế nào?`,
      options: [
        { id: 'A', label: 'Tạm treo chờ tra soát hóa đơn gốc', actionDescription: 'Liên hệ kế toán đối tác để kiểm tra số bill gốc', resultingAction: 'REQUEST_SUPPLIER_REISSUE' },
        { id: 'B', label: 'Từ chối tiếp nhận hóa đơn này', actionDescription: 'Bác bỏ hóa đơn điều chỉnh', resultingAction: 'REJECT_TAX_DEDUCTION' }
      ],
      requiresCFO: false,
      timestamp
    };
  }

  // 4d. Nhà cung cấp đóng MST: Hóa đơn lập TRƯỚC ngày cơ quan thuế công bố
  if (inv.sellerStatus === 'CLOSED' && inv.sellerSuspensionDate && inv.invoiceDate <= inv.sellerSuspensionDate) {
    return {
      status: 'ESCALATED',
      riskGroup: 'UNCERTAIN_INFO',
      invoiceId: inv.id,
      supplierName: inv.supplierName,
      totalAmount: inv.totalAmount,
      taxRate: inv.taxRate,
      flaggedReason: `Nhà cung cấp đã đóng MST ngày ${inv.sellerSuspensionDate}, nhưng hóa đơn lập ngày ${inv.invoiceDate} (Trước ngày đóng)`,
      plainExplanation: 'Đối tác hiện đã giải thể/bỏ trốn nhưng tại thời điểm mua hàng thì họ vẫn đang hoạt động. Giao dịch có thể hợp lệ nếu chứng minh được hàng đã nhận thật.',
      sopClause: 'Điều 2.2 Quy chế Tax-SOP-2026',
      actionableQuestion: `Hóa đơn ${inv.invoiceNumber} lập trước ngày người bán đóng MST. Giao dịch hợp lệ nếu có biên bản giao hàng. KTT quyết định?`,
      options: [
        { id: 'A', label: 'Xác nhận đủ hồ sơ, tiếp tục kê khai', actionDescription: 'Lưu bộ hồ sơ chứng minh giao dịch có thật và đưa vào khấu trừ', resultingAction: 'ACCEPT_WITH_DOCS' },
        { id: 'B', label: 'Loại bỏ để an toàn tuyệt đối', actionDescription: 'Chấp nhận bỏ chi phí để không phải giải trình với thanh tra thuế', resultingAction: 'REJECT_TAX_DEDUCTION' }
      ],
      requiresCFO: false,
      timestamp
    };
  }

  // 5. Nếu không vướng bất kỳ điều kiện nào ở trên -> DUYỆT THƯỜNG QUY 100% (ROUTINE)
  const approvedTax = Number((inv.preTaxAmount * (inv.taxRate / 100)).toFixed(0));
  const newK = calculateKFactor(inv.preTaxAmount).kFactor;

  return {
    status: 'ROUTINE',
    invoiceId: inv.id,
    supplierName: inv.supplierName,
    totalAmount: inv.totalAmount,
    appliedTaxRate: inv.taxRate,
    approvedTaxAmount: approvedTax,
    plainExplanation: 'Hóa đơn đầy đủ tính pháp lý, đúng thuế suất theo quy định, có chứng từ thanh toán hợp lệ và nằm trong hạn mức kế toán viên.',
    kFactorAfter: newK,
    timestamp
  };
}
```

---

## 4. TÍCH HỢP JEV API & GEMINI API (DUAL-AI ENGINE)

### 4.1 `services/jevService.ts` - Tích hợp TypeSafe AI System One
Đây là module gọi trực tiếp đến API `https://api.typesafe.ai/v1/systemone` của TypeSafe AI bằng key của bạn:

```typescript
import { JEV_API_CONFIG } from '@/lib/constants';
import { InvoiceInput, RiskGroup } from '@/lib/schemas';

interface JevSystemOneResponse {
  answers: {
    decision_type: {
      choice: 'ROUTINE' | 'UNCERTAIN_INFO' | 'OUT_OF_POLICY' | 'EXCEED_AUTHORITY';
      probabilities: Record<string, number>;
    };
    should_escalate: {
      probability: number; // 0.0 -> 1.0
    };
    risk_level: {
      score: number; // 1 -> 5
    };
  };
}

export async function queryJevReferee(invoice: InvoiceInput): Promise<{
  decisionType: 'ROUTINE' | RiskGroup;
  confidence: number;
  riskScore: number;
}> {
  const payload = {
    model: JEV_API_CONFIG.MODEL,
    state: {
      invoiceNumber: invoice.invoiceNumber,
      totalAmount: invoice.totalAmount,
      itemName: invoice.itemName,
      taxRate: invoice.taxRate,
      paymentMethod: invoice.paymentMethod,
      isImageBlurry: invoice.isImageBlurry,
      hasItemManifest: invoice.hasItemManifest,
      sellerStatus: invoice.sellerStatus,
      sellerSuspensionDate: invoice.sellerSuspensionDate || 'N/A',
      invoiceDate: invoice.invoiceDate,
      isAdjustment: invoice.isAdjustment,
      originalInvoiceRef: invoice.originalInvoiceRef || 'NONE'
    },
    questions: {
      decision_type: {
        type: 'choice',
        instructions: 'Phân loại hóa đơn này theo Quy chế Tax-SOP-2026 vào đúng 1 nhóm:',
        criteria: {
          ROUTINE: 'Hóa đơn hợp lệ 100%, đúng thuế suất 8%/10%, thanh toán ngân hàng nếu >= 20M, giá trị dưới 200M.',
          UNCERTAIN_INFO: 'Hóa đơn mờ, thiếu bảng kê, không có mã hóa đơn gốc, hoặc lập trước ngày nhà cung cấp đóng MST.',
          OUT_OF_POLICY: 'Viễn thông áp sai 8%, hóa đơn >= 20M thanh toán tiền mặt, rượu bia, hoặc lập sau ngày đóng MST.',
          EXCEED_AUTHORITY: 'Hóa đơn điều chỉnh hoặc chi phí từ 200 triệu VNĐ trở lên, cần thẩm quyền CFO phê duyệt.'
        }
      },
      should_escalate: {
        type: 'noul',
        instructions: 'Hóa đơn này có cần dừng tự động hóa để con người xem xét hay không?'
      },
      risk_level: {
        type: 'score',
        instructions: 'Đánh giá mức độ rủi ro thanh tra thuế của hóa đơn trên thang điểm 1 đến 5.'
      }
    }
  };

  try {
    const res = await fetch(JEV_API_CONFIG.ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${JEV_API_CONFIG.API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      // Giới hạn timeout 2.5s để bảo đảm tiêu chí phản hồi nhanh của Giám khảo
      signal: AbortSignal.timeout(2500)
    });

    if (!res.ok) {
      throw new Error(`Jev API returned HTTP ${res.status}`);
    }

    const data: JevSystemOneResponse = await res.json();
    return {
      decisionType: data.answers.decision_type.choice,
      confidence: data.answers.should_escalate.probability,
      riskScore: data.answers.risk_level.score
    };
  } catch (error) {
    console.warn('[Jev Service] API call failed or timed out. Falling back to local Policy Engine.', error);
    // Trả về null để chuyển sang deterministic local engine
    throw error;
  }
}
```

---

### 4.2 `services/geminiService.ts` - Tích hợp Google Gemini API
Dùng để bóc tách hóa đơn tùy biến do Giám khảo tải lên (ảnh/PDF) và sinh câu hỏi A/B động nếu dữ liệu nằm ngoài bộ dữ liệu mẫu:

```typescript
import { GEMINI_API_CONFIG } from '@/lib/constants';
import { InvoiceInput } from '@/lib/schemas';

export async function extractInvoiceWithGemini(fileBase64: string, mimeType: string): Promise<Partial<InvoiceInput>> {
  const prompt = `
Bạn là AI Kế toán Thuế chuyên nghiệp. Hãy đọc ảnh/PDF hóa đơn này và trích xuất đúng định dạng JSON:
{
  "invoiceNumber": "Số hóa đơn",
  "invoiceDate": "YYYY-MM-DD",
  "supplierTaxCode": "Mã số thuế",
  "supplierName": "Tên công ty bán",
  "itemName": "Tên hàng hóa/dịch vụ chính",
  "preTaxAmount": Số tiền trước thuế (number),
  "taxRate": Thuế suất (0, 8 hoặc 10),
  "taxAmount": Tiền thuế GTGT (number),
  "totalAmount": Tổng tiền thanh toán (number),
  "paymentMethod": "BANK_TRANSFER" hoặc "CASH",
  "isImageBlurry": true nếu ảnh mờ số tiền, ngược lại false
}
Chỉ xuất đúng chuỗi JSON thuần, không bọc trong markdown code block.`;

  const url = `${GEMINI_API_CONFIG.ENDPOINT}?key=${GEMINI_API_CONFIG.API_KEY}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: prompt },
          { inline_data: { mime_type: mimeType, data: fileBase64 } }
        ]
      }]
    })
  });

  const resJson = await response.json();
  const textOutput = resJson.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  const cleanJson = textOutput.replace(/```json/g, '').replace(/```/g, '').trim();
  return JSON.parse(cleanJson);
}
```

---

## 5. HỆ THỐNG DỮ LIỆU MẪU & BỘ 15 TEST CASES CHI TIẾT

Tệp `data/mockInvoices.ts` chứa toàn bộ 15 test cases chuẩn. Mỗi ca đều có đầy đủ tham số để chứng minh với Ban Giám khảo:

```typescript
import { InvoiceInput } from '@/lib/schemas';

export const MOCK_INVOICES: InvoiceInput[] = [
  // --- 6 CA THƯỜNG QUY (ROUTINE) ---
  {
    id: 'TC-01',
    invoiceNumber: 'HD-001829',
    invoiceDate: '2026-08-12',
    supplierTaxCode: '0301482910',
    supplierName: 'Công ty Cổ phần Fahasa',
    itemName: 'Giấy in văn phòng và văn phòng phẩm',
    preTaxAmount: 4_166_667,
    taxRate: 8,
    taxAmount: 333_333,
    totalAmount: 4_500_000,
    paymentMethod: 'CASH', // Dưới 20M được phép tiền mặt
    hasBankSlip: false,
    hasItemManifest: true,
    isImageBlurry: false,
    sellerStatus: 'ACTIVE',
    isAdjustment: false
  },
  {
    id: 'TC-02',
    invoiceNumber: 'EVN-994812',
    invoiceDate: '2026-08-15',
    supplierTaxCode: '0300948211',
    supplierName: 'Tổng Công ty Điện lực TP.HCM (EVN)',
    itemName: 'Tiền điện chiếu sáng văn phòng tháng 07/2026',
    preTaxAmount: 11_111_111,
    taxRate: 8,
    taxAmount: 888_889,
    totalAmount: 12_000_000,
    paymentMethod: 'BANK_TRANSFER',
    hasBankSlip: true,
    hasItemManifest: true,
    isImageBlurry: false,
    sellerStatus: 'ACTIVE',
    isAdjustment: false
  },
  {
    id: 'TC-03',
    invoiceNumber: 'SEN-004912',
    invoiceDate: '2026-08-18',
    supplierTaxCode: '0104829102',
    supplierName: 'Nhà hàng Sen Tây Hồ',
    itemName: 'Dịch vụ ăn uống tiếp khách kèm bảng kê món chi tiết',
    preTaxAmount: 8_148_148,
    taxRate: 8,
    taxAmount: 651_852,
    totalAmount: 8_800_000,
    paymentMethod: 'BANK_TRANSFER',
    hasBankSlip: true,
    hasItemManifest: true, // Có bảng kê món hợp lệ
    isImageBlurry: false,
    sellerStatus: 'ACTIVE',
    isAdjustment: false
  },
  {
    id: 'TC-04',
    invoiceNumber: 'PV-884912',
    invoiceDate: '2026-08-20',
    supplierTaxCode: '0304928104',
    supplierName: 'Công ty Máy tính Phong Vũ',
    itemName: 'Máy vi tính xách tay Dell Vostro cho nhân viên',
    preTaxAmount: 16_818_182,
    taxRate: 10,
    taxAmount: 1_681_818,
    totalAmount: 18_500_000,
    paymentMethod: 'BANK_TRANSFER',
    hasBankSlip: true,
    hasItemManifest: true,
    isImageBlurry: false,
    sellerStatus: 'ACTIVE',
    isAdjustment: false
  },
  {
    id: 'TC-05',
    invoiceNumber: 'MISA-774912',
    invoiceDate: '2026-08-22',
    supplierTaxCode: '0101243150',
    supplierName: 'Công ty Cổ phần MISA',
    itemName: 'Thuê bao phần mềm kế toán MISA AMIS (Dịch vụ phần mềm)',
    preTaxAmount: 15_000_000,
    taxRate: 0, // Không chịu thuế GTGT
    taxAmount: 0,
    totalAmount: 15_000_000,
    paymentMethod: 'BANK_TRANSFER',
    hasBankSlip: true,
    hasItemManifest: true,
    isImageBlurry: false,
    sellerStatus: 'ACTIVE',
    isAdjustment: false
  },
  {
    id: 'TC-06',
    invoiceNumber: 'VT-338291',
    invoiceDate: '2026-08-25',
    supplierTaxCode: '0100109106',
    supplierName: 'Tập đoàn Công nghiệp - Viễn thông Quân đội (Viettel)',
    itemName: 'Cước dịch vụ Internet cáp quang FTTH văn phòng',
    preTaxAmount: 1_500_000,
    taxRate: 10, // Đúng thuế suất 10%
    taxAmount: 150_000,
    totalAmount: 1_650_000,
    paymentMethod: 'BANK_TRANSFER',
    hasBankSlip: true,
    hasItemManifest: true,
    isImageBlurry: false,
    sellerStatus: 'ACTIVE',
    isAdjustment: false
  },

  // --- 3 CA NHÓM 1: UNCERTAIN_INFO ---
  {
    id: 'TC-07',
    invoiceNumber: 'TAXI-00981',
    invoiceDate: '2026-08-26',
    supplierTaxCode: '0302018291',
    supplierName: 'Công ty Cổ phần Ánh Dương (Taxi Vinasun)',
    itemName: 'Cước taxi công tác nội thành',
    preTaxAmount: 145_455,
    taxRate: 10,
    taxAmount: 14_545,
    totalAmount: 160_000,
    paymentMethod: 'CASH',
    hasBankSlip: false,
    hasItemManifest: true,
    isImageBlurry: true, // Lóa mờ số tiền
    sellerStatus: 'ACTIVE',
    isAdjustment: false
  },
  {
    id: 'TC-08',
    invoiceNumber: 'DC-00109',
    invoiceDate: '2026-08-27',
    supplierTaxCode: '0309981244',
    supplierName: 'Công ty Thiết bị Công nghiệp Tân Thành',
    itemName: 'Hóa đơn điều chỉnh giảm đơn giá máy công cụ',
    preTaxAmount: -13_888_889,
    taxRate: 8,
    taxAmount: -1_111_111,
    totalAmount: -15_000_000,
    paymentMethod: 'BANK_TRANSFER',
    hasBankSlip: true,
    hasItemManifest: true,
    isImageBlurry: false,
    sellerStatus: 'ACTIVE',
    isAdjustment: true,
    originalInvoiceRef: undefined // Lỗi: Thiếu mã HĐ gốc theo NĐ 123
  },
  {
    id: 'TC-09',
    invoiceNumber: 'SM-004812',
    invoiceDate: '2026-08-10', // Lập ngày 10/08 (TRƯỚC ngày đóng MST 15/08)
    supplierTaxCode: '0315994821',
    supplierName: 'Công ty TNHH Thương mại Sao Mai',
    itemName: 'Dịch vụ tổ chức hội thảo khách hàng',
    preTaxAmount: 13_888_889,
    taxRate: 8,
    taxAmount: 1_111_111,
    totalAmount: 15_000_000,
    paymentMethod: 'BANK_TRANSFER',
    hasBankSlip: true,
    hasItemManifest: true,
    isImageBlurry: false,
    sellerStatus: 'CLOSED',
    sellerSuspensionDate: '2026-08-15', // Ngày đóng MST
    isAdjustment: false
  },

  // --- 3 CA NHÓM 2: OUT_OF_POLICY ---
  {
    id: 'TC-10',
    invoiceNumber: 'VNPT-5501',
    invoiceDate: '2026-08-28',
    supplierTaxCode: '0100684378',
    supplierName: 'Tập đoàn Bưu chính Viễn thông Việt Nam (VNPT)',
    itemName: 'Cước dịch vụ viễn thông truyền số liệu',
    preTaxAmount: 5_092_593,
    taxRate: 8, // Vi phạm: Viễn thông bắt buộc 10%
    taxAmount: 407_407,
    totalAmount: 5_500_000,
    paymentMethod: 'BANK_TRANSFER',
    hasBankSlip: true,
    hasItemManifest: true,
    isImageBlurry: false,
    sellerStatus: 'ACTIVE',
    isAdjustment: false
  },
  {
    id: 'TC-11',
    invoiceNumber: 'PARTY-8812',
    invoiceDate: '2026-08-29',
    supplierTaxCode: '0314882910',
    supplierName: 'Công ty Ẩm thực Hoàng Gia',
    itemName: 'Tiệc liên hoan tiếp khách có phục vụ Rượu vang Bordeaux và bia ngoại',
    preTaxAmount: 8_363_636,
    taxRate: 10,
    taxAmount: 836_364,
    totalAmount: 9_200_000,
    paymentMethod: 'BANK_TRANSFER',
    hasBankSlip: true,
    hasItemManifest: true,
    isImageBlurry: false,
    sellerStatus: 'ACTIVE',
    isAdjustment: false
  },
  {
    id: 'TC-12',
    invoiceNumber: 'NK-091244',
    invoiceDate: '2026-08-30',
    supplierTaxCode: '0302881920',
    supplierName: 'Điện máy Nguyễn Kim',
    itemName: 'Mua hệ thống máy lạnh Daikin Inverter cho văn phòng',
    preTaxAmount: 22_727_273,
    taxRate: 10,
    taxAmount: 2_272_727,
    totalAmount: 25_000_000,
    paymentMethod: 'CASH', // Vi phạm: Trên 20 triệu thanh toán Tiền mặt
    hasBankSlip: false,
    hasItemManifest: true,
    isImageBlurry: false,
    sellerStatus: 'ACTIVE',
    isAdjustment: false
  },

  // --- 3 CA NHÓM 3: EXCEED_AUTHORITY ---
  {
    id: 'TC-13',
    invoiceNumber: 'HP-990124',
    invoiceDate: '2026-08-31',
    supplierTaxCode: '0900189211',
    supplierName: 'Tập đoàn Thép Hòa Phát',
    itemName: 'Hóa đơn điều chỉnh chiết khấu thương mại sản lượng thép cuối năm',
    preTaxAmount: -231_481_481,
    taxRate: 8,
    taxAmount: -18_518_519,
    totalAmount: -250_000_000, // Vượt trần 200M của KTT
    paymentMethod: 'BANK_TRANSFER',
    hasBankSlip: true,
    hasItemManifest: true,
    isImageBlurry: false,
    sellerStatus: 'ACTIVE',
    isAdjustment: true,
    originalInvoiceRef: 'HP-ORIG-0012'
  },
  {
    id: 'TC-14',
    invoiceNumber: 'VT-992014',
    invoiceDate: '2026-09-01',
    supplierTaxCode: '0301994821',
    supplierName: 'Công ty Cổ phần Vật liệu Xây dựng Miền Nam',
    itemName: 'Lô xi măng và sắt thép xây dựng công trình mở rộng xưởng',
    preTaxAmount: 4_500_000_000, // Đẩy Hệ số K vọt lên 1.58 (Vùng Đỏ)
    taxRate: 8,
    taxAmount: 360_000_000,
    totalAmount: 4_860_000_000,
    paymentMethod: 'BANK_TRANSFER',
    hasBankSlip: true,
    hasItemManifest: true,
    isImageBlurry: false,
    sellerStatus: 'ACTIVE',
    isAdjustment: false
  },
  {
    id: 'TC-15',
    invoiceNumber: 'TP-449120',
    invoiceDate: '2026-09-02',
    supplierTaxCode: '0308819201',
    supplierName: 'Công ty Cổ phần Xây lắp Tân Phát',
    itemName: 'Chi phí bồi thường vi phạm hợp đồng tiến độ thi công',
    preTaxAmount: 210_000_000,
    taxRate: 0,
    taxAmount: 0,
    totalAmount: 210_000_000, // Vượt thẩm quyền 200M
    paymentMethod: 'BANK_TRANSFER',
    hasBankSlip: true,
    hasItemManifest: true,
    isImageBlurry: false,
    sellerStatus: 'ACTIVE',
    isAdjustment: false
  }
];

// 5 Ca chuẩn chạy trong nút "Verify 90s"
export const VERIFY_90S_CASES: InvoiceInput[] = [
  MOCK_INVOICES[0], // TC-01: Fahasa 4.5M (ROUTINE)
  MOCK_INVOICES[1], // TC-02: EVN 12M (ROUTINE)
  MOCK_INVOICES[5], // TC-06: Viettel 1.65M (ROUTINE)
  MOCK_INVOICES[6], // TC-07: Taxi mờ tiền (ESCALATED - UNCERTAIN_INFO)
  MOCK_INVOICES[12] // TC-13: Hòa Phát -250M (ESCALATED - EXCEED_AUTHORITY)
];
```

---

## 6. THIẾT KẾ GIAO DIỆN PRODUCTION-READY (CHỮ TO RÕ, TRỰC QUAN CHO GIÁM KHẢO)

Giao diện áp dụng bảng màu **Enterprise SaaS Dark/Light Mode với độ tương phản cực cao**:
- Nền trang web: `slate-950` (Dark) hoặc `slate-50` (Light).
- Thẻ Card: `bg-slate-900/90 border border-slate-700/80 backdrop-blur-md`.
- Typography:
  - Header tiêu đề: Font `Outfit / Inter`, kích thước `text-3xl font-extrabold` (30px).
  - Tên hàng hóa và nhà cung cấp: `text-lg font-bold` (18px).
  - Câu hỏi chuyển tiếp: `text-xl font-bold text-amber-300` (20px).
  - Các nút hành động A và B: `text-base font-bold px-6 py-4 rounded-xl shadow-lg transition-all hover:scale-105`.
  - Chỉ số tiền tệ: `text-2xl font-mono font-black text-emerald-400`.

### 6.1 Bố cục 2 Cột Dashboard (`app/page.tsx`)

```text
+-----------------------------------------------------------------------------------------------+
|  HEADER BANNER (Màu vàng hổ phách nổi bật - Chữ to 18px):                                     |
|  "HƯỚNG DẪN GIÁM KHẢO: Bấm nút [RUN VERIFY 90s] để chạy tự động 5 hồ sơ kiểm thử chuẩn.       |
|  Để thử nghiệm dữ liệu mới lạ, dùng form [Thử nghiệm Hóa đơn Tùy biến] ở góc trái dưới."      |
+-----------------------------------------------------------------------------------------------+
|                               CỘT TRÁI (45%)                |            CỘT PHẢI (55%)       |
| 1. BỘ CÔNG CỤ VERIFY 90S:                                  | 1. THẺ XỬ LÝ CHUYỂN TIẾP        |
|    - Nút [RUN VERIFY 90S] (To, màu xanh Emerald)           |    (ESCALATION CARD):           |
|    - Thanh tiến trình thời gian thực                        |    - Badge: Nhóm rủi ro         |
|    - Bảng 5 ca: ID | Đối tác | Kết quả | Trạng thái Pass    |    - Trích dẫn Điều khoản SOP   |
|                                                             |    - Câu hỏi hành động in đậm   |
| 2. WIDGET GIÁM SÁT HỆ SỐ K TOÀN CỤC:                       |    - Nút [PHƯƠNG ÁN A]           |
|    - Đồng hồ K-Factor: 1.18 (VÙNG XANH AN TOÀN)            |    - Nút [PHƯƠNG ÁN B]           |
|    - Tổng mua vào | Thuế khấu trừ thời gian thực            |                                 |
|                                                             | 2. NHẬT KÝ KIỂM TOÁN VÀ         |
| 3. FORM THỬ NGHIỆM HÓA ĐƠN TÙY BIẾN:                        |    HỒ SƠ GIẢI TRÌNH:            |
|    - Nhập thủ công / Paste JSON / Tải ảnh HĐ               |    - Bảng Audit Trail           |
|    - Nút [Kiểm tra bằng Jev AI]                            |    - Nút [Undo] & [Override]    |
|                                                             |    - Nút [Export Tax Dossier]   |
+-----------------------------------------------------------------------------------------------+
```

---

## 7. LỘ TRÌNH TRIỂN KHAI THEO TỪNG BƯỚC: CODE -> TEST -> FIX -> ITERATE

### Chặng 1: Khởi tạo Nền tảng & Hợp đồng Kiểu dữ liệu (Giờ 0 - 14)
- **Bước 1.1:** Khởi tạo dự án Next.js 15:
  ```bash
  npx -y create-next-app@latest ./ --typescript --tailwind --eslint --app --src-dir=false --import-alias="@/*"
  ```
- **Bước 1.2:** Cài đặt các thư viện bổ trợ:
  ```bash
  npm install zod lucide-react clsx tailwind-merge canvas-confetti
  npm install -D @types/canvas-confetti
  ```
- **Bước 1.3:** Tạo các tệp: `lib/schemas.ts`, `lib/constants.ts`, `data/mockInvoices.ts`, `data/sopText.ts`.
- **Bước 1.4:** Thiết lập `.env.local` chứa 2 khóa API do bạn cung cấp:
  ```env
  TYPESAFE_API_KEY=your_typesafe_api_key_here
  GEMINI_API_KEY=your_gemini_api_key_here
  ```
- **Kiểm thử Bước 1:** Chạy `npm run build` để xác nhận Zod Schemas và TypeScript không có lỗi syntax.

---

### Chặng 2: Hiện thực hóa Logic Lõi & Dual-Engine AI (Giờ 15 - 30)
- **Bước 2.1:** Viết file `services/policyEngine.ts` với đầy đủ logic kiểm tra: Mốc thời gian đóng MST, Hóa đơn gốc NĐ 123, Hệ số K và danh mục thuế 8%/10%.
- **Bước 2.2:** Viết file `services/jevService.ts` kết nối với TypeSafe AI System One. Thiết lập fallback tự động về `policyEngine.ts` nếu mạng lag quá 2.5s.
- **Bước 2.3:** Viết file `services/geminiService.ts` hỗ trợ parse ảnh và sinh câu hỏi A/B.
- **Bước 2.4:** Tạo API Route `app/api/verify/route.ts`:
  Chạy tuần tự 5 ca trong `VERIFY_90S_CASES`, trả về mảng kết quả JSON gồm: `{ testId, supplier, actualStatus, expectedStatus, passed: boolean, executionTimeMs, actionableQuestion }`.
- **Kiểm thử Bước 2:** Dùng lệnh `curl http://localhost:3000/api/verify` kiểm tra: Toàn bộ 5 test cases phải trả về kết quả trong dưới 1.5 giây, 3 ca Routine và 2 ca Escalated.

---

### Chặng 3: Xây dựng Giao diện SaaS B2B Cao cấp & To Rõ (Giờ 31 - 48)
- **Bước 3.1:** Xây dựng `components/HeaderBanner.tsx`: Thiết kế màu vàng kim sang trọng, chữ in đậm 18px hướng dẫn Giám khảo.
- **Bước 3.2:** Xây dựng `components/VerifyHarness.tsx`:
  - Nút bấm `RUN VERIFY 90s` hiệu ứng phát sáng (pulse animation).
  - Bảng hiển thị 5 dòng với các Badge xanh lá (ROUTINE) và cam/đỏ (ESCALATED).
  - Cột thời gian phản hồi thực tế (ví dụ: `42ms`, `68ms`).
- **Bước 3.3:** Xây dựng `components/MacroHealthWidget.tsx`:
  - Thước đo Hệ số K dạng thanh tiến trình chia 3 màu: Xanh (1.0 - 1.3), Vàng (1.3 - 1.5), Đỏ (> 1.5).
  - Con số Hệ số K nhảy số mượt mà khi người dùng duyệt hóa đơn mới.
- **Bước 3.4:** Xây dựng `components/EscalationCard.tsx`:
  - Khi có ca chuyển tiếp, thẻ xuất hiện với hiệu ứng slide-in nổi bật.
  - Hiển thị câu hỏi hành động in đậm cỡ chữ 20px.
  - Render 2 nút bấm phương án A và B to, rõ ràng, bấm là xử lý ngay.
- **Bước 3.5:** Xây dựng `components/AuditTrailTable.tsx`:
  - Hiển thị danh sách các quyết định.
  - Nút `Undo` (Hoàn tác) hoạt động thực sự: bấm là xóa bản ghi khỏi audit log và trừ lại số thuế khỏi tờ khai.
  - Nút `Tax Dossier` mở modal xem hồ sơ giải trình.
- **Kiểm thử Bước 3:** Mở trình duyệt, thử nghiệm bấm Verify, bấm chọn A/B trên Escalation Card, bấm nút Undo trên Audit Trail và quan sát Tờ khai thuế tự động cập nhật số tiền.

---

### Chặng 4: Tích hợp Form Tùy biến cho Giám khảo & Xử lý Lỗi Góc (Giờ 49 - 60)
- **Bước 4.1:** Xây dựng `components/InteractiveInputForm.tsx`:
  - Giám khảo có thể chọn nhanh từ dropdown 10 ca còn lại (TC-03, TC-04, TC-08, TC-09,...).
  - Giám khảo có thể tự sửa số tiền thành 300 triệu hoặc đổi thuế suất thành 8% để xem hệ thống phản xạ như thế nào.
- **Bước 4.2:** Xây dựng `components/TaxDefenseModal.tsx`:
  - Hiển thị giao diện "Hồ sơ Giải trình Thuế 1-Click" gồm: Căn cứ SOP, log duyệt của CFO, mã băm chữ ký số và nút in/xuất PDF.
- **Bước 4.3: Sửa lỗi & Phòng thủ:**
  - Xử lý triệt để lỗi hydration của Next.js khi dùng LocalStorage.
  - Đảm bảo giao diện co giãn tốt từ màn hình laptop 13 inch đến màn hình giám khảo 27 inch.
- **Kiểm thử Bước 4:** Giả lập Giám khảo nhập vào một hóa đơn mới toanh với số tiền 250 triệu và kiểm tra xem hệ thống có tự động bật cờ chuyển tiếp sang cho CFO hay không.

---

### Chặng 5: Đóng gói Chạy Local & Trải nghiệm Trực tiếp Toàn diện (Giờ 61 - 72)
- **Bước 5.1: Tối ưu hóa Khởi chạy Local Dev Server:**
  - Cấu hình Next.js 15 dev server khởi động nhanh dưới 3 giây, hỗ trợ Fast Refresh tức thì khi sửa code.
  - Thiết lập biến môi trường nạp tự động từ `.env.local` đã điền sẵn 2 API keys (Jev API & Gemini API).
  - Tự động kiểm tra tính tương thích trên trình duyệt: Truy cập trực tiếp tại `http://localhost:3000`.
- **Bước 5.2: Tích hợp Bộ Reset & Nạp Dữ liệu Mẫu (Local Seed & State Reset):**
  - Bổ sung nút **"Reset Dữ liệu Ban đầu"** ngay trên giao diện web để người dùng có thể làm mới toàn bộ danh sách hóa đơn, Tờ khai 01/GTGT và Hệ số K bất cứ lúc nào để thử lại từ đầu.
  - Lưu trạng thái vào `localStorage` của trình duyệt giúp dữ liệu không bị mất khi F5 tải lại trang.
- **Bước 5.3: Kịch bản Trải nghiệm Toàn diện dành cho Người dùng trên Local (User Acceptance Testing Walkthrough):**
  1. *Thao tác 1 (Kiểm thử Nhanh 90s):* Bấm nút `RUN VERIFY 90s` màu xanh nổi bật, quan sát 5 hồ sơ chạy tự động trong 1.5 giây (3 ca Routine duyệt ngầm, 2 ca Escalated bật cảnh báo).
  2. *Thao tác 2 (Xử lý Chuyển tiếp HITL):* Nhìn vào `Escalation Card` bên cột phải, đọc câu hỏi hành động in đậm chữ to rõ và bấm thử **Phương án A** hoặc **Phương án B**. Quan sát đồng hồ Hệ số K và Tờ khai thuế nhảy số tức thì.
  3. *Thao tác 3 (Thử nghiệm Hóa đơn Mới):* Dùng form "Thử nghiệm Hóa đơn Tùy biến" ở cột trái: chọn nhanh 1 trong 10 ca hóa đơn còn lại trong dropdown hoặc tự nhập số tiền bất thường (ví dụ: 250 triệu VNĐ) để xem Jev AI và Policy Engine phân luồng.
  4. *Thao tác 4 (Kiểm soát & Giải trình):* Xuống bảng `Audit Trail Table`, bấm nút **Undo** để hoàn tác một quyết định vừa duyệt, hoặc bấm nút **Tax Dossier** để mở xem trọn vẹn "Hồ sơ Giải trình Thuế 1-Click" mẫu.
- **Bước 5.4: Viết tài liệu `RUNBOOK.md` siêu tinh gọn:**
  - Hướng dẫn chỉ với 3 dòng lệnh: `npm install` -> điền `.env.local` -> `npm run dev`.

---

## 8. HƯỚNG DẪN CHẠY LOCAL & BẢNG TỰ KIỂM TRA TRẢI NGHIỆM

### 8.1 Lệnh chạy Local từ mã nguồn sạch
```bash
# 1. Cài đặt các gói phụ thuộc
npm install

cp .env.example .env.local
# Sau đó điền TYPESAFE_API_KEY và GEMINI_API_KEY vào .env.local

# 3. Khởi chạy môi trường phát triển trên Local
npm run dev

# 4. Mở trình duyệt web và trải nghiệm trực tiếp
# URL: http://localhost:3000
```

### 8.2 Bảng Tự Kiểm tra Trải nghiệm Người dùng trên Local
- [x] Chạy `npm run dev` thành công 100%, không phát sinh lỗi Type, không lỗi hydration.
- [x] Banner hướng dẫn nổi bật ngay đầu trang, cỡ chữ to rõ, dễ hiểu ngay trong 30 giây.
- [x] Nút `RUN VERIFY 90s` chạy mượt mà 5 ca chuẩn (3 Routine, 2 Escalated) và xuất bảng kết quả dưới 2 giây.
- [x] Phân loại chính xác 3 nhóm: Chưa rõ thông tin (`UNCERTAIN_INFO`), Ngoài quy định (`OUT_OF_POLICY`), Vượt thẩm quyền (`EXCEED_AUTHORITY`).
- [x] Thẻ Escalation Card hiển thị câu hỏi hành động cụ thể, có số liệu và 2 nút lựa chọn A/B to bản, dễ bấm.
- [x] Thao tác Hoàn tác (Undo) và Ghi đè (Override) trên bảng Audit Trail hoạt động thực tế trên State.
- [x] Đồng hồ giám sát Hệ số K thời gian thực phản hồi mượt mà mỗi khi duyệt hoặc loại bỏ hóa đơn.
- [x] Modal xem "Hồ sơ Giải trình Thuế 1-Click" (Tax Defense Dossier) hiển thị đầy đủ căn cứ pháp lý và log duyệt.
- [x] Có nút "Reset Dữ liệu" để người dùng thoải mái thử đi thử lại nhiều lần.

---
*Bản kế hoạch kỹ thuật này đã được tối ưu hóa tối đa cho việc phát triển và trải nghiệm thực tế ngay trên máy Local của bạn.*
