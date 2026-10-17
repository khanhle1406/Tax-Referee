"""Sinh bộ hóa đơn XML DỮ LIỆU TỔNG HỢP cho demo xử lý theo lô (video và trình bày thủ công).

Mọi tên công ty, MST, số tiền đều do đội tự tạo — không phải hóa đơn thật của doanh nghiệp nào.
MST bên bán có số kiểm tra hợp lệ (để máy không hỏi lại MST); MST người mua là MST mẫu của workspace (0102030405).
Chạy: python scripts/demo/generate_demo_invoices.py  → ghi vào data/demo-batch/
"""
from __future__ import annotations

import json
import os
import sys
from dataclasses import dataclass, field
from xml.sax.saxutils import escape as esc

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'demo-batch')
BUYER = ('CÔNG TY CỔ PHẦN THƯƠNG MẠI & CÔNG NGHỆ FPRINCIPLES (DỮ LIỆU MẪU)', '0102030405')
WEIGHTS = [31, 29, 23, 19, 17, 13, 7, 5, 3]


def mst(seed: int) -> str:
    """MST 10 số có chữ số kiểm tra hợp lệ (bỏ qua gốc cho ra số kiểm tra 10). Cách nhau 100 để người bán khác nhau không trùng MST."""
    seed *= 100
    while True:
        base = f'03{seed:07d}'
        r = sum(int(d) * w for d, w in zip(base, WEIGHTS)) % 11
        check = 10 - r
        if check < 10:
            return base + str(check)
        seed += 1


@dataclass
class Line:
    name: str
    qty: int
    price: int
    rate: int

    @property
    def amount(self) -> int:
        return self.qty * self.price


@dataclass
class Case:
    file: str
    number: str
    date: str
    seller: str
    seller_seed: int
    payment: str
    lines: list[Line]
    scenario: str
    expected: str
    sender: str = 'minhanh.kd@example.com'
    buyer_mst: str = BUYER[1]
    total_override: int | None = None
    extra: dict = field(default_factory=dict)


def xml(c: Case) -> str:
    pre = sum(l.amount for l in c.lines)
    by_rate: dict[int, int] = {}
    for l in c.lines:
        by_rate[l.rate] = by_rate.get(l.rate, 0) + l.amount
    tax = sum(round(a * r / 100) for r, a in by_rate.items())
    total = c.total_override if c.total_override is not None else pre + tax
    items = ''.join(
        f'<HHDVu><TChat>1</TChat><STT>{i}</STT><THHDVu>{esc(l.name)}</THHDVu><DVTinh>Cái</DVTinh><SLuong>{l.qty}</SLuong>'
        f'<DGia>{l.price}</DGia><ThTien>{l.amount}</ThTien><TSuat>{l.rate}%</TSuat></HHDVu>'
        for i, l in enumerate(c.lines, 1))
    rates = ''.join(f'<LTSuat><TSuat>{r}%</TSuat><ThTien>{a}</ThTien><TThue>{round(a * r / 100)}</TThue></LTSuat>' for r, a in by_rate.items())
    return ('<?xml version="1.0" encoding="UTF-8"?>\n'
            '<HDon><DLHDon><TTChung><PBan>2.0.1</PBan><THDon>Hóa đơn giá trị gia tăng</THDon><KHMSHDon>1</KHMSHDon>'
            f'<KHHDon>C26TDM</KHHDon><SHDon>{c.number}</SHDon><NLap>{c.date}</NLap><DVTTe>VND</DVTTe><HTTToan>{esc(c.payment)}</HTTToan></TTChung>'
            f'<NDHDon><NBan><Ten>{esc(c.seller)}</Ten><MST>{mst(c.seller_seed)}</MST><DChi>Địa chỉ mẫu, TP. Hồ Chí Minh</DChi></NBan>'
            f'<NMua><Ten>{esc(BUYER[0])}</Ten><MST>{c.buyer_mst}</MST></NMua>'
            f'<DSHHDVu>{items}</DSHHDVu>'
            f'<TToan><THTTLTSuat>{rates}</THTTLTSuat><TgTCThue>{pre}</TgTCThue><TgTThue>{tax}</TgTThue><TgTTTBSo>{total}</TgTTTBSo></TToan>'
            '</NDHDon></DLHDon></HDon>\n')


