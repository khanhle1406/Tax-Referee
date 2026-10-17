const devLlmBaseUrl = (process.env.DEV_LLM_BASE_URL || 'https://nlt9router-oracle.tail3abf4e.ts.net/v1').replace(/\/+$/, '');
const devLlmEndpoint = devLlmBaseUrl ? `${devLlmBaseUrl}/chat/completions` : '';
const devLlmApiKey = process.env.DEV_LLM_API_KEY || '';
const devLlmModel = process.env.DEV_LLM_MODEL || 'ag/gemini-3-flash';

/** The single OpenAI-compatible LLM provider used by local development. */
export const DEV_LLM_API_CONFIG = {
  ENDPOINT: devLlmEndpoint,
  BASE_URL: devLlmBaseUrl,
  API_KEY: devLlmApiKey,
  MODEL: devLlmModel
};

// Keep the legacy export names as aliases so existing workflows and tests keep
// the same interfaces while every LLM request uses the configured local API.
export const GEMINI_API_CONFIG = DEV_LLM_API_CONFIG;
export const SHOPAIKEY_GEMINI_API_CONFIG = DEV_LLM_API_CONFIG;
export const OPENROUTER_API_CONFIG = DEV_LLM_API_CONFIG;
export const QWEN_API_CONFIG = { ...DEV_LLM_API_CONFIG, FAST_MODEL: devLlmModel };

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
  nonCashThresholdEffectiveFrom: '2025-07-01',
  kttApprovalLimit: 200_000_000,
  kFactorSafeMin: 1.05,
  kFactorSafeMax: 1.25,
  vatReductionRate: 8,
  vatStandardRate: 10,
  allowStaffReimbursement: true,
  companyTaxCode: '0102030405', // trùng demoCompanyTaxCode của Verify: cùng hóa đơn cho cùng kết quả ở Verify và workspace
  companyName: 'Công ty Cổ phần Thương mại & Công nghệ Fprinciples',
  strictBuyerTaxCodeCheck: false,
  strictSeriesYearCheck: true,
  strictMccqtCheck: true,
  sellerStatusMaterialityVnd: 20_000_000,
  postAuditRate: 0.1,
  excludedVat8Categories: [
    'VIỄN THÔNG', 'TÀI CHÍNH', 'NGÂN HÀNG', 'CHỨNG KHOÁN', 'BẢO HIỂM',
    'BẤT ĐỘNG SẢN', 'KIM LOẠI', 'KHAI KHOÁNG', 'HÓA CHẤT', 'TIÊU THỤ ĐẶC BIỆT'
  ]
};
