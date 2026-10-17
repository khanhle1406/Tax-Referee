import { z } from 'zod';
import { DashboardSummary, DashboardSummarySchema } from '@/lib/dashboard';
import { getDatabase, jsonNow } from '@/lib/server/db';

type ApprovalOrigin = {kind: 'AUTOMATIC'} | {kind: 'HUMAN'; role: 'CHIEF_ACCOUNTANT' | 'CFO'} | {kind: 'UNKNOWN'};
interface ApprovalHistory {
  origin: ApprovalOrigin;
  status?: string;
  revision?: number;
  beforeEvents: Map<string, ApprovalOrigin>;
}
interface AuditRow {id: string; entity_id: string; event_type: string; actor_id: string | null; payload_json: string}

const unknownOrigin: ApprovalOrigin = {kind: 'UNKNOWN'};
const auditPayloadSchema = z.object({
  revision: z.number().int().optional(),
  actorRole: z.string().optional(),
  before: z.object({status: z.string()}).optional(),
  after: z.object({status: z.string()}).optional(),
  reversesEventId: z.string().optional()
});
type AuditPayload = z.infer<typeof auditPayloadSchema>;

function readAuditPayload(raw: string): AuditPayload | null {
  try {
    const parsed = auditPayloadSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    // Malformed historical evidence cannot establish who approved an invoice.
    return null;
  }
}

/** Replay approval provenance, including an undo that restores a previous approval. */
function approvalOrigins(): Map<string, ApprovalOrigin> {
  const db = getDatabase();
  const histories = new Map<string, ApprovalHistory>();
  const events = db.prepare(`SELECT a.id, a.entity_id, a.event_type, a.actor_id, a.payload_json
    FROM audit_events a JOIN invoices i ON i.id=a.entity_id
    WHERE i.status='APPROVED' ORDER BY a.rowid ASC`).iterate() as IterableIterator<AuditRow>;
  for (const event of events) {
    const history: ApprovalHistory = histories.get(event.entity_id) || {origin: unknownOrigin, beforeEvents: new Map<string, ApprovalOrigin>()};
    history.beforeEvents.set(event.id, history.origin);
    const payload = readAuditPayload(event.payload_json);
    if (!payload) {
      history.origin = unknownOrigin;
      history.status = undefined;
      history.revision = undefined;
    } else if (payload.after) {
      if (payload.after.status !== 'APPROVED') {
        history.origin = unknownOrigin;
      } else if (event.event_type === 'INVOICE_ACTION_REVERTED') {
        history.origin = payload.reversesEventId ? history.beforeEvents.get(payload.reversesEventId) || unknownOrigin : unknownOrigin;
      } else if (['ROUTINE_AUTO_APPROVED', 'ROUTINE_RELEASED_AFTER_RESUME'].includes(event.event_type)) {
        history.origin = {kind: 'AUTOMATIC'};
      } else if (['OVERRIDE', 'HUMAN_RESOLUTION_RECORDED'].includes(event.event_type)
        && event.actor_id && (payload.actorRole === 'CHIEF_ACCOUNTANT' || payload.actorRole === 'CFO')) {
        history.origin = {kind: 'HUMAN', role: payload.actorRole};
      } else if (payload.before?.status !== 'APPROVED') {
        history.origin = unknownOrigin;
      }
      history.status = payload.after.status;
      history.revision = payload.revision;
    }
    histories.set(event.entity_id, history);
  }
  const origins = new Map<string, ApprovalOrigin>();
  const approved = db.prepare("SELECT id,revision FROM invoices WHERE status='APPROVED'").iterate() as IterableIterator<{id: string; revision: number}>;
  for (const invoice of approved) {
    const history = histories.get(invoice.id);
    origins.set(invoice.id, history?.status === 'APPROVED' && history.revision === invoice.revision ? history.origin : unknownOrigin);
  }
  return origins;
}

/** Read-only aggregation: no Inbox limit, workflow mutation, or external service call. */
export function readDashboardSummary(): DashboardSummary {
  const db = getDatabase();
  return db.transaction(() => {
    const rows = db.prepare('SELECT status,COUNT(*) count FROM invoices GROUP BY status').all() as Array<{status: string; count: number}>;
    const statusCounts = Object.fromEntries(rows.map(row => [row.status, row.count]));
    const totalInvoices = rows.reduce((sum, row) => sum + row.count, 0);
    const approvals: DashboardSummary['approvals'] = {
      total: statusCounts.APPROVED || 0, automatic: 0, human: 0, unknown: 0,
      byRole: {CHIEF_ACCOUNTANT: 0, CFO: 0}, automationRate: null
    };
    for (const origin of approvalOrigins().values()) {
      if (origin.kind === 'AUTOMATIC') approvals.automatic++;
      else if (origin.kind === 'HUMAN') { approvals.human++; approvals.byRole[origin.role]++; }
      else approvals.unknown++;
    }
    approvals.automationRate = approvals.total ? approvals.automatic / approvals.total : null;
    const amounts = db.prepare(`SELECT
      COALESCE(SUM(CASE WHEN status='APPROVED' THEN approved_deductible_tax ELSE 0 END),0) approvedTax,
      COALESCE(SUM(CASE WHEN tax_hold=1 THEN 1 ELSE 0 END),0) held FROM invoices`).get() as {approvedTax: number; held: number};
    const rejected = statusCounts.REJECTED || 0;
    return DashboardSummarySchema.parse({
      generatedAt: jsonNow(), scope: 'CURRENT_DATABASE', totalInvoices, statusCounts, approvals,
      pending: {
        total: totalInvoices - approvals.total - rejected,
        chiefAccountant: statusCounts.WAITING_CHIEF_ACCOUNTANT || 0,
        cfo: (statusCounts.WAITING_CFO || 0) + (statusCounts.FORWARDED || 0),
        onHold: statusCounts.ON_HOLD || 0, evaluating: statusCounts.EVALUATING || 0,
        received: statusCounts.RECEIVED || 0, paused: statusCounts.PAUSED || 0
      },
      rejected, approvedDeductibleTax: amounts.approvedTax, taxHeld: amounts.held
    });
  })();
}
