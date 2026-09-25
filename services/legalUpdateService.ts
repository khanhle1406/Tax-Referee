import crypto from 'node:crypto';
import { getDatabase, jsonNow } from '@/lib/server/db';
import { appendAuditEvent } from '@/lib/server/audit';
import { LegalUpdateCandidate, LegalUpdateCandidateSchema, LegalUpdateStatus } from '@/lib/schemas';

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

export function updateLegalCandidateStatus(id: string, status: LegalUpdateStatus, actorId?: string, reason = ''): LegalUpdateCandidate {
  const db = getDatabase();
  const timestamp = jsonNow();
  const result = db.prepare('UPDATE legal_update_candidates SET status = ?, updated_at = ? WHERE id = ?').run(status, timestamp, id);
  if (!result.changes) throw new Error('Không tìm thấy bản cập nhật pháp lý');
  const candidate = listLegalUpdates().find((item) => item.id === id);
  if (!candidate) throw new Error('Không đọc được bản cập nhật pháp lý sau khi cập nhật');
  appendAuditEvent({ eventType: `LEGAL_UPDATE_${status}`, entityId: id, actorId, payload: { candidate, reason } });
  return candidate;
}
