import { NextRequest, NextResponse } from 'next/server';
import { requireRequestUser } from '@/lib/server/auth';
import { listAuditEventsForEntity, verifyAuditChain } from '@/lib/server/audit';
import { getDatabase, hashPayload, jsonNow } from '@/lib/server/db';
import crypto from 'node:crypto';

export const dynamic = 'force-dynamic';

function readJson(value: unknown): any {
  try { return value ? JSON.parse(String(value)) : null; } catch { return null; }
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = requireRequestUser(request);
    const { id } = await context.params;
    const db = getDatabase();
    const row = db.prepare(`
      SELECT i.*, e.id AS evaluation_id, e.decision_json, e.policy_version, e.legal_version, e.created_at AS evaluated_at
      FROM invoices i
      LEFT JOIN evaluations e ON e.id = (
        SELECT e2.id FROM evaluations e2 WHERE e2.invoice_id = i.id
        ORDER BY datetime(e2.created_at) DESC LIMIT 1
      )
      WHERE i.id = ?
    `).get(id) as Record<string, unknown> | undefined;
    if (!row) return NextResponse.json({ error: 'Không tìm thấy hồ sơ' }, { status: 404 });

    const sourceArtifacts = db.prepare(`
      SELECT id, revision, original_file_name AS originalFileName, source_type AS sourceType,
             mime_type AS mimeType, content_hash AS contentHash, byte_size AS byteSize,
             signature_status AS signatureStatus, created_at AS createdAt
      FROM document_artifacts
      WHERE invoice_id = ?
      ORDER BY revision ASC
    `).all(id);
    const resolutions = db.prepare(`
      SELECT id, evaluation_id AS evaluationId, actor_id AS actorId, actor_role AS actorRole,
             option_id AS optionId, resulting_action AS resultingAction, reason, accepted, created_at AS createdAt
      FROM human_resolutions
      WHERE invoice_id = ?
      ORDER BY datetime(created_at) ASC
    `).all(id);
    const policySnapshot = row.policy_version
      ? db.prepare('SELECT version, status, effective_from AS effectiveFrom, effective_to AS effectiveTo, payload_json AS payloadJson, content_hash AS contentHash FROM policy_versions WHERE version = ?').get(row.policy_version) as Record<string, unknown> | undefined
      : undefined;

    const dossierDraft = {
      dossierVersion: '1.0',
      generatedAt: new Date().toISOString(),
      immutableSnapshot: true,
      invoice: readJson(row.payload_json),
      workflowStatus: row.status,
      decision: readJson(row.decision_json),
      evaluationId: row.evaluation_id || null,
      policyVersion: row.policy_version || null,
      legalVersion: row.legal_version || null,
      contentHash: row.content_hash,
      sourceArtifacts,
      resolutions,
      policySnapshot: policySnapshot ? {
        version: policySnapshot.version,
        status: policySnapshot.status,
        effectiveFrom: policySnapshot.effectiveFrom,
        effectiveTo: policySnapshot.effectiveTo,
        contentHash: policySnapshot.contentHash,
        payload: readJson(policySnapshot.payloadJson)
      } : null,
      auditVerification: verifyAuditChain(),
      audit: listAuditEventsForEntity(id)
    };
    const snapshotHash = hashPayload({ ...dossierDraft, generatedAt: null });
    const existingSnapshot = db.prepare(`
      SELECT id, version, payload_json AS payloadJson
      FROM dossier_snapshots
      WHERE invoice_id = ? AND content_hash = ?
      ORDER BY version DESC LIMIT 1
    `).get(id, snapshotHash) as { id: string; version: number; payloadJson: string } | undefined;
    const dossier = existingSnapshot
      ? { ...readJson(existingSnapshot.payloadJson), snapshotId: existingSnapshot.id, snapshotVersion: existingSnapshot.version }
      : (() => {
          const nextVersion = db.prepare('SELECT COALESCE(MAX(version), 0) + 1 AS version FROM dossier_snapshots WHERE invoice_id = ?').get(id) as { version: number };
          const snapshotId = crypto.randomUUID();
          const payload = { ...dossierDraft, snapshotId, snapshotVersion: nextVersion.version };
          db.prepare(`
            INSERT INTO dossier_snapshots (id, invoice_id, evaluation_id, version, payload_json, content_hash, created_by, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(snapshotId, id, row.evaluation_id || null, nextVersion.version, JSON.stringify(payload), snapshotHash, user.id, jsonNow());
          return payload;
        })();
    const format = request.nextUrl.searchParams.get('format') || 'json';
    if (format === 'print') {
      const invoice = dossier.invoice || {};
      const decision = dossier.decision || {};
      const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char));
      const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Hồ sơ Tax Referee ${escape(invoice.invoiceNumber)}</title><style>body{font-family:Arial,sans-serif;max-width:860px;margin:40px auto;color:#172033;line-height:1.5}h1{font-size:24px}h2{font-size:16px;margin-top:28px;border-bottom:1px solid #ddd;padding-bottom:6px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.item{padding:10px;background:#f5f7fb;border-radius:8px}.label{font-size:11px;color:#667085}.value{font-weight:700}pre{white-space:pre-wrap;word-break:break-word;background:#f5f7fb;padding:12px;border-radius:8px;font-size:11px}@media print{body{margin:16px}}</style></head><body><h1>Hồ sơ giải trình Tax Referee</h1><p>Snapshot bất biến · Tạo lúc ${escape(dossier.generatedAt)}</p><h2>Chứng từ</h2><div class="grid"><div class="item"><div class="label">Số hóa đơn</div><div class="value">${escape(invoice.invoiceNumber)}</div></div><div class="item"><div class="label">Nhà cung cấp</div><div class="value">${escape(invoice.supplierName)}</div></div><div class="item"><div class="label">Ngày hóa đơn</div><div class="value">${escape(invoice.invoiceDate)}</div></div><div class="item"><div class="label">Tổng tiền</div><div class="value">${escape(invoice.totalAmount)}</div></div></div><h2>Kết quả</h2><pre>${escape(JSON.stringify(decision, null, 2))}</pre><h2>Nguồn chứng từ và phê duyệt</h2><pre>${escape(JSON.stringify({ sourceArtifacts: dossier.sourceArtifacts, resolutions: dossier.resolutions }, null, 2))}</pre><h2>Phiên bản và kiểm chứng</h2><div class="grid"><div class="item"><div class="label">Workflow</div><div class="value">${escape(dossier.workflowStatus)}</div></div><div class="item"><div class="label">Policy</div><div class="value">${escape(dossier.policyVersion)}</div></div><div class="item"><div class="label">Legal</div><div class="value">${escape(dossier.legalVersion)}</div></div><div class="item"><div class="label">SHA-256 dữ liệu</div><div class="value">${escape(dossier.contentHash)}</div></div><div class="item"><div class="label">Audit chain</div><div class="value">${escape(JSON.stringify(dossier.auditVerification))}</div></div></div><h2>Audit</h2><pre>${escape(JSON.stringify(dossier.audit, null, 2))}</pre><p>Chữ ký số: CHƯA TÍCH HỢP. Hồ sơ này không thay thế hóa đơn điện tử gốc hoặc biểu mẫu nộp cơ quan thuế.</p></body></html>`;
      return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
    return new NextResponse(JSON.stringify(dossier, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="tax-referee-${id}.json"` } });
  } catch (error) {
    if (error instanceof Error && error.message === 'AUTH_REQUIRED') return NextResponse.json({ error: 'Vui lòng đăng nhập' }, { status: 401 });
    return NextResponse.json({ error: 'Không thể xuất hồ sơ' }, { status: 500 });
  }
}
