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
Ban hành kèm Quyết định số 01/2026/QĐ-HĐQT của Hội đồng Quản trị
Đồng bộ theo Luật Thuế GTGT 48/2024/QH15, NQ 204/2025/QH15, NĐ 254/2026/NĐ-CP,
Luật Thuế TNDN 67/2025/QH15, TT 89/2026/TT-BTC & Công văn 2392/TCT-QLRR
================================================================================

CHƯƠNG I: NGUYÊN TẮC KHẤU TRỪ THUẾ GTGT & TÍNH CHI PHÍ HỢP LÝ
Điều 1.1: Định dạng và Tính Toàn vẹn Hóa đơn Điện tử (Nghị định 254/2026/NĐ-CP & TT 91/2026/TT-BTC):
          - Bắt buộc lưu trữ và đối soát file dữ liệu gốc XML có chữ ký số CA hợp lệ của người bán.
          - Hóa đơn phải rõ nét, đầy đủ tiêu thức bắt buộc, không bị mờ nhạt số tiền hoặc mã số thuế.
          - Xử lý sai sót: Trường hợp sai tên hoặc địa chỉ người mua nhưng đúng Mã số thuế, người bán gửi Mẫu 04/SS-HĐĐT cho cơ quan thuế, hóa đơn vẫn được kê khai khấu trừ bình thường.

Điều 1.2: Ngưỡng Thanh Toán Không Dùng Tiền Mặt (Luật Thuế GTGT số 48/2024/QH15 & NĐ 320/2025/NĐ-CP):
          - Hóa đơn mua hàng hóa, dịch vụ từng lần từ 5.000.000 VNĐ trở lên (đã bao gồm thuế GTGT) bắt buộc phải có chứng từ thanh toán không dùng tiền mặt (Ủy nhiệm chi ngân hàng).
          - Tuyệt đối không khấu trừ thuế GTGT và loại khỏi chi phí được trừ khi tính thuế TNDN nếu hóa đơn từ 5.000.000 VNĐ thanh toán bằng tiền mặt.
          - Ngoại lệ được chấp nhận: Nhân viên được công ty ủy quyền thanh toán qua thẻ/tài khoản cá nhân theo quy chế công ty, sau đó công ty thực hiện lệnh chuyển khoản hoàn ứng từ tài khoản công ty vào tài khoản nhân viên có đầy đủ hồ sơ ủy quyền và UNC.
          - Hóa đơn mua hàng dưới 5 triệu mua nhiều lần trong ngày của cùng một nhà cung cấp có tổng giá trị từ 5 triệu trở lên bắt buộc phải chuyển khoản qua ngân hàng.

Điều 1.3: Áp Dụng Thuế Suất Giảm 8% (Nghị quyết 204/2025/QH15 & Nghị định 174/2025/NĐ-CP):
          - Giảm 2% thuế suất thuế GTGT (từ 10% xuống 8%) áp dụng đến hết ngày 31/12/2026.
          - Danh mục loại trừ bắt buộc áp dụng thuế suất 10%: Dịch vụ viễn thông, hoạt động tài chính, ngân hàng, chứng khoán, bảo hiểm, kinh doanh bất động sản, kim loại, sản phẩm khai khoáng, hóa chất, hàng hóa chịu thuế TTĐB.
          - Dịch vụ phần mềm thuộc đối tượng không chịu thuế GTGT; dịch vụ CNTT thông thường không mặc nhiên bị loại khỏi 8% (phải đối chiếu theo mã ngành cấp 7 và mã sản phẩm VCPA).

Điều 1.4: Tính Truy Vết Hóa Đơn Điều Chỉnh / Thay Thế (Nghị định 254/2026/NĐ-CP):
          - Mọi hóa đơn điều chỉnh hoặc thay thế bắt buộc phải ghi rõ Số hóa đơn, Ký hiệu, Ngày lập của hóa đơn gốc và phải đối chiếu khớp với hóa đơn gốc trong hệ thống.
          - Nếu thiếu thông tin tham chiếu hóa đơn gốc, phải tạm dừng tự động hóa để xác minh trước khi hạch toán.

Điều 1.5: Đồng Bộ Quy Chuẩn Pháp Lý Theo Mốc Thời Gian (Temporal Law Versioning):
          - Hóa đơn phát sinh trước ngày 01/07/2025: Đối chiếu theo ngưỡng 20.000.000 VNĐ (Luật cũ).
          - Hóa đơn phát sinh từ ngày 01/07/2025 trở đi: Áp dụng nghiêm ngặt ngưỡng 5.000.000 VNĐ (Luật Thuế GTGT 48/2024/QH15).

CHƯƠNG II: CÁC HẠNG MỤC CẤM KHẤU TRỪ & RỦI RO ĐỐI TÁC NGỪNG HOẠT ĐỘNG
Điều 2.1: Chi Phí Phi Sản Xuất Kinh Doanh:
          - Chi phí mua đồ uống có cồn (rượu, bia), dịch vụ vui chơi giải trí xa xỉ, chi phí cá nhân của lãnh đạo không phục vụ trực tiếp SXKD: Cấm kê khai khấu trừ thuế GTGT và phải loại trừ khỏi chi phí tính thuế TNDN (Chỉ tiêu B4).
          - Hóa đơn tiếp khách, hội nghị bắt buộc phải đính kèm Bảng kê chi tiết món ăn / dịch vụ.

