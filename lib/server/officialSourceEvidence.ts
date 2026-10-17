import { normalizeTaxCodeFormat } from '@/lib/taxCode';
import { extractTextFromPdfBuffer } from './pdfToImage';

const MAX_SOURCE_BYTES = 4 * 1024 * 1024;

/** Fetch only a direct government page, without forwarding LLM credentials. */
export async function fetchOfficialSourceText(sourceUrl: string): Promise<string | null> {
  try {
    const url = new URL(sourceUrl);
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.gov.vn') || url.username || url.password || url.port) return null;
    const response = await fetch(url, {
      headers: { Accept: 'text/html,application/json,text/plain,application/pdf' },
      redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(7000)
    });
    if (!response.ok || !response.body || Number(response.headers.get('content-length') || 0) > MAX_SOURCE_BYTES) return null;
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > MAX_SOURCE_BYTES) { await reader.cancel(); return null; }
        chunks.push(chunk.value);
      }
    } finally { reader.releaseLock(); }
    const body = Buffer.concat(chunks);
    const contentType = response.headers.get('content-type') || '';
    if (/application\/pdf/i.test(contentType) || body.subarray(0, 5).toString() === '%PDF-') return extractTextFromPdfBuffer(body);
    if (!/(?:text\/html|application\/json|text\/plain)/i.test(contentType)) return null;
    return body.toString('utf8').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]*>/g, ' ').replace(/&(?:nbsp|amp|quot|apos);/gi, ' ')
      .replace(/&#(x[\da-f]+|\d+);/gi, (_match: string, code: string): string => {
        const value = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code);
        return value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : ' ';
      });
  } catch { return null; }
}

function normalizeName(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function officialTextSupportsIdentity(text: string, legalName: string, taxCode: string, invoiceName = ''): boolean {
  const source = normalizeName(text);
  const name = normalizeName(legalName);
  const originalName = normalizeName(invoiceName);
  const codes = [...text.matchAll(/(?<!\d)\d{10}(?:\s*-\s*\d{3})?(?!\d)|(?<!\d)\d{12,13}(?!\d)/g)]
    .map(match => normalizeTaxCodeFormat(match[0]));
  return Boolean(name && source.includes(name) && codes.includes(normalizeTaxCodeFormat(taxCode))
    && (!originalName || name.includes(originalName) || source.includes(originalName)));
}
