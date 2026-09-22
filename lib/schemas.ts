import { z } from 'zod';

// 1. Phân loại 3 nhóm rủi ro chuẩn Đề bài A
export const RiskGroupEnum = z.enum([
  'UNCERTAIN_INFO',    // Nhóm 1: Chưa xác định thông tin thực tế
  'OUT_OF_POLICY',     // Nhóm 2: Nằm ngoài phạm vi quy định
  'EXCEED_AUTHORITY'   // Nhóm 3: Vượt thẩm quyền cần con người duyệt
]);
export type RiskGroup = z.infer<typeof RiskGroupEnum>;

// 2. Schema Lựa chọn Hành động (Action Option A/B)
export const ActionOptionSchema = z.object({
  id: z.enum(['A', 'B']),
  label: z.string(),                  // Tên trên nút bấm (VD: "Phương án A: 140.000₫")
  actionDescription: z.string(),      // Mô tả hành động chi tiết
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
  sellerStatus: z.enum(['ACTIVE', 'SUSPENDED', 'CLOSED']), // Trạng thái MST người bán
  sellerSuspensionDate: z.string().optional(),       // Ngày cơ quan thuế đóng MST (nếu có)
  originalInvoiceRef: z.string().optional(),         // Mã HĐ gốc nếu là HĐ điều chỉnh (NĐ 123)
  isAdjustment: z.boolean().default(false)           // Có phải HĐ điều chỉnh/thay thế không?
});
export type InvoiceInput = z.infer<typeof InvoiceInputSchema>;

// 4. Phán quyết Thường quy (ROUTINE) - Tự động thông qua 100%
export const RoutineDecisionSchema = z.object({
  status: z.literal('ROUTINE'),
  invoiceId: z.string(),
  supplierName: z.string(),
  totalAmount: z.number(),
  appliedTaxRate: z.number(),
  approvedTaxAmount: z.number(),      // Chỉ nhánh ROUTINE mới có trường thuế được duyệt
  plainExplanation: z.string(),       // 1 câu tiếng Việt bình dân giải thích cho người không chuyên
  kFactorAfter: z.number(),           // Hệ số K sau khi hạch toán
  applicableRegulations: z.array(z.string()).optional(), // Căn cứ pháp luật áp dụng theo ngày hóa đơn
  sopVersion: z.string().optional(),  // Phiên bản SOP áp dụng
  engineUsed: z.enum(['JEV_AND_GEMINI_AI', 'GEMINI_AI', 'JEV_AI', 'LOCAL_FALLBACK']).optional(),
  confidence: z.number().optional(),
  riskScore: z.number().optional(),
  timestamp: z.string()
});
export type RoutineDecision = z.infer<typeof RoutineDecisionSchema>;

// 5. Phán quyết Chuyển tiếp (ESCALATED) - Dừng tự động hóa & Gắn cờ
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
  applicableRegulations: z.array(z.string()).optional(), // Căn cứ pháp luật áp dụng theo ngày hóa đơn
  sopVersion: z.string().optional(),  // Phiên bản SOP áp dụng
  engineUsed: z.enum(['JEV_AND_GEMINI_AI', 'GEMINI_AI', 'JEV_AI', 'LOCAL_FALLBACK']).optional(),
  confidence: z.number().optional(),
  riskScore: z.number().optional(),
  timestamp: z.string()
});
export type EscalatedDecision = z.infer<typeof EscalatedDecisionSchema>;

// 6. Hợp đồng Discriminated Union ép kiểu luồng quyết định (Jev Guardrail)
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
  taxDefenseDossierReady: z.boolean().default(false),
  applicableRegulations: z.array(z.string()).optional(),
  sopVersion: z.string().optional()
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
