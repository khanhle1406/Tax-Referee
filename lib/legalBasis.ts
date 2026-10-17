/**
 * Căn cứ pháp lý theo NGÀY LẬP hóa đơn (phiên bản hóa theo hiệu lực). Một quy tắc không đổi, nhưng văn bản viện dẫn
 * và danh mục loại trừ thay theo kỳ: hóa đơn tháng 3/2025 và tháng 10/2026 không cùng căn cứ.
 * Nguồn đã đối chiếu 15/10/2026: NQ 204/2025/QH15 Điều 1 khoản 1 (nguyên văn "(trừ than)", "(trừ xăng)"); NĐ 174/2025/NĐ-CP;
 * TT 32/2025/TT-BTC thay TT 78/2021 từ 01/6/2025; NĐ 254/2026/NĐ-CP thay NĐ 123/2020 và NĐ 70/2025, TT 91/2026/TT-BTC thay
 * TT 32/2025 từ 01/7/2026; khoản 3 Điều 26 NĐ 181/2025/NĐ-CP (mua nhiều lần trong ngày). Xem docs/research/nghien-cuu-lien-quan.md.
 */

export interface VatReductionPeriod { from: string; to: string; basis: string; decree: string; nq204: boolean }

/** Các kỳ giảm thuế GTGT 10% → 8%. Ngoài các kỳ này (VD 01/2023–06/2023), hóa đơn 8% là sai thuế suất. */
export const VAT_REDUCTION_PERIODS: VatReductionPeriod[] = [
  { from: '2022-02-01', to: '2022-12-31', basis: 'Nghị quyết 43/2022/QH15 & Nghị định 15/2022/NĐ-CP', decree: '15/2022/NĐ-CP', nq204: false },
  { from: '2023-07-01', to: '2023-12-31', basis: 'Nghị quyết 101/2023/QH15 & Nghị định 44/2023/NĐ-CP', decree: '44/2023/NĐ-CP', nq204: false },
  { from: '2024-01-01', to: '2024-06-30', basis: 'Nghị quyết 110/2023/QH15 & Nghị định 94/2023/NĐ-CP', decree: '94/2023/NĐ-CP', nq204: false },
  { from: '2024-07-01', to: '2024-12-31', basis: 'Nghị quyết 142/2024/QH15 & Nghị định 72/2024/NĐ-CP', decree: '72/2024/NĐ-CP', nq204: false },
  { from: '2025-01-01', to: '2025-06-30', basis: 'Nghị quyết 174/2024/QH15 & Nghị định 180/2024/NĐ-CP', decree: '180/2024/NĐ-CP', nq204: false },
  { from: '2025-07-01', to: '2026-12-31', basis: 'Nghị quyết 204/2025/QH15 & Nghị định 174/2025/NĐ-CP', decree: '174/2025/NĐ-CP', nq204: true },
];

export function vatReductionAt(invoiceDate: string): VatReductionPeriod | null {
  return VAT_REDUCTION_PERIODS.find(p => invoiceDate >= p.from && invoiceDate <= p.to) ?? null;
}

/** Luôn bị loại khỏi diện giảm 8% ở mọi kỳ: viễn thông, kim loại, hàng chịu TTĐB (trừ xăng), khai khoáng (trừ than). */
// Viễn thông nhận diện theo cụm "dịch vụ" (cước, gói, thuê bao, data, sim), không theo chữ "INTERNET"/"4G"/"5G" đứng riêng —
// "quảng cáo trên Internet", "điện thoại 5G" không phải dịch vụ viễn thông.
export const VAT8_EXCLUDED_ALWAYS = ['CƯỚC INTERNET', 'DỊCH VỤ INTERNET', 'THUÊ BAO INTERNET', 'GÓI INTERNET', 'INTERNET CÁP QUANG', 'CÁP QUANG', 'CƯỚC DI ĐỘNG', 'THUÊ BAO DI ĐỘNG', 'CƯỚC ĐIỆN THOẠI',
  'CƯỚC 4G', 'CƯỚC 5G', 'GÓI 4G', 'GÓI 5G', 'DATA 4G', 'DATA 5G', 'SIM 4G', 'SIM 5G', 'GÓI CƯỚC', 'CƯỚC VIỄN THÔNG',
  'THÉP', 'SẮT THÉP', 'ỐNG ĐỒNG', 'DÂY ĐỒNG', 'ĐỒNG THAU', 'NHÔM', 'INOX', 'BIA', 'RƯỢU', 'THUỐC LÁ', 'Ô TÔ', 'QUẶNG',
  // Kinh doanh bất động sản bị loại ở mọi kỳ giảm thuế; tên hàng thực tế ghi "thuê văn phòng" chứ hiếm khi ghi "bất động sản".
  // Không thêm "THUÊ NHÀ" vì khớp cả "thuê nhà hàng".
  'THUÊ VĂN PHÒNG', 'THUÊ MẶT BẰNG', 'THUÊ NHÀ XƯỞNG', 'TIỀN THUÊ NHÀ', 'THUÊ NHÀ LÀM', 'CHO THUÊ NHÀ', 'THUÊ ĐẤT'];

