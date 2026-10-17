import crypto from 'node:crypto';
import { DEV_LLM_API_CONFIG } from '@/lib/constants';
import { fetchOfficialSourceText, officialTextSupportsIdentity } from '@/lib/server/officialSourceEvidence';
import { getDatabase, jsonNow } from '@/lib/server/db';
import { validateTaxCode } from '@/lib/taxCode';
import { getSupplier, upsertSupplier } from './supplierService';

export { validateTaxCode } from '@/lib/taxCode';

export interface SupplierLookupResult {
  taxCode: string;
  legalName?: string;
  internationalName?: string;
  tradeName?: string;
  address?: string;
  status?: string;
  source: 'INTERNAL_DB' | 'VIETQR_GDT' | 'XINVOICE_TAX_API' | 'INVOICE_CONFIRMED_ALIAS' | 'BUSINESS_SEARCH_GDT';
  confidence: number;
  isVerified: boolean;
  sourceUpdatedAt?: string;
  evidenceUrl?: string;
  notes?: string;
}

// VietQR relays GDT snapshots that update per entity, not hourly. Keep an
// accepted source snapshot at most 30 days old and recheck our local copy weekly.
const MAX_GDT_SOURCE_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_LOCAL_TAX_CACHE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_LOCAL_XINVOICE_CACHE_AGE_MS = 24 * 60 * 60 * 1000;
const VERIFIED_TAX_LOOKUP_SOURCES = new Set(['TCT_PORTAL', 'NATIONAL_BIZ_REGISTRY', 'XINVOICE_TAX_API']);

/**
 * Normalize only typography and legal-form prefixes/suffixes. Preserve all
 * business words (including dịch vụ, thương mại, đầu tư, Win/Vin) so two
 * distinct entities do not collapse to the same fuzzy key.
 */
export function normalizeCompanyName(name: string): string {
  if (!name) return '';
  let normalized = name.toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd')
    .replace(/&/g, ' va ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

  const prefixes = [
    'limited liability company', 'joint stock company', 'company limited',
    'private enterprise', 'household business', 'corporation',
    'cong ty trach nhiem huu han mot thanh vien', 'cong ty trach nhiem huu han',
    'cong ty co phan', 'cong ty tnhh mtv', 'cong ty tnhh', 'cong ty cp',
    'cty tnhh mtv', 'cty tnhh', 'cty cp', 'ctcp', 'tnhh mtv', 'tnhh',
    'cong ty', 'cty'
  ];
  const suffixes = [
    'joint stock company', 'company limited', 'cong ty co phan', 'cong ty tnhh',
    'co ltd', 'company', 'corporation', 'limited', 'jsc', 'ltd', 'corp'
  ];
  let changed = true;
  while (changed && normalized) {
    changed = false;
    const prefix = prefixes.find((candidate) => normalized === candidate || normalized.startsWith(`${candidate} `));
    if (prefix && normalized.length > prefix.length) {
      normalized = normalized.slice(prefix.length).trim();
      changed = true;
      continue;
    }
    const suffix = suffixes.find((candidate) => normalized === candidate || normalized.endsWith(` ${candidate}`));
    if (suffix && normalized.length > suffix.length) {
      normalized = normalized.slice(0, -suffix.length).trim();
      changed = true;
    }
  }
  return normalized;
}

function normalizeCompanyNameForSimilarity(name: string): string {
  return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd')
    .replace(/&/g, ' va ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function editSimilarity(left: string, right: string): number {
  if (!left || !right) return 0;
  if (left === right) return 1;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i++) {
    const current = [i];
    for (let j = 1; j <= right.length; j++) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1)
      );
    }
    previous = current;
  }
  return 1 - previous[right.length] / Math.max(left.length, right.length);
}

function companyNameSimilarity(left: string, right: string): number {
  if (companyLegalFormsConflict(left, right)) return 0;
  const rawLeft = normalizeCompanyNameForSimilarity(left);
  const rawRight = normalizeCompanyNameForSimilarity(right);
  if (Math.min(rawLeft.length, rawRight.length) < 8) return 0;
  return Math.max(
    editSimilarity(rawLeft, rawRight),
    editSimilarity(normalizeCompanyName(left), normalizeCompanyName(right))
  );
}

type CompanyLegalForm = 'JOINT_STOCK' | 'LIMITED' | 'PRIVATE' | 'HOUSEHOLD' | 'COOPERATIVE' | 'CORPORATION' | 'COMPANY';

function companyLegalForm(name: string): CompanyLegalForm | undefined {
  const normalized = normalizeCompanyNameForSimilarity(name);
  if (/\b(?:co phan|ctcp|joint stock company|jsc)\b/.test(normalized)) return 'JOINT_STOCK';
  if (/\b(?:tnhh|trach nhiem huu han|limited liability company|company limited|co ltd|limited|ltd|llc)\b/.test(normalized)) return 'LIMITED';
  if (/\b(?:doanh nghiep tu nhan|dntn|private enterprise)\b/.test(normalized)) return 'PRIVATE';
  if (/\b(?:ho kinh doanh|household business)\b/.test(normalized)) return 'HOUSEHOLD';
  if (/\b(?:hop tac xa|cooperative)\b/.test(normalized)) return 'COOPERATIVE';
  if (/\b(?:corporation|corp)\b/.test(normalized)) return 'CORPORATION';
  if (/\b(?:cong ty|cty|company)\b/.test(normalized)) return 'COMPANY';
  return undefined;
}

function companyLegalFormsConflict(left: string, right: string): boolean {
  const leftForm = companyLegalForm(left);
  const rightForm = companyLegalForm(right);
  return Boolean(leftForm && rightForm && leftForm !== rightForm);
}

function exactCompanyNameVariants(value: string): Set<string> {
  const normalized = normalizeCompanyName(value);
  return new Set(normalized ? [normalized, normalized.replace(/\btp\b/g, 'thanh pho')] : []);
}

/** Compare full normalized names; parenthetical branch qualifiers remain significant. */
export function companyNameMatches(name: string, registeredName: string): boolean {
  if (!name.trim() || !registeredName.trim()) return false;
  // Distinct legal forms can identify distinct entities sharing a brand name.
  // A missing form can still be resolved by a separately registered trade
  // name or an address-backed match; it is not an exact legal-name match.
  if (companyLegalForm(name) !== companyLegalForm(registeredName)) return false;
  const invoiceNames = exactCompanyNameVariants(name);
  return [...exactCompanyNameVariants(registeredName)].some((candidate) => invoiceNames.has(candidate));
}

function splitNameAnnotations(value: string): { core: string; annotations: string[] } {
  const annotations = [...value.matchAll(/[([{（]([^\])}）]+)[\])}）]/g)]
    .map((match) => match[1].trim())
    .filter(Boolean);
  const core = value.replace(/\s*[([{（][^\])}）]*[\])}）]\s*/g, ' ').trim();
  return { core, annotations };
}

/**
 * Match a printed seller name against verified legal/international/trade names.
 * Parenthetical text is optional only when it independently matches another
 * verified name; branch labels cannot disappear during comparison.
 */
