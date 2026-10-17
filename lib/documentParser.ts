import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { parseNumberValue as numberValue, parseTaxRateString } from './utils';
import { normalizeTaxCodeFormat } from './taxCode';

type XmlTree = Record<string, unknown>;

function xmlScalar(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  // Cây được dựng từ XML đã chuẩn hóa với processEntities: false, nên giải mã thực thể đúng một lần tại đây (cùng quy tắc với regex).
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return decodeXmlText(String(value)).trim() || undefined;
  if (typeof value === 'object' && '#text' in (value as Record<string, unknown>)) {
    return xmlScalar((value as Record<string, unknown>)['#text']);
  }
  return undefined;
}

function walkXml(node: unknown, visit: (name: string, value: unknown) => void) {
  if (!node || typeof node !== 'object') return;
  for (const [name, value] of Object.entries(node as Record<string, unknown>)) {
    if (name.startsWith('@_')) continue;
    visit(name, value);
    if (Array.isArray(value)) value.forEach((child) => walkXml(child, visit));
    else walkXml(value, visit);
  }
}

function findXmlValues(root: unknown, names: string[]): string[] {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  const values: string[] = [];
  walkXml(root, (name, value) => {
    if (wanted.has(name.toLowerCase())) {
      if (Array.isArray(value)) value.forEach((item) => { const scalar = xmlScalar(item); if (scalar) values.push(scalar); });
      else { const scalar = xmlScalar(value); if (scalar) values.push(scalar); }
    }
  });
  return values;
}

function findXmlNodes(root: unknown, names: string[]): unknown[] {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  const nodes: unknown[] = [];
  walkXml(root, (name, value) => {
    if (!wanted.has(name.toLowerCase())) return;
    if (Array.isArray(value)) nodes.push(...value);
    else nodes.push(value);
  });
  return nodes;
}

function findXmlSection(root: unknown, names: string[]): unknown {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  let found: unknown;
  walkXml(root, (name, value) => {
    if (!found && wanted.has(name.toLowerCase())) found = value;
  });
  return found;
}