/**
 * Bị loại trước 01/7/2025 (NQ 43/2022 … NQ 174/2024: CNTT, than cốc, dầu mỏ tinh chế, hóa chất, mọi hàng chịu TTĐB) nhưng
 * ĐƯỢC giảm 8% từ 01/7/2025 theo NQ 204/2025 + NĐ 174/2025 (xăng, nhiên liệu dầu, than các khâu, hóa chất, hàng hóa/dịch vụ CNTT).
 */
export const VAT8_EXCLUDED_BEFORE_NQ204 = ['CÔNG NGHỆ THÔNG TIN', 'PHẦN MỀM', 'MÁY TÍNH', 'LAPTOP', 'ĐIỆN THOẠI', 'ĐIỆN THOẠI DI ĐỘNG',
  'XĂNG', 'XĂNG DẦU', 'DẦU DIESEL', 'DẦU DO', 'DẦU MAZUT', 'NHIÊN LIỆU', 'THAN ĐÁ', 'THAN CỐC', 'HÓA CHẤT'];

/** Cụm từ loại trừ áp dụng cho ngày lập: danh mục cấu hình + cụm cố định, bỏ các nhóm NQ 204/2025 đã cho giảm 8%. */
export function vat8ExcludedPhrases(invoiceDate: string, configured: string[]): string[] {
  const all = [...configured, ...VAT8_EXCLUDED_ALWAYS, ...VAT8_EXCLUDED_BEFORE_NQ204];
  if (!vatReductionAt(invoiceDate)?.nq204) return all;
  const lifted = new Set(VAT8_EXCLUDED_BEFORE_NQ204);
  return all.filter(phrase => !lifted.has(phrase));
}

export function vat8Basis(invoiceDate: string): string {
  return vatReductionAt(invoiceDate)?.basis ?? 'Nghị quyết giảm thuế GTGT của kỳ lập hóa đơn';
}

/*
 * Căn cứ cấp điều/khoản theo ngày lập. Chỉ ghi số điều, khoản đã đối chiếu nguyên văn bản gốc trên vanban.chinhphu.vn
 * ngày 17/10/2026: Luật 48/2024 Điều 14; NĐ 181/2025 Điều 26; TT 219/2013 Điều 15 (VBHN 01/VBHN-BTC); NĐ 123/2020 Điều 3,
 * Điều 10, Điều 16; TT 78/2021 Điều 4; TT 32/2025 Điều 5; TT 91/2026 Điều 4 và Phụ lục I. Văn bản chưa đối chiếu điều khoản
 * (NĐ 254/2026 ở nhiều nội dung) chỉ ghi số hiệu.
 */

/** Hóa đơn ghi MST người mua khác doanh nghiệp: điều kiện hóa đơn để khấu trừ và nội dung bắt buộc trên hóa đơn. */
export function buyerTaxCodeBasis(invoiceDate: string): string {
  if (invoiceDate >= '2026-07-01') return 'Điểm a khoản 2 Điều 14 Luật Thuế GTGT 48/2024/QH15 & Nghị định 254/2026/NĐ-CP';
  if (invoiceDate >= '2025-07-01') return 'Điểm a khoản 2 Điều 14 Luật Thuế GTGT 48/2024/QH15 & khoản 5 Điều 10 Nghị định 123/2020/NĐ-CP, sửa đổi bởi Nghị định 70/2025/NĐ-CP';
  // NĐ 70/2025 (Điều 1 khoản 7) thay khoản 5 Điều 10 NĐ 123/2020 từ 01/6/2025, trước mốc Luật 48/2024 một tháng.
  if (invoiceDate >= '2025-06-01') return 'Khoản 1 Điều 15 và khoản 15 Điều 14 Thông tư 219/2013/TT-BTC & khoản 5 Điều 10 Nghị định 123/2020/NĐ-CP, sửa đổi bởi Nghị định 70/2025/NĐ-CP';
  return 'Khoản 1 Điều 15 và khoản 15 Điều 14 Thông tư 219/2013/TT-BTC & khoản 5 Điều 10 Nghị định 123/2020/NĐ-CP';
}