function supplierNamesMatch(name: string, registeredNames: Array<string | undefined>): boolean {
  const candidates = registeredNames.filter((candidate): candidate is string => Boolean(candidate?.trim()));
  if (candidates.some((candidate) => companyNameMatches(name, candidate))) return true;

  const input = splitNameAnnotations(name);
  if (input.annotations.length
    && candidates.some((candidate) => companyNameMatches(input.core, candidate))
    && input.annotations.every((annotation) => candidates.some((candidate) => companyNameMatches(annotation, candidate)))) {
    return true;
  }

  return candidates.some((candidate) => {
    const registered = splitNameAnnotations(candidate);
    return registered.annotations.length > 0
      && companyNameMatches(name, registered.core)
      && registered.annotations.every((annotation) => candidates.some((knownName) => companyNameMatches(annotation, knownName)));
  });
}

/**
 * An invoice may print a branch/location qualifier alongside the legal name.
 * Ignore that qualifier only when the unqualified name matches a registered
 * name and the printed address independently matches the registry address.
 */
function supplierNameMatchesAtAddress(
  name: string,
  registeredNames: Array<string | undefined>,
  invoiceAddress: string | undefined,
  registeredAddress: string | undefined
): boolean {
  if (supplierNamesMatch(name, registeredNames)) return true;
  const annotated = splitNameAnnotations(name);
  const branchlessName = companyNameWithoutUnitQualifier(annotated.core);
  if (!invoiceAddress || !registeredAddress || !businessAddressMatches(invoiceAddress, registeredAddress)) return false;
  const registryVariants = registeredNames.filter((candidate): candidate is string => Boolean(candidate?.trim()))
    .flatMap((candidate) => {
      const core = companyNameCore(candidate);
      return [candidate, core, companyNameWithoutUnitQualifier(core)];
    });
  return Boolean(
    supplierNamesMatch(branchlessName, registryVariants)
    || registryVariants.some((candidate) => companyNameSimilarity(branchlessName, candidate) >= 0.92)
  );
}

function supplierNameHasAddressCorroboratedOcrTypo(
  name: string,
  registeredNames: Array<string | undefined>,
  invoiceAddress: string | undefined,
  registeredAddress: string | undefined
): boolean {
  if (supplierNamesMatch(name, registeredNames)
    || !invoiceAddress || !registeredAddress
    || !businessAddressMatches(invoiceAddress, registeredAddress)) return false;
  const branchlessName = companyNameWithoutUnitQualifier(splitNameAnnotations(name).core);
  const registryVariants = registeredNames.filter((candidate): candidate is string => Boolean(candidate?.trim()))
    .flatMap((candidate) => {
      const core = companyNameCore(candidate);
      return [candidate, core, companyNameWithoutUnitQualifier(core)];
    });
  return registryVariants.some((candidate) => {
    const similarity = companyNameSimilarity(branchlessName, candidate);
    return similarity >= 0.92 && similarity < 1;
  });
}

function companyNameCore(value: string): string {
  return splitNameAnnotations(value).core;
}

