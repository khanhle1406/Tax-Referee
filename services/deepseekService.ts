import { DEEPSEEK_API_CONFIG } from '@/lib/constants';
import { InvoiceInput, ActionOptionSchema, RiskGroup } from '@/lib/schemas';
import { convertPdfToPngBase64 } from '@/lib/server/pdfToImage';
import { z } from 'zod';

export const DeepSeekQuestionResultSchema = z.object({
  flaggedReason: z.string().min(5),
  plainExplanation: z.string().min(10),
  sopClause: z.string().min(3),
  actionableQuestion: z.string().min(10),
  options: z.tuple([ActionOptionSchema, ActionOptionSchema]),
  requiresCFO: z.boolean()
});

export type DeepSeekQuestionResult = z.infer<typeof DeepSeekQuestionResultSchema>;

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
 * Kiểm tra trạng thái hoạt động của DeepSeek Server Agent (Patchright)
 */
export async function isDeepSeekServerAlive(timeoutMs = 3000): Promise<boolean> {
  try {
    const res = await fetch(`${DEEPSEEK_API_CONFIG.BASE_URL}/v1/models`, {
      method: 'GET',
      signal: AbortSignal.timeout(timeoutMs)
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Reset phiên chat trên DeepSeek Server để làm mới hội thoại và giải phóng rate limit
 */
export async function resetDeepSeekSession(sessionId = 'default'): Promise<boolean> {
  try {
    const res = await fetch(`${DEEPSEEK_API_CONFIG.BASE_URL}/v1/chat/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
      signal: AbortSignal.timeout(5000)
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Gửi yêu cầu tới DeepSeek Server Agent qua giao diện chuẩn OpenAI /v1/chat/completions
 * Tự động reset session và retry nếu gặp rate-limit hoặc timeout
 */
async function callDeepSeekApi(payload: {
  messages: Array<{ role: string; content: any }>;
  sessionId?: string;
  timeoutMs?: number;
  maxRetries?: number;
}): Promise<string> {
  const url = DEEPSEEK_API_CONFIG.ENDPOINT;
  const timeoutMs = payload.timeoutMs || 45000;
  const maxRetries = payload.maxRetries ?? 2;

  let lastError: any = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const bodyData: Record<string, any> = {
        model: DEEPSEEK_API_CONFIG.MODEL,
        messages: payload.messages,
        session_id: payload.sessionId || 'default'
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(bodyData),
        signal: AbortSignal.timeout(timeoutMs)
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) return content;
      }

      const errText = await response.text().catch(() => '');
      lastError = new Error(`DeepSeek Server trả mã lỗi ${response.status}: ${errText.slice(0, 300)}`);

      // Nếu gặp 429 hoặc 504 (timeout do rate limit / Messages too frequent), tự động reset session và đợi
      if (response.status === 429 || response.status === 504 || errText.includes('frequent') || errText.includes('rate')) {
        console.warn(`[DeepSeek Service] Gặp rate-limit/timeout (Lần ${attempt}/${maxRetries}), đang reset session và nghỉ 3s...`);
        await resetDeepSeekSession(payload.sessionId || 'default');
        await new Promise((r) => setTimeout(r, 3500));
        continue;
      }
      break;
    } catch (err: any) {
      lastError = err;
      console.warn(`[DeepSeek Service] Lỗi kết nối (Lần ${attempt}/${maxRetries}):`, err?.message || err);
      if (attempt < maxRetries) {
        await resetDeepSeekSession(payload.sessionId || 'default');
        await new Promise((r) => setTimeout(r, 3500));
      }
    }
  }

  throw lastError || new Error('Không thể kết nối tới DeepSeek Server');
}

/**
 * OCR và bóc tách dữ liệu Hóa đơn/Chứng từ qua DeepSeek Server Vision Agent
 * Nhận ảnh hoặc PDF (tự động render sang PNG), trích xuất chuẩn schema InvoiceInput
 */
export async function extractInvoiceWithDeepSeek(
  fileBase64: string,
  mimeType: string,
  fileName?: string
): Promise<Partial<InvoiceInput>> {
  let processedBase64 = fileBase64;
  let effectiveMime = mimeType;

  // Nếu là file PDF, render trang đầu sang PNG Base64
  if (mimeType === 'application/pdf' || fileName?.toLowerCase().endsWith('.pdf')) {
    try {
      const pdfBuffer = Buffer.from(fileBase64, 'base64');
      processedBase64 = convertPdfToPngBase64(pdfBuffer);
      effectiveMime = 'image/png';
    } catch (pdfErr) {
      console.warn('[DeepSeek Service] Không thể convert PDF sang PNG, gửi trực tiếp buffer:', pdfErr);
    }
  }

  const prompt = `Bạn là Trợ lý AI Kế toán Thuế chuyên nghiệp tại Việt Nam. Hãy đọc kỹ tài liệu/ảnh hóa đơn, phiếu thu, hoặc bill bán lẻ đính kèm và trích xuất dữ liệu sang định dạng JSON sau:
{
  "invoiceNumber": "Số hóa đơn hoặc số bill/mã GD (ví dụ: HD-00123, 00180477, 27938)",
  "invoiceDate": "YYYY-MM-DD (ngày lập trên hóa đơn hoặc bill)",
  "supplierTaxCode": "Mã số thuế bên bán (nếu có trên bill/hóa đơn, nếu không có để trống chuỗi rỗng)",
  "supplierName": "Tên công ty bán hoặc tên cửa hàng, thương hiệu (ví dụ: VinCommerce, Saigon Co.op, Phúc Long, Circle K, v.v.)",
  "itemName": "Tên hàng hóa/dịch vụ chính trên hóa đơn",
  "preTaxAmount": Số tiền trước thuế (number, nếu không tách riêng thì lấy tổng tiền trừ tiền thuế hoặc bằng tổng tiền nếu không chịu thuế),
  "taxRate": Thuế suất VAT (number, ví dụ: 0, 5, 8, 10 hoặc 0 nếu không ghi),
  "taxAmount": Tiền thuế GTGT (number, nếu không ghi thì để 0),
  "totalAmount": Tổng tiền thanh toán cuối cùng (number),
  "paymentMethod": "CASH" hoặc "BANK_TRANSFER",
  "hasBankSlip": boolean (true nếu thanh toán chuyển khoản và có UNC hoặc bill thanh toán),
  "hasItemManifest": boolean (true nếu có danh sách chi tiết món hàng),
  "isImageBlurry": boolean (true nếu ảnh bị mờ hoặc rách khó đọc),
  "items": [
    {
      "lineNumber": 1,
      "itemName": "Tên mặt hàng",
      "unit": "Cái / Hộp / Kg",
      "quantity": 1,
      "unitPrice": 100000,
      "amount": 100000,
      "taxRate": 10,
      "taxAmount": 10000
    }
  ]
}
Chỉ trả về duy nhất chuỗi JSON hợp lệ, không bọc markdown block, không thêm lời dẫn. Nếu có nhiều mặt hàng, hãy liệt kê đầy đủ vào mảng "items". Nếu không có chi tiết từng dòng, mảng "items" có thể để rỗng [].`;

  const messages = [
    {
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        {
          type: 'image_url',
          image_url: {
            url: `data:${effectiveMime};base64,${processedBase64}`
          }
        }
      ]
    }
  ];

  try {
    const rawOutput = await callDeepSeekApi({
      messages,
      sessionId: 'tax-referee-ocr',
      timeoutMs: 90000
    });

    const parsed = extractCleanJson(rawOutput);

    // Chuẩn hóa kiểu dữ liệu
    return {
      invoiceNumber: parsed.invoiceNumber ? String(parsed.invoiceNumber) : undefined,
      invoiceDate: parsed.invoiceDate ? String(parsed.invoiceDate) : undefined,
      supplierTaxCode: parsed.supplierTaxCode ? String(parsed.supplierTaxCode).replace(/[^0-9-]/g, '') : '',
      supplierName: parsed.supplierName ? String(parsed.supplierName) : undefined,
      itemName: parsed.itemName ? String(parsed.itemName) : undefined,
      preTaxAmount: Number.isFinite(Number(parsed.preTaxAmount)) ? Number(parsed.preTaxAmount) : undefined,
      taxRate: [0, 5, 8, 10].includes(Number(parsed.taxRate)) ? Number(parsed.taxRate) as any : 0,
      taxAmount: Number.isFinite(Number(parsed.taxAmount)) ? Number(parsed.taxAmount) : 0,
      totalAmount: Number.isFinite(Number(parsed.totalAmount)) ? Number(parsed.totalAmount) : undefined,
      paymentMethod: parsed.paymentMethod === 'CASH' ? 'CASH' : 'BANK_TRANSFER',
      hasBankSlip: typeof parsed.hasBankSlip === 'boolean' ? parsed.hasBankSlip : (parsed.paymentMethod !== 'CASH'),
      hasItemManifest: typeof parsed.hasItemManifest === 'boolean' ? parsed.hasItemManifest : true,
      isImageBlurry: Boolean(parsed.isImageBlurry),
      items: Array.isArray(parsed.items) && parsed.items.length > 0 ? parsed.items : []
    };
  } catch (err) {
    console.error('[DeepSeek Service] OCR trích xuất hóa đơn thất bại:', err);
    throw err;
  }
}

/**
 * Sinh câu hỏi phán quyết A/B đóng (Actionable Question Generator) qua DeepSeek Server Agent
 * Dẫn chiếu đúng Luật Thuế GTGT 48/2024/QH15, NĐ 254/2026/NĐ-CP, NQ 204/2025/QH15, Tax-SOP-2026 v2.5
 */
export async function generateActionableQuestionWithDeepSeek(
  invoice: InvoiceInput,
  riskGroup: RiskGroup,
  detectedHint?: string,
  sopClauseHint?: string
): Promise<DeepSeekQuestionResult> {
  const systemPrompt = `VAI TRÒ:
Bạn là "ACTIONABLE QUESTION GENERATOR" cho hệ thống Tax Referee (MLAI Hackathon 2026).
Nhiệm vụ của bạn là hỗ trợ Kế toán trưởng (KTT) hoặc Giám đốc Tài chính (CFO) ra phán quyết trong 3 giây khi phát hiện một hóa đơn có rủi ro thuế.

CĂN CỨ PHÁP LÝ & QUY CHẾ:
- Quy chế Quản trị Thuế nội bộ: Tax-SOP-2026 v2.5.
- Nghị định 254/2026/NĐ-CP (Truy vết hóa đơn điều chỉnh/thay thế, bắt buộc mã HĐ gốc; sai tên địa chỉ nhưng đúng MST gửi Mẫu 04/SS-HĐĐT vẫn hợp lệ).
- Nghị quyết 204/2025/QH15 & Nghị định 174/2025/NĐ-CP (Quy tắc thuế suất 8% áp dụng đến 31/12/2026, danh mục loại trừ bắt buộc 10% như viễn thông, tài chính, bds, hóa chất).
- Khoản 2 Điều 14 Luật Thuế GTGT 48/2024/QH15 & NĐ 320/2025/NĐ-CP (Hóa đơn từ 5.000.000 VNĐ trở lên bắt buộc thanh toán không dùng tiền mặt).
- Điều 2.2 Tax-SOP-2026: Nhà cung cấp đóng MST: Xuất SAU ngày đóng MST = bất hợp pháp 100%; Xuất TRƯỚC ngày đóng MST = tạm dừng để KTT xác minh bộ hồ sơ thực tế.
- Điều 3.3 & Chương 4 Tax-SOP-2026: Hóa đơn điều chỉnh giảm hoặc chi phí bồi thường >= 200.000.000 VNĐ, hoặc hóa đơn làm biến động Tham số K vào Vùng Đỏ (< 0.95 hoặc > 1.35 theo CV 2392/TCT-QLRR) bắt buộc thẩm quyền CFO.

YÊU CẦU ĐẦU RA (JSON THUẦN TÚY):
Trả về JSON đúng cấu trúc sau (không markdown, không thêm text bên ngoài):
{
  "flaggedReason": "Lý do vi phạm ngắn gọn, súc tích (1 câu)",
  "plainExplanation": "Lời giải thích bằng tiếng Việt bình dân, dễ hiểu cho người không chuyên kế toán (1-2 câu)",
  "sopClause": "Điều khoản quy chế vi phạm (ví dụ: Khoản 2 Điều 14 Luật Thuế GTGT 48/2024/QH15 & Điều 1.2 Tax-SOP-2026)",
  "actionableQuestion": "Câu hỏi ĐÓNG, NGẮN GỌN, CHÍNH XÁC. BẮT BUỘC chứa: Mã hóa đơn, Tên đối tác, Số tiền VNĐ, Căn cứ luật/SOP, và hỏi KTT/CFO lựa chọn giữa 2 phương án đối ứng.",
  "requiresCFO": true/false (true nếu rủi ro thuộc Nhóm 3 EXCEED_AUTHORITY, số tiền >= 200M hoặc K-factor vào Vùng Đỏ; ngược lại false),
  "options": [
    {
      "id": "A",
      "label": "Tên ngắn trên nút bấm (dưới 35 ký tự)",
      "actionDescription": "Mô tả hành động cụ thể khi chọn nút này",
      "resultingAction": "ACCEPT_WITH_DOCS" | "REJECT_TAX_DEDUCTION" | "FORWARD_TO_CFO" | "REQUEST_SUPPLIER_REISSUE" | "ACCEPT_ADJUSTMENT" | "ACCEPT_WITH_DEFENSE_DOSSIER"
    },
    {
      "id": "B",
      "label": "Tên ngắn trên nút bấm (dưới 35 ký tự)",
      "actionDescription": "Mô tả hành động cụ thể khi chọn nút này",
      "resultingAction": "ACCEPT_WITH_DOCS" | "REJECT_TAX_DEDUCTION" | "FORWARD_TO_CFO" | "REQUEST_SUPPLIER_REISSUE" | "ACCEPT_ADJUSTMENT" | "ACCEPT_WITH_DEFENSE_DOSSIER"
    }
  ]
}`;

  const userPrompt = `DỮ LIỆU HÓA ĐƠN ĐẦU VÀO:
- Mã số hóa đơn: ${invoice.invoiceNumber || invoice.id}
- Ngày lập: ${invoice.invoiceDate}
- Nhà cung cấp: ${invoice.supplierName} (MST: ${invoice.supplierTaxCode})
- Tên hàng hóa/dịch vụ: ${invoice.itemName}
- Tổng tiền: ${invoice.totalAmount.toLocaleString('vi-VN')} VNĐ (Trước thuế: ${invoice.preTaxAmount.toLocaleString('vi-VN')} VNĐ, Thuế suất: ${invoice.taxRate}%)
- Phương thức thanh toán: ${invoice.paymentMethod === 'CASH' ? 'Tiền mặt' : 'Chuyển khoản'} (Đã có UNC: ${invoice.hasBankSlip ? 'Có' : 'Chưa'})
- Có bảng kê mặt hàng: ${invoice.hasItemManifest ? 'Có' : 'Không'}
- Ảnh hóa đơn bị mờ: ${invoice.isImageBlurry ? 'Có' : 'Không'}
- Trạng thái nhà cung cấp: ${invoice.sellerStatus} ${invoice.sellerSuspensionDate ? `(Ngày đóng MST: ${invoice.sellerSuspensionDate})` : ''}
- Hóa đơn điều chỉnh: ${invoice.isAdjustment ? 'Có' : 'Không'} (Mã HĐ gốc: ${invoice.originalInvoiceRef || 'Không có'})
- Phân loại rủi ro: ${riskGroup}
${detectedHint ? `- Dấu hiệu vi phạm: ${detectedHint}` : ''}
${sopClauseHint ? `- Gợi ý điều khoản: ${sopClauseHint}` : ''}

Hãy trả về duy nhất chuỗi JSON hợp lệ theo đúng cấu trúc đã chỉ định.`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ];

  try {
    const rawOutput = await callDeepSeekApi({
      messages,
      sessionId: 'tax-referee-qgen',
      timeoutMs: 45000
    });

    const parsed = extractCleanJson(rawOutput);

    // Chuẩn hóa và làm sạch options
    const VALID_ACTIONS = [
      'ACCEPT_WITH_DOCS',
      'REJECT_TAX_DEDUCTION',
      'FORWARD_TO_CFO',
      'REQUEST_SUPPLIER_REISSUE',
      'ACCEPT_ADJUSTMENT',
      'ACCEPT_WITH_DEFENSE_DOSSIER'
    ];

    if (Array.isArray(parsed.options) && parsed.options.length >= 2) {
      parsed.options = [
        {
          id: 'A',
          label: String(parsed.options[0].label || 'Phương án A'),
          actionDescription: String(parsed.options[0].actionDescription || parsed.options[0].label || ''),
          resultingAction: VALID_ACTIONS.includes(parsed.options[0].resultingAction)
            ? parsed.options[0].resultingAction
            : 'ACCEPT_WITH_DOCS'
        },
        {
          id: 'B',
          label: String(parsed.options[1].label || 'Phương án B'),
          actionDescription: String(parsed.options[1].actionDescription || parsed.options[1].label || ''),
          resultingAction: VALID_ACTIONS.includes(parsed.options[1].resultingAction)
            ? parsed.options[1].resultingAction
            : 'REJECT_TAX_DEDUCTION'
        }
      ];
    }

    // Validate qua Zod Guardrail
    const validated = DeepSeekQuestionResultSchema.parse(parsed);
    return validated;
  } catch (err) {
    console.error('[DeepSeek Service] Lỗi sinh câu hỏi Q-Gen:', err);
    throw err;
  }
}
