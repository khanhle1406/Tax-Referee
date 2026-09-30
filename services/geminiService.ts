import { GEMINI_API_CONFIG } from '@/lib/constants';
import { InvoiceInput, ActionOptionSchema, RiskGroup } from '@/lib/schemas';
import {
  extractInvoiceWithDeepSeek,
  generateActionableQuestionWithDeepSeek,
  isDeepSeekServerAlive,
  DeepSeekQuestionResult,
  DeepSeekQuestionResultSchema
} from './deepseekService';
import { z } from 'zod';

export const GeminiQuestionResultSchema = DeepSeekQuestionResultSchema;
export type GeminiQuestionResult = DeepSeekQuestionResult;

const CANDIDATE_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite'
];

async function callGeminiApiWithFallback(body: any, timeoutMs = 25000): Promise<any> {
  const apiKey = GEMINI_API_CONFIG.API_KEY;
  let lastError: any = null;

  for (const model of CANDIDATE_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (response.ok) {
        return await response.json();
      }
      const errText = await response.text().catch(() => '');
      lastError = new Error(`Model ${model} returned status ${response.status}: ${errText.slice(0, 150)}`);
      if (response.status === 429 || response.status === 503) {
        console.warn(`[Gemini API] Model ${model} returned ${response.status}, cascading to next model...`);
        continue;
      }
      break;
    } catch (err) {
      lastError = err;
      console.warn(`[Gemini API] Network/Timeout error with model ${model}:`, err);
    }
  }
  throw lastError || new Error('All Gemini candidate models failed');
}

/**
 * Trích xuất hóa đơn từ ảnh/PDF bằng DeepSeek Server Agent (ưu tiên hàng đầu)
 * Fallback sang Google Gemini nếu DeepSeek server tạm dừng
 */
export async function extractInvoiceWithGemini(
  fileBase64: string,
  mimeType: string,
  fileName?: string
): Promise<Partial<InvoiceInput>> {
  // 1. Ưu tiên chạy thật với DeepSeek Server Agent (Patchright)
  try {
    const deepSeekAlive = await isDeepSeekServerAlive(2000);
    if (deepSeekAlive) {
      return await extractInvoiceWithDeepSeek(fileBase64, mimeType, fileName);
    }
  } catch (deepSeekErr) {
    console.warn('[AI Service] DeepSeek Server OCR gặp sự cố, thử Gemini fallback:', deepSeekErr);
  }

  // 2. Fallback sang Google Gemini Vision nếu có GEMINI_API_KEY
  const prompt = `
Bạn là Trợ lý AI Kế toán Thuế chuyên nghiệp tại Việt Nam. Hãy đọc kỹ tài liệu/ảnh hóa đơn, phiếu thu, hoặc bill bán lẻ đính kèm và trích xuất dữ liệu sang định dạng JSON sau:
{
  "invoiceNumber": "Số hóa đơn hoặc số bill/mã GD",
  "invoiceDate": "YYYY-MM-DD",
  "supplierTaxCode": "Mã số thuế bên bán",
  "supplierName": "Tên công ty bán hoặc tên cửa hàng",
  "itemName": "Tên hàng hóa/dịch vụ chính trên hóa đơn",
  "preTaxAmount": Số tiền trước thuế,
  "taxRate": Thuế suất VAT (0, 5, 8, 10),
  "taxAmount": Tiền thuế GTGT,
  "totalAmount": Tổng tiền thanh toán,
  "paymentMethod": "CASH" hoặc "BANK_TRANSFER",
  "hasBankSlip": boolean,
  "hasItemManifest": boolean,
  "isImageBlurry": boolean,
  "items": []
}
Chỉ trả về duy nhất chuỗi JSON hợp lệ, không bọc markdown block.`;

  try {
    const resJson = await callGeminiApiWithFallback({
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: mimeType,
                data: fileBase64
              }
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json'
      }
    }, 60000);

    const textOutput = resJson.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const cleanJson = textOutput.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanJson);
  } catch (err) {
    console.error('[Gemini Service] Multimodal extraction failed:', err);
    throw err;
  }
}

/**
 * Actionable Question Generator (Q-Gen)
 * Ưu tiên gọi DeepSeek Server Agent (Patchright)
 */
export async function generateActionableQuestionWithGemini(
  invoice: InvoiceInput,
  riskGroup: RiskGroup,
  detectedHint?: string,
  sopClauseHint?: string
): Promise<GeminiQuestionResult> {
  // 1. Ưu tiên chạy thật với DeepSeek Server Agent (Patchright)
  try {
    const deepSeekAlive = await isDeepSeekServerAlive(2000);
    if (deepSeekAlive) {
      return await generateActionableQuestionWithDeepSeek(invoice, riskGroup, detectedHint, sopClauseHint);
    }
  } catch (deepSeekErr) {
    console.warn('[AI Service] DeepSeek Server Q-Gen gặp sự cố, thử Gemini fallback:', deepSeekErr);
  }

  // 2. Fallback sang Google Gemini nếu DeepSeek không bật
  const prompt = `
VAI TRÒ:
Bạn là "ACTIONABLE QUESTION GENERATOR" cho hệ thống Tax Referee (MLAI Hackathon 2026).
Nhiệm vụ của bạn là hỗ trợ KTT hoặc CFO ra phán quyết trong 3 giây khi phát hiện một hóa đơn có rủi ro thuế.

CĂN CỨ:
- Tax-SOP-2026 v2.5.
- Nghị định 254/2026/NĐ-CP, Nghị quyết 204/2025/QH15, Luật Thuế GTGT 48/2024/QH15.

DỮ LIỆU HÓA ĐƠN:
- Mã: ${invoice.invoiceNumber || invoice.id}
- NCC: ${invoice.supplierName} (MST: ${invoice.supplierTaxCode})
- Tiền: ${invoice.totalAmount} VNĐ
- Dấu hiệu: ${detectedHint || ''}
- Điều khoản: ${sopClauseHint || ''}

Trả về JSON với: flaggedReason, plainExplanation, sopClause, actionableQuestion, options (A, B với resultingAction), requiresCFO.`;

  const resJson = await callGeminiApiWithFallback({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json'
    }
  }, 20000);

  const textOutput = resJson.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  const cleanJson = textOutput.replace(/```json/gi, '').replace(/```/g, '').trim();
  const parsed = JSON.parse(cleanJson);
  return GeminiQuestionResultSchema.parse(parsed);
}

export { extractInvoiceWithDeepSeek, generateActionableQuestionWithDeepSeek };
