import { JEV_API_CONFIG } from '@/lib/constants';
import { InvoiceInput, RefereeDecision, RiskGroup } from '@/lib/schemas';
import { evaluateInvoiceLocally } from './policyEngine';
import { generateActionableQuestionWithGemini } from './geminiService';

interface JevSystemOneResponse {
  answers: {
    decision_type: {
      choice: 'ROUTINE' | 'UNCERTAIN_INFO' | 'OUT_OF_POLICY' | 'EXCEED_AUTHORITY';
      probabilities?: Record<string, number>;
      confidence?: number;
    };
    should_escalate?: {
      probability?: number;
    };
    risk_level?: {
      score?: number;
    };
  };
}

export type DualEngineType = 'JEV_AND_GEMINI_AI' | 'GEMINI_AI' | 'JEV_AI' | 'LOCAL_FALLBACK';

export interface EvaluationResult {
  decision: RefereeDecision;
  engineUsed: DualEngineType;
  confidence: number;
  riskScore: number;
}

/**
 * Dual-Engine AI Referee:
 * 1. TypeSafe AI Jev: Đóng vai trò Decision Primitive phân loại 3 nhóm rủi ro & tính confidence
 * 2. Google Gemini Flash: Đóng vai trò Actionable Q-Gen sinh lý do cắm cờ & câu hỏi đối ứng A/B động
 * 3. Zod Guardrail & Local Policy: Zero-Hallucination & Fallback < 50ms
 */
