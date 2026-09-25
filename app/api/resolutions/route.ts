import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { ActionOptionSchema, InvoiceInputSchema, RefereeDecisionSchema } from '@/lib/schemas';
import { appendAuditEvent } from '@/lib/server/audit';
import { getActivePolicy, getDatabase, getMacroState, jsonNow, saveMacroState } from '@/lib/server/db';
import { calculateKFactor } from '@/services/policyEngine';
import { getRequestUser } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

const acceptedActions = new Set(['ACCEPT_WITH_DOCS', 'ACCEPT_ADJUSTMENT', 'ACCEPT_WITH_DEFENSE_DOSSIER', 'FORWARD_TO_CFO']);

export async function POST(req: NextRequest) {
  try {
    const user = getRequestUser(req);
    if (!user) return NextResponse.json({ error: 'Vui lòng đăng nhập để phê duyệt hồ sơ' }, { status: 401 });
    const body = await req.json();
    const invoiceId = String(body.invoiceId || '');
    const evaluationId = String(body.evaluationId || '');
    const optionId = String(body.optionId || '');
    if (!invoiceId || !evaluationId || !optionId) throw new Error('Thiếu invoiceId, evaluationId hoặc optionId');
    const db = getDatabase();
    const row = db.prepare(`
      SELECT i.id, i.status, i.payload_json, e.id AS evaluation_id, e.decision_json
      FROM invoices i
      JOIN evaluations e ON e.invoice_id = i.id
      WHERE i.id = ? AND e.id = ?
    `).get(invoiceId, evaluationId) as { id: string; status: string; payload_json: string; evaluation_id: string; decision_json: string } | undefined;
    if (!row) throw new Error('Không tìm thấy evaluation hiện hành của hồ sơ');
    const invoice = InvoiceInputSchema.parse(JSON.parse(row.payload_json));
    const decision = RefereeDecisionSchema.parse(JSON.parse(row.decision_json));
    if (decision.status !== 'ESCALATED') throw new Error('Chỉ có thể xử lý hồ sơ ESCALATED');
    const option = ActionOptionSchema.parse(decision.options.find((candidate) => candidate.id === optionId));
    if (row.status === 'APPROVED' || row.status === 'REJECTED' || row.status === 'ON_HOLD') throw new Error('Hồ sơ đã được xử lý trước đó');
    const requiredRole = decision.status === 'ESCALATED' && decision.requiresCFO ? 'CFO' : 'CHIEF_ACCOUNTANT';
    const actorRole = user.role;
    if (actorRole !== requiredRole) throw new Error(`Case này cần vai trò ${requiredRole}`);

    const replay = db.prepare('SELECT id FROM human_resolutions WHERE invoice_id = ? AND evaluation_id = ? LIMIT 1').get(invoiceId, evaluationId);
    if (replay) throw new Error('Evaluation này đã có quyết định xử lý');

    const accepted = acceptedActions.has(option.resultingAction);
    const timestamp = jsonNow();
    const state = getMacroState();
    const activePolicy = getActivePolicy();
    if (accepted) {
      const nextPurchases = state.totalPurchases + invoice.preTaxAmount;
      const nextK = calculateKFactor(invoice.preTaxAmount, activePolicy.config.kFactorSafeMin, activePolicy.config.kFactorSafeMax, state);
      saveMacroState({
        ...state,
        totalPurchases: nextPurchases,
        kFactor: nextK.kFactor,
        zone: nextK.zone,
        totalDeductibleTax: state.totalDeductibleTax + invoice.taxAmount
      });
    }

    const resolutionId = crypto.randomUUID();
    db.transaction(() => {
      db.prepare(`
        INSERT INTO human_resolutions (id, invoice_id, evaluation_id, actor_id, actor_role, option_id, resulting_action, reason, accepted, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(resolutionId, invoice.id, evaluationId, user.id, actorRole, option.id, option.resultingAction, body.reason || option.actionDescription, accepted ? 1 : 0, timestamp);
      db.prepare('UPDATE invoices SET status = ?, updated_at = ? WHERE id = ?')
        .run(accepted ? 'APPROVED' : 'REJECTED', timestamp, invoice.id);
    })();

    // IMP-12: Lưu Tiền lệ Doanh nghiệp nếu người duyệt (CFO / KTT) tích chọn
    let createdPrecedent = null;
    if (body.saveAsPrecedent) {
      try {
        const { createPrecedent } = await import('@/services/precedentService');
        createdPrecedent = createPrecedent({
          supplierTaxCode: invoice.supplierTaxCode,
          supplierName: invoice.supplierName,
          riskPattern: decision.riskGroup,
          sopClause: decision.sopClause,
          approvedOption: option.label,
          rationale: body.reason || option.actionDescription,
          approvedBy: `${user.displayName} (${actorRole})`,
          effectiveMonths: body.precedentMonths || 6
        });
      } catch (precErr) {
        console.warn('Lỗi tự động tạo tiền lệ:', precErr);
      }
    }

    appendAuditEvent({
      eventType: 'HUMAN_RESOLUTION_RECORDED',
      entityId: invoice.id,
      actorId: user.id,
      payload: { resolutionId, invoice, decision, option, actorRole, accepted, precedent: createdPrecedent }
    });
    return NextResponse.json({ resolutionId, accepted, macroState: getMacroState(), precedent: createdPrecedent });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Không thể ghi nhận quyết định' }, { status: 400 });
  }
}
