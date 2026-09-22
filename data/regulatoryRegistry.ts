/**
 * DANH MỤC VĂN BẢN PHÁP LUẬT & QUẢN LÝ PHIÊN BẢN THEO THỜI GIAN (TEMPORAL LAW REGISTRY)
 * Phục vụ: Mục tiêu 1.6 & 2.7 trong target.md
 * Đảm bảo Context AI đối chiếu đúng Luật, Nghị định, Thông tư có hiệu lực tại thời điểm xuất hóa đơn.
 */

export interface RegulatoryDocument {
  id: string;
  code: string; // Số ký hiệu văn bản (ví dụ: 123/2020/NĐ-CP)
  title: string; // Tên văn bản
  issuer: 'CHÍNH PHỦ' | 'BỘ TÀI CHÍNH' | 'TỔNG CỤC THUẾ' | 'QUỐC HỘI';
  effectiveFrom: string; // YYYY-MM-DD
  effectiveTo?: string; // YYYY-MM-DD (nếu có hạn định)
  status: 'ACTIVE' | 'EXTENDED' | 'EXPIRED';
  keyRules: string[];
  summary: string;
}

export const GOVERNMENT_REGULATORY_REGISTRY: RegulatoryDocument[] = [
  {
    id: 'ND-123-2020',
    code: '123/2020/NĐ-CP',
    title: 'Nghị định quy định về hóa đơn, chứng từ điện tử',
    issuer: 'CHÍNH PHỦ',
    effectiveFrom: '2022-07-01',
    status: 'ACTIVE',
    keyRules: [
      'Bắt buộc hóa đơn điện tử 100% cho doanh nghiệp toàn quốc',
      'Hóa đơn điều chỉnh/thay thế bắt buộc phải ghi rõ thông tin tham chiếu hóa đơn gốc (Mẫu số, Ký hiệu, Số hóa đơn gốc)',
      'Thời điểm xuất hóa đơn dịch vụ hoàn thành phải khớp với biên bản nghiệm thu'
    ],
    summary: 'Nền tảng pháp lý cốt lõi về hóa đơn điện tử và tính truy vết hóa đơn gốc.'
  },
  {
    id: 'TT-219-2013',
    code: '219/2013/TT-BTC',
    title: 'Thông tư hướng dẫn thi hành Luật Thuế giá trị gia tăng',
    issuer: 'BỘ TÀI CHÍNH',
    effectiveFrom: '2014-01-01',
    status: 'ACTIVE',
    keyRules: [
      'Hóa đơn mua buôn/lẻ có tổng thanh toán từ 20.000.000 VNĐ trở lên bắt buộc phải có chứng từ thanh toán không dùng tiền mặt (Ủy nhiệm chi ngân hàng)',
      'Không được khấu trừ thuế GTGT đối với chi phí không phục vụ sản xuất kinh doanh (rượu, bia, quà tặng xa xỉ không có quy chế)',
      'Thời hạn kê khai thuế GTGT đầu vào bỏ sót trước khi cơ quan thuế công bố quyết định thanh tra'
    ],
    summary: 'Quy chuẩn bắt buộc về chứng từ ngân hàng thanh toán từ 20 triệu và điều kiện chi phí được trừ.'
  },
  {
    id: 'ND-72-2024',
    code: '72/2024/NĐ-CP',
    title: 'Nghị định quy định chính sách giảm thuế giá trị gia tăng 8%',
    issuer: 'CHÍNH PHỦ',
    effectiveFrom: '2024-07-01',
    effectiveTo: '2024-12-31',
    status: 'ACTIVE',
    keyRules: [
      'Giảm 2% thuế suất thuế GTGT (từ 10% xuống 8%) đối với nhóm hàng hóa, dịch vụ đang áp dụng mức thuế suất 10%',
      'LOẠI TRỪ KHÔNG ĐƯỢC GIẢM 8%: Viễn thông, Công nghệ thông tin, Hoạt động tài chính, Ngân hàng, Chứng khoán, Bảo hiểm, Kinh doanh bất động sản, Kim loại, Sản phẩm khai khoáng, Hàng hóa chịu thuế Tiêu thụ đặc biệt',
      'Phải lập hóa đơn riêng cho hàng hóa 8% hoặc ghi rõ thuế suất từng dòng'
    ],
    summary: 'Chính sách giảm thuế GTGT 8% và danh mục ngành hàng loại trừ nghiêm ngặt cuối năm 2024.'
  },
  {
    id: 'NQ-142-2024',
    code: '142/2024/QH15',
    title: 'Nghị quyết Quốc hội về tiếp tục giảm 2% thuế suất thuế giá trị gia tăng',
    issuer: 'QUỐC HỘI',
    effectiveFrom: '2025-01-01',
    effectiveTo: '2026-12-31',
    status: 'ACTIVE',
    keyRules: [
      'Gia hạn giảm thuế GTGT 8% cho giai đoạn 2025 - 2026',
      'Kế thừa danh mục các nhóm ngành loại trừ của Nghị định 72/2024/NĐ-CP'
    ],
    summary: 'Căn cứ pháp lý gia hạn giảm thuế GTGT 8% trong năm 2025 và 2026.'
  },
  {
    id: 'CV-2392-TCT',
    code: '2392/TCT-QLRR',
    title: 'Công văn Tổng cục Thuế về triển khai quản trị rủi ro hóa đơn điện tử và Hệ số K',
    issuer: 'TỔNG CỤC THUẾ',
    effectiveFrom: '2023-06-20',
    status: 'ACTIVE',
    keyRules: [
      'Áp dụng thuật toán giám sát rủi ro trốn thuế tự động thông qua Hệ số K = Doanh thu bán ra / (Tồn kho đầu kỳ + Mua vào trong kỳ)',
      'Hệ số K > 1.35: Dấu hiệu xuất khống hóa đơn đầu ra hoặc mua trôi nổi không hạch toán',
      'Hệ số K < 0.95: Dấu hiệu gom mua hóa đơn đầu vào bất thường để chiếm đoạt tiền hoàn thuế hoặc hạ thấp số thuế phải nộp',
      'Ngưỡng an toàn khuyến nghị: 1.00 <= K <= 1.30'
    ],
    summary: 'Vũ khí AI then chốt của Tổng cục Thuế giám sát tương quan xuất nhập tồn.'
  },
  {
    id: 'LUAT-38-2019',
    code: '38/2019/QH14',
    title: 'Luật Quản lý thuế số 38/2019/QH14',
    issuer: 'QUỐC HỘI',
    effectiveFrom: '2020-07-01',
    status: 'ACTIVE',
    keyRules: [
      'Hóa đơn xuất sau ngày người bán bị cơ quan thuế thông báo ngừng hoạt động / bỏ trốn khỏi địa chỉ kinh doanh là hóa đơn bất hợp pháp 100%',
      'Người nộp thuế chịu trách nhiệm trước pháp luật về tính hợp pháp, chính xác của chứng từ kê khai',
      'Phạt 20% số tiền thuế khai thiếu và phạt chậm nộp 0.03%/ngày trên số tiền thuế chậm nộp'
    ],
    summary: 'Chế tài xử phạt vi phạm hành chính về thuế và xử lý hóa đơn của doanh nghiệp bỏ trốn.'
  }
];

