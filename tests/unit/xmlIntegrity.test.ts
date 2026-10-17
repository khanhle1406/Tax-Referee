/**
 * Toàn vẹn khi đọc và ghi XML (phát hiện từ CodeQL, đã phân loại và phản biện đối kháng):
 * - Đọc: app phải ra CÙNG giá trị với bộ đọc XML chuẩn — CDATA, chú thích, processing instruction, thuộc tính chứa '>',
 *   tham chiếu ký tự không làm lệch số tiền/MST; cấu trúc mơ hồ (phần tử trùng tên, dòng hàng lồng) bị từ chối (fail-closed).
 * - Ghi: tệp XML sổ cái và CSV không bị chèn phần tử/cột giả, không chứa ký tự cấm.
 * - File tạm PDF nằm trong thư mục riêng, quyền 600, và luôn được dọn.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { mock, test } from 'node:test';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { parseXml } from '../../lib/documentParser';
import { generateUniversalCsv, generateUniversalXml } from '../../lib/accounting/adapters/universalXmlExporter';
import type { CanonicalLedgerVoucher } from '../../lib/accounting/types';
import * as pdfHelpers from '../../lib/server/pdfToImage';

const SAMPLE_DIR = path.join(process.cwd(), 'input-sample');
const SAMPLE = fs.readFileSync(path.join(SAMPLE_DIR, '05_real_tct_invoice.xml'), 'utf-8');
const read = (xml: string) => parseXml(xml).rawInvoice as Record<string, unknown>;
const swap = (from: string, to: string) => { assert.ok(SAMPLE.includes(from), from); return SAMPLE.split(from).join(to); };
const TOTAL = '>22880000<';

test('XML: CDATA, chú thích, PI, thuộc tính và tham chiếu ký tự không làm app đọc lệch bộ đọc XML chuẩn', () => {
  assert.deepEqual([read(SAMPLE).totalAmount, read(SAMPLE).supplierTaxCode], [22_880_000, '0123456789']);
  const variants: Array<[string, string]> = [
    ['>2<![CDATA[2]]>880000<', 'CDATA giữa số tiền'],
    ['>2<![CDATA[2]]><![CDATA[8]]>80000<', 'nhiều đoạn CDATA'],
    ['>&#50;2880000<', 'tham chiếu ký tự thập phân'],
    ['>&#x32;2880000<', 'tham chiếu ký tự thập lục phân'],
    ['>2<!-- 1 -->2880000<', 'chú thích giữa số tiền'],
    ['>2<?x ?>2880000<', 'PI giữa số tiền'],
    ['>2<?x <!-- ?>2880000<?y --> ?><', 'PI chứa "<!--" không được che văn bản thật'],
    ['>2<?x <![CDATA[ ?>2880000<?y ]]> ?><', 'PI chứa "<![CDATA[" không được che văn bản thật'],
    ['><?x >4400000<!-- ?>22880000<?y --> ?><', 'PI ẩn + hiện thay trọn giá trị'],
    ['>22<?x >,?>880000<', 'PI chứa ">" không lộ dữ liệu PI'],
  ];
  for (const [replacement, label] of variants) assert.equal(read(swap(TOTAL, replacement)).totalAmount, 22_880_000, label);
  const cdata = swap(TOTAL, '>2<![CDATA[2]]>880000<');
  assert.equal(new XMLParser({ parseTagValue: false }).parse(cdata).Invoice.TotalAmount, '22880000', 'bộ đọc chuẩn cho cùng giá trị');
  assert.equal(read(swap('<TotalAmount>22880000</TotalAmount>', '<TotalAmount note="a>,">22880000</TotalAmount>')).totalAmount, 22_880_000, 'thuộc tính chứa ">"');
  assert.equal(read(swap('>0123456789<', '>0<![CDATA[1]]>23456789<')).supplierTaxCode, '0123456789', 'MST trong CDATA');
  assert.equal(read(swap('>ABC Technology Company<', '>ABC &amp; Co &#8212; T&#7853;p &#273;o&#224;n<')).supplierName, 'ABC & Co — Tập đoàn', 'giải mã thực thể trong tên');
});

test('XML: tham chiếu tới ký tự cấm, thực thể sai chữ hoa và "&" lẻ bị từ chối như bộ đọc chuẩn', () => {
  for (const bad of ['&#0;', '&#1;', '&#xD800;', '&#xFFFE;', '&AMP;', '&#X32;', 'A & B'])
    assert.throws(() => parseXml(swap('>ABC Technology Company<', `>ABC${bad}Tech<`)), /sai cấu trúc/, bad);
});

test('XML: cấu trúc mơ hồ — phần tử tổng tiền trùng tên, khối bên bán trùng, dòng hàng lồng — bị từ chối thay vì lấy phần tử đầu tiên', () => {
  const ambiguous: Array<[string, string]> = [
    [swap('<SubtotalAmount>', '<Remarks2><TotalAmount>2200000</TotalAmount></Remarks2><SubtotalAmount>'), 'TotalAmount giả đứng trước'],
    [swap('<Seller>', '<Ext><Seller><TaxID>0312345678</TaxID></Seller></Ext><Seller>'), 'khối Seller giả'],
    [swap('<Item>', '<Item><Product></Product>'), 'dòng hàng lồng che dòng thật'],
  ];
  for (const [xml, label] of ambiguous) assert.throws(() => parseXml(xml), /không đọc tất định được/, label);
});

test('XML: 5 hóa đơn mẫu công khai đọc ra đúng như trước khi chuẩn hóa (số, MST, ngày, tiền, số dòng)', () => {
  const golden: Record<string, Record<string, unknown>> = {
    '01_real_viettel_sinvoice.xml': { invoiceNumber: '0000004', supplierTaxCode: '0100100100', buyerTaxCode: '0200200200', invoiceDate: '2026-01-18', preTaxAmount: 4100000, taxAmount: 410000, totalAmount: 4510000, items: 2 },
    '02_real_misa_meinvoice.xml': { invoiceNumber: '0000003', supplierTaxCode: '0555666777', buyerTaxCode: '0888999000', invoiceDate: '2026-01-17', preTaxAmount: 10850000, taxAmount: 1085000, totalAmount: 11935000, items: 2 },
    '03_real_vnpt_einvoice.xml': { invoiceNumber: '0000002', supplierTaxCode: '0111222333', buyerTaxCode: '0444555666', invoiceDate: '2026-01-16', preTaxAmount: 47500000, taxAmount: 4750000, totalAmount: 52250000, items: 1 },
    '04_real_fpt_einvoice.xml': { invoiceNumber: '0000005', supplierTaxCode: '0300300300', buyerTaxCode: null, invoiceDate: '2026-01-18', preTaxAmount: 270000000, taxAmount: 27000000, totalAmount: 297000000, items: 2 },
    '05_real_tct_invoice.xml': { invoiceNumber: '0000001', supplierTaxCode: '0123456789', buyerTaxCode: '9876543210', invoiceDate: '2026-01-15', preTaxAmount: 22000000, taxAmount: 2080000, totalAmount: 22880000, items: 2 },
  };
  for (const [file, want] of Object.entries(golden)) {
    const r = read(fs.readFileSync(path.join(SAMPLE_DIR, file), 'utf-8'));
    const got = { invoiceNumber: r.invoiceNumber, supplierTaxCode: r.supplierTaxCode, buyerTaxCode: r.buyerTaxCode ?? null, invoiceDate: r.invoiceDate,
      preTaxAmount: r.preTaxAmount, taxAmount: r.taxAmount, totalAmount: r.totalAmount, items: (r.items as unknown[] | undefined)?.length ?? 0 };
    assert.deepEqual(got, want, file);
  }
});

const voucher = (over: Partial<CanonicalLedgerVoucher> = {}): CanonicalLedgerVoucher => ({
  id: 'V-1', voucherNumber: 'PK-001', voucherDate: '2026-10-17', invoiceRef: '0000123', invoiceDate: '2026-10-05', supplierTaxCode: '0312345678',
  supplierName: 'Công ty A', itemName: 'Giấy in', preTaxAmount: 2_000_000, taxRate: 10, taxAmount: 200_000, approvedTaxAmount: 200_000,
  totalAmount: 2_200_000, paymentMethod: 'BANK_TRANSFER', auditHash: 'abc', status: 'READY_TO_POST', referenceNotes: '',
  entries: [{ accountCode: '1331', accountName: 'Thuế GTGT đầu vào', debitAmount: 200_000, creditAmount: 0, memo: 'Khấu trừ' }], ...over,
});

test('XML sổ cái: không chèn được phần tử giả, không chứa ký tự cấm; bộ đọc chuẩn khôi phục đúng chuỗi gốc', () => {
  const v = voucher({ invoiceRef: '1</InvoiceNo><ApprovedTaxAmount>999999999</ApprovedTaxAmount><InvoiceNo>', supplierName: 'Công ty A ]]><Hack/> & "B"\u0001￾',
    entries: [{ accountCode: '1331', accountName: 'Thuế GTGT <đầu vào>', debitAmount: 200_000, creditAmount: 0, memo: 'x]]>y\uD800' }] });
  const xml = generateUniversalXml([v]);
  assert.equal(XMLValidator.validate(xml), true, 'tệp XML hợp lệ');
  assert.equal(xml.match(/<ApprovedTaxAmount>/g)?.length, 1, 'chỉ một ApprovedTaxAmount');
  assert.ok(!xml.includes('<Hack/>'), 'không có phần tử chèn qua tên nhà cung cấp');
  assert.ok(!/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDFFF]/.test(xml), 'không có ký tự cấm trong XML 1.0');
  const parsed = new XMLParser({ ignoreAttributes: true, parseTagValue: false }).parse(xml).AccountingLedgerBatch.Vouchers.Voucher;
  assert.equal(parsed.InvoiceNo, v.invoiceRef);
  assert.equal(parsed.ApprovedTaxAmount, '200000');
});

/** Tách một dòng CSV theo RFC 4180 (ô trong nháy kép, "" là một nháy kép). */
function csvFields(line: string): string[] {
  const fields: string[] = [];
  let cur = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') quoted = false; else cur += ch; }
    else if (ch === '"') quoted = true;
    else if (ch === ',') { fields.push(cur); cur = ''; }
    else cur += ch;
  }
  fields.push(cur);
  return fields;
}

