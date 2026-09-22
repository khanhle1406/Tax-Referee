import { GEMINI_API_CONFIG } from '@/lib/constants';
import { InvoiceInput } from '@/lib/schemas';

export async function extractInvoiceWithGemini(
  fileBase64: string,
  mimeType: string
): Promise<Partial<InvoiceInput>> {
  const prompt = `
Bạn là Trợ lý AI Kế toán Thuế chuyên nghiệp tại Việt Nam. Hãy đọc tài liệu/ảnh hóa đơn đính kèm và trích xuất dữ liệu sang định dạng JSON:
{
  "invoiceNumber": "Số hóa đơn (ví dụ: HD-00123)",
  "invoiceDate": "YYYY-MM-DD",
  "supplierTaxCode": "Mã số thuế bên bán",
  "supplierName": "Tên công ty bán",
  "itemName": "Tên hàng hóa/dịch vụ",
  "preTaxAmount": Số tiền trước thuế (number),
  "taxRate": Thuế suất (0, 8, hoặc 10),
  "taxAmount": Tiền thuế GTGT (number),
  "totalAmount": Tổng tiền thanh toán (number),
  "paymentMethod": "BANK_TRANSFER" hoặc "CASH",
  "hasBankSlip": boolean,
  "hasItemManifest": boolean,
  "isImageBlurry": boolean
}
Lưu ý: Chỉ trả về duy nhất chuỗi JSON hợp lệ, không bọc trong markdown code block, không thêm lời dẫn.`;

  try {
    const url = `${GEMINI_API_CONFIG.ENDPOINT}?key=${GEMINI_API_CONFIG.API_KEY}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
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
      }),
      signal: AbortSignal.timeout(8000)
    });

    if (!response.ok) {
      throw new Error(`Gemini API returned status ${response.status}`);
    }

    const resJson = await response.json();
    const textOutput = resJson.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const cleanJson = textOutput.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanJson);
  } catch (err) {
    console.warn('[Gemini Service] Multimodal extraction failed. Falling back to structured parser.', err);
    throw err;
  }
}

import { z } from 'zod';
import { ActionOptionSchema, ActionOption, RiskGroup } from '@/lib/schemas';

const GeminiQuestionResultSchema = z.object({
  flaggedReason: z.string().min(5),
  plainExplanation: z.string().min(10),
  sopClause: z.string().min(3),
  actionableQuestion: z.string().min(10),
  options: z.tuple([ActionOptionSchema, ActionOptionSchema]),
  requiresCFO: z.boolean()
});

export type GeminiQuestionResult = z.infer<typeof GeminiQuestionResultSchema>;

/**
 * Actionable Question Generator (Q-Gen) với Google Gemini Flash
 * Sinh động câu hỏi A/B đóng, căn cứ SOP, giải thích bình dân và thẩm quyền theo Mục 8.2 initial-idea.md
 */
export async function generateActionableQuestionWithGemini(
  invoice: InvoiceInput,
  riskGroup: RiskGroup,
  detectedHint?: string,
  sopClauseHint?: string
): Promise<GeminiQuestionResult> {
  const prompt = `
VAI TRÒ:
Bạn là "ACTIONABLE QUESTION GENERATOR" cho hệ thống Tax Referee (MLAI Hackathon 2026).
Nhiệm vụ của bạn là hỗ trợ Kế toán trưởng (KTT) hoặc Giám đốc Tài chính (CFO) ra phán quyết trong 3 giây khi phát hiện một hóa đơn có rủi ro thuế.

CĂN CỨ PHÁP LÝ & QUY CHẾ:
- Quy chế Quản trị Thuế nội bộ: Tax-SOP-2026.
- Nghị định 123/2020/NĐ-CP (Truy vết hóa đơn điều chỉnh/thay thế, bắt buộc mã HĐ gốc).
- Nghị định 72/2024/NĐ-CP & Nghị quyết 142/2024/QH15 (Quy tắc thuế suất 8% vs danh mục loại trừ bắt buộc 10% như viễn thông, CNTT, hóa chất, rượu bia).
- Điều 15 Thông tư 219/2013/TT-BTC (Hóa đơn từ 20.000.000 VNĐ bắt buộc thanh toán không dùng tiền mặt).
- Điều 2.2 Tax-SOP-2026: Nhà cung cấp đóng MST: Xuất SAU ngày đóng MST = bất hợp pháp 100%; Xuất TRƯỚC ngày đóng MST = tạm dừng để KTT xác minh bộ hồ sơ thực tế.
- Điều 3.3 Tax-SOP-2026: Hóa đơn điều chỉnh giảm hoặc chi phí bồi thường >= 200.000.000 VNĐ, hoặc hóa đơn làm biến động Hệ số K vào Vùng Đỏ (> 1.35) bắt buộc thẩm quyền CFO.

DỮ LIỆU HÓA ĐƠN ĐẦU VÀO:
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

YÊU CẦU ĐẦU RA (JSON THUẦN TÚY):
1. "flaggedReason": Lý do vi phạm ngắn gọn, súc tích (1 câu).
2. "plainExplanation": Lời giải thích bằng tiếng Việt bình dân, dễ hiểu cho người không chuyên kế toán (1-2 câu).
3. "sopClause": Điều khoản quy chế vi phạm (ví dụ: "Điều 1.3c Quy chế Tax-SOP-2026 & Nghị định 72/2024/NĐ-CP").
4. "actionableQuestion": Câu hỏi ĐÓNG, NGẮN GỌN, CHÍNH XÁC. BẮT BUỘC chứa: Mã hóa đơn, Tên đối tác, Số tiền VNĐ, Điều khoản quy chế, và hỏi KTT/CFO lựa chọn giữa 2 phương án đối ứng. KHÔNG dùng câu hỏi mở hay chung chung.
5. "options": Đúng 2 phương án đối ứng A và B (mảng 2 phần tử):
   - id: "A" | "B"
   - label: Tên ngắn trên nút bấm (dưới 35 ký tự)
   - actionDescription: Mô tả hành động cụ thể khi chọn nút này
   - resultingAction: Bắt buộc chọn đúng 1 trong các enum sau:
     * "ACCEPT_WITH_DOCS" (Chấp nhận kèm hồ sơ giải trình)
     * "REJECT_TAX_DEDUCTION" (Loại phần thuế khỏi khấu trừ)
     * "FORWARD_TO_CFO" (Chuyển tiếp lên cấp CFO)
     * "REQUEST_SUPPLIER_REISSUE" (Yêu cầu nhà cung cấp xuất lại HĐ hoặc bổ sung UNC/bảng kê)
     * "ACCEPT_ADJUSTMENT" (Chấp thuận hóa đơn điều chỉnh)
6. "requiresCFO": boolean (true nếu rủi ro thuộc Nhóm 3 EXCEED_AUTHORITY, số tiền >= 200M hoặc biến động K-factor; ngược lại false).

CHỈ TRẢ VỀ DUY NHẤT CHUỖI JSON HỢP LỆ THEO SCHEMA TRÊN, KHÔNG CÓ BẤT KỲ VĂN BẢN NGOÀI NÀO.`;

  const url = `${GEMINI_API_CONFIG.ENDPOINT}?key=${GEMINI_API_CONFIG.API_KEY}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 2048,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            flaggedReason: { type: 'STRING' },
            plainExplanation: { type: 'STRING' },
            sopClause: { type: 'STRING' },
            actionableQuestion: { type: 'STRING' },
            requiresCFO: { type: 'BOOLEAN' },
            options: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  id: { type: 'STRING', enum: ['A', 'B'] },
                  label: { type: 'STRING' },
                  actionDescription: { type: 'STRING' },
                  resultingAction: {
                    type: 'STRING',
                    enum: [
                      'ACCEPT_WITH_DOCS',
                      'REJECT_TAX_DEDUCTION',
                      'FORWARD_TO_CFO',
                      'REQUEST_SUPPLIER_REISSUE',
                      'ACCEPT_ADJUSTMENT'
                    ]
                  }
                },
                required: ['id', 'label', 'actionDescription', 'resultingAction']
              }
            }
          },
          required: [
            'flaggedReason',
            'plainExplanation',
            'sopClause',
            'actionableQuestion',
            'options',
            'requiresCFO'
          ]
        }
      }
    }),
    signal: AbortSignal.timeout(12000) // 12 giây timeout
  });

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

  if (!response.ok) {
    throw new Error(`Gemini API returned status ${response.status}`);
  }

  const resJson = await response.json();
  const textOutput = resJson.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  let cleanJson = textOutput.replace(/```json/gi, '').replace(/```/g, '').trim();
  const firstBrace = cleanJson.indexOf('{');
  const lastBrace = cleanJson.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1) {
    cleanJson = cleanJson.substring(firstBrace, lastBrace + 1);
  }
  // Khử trailing comma nếu có
  cleanJson = cleanJson.replace(/,\s*([\]}])/g, '$1');
  // Khử literal newlines bên trong string values
  cleanJson = sanitizeJsonString(cleanJson);

  const parsed = JSON.parse(cleanJson);

  // Chuẩn hóa options nếu Gemini trả về id: '1', '2' thay vì 'A', 'B'
  if (Array.isArray(parsed.options) && parsed.options.length >= 2) {
    parsed.options = [
      {
        id: 'A',
        label: String(parsed.options[0].label || 'Phương án A'),
        actionDescription: String(parsed.options[0].actionDescription || parsed.options[0].label || ''),
        resultingAction: ['ACCEPT_WITH_DOCS', 'REJECT_TAX_DEDUCTION', 'FORWARD_TO_CFO', 'REQUEST_SUPPLIER_REISSUE', 'ACCEPT_ADJUSTMENT'].includes(parsed.options[0].resultingAction)
          ? parsed.options[0].resultingAction
          : 'ACCEPT_WITH_DOCS'
      },
      {
        id: 'B',
        label: String(parsed.options[1].label || 'Phương án B'),
        actionDescription: String(parsed.options[1].actionDescription || parsed.options[1].label || ''),
        resultingAction: ['ACCEPT_WITH_DOCS', 'REJECT_TAX_DEDUCTION', 'FORWARD_TO_CFO', 'REQUEST_SUPPLIER_REISSUE', 'ACCEPT_ADJUSTMENT'].includes(parsed.options[1].resultingAction)
          ? parsed.options[1].resultingAction
          : 'REJECT_TAX_DEDUCTION'
      }
    ];
  }

  // Validate bằng Zod Guardrail
  const validated = GeminiQuestionResultSchema.parse(parsed);
  return validated;
}