export async function queryJevReferee(
  invoice: InvoiceInput,
  options?: {
    forceLocalOnly?: boolean;
    useGenerativeQGen?: boolean;
    customSopVersion?: string;
  }
): Promise<EvaluationResult> {
  const customSopVersion = options?.customSopVersion || 'TAX-SOP-2026 v2.1';
  const useGenerativeQGen = options?.useGenerativeQGen ?? true;

  // Nếu người dùng yêu cầu chỉ chạy offline/local fallback
  if (options?.forceLocalOnly) {
    const localDecision = evaluateInvoiceLocally(invoice, customSopVersion);
    const result: RefereeDecision = {
      ...localDecision,
      engineUsed: 'LOCAL_FALLBACK',
      confidence: 1.0,
      riskScore: localDecision.status === 'ROUTINE' ? 1 : 4
    };
    return {
      decision: result,
      engineUsed: 'LOCAL_FALLBACK',
      confidence: 1.0,
      riskScore: localDecision.status === 'ROUTINE' ? 1 : 4
    };
  }

  // 1. Chuẩn bị phán quyết nền từ Local Policy Engine (Ground Truth bảo vệ)
  const localDecision = evaluateInvoiceLocally(invoice, customSopVersion);

  // 2. Gọi TypeSafe AI Jev System One
  let jevChoice: 'ROUTINE' | RiskGroup | null = null;
  let jevConfidence = 0.95;
  let jevRiskScore = localDecision.status === 'ROUTINE' ? 1 : 4;
  let jevSuccess = false;

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
        instructions:
          'Phân loại hóa đơn này theo Quy chế Tax-SOP-2026 vào đúng 1 nhóm: ROUTINE, UNCERTAIN_INFO, OUT_OF_POLICY, hoặc EXCEED_AUTHORITY',
        criteria: {
          ROUTINE:
            'Hóa đơn hợp lệ 100%, đúng thuế suất 8%/10%, thanh toán ngân hàng nếu >= 20M, giá trị dưới 200M, không làm biến động K-Factor.',
          UNCERTAIN_INFO:
            'Hóa đơn mờ, thiếu bảng kê, không có mã hóa đơn gốc đối chiếu (NĐ 123), hoặc lập trước ngày nhà cung cấp đóng MST.',
          OUT_OF_POLICY:
            'Viễn thông áp sai 8%, hóa đơn >= 20M thanh toán tiền mặt, rượu bia, hoặc lập sau ngày đóng MST.',
          EXCEED_AUTHORITY:
            'Hóa đơn điều chỉnh hoặc chi phí từ 200 triệu VNĐ trở lên, hoặc đẩy Hệ số K vào vùng đỏ nguy hiểm (> 1.35).'
        }
      },
      should_escalate: {
        type: 'noul',
        instructions: 'Hóa đơn này có cần dừng tự động hóa để con người xem xét hay không?'
      },
      risk_level: {
        type: 'score',
        instructions: 'Đánh giá mức độ rủi ro thanh tra thuế của hóa đơn trên thang điểm 1 đến 5.',
        criteria: [
          'Hóa đơn thường quy an toàn',
          'Rủi ro thấp',
          'Cần lưu ý kiểm tra chứng từ',
          'Rủi ro vi phạm quy chế thuế',
          'Vi phạm nghiêm trọng cần CFO xử lý'
        ]
      }
    }
  };

  try {
    const res = await fetch(JEV_API_CONFIG.ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${JEV_API_CONFIG.API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(4000) // Timeout 4s
    });

    if (res.ok) {
      const data: JevSystemOneResponse = await res.json();
      jevChoice = data.answers.decision_type.choice;
      jevConfidence =
        data.answers.decision_type.confidence ??
        data.answers.should_escalate?.probability ??
        0.95;
      jevRiskScore = data.answers.risk_level?.score ?? (jevChoice === 'ROUTINE' ? 1 : 4);
      jevSuccess = true;
    } else {
      console.warn(`[Jev API] Returned status ${res.status}. Falling back to Policy Engine.`);
    }
  } catch (err) {
    console.warn('[Jev API] Call failed or timed out. Falling back to local Policy Engine.', err);
  }

  // 3. Phân định quyết định cuối cùng (Dual Guardrail: Zero-Hallucination)
  // Nếu Local Policy bảo ESCALATED thì KHÔNG BAO GIỜ được tự ý duyệt ROUTINE (An toàn tuyệt đối)
  const finalStatus: 'ROUTINE' | 'ESCALATED' =
    localDecision.status === 'ESCALATED'
      ? 'ESCALATED'
      : jevChoice === 'ROUTINE' || !jevChoice
        ? 'ROUTINE'
        : 'ESCALATED';

  // 4. Nếu là ROUTINE: Hoàn tất duyệt tự động
  if (finalStatus === 'ROUTINE') {
    const engineUsed: DualEngineType = jevSuccess ? 'JEV_AI' : 'LOCAL_FALLBACK';
    const decision: RefereeDecision = {
      ...localDecision,
      engineUsed,
      confidence: jevConfidence,
      riskScore: jevRiskScore
    };
    return {
      decision,
      engineUsed,
      confidence: jevConfidence,
      riskScore: jevRiskScore
    };
  }

  // 5. Nếu là ESCALATED: Kích hoạt Actionable Question Generator (Q-Gen)
  // Xác định nhóm rủi ro: Ưu tiên phân loại chuẩn của Local / Jev
  const riskGroup: RiskGroup =
    localDecision.status === 'ESCALATED'
      ? localDecision.riskGroup
      : (jevChoice as RiskGroup) || 'OUT_OF_POLICY';

  let qGenSuccess = false;
  let geminiResult: any = null;

  if (useGenerativeQGen) {
    try {
      const hint = localDecision.status === 'ESCALATED' ? localDecision.flaggedReason : undefined;
      const sopHint = localDecision.status === 'ESCALATED' ? localDecision.sopClause : undefined;
      geminiResult = await generateActionableQuestionWithGemini(
        invoice,
        riskGroup,
        hint,
        sopHint
      );
      qGenSuccess = true;
    } catch (err) {
      console.warn('[Gemini Q-Gen] Dynamic question generation failed. Falling back to template.', err);
    }
  }

  let engineUsed: DualEngineType = 'LOCAL_FALLBACK';
  if (jevSuccess && qGenSuccess) {
    engineUsed = 'JEV_AND_GEMINI_AI';
  } else if (qGenSuccess) {
    engineUsed = 'GEMINI_AI';
  } else if (jevSuccess) {
    engineUsed = 'JEV_AI';
  }

  // Kết hợp dữ liệu: Nếu Gemini sinh thành công thì dùng nội dung AI phong phú, ngược lại dùng template chuẩn
  if (qGenSuccess && geminiResult) {
    const escalatedDecision: RefereeDecision = {
      status: 'ESCALATED',
      riskGroup,
      invoiceId: invoice.id,
      supplierName: invoice.supplierName,
      totalAmount: invoice.totalAmount,
      taxRate: invoice.taxRate,
      flaggedReason: geminiResult.flaggedReason,
      plainExplanation: geminiResult.plainExplanation,
      sopClause: geminiResult.sopClause,
      actionableQuestion: geminiResult.actionableQuestion,
      options: geminiResult.options,
      requiresCFO: geminiResult.requiresCFO || (localDecision.status === 'ESCALATED' ? localDecision.requiresCFO : false),
      applicableRegulations: localDecision.applicableRegulations,
      sopVersion: customSopVersion,
      engineUsed,
      confidence: jevConfidence,
      riskScore: jevRiskScore,
      timestamp: new Date().toISOString()
    };

    return {
      decision: escalatedDecision,
      engineUsed,
      confidence: jevConfidence,
      riskScore: jevRiskScore
    };
  }

  // Fallback an toàn sang Local Policy template
  const fallbackDecision: RefereeDecision = {
    ...localDecision,
    engineUsed,
    confidence: jevConfidence,
    riskScore: jevRiskScore
  };

  return {
    decision: fallbackDecision,
    engineUsed,
    confidence: jevConfidence,
    riskScore: jevRiskScore
  };
}