test('CSV sổ cái: nháy kép trong dữ liệu không tạo được cột/dòng giả; công thức bị vô hiệu', () => {
  const invoiceRef = '1","2026-01-01","0000000000","NCC giả","x","1331","331",999999999,"';
  const csv = generateUniversalCsv([voucher({ invoiceRef, supplierName: '=HYPERLINK("http://x","bấm")' })]);
  const lines = csv.replace(/^﻿/, '').trim().split(/\r?\n/);
  assert.equal(lines.length, 2, 'một dòng tiêu đề + một dòng dữ liệu');
  const header = csvFields(lines[0]), row = csvFields(lines[1]);
  assert.equal(row.length, header.length, 'đúng số cột như tiêu đề');
  assert.equal(row[2], invoiceRef, 'số hóa đơn nằm trọn trong một ô');
  assert.equal(row[5], `'=HYPERLINK("http://x","bấm")`, 'công thức được thêm dấu nháy đơn');
  assert.equal(row[9], '200000', 'số tiền đúng ở cột của nó');
});

test('PDF: file tạm ghi vào thư mục riêng, cờ wx, quyền 600, luôn được dọn; không còn hàm PDF→PNG không dùng', () => {
  assert.equal('convertPdfToPngBase64' in pdfHelpers, false);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-pdf-test-'));
  const saved = { TMPDIR: process.env.TMPDIR, TEMP: process.env.TEMP, TMP: process.env.TMP };
  Object.assign(process.env, { TMPDIR: dir, TEMP: dir, TMP: dir });
  const spy = mock.method(fs, 'writeFileSync');
  try {
    pdfHelpers.extractTextFromPdfBuffer(Buffer.from('%PDF-1.4\n%%EOF'));
    const call = spy.mock.calls.find(c => String(c.arguments[0]).endsWith('input.pdf'));
    assert.ok(call, 'có ghi file PDF tạm');
    const [file, , opts] = call.arguments as [string, unknown, { flag?: string; mode?: number }];
    assert.notEqual(path.dirname(file), dir, 'không ghi thẳng vào thư mục tạm dùng chung');
    assert.deepEqual([opts.flag, opts.mode], ['wx', 0o600]);
    // Windows: lệnh python3 trỏ tới stub Microsoft Store thì stub tự ghi python_install_*.log vào %TEMP% — không phải file của ứng dụng.
    assert.deepEqual(fs.readdirSync(dir).filter(f => !/^python_install_\d+_\d+\.log$/.test(f)), [], 'không để lại file hay thư mục tạm');
  } finally {
    spy.mock.restore();
    for (const [key, value] of Object.entries(saved)) value === undefined ? delete process.env[key] : (process.env[key] = value);
    try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* Windows: tiến trình python3 bị timeout có thể còn giữ thư mục */ }
  }
});

