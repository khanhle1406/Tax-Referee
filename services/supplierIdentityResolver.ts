import type Database from 'better-sqlite3';
import { getDatabase } from '@/lib/server/db';
import { allowGroundingCall } from '@/lib/server/aiBudget';
import { SupplierIdentity, SupplierIdentitySchema } from '@/lib/schemas';
import { normalizeTaxCodeFormat, validateTaxCode } from '@/lib/taxCode';
import { lookupDemoSupplier } from '@/lib/server/demoSupplierCatalog';
import { lookupByTaxCode, normalizeCompanyName, SupplierLookupResult } from './taxLookupService';

export type SupplierIdentityQuery = { supplierName?: string; supplierTaxCode?: string; address?: string };
type Search = (input: SupplierIdentityQuery) => Promise<SupplierIdentity>;
type Candidate = { taxCode: string; legalName: string; address?: string };
export type IdentityProviders = {
  exact: (code: string) => Promise<SupplierLookupResult | null>;
  candidates: (name: string) => Promise<Candidate[]>;
};
const POSITIVE_TTL = 7 * 24 * 60 * 60 * 1000;
/** Khóa ngân sách theo DB của phiên (mỗi phiên demo một DB), không lộ đường dẫn file. */
const sessionKeys = new WeakMap<Database.Database, string>();
function sessionKey(db: Database.Database): string {
  let key = sessionKeys.get(db);
  if (!key) { key = Math.random().toString(36).slice(2) + Date.now().toString(36); sessionKeys.set(db, key); }
  return key;
}
const states = new WeakMap<Database.Database, {
  pending: Map<string, Promise<SupplierIdentity>>;
  failures: Map<string, { result: SupplierIdentity; until: number }>;
}>();

function addressKey(address = ''): string {
  return address.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, ' ').trim();
}

function readRecord(db: Database.Database, code: string): SupplierIdentity | null {
  const row = db.prepare('SELECT payload_json FROM supplier_identity_records WHERE tax_code=? AND expires_at>?')
    .get(code, Date.now()) as { payload_json: string } | undefined;
  if (!row) return null;
  try {
    const parsed = SupplierIdentitySchema.safeParse(JSON.parse(row.payload_json));
    if (!parsed.success || parsed.data.status !== 'VERIFIED' || !parsed.data.sources.length) return null;
    return { ...parsed.data, lookupMethod: 'LOCAL_VERIFIED' };
  } catch { return null; }
}

function conflict(record: SupplierIdentity): SupplierIdentity {
  return { ...record, status: 'CONFLICT', message: 'MST trên ảnh không khớp nhà cung cấp đã xác minh; giữ nguyên để kiểm tra.' };
}

function readLocal(db: Database.Database, input: SupplierIdentityQuery): SupplierIdentity | null {
  const name = normalizeCompanyName(input.supplierName || '');
  const code = normalizeTaxCodeFormat(input.supplierTaxCode || '');
  const address = addressKey(input.address);
  const codeRecord = code ? readRecord(db, code) : null;
  if (codeRecord && (!name || name === normalizeCompanyName(codeRecord.legalName || ''))) return codeRecord;
  if (!name) return null;
  const rows = db.prepare(`SELECT r.tax_code, '' address_key, 'LEGAL' kind FROM supplier_identity_records r
      WHERE r.normalized_name=? AND r.expires_at>?
    UNION SELECT a.tax_code, a.address_key, 'ALIAS' kind FROM supplier_identity_aliases a
      JOIN supplier_identity_records r ON r.tax_code=a.tax_code
      WHERE a.normalized_alias=? AND a.expires_at>? AND r.expires_at>?`)
    .all(name, Date.now(), name, Date.now(), Date.now()) as Array<{ tax_code: string; address_key: string; kind: string }>;
  // Address-specific brand aliases cannot be reused for another shop or for a
  // receipt without an address. Never collapse a branch MST to the parent code.
  const matching = rows.filter(row => row.kind === 'LEGAL'
    || (row.address_key ? address && row.address_key === address : !address || code === row.tax_code));
  if (codeRecord && matching.some(row => row.tax_code === code)) return codeRecord;
  const codes = [...new Set(matching.map(row => row.tax_code))];
  if (codes.length > 1 || (!address && new Set(rows.map(row => row.tax_code)).size > 1)) {
    return { status: 'AMBIGUOUS', sources: [], lookupMethod: 'LOCAL_VERIFIED', message: 'Thương hiệu liên quan nhiều pháp nhân hoặc chi nhánh; cần thêm manh mối từ ảnh.' };
  }
  if (codes.length !== 1) return null;
  const record = readRecord(db, codes[0]);
  if (!record) return null;
  return input.supplierTaxCode && code !== codes[0] ? conflict(record) : record;
}

