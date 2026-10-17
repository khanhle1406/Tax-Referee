import { DEV_LLM_API_CONFIG } from '@/lib/constants';
import { normalizeTaxCodeFormat, validateTaxCode } from '@/lib/taxCode';
import { SupplierIdentity, SupplierIdentitySource } from '@/lib/schemas';
import { extractCleanJson } from './geminiService';
import { resolveSupplierIdentity, SupplierIdentityQuery } from './supplierIdentityResolver';
import { fetchOfficialSourceText, officialTextSupportsIdentity } from '@/lib/server/officialSourceEvidence';

const OFFICIAL_HOSTS = [
  'gdt.gov.vn',
  'tracuunnt.gdt.gov.vn',
  'dangkykinhdoanh.gov.vn'
] as const;
function normalizeName(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function isOfficialHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === 'gov.vn'
    || host.endsWith('.gov.vn')
    || OFFICIAL_HOSTS.some(allowed => host === allowed || host.endsWith(`.${allowed}`));
}

function directOfficialSource(url: string, title: unknown): SupplierIdentitySource | null {
  try {
    const source = new URL(url);
    if (source.protocol !== 'https:' || !isOfficialHost(source.hostname)) return null;
    return {
      title: typeof title === 'string' && title.trim() ? title.trim() : source.hostname,
      url: source.toString()
    };
  } catch {
    return null;
  }
}

async function fetchOfficialCandidateEvidence(
  candidate: { legalName: string; taxCode: string },
  invoiceName: string,
  sourceUrl: string
): Promise<SupplierIdentitySource | null> {
  const source = directOfficialSource(sourceUrl, undefined);
  if (!source) return null;
  const text = await fetchOfficialSourceText(source.url);
  return text && officialTextSupportsIdentity(text, candidate.legalName, candidate.taxCode, invoiceName) ? source : null;
}

function unavailable(message = 'Không thể truy cập dịch vụ tra cứu chính thống.') : SupplierIdentity {
  return { status: 'SOURCE_UNAVAILABLE', sources: [], message };
}

/**
 * Resolve a supplier through the configured LLM API. Model-provided candidates
 * and URLs remain untrusted until an official source page contains both the
 * legal name and tax code.
 */
/** Ngân sách tra cứu: tối đa 2 lần gọi trong 18 giây, rồi kiểm chứng trang nguồn chính thức ở máy chủ. */
export const GROUNDING_BUDGET_MS = 18_000;
export const GROUNDING_MAX_CALLS = 2;