test('XML: hai thẻ <HTTToan> (hình thức thanh toán) bị từ chối — không để thẻ giả "Chuyển khoản" đứng trước thẻ "Tiền mặt" thật', () => {
  const xml = fs.readFileSync(path.join(process.cwd(), 'data', 'demo-batch', '01-van-phong-pham.xml'), 'utf-8');
  assert.ok(xml.includes('<HTTToan>'));
  assert.doesNotThrow(() => parseXml(xml));
  assert.throws(() => parseXml(xml.replace('<HTTToan>', '<HTTToan>Chuyển khoản</HTTToan><HTTToan>')), /không đọc tất định được/);
});

test('XML: thẻ <HTTToan> giả đặt trong dòng hàng (trước TTChung thật) không được chọn — hóa đơn tiền mặt vẫn là tiền mặt', () => {
  const xml = fs.readFileSync(path.join(process.cwd(), 'data', 'demo-batch', '16-tien-mat-lon.xml'), 'utf-8');
  const read = (source: string) => (parseXml(source).rawInvoice as { paymentMethod?: string }).paymentMethod;
  assert.equal(read(xml), 'CASH');
  assert.equal(read(xml.replace('<HHDVu>', '<HHDVu><HTTToan>Chuyển khoản</HTTToan>')), 'CASH');
});