function companyNameWithoutUnitQualifier(value: string): string {
  return value.replace(/\s*(?:[-–—,]\s*)?(?:chi\s*nhánh|cửa\s*hàng|địa\s*điểm\s*kinh\s*doanh|văn\s*phòng\s*đại\s*diện|\bcn\b|\bbranch\b|\bstore\b|\boutlet\b)\s*[:#-]?.*$/i, '').trim();
}

function normalizeBusinessAddress(address: string): string {
  return address.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd')
    .replace(/\btp\.?\s+/g, 'thanh pho ')
    .replace(/\bq\.?\s+/g, 'quan ')
    .replace(/\bp\.?\s+/g, 'phuong ')
    .replace(/\bd\.?\s+/g, 'duong ')
    .replace(/^(?:dia chi|address)\s+/g, '')
    .replace(/\bso\b\s*/g, '')
    .replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function businessAddressMatches(invoiceAddress: string, registeredAddress: string): boolean {
  const invoice = normalizeBusinessAddress(invoiceAddress);
  const registered = normalizeBusinessAddress(registeredAddress);
  if (!invoice || !registered) return false;
  if (invoice === registered) return true;

  // A shared ward/district/city substring can identify many branches. For a
  // partial or OCR-shortened match, require the first address number
  // (normally the house/site number) to match as well.
  const firstNumber = (value: string) => value.match(/(?:^|\s)(\d+[a-z]?)(?=\s|$)/i)?.[1]?.toLowerCase();
  const invoiceNumber = firstNumber(invoice);
  const registeredNumber = firstNumber(registered);
  if (!invoiceNumber || !registeredNumber || invoiceNumber !== registeredNumber) return false;
  if (Math.min(invoice.length, registered.length) >= 18 && (invoice.includes(registered) || registered.includes(invoice))) return true;

  // OCR may omit address components or misread a short token. Keep the
  // relaxed path conservative: same house/site number plus at least three
  // distinctive shared address tokens and strong overlap with the shorter
  // address. Generic address words and directions cannot identify a branch.
  const genericTokens = new Set([
    'so', 'duong', 'pho', 'street', 'st', 'road', 'rd', 'quan', 'q', 'huyen', 'district',
    'phuong', 'p', 'ward', 'xa', 'thi', 'town', 'thanh', 'pho', 'city', 'tp', 'tinh',
    'province', 'viet', 'nam', 'building', 'to', 'khu', 'ap'
  ]);
  const addressTokens = (value: string) => [...new Set(value.split(' ')
    .filter((token) => token.length >= 2 && !/^\d+[a-z]?$/i.test(token) && !genericTokens.has(token)))];
  const invoiceTokens = addressTokens(invoice);
  const registeredTokens = new Set(addressTokens(registered));
  const shared = invoiceTokens.filter((token) => registeredTokens.has(token)).length;
  const shorterLength = Math.min(invoiceTokens.length, registeredTokens.size);
  const unionLength = invoiceTokens.length + registeredTokens.size - shared;
  return shorterLength >= 3 && shared >= 3
    && shared / shorterLength >= 0.6
    && shared / unionLength >= 0.28;
}

async function disambiguateByAddress(
  candidates: SupplierLookupResult[],
  address: string | undefined
): Promise<SupplierLookupResult | null> {
  if (!address || candidates.length < 2 || candidates.length > 5 || candidates.some((candidate) => !candidate.address)) return null;
  const matches = candidates.filter((candidate) => businessAddressMatches(address, candidate.address!));
  return matches.length === 1 ? matches[0] : null;
}

export function recordConfirmedSupplierAlias(input: {
  supplierName: string;
  supplierTaxCode: string;
  supplierAddress?: string;
  invoiceId: string;
  nameEvidence: string;
  taxCodeEvidence: string;
  verifiedBy: string;
  confirmedAt?: string;
}): void {
  const aliasName = input.supplierName.trim();
  const normalizedAlias = normalizeCompanyName(aliasName);
  const taxCode = input.supplierTaxCode.trim().replace(/[^0-9-]/g, '');
  const mst = validateTaxCode(taxCode);
  if (!normalizedAlias || !mst.isValid || mst.reason || !input.verifiedBy || !input.invoiceId) return;

  const db = getDatabase();
  const now = jsonNow();
  db.prepare(`INSERT INTO supplier_name_aliases
    (id,alias_name,normalized_alias,supplier_tax_code,evidence_invoice_id,evidence,verified_by,confirmed_at,created_at)
    VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT(normalized_alias,supplier_tax_code) DO UPDATE SET
      alias_name=excluded.alias_name,
      evidence_invoice_id=excluded.evidence_invoice_id,
      evidence=excluded.evidence,
      verified_by=excluded.verified_by,
      confirmed_at=excluded.confirmed_at`).run(
    crypto.randomUUID(), aliasName, normalizedAlias, mst.normalized, input.invoiceId,
    JSON.stringify({
      supplierName: input.nameEvidence,
      supplierTaxCode: input.taxCodeEvidence,
      supplierAddress: input.supplierAddress?.trim() || undefined
    }),
    input.verifiedBy, input.confirmedAt || now, now
  );
}

function isWithinAge(date: string | undefined, maxAgeMs: number): boolean {
  if (!date) return false;
  const timestamp = Date.parse(date);
  return Number.isFinite(timestamp) && timestamp <= Date.now() + 5 * 60_000 && Date.now() - timestamp <= maxAgeMs;
}

function normalizeRequestedTaxCode(value: string): string | null {
  const normalized = value.trim().replace(/\s+/g, '');
  const result = validateTaxCode(normalized);
  return result.isValid ? result.normalized : null;
}

type OnlineCompanyCandidate = {
  taxCode: string;
  name_vi?: string;
  name_en?: string;
  address?: string;
  sourceUrl?: string;
};

type OfficialSourceBusinessSearchResult = {
  candidates: Array<{ taxCode: string; name: string; address?: string; sourceUrl: string }>;
};

function devLlmCredentials(): { apiKey: string; baseUrl: string; model: string } | null {
  if (process.env.SUPPLIER_ONLINE_IDENTITY_LOOKUP_ENABLED !== 'true') return null;
  const { API_KEY: apiKey, BASE_URL: baseUrl, MODEL: model } = DEV_LLM_API_CONFIG;
  if (!apiKey || !baseUrl || !model) return null;
  return { apiKey, baseUrl, model };
}

function isOfficialRegistryUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return ['dangkykinhdoanh.gov.vn', 'gdt.gov.vn', 'tracuunnt.gdt.gov.vn']
      .some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

function parseModelJson<T>(value: string): T | null {
  const unwrapped = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(unwrapped) as T; } catch { /* model may wrap JSON in a short preamble */ }
  const start = unwrapped.indexOf('{');
  const end = unwrapped.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(unwrapped.slice(start, end + 1)) as T; } catch { return null; }
}

async function groundedCandidateTaxCodeIsCited(
  taxCode: string,
  businessName: string,
  sourceUrl: string
): Promise<boolean> {
  if (!isOfficialRegistryUrl(sourceUrl)) return false;
  const text = await fetchOfficialSourceText(sourceUrl);
  return Boolean(text && officialTextSupportsIdentity(text, businessName, taxCode));
}

async function discoverGroundedCompanyCandidates(
  name: string,
  address: string | undefined,
  limit: number,
  supplierSearchContext?: string
): Promise<OnlineCompanyCandidate[]> {
  const credentials = devLlmCredentials();
  if (!credentials) return [];
  const prompt = `Tra cứu doanh nghiệp Việt Nam dựa trên tên bên bán in trên hóa đơn và địa chỉ OCR nếu có.
Tìm ưu tiên tại dangkykinhdoanh.gov.vn, gdt.gov.vn và tracuunnt.gdt.gov.vn. Không dùng kiến thức nhớ sẵn, không tự tạo mã số thuế, không chọn kết quả chỉ vì tên gần giống. Mỗi ứng viên phải có URL nguồn chính thức cụ thể; máy chủ sẽ tải trang và kiểm tra MST, tên.
Nếu không có nguồn chính thức chứng minh rõ mã số thuế, trả candidates rỗng. Nếu có nhiều chi nhánh/pháp nhân khả dĩ, trả tất cả ứng viên liên quan để bước xác minh tiếp theo phân biệt; tối đa ${limit} ứng viên.
Tên OCR: ${JSON.stringify(name)}
Địa chỉ OCR: ${JSON.stringify(address || '')}
Ngữ cảnh OCR giới hạn ở phần đầu bên bán (chỉ là manh mối tìm kiếm, không phải bằng chứng pháp lý): ${JSON.stringify((supplierSearchContext || '').slice(0, 1200))}
Chỉ trả JSON theo schema với candidates gồm taxCode, name, address (nếu thấy), sourceUrl (URL chính thức trích dẫn).`;
  const url = `${credentials.baseUrl}/chat/completions`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${credentials.apiKey}`
      },
      body: JSON.stringify({
        model: credentials.model,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: 900,
        stream: false
      }),
      signal: AbortSignal.timeout(Number(process.env.SUPPLIER_LOOKUP_AI_TIMEOUT_MS || 12000)),
      cache: 'no-store'
    });
    if (!response.ok) {
      console.warn(`[TaxLookup] DEV_LLM API trả HTTP ${response.status}.`);
      return [];
    }
    const payload = await response.json();
    const rawText = payload?.choices?.[0]?.message?.content;
    if (typeof rawText !== 'string' || !rawText.trim()) return [];
    const parsed = parseModelJson<OfficialSourceBusinessSearchResult>(rawText);
    if (!parsed) return [];
    if (!Array.isArray(parsed?.candidates)) return [];
    const unique = new Map<string, OnlineCompanyCandidate>();
    for (const item of parsed.candidates) {
      if (!item || typeof item.taxCode !== 'string' || typeof item.name !== 'string' || typeof item.sourceUrl !== 'string') continue;
      const valid = validateTaxCode(item.taxCode);
      if (!valid.isValid || !await groundedCandidateTaxCodeIsCited(valid.normalized, item.name, item.sourceUrl)) continue;
      unique.set(valid.normalized, {
        taxCode: valid.normalized,
        name_vi: item.name,
        address: typeof item.address === 'string' ? item.address : undefined,
        sourceUrl: item.sourceUrl
      });
    }
    return [...unique.values()].slice(0, limit);
  } catch (error: any) {
    console.warn(`[TaxLookup] DEV_LLM không khả dụng (${error?.name || 'error'}).`);
    return [];
  }
}

async function discoverDoanhnghiepCompanyCandidates(
  name: string,
  address: string | undefined,
  limit: number
): Promise<OnlineCompanyCandidate[] | null> {
  if (process.env.SUPPLIER_ONLINE_IDENTITY_LOOKUP_ENABLED !== 'true') return [];
  const apiKey = process.env.DOANHNGHIEP_API_KEY?.trim();
  if (apiKey) {
    try {
      const url = new URL('https://doanhnghiep.vn/api/v1/search');
      url.searchParams.set('q', name);
      url.searchParams.set('limit', String(Math.max(1, Math.min(20, limit))));
      if (address) url.searchParams.set('address', address);
      const response = await fetch(url, {
        headers: { Accept: 'application/json', 'x-api-key': apiKey, 'User-Agent': 'TaxReferee/2.0' },
        signal: AbortSignal.timeout(5000),
        cache: 'no-store'
      });
      if (response.ok) {
        const payload = await response.json();
        const items = Array.isArray(payload?.items) ? payload.items : [];
        // Never infer uniqueness from a truncated provider search window.
        if (items.length >= Math.max(1, Math.min(20, limit))) return null;
        const candidates = items.flatMap((item: any) => {
          if (!item || typeof item.mst !== 'string') return [];
          const valid = validateTaxCode(item.mst);
          return valid.isValid ? [{
            taxCode: valid.normalized,
            name_vi: typeof item.name_vi === 'string' ? item.name_vi : undefined,
            name_en: typeof item.name_en === 'string' ? item.name_en : undefined,
            address: typeof item.address_full === 'string' ? item.address_full : undefined,
            sourceUrl: 'https://doanhnghiep.vn/api/v1/search'
          }] : [];
        });
        if (candidates.length) return [...new Map<string, OnlineCompanyCandidate>(
          candidates.map((item: OnlineCompanyCandidate) => [item.taxCode, item])
        ).values()];
      }
    } catch (error: any) {
      console.warn(`[TaxLookup] Business search API không khả dụng (${error?.name || 'error'}).`);
    }
  }

  return [];
}

async function discoverOnlineCompanyCandidates(
  name: string,
  address: string | undefined,
  limit: number,
  supplierSearchContext?: string
): Promise<OnlineCompanyCandidate[] | null> {
  const providerCandidates = await discoverDoanhnghiepCompanyCandidates(name, address, limit);
  if (providerCandidates === null) return null;
  if (providerCandidates.length) return providerCandidates;
  return discoverGroundedCompanyCandidates(name, address, Math.min(5, limit), supplierSearchContext);
}

/**
 * For a printed MST paired with a shop/brand name, require an independent
 * online name search to return the same MST before AI may link the brand to
 * the tax record. The invoice's MST and a registry lookup alone do not prove
 * that a conflicting OCR name belongs to the same legal entity.
 */
async function discoverPrintedTaxCodeAssociation(
  name: string,
  address: string | undefined,
  expectedTaxCode: string,
  supplierSearchContext?: string
): Promise<OnlineCompanyCandidate[]> {
  const searchCandidates = await discoverOnlineCompanyCandidates(name, address, 5, supplierSearchContext);
  if (searchCandidates === null) return [];
  const matches = searchCandidates.filter((candidate) => candidate.taxCode === expectedTaxCode);
  if (matches.length === 1) return matches;
  if (matches.length > 1) return [];

  // If a configured business API returned only fuzzy candidates, retry with
  // grounded official search rather than accepting a different tax code.
  const groundedCandidates = await discoverGroundedCompanyCandidates(name, address, 5, supplierSearchContext);
  const groundedMatches = groundedCandidates.filter((candidate) => candidate.taxCode === expectedTaxCode);
  return groundedMatches.length === 1 ? groundedMatches : [];
}

async function selectVerifiedSupplierWithAI(
  invoiceName: string,
  invoiceAddress: string | undefined,
  candidates: SupplierLookupResult[],
  discoveryCandidates: OnlineCompanyCandidate[],
  directPrintedTaxCode = false,
  supplierSearchContext?: string
): Promise<SupplierLookupResult | null> {
  const credentials = devLlmCredentials();
  if (!credentials || !candidates.length) return null;
  const url = `${credentials.baseUrl}/chat/completions`;
  const records = candidates.map((candidate) => {
    const discovery = discoveryCandidates.find((item) => item.taxCode === candidate.taxCode);
    return {
    taxCode: candidate.taxCode,
    legalName: candidate.legalName || '',
    internationalName: candidate.internationalName || '',
    tradeName: candidate.tradeName || '',
    registeredAddress: candidate.address || '',
    searchResultName: discovery?.name_vi || '',
    searchResultInternationalName: discovery?.name_en || '',
    searchResultAddress: discovery?.address || '',
    searchSource: discovery?.sourceUrl || '',
    status: candidate.status || ''
    };
  });
  const systemMessage = directPrintedTaxCode
    ? 'Bạn là bộ phân giải danh tính nhà cung cấp. MST đọc trực tiếp từ hóa đơn đã được đối chiếu chính xác với dịch vụ tra cứu thuế; một lần tra tên độc lập cũng trả về cùng MST. Chỉ dùng tên OCR, kết quả tra tên và hồ sơ thuế được cung cấp; không dùng trí nhớ, không sửa dữ kiện. Tên trên hóa đơn có thể là thương hiệu/tên cửa hàng/chi nhánh thuộc pháp nhân trong hồ sơ. Địa chỉ trên hóa đơn có thể là điểm bán và khác địa chỉ đăng ký; không bác bỏ chỉ vì địa chỉ khác. Chỉ MATCH nếu kết quả tra tên và tên OCR có quan hệ rõ ràng với pháp nhân trong hồ sơ thuế; nếu không thì NO_MATCH.'
    : 'Bạn là bộ phân giải danh tính nhà cung cấp. Chỉ dùng OCR, kết quả API tìm doanh nghiệp và hồ sơ thuế được cung cấp; không dùng trí nhớ, không sửa dữ kiện, không suy đoán theo thương hiệu nổi tiếng. Kết quả tìm kiếm chỉ là ứng viên, còn tên/MST/địa chỉ trong hồ sơ tra cứu thuế là căn cứ xác minh. Chỉ kết luận MATCH khi tên OCR có quan hệ rõ với tên pháp lý/quốc tế/tên giao dịch trong dữ liệu và địa chỉ phù hợp nếu hóa đơn có địa chỉ. Địa chỉ chi nhánh khác nhau hoặc nhiều pháp nhân cùng tên thì AMBIGUOUS. Nếu chỉ tên cửa hàng phổ biến và thiếu địa chỉ/quan hệ đăng ký thì AMBIGUOUS. Không có bằng chứng đủ mạnh thì NO_MATCH.';
  const messages = [
    {
      role: 'system',
      content: systemMessage
    },
    {
      role: 'user',
      content: `${directPrintedTaxCode ? 'MST bên bán in trên hóa đơn đã được dịch vụ tra cứu thuế trả về đúng mã; hãy chỉ kiểm tra tên có thuộc pháp nhân này không.' : 'So sánh hóa đơn với ứng viên tìm kiếm và hồ sơ tra cứu thuế được cung cấp.'}\nTên OCR: ${JSON.stringify(invoiceName)}\nĐịa chỉ OCR: ${JSON.stringify(invoiceAddress || '')}\nNgữ cảnh OCR giới hạn ở phần đầu bên bán (chỉ dùng làm manh mối, không thay thế hồ sơ chính thức): ${JSON.stringify((supplierSearchContext || '').slice(0, 1200))}\nHồ sơ: ${JSON.stringify(records)}\nTrả đúng JSON: {"decision":"MATCH|AMBIGUOUS|NO_MATCH","taxCode":"mã trong hồ sơ hoặc chuỗi rỗng","reason":"giải thích ngắn"}. Chỉ trả MATCH cho một MST duy nhất.`
    }
  ];
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${credentials.apiKey}`
      },
      body: JSON.stringify({
        model: credentials.model,
        messages,
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: 350,
        stream: false
      }),
      signal: AbortSignal.timeout(Number(process.env.SUPPLIER_LOOKUP_AI_TIMEOUT_MS || 12000)),
      cache: 'no-store'
    });
    if (!response.ok) {
      console.warn(`[TaxLookup] AI đối chiếu danh tính trả HTTP ${response.status}.`);
      return null;
    }
    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) return null;
    const decision = parseModelJson<{ decision?: string; taxCode?: string }>(content);
    if (!decision) return null;
    if (decision.decision !== 'MATCH' || typeof decision.taxCode !== 'string') return null;
    const selected = candidates.filter((candidate) => candidate.taxCode === decision.taxCode);
    if (selected.length !== 1) return null;
    return selected[0];
  } catch (error: any) {
    console.warn(`[TaxLookup] AI đối chiếu danh tính không khả dụng (${error?.name || 'error'}).`);
    return null;
  }
}

