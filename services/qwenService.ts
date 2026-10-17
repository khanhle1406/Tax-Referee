import { DEV_LLM_API_CONFIG } from '@/lib/constants';
import { InvoiceInput, ActionOptionSchema, RiskGroup } from '@/lib/schemas';
import { z } from 'zod';
import {
  callGeminiChat,
  extractInvoiceWithGeminiVision,
  generateActionableQuestionWithGemini,
  GeminiQuestionResultSchema,
  GeminiQuestionResult
} from './geminiService';

export const QwenQuestionResultSchema = GeminiQuestionResultSchema;
export type QwenQuestionResult = GeminiQuestionResult;

function sanitizeJsonString(str: string): string {
  let inString = false;
  let escaped = false;
  let out = '';
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === '"' && !escaped) {
      inString = !inString;
      out += char;
    } else if (inString && (char === '\n' || char === '\r')) {
      out += ' ';
    } else {
      out += char;
    }
    escaped = char === '\\' && !escaped;
  }
  return out;
}

export function extractCleanJson(text: string): any {
  let clean = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const firstBrace = clean.indexOf('{');
  const lastBrace = clean.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1) {
    clean = clean.substring(firstBrace, lastBrace + 1);
  }
  clean = clean.replace(/,\s*([\]}])/g, '$1');
  clean = sanitizeJsonString(clean);
  return JSON.parse(clean);
}

/**
 * Gọi AI Model thực hiện suy luận thuế, thẩm định rủi ro (chuyển tiếp sang Gemini 2.5 Flash)
 */
export async function callQwenChat(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  model?: string,
  timeoutMs = 25000
): Promise<string> {
  return callGeminiChat(messages, model, timeoutMs);
}

/**
 * Actionable Question Generator (Q-Gen) dùng Gemini 2.5 Flash
 * Giúp KTT hoặc CFO ra phán quyết trong 3 giây đối với hóa đơn rủi ro
 */
export async function generateActionableQuestionWithQwen(
  invoice: InvoiceInput,
  riskGroup: RiskGroup,
  detectedHint?: string,
  sopClauseHint?: string
): Promise<QwenQuestionResult> {
  return generateActionableQuestionWithGemini(invoice, riskGroup, detectedHint, sopClauseHint);
}

/**
 * Trích xuất hóa đơn từ ảnh/PDF bằng Gemini 2.5 Flash Vision
 */
export async function extractInvoiceWithQwenVision(
  fileBase64: string,
  mimeType: string,
  fileName?: string
): Promise<Partial<InvoiceInput>> {
  return extractInvoiceWithGeminiVision(fileBase64, mimeType, fileName);
}


/**
 * Semantic entity extraction from resident OCR text. Sending the compact OCR
 * transcript instead of the image keeps the small model call fast and cheap;
 * the model may only copy facts present in the transcript and must omit
 * unreadable fields. The deterministic parser remains a candidate generator,
 * never a source for invented values.
 */
export async function extractInvoiceWithQwenOcrText(
  lines: Array<{ text: string; confidence: number; bbox?: { x: number; y: number; w: number; h: number } }>
): Promise<Partial<InvoiceInput>> {
  const apiKey = DEV_LLM_API_CONFIG.API_KEY;
  if (!apiKey) throw new Error('Chưa cấu hình DEV_LLM_API_KEY để xác minh OCR.');
  const transcript = lines
    .map((line, index) => `${index + 1}. [conf=${line.confidence.toFixed(2)}] ${line.text}`)
    .join('\n');
  const prompt = `Bạn là bộ trích xuất thực thể hóa đơn Việt Nam. Chỉ đọc bản OCR bên dưới và trả về MỘT JSON ngắn, không markdown.
Khóa: n=invoice number, d=date YYYY-MM-DD, s=seller tax code, v=seller name, b=buyer tax code, i=item names, p=pre-tax VND, r=VAT percent, t=VAT VND, a=total payable VND, m=CASH/BANK_TRANSFER.
Chỉ sao chép thông tin nhìn thấy trong transcript; không suy ra, không sửa số, không lấy số điện thoại làm MST, không tính thuế từ tổng tiền. Nếu trường không rõ hoặc mâu thuẫn thì bỏ trường đó. Tiền phải là số nguyên VND. Dòng có confidence thấp là bằng chứng yếu và cần bỏ qua nếu không có dòng khác xác nhận.
OCR TRANSCRIPT:
${transcript}`;
  const model = DEV_LLM_API_CONFIG.MODEL;
  const res = await fetch(DEV_LLM_API_CONFIG.ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://tax-referee.local',
      'X-Title': 'Tax Referee OCR verifier'
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 512,
      temperature: 0,
      stream: false
    }),
    signal: AbortSignal.timeout(Number(process.env.LOCAL_OCR_AI_TIMEOUT_MS || 1800))
  });
  if (!res.ok) throw new Error(`[OpenRouter OCR verifier] HTTP ${res.status}: ${(await res.text()).slice(0, 180)}`);
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error('OCR verifier không trả JSON.');
  return expandVisionFields(extractCleanJson(content));
}

function normalizeEvidenceText(value:string):string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
}