Điều 2.2: Kiểm Soát Trạng Thái Mã Số Thuế Nhà Cung Cấp:
          - Trường hợp 1: Hóa đơn lập SAU ngày cơ quan thuế ban hành thông báo đóng MST hoặc bỏ trốn: Hóa đơn bất hợp pháp 100%, cấm khấu trừ và loại bỏ ngay lập tức (Nhóm 2: OUT_OF_POLICY).
          - Trường hợp 2: Hóa đơn lập TRƯỚC ngày cơ quan thuế ban hành thông báo đóng MST: Tạm dừng tự động hóa (Nhóm 1: UNCERTAIN_INFO) để Kế toán trưởng kiểm tra bộ hồ sơ chứng minh giao dịch có thật trước khi quyết định.

CHƯƠNG III: MA TRẬN PHÂN CẤP THẨM QUYỀN PHÊ DUYỆT (AUTHORITY MATRIX - RACI)
Điều 3.1: Cấp 1 - Kế toán viên (KTV): Tự động xử lý thông suốt các hồ sơ thường quy hợp lệ 100% trong luồng ROUTINE.
Điều 3.2: Cấp 2 - Kế toán trưởng (KTT):
          - Thẩm quyền tự duyệt các hóa đơn chi phí thông thường dưới 200.000.000 VNĐ.
          - Thẩm quyền xử lý các trường hợp chuyển tiếp thuộc Nhóm 1 (Uncertain Info) và Nhóm 2 (Out of Policy).
Điều 3.3: Cấp 3 - Giám đốc Tài chính (CFO) / Tổng Giám đốc (CEO): Thẩm quyền duy nhất phê duyệt:
          - Các hóa đơn điều chỉnh giảm doanh thu, chiết khấu thương mại, bồi thường hợp đồng từ 200.000.000 VNĐ trở lên.
          - Các quyết định chiến lược khi Tham số nguồn hàng K rơi vào Vùng Đỏ nguy hiểm.

CHƯƠNG IV: GIÁM SÁT RỦI RO THAM SỐ NGUỒN HÀNG K (CÔNG VĂN 2392/TCT-QLRR & TT 94/2026/TT-BTC)
Điều 4.1: Công Thức Tính Tham Số Nguồn Hàng K Tham Chiếu:
          Hệ số K = (Tổng giá trị hàng bán ra) / (Tổng tồn kho đầu kỳ + Tổng mua vào trong kỳ)
Điều 4.2: Dải Ngưỡng Heuristic Cảnh Báo:
          - Vùng Xanh (An toàn): 1.05 <= Hệ số K <= 1.25 -> Hoạt động bình thường.
          - Vùng Vàng (Cần lưu ý): 0.95 <= Hệ số K < 1.05 hoặc 1.25 < Hệ số K <= 1.35.
          - Vùng Đỏ (Rủi ro cao): Hệ số K < 0.95 hoặc Hệ số K > 1.35 -> Nguy cơ bị cơ quan Thuế yêu cầu giải trình số liệu.
Điều 4.3: Hành Động Chuẩn Mực Khi K Chạm Vùng Đỏ:
          - Tuyệt đối KHÔNG trì hoãn kê khai các hóa đơn hợp lệ phát sinh trong kỳ.
          - Kế toán trưởng và CFO chỉ đạo lập ngay Bộ Hồ Sơ Phòng Vệ Nguồn Hàng (Tax Defense Dossier) gồm hợp đồng dự án, phiếu nhập kho thực tế, tiến độ thi công để chủ động giải trình khi Cục Thuế kiểm tra.`;

export const TAX_SOP_2026_TEXT = DEFAULT_TAX_SOP_2026_TEXT;

export const INITIAL_POLICY_METADATA: PolicyVersionMetadata = {
  version: 'v2.5',
  releaseDate: '2026-01-02',
  updatedBy: 'Hội đồng Quản trị & Kế toán trưởng',
  status: 'ACTIVE',
  changeLog: [
    'v2.0 (02/01/2026): Ban hành bản quy chế gốc theo khung pháp lý cũ.',
    'v2.1 (08/01/2026): Bổ sung kiểm soát Tham số K theo Công văn 2392/TCT-QLRR.',
    'v2.5 (22/09/2026): Cập nhật đồng bộ Luật Thuế GTGT 48/2024/QH15 (ngưỡng thanh toán không tiền mặt 5 triệu), NQ 204/2025/QH15 (giảm thuế 8% đến hết 2026), NĐ 254/2026/NĐ-CP (HĐĐT và xử lý sai sót), Luật Thuế TNDN 67/2025/QH15 phân tầng, và loại bỏ hoàn toàn việc hoãn kê khai để giữ K.'
  ],
  text: DEFAULT_TAX_SOP_2026_TEXT
};