function remember(db: Database.Database, input: SupplierIdentityQuery, result: SupplierIdentity): void {
  if (result.status !== 'VERIFIED' || !result.legalName || !result.supplierTaxCode || !result.sources.length) return;
  const taxCode = result.supplierTaxCode;
  const legalName = result.legalName;
  const timestamp = result.verifiedAt || new Date().toISOString();
  const sourceExpiry = result.sourceUpdatedAt ? Date.parse(result.sourceUpdatedAt) + 30 * 24 * 60 * 60 * 1000 : Infinity;
  const until = Math.min(Date.now() + POSITIVE_TTL, sourceExpiry);
  db.transaction(() => {
    const prior = db.prepare('SELECT normalized_name FROM supplier_identity_records WHERE tax_code=?')
      .get(taxCode) as { normalized_name: string } | undefined;
    db.prepare(`INSERT INTO supplier_identity_records VALUES (?,?,?,?,?)
      ON CONFLICT(tax_code) DO UPDATE SET normalized_name=excluded.normalized_name,
      payload_json=excluded.payload_json, verified_at=excluded.verified_at, expires_at=excluded.expires_at`)
      .run(taxCode, normalizeCompanyName(legalName), JSON.stringify(result), timestamp, until);
    db.prepare('INSERT INTO supplier_identity_history (tax_code,original_name,payload_json,verified_at) VALUES (?,?,?,?)')
      .run(taxCode, input.supplierName || null, JSON.stringify(result), timestamp);
    if (prior?.normalized_name && prior.normalized_name !== normalizeCompanyName(legalName)) {
      db.prepare(`INSERT INTO supplier_identity_aliases VALUES (?,?,?,?)
        ON CONFLICT(normalized_alias,tax_code,address_key) DO UPDATE SET expires_at=excluded.expires_at`)
        .run(prior.normalized_name, taxCode, '', until);
    }
    const alias = normalizeCompanyName(input.supplierName || '');
    if (alias) db.prepare(`INSERT INTO supplier_identity_aliases VALUES (?,?,?,?)
      ON CONFLICT(normalized_alias,tax_code,address_key) DO UPDATE SET expires_at=excluded.expires_at`)
      .run(alias, taxCode, addressKey(input.address), until);
  })();
}

function fromTaxRecord(record: SupplierLookupResult | null): SupplierIdentity | null {
  if (!record?.isVerified || !record.legalName || !record.evidenceUrl || !record.sourceUpdatedAt
    || !validateTaxCode(record.taxCode).isValid) return null;
  const age = Date.now() - Date.parse(record.sourceUpdatedAt);
  if (!Number.isFinite(age) || age < -300000 || age > 30 * 24 * 60 * 60 * 1000) return null;
  return {
    status: 'VERIFIED', legalName: record.legalName, supplierTaxCode: record.taxCode,
    address: record.address, verifiedAt: new Date().toISOString(), sourceUpdatedAt: record.sourceUpdatedAt,
    lookupMethod: 'TAX_REGISTRY', sources: [{ title: 'Dữ liệu người nộp thuế', url: record.evidenceUrl }],
    message: 'Đã đối chiếu MST và tên pháp lý từ dữ liệu thuế.'
  };
}

async function searchCandidates(name: string): Promise<Candidate[]> {
  const key = process.env.DOANHNGHIEP_API_KEY?.trim();
  if (!key || !name) return [];
  try {
    const url = new URL('https://doanhnghiep.vn/api/v1/search');
    url.searchParams.set('q', name); url.searchParams.set('limit', '20');
    const response = await fetch(url, {
      headers: { 'x-api-key': key, Accept: 'application/json', 'User-Agent': 'TaxReferee/2.0' },
      signal: AbortSignal.timeout(4000), cache: 'no-store'
    });
    if (!response.ok) return [];
    const payload = await response.json();
    // Search results are discovery hints, never identity proof. A truncated
    // list cannot establish uniqueness; fall back to contextual search.
    if (!Array.isArray(payload.items) || payload.items.length >= 20) return [];
    return payload.items.flatMap((row: Record<string, unknown>) => {
      const code = typeof row.mst === 'string' ? normalizeTaxCodeFormat(row.mst) : null;
      if (!code || !validateTaxCode(code).isValid || typeof row.name_vi !== 'string') return [];
      return [{ taxCode: code, legalName: row.name_vi, address: typeof row.address_full === 'string' ? row.address_full : undefined }];
    });
  } catch { return []; }
}

const defaultProviders: IdentityProviders = {
  exact: code => lookupByTaxCode(code, { forceRefresh: true }),
  candidates: searchCandidates
};

