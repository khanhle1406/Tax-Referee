import crypto from 'node:crypto';
import { getDatabase, jsonNow } from '@/lib/server/db';
import { appendAuditEvent } from '@/lib/server/audit';
import { LegalUpdateCandidate, LegalUpdateCandidateSchema, LegalUpdateStatus } from '@/lib/schemas';
import { runLegalCrawler, KNOWN_BASELINE_REGULATIONS } from './legalCrawlerService';
import { createNotification } from './notificationService';

type FeedDocument = {
  code: string;
  title: string;
  publishedDate?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  summary?: string;
  content: string;
  sourceUrl?: string;
};

function hash(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function getFeedUrls(): string[] {
  return (process.env.LEGAL_UPDATE_FEED_URLS || '').split(',').map((value) => value.trim()).filter(Boolean);
}

function makeDiff(previous: string, next: string): string {
  if (!previous) return 'Văn bản mới: toàn bộ nội dung là nội dung mới.';
  if (previous === next) return 'Không phát hiện thay đổi nội dung.';
  const previousLines = new Set(previous.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
  const added = next.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !previousLines.has(line));
  return added.length ? `Dòng mới hoặc thay đổi:\n${added.slice(0, 80).map((line) => `+ ${line}`).join('\n')}` : 'Nội dung đã thay đổi nhưng chưa tách được dòng khác biệt.';
}

function candidateFromDocument(sourceId: string, document: FeedDocument, previousContent = ''): LegalUpdateCandidate {
  const timestamp = jsonNow();
  const contentHash = hash(document.content);
  return LegalUpdateCandidateSchema.parse({
    id: crypto.randomUUID(),
    sourceId,
    documentCode: document.code,
    title: document.title,
    publishedDate: document.publishedDate,
    effectiveFrom: document.effectiveFrom,
    effectiveTo: document.effectiveTo,
    status: 'NEEDS_REVIEW',
    summary: document.summary || 'Văn bản mới từ nguồn pháp lý được cấu hình.',
    diff: makeDiff(previousContent, document.content),
    affectedRuleIds: [],
    sourceUrl: document.sourceUrl,
    contentHash,
    createdAt: timestamp,
    updatedAt: timestamp
  });
}

async function fetchFeed(url: string): Promise<FeedDocument[]> {
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000), headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Nguồn pháp lý trả về HTTP ${response.status}`);
  const payload = await response.json() as unknown;
  if (!Array.isArray(payload)) throw new Error('Feed pháp lý phải là JSON array');
  return payload as FeedDocument[];
}

export async function syncLegalUpdates(): Promise<{ runId: string; found: number; candidates: LegalUpdateCandidate[]; errors: string[] }> {
  const db = getDatabase();
  const runId = crypto.randomUUID();
  const startedAt = jsonNow();
  db.prepare(`INSERT INTO legal_sync_runs (id, status, created_at) VALUES (?, 'RUNNING', ?)`).run(runId, startedAt);
  const candidates: LegalUpdateCandidate[] = [];
  const errors: string[] = [];

  // 1. Quét dữ liệu cào tự động từ các Cổng Pháp lý Chính thống
  try {
    const crawlResult = await runLegalCrawler();
    candidates.push(...crawlResult.candidates);
  } catch (crawlErr) {
    const msg = crawlErr instanceof Error ? crawlErr.message : String(crawlErr);
    errors.push(`Crawler chính thống: ${msg}`);
  }

  // 2. Quét tiếp các Feed URL tùy chọn (nếu có cấu hình thêm trong .env)
  const feedUrls = getFeedUrls();
  for (const url of feedUrls) {
    try {
      const source = db.prepare('SELECT id FROM legal_sources WHERE base_url = ? OR id = ? LIMIT 1').get(url, url) as { id?: string } | undefined;
      const sourceId = source?.id || `external-${hash(url).slice(0, 12)}`;
      if (!source) {
        db.prepare('INSERT OR IGNORE INTO legal_sources (id, name, base_url, enabled) VALUES (?, ?, ?, 1)')
          .run(sourceId, `Nguồn pháp lý ${url}`, url);
      }
      const documents = await fetchFeed(url);
      for (const document of documents) {
        const latest = db.prepare(`
          SELECT v.content FROM legal_documents d
          LEFT JOIN legal_document_versions v ON v.id = d.latest_version_id
          WHERE d.source_id = ? AND d.document_code = ?
        `).get(sourceId, document.code) as { content?: string } | undefined;
        const candidate = candidateFromDocument(sourceId, document, latest?.content || '');
        db.prepare(`
          INSERT INTO legal_update_candidates
          (id, source_id, document_code, title, published_date, effective_from, effective_to, status, summary, diff, affected_rule_ids_json, source_url, content_hash, created_at, updated_at)
          VALUES (@id, @sourceId, @documentCode, @title, @publishedDate, @effectiveFrom, @effectiveTo, @status, @summary, @diff, @affectedRuleIds, @sourceUrl, @contentHash, @createdAt, @updatedAt)
        `).run({
          id: candidate.id,
          sourceId: candidate.sourceId,
          documentCode: candidate.documentCode,
          title: candidate.title,
          publishedDate: candidate.publishedDate || null,
          effectiveFrom: candidate.effectiveFrom || null,
          effectiveTo: candidate.effectiveTo || null,
          status: candidate.status,
          summary: candidate.summary,
          diff: candidate.diff,
          affectedRuleIds: JSON.stringify(candidate.affectedRuleIds),
          sourceUrl: candidate.sourceUrl || null,
          contentHash: candidate.contentHash || null,
          createdAt: candidate.createdAt,
          updatedAt: candidate.updatedAt
        });
        candidates.push(candidate);
      }
      db.prepare('UPDATE legal_sources SET last_checked_at = ?, last_error = NULL WHERE id = ?').run(jsonNow(), sourceId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${url}: ${message}`);
    }
  }

  db.prepare(`UPDATE legal_sync_runs SET status = ?, sources_checked = ?, documents_found = ?, error_message = ?, finished_at = ? WHERE id = ?`)
    .run(errors.length ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED', feedUrls.length, candidates.length, errors.join('\n') || null, jsonNow(), runId);
  appendAuditEvent({ eventType: 'LEGAL_SYNC_COMPLETED', entityId: runId, payload: { found: candidates.length, errors } });
  return { runId, found: candidates.length, candidates, errors };
}