/**
 * Ask a business-search API or the configured LLM for official-source candidates,
 * verify every returned tax code against GDT, then let AI compare the invoice
 * name/address with those official records. Model-suggested codes are never
 * accepted without the GDT lookup.
 */
async function resolveOnlineCompanyCandidates(
  name: string,
  address: string | undefined,
  found: OnlineCompanyCandidate[],
  supplierSearchContext?: string
): Promise<{ result: SupplierLookupResult | null; verifiedCount: number }> {
  if (!found.length || found.length > 5) return { result: null, verifiedCount: 0 };
  let verifiedCount = 0;
  try {
    const verified = (await Promise.all(found.map((candidate) => lookupByTaxCode(candidate.taxCode))))
      .filter((candidate): candidate is SupplierLookupResult => Boolean(candidate?.isVerified));
    verifiedCount = verified.length;
    if (!verified.length) return { result: null, verifiedCount };
    const matched = await selectVerifiedSupplierWithAI(name, address, verified, found, false, supplierSearchContext);
    if (!matched) return { result: null, verifiedCount };
    const discovered = found.find((candidate) => candidate.taxCode === matched.taxCode);
    // AI can name a candidate but cannot break a real identity tie. Exactly one
    // GDT-verified record must independently match the full registered name or
    // the invoice address; conflicting official addresses disqualify records.
    const independentlyMatched = verified.filter((candidate) => {
      const exactRegisteredName = supplierNamesMatch(name, [
        candidate.legalName, candidate.internationalName, candidate.tradeName
      ]);
      const exactInternationalName = supplierNamesMatch(name, [candidate.internationalName]);
      const legalFormConflicts = Boolean(
        candidate.legalName && companyLegalFormsConflict(name, candidate.legalName) && !exactInternationalName
      );
      const registeredAddressMatches = Boolean(
        address && candidate.address && businessAddressMatches(address, candidate.address)
      );
      const addressConflicts = Boolean(address && candidate.address && !registeredAddressMatches);
      return !legalFormConflicts && !addressConflicts && (exactRegisteredName || registeredAddressMatches);
    });
    if (independentlyMatched.length !== 1 || independentlyMatched[0].taxCode !== matched.taxCode) {
      return { result: null, verifiedCount };
    }
    return {
      result: {
        ...matched,
        source: 'BUSINESS_SEARCH_GDT',
        confidence: 0.99,
        isVerified: true,
        notes: `AI đối chiếu tên/địa chỉ hóa đơn với hồ sơ doanh nghiệp tìm được và đã xác minh lại MST qua dịch vụ tra cứu thuế.${discovered?.sourceUrl ? ` Nguồn tìm kiếm: ${discovered.sourceUrl}.` : ''} ${matched.notes || ''}`.trim()
      },
      verifiedCount
    };
  } catch (error: any) {
    console.warn(`[TaxLookup] Xác minh ứng viên doanh nghiệp thất bại (${error?.name || 'error'}).`);
    return { result: null, verifiedCount };
  }
}

