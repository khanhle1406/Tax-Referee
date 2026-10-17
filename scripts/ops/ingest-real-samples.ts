import './setup-env';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getDatabase, jsonNow, hashPayload, getActivePolicy, getMacroState } from '../../lib/server/db';
import { extractInvoiceWithUnifiedAI } from '../../services/aiCoordinator';
import { queryJevReferee } from '../../services/jevService';
import { InvoiceInput, InvoiceInputSchema } from '../../lib/schemas';

// Use the same parser as uploads; absent evidence remains absent.
import { parseXml, sanitizeInvoice } from '../../lib/documentParser';
export function parseRealXml(xmlContent: string, fileName: string): InvoiceInput {
  const parsed = parseXml(xmlContent);
  const { invoice } = sanitizeInvoice(parsed.rawInvoice);
  return InvoiceInputSchema.parse({ ...invoice, id: `REAL-${fileName.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 30)}` });
}

async function main() {
  console.log('========================================================================');
  console.log('TIẾN HÀNH NẠP DỮ LIỆU HÓA ĐƠN THỰC TẾ 100% VÀO TAX REFEREE DATABASE');
  console.log('========================================================================\n');

  const db = getDatabase();

  // 1. Dọn các bản ghi thử nghiệm cũ nhưng giữ nguyên audit history
  console.log('>>> Bước 1: Dọn dẹp dữ liệu thử nghiệm cũ...');
  db.exec(`
    DELETE FROM evaluations WHERE invoice_id LIKE 'PILOT-%' OR invoice_id LIKE 'TC-%' OR invoice_id LIKE 'INV-TEST-%';
    DELETE FROM invoices WHERE id LIKE 'PILOT-%' OR id LIKE 'TC-%' OR id LIKE 'INV-TEST-%';
  `);
  console.log('    ✓ Đã dọn bản ghi thử nghiệm, audit history được giữ nguyên.\n');

  // 2. Quét các file thực tế trong input-sample/
  const inputDir = path.resolve(process.cwd(), 'input-sample');
  const files = fs.readdirSync(inputDir, { withFileTypes: true })
    .filter(entry => entry.isFile() && /\.(xml|pdf|png|jpe?g|webp)$/i.test(entry.name))
    .map(entry => entry.name)
    .sort();
  console.log(`>>> Bước 2: Tìm thấy ${files.length} hóa đơn thực tế trong input-sample/:\n`);

  const activePolicy = getActivePolicy();
  const macroState = getMacroState();

  let count = 0;
  for (const fileName of files) {
    const filePath = path.join(inputDir, fileName);
    const ext = path.extname(fileName).toLowerCase();
    console.log(`[${++count}/${files.length}] Đang xử lý hồ sơ thực tế: ${fileName}...`);

    let invoiceInput: InvoiceInput | null = null;

    try {
      if (ext === '.xml') {
        const xml = fs.readFileSync(filePath, 'utf-8');
        invoiceInput = parseRealXml(xml, fileName);
        console.log(`    + Bóc tách XML: HĐ #${invoiceInput.invoiceNumber} | NCC: ${invoiceInput.supplierName} | Tổng: ${invoiceInput.totalAmount.toLocaleString('vi-VN')}₫`);
      } else {
        // PDF scan hoặc ảnh chỉ được gửi tới model cấu hình khi không thể đọc cục bộ.
        console.log(`    + Đang đọc chứng từ bằng engine cấu hình, không dùng dữ liệu mặc định...`);
        try {
          const buffer = fs.readFileSync(filePath);
          const base64 = buffer.toString('base64');
          const mimeType = ext === '.pdf' ? 'application/pdf' : ext === '.png' ? 'image/png' : 'image/jpeg';

          const { data: extractedResult, engineUsed } = await extractInvoiceWithUnifiedAI(base64, mimeType, fileName);
          console.log(`    + OCR thành công qua ${engineUsed}!`);
          
          const invDate = String(extractedResult.invoiceDate || '').split('T')[0];
          const mst = String(extractedResult.supplierTaxCode || '').replace(/[^0-9-]/g, '');
          const preTax = Number(extractedResult.preTaxAmount);
          const rate = Number(extractedResult.taxRate);
          const tax = Number(extractedResult.taxAmount);
          const total = Number(extractedResult.totalAmount);

          if (!/^\d{4}-\d{2}-\d{2}$/.test(invDate) || !Number.isFinite(preTax) || ![0, 5, 8, 10].includes(rate) || !Number.isFinite(tax) || !Number.isFinite(total) || !extractedResult.invoiceNumber || !extractedResult.supplierName || !extractedResult.itemName) {
            throw new Error('Engine trích xuất không trả đủ trường có bằng chứng của hóa đơn');
          }

          invoiceInput = {
            id: `REAL-${fileName.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 30)}`,
            invoiceNumber: String(extractedResult.invoiceNumber),
            invoiceDate: invDate,
            supplierTaxCode: mst,
            supplierName: String(extractedResult.supplierName),
            itemName: String(extractedResult.itemName),
            preTaxAmount: preTax,
            taxRate: rate as any,
            taxAmount: tax,
            totalAmount: total,
            ...(extractedResult.paymentMethod ? { paymentMethod: extractedResult.paymentMethod } : {}),
            ...(extractedResult.hasBankSlip !== undefined ? { hasBankSlip: extractedResult.hasBankSlip } : {}),
            ...(extractedResult.hasItemManifest !== undefined ? { hasItemManifest: extractedResult.hasItemManifest } : {}),
            sellerStatus: 'UNKNOWN',
            isImageBlurry: Boolean(extractedResult.isImageBlurry),
            isAdjustment: false,
            items: Array.isArray(extractedResult.items) && extractedResult.items.length > 0 ? (extractedResult.items as any) : undefined
          };

          console.log(`    + AI extraction thành công: HĐ #${invoiceInput.invoiceNumber} | NCC: ${invoiceInput.supplierName} | Tổng: ${invoiceInput.totalAmount.toLocaleString('vi-VN')}₫`);
        } catch (ocrErr: any) {
          throw new Error(`Không thể OCR file ${fileName} mà không suy diễn dữ liệu: ${ocrErr?.message || ocrErr}`);
        }
      }

      // Xác thực Zod Schema
      const validatedInvoice = InvoiceInputSchema.parse(invoiceInput);

      // Thẩm định qua Dual Engine AI (Policy Engine + Qwen AI thật)
      console.log(`    + Thẩm định qua Tax Referee Policy Engine & Qwen AI...`);
      const evalResult = await queryJevReferee(validatedInvoice, {
        forceLocalOnly: false,
        useGenerativeQGen: true,
        macroState,
        policyVersion: activePolicy.version
      });

      console.log(`    ✓ Phán quyết: [${evalResult.decision.status}] | Engine: ${evalResult.engineUsed} | Risk Score: ${evalResult.riskScore}`);
      if (evalResult.decision.status === 'ESCALATED') {
        console.log(`      - Lý do: ${evalResult.decision.flaggedReason}`);
        console.log(`      - Cấp xử lý: ${evalResult.decision.requiresCFO ? 'CFO' : 'KTT'}`);
      }

      // Lưu vào SQLite Database
      const timestamp = jsonNow();
      const workflowStatus = evalResult.decision.status === 'ROUTINE'
        ? 'ROUTINE_PROPOSED'
        : (evalResult.decision.requiresCFO ? 'WAITING_CFO' : 'WAITING_CHIEF_ACCOUNTANT');

      db.prepare(`
        INSERT OR REPLACE INTO invoices (id, invoice_number, supplier_tax_code, invoice_date, payload_json, content_hash, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        validatedInvoice.id,
        validatedInvoice.invoiceNumber,
        validatedInvoice.supplierTaxCode,
        validatedInvoice.invoiceDate,
        JSON.stringify(validatedInvoice),
        hashPayload(validatedInvoice),
        workflowStatus,
        timestamp,
        timestamp
      );

      const evaluationId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO evaluations (id, invoice_id, decision_json, policy_version, legal_version, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        evaluationId,
        validatedInvoice.id,
        JSON.stringify(evalResult.decision),
        activePolicy.version,
        evalResult.decision.applicableRegulations?.join(',') || null,
        timestamp
      );

      // Lưu Document Artifacts để phục vụ truy xuất nguyên bản và kiểm thử
      const artifactId = crypto.randomUUID();
      const fileBytes = fs.readFileSync(filePath);
      const sourceHash = crypto.createHash('sha256').update(fileBytes).digest('hex');
      const storageDir = path.join(process.cwd(), 'data', 'runtime', 'artifacts');
      if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });
      const storagePath = path.join(storageDir, `${sourceHash}-${fileName}`);
      if (!fs.existsSync(storagePath)) fs.writeFileSync(storagePath, fileBytes);

      const isXml = ext === '.xml';
      const isPdf = ext === '.pdf';

      db.prepare(`
        INSERT OR REPLACE INTO document_artifacts
          (id, invoice_id, revision, original_file_name, source_type, mime_type, storage_path, content_hash, byte_size, signature_status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        artifactId,
        validatedInvoice.id,
        1,
        fileName,
        isXml ? 'XML' : (isPdf ? 'PDF' : 'IMAGE'),
        isXml ? 'application/xml' : (isPdf ? 'application/pdf' : 'image/jpeg'),
        storagePath,
        sourceHash,
        fileBytes.byteLength,
        isXml ? 'UNVERIFIED' : 'NOT_APPLICABLE',
        timestamp
      );

      console.log(`    ✓ Đã lưu thành công vào CSDL thực tế (Status: ${workflowStatus})\n`);

    } catch (err: any) {
      console.error(`    ✗ Lỗi khi xử lý file ${fileName}:`, err?.message || err);
    }
  }

  const finalCount = db.prepare('SELECT COUNT(*) as count FROM invoices').get() as { count: number };
  console.log('========================================================================');
  console.log(`HOÀN TẤT NẠP DỮ LIỆU! Hiện có tổng cộng ${finalCount.count} hóa đơn thực tế trong Inbox CSDL.`);
  console.log('========================================================================');
}

if (process.argv[1]?.includes('ingest-real-samples')) {
  main().catch(console.error);
}