export function listLegalUpdates(status?: LegalUpdateStatus): LegalUpdateCandidate[] {
  const rows = (status
    ? getDatabase().prepare('SELECT * FROM legal_update_candidates WHERE status = ? ORDER BY datetime(created_at) DESC').all(status)
    : getDatabase().prepare('SELECT * FROM legal_update_candidates ORDER BY datetime(created_at) DESC').all()) as Array<Record<string, unknown>>;
  return rows.map((row) => LegalUpdateCandidateSchema.parse({
    id: row.id,
    sourceId: row.source_id,
    documentCode: row.document_code,
    title: row.title,
    publishedDate: row.published_date || undefined,
    effectiveFrom: row.effective_from || undefined,
    effectiveTo: row.effective_to || undefined,
    status: row.status,
    summary: row.summary,
    diff: row.diff,
    affectedRuleIds: JSON.parse(String(row.affected_rule_ids_json || '[]')),
    sourceUrl: row.source_url || undefined,
    contentHash: row.content_hash || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

export function normalizeDocumentCode(code: string): string {
  return code.trim().replace(/\s+/g, ' ').toUpperCase();
}

export interface IncomingLegalDocPayload {
  code: string;
  title: string;
  issuer?: string;
  publishedDate?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  summary?: string;
  content: string;
  sourceUrl?: string;
  affectedRules?: string[];
}

/**
 * Xử lý dữ liệu văn bản pháp luật mới tiếp nhận theo thời gian thực (Push Webhook).
 * Thực hiện khử trùng lặp qua 4 cấp độ: Canonization -> Baseline Registry -> Hash SHA-256 -> Candidate Queue.
 */
export async function processIncomingLegalUpdate(
  doc: IncomingLegalDocPayload,
  sourceName: string
): Promise<{ status: string; message: string; candidate?: LegalUpdateCandidate }> {
  const db = getDatabase();
  const normalizedCode = normalizeDocumentCode(doc.code);
  const contentHash = hash(doc.content);
  const timestamp = jsonNow();

  // 1. Kiểm tra đối soát với KNOWN_BASELINE_REGULATIONS (Luật cũ đã nạp sẵn)
  const isBaseline = KNOWN_BASELINE_REGULATIONS.find(
    (b) => normalizeDocumentCode(b.code) === normalizedCode
  );

  // 2. Tra cứu văn bản đã lưu trong DB
  const existingDoc = db.prepare(`
    SELECT d.id, d.latest_version_id, v.content, v.content_hash
    FROM legal_documents d
    LEFT JOIN legal_document_versions v ON v.id = d.latest_version_id
    WHERE UPPER(d.document_code) = ?
  `).get(normalizedCode) as { id?: string; latest_version_id?: string; content?: string; content_hash?: string } | undefined;

  // Nếu đã có trong DB và hash giống hệt -> Không tạo candidate trùng lặp
  if (existingDoc && existingDoc.content_hash === contentHash) {
    return {
      status: 'SKIPPED_EXISTING',
      message: `Văn bản ${normalizedCode} đã được đồng bộ chuẩn mực trong hệ thống.`
    };
  }

  // Nếu là văn bản baseline và hash trùng baseline
  if (isBaseline && hash(isBaseline.content) === contentHash) {
    return {
      status: 'SKIPPED_BASELINE',
      message: `Văn bản ${normalizedCode} thuộc Khung Quy chế chuẩn mực TAX-SOP-2026 hiện hành.`
    };
  }

  // Kiểm tra xem đã có candidate NEEDS_REVIEW nào cho văn bản này với cùng contentHash chưa
  const existingCandidate = db.prepare(`
    SELECT id FROM legal_update_candidates
    WHERE UPPER(document_code) = ? AND content_hash = ? AND status = 'NEEDS_REVIEW'
  `).get(normalizedCode, contentHash) as { id?: string } | undefined;

  if (existingCandidate) {
    return {
      status: 'ALREADY_PENDING',
      message: `Văn bản ${normalizedCode} đang trong hàng đợi chờ Kế toán trưởng phê duyệt.`
    };
  }

  // 3. Tạo mới Candidate chờ duyệt
  const sourceId = `webhook-${sourceName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`;
  db.prepare('INSERT OR IGNORE INTO legal_sources (id, name, base_url, enabled) VALUES (?, ?, ?, 1)')
    .run(sourceId, sourceName, doc.sourceUrl || 'https://webhook.internal');

  const previousContent = existingDoc?.content || (isBaseline ? isBaseline.content : '');
  const diff = makeDiff(previousContent, doc.content);

  const candidate = LegalUpdateCandidateSchema.parse({
    id: crypto.randomUUID(),
    sourceId,
    documentCode: doc.code,
    title: doc.title,
    publishedDate: doc.publishedDate || undefined,
    effectiveFrom: doc.effectiveFrom || undefined,
    effectiveTo: doc.effectiveTo || undefined,
    status: 'NEEDS_REVIEW',
    summary: doc.summary || `Văn bản mới tiếp nhận qua ${sourceName}.`,
    diff,
    affectedRuleIds: doc.affectedRules || [],
    sourceUrl: doc.sourceUrl || undefined,
    contentHash,
    createdAt: timestamp,
    updatedAt: timestamp
  });

  db.prepare(`
    INSERT INTO legal_update_candidates
    (id, source_id, document_code, title, published_date, effective_from, effective_to, status, summary, diff, affected_rule_ids_json, source_url, content_hash, created_at, updated_at)
    VALUES (@id, @sourceId, @documentCode, @title, @publishedDate, @effectiveFrom, @effectiveTo, @status, @summary, @diff, @affectedRuleIds, @sourceUrl, @contentHash, @createdAt, @updatedAt)
  `).run({
    id: candidate.id,
    sourceId: candidate.sourceId,
    documentCode: candidate.documentCode,
    title: candidate.title,
    publishedDate: candidate.publishedDate || null,
    effectiveFrom: candidate.effectiveFrom || null,
    effectiveTo: candidate.effectiveTo || null,
    status: candidate.status,
    summary: candidate.summary,
    diff: candidate.diff,
    affectedRuleIds: JSON.stringify(candidate.affectedRuleIds),
    sourceUrl: candidate.sourceUrl || null,
    contentHash: candidate.contentHash || null,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt
  });

  // Bắn thông báo Toaster & Notification Center cho Kế toán trưởng
  createNotification({
    type: 'LEGAL_UPDATE',
    title: `Tiếp nhận văn bản mới: ${candidate.documentCode}`,
    message: `${candidate.title} vừa được phát hiện từ nguồn ${sourceName}. Chờ Kế toán trưởng thẩm định và kích hoạt.`,
    link: 'policy-viewer:legal'
  });

  appendAuditEvent({
    eventType: 'LEGAL_UPDATE_RECEIVED',
    entityId: candidate.id,
    payload: { candidate, sourceName }
  });

  return {
    status: 'CANDIDATE_CREATED',
    message: `Đã tiếp nhận văn bản ${candidate.documentCode} và gửi thông báo tới Kế toán trưởng.`,
    candidate
  };
}

export function updateLegalCandidateStatus(id: string, status: LegalUpdateStatus, actorId?: string, reason = ''): LegalUpdateCandidate {
  const db = getDatabase();
  const timestamp = jsonNow();
  const result = db.prepare('UPDATE legal_update_candidates SET status = ?, updated_at = ? WHERE id = ?').run(status, timestamp, id);
  if (!result.changes) throw new Error('Không tìm thấy bản cập nhật pháp lý');
  const candidate = listLegalUpdates().find((item) => item.id === id);
  if (!candidate) throw new Error('Không đọc được bản cập nhật pháp lý sau khi cập nhật');

  // Khi được phê duyệt (APPROVED): tự động đồng bộ vào legal_documents và thông báo toàn hệ thống
  if (status === 'APPROVED') {
    const docId = `doc-${candidate.documentCode.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`;
    const versionId = `ver-${docId}-${Date.now()}`;

    db.prepare(`
      INSERT OR REPLACE INTO legal_documents (id, source_id, document_code, title, source_url, latest_version_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(docId, candidate.sourceId, candidate.documentCode, candidate.title, candidate.sourceUrl || '', versionId, timestamp);

    db.prepare(`
      INSERT INTO legal_document_versions (id, document_id, published_date, effective_from, effective_to, content, content_hash, fetched_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      versionId,
      docId,
      candidate.publishedDate || timestamp.slice(0, 10),
      candidate.effectiveFrom || timestamp.slice(0, 10),
      candidate.effectiveTo || null,
      candidate.diff || candidate.summary,
      candidate.contentHash || hash(candidate.summary),
      timestamp
    );

    createNotification({
      type: 'PRECEDENT',
      title: `Đã kích hoạt văn bản: ${candidate.documentCode}`,
      message: `Kế toán trưởng đã phê chuẩn văn bản ${candidate.documentCode}. Quy chế kiểm tra thuế đã được nâng cấp hiệu lực.`,
      link: 'policy-viewer:legal'
    });
  }

  appendAuditEvent({ eventType: `LEGAL_UPDATE_${status}`, entityId: id, actorId, payload: { candidate, reason } });
  return candidate;
}