async function searchOnlineCompanyName(
  name: string,
  address?: string,
  supplierSearchContext?: string
): Promise<SupplierLookupResult | null> {
  const providerCandidates = await discoverDoanhnghiepCompanyCandidates(name, address, 5);
  if (providerCandidates === null) return null;
  if (providerCandidates.length) {
    const providerResolution = await resolveOnlineCompanyCandidates(name, address, providerCandidates, supplierSearchContext);
    if (providerResolution.result) return providerResolution.result;
    // Once official tax records exist, a failed or ambiguous identity match is
    // meaningful evidence. Do not bypass it by searching for another candidate.
    if (providerResolution.verifiedCount > 0) return null;
  }

  // The broader grounded search is a fallback when the primary search has no
  // tax-verifiable candidate, including when its provider is unavailable.
  const groundedCandidates = await discoverGroundedCompanyCandidates(name, address, 5, supplierSearchContext);
  const groundedResolution = await resolveOnlineCompanyCandidates(name, address, groundedCandidates, supplierSearchContext);
  return groundedResolution.result;
}

/** Resolve an exact tax code. Never treat demo/manual master data as verified. */
export async function lookupByTaxCode(taxCode: string, options?: { forceRefresh?: boolean }): Promise<SupplierLookupResult | null> {
  const cleanMst = normalizeRequestedTaxCode(taxCode);
  if (!cleanMst) return null;

  // Reuse a recent authoritative lookup before spending another online call.
  // Only rows written from an official lookup qualify; demo/manual suppliers do not.
  const cached = getSupplier(cleanMst);
  const maxCacheAge = cached?.verificationSource === 'XINVOICE_TAX_API'
    ? MAX_LOCAL_XINVOICE_CACHE_AGE_MS
    : MAX_LOCAL_TAX_CACHE_AGE_MS;
  if (!options?.forceRefresh && cached && VERIFIED_TAX_LOOKUP_SOURCES.has(cached.verificationSource)
    && isWithinAge(cached.lastVerifiedAt, maxCacheAge)) {
    return {
      taxCode: cached.taxCode,
      legalName: cached.legalName,
      internationalName: cached.internationalName,
      tradeName: cached.tradeName,
      address: cached.address,
      status: cached.status,
      source: 'INTERNAL_DB',
      confidence: 0.99,
      isVerified: true,
      notes: `Dùng kết quả tra cứu chính thức còn mới ${cached.lastVerifiedAt}`
    };
  }

  // VietQR has announced that its tax lookup endpoint will be retired on
  // 2027-03-01. Prefer its documented Xinvoice successor when credentials are
  // configured; keep the current source as a temporary fallback during migration.
  const xinvoiceClientId = process.env.XINVOICE_CLIENT_ID?.trim();
  const xinvoiceApiKey = process.env.XINVOICE_API_KEY?.trim();
  if (xinvoiceClientId && xinvoiceApiKey) {
    try {
      const response = await fetch(`https://api.xinvoice.vn/gdt-api/tax-payer/${encodeURIComponent(cleanMst)}`, {
        headers: {
          Accept: 'application/json',
          'client-id': xinvoiceClientId,
          'api-key': xinvoiceApiKey,
          'User-Agent': 'TaxReferee/2.0'
        },
        signal: AbortSignal.timeout(5000),
        cache: 'no-store'
      });
      if (response.ok) {
        const payload = await response.json();
        const business = payload?.data && typeof payload.data === 'object' ? payload.data
          : payload?.result && typeof payload.result === 'object' ? payload.result
          : payload;
        const returnedMst = validateTaxCode(String(business?.taxID || business?.taxId || business?.taxCode || '').replace(/[^0-9-]/g, '')).normalized;
        const legalName = typeof business?.name === 'string' ? business.name.trim() : '';
        const updatedAt = typeof business?.updatedAt === 'string' ? business.updatedAt : '';
        if (returnedMst === cleanMst && legalName && isWithinAge(updatedAt, MAX_GDT_SOURCE_AGE_MS)) {
          const status = typeof business.status === 'string' ? business.status : undefined;
          const address = typeof business.address === 'string' ? business.address.trim() || undefined : undefined;
          const existing = getSupplier(cleanMst);
          const normalizedStatus = status && /đang hoạt động/i.test(status)
            ? 'ACTIVE'
            : status && /ngừng|tạm ngừng/i.test(status)
            ? 'SUSPENDED'
            : status && /chấm dứt|giải thể|không hoạt động/i.test(status)
            ? 'CLOSED'
            : existing?.status || 'SUSPENDED';
          upsertSupplier({
            taxCode: cleanMst,
            legalName,
            address,
            status: normalizedStatus,
            verificationSource: 'XINVOICE_TAX_API',
            notes: `Tra cứu qua Xinvoice; MST khớp chính xác, dữ liệu cập nhật ${updatedAt}`
          });
          return {
            taxCode: cleanMst,
            legalName,
            address,
            status,
            source: 'XINVOICE_TAX_API',
            sourceUpdatedAt: updatedAt,
            evidenceUrl: `https://api.xinvoice.vn/gdt-api/tax-payer/${encodeURIComponent(cleanMst)}`,
            confidence: 0.98,
            isVerified: true,
            notes: `MST khớp chính xác qua dịch vụ tra cứu thuế; dữ liệu cập nhật ${updatedAt}`
          };
        }
      }
    } catch (error: any) {
      console.warn(`[TaxLookup] Xinvoice không khả dụng (${error?.name || 'error'}).`);
    }
  }

  try {
    const response = await fetch(`https://api.vietqr.io/v2/business/${encodeURIComponent(cleanMst)}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'TaxReferee/2.0' },
      signal: AbortSignal.timeout(5000),
      cache: 'no-store'
    });
    if (response.ok) {
      const payload = await response.json();
      const business = payload?.data;
      const sourceUrl = typeof payload?.metadata?.source === 'string' ? payload.metadata.source : '';
      const returnedMstRaw = String(business?.id || business?.taxCode || '').replace(/[^0-9-]/g, '');
      const returnedMst = validateTaxCode(returnedMstRaw).normalized;
      const legalName = typeof business?.name === 'string' ? business.name.trim() : '';
      const internationalName = typeof business?.internationalName === 'string' ? business.internationalName.trim() || undefined : undefined;
      const updatedAt = payload?.metadata?.updatedAt;
      const sourceIsTaxAuthority = /^https:\/\/(?:www\.)?gdt\.gov\.vn\/?$/i.test(sourceUrl);

      // Require exact returned ID, an explicit GDT source and recent source data.
      // A successful HTTP response alone is not evidence that this is the same entity.
      if (payload?.code === '00' && returnedMst === cleanMst && legalName && sourceIsTaxAuthority
        && isWithinAge(updatedAt, MAX_GDT_SOURCE_AGE_MS)) {
        const status = typeof business.status === 'string' ? business.status : undefined;
        const address = typeof business.address === 'string' ? business.address.trim() || undefined : undefined;
        const tradeName = typeof business.shortName === 'string' ? business.shortName.trim() || undefined : undefined;
        const existing = getSupplier(cleanMst);
        const normalizedStatus = status && /đang hoạt động/i.test(status)
          ? 'ACTIVE'
          : status && /ngừng|tạm ngừng/i.test(status)
          ? 'SUSPENDED'
          : status && /chấm dứt|giải thể|không hoạt động/i.test(status)
          ? 'CLOSED'
          : existing?.status || 'SUSPENDED';
        upsertSupplier({
          taxCode: cleanMst,
          legalName,
          internationalName,
          tradeName,
          address,
          status: normalizedStatus,
          verificationSource: 'TCT_PORTAL',
          notes: `Tra cứu qua VietQR; dữ liệu nguồn Cục Thuế cập nhật ${updatedAt}`
        });
        return {
          taxCode: cleanMst,
          legalName,
          internationalName,
          tradeName,
          address,
          status,
          source: 'VIETQR_GDT',
          sourceUpdatedAt: updatedAt,
          evidenceUrl: `https://api.vietqr.io/v2/business/${encodeURIComponent(cleanMst)}`,
          confidence: 1,
          isVerified: true,
          notes: `MST trùng chính xác; nguồn Cục Thuế cập nhật ${updatedAt}`
        };
      }
    }
  } catch (error: any) {
    console.warn('[TaxLookup] Tra cứu MST thất bại:', error?.message || 'unknown error');
  }

  return null;
}