export async function searchOfficialSupplierIdentity(input: {
  supplierName?: string;
  supplierTaxCode?: string;
  address?: string;
}): Promise<SupplierIdentity> {
  const supplierName = (input.supplierName || '').trim().slice(0, 240);
  const printedTaxCode = (input.supplierTaxCode || '').trim().slice(0, 32);
  const address = (input.address || '').trim().slice(0, 320);
  if (!supplierName && !printedTaxCode) return { status: 'NOT_FOUND', sources: [], message: 'Thiếu tên hoặc MST để tra cứu.' };
  const { API_KEY, ENDPOINT, MODEL } = DEV_LLM_API_CONFIG;
  if (!API_KEY || !ENDPOINT || !MODEL) return unavailable('Chưa cấu hình DEV_LLM_BASE_URL, DEV_LLM_API_KEY và DEV_LLM_MODEL.');

  const searchQuery = printedTaxCode
    ? `site:gov.vn ${JSON.stringify(supplierName)} ${JSON.stringify(printedTaxCode)}`
    : `site:gov.vn ${JSON.stringify(supplierName)} mã số thuế`;
  const prompt = `Find Vietnamese official government records that connect this seller name to its legal name and tax code. Search query: ${searchQuery}. If a tax number is provided, search it exactly. The seller name may be a brand or former name. Do not rely on memory or private directories. Return a source URL for each candidate; the server will fetch and validate the page.
Seller name from invoice: ${JSON.stringify(supplierName || null)}
Seller tax code from invoice: ${JSON.stringify(printedTaxCode || null)}
Seller address clue: ${JSON.stringify(address || null)}

Return only JSON: {"decision":"MATCH|AMBIGUOUS|NO_MATCH","selectedTaxCode":string|null,"candidates":[{"legalName":string,"taxCode":string,"sourceUrl":string}]}. Include candidates only when a specific official source page visibly contains both name and tax code. Never invent a tax code or URL.`;

  try {
    let lastError: 'network' | 'http' | null = null;
    let answer: { decision?: unknown; selectedTaxCode?: unknown; candidates?: unknown } | undefined;
    const searchDeadline = Date.now() + GROUNDING_BUDGET_MS;
    // Retry once with a narrower query; every result still requires a fetched
    // official page that independently supports both fields.
    const alternateQuery = printedTaxCode
      ? `site:gov.vn ${JSON.stringify(printedTaxCode)}`
      : `site:gov.vn ${JSON.stringify(supplierName)} "${normalizeName(supplierName).split(' ').filter(Boolean).join(' ')}"`;
    for (const searchPrompt of [prompt, `Find an official Vietnamese government record for query ${alternateQuery}. Return only JSON {"decision":"MATCH|AMBIGUOUS|NO_MATCH","selectedTaxCode":string|null,"candidates":[{"legalName":string,"taxCode":string,"sourceUrl":string}]}. Do not cite private directories or invent facts.`]) {
      const remaining = searchDeadline - Date.now();
      if (remaining <= 0) break;
      let response: Response;
      try {
        response = await fetch(ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${API_KEY}`
          },
          body: JSON.stringify({
            model: MODEL,
            messages: [{ role: 'user', content: searchPrompt }],
            response_format: { type: 'json_object' },
            temperature: 0,
            max_tokens: 1800,
            stream: false
          }),
          signal: AbortSignal.timeout(Math.min(12000, remaining)),
          cache: 'no-store'
        });
      } catch {
        lastError = 'network';
        continue;
      }
      if (!response.ok) {
        await response.text().catch(() => '');
        lastError = 'http';
        continue;
      }
      const content = (await response.json())?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) continue;
      try { answer = extractCleanJson(content) as typeof answer; } catch { continue; }
      if (Array.isArray(answer?.candidates) && answer.candidates.length) break;
    }
    if (!answer) {
      if (lastError === 'network' || lastError === 'http') return unavailable('Dịch vụ tra cứu chính thống đang lỗi hoặc không phản hồi.');
      return { status: 'NOT_FOUND', sources: [], message: 'Không tìm thấy ứng viên có nguồn chính thống kiểm chứng được.' };
    }
    const supported = await Promise.all((Array.isArray(answer.candidates) ? answer.candidates.slice(0, 5) : []).flatMap((rawCandidate) => {
      if (!rawCandidate || typeof rawCandidate !== 'object') return [];
      const row = rawCandidate as Record<string, unknown>;
      const legalName = typeof row.legalName === 'string' ? row.legalName.trim() : '';
      const rawTaxCode = typeof row.taxCode === 'string' ? row.taxCode.trim() : '';
      const sourceUrl = typeof row.sourceUrl === 'string' ? row.sourceUrl.trim() : '';
      const taxCode = normalizeTaxCodeFormat(rawTaxCode);
      if (!legalName || !taxCode || !sourceUrl || !validateTaxCode(taxCode).isValid) return [];
      return [fetchOfficialCandidateEvidence({ legalName, taxCode }, supplierName, sourceUrl).then(source =>
        source ? { legalName, taxCode, sources: [source] } : null
      )];
    })).then(rows => rows.filter((row): row is NonNullable<typeof row> => row !== null));

    const unique = new Map<string, (typeof supported)[number]>();
    for (const row of supported) unique.set(row.taxCode, row);
    if (unique.size > 1 || answer.decision === 'AMBIGUOUS') {
      return { status: 'AMBIGUOUS', sources: [...new Map([...unique.values()].flatMap(row => row.sources).map(source => [source.url, source])).values()], message: 'Có nhiều doanh nghiệp phù hợp trong nguồn chính thống.' };
    }
    if (unique.size !== 1 || answer.decision !== 'MATCH' || typeof answer.selectedTaxCode !== 'string') {
      return { status: 'NOT_FOUND', sources: [], message: 'Chưa tìm thấy một doanh nghiệp duy nhất có trích dẫn chính thống.' };
    }

    const resolved = [...unique.values()][0];
    const selectedTaxCode = normalizeTaxCodeFormat(answer.selectedTaxCode);
    if (selectedTaxCode !== resolved.taxCode) {
      return { status: 'NOT_FOUND', sources: resolved.sources, message: 'Lựa chọn của AI không khớp với ứng viên có bằng chứng.' };
    }
    if (printedTaxCode) {
      const printedNormalized = normalizeTaxCodeFormat(printedTaxCode);
      if (!printedNormalized || printedNormalized !== resolved.taxCode) {
        return {
          status: 'CONFLICT', legalName: resolved.legalName, supplierTaxCode: resolved.taxCode,
          sources: resolved.sources, message: 'MST in trên hóa đơn không khớp tên nhà cung cấp; đã giữ nguyên MST trên ảnh.'
        };
      }
    }
    return {
      status: 'VERIFIED', legalName: resolved.legalName, supplierTaxCode: resolved.taxCode,
      sources: resolved.sources, message: 'Tên pháp lý và MST được đối chiếu từ nguồn chính thống.'
    };
  } catch {
    return { status: 'NOT_FOUND', sources: [], message: 'Kết quả tra cứu không có đủ trích dẫn để xác minh.' };
  }
}

export async function lookupOfficialSupplierIdentity(input: SupplierIdentityQuery): Promise<SupplierIdentity> {
  return resolveSupplierIdentity(input, searchOfficialSupplierIdentity);
}