function structuredXmlFallback(xml: string): Record<string, unknown> {
  const parser = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
    trimValues: true,
    parseTagValue: false,
    processEntities: false,
    isArray: (name) => ['Item', 'HHDVu', 'Detail', 'Product', 'Line'].includes(name)
  });
  const root = parser.parse(xml) as XmlTree;
  const seller = findXmlSection(root, ['NBan', 'SellerInfo', 'Seller']);
  const buyer = findXmlSection(root, ['NMua', 'BuyerInfo', 'Buyer']);
  const first = (section: unknown, sectionNames: string[], rootNames: string[]) =>
    findXmlValues(section ?? {}, sectionNames)[0] || findXmlValues(root, rootNames)[0];
  const taxRate = parseTaxRateString(findXmlValues(root, ['TSuat', 'ThueSuat', 'VATRatePercent', 'TaxRatePercent', 'VATRate', 'VATPercentage'])[0]);
  const items = findXmlNodes(root, ['Item', 'HHDVu', 'Detail', 'Product', 'Line']).flatMap((node, index) => {
    if (!node || typeof node !== 'object') return [];
    const itemName = findXmlValues(node, ['TenHang', 'THHDVu', 'ItemName', 'ProductName', 'ProdName', 'ProductDesc', 'Description'])[0];
    if (!itemName) return [];
    const quantity = numberValue(findXmlValues(node, ['SoLuong', 'SLuong', 'Quantity', 'ProdQuantity'])[0]) ?? 1;
    const unitPrice = numberValue(findXmlValues(node, ['DonGia', 'DGia', 'Price', 'ProdPrice', 'UnitPrice'])[0]) ?? 0;
    const amount = numberValue(findXmlValues(node, ['ThanhTien', 'ThTien', 'Amount', 'TotalAmount', 'LineAmount', 'LineTotal'])[0]) ?? quantity * unitPrice;
    const itemRate = parseTaxRateString(findXmlValues(node, ['ThueSuat', 'TSuat', 'VATRate', 'TaxRate', 'TaxRatePercent', 'VATRatePercent'])[0]) ?? taxRate ?? 0;
    const taxAmount = numberValue(findXmlValues(node, ['TienThue', 'TThue', 'VATAmount', 'TaxAmount'])[0]) ?? (itemRate === 0 ? 0 : Math.round(amount * itemRate / 100));
    return [{
      lineNumber: numberValue(findXmlValues(node, ['STT', 'ItemNo', 'LineNo', 'LineNumber'])[0]) ?? index + 1,
      itemName,
      unit: findXmlValues(node, ['DVT', 'DVTinh', 'Unit', 'UnitOfMeasure'])[0] || undefined,
      quantity,
      unitPrice,
      amount,
      taxRate: itemRate,
      taxAmount
    }];
  });
  const raw: Record<string, unknown> = {
    supplierTaxCode: first(seller, ['MST', 'TaxID', 'SellerTaxCode'], ['SellerTaxCode', 'TaxCode', 'MST']),
    supplierName: first(seller, ['Ten', 'TenNBan', 'CompanyName', 'Name'], ['SellerLegalName', 'SellerName', 'CompanyName', 'Ten']),
    supplierAddress: first(seller, ['DChi', 'DiaChi', 'Address', 'SellerAddress'], ['SellerAddress', 'SupplierAddress']),
    buyerTaxCode: first(buyer, ['MST', 'TaxID', 'BuyerTaxCode'], ['BuyerTaxCode', 'NMuaMST']),
    buyerName: first(buyer, ['Ten', 'TenNMua', 'CompanyName', 'Name'], ['BuyerLegalName', 'BuyerName']),
    invoiceNumber: findXmlValues(root, ['SHDon', 'SHD', 'InvNum', 'InvoiceNumber', 'InvoiceNo', 'SoHoaDon'])[0],
    invoiceDate: findXmlValues(root, ['NLap', 'NgayLap', 'InvDate', 'InvoiceDate', 'IssueDate'])[0],
    invoiceSeries: findXmlValues(root, ['KHHDon', 'InvoiceSeries', 'Series', 'KyHieu'])[0],
    invoiceTemplate: findXmlValues(root, ['KHMSHDon', 'InvoiceTemplate', 'Template', 'MauSo'])[0],
    taxAuthorityCode: findXmlValues(root, ['MCCQT', 'TaxAuthorityCode', 'MaCQT'])[0],
    signingDate: findXmlValues(root, ['SigningDate', 'SignatureDate', 'NgayKy', 'SigningTime'])[0],
    itemName: findXmlValues(root, ['THHDVu', 'TenHH', 'TenHang', 'TenHHDVu', 'ProductName', 'ProdName', 'ItemName'])[0],
    preTaxAmount: numberValue(findXmlValues(root, ['TgTCThue', 'TongTienHang', 'SubTotal', 'SubtotalAmount', 'TotalAmountWithoutVAT'])[0]),
    taxAmount: numberValue(findXmlValues(root, ['TgTTThue', 'TgTThue', 'TongTienThue', 'TotalVAT', 'TotalVATAmount', 'VATAmount', 'TThue', 'TaxAmount'])[0]),
    totalAmount: numberValue(findXmlValues(root, ['TgTTTBSo', 'GrandTotal', 'TotalPayment', 'TongThanhToan', 'TongTien', 'TotalAmountWithVAT', 'InvoiceTotal', 'TotalAmount'])[0]),
    taxRate,
    items: items.length > 0 ? items : undefined
  };
  return Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== undefined));
}
/**
 * Đưa XML về dạng tương đương trước khi trích: bỏ chú thích, processing instruction và thuộc tính; thay mỗi đoạn CDATA
 * bằng chính văn bản của nó (đã escape). Nhờ vậy giá trị app đọc trùng với bộ đọc XML chuẩn của phần mềm kế toán và cơ quan
 * thuế — không thể chèn CDATA, chú thích, `<?pi ?>`, `>` trong thuộc tính hay tham chiếu ký tự để app thấy 2.880.000₫ trong
 * khi chứng từ pháp lý ghi 22.880.000₫ (parser differential). Ba loại token đầu được quét cùng lúc nên token này không che token kia.
 * Giới hạn còn lại: trích bằng tên thẻ lấy phần tử trùng tên đầu tiên, chưa theo đường dẫn schema.
 */
