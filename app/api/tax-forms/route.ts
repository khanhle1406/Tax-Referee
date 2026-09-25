import { NextRequest, NextResponse } from 'next/server';
import { requireRequestUser } from '@/lib/server/auth';
import { getDatabase } from '@/lib/server/db';

export const dynamic = 'force-dynamic';

type InvoiceRow = { id: string; invoice_number: string; invoice_date: string; payload_json: string; status: string };

function parseInvoice(row: InvoiceRow): Record<string, unknown> {
  try { return JSON.parse(row.payload_json) as Record<string, unknown>; } catch { return {}; }
}

function escape(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char));
}

function form01(rows: InvoiceRow[], period: string) {
  const invoices = rows.map(parseInvoice);
  const totalPreTax = invoices.reduce((sum, invoice) => sum + Number(invoice.preTaxAmount || 0), 0);
  const totalTax = invoices.reduce((sum, invoice) => sum + Number(invoice.taxAmount || 0), 0);
  return {
    formCode: '01/GTGT',
    templateVersion: 'TT89/2026-DRAFT-MAPPING',
    period,
    status: 'DRAFT_REQUIRES_ACCOUNTANT_REVIEW',
    submissionReady: false,
    warning: 'Bản tổng hợp nội bộ chưa thay thế tờ khai điện tử chính thức và chưa được ký số.',
    sourceInvoiceIds: rows.map((row) => row.id),
    fields: {
      '21': { label: 'Không phát sinh hoạt động mua, bán trong kỳ', value: false, source: 'derived_from_approved_invoices' },
      '22': { label: 'Thuế GTGT còn được khấu trừ kỳ trước chuyển sang', value: 0, source: 'not_stored_in_current_system' },
      '23': { label: 'Giá trị hàng hóa, dịch vụ mua vào', value: totalPreTax, source: 'approved_invoice_payloads' },
      '24': { label: 'Thuế GTGT của hàng hóa, dịch vụ mua vào', value: totalTax, source: 'approved_invoice_payloads' },
      '25': { label: 'Thuế GTGT được khấu trừ kỳ này', value: totalTax, source: 'policy_approved_tax_only' },
      '30': { label: 'Hàng hóa, dịch vụ bán ra thuế suất 0%', value: 0, source: 'sales_ledger_not_stored' },
      '32': { label: 'Hàng hóa, dịch vụ bán ra thuế suất 5%', value: 0, source: 'sales_ledger_not_stored' },
      '33': { label: 'Hàng hóa, dịch vụ bán ra thuế suất 10%', value: 0, source: 'sales_ledger_not_stored' },
      '36': { label: 'Thuế GTGT còn phải nộp trong kỳ', value: 0, source: 'requires_sales_and_prior_period_data' },
      '40': { label: 'Thuế GTGT chưa khấu trừ hết chuyển kỳ sau', value: 0, source: 'requires_prior_period_data' },
      '43': { label: 'Thuế GTGT đề nghị hoàn', value: 0, source: 'requires_refund_request_data' }
    }
  };
}

function form04(row: InvoiceRow, reason: string) {
  const invoice = parseInvoice(row);
  return {
    formCode: '04/SS-HĐĐT',
    templateVersion: 'TT78/2021-DRAFT-MAPPING',
    status: 'DRAFT_REQUIRES_ACCOUNTANT_REVIEW',
    submissionReady: false,
    warning: 'Bản nháp thông báo sai sót chưa thay thế biểu mẫu điện tử chính thức và chưa được ký số.',
    fields: {
      invoiceNumber: invoice.invoiceNumber || row.invoice_number,
      invoiceDate: invoice.invoiceDate || row.invoice_date,
      supplierTaxCode: invoice.supplierTaxCode,
      supplierName: invoice.supplierName,
      originalInvoiceRef: invoice.originalInvoiceRef || null,
      errorReason: reason,
      proposedHandling: invoice.isAdjustment ? 'ADJUSTMENT_OR_REPLACEMENT_REVIEW' : 'SUPPLIER_CORRECTION_REVIEW'
    },
    missingRequiredForSubmission: ['Ký hiệu hóa đơn', 'Thông tin người mua đầy đủ', 'Mã cơ quan thuế', 'Chữ ký số người nộp']
  };
}

export async function GET(request: NextRequest) {
  try {
    requireRequestUser(request);
    const form = request.nextUrl.searchParams.get('form');
    const period = request.nextUrl.searchParams.get('period') || new Date().toISOString().slice(0, 7);
    const db = getDatabase();
    let payload: Record<string, unknown>;

    if (form === '01/GTGT') {
      const rows = db.prepare(`
        SELECT id, invoice_number, invoice_date, payload_json, status
        FROM invoices
        WHERE status = 'APPROVED' AND substr(invoice_date, 1, 7) = ?
        ORDER BY invoice_date, id
      `).all(period) as InvoiceRow[];
      payload = form01(rows, period);
    } else if (form === '04/SS-HĐĐT') {
      const invoiceId = request.nextUrl.searchParams.get('invoiceId');
      if (!invoiceId) return NextResponse.json({ error: 'Thiếu invoiceId cho mẫu 04/SS-HĐĐT' }, { status: 400 });
      const row = db.prepare('SELECT id, invoice_number, invoice_date, payload_json, status FROM invoices WHERE id = ?').get(invoiceId) as InvoiceRow | undefined;
      if (!row) return NextResponse.json({ error: 'Không tìm thấy hóa đơn' }, { status: 404 });
      payload = form04(row, request.nextUrl.searchParams.get('reason') || 'Cần thông báo sai sót sau khi đối chiếu');
    } else {
      return NextResponse.json({ error: 'Form chưa được hỗ trợ. Chọn 01/GTGT hoặc 04/SS-HĐĐT.' }, { status: 400 });
    }

    if (request.nextUrl.searchParams.get('format') === 'html') {
      return new NextResponse(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${escape(payload.formCode)}</title><style>body{font-family:Arial;max-width:900px;margin:32px auto;color:#172033}pre{white-space:pre-wrap;background:#f5f7fb;padding:16px}h1{font-size:22px;color:#9a3412}</style></head><body><h1>${escape(payload.formCode)} · BẢN NHÁP</h1><p>${escape(payload.warning)}</p><pre>${escape(JSON.stringify(payload, null, 2))}</pre></body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof Error && error.message === 'AUTH_REQUIRED') return NextResponse.json({ error: 'Vui lòng đăng nhập' }, { status: 401 });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Không thể tạo bản nháp biểu mẫu' }, { status: 500 });
  }
}