/**
 * Resolve confirmed aliases and exact local records first. On a local miss,
 * online AI can select among company-search candidates, but a result is only
 * auto-filled after its MST is verified against tax data and the invoice name
 * or address independently corroborates that registered identity.
 */
export async function lookupByName(
  name: string,
  context?: { address?: string; rawText?: string; supplierSearchContext?: string }
): Promise<SupplierLookupResult | null> {
  const normalizedName = normalizeCompanyName(name.trim());
  if (!normalizedName) return null;
  const db = getDatabase();

  const aliases = db.prepare(`SELECT supplier_tax_code, alias_name, evidence FROM supplier_name_aliases
    WHERE normalized_alias=? ORDER BY confirmed_at DESC`).all(normalizedName) as Array<{
      supplier_tax_code: string; alias_name: string; evidence: string;
    }>;
  const compatibleAliases = aliases.filter((alias) => !companyLegalFormsConflict(name, alias.alias_name));
  if (aliases.length && !compatibleAliases.length) return null;
  if (compatibleAliases.length > 1) {
    if (!context?.address || compatibleAliases.length > 5) return null;
    const verifiedAliases = await Promise.all(compatibleAliases.map(async (alias) => {
      const verified = await lookupByTaxCode(alias.supplier_tax_code);
      let evidenceAddress: string | undefined;
      try { evidenceAddress = JSON.parse(alias.evidence || '{}')?.supplierAddress; } catch { /* older alias row */ }
      return verified?.isVerified ? { ...verified, aliasName: alias.alias_name, evidenceAddress } : null;
    }));
    if (verifiedAliases.some((candidate) => !candidate || (!candidate.address && !candidate.evidenceAddress))) return null;
    const legalFormCompatibleAliases = verifiedAliases.filter((candidate) =>
      Boolean(candidate?.legalName && !companyLegalFormsConflict(name, candidate.legalName))
    );
    const addressMatches = legalFormCompatibleAliases.filter((candidate): candidate is SupplierLookupResult & {
      aliasName: string; evidenceAddress: string | undefined;
    } => Boolean(
      candidate && [candidate.address, candidate.evidenceAddress]
        .some((address) => address && businessAddressMatches(context.address!, address))
    ));
    if (addressMatches.length !== 1) return null;
    const { aliasName, evidenceAddress: _evidenceAddress, ...addressMatch } = addressMatches[0];
    return {
      ...addressMatch,
      tradeName: aliasName,
      source: 'INVOICE_CONFIRMED_ALIAS',
      confidence: 1,
      isVerified: true,
      notes: 'Tên đã được xác nhận trước đây; địa chỉ trên hóa đơn khớp duy nhất với đơn vị đã xác minh.'
    };
  }
  if (compatibleAliases.length === 1) {
    const alias = compatibleAliases[0];
    const verified = await lookupByTaxCode(alias.supplier_tax_code);
    if (!verified?.isVerified) return null;
    if (verified.legalName && companyLegalFormsConflict(name, verified.legalName)) return null;
    const officialNameMatches = supplierNamesMatch(name, [verified.legalName, verified.internationalName, verified.tradeName]);
    let evidenceAddress: string | undefined;
    try { evidenceAddress = JSON.parse(alias.evidence || '{}')?.supplierAddress; } catch { /* older alias row */ }
    if (context?.address) {
      const addressMatches = [verified.address, evidenceAddress]
        .some((address) => address && businessAddressMatches(context.address!, address));
      if (!addressMatches) return null;
    } else if (!officialNameMatches) {
      // A one-time reviewed shop alias does not identify which branch issued
      // a future receipt unless its current or previously confirmed address is
      // visible, or the registry itself confirms the exact name.
      return null;
    }
    return {
      ...verified,
      taxCode: verified.taxCode,
      tradeName: alias.alias_name,
      source: 'INVOICE_CONFIRMED_ALIAS',
      confidence: 1,
      isVerified: true,
      notes: context?.address
        ? 'Tên và MST đã được xác nhận trước đây; MST còn khớp nguồn thuế và địa chỉ trùng hồ sơ đã xác nhận.'
        : 'Tên và MST đã được xác nhận trước đây; tên cũng khớp hồ sơ thuế hiện tại.'
    };
  }

  // A small OCR typo can make an already reviewed alias miss its exact key.
  // Treat similarity as candidate retrieval only: require an invoice address
  // that matches the reviewed evidence or the current tax record, then
  // re-verify the unique tax code before returning it. If the alias window is
  // saturated, or more than one entity remains plausible, leave it unresolved.
  if (!aliases.length && context?.address) {
    const aliasRows = db.prepare(`SELECT supplier_tax_code, alias_name, evidence FROM supplier_name_aliases
      ORDER BY confirmed_at DESC LIMIT 1001`).all() as Array<{
        supplier_tax_code: string; alias_name: string; evidence: string;
      }>;
    if (aliasRows.length <= 1000) {
      const typoCandidates = aliasRows.filter((alias) => {
        if (companyLegalFormsConflict(name, alias.alias_name)) return false;
        const similarity = companyNameSimilarity(name, alias.alias_name);
        return similarity >= 0.92 && similarity < 1;
      });
      const candidatesByTaxCode = new Map<string, typeof typoCandidates>();
      for (const alias of typoCandidates) {
        let evidenceAddress: string | undefined;
        try { evidenceAddress = JSON.parse(alias.evidence || '{}')?.supplierAddress; } catch { /* older alias row */ }
        if (evidenceAddress && !businessAddressMatches(context.address, evidenceAddress)) continue;
        const candidates = candidatesByTaxCode.get(alias.supplier_tax_code) || [];
        candidates.push(alias);
        candidatesByTaxCode.set(alias.supplier_tax_code, candidates);
      }

      if (candidatesByTaxCode.size > 0 && candidatesByTaxCode.size <= 5) {
        const verifiedCandidates = await Promise.all([...candidatesByTaxCode].map(async ([taxCode, candidateAliases]) => {
          const verified = await lookupByTaxCode(taxCode);
          if (!verified?.isVerified || !verified.legalName || companyLegalFormsConflict(name, verified.legalName)) {
            return { kind: 'unresolved' as const };
          }
          const addressMatches = candidateAliases.some((alias) => {
            let evidenceAddress: string | undefined;
            try { evidenceAddress = JSON.parse(alias.evidence || '{}')?.supplierAddress; } catch { /* older alias row */ }
            return Boolean(evidenceAddress && businessAddressMatches(context.address!, evidenceAddress));
          }) || Boolean(verified.address && businessAddressMatches(context.address!, verified.address));
          return addressMatches
            ? { kind: 'match' as const, verified, alias: candidateAliases[0] }
            : { kind: 'no-match' as const };
        }));
        const hasUnresolvedCandidate = verifiedCandidates.some((candidate) => candidate.kind === 'unresolved');
        const addressMatches: Array<{ verified: SupplierLookupResult; alias: (typeof typoCandidates)[number] }> = [];
        for (const candidate of verifiedCandidates) {
          if (candidate.kind === 'match') addressMatches.push(candidate);
        }
        const uniqueTaxCodes = [...new Set(addressMatches.map(({ verified }) => verified.taxCode))];
        if (!hasUnresolvedCandidate && uniqueTaxCodes.length === 1 && addressMatches.length === 1) {
          const { verified, alias } = addressMatches[0];
          return {
            ...verified,
            tradeName: alias.alias_name,
            source: 'INVOICE_CONFIRMED_ALIAS',
            confidence: 1,
            isVerified: true,
            notes: 'Tên OCR gần với bí danh đã được xác nhận; địa chỉ hóa đơn khớp và MST đã được xác minh lại.'
          };
        }
      }
    }
  }

  const rows = db.prepare(`SELECT tax_code, legal_name, international_name, trade_name, address, verification_source, last_verified_at
    FROM supplier_master WHERE verification_source IN ('TCT_PORTAL','NATIONAL_BIZ_REGISTRY','XINVOICE_TAX_API')`).all() as Array<{
      tax_code: string; legal_name: string; international_name: string | null; trade_name: string | null;
      address: string | null; verification_source: string; last_verified_at: string;
    }>;
  const exactCandidates = rows.filter((row) => supplierNamesMatch(name, [
    row.legal_name, row.international_name || undefined, row.trade_name || undefined
  ]) || supplierNameMatchesAtAddress(name, [
    row.legal_name, row.international_name || undefined, row.trade_name || undefined
  ], context?.address, row.address || undefined));
  const uniqueCodes = [...new Set(exactCandidates.map((row) => row.tax_code))];
  if (uniqueCodes.length > 1) {
    if (!context?.address || uniqueCodes.length > 5) return null;
    const verifiedCandidates = (await Promise.all(uniqueCodes.map((taxCode) => lookupByTaxCode(taxCode))))
      .filter((candidate): candidate is SupplierLookupResult => Boolean(
        candidate?.isVerified && supplierNameMatchesAtAddress(name, [candidate.legalName, candidate.internationalName, candidate.tradeName], context?.address, candidate.address)
      ));
    const addressMatch = await disambiguateByAddress(verifiedCandidates, context.address);
    if (addressMatch) return addressMatch;
  }
  if (uniqueCodes.length === 1) {
    const verified = await lookupByTaxCode(uniqueCodes[0]);
    if (verified?.isVerified && supplierNameMatchesAtAddress(name, [verified.legalName, verified.internationalName, verified.tradeName], context?.address, verified.address)) return verified;
  }

  // Prefer recent official tax data and confirmed aliases. On a local miss,
  // use a business-search API (or grounded Google Search) and semantic AI
  // comparison; never infer the seller by a regex/fuzzy name match.
  const onlineMatch = await searchOnlineCompanyName(name.trim(), context?.address, context?.supplierSearchContext);
  return onlineMatch?.isVerified ? onlineMatch : null;
}

