import { InvoiceInput, MacroState, RefereeDecision, RiskGroup, SystemPolicyConfig } from '@/lib/schemas';
import { evaluateInvoiceLocally } from './policyEngine';
import { generateActionableQuestionWithGemini } from './geminiService';

export type DualEngineType = 'JEV_AND_GEMINI_AI' | 'GEMINI_AI' | 'JEV_AI' | 'LOCAL_FALLBACK';

export interface EvaluationResult {
  decision: RefereeDecision;
  engineUsed: DualEngineType;
  confidence: number;
  riskScore: number;
  decisionAuthority: 'LOCAL_POLICY_ENGINE';
  policyVersion?: string;
}

/** Local policy is the only authority allowed to classify an invoice. */
export async function queryJevReferee(
  invoice: InvoiceInput,
  options?: {
    forceLocalOnly?: boolean;
    useGenerativeQGen?: boolean;
    customSopVersion?: string;
    customConfig?: Partial<SystemPolicyConfig>;
    macroState?: Pick<MacroState, 'totalSales' | 'openingInventory' | 'totalPurchases'>;
    policyVersion?: string;
  }
): Promise<EvaluationResult> {
  const localDecision = evaluateInvoiceLocally(
    invoice,
    options?.customConfig,
    options?.customSopVersion || 'TAX-SOP-2026 v2.5',
    options?.macroState
  );
  const localRiskScore = localDecision.status === 'ROUTINE' ? 1 : localDecision.requiresCFO ? 5 : 4;

  if (localDecision.status === 'ROUTINE' || options?.forceLocalOnly || options?.useGenerativeQGen === false) {
    return {
      decision: { ...localDecision, engineUsed: 'LOCAL_FALLBACK', confidence: 1, riskScore: localRiskScore },
      engineUsed: 'LOCAL_FALLBACK',
      confidence: 1,
      riskScore: localRiskScore,
      decisionAuthority: 'LOCAL_POLICY_ENGINE',
      policyVersion: options?.policyVersion
    };
  }

  try {
    const generated = await generateActionableQuestionWithGemini(
      invoice,
      localDecision.riskGroup as RiskGroup,
      localDecision.flaggedReason,
      localDecision.sopClause
    );
    const enrichedDecision: RefereeDecision = {
      ...localDecision,
      // Risk group, authority and A/B actions remain deterministic from local policy.
      plainExplanation: generated.plainExplanation,
      actionableQuestion: generated.actionableQuestion,
      flaggedReason: localDecision.flaggedReason,
      options: localDecision.options,
      requiresCFO: localDecision.requiresCFO,
      engineUsed: 'GEMINI_AI',
      confidence: 0.9,
      riskScore: localRiskScore
    };
    return {
      decision: enrichedDecision,
      engineUsed: 'GEMINI_AI',
      confidence: 0.9,
      riskScore: localRiskScore,
      decisionAuthority: 'LOCAL_POLICY_ENGINE',
      policyVersion: options?.policyVersion
    };
  } catch (error) {
    console.warn('[Gemini Q-Gen] Fallback về template deterministic:', error);
    return {
      decision: { ...localDecision, engineUsed: 'LOCAL_FALLBACK', confidence: 1, riskScore: localRiskScore },
      engineUsed: 'LOCAL_FALLBACK',
      confidence: 1,
      riskScore: localRiskScore,
      decisionAuthority: 'LOCAL_POLICY_ENGINE',
      policyVersion: options?.policyVersion
    };
  }
}
