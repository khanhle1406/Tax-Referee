import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { InvoiceInputSchema } from '@/lib/schemas';
import { queryJevReferee } from '@/services/jevService';
import { getActivePolicy, getDatabase, getMacroState, hashPayload, jsonNow } from '@/lib/server/db';
import { appendAuditEvent } from '@/lib/server/audit';
import { getRequestUser } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const user = getRequestUser(req);
    const isPublicDemo = body.demo === true && !user;
    if (!user && !isPublicDemo) {
      return NextResponse.json({ error: 'Vui lòng đăng nhập để thẩm định hồ sơ production' }, { status: 401 });
    }

    // Tiếp nhận linh hoạt: body có thể là chính InvoiceInput hoặc là { invoice, ...options }
    const rawInvoice = body.invoice || body;
    const parseResult = InvoiceInputSchema.safeParse(rawInvoice);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Dữ liệu hóa đơn không đúng chuẩn schema', details: parseResult.error.format() },
        { status: 400 }
      );
    }

    const parsedInvoice = parseResult.data;
    const incomingHash = hashPayload(parsedInvoice);
    const existing = !isPublicDemo
      ? getDatabase().prepare('SELECT content_hash FROM invoices WHERE id = ?').get(parsedInvoice.id) as { content_hash?: string } | undefined
      : undefined;
    const storageId = !isPublicDemo && existing?.content_hash && existing.content_hash !== incomingHash
      ? `${parsedInvoice.id}-${incomingHash.slice(0, 8)}`
      : parsedInvoice.id;
    const invoice = { ...parsedInvoice, id: storageId };
    const activePolicy = getActivePolicy();
    const options = {
      // Chạy thật với Gemini 2.5 Flash AI kết hợp Policy Engine deterministic
      forceLocalOnly: body.forceLocalOnly ?? false,
      useGenerativeQGen: body.useGenerativeQGen ?? true,
      customSopVersion: body.customSopVersion,
      customConfig: body.previewPolicy ? body.customConfig : activePolicy.config,
      macroState: getMacroState(),
      policyVersion: activePolicy.version
    };

    const result = await queryJevReferee(invoice, options);

    // Verify is intentionally public and ephemeral. It must never write into
    // the production SQLite database or its audit chain.
    if (isPublicDemo) {
      return NextResponse.json({
        ...result,
        demo: true,
        policy: { version: activePolicy.version, contentHash: activePolicy.contentHash }
      });
    }

    const artifact = invoice.sourceArtifactId
      ? getDatabase().prepare('SELECT id, content_hash, invoice_id FROM document_artifacts WHERE id = ?').get(invoice.sourceArtifactId) as { id: string; content_hash: string; invoice_id: string } | undefined
      : undefined;
    if (invoice.sourceArtifactId && (!artifact || artifact.content_hash !== invoice.sourceHash || (artifact.invoice_id !== `pending:${invoice.sourceArtifactId}` && artifact.invoice_id !== invoice.id))) {
      return NextResponse.json({ error: 'Artifact nguồn không khớp với hóa đơn đang thẩm định' }, { status: 409 });
    }

    const timestamp = jsonNow();
    const evaluationId = crypto.randomUUID();
    const workflowStatus = result.decision.status === 'ROUTINE'
      ? 'ROUTINE_PROPOSED'
      : (result.decision.requiresCFO ? 'WAITING_CFO' : 'WAITING_CHIEF_ACCOUNTANT');
    getDatabase().prepare(`
      INSERT OR REPLACE INTO invoices (id, invoice_number, supplier_tax_code, invoice_date, payload_json, content_hash, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM invoices WHERE id = ?), ?), ?)
    `).run(
      invoice.id,
      invoice.invoiceNumber,
      invoice.supplierTaxCode,
      invoice.invoiceDate,
      JSON.stringify(invoice),
      hashPayload(invoice),
      workflowStatus,
      invoice.id,
      timestamp,
      timestamp
    );
    if (invoice.sourceArtifactId) {
      if (artifact?.invoice_id !== invoice.id) {
        const nextRevision = getDatabase().prepare('SELECT COALESCE(MAX(revision), 0) + 1 AS revision FROM document_artifacts WHERE invoice_id = ?').get(invoice.id) as { revision: number };
        getDatabase().prepare('UPDATE document_artifacts SET invoice_id = ?, revision = ?, uploaded_by = ? WHERE id = ?')
          .run(invoice.id, nextRevision.revision, user?.id || null, invoice.sourceArtifactId);
      }
    }
    getDatabase().prepare(`
      INSERT INTO evaluations (id, invoice_id, decision_json, policy_version, legal_version, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(evaluationId, invoice.id, JSON.stringify(result.decision), activePolicy.version, result.decision.applicableRegulations?.join(',') || null, timestamp);
    appendAuditEvent({
      eventType: 'INVOICE_EVALUATED',
      entityId: invoice.id,
      actorId: user?.id,
      payload: { evaluationId, invoice, decision: result.decision, policyVersion: activePolicy.version }
    });

    return NextResponse.json({ ...result, policy: { version: activePolicy.version, contentHash: activePolicy.contentHash } });
  } catch (error: any) {
    console.error('Error in /api/evaluate:', error);
    return NextResponse.json(
      { error: 'Lỗi trong quá trình đối soát hóa đơn', message: error.message },
      { status: 500 }
    );
  }
}