export function canonicalXmlForRegex(xml: string): string {
  // Lặp tới điểm dừng: bỏ một token có thể ghép phần còn lại thành token mới (ví dụ `<!-<!-- x -->-`).
  let text = xml;
  for (let previous = ''; previous !== text;) {
    previous = text;
    text = text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>/g, (_whole, cdata: string | undefined) =>
      cdata === undefined ? '' : cdata.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
  }
  // Thuộc tính không dùng để trích; giá trị thuộc tính hợp lệ có thể chứa '>' làm regex cắt thẻ sai chỗ.
  return text.replace(/<([A-Za-z_][\w:.-]*)(?:\s(?:[^>"'/]|"[^"]*"|'[^']*')*)?(\/?)>/g, '<$1$2>');
}

const XML_NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const isXmlChar = (cp: number) =>
  cp === 0x9 || cp === 0xa || cp === 0xd || (cp >= 0x20 && cp <= 0xd7ff) || (cp >= 0xe000 && cp <= 0xfffd) || (cp >= 0x10000 && cp <= 0x10ffff);
/** Giải mã tham chiếu thực thể và ký tự XML (`&amp;amp;`, `&#52;`, `&#x34;`) như bộ đọc XML chuẩn; tham chiếu tới ký tự cấm thì từ chối. */
export function decodeXmlText(text: string): string {
  return text.replace(/&(?:#x([0-9a-fA-F]+)|#([0-9]+)|(amp|lt|gt|quot|apos));/g, (_whole, hex?: string, dec?: string, named?: string) => {
    if (named) return XML_NAMED_ENTITIES[named];
    const codePoint = hex ? parseInt(hex, 16) : parseInt(dec as string, 10);
    if (!isXmlChar(codePoint)) throw new Error('Tệp XML rỗng hoặc sai cấu trúc.');
    return String.fromCodePoint(codePoint);
  });
}

function tag(xml: string, name: string): string | undefined {
  const pattern = `<(?:[a-zA-Z0-9_]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[a-zA-Z0-9_]+:)?${name}>`;
  const match = xml.match(new RegExp(pattern, 'i'));
  if (!match) return undefined;
  // Bỏ thẻ con, lặp tới điểm dừng để phần còn lại không ghép thành thẻ mới.
  let text = match[1];
  for (let previous = ''; previous !== text;) {
    previous = text;
    text = text.replace(/<[^>]+>/g, '');
  }
  return decodeXmlText(text).trim() || undefined;
}

/** Trường phần đầu hóa đơn chỉ được có một giá trị; trùng tên thì regex lấy phần tử đầu tiên, khác với bộ đọc theo schema. */
const SINGLE_VALUED_HEADER_TAGS = [
  'TgTCThue', 'TgTThue', 'TgTTThue', 'TgTTTBSo', 'TongTienHang', 'TongTienThue', 'TongThanhToan', 'TongTien', 'SubTotal', 'SubtotalAmount',
  'TotalSaleAmount', 'TotalAmountWithoutVAT', 'GrandTotal', 'TotalPayment', 'TotalVAT', 'TotalVATAmount', 'TotalAmountWithVAT', 'InvoiceTotal',
  'TotalAmount', 'TaxAmount', 'VATAmount', 'SHDon', 'NLap', 'KHHDon', 'KHMSHDon', 'MCCQT', 'HTTT', 'HTTToan', 'PaymentMethod',
];
const PARTY_BLOCK_TAGS = ['NBan', 'NMua', 'SellerInfo', 'BuyerInfo', 'Seller', 'Buyer'];
const AMBIGUOUS_XML = (detail: string) => new Error(`Tệp XML có ${detail} — không đọc tất định được. Hãy tải bản XML gốc hoặc nhập tay.`);

/**
 * Fail-closed khi cấu trúc khiến trích theo tên thẻ có thể khác bộ đọc theo schema: phần tử tổng tiền/số hóa đơn/khối bên bán
 * xuất hiện hai lần (ví dụ khối mở rộng đặt trước TToan thật), hoặc dòng hàng lồng nhau che dòng thật.
 */
function assertUnambiguousXml(canonicalXml: string, headerXml: string) {
  const count = (source: string, name: string) => (source.match(new RegExp(`<(?:[A-Za-z0-9_]+:)?${name}>`, 'gi')) || []).length;
  for (const name of SINGLE_VALUED_HEADER_TAGS) if (count(headerXml, name) > 1) throw AMBIGUOUS_XML(`nhiều phần tử <${name}> ngoài dòng hàng`);
  for (const name of PARTY_BLOCK_TAGS) if (count(canonicalXml, name) > 1) throw AMBIGUOUS_XML(`nhiều khối <${name}>`);
  let depth = 0;
  for (const match of canonicalXml.matchAll(/<(\/?)(?:[A-Za-z0-9_]+:)?(Item|HHDVu|Detail|Product)>/gi)) {
    depth += match[1] ? -1 : 1;
    if (depth > 1 || depth < 0) throw AMBIGUOUS_XML('dòng hàng lồng nhau');
  }
}

export function assertValidXml(xml: string) {
  if (!xml.trim() || /<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true)
    throw new Error('Tệp XML rỗng hoặc sai cấu trúc.');
  // Chặt như bộ đọc chuẩn (expat): '&' phải mở một tham chiếu hợp lệ, tham chiếu không trỏ tới ký tự cấm.
  const canonical = canonicalXmlForRegex(xml);
  if (/&(?!(?:#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);)/.test(canonical)) throw new Error('Tệp XML rỗng hoặc sai cấu trúc.');
  decodeXmlText(canonical);
}

export function parseXml(rawXml: string) {
  assertValidXml(rawXml);
  // Mọi trích xuất bên dưới — regex lẫn cây dự phòng — chạy trên bản đã chuẩn hóa (không CDATA, chú thích, PI, thuộc tính).
  const xml = canonicalXmlForRegex(rawXml);
  const structured = structuredXmlFallback(xml);
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
  const supplierAddress = tag(nbanMatch, 'DChi') || tag(nbanMatch, 'DiaChi') || tag(nbanMatch, 'Address') || tag(xml, 'SellerAddress') || tag(xml, 'SupplierAddress');

  // 1b. Trích xuất khối Người mua <NMua> hoặc <BuyerInfo> hoặc <Buyer>
  const nmuaMatch =
    xml.match(/<NMua[\s\S]*?<\/NMua>/i)?.[0] ||
    xml.match(/<BuyerInfo[\s\S]*?<\/BuyerInfo>/i)?.[0] ||
    xml.match(/<Buyer[\s\S]*?<\/Buyer>/i)?.[0] ||
    '';
  const buyerTaxCode =
    tag(nmuaMatch, 'MST') ||
    tag(nmuaMatch, 'TaxID') ||
    tag(xml, 'BuyerTaxCode') ||
    tag(xml, 'NMuaMST');

  const buyerName =
    tag(nmuaMatch, 'Ten') ||
    tag(nmuaMatch, 'TenNMua') ||
    tag(nmuaMatch, 'CompanyName') ||
    tag(nmuaMatch, 'Name') ||
    tag(xml, 'BuyerLegalName') ||
    tag(xml, 'BuyerName');

  // Ký hiệu & Mẫu số hóa đơn
  const invoiceSeries =
    tag(xml, 'KHHDon') ||
    tag(xml, 'InvoiceSeries') ||
    tag(xml, 'Series') ||
    tag(xml, 'KyHieu');

  const invoiceTemplate =
    tag(xml, 'KHMSHDon') ||
    tag(xml, 'InvoiceTemplate') ||
    tag(xml, 'Template') ||
    tag(xml, 'MauSo');

  // Mã Cơ quan thuế (MCCQT 34 ký tự)
  const taxAuthorityCode =
    tag(xml, 'MCCQT') ||
    tag(xml, 'TaxAuthorityCode') ||
    tag(xml, 'MaCQT');

  // Ngày ký số
  const rawSigningDate =
    tag(xml, 'SigningDate') ||
    tag(xml, 'SignatureDate') ||
    tag(xml, 'NgayKy') ||
    tag(xml, 'SigningTime');

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
    tag(xml, 'ItemName');

  const xmlHeader = xml.replace(/<(?:Items|InvoiceDetail|Details|HHDVu)[\s\S]*?<\/(?:Items|InvoiceDetail|Details|HHDVu)>/gi, '');
  assertUnambiguousXml(xml, xmlHeader);

  // 5. Trích xuất tiền và thuế
  const preTaxAmount = numberValue(
    tag(xmlHeader, 'TgTCThue') ||
    tag(xmlHeader, 'TongTienHang') ||
    tag(xmlHeader, 'SubTotal') ||
    tag(xmlHeader, 'SubtotalAmount') ||
    tag(xmlHeader, 'ThTien') ||
    tag(xmlHeader, 'TotalSaleAmount') ||
    tag(xmlHeader, 'TotalAmountWithoutVAT') ||
    (tag(xmlHeader, 'GrandTotal') ? tag(xmlHeader, 'TotalAmount') : undefined) ||
    (tag(xmlHeader, 'TotalPayment') ? tag(xmlHeader, 'TotalAmount') : undefined) ||
    tag(xml, 'TgTCThue') ||
    tag(xml, 'TongTienHang')
  );

  const taxAmount = numberValue(
    tag(xmlHeader, 'TgTTThue') ||
    tag(xmlHeader, 'TgTThue') ||
    tag(xmlHeader, 'TongTienThue') ||
    tag(xmlHeader, 'TotalVAT') ||
    tag(xmlHeader, 'TotalVATAmount') ||
    tag(xmlHeader, 'VATAmount') ||
    tag(xmlHeader, 'TThue') ||
    tag(xmlHeader, 'TaxAmount') ||
    tag(xml, 'TgTTThue') ||
    tag(xml, 'TgTThue') ||
    tag(xml, 'TongTienThue')
  );

  const totalAmount = numberValue(
    tag(xmlHeader, 'TgTTTBSo') ||
    tag(xmlHeader, 'GrandTotal') ||
    tag(xmlHeader, 'TotalPayment') ||
    tag(xmlHeader, 'TongThanhToan') ||
    tag(xmlHeader, 'TongTien') ||
    tag(xmlHeader, 'TotalAmountWithVAT') ||
    tag(xmlHeader, 'InvoiceTotal') ||
    tag(xmlHeader, 'TotalAmount') ||
    tag(xml, 'TgTTTBSo') ||
    tag(xml, 'GrandTotal') ||
    tag(xml, 'TotalPayment') ||
    tag(xml, 'TongThanhToan')
  );

  const taxRateRaw =
    tag(xmlHeader, 'TSuat') ||
    tag(xmlHeader, 'ThueSuat') ||
    tag(xmlHeader, 'VATRatePercent') ||
    tag(xmlHeader, 'TaxRatePercent') ||
    tag(xmlHeader, 'VATRate') ||
    tag(xmlHeader, 'VATPercentage') ||
    tag(xml, 'TSuat') ||
    tag(xml, 'ThueSuat');
  const taxRate = parseTaxRateString(taxRateRaw);

  // Chỉ đọc ngoài dòng hàng, như phép kiểm trùng tên: thẻ giả đặt trong <HHDVu> phía trước TTChung không được chọn.
  const paymentMethodRaw = (tag(xmlHeader, 'HTTToan') || tag(xmlHeader, 'HTTT') || tag(xmlHeader, 'PaymentMethod') || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toUpperCase();
  const saysCash = /\bTM\b|TIEN MAT|\bCASH\b/.test(paymentMethodRaw);
  const saysBank = /\bCK\b|CHUYEN KHOAN|TRANSFER|NGAN HANG/.test(paymentMethodRaw);
  // "TM/CK" (một trong hai) là chưa rõ: không đoán; hệ thống chỉ hỏi khi số tiền tới ngưỡng thanh toán.
  const paymentMethod = saysCash && !saysBank ? 'CASH' : saysBank && !saysCash ? 'BANK_TRANSFER' : undefined;

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

  const xmlWarnings: string[] = [];

  const itemMatches = Array.from(xml.matchAll(/<(?:Item|HHDVu|Detail|Product)[\s\S]*?<\/(?:Item|HHDVu|Detail|Product)>/gi));
  let lineIdx = 1;
  for (const match of itemMatches) {
    const itemXml = match[0];
    const name = tag(itemXml, 'TenHang') || tag(itemXml, 'THHDVu') || tag(itemXml, 'ItemName') || tag(itemXml, 'ProductName') || tag(itemXml, 'ProdName');
    if (!name) continue;

    const unit = tag(itemXml, 'DVT') || tag(itemXml, 'DVTinh') || tag(itemXml, 'Unit') || tag(itemXml, 'UnitOfMeasure');
    const quantity = numberValue(tag(itemXml, 'SoLuong') || tag(itemXml, 'SLuong') || tag(itemXml, 'Quantity') || tag(itemXml, 'ProdQuantity')) || 1;
    const unitPrice = numberValue(tag(itemXml, 'DonGia') || tag(itemXml, 'DGia') || tag(itemXml, 'Price') || tag(itemXml, 'ProdPrice')) || 0;
    const amount = numberValue(tag(itemXml, 'ThanhTien') || tag(itemXml, 'ThTien') || tag(itemXml, 'Amount') || tag(itemXml, 'TotalAmount')) || (quantity * unitPrice);

    const itemTaxRateRaw = tag(itemXml, 'ThueSuat') || tag(itemXml, 'TSuat') || tag(itemXml, 'VATRate') || tag(itemXml, 'TaxRate') || tag(itemXml, 'TaxRatePercent');
    const parsedItemTaxRate = parseTaxRateString(itemTaxRateRaw);
    let itemTaxRate: 0 | 5 | 8 | 10;
    if (parsedItemTaxRate !== undefined) {
      itemTaxRate = parsedItemTaxRate;
    } else if (taxRate !== undefined) {
      itemTaxRate = taxRate;
    } else {
      itemTaxRate = 0;
      xmlWarnings.push(`Dòng ${lineIdx} [${name}]: Không tìm thấy thuế suất, không áp đặt mặc định 10%.`);
    }
    const itemTaxAmount = numberValue(tag(itemXml, 'TienThue') || tag(itemXml, 'TThue') || tag(itemXml, 'VATAmount') || tag(itemXml, 'TaxAmount')) ?? (itemTaxRate === 0 ? 0 : Math.round((amount * itemTaxRate) / 100));
    let discount = numberValue(tag(itemXml, 'TienCK') || tag(itemXml, 'DiscountAmount'));
    const discountRate = numberValue(tag(itemXml, 'Discount') || tag(itemXml, 'ChietKhau') || tag(itemXml, 'DiscountRate'));
    let netItemAmount = amount;
    if (itemTaxRate > 0 && itemTaxAmount > 0 && Math.abs((amount * itemTaxRate) / 100 - itemTaxAmount) > 10) {
      const netTaxable = Math.round((itemTaxAmount * 100) / itemTaxRate);
      discount = amount - netTaxable;
      netItemAmount = netTaxable;
    } else if (discount === undefined && discountRate && discountRate > 0 && discountRate <= 100) {
      discount = Math.round((quantity * unitPrice) - amount);
    }

    items.push({
      lineNumber: numberValue(tag(itemXml, 'STT') || tag(itemXml, 'ItemNo')) || lineIdx++,
      itemName: name,
      unit: unit || 'Cái',
      quantity,
      unitPrice,
      amount: netItemAmount,
      taxRate: itemTaxRate,
      taxAmount: itemTaxAmount,
      discountAmount: discount
    });
  }

  return {
    rawInvoice: {
      invoiceNumber: invoiceNumber ?? structured.invoiceNumber,
      invoiceDate: rawDate ?? structured.invoiceDate,
      supplierTaxCode: supplierTaxCode ?? structured.supplierTaxCode,
      supplierName: supplierName ?? structured.supplierName,
      supplierAddress: supplierAddress ?? structured.supplierAddress,
      buyerTaxCode: buyerTaxCode ?? structured.buyerTaxCode,
      buyerName: buyerName ?? structured.buyerName,
      invoiceSeries: invoiceSeries ?? structured.invoiceSeries,
      invoiceTemplate: invoiceTemplate ?? structured.invoiceTemplate,
      taxAuthorityCode: taxAuthorityCode ?? structured.taxAuthorityCode,
      signingDate: rawSigningDate ?? structured.signingDate,
      itemName: itemName ?? structured.itemName,
      preTaxAmount: preTaxAmount ?? structured.preTaxAmount,
      taxRate: taxRate ?? structured.taxRate,
      taxAmount: taxAmount ?? structured.taxAmount,
      totalAmount: totalAmount ?? structured.totalAmount,
      paymentMethod,
      items: items.length > 0 ? items : structured.items
    },
    warnings: xmlWarnings
  };
}

export function sanitizeInvoice(raw: Record<string, unknown>): { invoice: Record<string, unknown>; warnings: string[] } {
  const invoice: Record<string, unknown> = {};
  const warnings: string[] = [];

  // Remove a printed label followed by a colon; preserve identifier prefixes.
  if (raw.invoiceNumber && typeof raw.invoiceNumber === 'string') {
    let invNum = raw.invoiceNumber.trim();
    invNum = invNum.replace(/^(?:hđbh|h[dđb]|số|so|bill)\s*:\s*/i, '').trim();
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

  // buyerTaxCode -> chuẩn hóa MST người mua 10/13 số hoặc định danh HKD 12 số
  if (raw.buyerTaxCode) {
    const cleanedBuyerMst = String(raw.buyerTaxCode).replace(/[^0-9-]/g, '').trim();
    const normalized = normalizeTaxCodeFormat(cleanedBuyerMst);
    if (normalized) invoice.buyerTaxCode = normalized;
  }

  // buyerName
  if (raw.buyerName && typeof raw.buyerName === 'string') {
    const bName = raw.buyerName.trim();
    if (bName) invoice.buyerName = bName;
  }

  // invoiceSeries & invoiceTemplate
  if (raw.invoiceSeries && typeof raw.invoiceSeries === 'string') {
    const s = raw.invoiceSeries.trim().toUpperCase();
    if (s) invoice.invoiceSeries = s;
  }
  if (raw.invoiceTemplate && typeof raw.invoiceTemplate === 'string') {
    const t = raw.invoiceTemplate.trim();
    if (t) invoice.invoiceTemplate = t;
  }

  // taxAuthorityCode (MCCQT 34 ký tự)
  if (raw.taxAuthorityCode && typeof raw.taxAuthorityCode === 'string') {
    const c = raw.taxAuthorityCode.trim();
    if (c) invoice.taxAuthorityCode = c;
  }

  // signingDate -> chuẩn hóa YYYY-MM-DD
  if (raw.signingDate && typeof raw.signingDate === 'string') {
    const sTrimmed = raw.signingDate.trim().split('T')[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(sTrimmed)) {
      invoice.signingDate = sTrimmed;
    } else {
      const dmy = sTrimmed.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
      if (dmy) {
        const [, d, m, y] = dmy;
        invoice.signingDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
    }
  }

  // supplierTaxCode -> MST doanh nghiệp hoặc định danh hộ kinh doanh
  if (raw.supplierTaxCode) {
    let cleanedMst = String(raw.supplierTaxCode).replace(/[^0-9-]/g, '').trim();
    // Bỏ qua nếu là số điện thoại bàn (024..., 028...) hoặc số có đuôi máy lẻ dài như -27971
    const isHouseholdId = /^\d{12}$/.test(cleanedMst.replace(/-/g, ''));
    const isLandlinePhone = !isHouseholdId && /^(024|028|020|021|022|023|025|026|027|029)\d+/.test(cleanedMst);
    if (cleanedMst.includes('-')) {
      const parts = cleanedMst.split('-');
      if (parts[1] && parts[1].length !== 3) {
        cleanedMst = parts[0];
      }
    }
    if (isLandlinePhone && cleanedMst.length >= 10) {
      cleanedMst = '';
    }

    const normalized = normalizeTaxCodeFormat(cleanedMst);
    if (normalized) {
      invoice.supplierTaxCode = normalized;
    } else if (cleanedMst.length > 0 && cleanedMst.length !== 8) {
      warnings.push(`Mã số thuế bên bán [${cleanedMst}] chưa chuẩn 10, 12 hoặc 13 số.`);
    }
  }

  // supplierName
  if (raw.supplierName && typeof raw.supplierName === 'string') {
    const name = raw.supplierName.trim();
    if (name.length >= 2) invoice.supplierName = name;
  }

  if (raw.supplierAddress && typeof raw.supplierAddress === 'string') {
    const address = raw.supplierAddress.trim();
    if (address.length >= 5) invoice.supplierAddress = address;
  }

  // itemName & items
  if (Array.isArray(raw.itemName)) {
    const list = raw.itemName.map((it: any) => typeof it === 'string' ? it : it?.item || it?.name || '').filter(Boolean);
    if (list.length > 0) invoice.itemName = list.join(', ');
  } else if (raw.itemName && typeof raw.itemName === 'string') {
    const item = raw.itemName.trim();
    if (item.length >= 1) invoice.itemName = item;
  }

  if (Array.isArray(raw.items) && raw.items.length > 0) {
    invoice.items = raw.items.map((it: any, idx: number) => ({
      lineNumber: it.lineNumber || idx + 1,
      itemName: String(it.itemName || it.name || '').trim(),
      quantity: Number(it.quantity) || 1,
      unitPrice: Number(it.unitPrice) || 0,
      amount: Number(it.amount) || Number(it.totalAmount) || 0,
      taxRate: (typeof it.taxRate === 'number' && [0, 5, 8, 10].includes(it.taxRate) ? it.taxRate : 0) as 0 | 5 | 8 | 10,
      taxAmount: Number(it.taxAmount) || 0
    })).filter((it: any) => it.itemName.length > 0);

    const validItems = invoice.items as Array<{ itemName: string }>;
    if (!invoice.itemName && Array.isArray(validItems) && validItems.length > 0) {
      invoice.itemName = validItems.map((it: any) => it.itemName).join(', ');
    }
  }

  // Tiền & thuế (Xử lý dấu chấm hàng nghìn bị hiểu nhầm thành số thập phân)
  const parseVndNumber = (val: any): number | undefined => {
    if (val === undefined || val === null || val === '') return undefined;
    let num = typeof val === 'number' && Number.isFinite(val) ? val : numberValue(val);
    if (num === undefined) return undefined;
    if (num > 0 && num < 100 && !Number.isInteger(num)) {
      num = Math.round(num * 1000);
    }
    return Math.round(num);
  };

  const preTax = parseVndNumber(raw.preTaxAmount);
  const tax = parseVndNumber(raw.taxAmount);
  const total = parseVndNumber(raw.totalAmount);

  let rate: number | undefined;
  if (raw.taxRate !== undefined && raw.taxRate !== null) {
    rate = parseTaxRateString(raw.taxRate);
  }

  if (preTax !== undefined) invoice.preTaxAmount = preTax;
  if (rate !== undefined) invoice.taxRate = rate;
  if (tax !== undefined) invoice.taxAmount = tax;
  if (total !== undefined) invoice.totalAmount = total;

  // Tự động suy luận số tiền còn thiếu nếu có 2 trong 3 trường
  if (invoice.totalAmount !== undefined && invoice.preTaxAmount === undefined && invoice.taxRate !== undefined) {
    invoice.preTaxAmount = Math.round(Number(invoice.totalAmount) / (1 + Number(invoice.taxRate) / 100));
    invoice.taxAmount = Number(invoice.totalAmount) - Number(invoice.preTaxAmount);
  } else if (invoice.preTaxAmount !== undefined && invoice.taxRate !== undefined && invoice.taxAmount === undefined) {
    invoice.taxAmount = invoice.taxRate === 0 ? 0 : Math.round((Number(invoice.preTaxAmount) * Number(invoice.taxRate)) / 100);
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
      taxRate: typeof it.taxRate === 'number' && [0, 5, 8, 10].includes(it.taxRate)
        ? it.taxRate
        : (parseTaxRateString(it.taxRate) ?? (invoice.taxRate !== undefined ? (invoice.taxRate as 0 | 5 | 8 | 10) : 0)),
      taxAmount: typeof it.taxAmount === 'number' ? it.taxAmount : 0,
      discountAmount: typeof it.discountAmount === 'number' ? it.discountAmount : undefined
    }));
  }

  if (invoice.totalAmount === undefined) {
    warnings.push('Chưa nhận diện được Tổng tiền thanh toán. Vui lòng kiểm tra lại.');
  }

  return { invoice, warnings };
}