/** Hóa đơn có mã của cơ quan thuế: định nghĩa mã (điểm a khoản 2 Điều 3) và mã là nội dung của hóa đơn (khoản 10 Điều 10). */
export function taxAuthorityCodeBasis(invoiceDate: string): string {
  if (invoiceDate >= '2026-07-01') return 'Nghị định 254/2026/NĐ-CP & Thông tư 91/2026/TT-BTC';
  return 'Điểm a khoản 2 Điều 3 và khoản 10 Điều 10 Nghị định 123/2020/NĐ-CP';
}

/** Hai chữ số năm trong ký hiệu hóa đơn (điểm b — điểm a chỉ quy định ký hiệu mẫu số). */
export function seriesYearBasis(invoiceDate: string): string {
  if (invoiceDate >= '2026-07-01') return 'Điều 4 và Phụ lục I Thông tư 91/2026/TT-BTC';
  if (invoiceDate >= '2025-06-01') return 'Điểm b khoản 1 Điều 5 Thông tư 32/2025/TT-BTC';
  return 'Điểm b khoản 1 Điều 4 Thông tư 78/2021/TT-BTC';
}

/** Hàng hóa, dịch vụ mua vào từ ngưỡng trở lên phải có chứng từ thanh toán không dùng tiền mặt. Luật 48 chỉ nêu nguyên tắc; ngưỡng 5 triệu ở Điều 26 NĐ 181. */
export function cashPaymentBasis(invoiceDate: string): string {
  return invoiceDate < '2025-07-01'
    ? 'Khoản 2 Điều 15 Thông tư 219/2013/TT-BTC'
    : 'Điểm b khoản 2 Điều 14 Luật Thuế GTGT 48/2024/QH15 & Điều 26 Nghị định 181/2025/NĐ-CP';
}

/** Mua của cùng một người bán nhiều lần trong ngày, mỗi lần dưới ngưỡng nhưng tổng từ ngưỡng trở lên. */
export function sameDayCashBasis(invoiceDate: string): string {
  return invoiceDate < '2025-07-01' ? 'Khoản 5 Điều 15 Thông tư 219/2013/TT-BTC' : 'Khoản 3 Điều 26 Nghị định 181/2025/NĐ-CP';
}

/** Bên bán đã chấm dứt hiệu lực MST: ngừng sử dụng hóa đơn điện tử. */
export function closedSellerBasis(invoiceDate: string): string {
  if (invoiceDate >= '2026-07-01') return 'Nghị định 254/2026/NĐ-CP & Thông tư 91/2026/TT-BTC';
  if (invoiceDate >= '2025-06-01') return 'Điều 16 Nghị định 123/2020/NĐ-CP, sửa đổi bởi Nghị định 70/2025/NĐ-CP';
  return 'Điều 16 Nghị định 123/2020/NĐ-CP';
}

/** Thời điểm ký số so với thời điểm lập hóa đơn. NĐ 70/2025 (Điều 1 khoản 7) thay khoản 9 Điều 10 NĐ 123/2020 từ 01/6/2025. */
export function signingBasis(invoiceDate: string): string {
  if (invoiceDate >= '2026-07-01') return 'Nghị định 254/2026/NĐ-CP';
  if (invoiceDate >= '2025-06-01') return 'Khoản 9 Điều 10 Nghị định 123/2020/NĐ-CP, sửa đổi bởi Nghị định 70/2025/NĐ-CP';
  return 'Khoản 9 Điều 10 Nghị định 123/2020/NĐ-CP';
}

/** Ghép căn cứ vào giữa câu ("Theo khoản 5 Điều 15…"): chỉ viết thường "Khoản"/"Điểm"; "Điều", "Nghị định", "Thông tư" kèm số giữ viết hoa. */
export function inSentence(basis: string): string {
  return /^(Khoản|Điểm) /.test(basis) ? basis.charAt(0).toLowerCase() + basis.slice(1) : basis;
}

/** Văn bản về hóa đơn điện tử có hiệu lực tại ngày lập (không ghi số điều cho văn bản mới khi chưa đối chiếu nguyên văn). */
export function invoiceFrameworkAt(invoiceDate: string): { decree: string; circular: string; legacy: boolean } {
  if (invoiceDate >= '2026-07-01') return { decree: 'Nghị định 254/2026/NĐ-CP', circular: 'Thông tư 91/2026/TT-BTC', legacy: false };
  if (invoiceDate >= '2025-06-01') return { decree: 'Nghị định 123/2020/NĐ-CP (sửa đổi bởi Nghị định 70/2025/NĐ-CP)', circular: 'Thông tư 32/2025/TT-BTC', legacy: false };
  return { decree: 'Nghị định 123/2020/NĐ-CP', circular: 'Thông tư 78/2021/TT-BTC', legacy: true };
}
