import crypto from 'node:crypto';
import { InvoiceInputSchema, PolicyBundle, PolicyBundleSchema, RefereeDecisionSchema, SystemPolicyConfig, SystemPolicyConfigSchema } from '@/lib/schemas';
import { getActivePolicy, getDatabase, jsonNow } from '@/lib/server/db';
import { appendAuditEvent } from '@/lib/server/audit';
import { evaluateInvoiceLocally } from './policyEngine';

function contentHash(payload: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function readActivePolicy(): PolicyBundle {
  return getActivePolicy();
}

export function createPolicyDraft(input: Partial<PolicyBundle> & { config: SystemPolicyConfig }, actorId?: string): PolicyBundle {
  const config = SystemPolicyConfigSchema.parse(input.config);
  const version = input.version || `policy-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
  const bundle = PolicyBundleSchema.parse({
    version,
    status: 'DRAFT',
    createdAt: jsonNow(),
    effectiveFrom: input.effectiveFrom || new Date().toISOString().slice(0, 10),
    effectiveTo: input.effectiveTo,
    sourceDocumentVersions: input.sourceDocumentVersions || [],
    policyText: input.policyText || '',
    rules: input.rules || [],
    config,
    contentHash: contentHash({ ...input, version, config })
  });

  getDatabase().prepare(`
    INSERT INTO policy_versions (version, status, effective_from, effective_to, payload_json, content_hash, created_by, created_at)
    VALUES (@version, 'DRAFT', @effectiveFrom, @effectiveTo, @payload, @contentHash, @createdBy, @createdAt)
  `).run({
    version: bundle.version,
    effectiveFrom: bundle.effectiveFrom,
    effectiveTo: bundle.effectiveTo || null,
    payload: JSON.stringify(bundle),
    contentHash: bundle.contentHash,
    createdBy: actorId || null,
    createdAt: bundle.createdAt
  });
  appendAuditEvent({ eventType: 'POLICY_DRAFT_CREATED', entityId: bundle.version, actorId, payload: bundle });
  return bundle;
}

export function publishPolicy(version: string, actorId?: string, reason = 'Đã kiểm tra bộ test policy'): PolicyBundle {
  const db = getDatabase();
  const row = db.prepare('SELECT payload_json FROM policy_versions WHERE version = ?').get(version) as { payload_json?: string } | undefined;
  if (!row?.payload_json) throw new Error('Không tìm thấy policy draft');
  const bundle = PolicyBundleSchema.parse({ ...JSON.parse(row.payload_json), status: 'PUBLISHED' });
  const validation = validatePolicyBundle(bundle);
  if (!validation.valid) throw new Error(`Policy chưa đạt bộ test: ${validation.errors.join('; ')}`);
  const publishedAt = jsonNow();
  const tx = db.transaction(() => {
    db.prepare("UPDATE policy_versions SET status = 'ROLLED_BACK' WHERE status = 'PUBLISHED'").run();
    db.prepare(`UPDATE policy_versions SET status = 'PUBLISHED', payload_json = ?, approved_by = ?, published_at = ? WHERE version = ?`)
      .run(JSON.stringify(bundle), actorId || null, publishedAt, version);
    db.prepare(`INSERT INTO policy_approvals (id, policy_version, actor_id, action, reason, created_at) VALUES (?, ?, ?, 'PUBLISH', ?, ?)`)
      .run(crypto.randomUUID(), version, actorId || null, reason, publishedAt);
  });
  tx();
  appendAuditEvent({ eventType: 'POLICY_PUBLISHED', entityId: version, actorId, payload: { version, reason } });
  return bundle;
}

export function validatePolicyBundle(bundle: PolicyBundle): { valid: boolean; errors: string[] } {
  const rows = getDatabase().prepare('SELECT id, payload_json FROM invoices ORDER BY datetime(updated_at) DESC LIMIT 200').all() as Array<{ id: string; payload_json: string }>;
  const errors: string[] = [];
  for (const row of rows) {
    const parsedInvoice = InvoiceInputSchema.safeParse(JSON.parse(row.payload_json));
    if (!parsedInvoice.success) {
      errors.push(`${row.id}: dữ liệu hóa đơn không hợp lệ`);
      continue;
    }
    const decision = evaluateInvoiceLocally(parsedInvoice.data, bundle.config, bundle.version);
    if (!RefereeDecisionSchema.safeParse(decision).success) errors.push(`${row.id}: phán quyết không hợp lệ theo schema`);
  }
  if (rows.length === 0) errors.push('Chưa có hóa đơn thật trong SQLite để kiểm chứng policy');
  return { valid: errors.length === 0, errors };
}

export function rollbackPolicy(version: string, actorId?: string, reason = 'Rollback theo yêu cầu vận hành'): PolicyBundle {
  const db = getDatabase();
  const row = db.prepare('SELECT payload_json FROM policy_versions WHERE version = ?').get(version) as { payload_json?: string } | undefined;
  if (!row?.payload_json) throw new Error('Không tìm thấy policy để rollback');
  const bundle = PolicyBundleSchema.parse({ ...JSON.parse(row.payload_json), status: 'PUBLISHED' });
  const timestamp = jsonNow();
  const tx = db.transaction(() => {
    db.prepare("UPDATE policy_versions SET status = 'ROLLED_BACK' WHERE status = 'PUBLISHED'").run();
    db.prepare('UPDATE policy_versions SET status = \'PUBLISHED\', payload_json = ?, approved_by = ?, published_at = ? WHERE version = ?')
      .run(JSON.stringify(bundle), actorId || null, timestamp, version);
    db.prepare(`INSERT INTO policy_approvals (id, policy_version, actor_id, action, reason, created_at) VALUES (?, ?, ?, 'ROLLBACK', ?, ?)`)
      .run(crypto.randomUUID(), version, actorId || null, reason, timestamp);
  });
  tx();
  appendAuditEvent({ eventType: 'POLICY_ROLLED_BACK', entityId: version, actorId, payload: { version, reason } });
  return bundle;
}

export function listPolicyVersions(): PolicyBundle[] {
  const rows = getDatabase().prepare('SELECT payload_json FROM policy_versions ORDER BY datetime(created_at) DESC').all() as Array<{ payload_json: string }>;
  return rows.map((row) => PolicyBundleSchema.parse(JSON.parse(row.payload_json)));
}