/**
 * Hàm tra cứu văn bản pháp luật có hiệu lực tại thời điểm lập hóa đơn
 * Đảm bảo AI luôn sử dụng context pháp lý chính xác theo dòng thời gian (Temporal Logic)
 */
export function getApplicableRegulations(invoiceDateStr: string): {
  applicableRegulations: RegulatoryDocument[];
  decreeSummary: string;
  hasVatReductionPolicy: boolean;
  notes: string[];
} {
  const invDate = invoiceDateStr ? new Date(invoiceDateStr) : new Date();

  // Lọc các văn bản có hiệu lực tại ngày lập hóa đơn
  const activeDocs = GOVERNMENT_REGULATORY_REGISTRY.filter((doc) => {
    const fromDate = new Date(doc.effectiveFrom);
    if (invDate < fromDate) return false;
    if (doc.effectiveTo) {
      const toDate = new Date(doc.effectiveTo);
      // Kết thúc ngày toDate
      toDate.setHours(23, 59, 59, 999);
      if (invDate > toDate) return false;
    }
    return true;
  });

  const hasVatReduction = activeDocs.some((d) => d.id === 'ND-72-2024' || d.id === 'NQ-142-2024');

  const decreeCodes = activeDocs.map((d) => d.code).join(', ');
  const decreeSummary = `Áp dụng theo mốc ngày lập hóa đơn (${invoiceDateStr || 'Hiện tại'}): Căn cứ các văn bản pháp quy có hiệu lực: ${decreeCodes}.`;

  const notes: string[] = [];
  if (hasVatReduction) {
    notes.push('Kỳ phát sinh thuộc giai đoạn áp dụng chính sách giảm thuế GTGT 8% (cần kiểm tra danh mục loại trừ viễn thông, bds, ngân hàng).');
  } else {
    notes.push('Kỳ phát sinh không thuộc phạm vi giảm thuế GTGT 8% diện rộng.');
  }

  return {
    applicableRegulations: activeDocs,
    decreeSummary,
    hasVatReductionPolicy: hasVatReduction,
    notes
  };
}