D = '2026-10-12'
CASES: list[Case] = [
    # --- Thường quy: máy đề xuất duyệt ---
    Case('01-van-phong-pham.xml', '0000101', D, 'CÔNG TY TNHH VĂN PHÒNG XANH (MẪU)', 1001, 'Chuyển khoản', [Line('Giấy in A4 Double A', 20, 60000, 8)], 'Văn phòng phẩm dưới 5 triệu', 'Máy đề xuất duyệt'),
    Case('02-nuoc-uong.xml', '0000102', D, 'CÔNG TY TNHH NƯỚC SẠCH MINH AN (MẪU)', 1002, 'Tiền mặt', [Line('Nước uống đóng bình 20L', 10, 50000, 8)], 'Tiền mặt nhưng dưới 5 triệu', 'Máy đề xuất duyệt', sender='quocbao.hc@example.com'),
    Case('03-chuyen-phat.xml', '0000103', D, 'CÔNG TY CP CHUYỂN PHÁT NHANH SAO VIỆT (MẪU)', 1003, 'Chuyển khoản', [Line('Cước chuyển phát tài liệu tháng 9', 1, 2000000, 8)], 'Dịch vụ dưới 5 triệu', 'Máy đề xuất duyệt'),
    Case('04-internet.xml', '0000104', D, 'CÔNG TY VIỄN THÔNG MẪU (MẪU)', 1004, 'Chuyển khoản', [Line('Cước internet cáp quang tháng 9', 1, 1000000, 10)], 'Viễn thông đúng 10%', 'Máy đề xuất duyệt'),
    Case('05-sua-may-lanh.xml', '0000105', D, 'CÔNG TY TNHH ĐIỆN LẠNH HÒA BÌNH (MẪU)', 1005, 'Chuyển khoản', [Line('Bảo trì máy lạnh văn phòng', 4, 500000, 8)], 'Dịch vụ sửa chữa', 'Máy đề xuất duyệt', sender='quocbao.hc@example.com'),
    Case('06-thue-xe.xml', '0000106', D, 'CÔNG TY TNHH VẬN TẢI PHƯƠNG NAM (MẪU)', 1006, 'Chuyển khoản', [Line('Thuê xe ô tô đưa đón khách hội nghị', 1, 4000000, 8)], 'Thuê xe (dịch vụ, không phải xe chịu TTĐB)', 'Máy đề xuất duyệt'),
    Case('07-nhieu-thue-suat.xml', '0000107', D, 'CÔNG TY TNHH TỔNG HỢP ĐÔNG Á (MẪU)', 1007, 'Chuyển khoản', [Line('Bìa hồ sơ nhựa', 50, 20000, 8), Line('Cước điện thoại cố định tháng 9', 1, 1000000, 10)], 'Một hóa đơn hai thuế suất 8% và 10%', 'Máy đề xuất duyệt'),
    Case('08-ve-sinh.xml', '0000108', D, 'CÔNG TY TNHH VỆ SINH SẠCH ĐẸP (MẪU)', 1008, 'Chuyển khoản', [Line('Vệ sinh văn phòng tháng 9', 1, 3500000, 8)], 'Dịch vụ dưới 5 triệu', 'Máy đề xuất duyệt', sender='quocbao.hc@example.com'),
    Case('09-cafe-hop.xml', '0000109', D, 'CÔNG TY TNHH CÀ PHÊ PHỐ (MẪU)', 1009, 'Chuyển khoản', [Line('Cà phê và bánh ngọt họp giao ban', 1, 900000, 8)], 'Chi họp nội bộ, không có đồ uống có cồn', 'Máy đề xuất duyệt'),
    Case('10-muc-in.xml', '0000110', D, 'CÔNG TY TNHH VĂN PHÒNG XANH (MẪU)', 1001, 'Chuyển khoản', [Line('Mực in laser HP 85A', 3, 450000, 8)], 'Văn phòng phẩm', 'Máy đề xuất duyệt'),
    # --- Chuyển khoản từ 5 triệu: hỏi đã có ủy nhiệm chi chưa (cùng câu hỏi → duyệt nhóm) ---
    Case('11-may-in.xml', '0000111', D, 'CÔNG TY TNHH THIẾT BỊ SỐ (MẪU)', 1011, 'Chuyển khoản', [Line('Máy in laser Canon LBP', 1, 7000000, 8)], 'Chuyển khoản 7,56 triệu: cần xác nhận UNC', 'Chưa rõ thông tin → KTT (nhóm UNC)'),
    Case('12-ban-ghe.xml', '0000112', D, 'CÔNG TY TNHH NỘI THẤT VIỆT (MẪU)', 1012, 'Chuyển khoản', [Line('Bàn làm việc gỗ', 4, 2000000, 8)], 'Chuyển khoản 8,64 triệu: cần xác nhận UNC', 'Chưa rõ thông tin → KTT (nhóm UNC)'),
    Case('13-dao-tao.xml', '0000113', D, 'CÔNG TY TNHH ĐÀO TẠO KỸ NĂNG (MẪU)', 1013, 'Chuyển khoản', [Line('Khóa đào tạo kỹ năng bán hàng', 1, 12000000, 8)], 'Chuyển khoản 12,96 triệu: cần xác nhận UNC', 'Chưa rõ thông tin → KTT (nhóm UNC)'),
    # --- Ngoài quy định ---
    Case('14-ruou-tiep-khach-a.xml', '0000114', D, 'NHÀ HÀNG SEN VÀNG (MẪU)', 1014, 'Chuyển khoản', [Line('Tiếp khách đối tác - rượu vang', 1, 3000000, 10)], 'Đồ uống có cồn khi tiếp khách', 'Ngoài quy định → KTT (nhóm tiếp khách)'),
    Case('15-ruou-tiep-khach-b.xml', '0000115', D, 'NHÀ HÀNG BIỂN XANH (MẪU)', 1015, 'Chuyển khoản', [Line('Tiếp khách đối tác - bia và hải sản', 1, 2500000, 10)], 'Đồ uống có cồn khi tiếp khách', 'Ngoài quy định → KTT (nhóm tiếp khách)'),
    Case('16-tien-mat-lon.xml', '0000116', D, 'CÔNG TY TNHH ĐIỆN MÁY NAM PHONG (MẪU)', 1016, 'Tiền mặt', [Line('Tủ lạnh văn phòng 300 lít', 1, 10000000, 8)], 'Tiền mặt từ 5 triệu', 'Ngoài quy định → KTT'),
    Case('17-thue-van-phong.xml', '0000117', D, 'CÔNG TY TNHH BẤT ĐỘNG SẢN HƯNG THỊNH (MẪU)', 1017, 'Chuyển khoản', [Line('Thuê văn phòng tháng 10/2026', 1, 4000000, 8)], 'Thuê văn phòng áp 8% (kinh doanh bất động sản không được giảm)', 'Ngoài quy định → KTT'),
    Case('18-qua-tang.xml', '0000118', D, 'CÔNG TY TNHH BÁNH KẸO KINH ĐÔ MẪU (MẪU)', 1018, 'Chuyển khoản', [Line('Bánh trung thu tặng khách hàng', 20, 200000, 8)], 'Quà tặng khách hàng', 'Ngoài quy định → KTT'),
    Case('19-sai-mst-nguoi-mua.xml', '0000119', D, 'CÔNG TY TNHH VĂN PHÒNG XANH (MẪU)', 1001, 'Chuyển khoản', [Line('Giấy in A3', 10, 90000, 8)], 'Ghi MST người mua của công ty khác', 'Ngoài quy định → KTT', buyer_mst=mst(2019)),
    Case('20-cum-tien-mat-1.xml', '0000120', D, 'CỬA HÀNG TẠP HÓA BÌNH MINH (MẪU)', 1020, 'Tiền mặt', [Line('Đồ dùng pantry', 1, 3000000, 8)], 'Cụm tiền mặt cùng người bán cùng ngày (tờ 1)', 'Tờ 1 ổn; khi có tờ 2 thì cả cụm bị hỏi'),
    Case('21-cum-tien-mat-2.xml', '0000121', D, 'CỬA HÀNG TẠP HÓA BÌNH MINH (MẪU)', 1020, 'Tiền mặt', [Line('Khăn giấy và nước rửa tay', 1, 1630000, 8)], 'Cụm tiền mặt: hai tờ cộng lại từ 5 triệu', 'Ngoài quy định → KTT (cụm trong ngày)'),
    # --- Chưa rõ thông tin ---
    Case('22-lech-tong.xml', '0000122', D, 'CÔNG TY TNHH VĂN PHÒNG XANH (MẪU)', 1001, 'Chuyển khoản', [Line('Ghim bấm và kẹp giấy', 1, 450000, 10)], 'Tổng in 480.000₫ lệch tiền hàng + thuế 495.000₫', 'Chưa rõ thông tin → KTT', total_override=480000),
    # --- Vượt thẩm quyền ---
    Case('23-laptop.xml', '0000123', D, 'CÔNG TY CP MÁY TÍNH THÀNH CÔNG (MẪU)', 1023, 'Chuyển khoản', [Line('Laptop Dell Latitude 5450', 10, 30000000, 10)], '330 triệu, vượt hạn mức 200 triệu của KTT', 'Vượt thẩm quyền → CFO'),
    # --- Trùng: gửi lại cùng file (lô tự khử trùng theo mã băm) ---
    Case('24-trung-van-phong-pham.xml', '0000101', D, 'CÔNG TY TNHH VĂN PHÒNG XANH (MẪU)', 1001, 'Chuyển khoản', [Line('Giấy in A4 Double A', 20, 60000, 8)], 'Gửi lại đúng hóa đơn số 0000101', 'Không tạo bản trùng'),
]