function hasOcrEvidence(field:keyof InvoiceInput,value:unknown,lines:Array<{text:string}>):boolean {
  const source=lines.map(line=>line.text).join('\n');
  const normalizedSource=normalizeEvidenceText(source);
  if(typeof value==='number'){
    if(field==='taxRate')return new RegExp(`(?:^|\\D)${value}\\s*%`).test(source);
    const digits=String(Math.round(value));
    return digits.length>=3&&lines.some(line=>line.text.replace(/[^0-9]/g,'').includes(digits));
  }
  if(typeof value!=='string')return false;
  if(field==='supplierTaxCode'||field==='buyerTaxCode'){
    const digits=value.replace(/[^0-9]/g,'');
    return digits.length>=10&&lines.some(line=>line.text.replace(/[^0-9]/g,'').includes(digits));
  }
  if(field==='invoiceDate'){
    const date=value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!date)return false;
    const [,year,month,day]=date;
    return [
      `${day}/${month}/${year}`,`${Number(day)}/${Number(month)}/${year}`,
      `${day}-${month}-${year}`,`${Number(day)}-${Number(month)}-${year}`,
      `${day}.${month}.${year}`,`${Number(day)}.${Number(month)}.${year}`
    ].some(candidate=>source.includes(candidate));
  }
  if(field==='paymentMethod')return value==='CASH'?/ti[eề]n\s*m[aặ]t|\bcash\b/i.test(source):value==='BANK_TRANSFER'?/chuy[eể]n\s*kho[aả]n|\bng[aâ]n\s*h[aà]ng\b|\bbank\b/i.test(source):false;
  const normalizedValue=normalizeEvidenceText(value);
  if(normalizedValue.length<3)return false;
  if(normalizedSource.includes(normalizedValue))return true;
  if(field==='itemName'){
    const words=normalizedValue.split(' ').filter(word=>word.length>=3);
    return words.length>=2&&words.filter(word=>normalizedSource.includes(word)).length/words.length>=0.7;
  }
  return false;
}

function sameExtractedValue(field:keyof InvoiceInput,left:unknown,right:unknown):boolean {
  if(typeof left==='number'&&typeof right==='number')return Math.round(left)===Math.round(right);
  if(typeof left==='string'&&typeof right==='string'){
    if(field==='supplierTaxCode'||field==='buyerTaxCode')return left.replace(/\D/g,'')===right.replace(/\D/g,'');
    return normalizeEvidenceText(left)===normalizeEvidenceText(right);
  }
  return left===right;
}

/**
 * Let the language model structure OCR text, while keeping direct local OCR as
 * the source of truth. Only add model-only values that can be found in the OCR
 * transcript; disagreement is surfaced for review instead of silently picked.
 */
export function mergeOcrSemanticCandidates(
  local:Partial<InvoiceInput>,
  semantic:Partial<InvoiceInput>,
  lines:Array<{text:string}>
):{data:Partial<InvoiceInput>;uncertainFields:string[]} {
  const data:{[key:string]:unknown}={...semantic,...local};
  const uncertainFields:string[]=[];
  for(const [key,value] of Object.entries(semantic)){
    const field=key as keyof InvoiceInput;
    if(value===undefined||value===null||value==='')continue;
    const localValue=local[field];
    if(localValue!==undefined&&localValue!==null&&localValue!==''){
      if(!sameExtractedValue(field,localValue,value))uncertainFields.push(key);
      continue;
    }
    if(!hasOcrEvidence(field,value,lines))delete data[key];
  }
  return {data:data as Partial<InvoiceInput>,uncertainFields:[...new Set(uncertainFields)]};
}

/** Stable wire format, versioned with the extraction cache. */
export function expandVisionFields(value: unknown): Partial<InvoiceInput> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('OCR không trả đối tượng JSON.');
  const aliases: Record<string, string> = { n:'invoiceNumber',d:'invoiceDate',s:'supplierTaxCode',v:'supplierName',b:'buyerTaxCode',i:'itemName',p:'preTaxAmount',r:'taxRate',t:'taxAmount',a:'totalAmount',m:'paymentMethod',blur:'isImageBlurry' };
  const fields: Record<string,unknown> = {};
  for (const [key, valueField] of Object.entries(value)) {
    const field = aliases[key] || key;
    if (!Object.values(aliases).includes(field) || valueField === null || valueField === '') continue;
    fields[field] = valueField;
  }
  return fields as Partial<InvoiceInput>;
}

/** Endpoint-specific capabilities: do not silently route to a different price tier. */
export function visionRequestOptions(model: string): Record<string, unknown> {
  const reasoning = { enabled: false, effort: 'none' };
  if (model === 'inclusionai/ling-3.0-flash-vl') return {
    response_format: undefined, reasoning,
    provider: { only: ['novita'], sort: 'latency', allow_fallbacks: false }
  };
  if (model === 'nex-agi/nex-n2.5-mini') return {
    response_format: undefined, reasoning,
    provider: { only: ['nex-agi'], sort: 'latency', allow_fallbacks: false }
  };
  if (model.startsWith('google/gemini')) return {
    reasoning, provider: { only: ['google-ai-studio'], sort: 'latency', allow_fallbacks: false }
  };
  if (model.startsWith('qwen/')) return {
    reasoning, provider: { only: ['alibaba'], sort: 'throughput', allow_fallbacks: false }
  };
  return { reasoning, provider: { sort: 'latency', require_parameters: true } };
}
