import { SHOPAIKEY_GEMINI_API_CONFIG, devLlmConfig } from '@/lib/constants';
import { VISION_PROMPT_SHA256, VISION_TIMEOUT_MS, QGEN_TIMEOUT_MS } from '@/services/geminiService';
import { GROUNDING_BUDGET_MS, GROUNDING_MAX_CALLS } from '@/services/officialSupplierLookupService';
import { aiBudgetConfig } from './aiBudget';

/** Danh tính và ngân sách của các agent AI — số liệu lấy từ hằng số trong mã, dùng chung cho /api/health và /trust. */
export function aiRuntimeInfo() {
  return {
    decisionPathLlmCalls: 0,
    visionAgent: `agent:vision@${devLlmConfig()?.model ?? SHOPAIKEY_GEMINI_API_CONFIG.MODEL}#${VISION_PROMPT_SHA256.slice(0, 12)}`,
    // Chỉ tên máy chủ của LLM demo khi công tắc bật — không bao giờ lộ key.
    visionProvider: devLlmConfig() ? `dev-llm:${devLlmConfig()!.host}` : 'shopaikey',
    visionTimeoutMs: VISION_TIMEOUT_MS,
    ingestionMaxLlmCalls: 1 + GROUNDING_MAX_CALLS,
    groundingBudgetMs: GROUNDING_BUDGET_MS,
    qgenEnabled: process.env.QGEN_AI === '1',
    qgenTimeoutMs: QGEN_TIMEOUT_MS,
    budgets: aiBudgetConfig(),
  };
}

/** Cấu hình "fail-open" phải hiện ra: thiếu khóa audit thì không có HMAC/chữ ký điểm neo và mẫu hậu kiểm đoán trước được. */
export function configWarnings(auditKeyed: boolean, commit: string): string[] {
  if (process.env.NODE_ENV !== 'production') return [];
  // Cờ chỉ dành cho máy local của đội: bật trên production là cấu hình nhầm (kênh thật trong phiên người lạ, dữ liệu dựng sẵn, LLM demo).
  const localOnly = [
    ...(process.env.TAX_REFEREE_ALLOW_REAL_CHANNELS_IN_DEMO === '1' ? ['real_channels_in_demo'] : []),
    ...(process.env.TAX_REFEREE_DEMO_PRESET_BATCHES === '1' ? ['demo_preset_batches'] : []),
    ...(process.env.DEV_LLM_ENABLED === '1' ? ['dev_llm_enabled'] : []),
    ...(process.env.TAX_REFEREE_ALLOW_INTERNAL_ROLE_LOGIN === '1' ? ['internal_role_login'] : []),
  ];
  return [...(auditKeyed ? [] : ['audit_key_missing']), ...(commit === 'unknown' ? ['commit_unknown'] : []), ...(process.env.QGEN_AI === '1' ? ['qgen_ai_enabled'] : []), ...localOnly];
}
