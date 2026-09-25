import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { extractInvoiceWithGemini } from '@/services/geminiService';
import { DocumentExtractionSchema } from '@/lib/schemas';
import { getDatabase, jsonNow } from '@/lib/server/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function tag(xml: string, name: string): string | undefined {
  const pattern = `<(?:[a-zA-Z0-9_]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[a-zA-Z0-9_]+:)?${name}>`;
  const match = xml.match(new RegExp(pattern, 'i'));
  return match?.[1]?.replace(/<[^>]+>/g, '').trim() || undefined;
}

function numberValue(value?: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  const str = String(value).trim();
  if (!str) return undefined;
  // Xử lý các định dạng số: 10.000.000 hoặc 10,000,000.00 hoặc 10%
  const cleaned = str.replace(/%/g, '').trim();
  const normalized = cleaned.replace(/[^0-9,.-]/g, '');
  if (normalized.includes('.') && normalized.includes(',')) {
    // Kiểu VN: 1.000.000,50 -> bỏ chấm, thay phẩy bằng chấm
    const vnParsed = Number(normalized.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(vnParsed) ? vnParsed : undefined;
  }
  // Nếu chỉ có dấu chấm: có thể là phân cách hàng nghìn kiểu VN (VD 10.000.000)
  if (/^\d{1,3}(\.\d{3})+$/.test(normalized)) {
    return Number(normalized.replace(/\./g, ''));
  }
  // Nếu chỉ có dấu phẩy: có thể là phân cách hàng nghìn US (VD 10,000,000)
  if (/^\d{1,3}(,\d{3})+$/.test(normalized)) {
    return Number(normalized.replace(/,/g, ''));
  }
  const parsed = Number(normalized.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseXml(xml: string) {
  // 1. Trích xuất khối Người bán <NBan> hoặc <SellerInfo> hoặc <Seller>
  const nbanMatch =
    xml.match(/<NBan[\s\S]*?<\/NBan>/i)?.[0] ||
    xml.match(/<SellerInfo[\s\S]*?<\/SellerInfo>/i)?.[0] ||
    xml.match(/<Seller[\s\S]*?<\/Seller>/i)?.[0] ||
    '';
  const supplierTaxCode =
    tag(nbanMatch, 'MST') ||
    tag(nbanMatch, 'TaxID') ||
    tag(xml, 'SellerTaxCode') ||
    tag(xml, 'TaxCode') ||
    tag(xml, 'MST');

  const supplierName =
    tag(nbanMatch, 'Ten') ||
    tag(nbanMatch, 'TenNBan') ||
    tag(nbanMatch, 'CompanyName') ||
    tag(nbanMatch, 'Name') ||
    tag(xml, 'SellerLegalName') ||
    tag(xml, 'SellerName') ||
    tag(xml, 'CompanyName') ||
    tag(xml, 'Ten');

  // 2. Trích xuất số hóa đơn
  const invoiceNumber =
    tag(xml, 'SHDon') ||
    tag(xml, 'SHD') ||
    tag(xml, 'InvNum') ||
    tag(xml, 'InvoiceNumber') ||
    tag(xml, 'InvoiceNo') ||
    tag(xml, 'SoHoaDon');

  // 3. Trích xuất ngày lập hóa đơn
  const rawDate =
    tag(xml, 'NLap') ||
    tag(xml, 'NgayLap') ||
    tag(xml, 'InvDate') ||
    tag(xml, 'InvoiceDate') ||
    tag(xml, 'IssueDate');

  // 4. Trích xuất tên hàng hóa dịch vụ
  const itemName =
    tag(xml, 'THHDVu') ||
    tag(xml, 'TenHH') ||
    tag(xml, 'TenHang') ||
    tag(xml, 'TenHHDVu') ||
    tag(xml, 'ProductName') ||
    tag(xml, 'ProdName') ||
    tag(xml, 'ItemName') ||
    'Hàng hóa / Dịch vụ';

  // 5. Trích xuất tiền và thuế
  const preTaxAmount = numberValue(
    tag(xml, 'TgTCThue') ||
    tag(xml, 'TongTienHang') ||
    tag(xml, 'SubTotal') ||
    tag(xml, 'SubtotalAmount') ||
    tag(xml, 'ThTien') ||
    tag(xml, 'TotalSaleAmount') ||
    tag(xml, 'TotalAmountWithoutVAT') ||
    (tag(xml, 'GrandTotal') ? tag(xml, 'TotalAmount') : undefined) ||
    (tag(xml, 'TotalPayment') ? tag(xml, 'TotalAmount') : undefined)
  );

  const taxAmount = numberValue(
    tag(xml, 'TgTTThue') ||
    tag(xml, 'TgTThue') ||
    tag(xml, 'TongTienThue') ||
    tag(xml, 'TotalVAT') ||
    tag(xml, 'TotalVATAmount') ||
    tag(xml, 'VATAmount') ||
    tag(xml, 'TThue') ||
    tag(xml, 'TaxAmount')
  );

  const totalAmount = numberValue(
    tag(xml, 'TgTTTBSo') ||
    tag(xml, 'GrandTotal') ||
    tag(xml, 'TotalPayment') ||
    tag(xml, 'TongThanhToan') ||
    tag(xml, 'TongTien') ||
    tag(xml, 'TotalAmountWithVAT') ||
    tag(xml, 'InvoiceTotal') ||
    tag(xml, 'TotalAmount')
  );

  const taxRateRaw =
    tag(xml, 'TSuat') ||
    tag(xml, 'ThueSuat') ||
    tag(xml, 'VATRatePercent') ||
    tag(xml, 'TaxRatePercent') ||
    tag(xml, 'VATRate') ||
    tag(xml, 'VATPercentage');
  const taxRate = numberValue(taxRateRaw);

  const paymentMethodRaw = (tag(xml, 'HTTT') || tag(xml, 'PaymentMethod') || '').toUpperCase();
  const paymentMethod = paymentMethodRaw.includes('TM') && !paymentMethodRaw.includes('CK') ? 'CASH' : 'BANK_TRANSFER';

  // 6. Trích xuất chi tiết dòng hàng <Item> hoặc <HHDVu> (IMP-08)
  const items: Array<{
    lineNumber: number;
    itemName: string;
    unit?: string;
    quantity: number;
    unitPrice: number;
    amount: number;
    taxRate: number;
    taxAmount: number;
    discountAmount?: number;
  }> = [];

  const itemMatches = Array.from(xml.matchAll(/<(?:Item|HHDVu|Detail|Product)[\s\S]*?<\/(?:Item|HHDVu|Detail|Product)>/gi));
  let lineIdx = 1;
  for (const match of itemMatches) {
    const itemXml = match[0];
    const name = tag(itemXml, 'TenHang') || tag(itemXml, 'THHDVu') || tag(itemXml, 'ItemName') || tag(itemXml, 'ProductName') || tag(itemXml, 'ProdName');
    if (!name) continue;

    const unit = tag(itemXml, 'DVT') || tag(itemXml, 'DVTinh') || tag(itemXml, 'Unit');
    const quantity = numberValue(tag(itemXml, 'SoLuong') || tag(itemXml, 'SLuong') || tag(itemXml, 'Quantity') || tag(itemXml, 'ProdQuantity')) || 1;
    const unitPrice = numberValue(tag(itemXml, 'DonGia') || tag(itemXml, 'DGia') || tag(itemXml, 'Price') || tag(itemXml, 'ProdPrice')) || 0;
    const amount = numberValue(tag(itemXml, 'ThanhTien') || tag(itemXml, 'ThTien') || tag(itemXml, 'Amount') || tag(itemXml, 'ProdAmount')) || (quantity * unitPrice);
    const itemTaxRate = numberValue(tag(itemXml, 'ThueSuat') || tag(itemXml, 'TSuat') || tag(itemXml, 'VATRate') || tag(itemXml, 'TaxRate')) ?? (taxRate ?? 10);
    const itemTaxAmount = numberValue(tag(itemXml, 'TienThue') || tag(itemXml, 'TThue') || tag(itemXml, 'VATAmount') || tag(itemXml, 'TaxAmount')) ?? Math.round((amount * itemTaxRate) / 100);
    const discount = numberValue(tag(itemXml, 'TienCK') || tag(itemXml, 'ChietKhau') || tag(itemXml, 'DiscountAmount'));

    items.push({
      lineNumber: numberValue(tag(itemXml, 'STT')) || lineIdx++,
      itemName: name,
      unit: unit || 'Cái',
      quantity,
      unitPrice,
      amount,
      taxRate: itemTaxRate,
      taxAmount: itemTaxAmount,
      discountAmount: discount
    });
  }

  return {
    rawInvoice: {
      invoiceNumber,
      invoiceDate: rawDate,
      supplierTaxCode,
      supplierName,
      itemName,
      preTaxAmount,
      taxRate,
      taxAmount,
      totalAmount,
      paymentMethod,
      items: items.length > 0 ? items : undefined
    }
  };
}

function sanitizeInvoice(raw: Record<string, unknown>): { invoice: Record<string, unknown>; warnings: string[] } {
  const invoice: Record<string, unknown> = {};
  const warnings: string[] = [];

  // invoiceNumber
  if (raw.invoiceNumber && typeof raw.invoiceNumber === 'string') {
    const invNum = raw.invoiceNumber.trim();
    if (invNum) invoice.invoiceNumber = invNum;
  }

  // invoiceDate -> chuẩn hóa YYYY-MM-DD
  if (raw.invoiceDate && typeof raw.invoiceDate === 'string') {
    const trimmed = raw.invoiceDate.trim().split('T')[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      invoice.invoiceDate = trimmed;
    } else {
      const dmy = trimmed.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
      if (dmy) {
        const [, d, m, y] = dmy;
        invoice.invoiceDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      } else {
        const ymd = trimmed.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
        if (ymd) {
          const [, y, m, d] = ymd;
          invoice.invoiceDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        }
      }
    }
  }

  // supplierTaxCode -> 10 hoặc 13 ký tự số
  if (raw.supplierTaxCode) {
    const cleanedMst = String(raw.supplierTaxCode).replace(/[^0-9-]/g, '').trim();
    if (/^\d{10}(?:-\d{3})?$/.test(cleanedMst)) {
      invoice.supplierTaxCode = cleanedMst;
    } else {
      const digitsOnly = cleanedMst.replace(/-/g, '');
      if (digitsOnly.length === 10) {
        invoice.supplierTaxCode = digitsOnly;
      } else if (digitsOnly.length === 13) {
        invoice.supplierTaxCode = `${digitsOnly.slice(0, 10)}-${digitsOnly.slice(10)}`;
      } else if (digitsOnly.length > 0) {
        warnings.push(`Mã số thuế bên bán [${cleanedMst}] chưa chuẩn 10 hoặc 13 số.`);
      }
    }
  }

  // supplierName
  if (raw.supplierName && typeof raw.supplierName === 'string') {
    const name = raw.supplierName.trim();
    if (name.length >= 2) invoice.supplierName = name;
  }

  // itemName
  if (raw.itemName && typeof raw.itemName === 'string') {
    const item = raw.itemName.trim();
    if (item.length >= 1) invoice.itemName = item;
  }

  // Tiền & thuế
  const preTax = typeof raw.preTaxAmount === 'number' && Number.isFinite(raw.preTaxAmount) ? raw.preTaxAmount : numberValue(raw.preTaxAmount);
  const tax = typeof raw.taxAmount === 'number' && Number.isFinite(raw.taxAmount) ? raw.taxAmount : numberValue(raw.taxAmount);
  const total = typeof raw.totalAmount === 'number' && Number.isFinite(raw.totalAmount) ? raw.totalAmount : numberValue(raw.totalAmount);

  let rate: number | undefined;
  if (raw.taxRate !== undefined && raw.taxRate !== null) {
    const rateNum = typeof raw.taxRate === 'number' ? raw.taxRate : numberValue(raw.taxRate);
    if (rateNum !== undefined) {
      if (rateNum === 0 || rateNum === 8 || rateNum === 10) {
        rate = rateNum;
      } else if (rateNum <= 2) {
        rate = 0;
      } else if (rateNum >= 6 && rateNum <= 9) {
        rate = 8;
      } else if (rateNum >= 9.5 && rateNum <= 11) {
        rate = 10;
      }
    }
  }

  if (preTax !== undefined) invoice.preTaxAmount = Math.round(preTax);
  if (rate !== undefined) invoice.taxRate = rate;
  if (tax !== undefined) invoice.taxAmount = Math.round(tax);
  if (total !== undefined) invoice.totalAmount = Math.round(total);

  // Tự động suy luận số tiền còn thiếu nếu có 2 trong 3 trường
  if (invoice.preTaxAmount !== undefined && invoice.taxRate !== undefined && invoice.taxAmount === undefined) {
    invoice.taxAmount = Math.round((Number(invoice.preTaxAmount) * Number(invoice.taxRate)) / 100);
  }
  if (invoice.preTaxAmount !== undefined && invoice.taxAmount !== undefined && invoice.totalAmount === undefined) {
    invoice.totalAmount = Number(invoice.preTaxAmount) + Number(invoice.taxAmount);
  } else if (invoice.totalAmount !== undefined && invoice.preTaxAmount !== undefined && invoice.taxAmount === undefined) {
    invoice.taxAmount = Number(invoice.totalAmount) - Number(invoice.preTaxAmount);
  } else if (invoice.totalAmount !== undefined && invoice.taxAmount !== undefined && invoice.preTaxAmount === undefined) {
    invoice.preTaxAmount = Number(invoice.totalAmount) - Number(invoice.taxAmount);
  }

  // paymentMethod
  if (raw.paymentMethod === 'CASH' || raw.paymentMethod === 'BANK_TRANSFER') {
    invoice.paymentMethod = raw.paymentMethod;
  } else {
    warnings.push('Chưa xác định được phương thức thanh toán từ chứng từ gốc.');
  }

  if (typeof raw.hasBankSlip === 'boolean') invoice.hasBankSlip = raw.hasBankSlip;
  if (typeof raw.hasItemManifest === 'boolean') invoice.hasItemManifest = raw.hasItemManifest;
  invoice.isImageBlurry = Boolean(raw.isImageBlurry);
  invoice.sellerStatus = raw.sellerStatus === 'ACTIVE' || raw.sellerStatus === 'SUSPENDED' || raw.sellerStatus === 'CLOSED'
    ? raw.sellerStatus
    : 'UNKNOWN';
  invoice.isAdjustment = Boolean(raw.isAdjustment);

  // Chuẩn hóa danh sách dòng hàng (IMP-08)
  if (Array.isArray(raw.items) && raw.items.length > 0) {
    invoice.items = raw.items.map((it: any, index: number) => ({
      lineNumber: typeof it.lineNumber === 'number' ? it.lineNumber : index + 1,
      itemName: String(it.itemName || `Mặt hàng ${index + 1}`),
      unit: it.unit ? String(it.unit) : undefined,
      quantity: typeof it.quantity === 'number' ? it.quantity : 1,
      unitPrice: typeof it.unitPrice === 'number' ? it.unitPrice : 0,
      amount: typeof it.amount === 'number' ? it.amount : 0,
      taxRate: typeof it.taxRate === 'number' ? it.taxRate : (invoice.taxRate ?? 10),
      taxAmount: typeof it.taxAmount === 'number' ? it.taxAmount : 0,
      discountAmount: typeof it.discountAmount === 'number' ? it.discountAmount : undefined
    }));
  }

  const missingFields: string[] = [];
  if (!invoice.invoiceNumber) missingFields.push('số hóa đơn');
  if (!invoice.invoiceDate) missingFields.push('ngày lập');
  if (!invoice.supplierTaxCode) missingFields.push('mã số thuế');
  if (!invoice.supplierName) missingFields.push('tên người bán');
  if (!invoice.itemName) missingFields.push('tên hàng hóa');
  if (invoice.totalAmount === undefined) missingFields.push('tổng tiền');

  if (missingFields.length > 0) {
    warnings.push(`Chưa nhận diện đầy đủ: ${missingFields.join(', ')}. Kế toán vui lòng kiểm tra và bổ sung.`);
  }

  return { invoice, warnings };
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'Thiếu file chứng từ' }, { status: 400 });
    if (file.size > 15 * 1024 * 1024) return NextResponse.json({ error: 'File vượt quá 15MB' }, { status: 413 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const sourceHash = crypto.createHash('sha256').update(buffer).digest('hex');

    const fileNameLower = file.name.toLowerCase();
    const sourceType = file.type.includes('xml') || fileNameLower.endsWith('.xml')
      ? 'XML'
      : file.type === 'application/pdf' || fileNameLower.endsWith('.pdf')
      ? 'PDF'
      : file.type.startsWith('image/') || fileNameLower.endsWith('.png') || fileNameLower.endsWith('.jpg') || fileNameLower.endsWith('.jpeg') || fileNameLower.endsWith('.webp')
      ? 'IMAGE'
      : null;

    if (!sourceType) return NextResponse.json({ error: 'Chỉ hỗ trợ file XML, PDF và ảnh hóa đơn (PNG, JPG)' }, { status: 415 });

    const existingArtifact = getDatabase().prepare('SELECT id FROM document_artifacts WHERE content_hash = ?').get(sourceHash) as { id: string } | undefined;
    const artifactId = existingArtifact?.id || crypto.randomUUID();
    if (!existingArtifact) {
      const extension = path.extname(file.name).toLowerCase().replace(/[^a-z0-9.]/g, '') || '.bin';
      const artifactDirectory = path.join(process.cwd(), 'data', 'runtime', 'artifacts');
      const storagePath = path.join(artifactDirectory, `${artifactId}${extension}`);
      fs.mkdirSync(artifactDirectory, { recursive: true });
      fs.writeFileSync(storagePath, buffer, { flag: 'wx' });
      getDatabase().prepare(`
        INSERT INTO document_artifacts
          (id, invoice_id, revision, original_file_name, source_type, mime_type, storage_path, content_hash, byte_size, signature_status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        artifactId,
        `pending:${artifactId}`,
        1,
        file.name,
        sourceType,
        file.type || 'application/octet-stream',
        storagePath,
        sourceHash,
        buffer.byteLength,
        sourceType === 'XML' ? 'UNVERIFIED' : 'NOT_APPLICABLE',
        jsonNow()
      );
    }

    let rawData: Record<string, unknown> = {};
    let initialWarnings: string[] = [];

    if (sourceType === 'XML') {
      const parsed = parseXml(buffer.toString('utf8'));
      rawData = parsed.rawInvoice;
    } else {
      // PDF hoặc Image: Xác định chính xác MIME type cho Gemini
      let mimeType = file.type;
      if (!mimeType || mimeType === 'application/octet-stream') {
        if (fileNameLower.endsWith('.pdf')) mimeType = 'application/pdf';
        else if (fileNameLower.endsWith('.png')) mimeType = 'image/png';
        else if (fileNameLower.endsWith('.jpg') || fileNameLower.endsWith('.jpeg')) mimeType = 'image/jpeg';
        else if (fileNameLower.endsWith('.webp')) mimeType = 'image/webp';
        else mimeType = sourceType === 'PDF' ? 'application/pdf' : 'image/jpeg';
      }

      try {
        const extracted = await extractInvoiceWithGemini(buffer.toString('base64'), mimeType);
        rawData = (extracted || {}) as Record<string, unknown>;
        initialWarnings.push('Dữ liệu OCR được đọc bởi AI; kế toán vui lòng kiểm tra lại trước khi thẩm định.');
      } catch (geminiError) {
        console.warn('Gemini extraction fallback:', geminiError);
        initialWarnings.push('Không thể nhận diện tự động qua AI. Vui lòng nhập thông tin chứng từ trên Form.');
      }
    }

    const { invoice, warnings } = sanitizeInvoice(rawData);
    const combinedWarnings = [...initialWarnings, ...warnings];
    if (existingArtifact) combinedWarnings.push('File này đã tồn tại trong kho chứng từ; hệ thống tái sử dụng artifact theo SHA-256.');

    const result = DocumentExtractionSchema.parse({
      invoice,
      confidence: Object.fromEntries(Object.keys(invoice).map((key) => [key, sourceType === 'XML' ? 1 : 0.85])),
      needsReview: true,
      sourceType,
      artifactId,
      sourceHash,
      warnings: combinedWarnings
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Không thể đọc chứng từ' }, { status: 400 });
  }
}
