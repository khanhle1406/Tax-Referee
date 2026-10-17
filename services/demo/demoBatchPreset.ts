/**
 * Lô dựng sẵn cho buổi trình bày trên máy local: phiên demo mới mở ra đã có lô để nói ngay, không phải chờ tải 25 file.
 * Chỉ chạy khi chủ máy đặt TAX_REFEREE_DEMO_PRESET_BATCHES=1 (mặc định tắt, bản live không đổi).
 *  - Lô 1 "cuối tháng 10": 25 file mẫu (data/demo-batch) do Kế toán viên tải lên, theo thứ tự và luật của màn hình Lô hóa đơn
 *    (đọc XML tất định → bỏ file trùng → xếp MST → ngày → số → máy kiểm từng tờ → gắn lô; không tra cứu bên bán qua mạng);
 *    để MỞ cho Kế toán trưởng trả lời nhóm và chốt.
 *  - Lô 2 "tuần 2 tháng 10": 5 hóa đơn thường quy, Kế toán trưởng đã chốt — để Tổng quan và Lịch sử có số liệu ngay.
 */
import crypto from 'node:crypto';
import { getDatabase } from '@/lib/server/db';
import type { AppRole, AppUser } from '@/lib/server/auth';
import { switchRole } from '@/lib/server/auth';
import type { InvoiceInput } from '@/lib/schemas';
import { assertValidXml, parseXml, sanitizeInvoice } from '@/lib/documentParser';
import { attachToBatch, createBatch, signOffBatch } from '@/services/batchService';
import { evaluateWorkflow } from '@/services/workflowService';
import { DEMO_BATCH_FILES } from './demoBatchData';

export const demoBatchPresetEnabled = (): boolean => process.env.TAX_REFEREE_DEMO_PRESET_BATCHES === '1';

function userFor(role: AppRole): AppUser {
  const row = getDatabase().prepare('SELECT id, email, display_name, role FROM users WHERE role = ? LIMIT 1').get(role) as { id: string; email: string; display_name: string; role: AppRole } | undefined;
  if (row) return { id: row.id, email: row.email, displayName: row.display_name, role: row.role };
  const session = switchRole(role);
  if (!session) throw new Error(`Không có tài khoản ${role} trong phiên demo.`);
  return session.user;
}

const routine = (n: number, taxCode: string, supplierName: string, itemName: string, preTaxAmount: number, taxRate: 8 | 10): InvoiceInput => ({
  id: `LO-T2-${n}`, invoiceNumber: `00003${String(n).padStart(2, '0')}`, invoiceDate: '2026-10-08', supplierTaxCode: taxCode, supplierName,
  itemName, preTaxAmount, taxRate, taxAmount: Math.round(preTaxAmount * taxRate / 100), totalAmount: Math.round(preTaxAmount * (100 + taxRate) / 100),
  paymentMethod: 'BANK_TRANSFER', isImageBlurry: false, isAdjustment: false, sellerStatus: 'UNKNOWN',
});
const WEEK2: InvoiceInput[] = [
  routine(1, '0300911003', 'CÔNG TY TNHH NƯỚC SẠCH PHÚ AN (MẪU)', 'Nước uống đóng bình 20L tháng 10', 1_200_000, 8),
  routine(2, '0300912007', 'CÔNG TY TNHH VIỄN THÔNG SAO MAI (MẪU)', 'Cước internet văn phòng tháng 10', 1_500_000, 10),
  routine(3, '0300913000', 'CÔNG TY TNHH CHUYỂN PHÁT TÍN THÀNH (MẪU)', 'Phí chuyển phát hồ sơ tuần 2', 650_000, 8),
  routine(4, '0300914004', 'CÔNG TY TNHH VĂN PHÒNG PHẨM HỒNG HÀ (MẪU)', 'Giấy in A4 và bìa hồ sơ', 2_400_000, 8),
  routine(5, '0300915008', 'CÔNG TY TNHH VỆ SINH CÔNG NGHIỆP SẠCH (MẪU)', 'Dịch vụ vệ sinh văn phòng tuần 2', 3_000_000, 8),
];

