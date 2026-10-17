export const JEV_API_CONFIG = {
  ENDPOINT: 'https://api.typesafe.ai/v1/systemone',
  API_KEY: process.env.TYPESAFE_API_KEY || '',
  MODEL: 'jev-latest'
};

export const GEMINI_API_CONFIG = {
  ENDPOINT: (process.env.SHOPAIKEY_BASE_URL || process.env.AI_BASE_URL || process.env.OPENROUTER_BASE_URL || 'https://api.shopaikey.com/v1') + '/chat/completions',
  BASE_URL: process.env.SHOPAIKEY_BASE_URL || process.env.AI_BASE_URL || process.env.OPENROUTER_BASE_URL || 'https://api.shopaikey.com/v1',
  API_KEY: process.env.SHOPAIKEY_API_KEY || process.env.AI_API_KEY || process.env.OPENROUTER_API_KEY || '',
  MODEL: process.env.SHOPAIKEY_MODEL || process.env.AI_MODEL || process.env.OPENROUTER_MODEL || 'gemini-2.5-flash'
};

// Gemini Vision and Google Search grounding are routed through ShopAIKey. Keep
// this config strict so a key for another provider is never sent to ShopAIKey.
export const SHOPAIKEY_GEMINI_API_CONFIG = {
  BASE_URL: (process.env.SHOPAIKEY_BASE_URL || 'https://api.shopaikey.com')
    .replace(/\/+$/, '')
    .replace(/\/v1(?:beta)?$/i, ''),
  API_KEY: process.env.SHOPAIKEY_API_KEY || '',
  MODEL: process.env.SHOPAIKEY_MODEL || 'gemini-2.5-flash'
};

/**
 * LLM dành cho DEMO (chuẩn OpenAI chat/completions), CHỈ dùng khi DEV_LLM_ENABLED=1 và đủ 3 biến DEV_LLM_*.
 * Mặc định tắt. Giá trị đặt ở máy chạy — trong repo chỉ có tên biến.
 * Riêng tư: ảnh hóa đơn đi tới máy chủ này; nội dung XML không gửi cho AI (riêng tên, MST người bán có thể được tra cứu qua công cụ tìm kiếm của nhà cung cấp AI).
 */
export function devLlmConfig(): { baseUrl: string; apiKey: string; model: string; host: string } | null {
  if (process.env.DEV_LLM_ENABLED !== '1') return null;
  const baseUrl = (process.env.DEV_LLM_BASE_URL || '').trim().replace(/\/+$/, '');
  const apiKey = (process.env.DEV_LLM_API_KEY || '').trim();
  const model = (process.env.DEV_LLM_MODEL || '').trim();
  if (!/^https:\/\//.test(baseUrl) || !apiKey || !model) return null;
  let host = '';
  try { host = new URL(baseUrl).host; } catch { return null; }
  return { baseUrl, apiKey, model, host };
}

export const OPENROUTER_API_CONFIG = {
  ENDPOINT: (process.env.OPENROUTER_BASE_URL || GEMINI_API_CONFIG.BASE_URL) + '/chat/completions',
  BASE_URL: process.env.OPENROUTER_BASE_URL || GEMINI_API_CONFIG.BASE_URL,
  API_KEY: process.env.OPENROUTER_API_KEY || GEMINI_API_CONFIG.API_KEY,
  MODEL: process.env.OPENROUTER_MODEL || GEMINI_API_CONFIG.MODEL
};

export const QWEN_API_CONFIG = {
  ENDPOINT: (process.env.QWEN_BASE_URL || GEMINI_API_CONFIG.BASE_URL) + '/chat/completions',
  BASE_URL: process.env.QWEN_BASE_URL || GEMINI_API_CONFIG.BASE_URL,
  API_KEY: process.env.QWEN_API_KEY || GEMINI_API_CONFIG.API_KEY,
  MODEL: process.env.QWEN_MODEL || GEMINI_API_CONFIG.MODEL,
  FAST_MODEL: GEMINI_API_CONFIG.MODEL
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
