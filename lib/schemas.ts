import { z } from 'zod';

const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải có định dạng YYYY-MM-DD').refine(
  (value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  },
  'Ngày không hợp lệ'
);

const AmountSchema = z.number().finite();

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
    'ACCEPT_ADJUSTMENT',              // Chấp thuận hóa đơn điều chỉnh
    'ACCEPT_WITH_DEFENSE_DOSSIER'     // Chấp thuận kê khai kèm lập Hồ sơ Phòng vệ Nguồn hàng (CV 2392)
  ])
});
export type ActionOption = z.infer<typeof ActionOptionSchema>;

// 2.1 Schema Cấu hình Quy chế Thuế Động (Dynamic Policy Configuration)
export const SystemPolicyConfigSchema = z.object({
  nonCashThreshold: z.number().finite().nonnegative().default(5_000_000), // Mặc định 5 triệu theo Luật Thuế GTGT 48/2024/QH15
  kttApprovalLimit: z.number().finite().nonnegative().default(200_000_000), // Hạn mức tự duyệt của KTT 200 triệu
  kFactorSafeMin: z.number().finite().default(1.05),
  kFactorSafeMax: z.number().finite().default(1.25),
  vatReductionRate: z.number().finite().min(0).max(100).default(8),
  vatStandardRate: z.number().finite().min(0).max(100).default(10),
  allowStaffReimbursement: z.boolean().default(true), // Cho phép hoàn ứng ủy quyền nhân viên theo SOP
  excludedVat8Categories: z.array(z.string()).default([
    'VIỄN THÔNG', 'TÀI CHÍNH', 'NGÂN HÀNG', 'CHỨNG KHOÁN', 'BẢO HIỂM',
    'BẤT ĐỘNG SẢN', 'KIM LOẠI', 'KHAI KHOÁNG', 'HÓA CHẤT', 'TIÊU THỤ ĐẶC BIỆT'
  ])
});
export type SystemPolicyConfig = z.infer<typeof SystemPolicyConfigSchema>;

// 2.2 Schema Chi tiết Dòng hàng (IMP-08 Line-item Validation)
export const InvoiceLineItemSchema = z.object({
  lineNumber: z.number().int().positive(),
  itemCode: z.string().optional(),
  itemName: z.string().trim().min(1, 'Tên mặt hàng không được để trống'),
  unit: z.string().optional(),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  discountRate: z.number().min(0).max(100).optional(),
  discountAmount: z.number().nonnegative().optional(),
  amount: z.number().nonnegative(), // Thành tiền trước thuế
  taxRate: z.union([z.literal(0), z.literal(5), z.literal(8), z.literal(10)]),
  taxAmount: z.number().nonnegative(),
  totalAmount: z.number().nonnegative().optional(),
  isVat8Applicable: z.boolean().optional(),
  isExcludedCategory: z.boolean().optional(),
  flaggedReason: z.string().optional()
});
export type InvoiceLineItem = z.infer<typeof InvoiceLineItemSchema>;

// 3. Schema Hóa đơn Đầu vào (Invoice Input)
export const InvoiceInputSchema = z.object({
  id: z.string().trim().min(1),
  invoiceNumber: z.string().trim().min(1),
  invoiceDate: IsoDateSchema,         // Định dạng: YYYY-MM-DD
  supplierTaxCode: z.string().trim().regex(/^\d{10}(?:-\d{3})?$/, 'MST phải có 10 hoặc 13 chữ số'),
  supplierName: z.string().trim().min(2),
  itemName: z.string().trim().min(1),
  preTaxAmount: AmountSchema,
  taxRate: z.union([z.literal(0), z.literal(5), z.literal(8), z.literal(10)]),
  taxAmount: AmountSchema,
  totalAmount: AmountSchema,
  paymentMethod: z.enum(['BANK_TRANSFER', 'CASH']).optional(), // Chuyển khoản hoặc Tiền mặt
  hasBankSlip: z.boolean().optional(),             // Đã có Ủy nhiệm chi chưa?
  hasItemManifest: z.boolean().optional(),         // Có bảng kê chi tiết mặt hàng?
  isImageBlurry: z.boolean().default(false),         // Hóa đơn chụp mờ?
  sellerStatus: z.enum(['ACTIVE', 'SUSPENDED', 'CLOSED', 'UNKNOWN']).default('UNKNOWN'), // Trạng thái MST người bán
  sellerSuspensionDate: IsoDateSchema.optional(),    // Ngày cơ quan thuế đóng MST (nếu có)
  originalInvoiceRef: z.string().trim().min(1).optional(), // Mã HĐ gốc nếu là HĐ điều chỉnh (NĐ 254/2026)
  isAdjustment: z.boolean().default(false),          // Có phải HĐ điều chỉnh/thay thế không?
  isStaffReimbursed: z.boolean().optional(),        // Nhân viên thanh toán trước và hoàn ứng theo quy chế?
  sourceArtifactId: z.string().trim().min(1).optional(),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  items: z.array(InvoiceLineItemSchema).optional()  // Danh mục chi tiết các dòng hàng (IMP-08)
});
export type InvoiceInput = z.infer<typeof InvoiceInputSchema>;

export const PolicyRuleSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  sourceDocumentCode: z.string().min(1),
  clause: z.string().min(1),
  effectiveFrom: IsoDateSchema,
  effectiveTo: IsoDateSchema.optional(),
  priority: z.number().int().nonnegative().default(100),
  enabled: z.boolean().default(true),
  parameters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])).default({})
});
export type PolicyRule = z.infer<typeof PolicyRuleSchema>;

