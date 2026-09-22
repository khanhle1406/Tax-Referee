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
  TOTAL_SALES: 15_000_000_000,        // 15 tỷ VNĐ doanh thu bán ra
  OPENING_INVENTORY: 3_000_000_000,   // 3 tỷ VNĐ tồn kho đầu kỳ
  INITIAL_PURCHASES: 9_500_000_000    // 9.5 tỷ VNĐ mua vào -> K ban đầu = 15 / (3 + 9.5) = 1.20 (Vùng xanh an toàn)
};

export const STORAGE_KEYS = {
  AUDIT_LOG: 'tax_referee_audit_log_v2',
  MACRO_STATE: 'tax_referee_macro_state_v2',
  CUSTOM_INVOICES: 'tax_referee_custom_invoices_v2',
  DYNAMIC_SOP: 'tax_referee_dynamic_sop_v2',
  POLICY_METADATA: 'tax_referee_policy_metadata_v2'
};