/** Đọc một file XML mẫu như màn hình Lô hóa đơn; file không có số hóa đơn và số tiền ⇒ lỗi "Không phải hóa đơn". */
function readSample(fileName: string, xml: string): { invoice?: InvoiceInput; error?: string } {
  try {
    assertValidXml(xml);
    const { invoice } = sanitizeInvoice(parseXml(xml).rawInvoice);
    if (!invoice.invoiceNumber && !invoice.totalAmount) return { error: 'Không phải hóa đơn (không có số hóa đơn, số tiền)' };
    return { invoice: { ...invoice, id: `LO-T10-${fileName.slice(0, 2)}` } as InvoiceInput };
  } catch (error) { return { error: error instanceof Error ? error.message.slice(0, 200) : 'Không đọc được' }; }
}

/** Dựng hai lô mẫu trong database của phiên demo hiện tại. Chỉ chạy một lần (bỏ qua nếu phiên đã có lô). */
export async function seedDemoBatches(): Promise<{ batches: string[] }> {
  const db = getDatabase();
  if ((db.prepare('SELECT COUNT(*) n FROM batches').get() as { n: number }).n > 0) return { batches: [] };
  const accountant = userFor('ACCOUNTANT');
  const chief = userFor('CHIEF_ACCOUNTANT');

  // Lô 2 trước (đã chốt từ tuần trước), để lô cuối tháng hiện trên cùng danh sách.
  const week2 = createBatch(accountant, { label: 'Lô tuần 2 tháng 10 · 5 hóa đơn (đã chốt)', source: 'UPLOAD' });
  for (const invoice of WEEK2) {
    await evaluateWorkflow(invoice, accountant, { forceLocalOnly: true });
    attachToBatch(accountant, week2.id, { invoiceId: invoice.id, fileName: `${invoice.invoiceNumber}.xml` });
  }
  signOffBatch(week2.id, chief, 'Chốt lô tuần 2 sau khi xem phiếu giải trình từng hóa đơn (dữ liệu dựng sẵn cho demo)');

  const month = createBatch(accountant, { label: 'Lô cuối tháng 10 · 25 file (Kế toán viên tải lên)', source: 'UPLOAD' });
  const parsed = DEMO_BATCH_FILES.map((file, index) => ({ index, file, sha: crypto.createHash('sha256').update(file.xml).digest('hex'), ...readSample(file.fileName, file.xml) }));
  const key = (p: typeof parsed[number]) => [String(p.invoice?.supplierTaxCode ?? '~'), String(p.invoice?.invoiceDate ?? '~'), String(p.invoice?.invoiceNumber ?? '~')].join('|');
  parsed.sort((a, b) => key(a).localeCompare(key(b)) || a.index - b.index);
  const seen = new Set<string>();
  for (const p of parsed) {
    if (seen.has(p.sha)) continue; // cùng nội dung với file đã nhận: không đưa qua máy kiểm lần hai
    seen.add(p.sha);
    if (!p.invoice) { attachToBatch(accountant, month.id, { fileName: p.file.fileName, fileSha256: p.sha, error: p.error ?? 'Không đọc được' }); continue; }
    try {
      const result = await evaluateWorkflow(p.invoice, accountant, { forceLocalOnly: true }) as { decision?: { invoiceId?: string } };
      attachToBatch(accountant, month.id, { invoiceId: result.decision?.invoiceId ?? p.invoice.id, fileName: p.file.fileName, fileSha256: p.sha });
    } catch (error) {
      attachToBatch(accountant, month.id, { fileName: p.file.fileName, fileSha256: p.sha, error: error instanceof Error ? error.message.slice(0, 200) : 'Lỗi kiểm' });
    }
  }
  return { batches: [week2.id, month.id] };
}