/** Fill the missing counterpart only when its source relationship is verified. */
export async function autoEnrichSupplierData(params: {
  supplierTaxCode?: string;
  supplierName?: string;
  address?: string;
  rawText?: string;
  supplierSearchContext?: string;
}): Promise<{
  supplierTaxCode?: string;
  supplierName?: string;
  address?: string;
  enrichedField?: 'supplierName' | 'supplierTaxCode';
  enrichedFields?: Array<'supplierName' | 'supplierTaxCode'>;
  isVerified?: boolean;
  notes?: string;
  conflictFields?: Array<'supplierName' | 'supplierTaxCode'>;
}> {
  const taxCode = params.supplierTaxCode?.trim();
  const name = params.supplierName?.trim();
  const validTaxCode = Boolean(taxCode && validateTaxCode(taxCode).isValid);

  if (validTaxCode && !name) {
    const lookup = await lookupByTaxCode(taxCode!);
    if (lookup?.isVerified && lookup.legalName) {
      return {
        supplierTaxCode: lookup.taxCode,
        supplierName: lookup.legalName,
        address: params.address || lookup.address,
        enrichedField: 'supplierName',
        enrichedFields: ['supplierName'],
        isVerified: true,
        notes: lookup.notes
      };
    }
  }

  // OCR sometimes reads a plausible-length MST with a bad checksum. That
  // unusable token should not block exact-name verification from filling it.
  if (name && !validTaxCode) {
    const lookup = await lookupByName(name, {
      address: params.address, rawText: params.rawText, supplierSearchContext: params.supplierSearchContext
    });
    if (lookup?.isVerified && lookup.taxCode) {
      const correctedOcrName = Boolean(lookup.legalName && supplierNameHasAddressCorroboratedOcrTypo(
        name, [lookup.legalName, lookup.internationalName, lookup.tradeName], params.address, lookup.address
      ));
      return {
        supplierTaxCode: lookup.taxCode,
        supplierName: correctedOcrName ? lookup.legalName : name,
        address: params.address || lookup.address,
        enrichedField: 'supplierTaxCode',
        enrichedFields: correctedOcrName ? ['supplierTaxCode', 'supplierName'] : ['supplierTaxCode'],
        isVerified: true,
        notes: taxCode
          ? `Mã số thuế OCR không hợp lệ đã được thay bằng MST khớp tên pháp nhân và đã đối chiếu nguồn thuế. ${lookup.notes || ''}`.trim()
          : correctedOcrName
          ? `Tên OCR được sửa theo tên pháp lý đã xác minh bằng MST và địa chỉ trên hóa đơn. ${lookup.notes || ''}`.trim()
          : lookup.notes
      };
    }
  }

  // When both OCR fields exist, verify they refer to the same legal entity.
  // Never silently overwrite conflicting source evidence.
  if (validTaxCode && name) {
    const lookup = await lookupByTaxCode(taxCode!);
    if (lookup?.isVerified && lookup.legalName) {
      const registeredNames = [lookup.legalName, lookup.internationalName, lookup.tradeName];
      const nameHasOcrTypo = supplierNameHasAddressCorroboratedOcrTypo(name, registeredNames, params.address, lookup.address);
      const namesAgree = supplierNameMatchesAtAddress(name, registeredNames, params.address, lookup.address);
      if (!namesAgree) {
        if (companyLegalFormsConflict(name, lookup.legalName)) {
          return {
            supplierTaxCode: params.supplierTaxCode,
            supplierName: params.supplierName,
            address: params.address,
            isVerified: false,
            conflictFields: ['supplierName', 'supplierTaxCode'],
            notes: `Loại hình trong tên OCR khác hồ sơ thuế theo MST ${lookup.taxCode}; giữ nguyên để kế toán xác minh.`
          };
        }
        // A verified printed MST alone is not enough to resolve a conflicting
        // OCR name. Require a separate name lookup to return this exact MST,
        // then ask AI to compare that search result with the official tax
        // record. Outlet addresses can differ from the registered address.
        const association = await discoverPrintedTaxCodeAssociation(
          name, params.address, lookup.taxCode, params.supplierSearchContext
        );
        const aiConfirmedName = association.length === 1
          ? await selectVerifiedSupplierWithAI(name, params.address, [lookup], association, true, params.supplierSearchContext)
          : null;
        if (aiConfirmedName?.isVerified && aiConfirmedName.taxCode === lookup.taxCode && lookup.legalName) {
          return {
            supplierTaxCode: lookup.taxCode,
            supplierName: lookup.legalName,
            address: params.address || lookup.address,
            enrichedField: 'supplierName',
            enrichedFields: ['supplierName'],
            isVerified: true,
            notes: `MST in trên hóa đơn đã khớp hồ sơ thuế; tra cứu tên doanh nghiệp độc lập trả về cùng MST và AI xác nhận tên cửa hàng/thương hiệu thuộc pháp nhân. Địa chỉ điểm bán có thể khác địa chỉ đăng ký.`
          };
        }

        // A checksum-valid OCR substitution can point to a real but unrelated
        // company. Replace it only when the extracted supplier name resolves
        // uniquely to a second official record and the printed address also
        // matches that record. The two independent invoice fields must agree
        // before correcting a syntactically valid MST.
        const byName = await lookupByName(name, {
          address: params.address, rawText: params.rawText, supplierSearchContext: params.supplierSearchContext
        });
        const invoiceAddressConfirmsName = Boolean(
          byName?.isVerified
          && byName.taxCode !== validateTaxCode(taxCode!).normalized
          && params.address
          && byName.address
          && businessAddressMatches(params.address, byName.address)
          && supplierNameMatchesAtAddress(name, [byName.legalName, byName.internationalName, byName.tradeName], params.address, byName.address)
        );
        if (byName?.isVerified && invoiceAddressConfirmsName) {
          const correctedName = Boolean(byName.legalName && supplierNameHasAddressCorroboratedOcrTypo(
            name, [byName.legalName, byName.internationalName, byName.tradeName], params.address, byName.address
          ));
          return {
            supplierTaxCode: byName.taxCode,
            supplierName: correctedName ? byName.legalName : name,
            address: params.address || byName.address,
            enrichedField: 'supplierTaxCode',
            enrichedFields: correctedName ? ['supplierTaxCode', 'supplierName'] : ['supplierTaxCode'],
            isVerified: true,
            notes: `MST OCR hợp lệ về cấu trúc nhưng không khớp tên; đã thay bằng MST ${byName.taxCode} vì tên và địa chỉ cùng khớp hồ sơ thuế chính thức.${correctedName ? ' Tên OCR cũng được sửa theo tên pháp lý đã xác minh.' : ''}`
          };
        }
        return {
          supplierTaxCode: params.supplierTaxCode,
          supplierName: params.supplierName,
          address: params.address,
          isVerified: false,
          conflictFields: ['supplierName', 'supplierTaxCode'],
          notes: `Tên nhà cung cấp OCR không khớp pháp nhân theo MST ${lookup.taxCode}; giữ nguyên hai giá trị để tránh gán nhầm hóa đơn.`
        };
      }
      return {
        supplierTaxCode: lookup.taxCode,
        supplierName: nameHasOcrTypo ? lookup.legalName : name,
        address: params.address || lookup.address,
        ...(nameHasOcrTypo ? { enrichedField: 'supplierName' as const, enrichedFields: ['supplierName' as const] } : {}),
        isVerified: true,
        notes: nameHasOcrTypo
          ? `Tên OCR được sửa theo tên pháp lý đã xác minh bằng MST và địa chỉ trên hóa đơn. ${lookup.notes || ''}`.trim()
          : lookup.notes
      };
    }

    // A confirmed invoice alias can validate the pair while the live tax
    // lookup is unavailable. The lookup is exact and keyed by the full name.
    const byName = await lookupByName(name, {
      address: params.address, rawText: params.rawText, supplierSearchContext: params.supplierSearchContext
    });
    if (byName?.isVerified) {
      if (byName.taxCode !== validateTaxCode(taxCode!).normalized) {
        return {
          supplierTaxCode: params.supplierTaxCode,
          supplierName: params.supplierName,
          address: params.address,
          isVerified: false,
          conflictFields: ['supplierName', 'supplierTaxCode'],
          notes: `Tên hóa đơn đã xác thực khớp MST ${byName.taxCode}, khác MST OCR ${taxCode}; giữ nguyên để kiểm tra bằng chứng gốc.`
        };
      }
      return {
        supplierTaxCode: validateTaxCode(taxCode!).normalized,
        supplierName: name,
        address: params.address || byName.address,
        enrichedFields: ['supplierTaxCode'],
        isVerified: true,
        notes: byName.notes
      };
    }
  }

  return { supplierTaxCode: params.supplierTaxCode, supplierName: params.supplierName, address: params.address };
}