def main() -> None:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    os.makedirs(OUT, exist_ok=True)
    manifest = []
    for c in CASES:
        content = xml(c)
        with open(os.path.join(OUT, c.file), 'w', encoding='utf-8', newline='\n') as fh:
            fh.write(content)
        manifest.append({'file': c.file, 'invoiceNumber': c.number, 'scenario': c.scenario, 'expected': c.expected, 'sender': c.sender})
    with open(os.path.join(OUT, 'not-an-invoice.xml'), 'w', encoding='utf-8', newline='\n') as fh:
        fh.write('<?xml version="1.0" encoding="UTF-8"?>\n<BaoGia><TieuDe>Báo giá (không phải hóa đơn)</TieuDe></BaoGia>\n')
    manifest.append({'file': 'not-an-invoice.xml', 'scenario': 'File không phải hóa đơn', 'expected': 'Không đọc được, không làm hỏng cả lô', 'sender': 'nguoi-la@example.net'})
    with open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8') as fh:
        json.dump({'note': 'DỮ LIỆU TỔNG HỢP do đội tự tạo cho demo; không phải hóa đơn thật.', 'buyerTaxCode': BUYER[1], 'cases': manifest}, fh, ensure_ascii=False, indent=2)
    print(f'Đã ghi {len(manifest)} file vào {os.path.normpath(OUT)}')


if __name__ == '__main__':
    main()
