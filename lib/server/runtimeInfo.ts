import { DEV_LLM_API_CONFIG } from '@/lib/constants';
import { VISION_PROMPT_SHA256, PDF_VISION_PROMPT_SHA256, VISION_TIMEOUT_MS, QGEN_TIMEOUT_MS } from '@/services/geminiService';
import { GROUNDING_BUDGET_MS, GROUNDING_MAX_CALLS } from '@/services/officialSupplierLookupService';
import { aiBudgetConfig } from './aiBudget';

/** Danh tính và ngân sách của các agent AI — số liệu lấy từ hằng số trong mã, dùng chung cho /api/health và /trust. */
export function aiRuntimeInfo() {
  return {
    decisionPathLlmCalls: 0,
    visionAgent: `agent:vision@${DEV_LLM_API_CONFIG.MODEL}#${VISION_PROMPT_SHA256.slice(0, 12)}`,
    pdfVisionAgent: `agent:vision@${DEV_LLM_API_CONFIG.MODEL}#${PDF_VISION_PROMPT_SHA256.slice(0, 12)}`,
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
  return [...(auditKeyed ? [] : ['audit_key_missing']), ...(commit === 'unknown' ? ['commit_unknown'] : []), ...(process.env.QGEN_AI === '1' ? ['qgen_ai_enabled'] : [])];
}
