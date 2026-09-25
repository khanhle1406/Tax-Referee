export const JEV_API_CONFIG = {
  ENDPOINT: 'https://api.typesafe.ai/v1/systemone',
  API_KEY: process.env.TYPESAFE_API_KEY || '',
  MODEL: 'jev-latest'
};

export const GEMINI_API_CONFIG = {
  ENDPOINT: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent',
  API_KEY: process.env.GEMINI_API_KEY || '',
  MODEL: 'gemini-3.5-flash-lite'
};

export const MACRO_DEFAULTS = {
  TOTAL_SALES: 15_000_000_000,        // 15 tỷ VNĐ doanh thu bán ra
  OPENING_INVENTORY: 3_000_000_000,   // 3 tỷ VNĐ tồn kho đầu kỳ
  INITIAL_PURCHASES: 9_500_000_000    // 9.5 tỷ VNĐ mua vào -> K ban đầu = 15 / (3 + 9.5) = 1.20 (Vùng xanh an toàn)
};

export const STORAGE_KEYS = {
  AUDIT_LOG: 'tax_referee_audit_log_v2',
  MACRO_STATE: 'tax_referee_macro_state_v2',
  CUSTOM_INVOICES: 'tax_referee_custom_invoices_v2',
  DYNAMIC_SOP: 'tax_referee_dynamic_sop_v2',
  POLICY_METADATA: 'tax_referee_policy_metadata_v2',
  DYNAMIC_CONFIG: 'tax_referee_dynamic_policy_config_v2'
};

export const LEGAL_CONSTANTS_2026 = {
  NON_CASH_THRESHOLD_CURRENT: 5_000_000,
  NON_CASH_THRESHOLD_LEGACY: 20_000_000,
  LAW_48_EFFECTIVE_DATE: '2025-07-01',
  VAT_8_EXPIRY_DATE: '2026-12-31',
  PIT_PERSONAL_DEDUCTION: 15_500_000,
  PIT_DEPENDENT_DEDUCTION: 6_200_000,
  CIT_SME_TIER_1_LIMIT: 3_000_000_000,   // Doanh thu <= 3 tỷ: thuế 15%
  CIT_SME_TIER_2_LIMIT: 50_000_000_000,  // Doanh thu 3-50 tỷ: thuế 17%
  CIT_RATE_TIER_1: 0.15,
  CIT_RATE_TIER_2: 0.17,
  CIT_RATE_STANDARD: 0.20,
  EBITDA_INTEREST_CAP: 0.30              // Trần chi phí lãi vay giao dịch liên kết 30% EBITDA
};

export const DEFAULT_POLICY_CONFIG = {
  nonCashThreshold: 5_000_000,
  kttApprovalLimit: 200_000_000,
  kFactorSafeMin: 1.05,
  kFactorSafeMax: 1.25,
  vatReductionRate: 8,
  vatStandardRate: 10,
  allowStaffReimbursement: true,
  excludedVat8Categories: [
    'VIỄN THÔNG', 'TÀI CHÍNH', 'NGÂN HÀNG', 'CHỨNG KHOÁN', 'BẢO HIỂM',
    'BẤT ĐỘNG SẢN', 'KIM LOẠI', 'KHAI KHOÁNG', 'HÓA CHẤT', 'TIÊU THỤ ĐẶC BIỆT'
  ]
};
