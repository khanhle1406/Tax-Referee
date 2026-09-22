export interface PolicyVersionMetadata {
  version: string;
  releaseDate: string;
  updatedBy: string;
  status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED';
  changeLog: string[];
  text: string;
}

export const DEFAULT_TAX_SOP_2026_TEXT = `================================================================================
QUY CHẾ QUẢN TRỊ THUẾ & PHÂN CẤP PHÊ DUYỆT CHI PHÍ (MÃ HIỆU: TAX-SOP-2026)
Ban hành kèm Quyết định số 01/2026/QĐ-HĐQT ngày 02/01/2026 của Hội đồng Quản trị
Cập nhật theo Nghị định 72/2024/NĐ-CP, Nghị định 123/2020/NĐ-CP & Công văn 2392/TCT-QLRR
================================================================================

CHƯƠNG I: NGUYÊN TẮC KHẤU TRỪ THUẾ GTGT & TÍNH CHI PHÍ HỢP LÝ
Điều 1.1: Hóa đơn GTGT hợp pháp, đúng định dạng điện tử theo Nghị định 123/2020/NĐ-CP và Thông tư 78/2021/TT-BTC. Hóa đơn phải rõ nét, đầy đủ thông tin, không bị mờ nhạt số tiền hoặc mã số thuế.
Điều 1.2: Hóa đơn có tổng giá trị từ 20.000.000 VNĐ trở lên (đã bao gồm thuế GTGT) bắt buộc phải có chứng từ thanh toán không dùng tiền mặt (Ủy nhiệm chi ngân hàng). Tuyệt đối không khấu trừ thuế GTGT nếu ghi hình thức "Tiền mặt" hoặc không có chứng từ thanh toán ngân hàng hợp lệ theo Điều 15 Thông tư 219/2013/TT-BTC.
Điều 1.3: Áp dụng thuế suất GTGT đúng chính sách hỗ trợ của Chính phủ:
          - Dịch vụ phần mềm, chuyển giao công nghệ: Thuế suất KCT (Không chịu thuế / 0%).
          - Hàng hóa, dịch vụ thông thường (Văn phòng phẩm, điện chiếu sáng, ăn uống thông thường): Thuế suất 8%.
          - Danh mục loại trừ không được giảm thuế (Dịch vụ viễn thông, công nghệ thông tin, hóa chất, đồ uống có cồn): Bắt buộc áp dụng thuế suất 10% theo Nghị định 72/2024/NĐ-CP và Nghị quyết 142/2024/QH15.
Điều 1.4: Tính truy vết hóa đơn điều chỉnh/thay thế (Nghị định 123/2020/NĐ-CP):
          - Mọi hóa đơn điều chỉnh hoặc thay thế bắt buộc phải ghi rõ số hóa đơn gốc và phải đối chiếu khớp với hóa đơn gốc đã tồn tại trong hệ thống.
          - Nếu không tìm thấy hóa đơn gốc, hóa đơn điều chỉnh không đủ điều kiện hạch toán và phải chuyển tiếp xác minh.
Điều 1.5: Đồng bộ quy chuẩn pháp lý mới nhất theo dòng thời gian (Temporal Law Synchronization):
          - Mọi hóa đơn đối soát phải được đối chiếu căn cứ theo văn bản pháp quy đang có hiệu lực tại ngày lập hóa đơn.

CHƯƠNG II: CÁC HẠNG MỤC CẤM KHẤU TRỪ & RỦI RO PHÁP LÝ NHÀ CUNG CẤP
Điều 2.1: Chi phí mua đồ uống có cồn (rượu ngoại, bia), dịch vụ karaoke, mát-xa không phục vụ hoạt động sản xuất kinh doanh: Cấm kê khai khấu trừ thuế GTGT và phải loại trừ khỏi chi phí tính thuế TNDN.
Điều 2.2: Rủi ro Mốc thời gian đối với Nhà cung cấp ngừng hoạt động / đóng MST:
          - Trường hợp 1: Hóa đơn lập SAU ngày cơ quan thuế ban hành thông báo đóng MST hoặc bỏ trốn: Hóa đơn bất hợp pháp 100%, cấm khấu trừ và loại bỏ ngay lập tức theo Luật Quản lý thuế 38/2019/QH14.
          - Trường hợp 2: Hóa đơn lập TRƯỚC ngày cơ quan thuế ban hành thông báo đóng MST: Tạm dừng tự động hóa để Kế toán trưởng kiểm tra bộ hồ sơ chứng minh giao dịch có thật (Hợp đồng, Biên bản bàn giao, Ủy nhiệm chi) trước khi quyết định.
Điều 2.3: Tuân thủ quy tắc quản trị rủi ro chuỗi cung ứng F0 - Fn của Tổng cục Thuế.

CHƯƠNG III: MA TRẬN PHÂN CẤP THẨM QUYỀN PHÊ DUYỆT (AUTHORITY MATRIX)
Điều 3.1: Cấp 1 - Kế toán viên (KTV): Tự động duyệt thông suốt các hồ sơ thường quy hợp lệ 100% có giá trị dưới 20.000.000 VNĐ.
Điều 3.2: Cấp 2 - Kế toán trưởng (KTT):
          - Thẩm quyền duyệt các hóa đơn chi phí hợp lệ từ 20.000.000 VNĐ đến dưới 200.000.000 VNĐ.
          - Thẩm quyền xử lý các trường hợp chuyển tiếp thuộc Nhóm 1 (Uncertain Info) và Nhóm 2 (Out of Policy).
Điều 3.3: Cấp 3 - Giám đốc Tài chính (CFO): Thẩm quyền duy nhất phê duyệt:
          - Các hóa đơn điều chỉnh giảm doanh thu, giảm giá chiết khấu thương mại có giá trị từ 200.000.000 VNĐ trở lên.
          - Các khoản chi phí bồi thường, phạt vi phạm hợp đồng từ 200.000.000 VNĐ trở lên.
          - Các quyết định đối với hóa đơn làm biến động Hệ số rủi ro K vượt ngưỡng an toàn.

CHƯƠNG IV: QUẢN TRỊ RỦI RO TOÀN CỤC & HỆ SỐ K (CÔNG VĂN 2392/TCT-QLRR)
Điều 4.1: Hệ số K của kỳ kê khai được xác định:
          Hệ số K = (Tổng giá trị hàng bán ra) / (Tổng tồn kho đầu kỳ + Tổng giá trị hàng mua vào trong kỳ)
Điều 4.2: Ngưỡng cảnh báo rủi ro Hệ số K:
          - Vùng Xanh (An toàn): 1.00 <= Hệ số K <= 1.30 -> Hệ thống vận hành bình thường.
          - Vùng Vàng (Cảnh báo): 1.30 < Hệ số K <= 1.35 hoặc 0.95 <= Hệ số K < 1.00 -> Cảnh báo Kế toán trưởng rà soát.
          - Vùng Đỏ (Nguy hiểm): Hệ số K > 1.35 hoặc Hệ số K < 0.95 -> Kích hoạt chuyển tiếp lên CFO để kiểm soát nguy cơ bị cơ quan Thuế đưa vào diện thanh tra trọng điểm.`;

export const TAX_SOP_2026_TEXT = DEFAULT_TAX_SOP_2026_TEXT;

export const INITIAL_POLICY_METADATA: PolicyVersionMetadata = {
  version: 'v2.1',
  releaseDate: '2026-01-02',
  updatedBy: 'Hội đồng Quản trị & Kế toán trưởng',
  status: 'ACTIVE',
  changeLog: [
    'v2.0 (02/01/2026): Ban hành bản quy chế gốc chuẩn hóa theo NĐ 123/2020 và TT 219/2013.',
    'v2.1 (08/01/2026): Bổ sung Điều 1.5 về Đồng bộ Luật mới nhất theo dòng thời gian (Temporal Law Versioning) và tinh chỉnh ngưỡng Hệ số K an toàn theo Công văn 2392/TCT-QLRR.'
  ],
  text: DEFAULT_TAX_SOP_2026_TEXT
};