export const PolicyBundleSchema = z.object({
  version: z.string().min(1),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ROLLED_BACK']),
  createdAt: z.string().datetime(),
  effectiveFrom: IsoDateSchema,
  effectiveTo: IsoDateSchema.optional(),
  sourceDocumentVersions: z.array(z.string()).default([]),
  policyText: z.string().default(''),
  rules: z.array(PolicyRuleSchema),
  config: SystemPolicyConfigSchema,
  contentHash: z.string().regex(/^[a-f0-9]{64}$/).optional()
});
export type PolicyBundle = z.infer<typeof PolicyBundleSchema>;

export const LegalUpdateStatusEnum = z.enum([
  'DISCOVERED', 'PARSED', 'NEEDS_REVIEW', 'DRAFT_CREATED', 'TEST_FAILED',
  'APPROVED', 'PUBLISHED', 'REJECTED', 'ROLLED_BACK'
]);
export type LegalUpdateStatus = z.infer<typeof LegalUpdateStatusEnum>;

export const LegalUpdateCandidateSchema = z.object({
  id: z.string().min(1),
  sourceId: z.string().min(1),
  documentCode: z.string().min(1),
  title: z.string().min(1),
  publishedDate: IsoDateSchema.optional(),
  effectiveFrom: IsoDateSchema.optional(),
  effectiveTo: IsoDateSchema.optional(),
  status: LegalUpdateStatusEnum,
  summary: z.string().default(''),
  diff: z.string().default(''),
  affectedRuleIds: z.array(z.string()).default([]),
  sourceUrl: z.string().url().optional(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type LegalUpdateCandidate = z.infer<typeof LegalUpdateCandidateSchema>;

export const DocumentExtractionSchema = z.object({
  invoice: InvoiceInputSchema.partial(),
  confidence: z.record(z.string(), z.number().min(0).max(1)).default({}),
  needsReview: z.boolean().default(true),
  sourceType: z.enum(['XML', 'PDF', 'IMAGE', 'FORM']),
  artifactId: z.string().trim().min(1).optional(),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  warnings: z.array(z.string()).default([])
});
export type DocumentExtraction = z.infer<typeof DocumentExtractionSchema>;

// 4.1 Schema Báo cáo Phân tích Dòng hàng (IMP-08)
export const LineItemAnalysisSchema = z.object({
  isValid: z.boolean().default(true),
  totalItems: z.number().int().nonnegative(),
  flaggedItemsCount: z.number().int().nonnegative(),
  warnings: z.array(z.string()).default([]),
  totalItemAmount: z.number().optional(),
  totalItemTax: z.number().optional(),
  mismatchHeader: z.boolean().optional()
});
export type LineItemAnalysis = z.infer<typeof LineItemAnalysisSchema>;

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
  precedentApplied: z.object({
    precedentId: z.string(),
    approvedBy: z.string(),
    rationale: z.string()
  }).optional(),
  lineItemAnalysis: LineItemAnalysisSchema.optional(),
  timestamp: z.string()
});
export type RoutineDecision = z.infer<typeof RoutineDecisionSchema>;

// 5. Schema Thông tin Trùng lặp Hóa đơn (IMP-13)
export const DuplicateInfoSchema = z.object({
  isDuplicate: z.boolean(),
  originalInvoiceId: z.string().optional(),
  originalInvoiceNumber: z.string().optional(),
  firstSeenAt: z.string().optional(),
  duplicateReason: z.string().optional()
});
export type DuplicateInfo = z.infer<typeof DuplicateInfoSchema>;

// 6. Phán quyết Chuyển tiếp (ESCALATED) - Dừng tự động hóa & Gắn cờ
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
  duplicateInfo: DuplicateInfoSchema.optional(),
  lineItemAnalysis: LineItemAnalysisSchema.optional(),
  timestamp: z.string()
});
export type EscalatedDecision = z.infer<typeof EscalatedDecisionSchema>;

// 7. Hợp đồng Discriminated Union ép kiểu luồng quyết định (Jev Guardrail)
export const RefereeDecisionSchema = z.discriminatedUnion('status', [
  RoutineDecisionSchema,
  EscalatedDecisionSchema
]);
export type RefereeDecision = z.infer<typeof RefereeDecisionSchema>;

// 8. Schema Nhật ký Kiểm toán (Audit Entry)
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

// 9. Schema Giám sát Rủi ro Vĩ mô (Hệ số K)
export const MacroStateSchema = z.object({
  totalSales: z.number(),
  openingInventory: z.number(),
  totalPurchases: z.number(),
  kFactor: z.number(),
  zone: z.enum(['SAFE_GREEN', 'WARNING_YELLOW', 'DANGER_RED']),
  totalDeductibleTax: z.number()
});
export type MacroState = z.infer<typeof MacroStateSchema>;

// 10. Schema Tiền lệ Doanh nghiệp được Lãnh đạo duyệt (IMP-12: AI Feedback Loop)
export const CorporatePrecedentSchema = z.object({
  id: z.string().min(1),
  supplierTaxCode: z.string().min(1),
  supplierName: z.string().min(1),
  riskPattern: z.string().min(1),
  sopClause: z.string().min(1),
  approvedOption: z.string().min(1),
  rationale: z.string().min(1),
  approvedBy: z.string().min(1),
  effectiveFrom: IsoDateSchema,
  effectiveTo: IsoDateSchema.optional(),
  status: z.enum(['ACTIVE', 'REVOKED', 'EXPIRED']).default('ACTIVE'),
  createdAt: z.string().datetime()
});
export type CorporatePrecedent = z.infer<typeof CorporatePrecedentSchema>;