async function resolveFresh(input: SupplierIdentityQuery, search: Search, providers: IdentityProviders): Promise<SupplierIdentity> {
  const name = normalizeCompanyName(input.supplierName || '');
  const rawCode = input.supplierTaxCode || '';
  const code = normalizeTaxCodeFormat(rawCode);
  if (code && validateTaxCode(code).isValid) {
    const record = await providers.exact(code).catch(() => null);
    const identity = fromTaxRecord(record);
    // A structured tax lookup confirms the exact MST. Name/brand conflicts
    // still require a separately corroborated association from search.
    if (identity && identity.supplierTaxCode === code && (!name || [record?.legalName, record?.tradeName, record?.internationalName]
      .some(value => value && normalizeCompanyName(value) === name))) return identity;
  }
  if (!rawCode && name) {
    const candidates = await providers.candidates(input.supplierName || '').catch(() => []);
    const matches = [...new Map(candidates.filter(row => normalizeCompanyName(row.legalName) === name)
      .map(row => [row.taxCode, row])).values()];
    if (matches.length > 1 && !input.address) return { status: 'AMBIGUOUS', sources: [], message: 'Có nhiều doanh nghiệp trùng tên; chưa tự gán MST.' };
    if (matches.length > 1 && matches.length <= 5 && input.address) {
      // The search endpoint may omit address. Fetch authoritative candidate
      // records in parallel, rather than trusting a directory's address hint.
      const records = await Promise.all(matches.map(async candidate => {
        const record = fromTaxRecord(await providers.exact(candidate.taxCode).catch(() => null));
        return record?.supplierTaxCode === candidate.taxCode && normalizeCompanyName(record.legalName || '') === name ? record : null;
      }));
      if (records.every(record => record !== null)) {
        const byAddress = records.filter(record => record?.address && addressKey(record.address) === addressKey(input.address));
        if (byAddress.length === 1) return byAddress[0]!;
        if (byAddress.length > 1) return { status: 'AMBIGUOUS', sources: [], message: 'Nhiều pháp nhân cùng tên và địa chỉ; chưa tự gán MST.' };
      }
    }
    if (matches.length === 1) {
      const taxRecord = await providers.exact(matches[0].taxCode).catch(() => null);
      const identity = fromTaxRecord(taxRecord);
      if (identity?.supplierTaxCode === matches[0].taxCode && normalizeCompanyName(identity.legalName || '') === name) return identity;
    }
  }
  // Ngân sách tra cứu có grounding (OWASP LLM10): một điểm chặn cho mọi đường (file, văn bản dán, tra cứu MST). Vượt trần thì fail-closed.
  if (!allowGroundingCall(sessionKey(getDatabase()))) return { status: 'SOURCE_UNAVAILABLE', sources: [], message: 'Đã vượt hạn mức tra cứu trực tuyến trong giờ; cần xác minh thủ công.', lookupMethod: 'SEARCH_GROUNDING' };
  const result = await search(input).catch((): SupplierIdentity => ({ status: 'SOURCE_UNAVAILABLE', sources: [], message: 'Chưa truy cập được nguồn tra cứu.' }));
  return { ...result, lookupMethod: 'SEARCH_GROUNDING', verifiedAt: result.status === 'VERIFIED' ? new Date().toISOString() : undefined };
}

/** Scope caches and in-flight requests to the request database, not the process. */
export async function resolveSupplierIdentity(input: SupplierIdentityQuery, search: Search, providers = defaultProviders): Promise<SupplierIdentity> {
  const query = {
    supplierName: input.supplierName?.trim().slice(0, 240),
    supplierTaxCode: input.supplierTaxCode?.trim().slice(0, 32),
    address: input.address?.trim().slice(0, 320)
  };
  const originals = { originalSupplierName: query.supplierName, originalSupplierTaxCode: query.supplierTaxCode };
  if (!query.supplierName && !query.supplierTaxCode) return { status: 'NOT_FOUND', sources: [], ...originals };
  const demo = lookupDemoSupplier(query);
  if (demo) return {...demo, ...originals};
  const db = getDatabase();
  const local = readLocal(db, query);
  if (local) return { ...local, ...originals };
  let state = states.get(db);
  if (!state) { state = { pending: new Map(), failures: new Map() }; states.set(db, state); }
  const key = JSON.stringify([normalizeCompanyName(query.supplierName || ''), query.supplierTaxCode || '', addressKey(query.address)]);
  const failure = state.failures.get(key);
  if (failure && failure.until > Date.now()) return { ...failure.result, ...originals };
  state.failures.delete(key);
  let pending = state.pending.get(key);
  if (!pending) {
    pending = resolveFresh(query, search, providers).then(rawResult => {
      const parsed = SupplierIdentitySchema.safeParse(rawResult);
      let result: SupplierIdentity = parsed.success ? parsed.data : { status: 'SOURCE_UNAVAILABLE', sources: [] };
      if (result.status === 'VERIFIED') {
        if (!result.legalName || !result.supplierTaxCode || !validateTaxCode(result.supplierTaxCode).isValid || !result.sources.length) {
          result = { status: 'NOT_FOUND', sources: [], message: 'Kết quả thiếu bằng chứng danh tính hợp lệ.' };
        } else if (query.supplierTaxCode && normalizeTaxCodeFormat(query.supplierTaxCode) !== result.supplierTaxCode) {
          result = conflict(result);
        }
      }
      remember(db, query, result);
      if (result.status !== 'VERIFIED') {
        if (state!.failures.size >= 200) state!.failures.delete(state!.failures.keys().next().value!);
        state!.failures.set(key, { result, until: Date.now() + (result.status === 'SOURCE_UNAVAILABLE' ? 15000 : 60000) });
      }
      return result;
    }).finally(() => state!.pending.delete(key));
    state.pending.set(key, pending);
  }
  return { ...await pending, ...originals };
}
