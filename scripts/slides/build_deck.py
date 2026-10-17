# -*- coding: utf-8 -*-
"""Dựng bộ slide trình bày vòng cải tiến 17/10 của Tax Referee (16:9, python-pptx).

Chạy lại bao nhiêu lần cũng được:
    python scripts/slides/build_deck.py
    python scripts/slides/build_deck.py --screens docs/submission/screens --out docs/submission/x.pptx
    python scripts/slides/build_deck.py --video docs/submission/video/Tax-Referee-demo-1-phut.mp4

11 slide, không có ô số liệu lớn. Sơ đồ kiến trúc: docs/diagrams/src/kien-truc-cai-tien.mmd
(dựng bằng `python docs/diagrams/render.py kien-truc-cai-tien`). Video demo nhúng ở slide cuối.

Nếu thư mục ảnh có dashboard.png, batch.png, explain.png, channels.png, history.png, trust.png
thì ảnh được chèn vào slide tương ứng; thiếu ảnh nào thì vẽ khung chờ có nhãn.
Màu và phông theo bộ 5 slide của đội (Cambria cho tiêu đề, Calibri cho chữ).
"""
from __future__ import annotations

import argparse
import os
import re
from pathlib import Path

from lxml import etree
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.dml import MSO_LINE
from pptx.enum.shapes import MSO_CONNECTOR, MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, MSO_AUTO_SIZE, PP_ALIGN
from pptx.oxml.ns import qn
from pptx.util import Inches, Pt

try:
    from PIL import Image
except ImportError:  # Pillow chỉ cần để giữ tỉ lệ ảnh
    Image = None

ROOT = Path(__file__).resolve().parents[2]

# Bảng màu lấy từ theme của bộ 5 slide (Tax-Referee_5-slide_trinh-bay-17-10.pptx)
NAVY = "0F172A"
CARD_DARK = "1E293B"
SLATE = "334155"
MUTED = "64748B"
SOFT = "94A3B8"
LINE = "CBD5E1"
ON_DARK = "E2E8F0"
LIGHT = "F1F5F9"
PAPER = "F8FAFC"
WHITE = "FFFFFF"
LIME = "D9F99D"
LIME_DEEP = "4D7C0F"
LIME_TINT = "ECFCCB"
AMBER = "B45309"
AMBER_TINT = "FEF3C7"
ROSE = "BE123C"
ROSE_TINT = "FFE4E6"
TEAL = "0F766E"

HEAD = "Cambria"
BODY = "Calibri"
FOOTER = "Tax Referee · Đội Fprinciples · MLAI Hackathon 2026 · Track VNG"
LIVE = "limegreen-salamander-517622.hostingersite.com"


NBSP_UNITS = re.compile(r"(\d) (triệu|giây|ms|ngày|người|ca|bộ|lần|trường|phép|thao)")


def keep_units(t: str) -> str:
    """Không để số và đơn vị rơi xuống hai dòng khác nhau ("5" / "triệu")."""
    return NBSP_UNITS.sub(lambda m: m.group(1) + chr(0xA0) + m.group(2), t)


def rgb(hex_: str) -> RGBColor:
    return RGBColor.from_string(hex_)


# ---------------------------------------------------------------- văn bản
def R(text, **o):
    return ("run", text, o)


def P(*runs, **o):
    return ("para", runs, o)


def _bullet(p, color):
    pPr = p._p.get_or_add_pPr()
    pPr.set("marL", str(int(Inches(0.2))))
    pPr.set("indent", str(-int(Inches(0.2))))
    clr = etree.SubElement(pPr, qn("a:buClr"))
    etree.SubElement(clr, qn("a:srgbClr")).set("val", color)
    etree.SubElement(pPr, qn("a:buFont")).set("typeface", "Arial")
    etree.SubElement(pPr, qn("a:buChar")).set("char", "•")


def fill_tf(tf, paras, **base):
    tf.word_wrap = True
    tf.auto_size = MSO_AUTO_SIZE.NONE
    for i, para in enumerate(paras):
        if isinstance(para, str):
            para = P(para)
        _, runs, po = para
        opts = {**base, **po}
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = opts.get("align", PP_ALIGN.LEFT)
        if opts.get("before"):
            p.space_before = Pt(opts["before"])
        if opts.get("after") is not None:
            p.space_after = Pt(opts["after"])
        if opts.get("line"):
            p.line_spacing = opts["line"]
        if opts.get("bullet"):
            _bullet(p, opts.get("bullet_color", LIME_DEEP))
        for r in runs:
            if isinstance(r, str):
                r = R(r)
            _, text, ro = r
            ro = {**opts, **ro}
            run = p.add_run()
            run.text = keep_units(text)
            f = run.font
            f.size = Pt(ro.get("size", 14))
            f.bold = bool(ro.get("bold", False))
            f.italic = bool(ro.get("italic", False))
            f.name = ro.get("font", BODY)
            f.color.rgb = rgb(ro.get("color", SLATE))


def _no_style(shape):
    st = shape._element.find(qn("p:style"))
    if st is not None:
        shape._element.remove(st)


def text(slide, x, y, w, h, paras, anchor=MSO_ANCHOR.TOP, name=None, **base):
    s = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    if name:
        s.name = name
    tf = s.text_frame
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = anchor
    if isinstance(paras, (str, tuple)):
        paras = [paras]
    fill_tf(tf, paras, **base)
    return s


def box(slide, x, y, w, h, fill=LIGHT, line=None, radius=0.08, shape=MSO_SHAPE.ROUNDED_RECTANGLE,
        paras=None, anchor=MSO_ANCHOR.MIDDLE, pad=0.12, dash=False, line_w=1.0, name=None, **base):
    s = slide.shapes.add_shape(shape, Inches(x), Inches(y), Inches(w), Inches(h))
    _no_style(s)
    if name:
        s.name = name
    if shape == MSO_SHAPE.ROUNDED_RECTANGLE:
        s.adjustments[0] = radius
    if fill:
        s.fill.solid()
        s.fill.fore_color.rgb = rgb(fill)
    else:
        s.fill.background()
    if line:
        s.line.color.rgb = rgb(line)
        s.line.width = Pt(line_w)
        if dash:
            s.line.dash_style = MSO_LINE.DASH
    else:
        s.line.fill.background()
    tf = s.text_frame
    tf.margin_left = tf.margin_right = Inches(pad)
    tf.margin_top = tf.margin_bottom = Inches(min(pad, 0.06))
    tf.vertical_anchor = anchor
    if paras is not None:
        if isinstance(paras, (str, tuple)):
            paras = [paras]
        fill_tf(tf, paras, **base)
    return s


def circle(slide, x, y, d, label, fill=NAVY, color=WHITE, size=12):
    return box(slide, x, y, d, d, fill=fill, shape=MSO_SHAPE.OVAL, pad=0,
               paras=[P(R(label, bold=True), align=PP_ALIGN.CENTER)], size=size, color=color)


def arrow(slide, x1, y1, x2, y2, color=SOFT, width=1.5):
    c = slide.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, Inches(x1), Inches(y1), Inches(x2), Inches(y2))
    _no_style(c)
    c.line.color.rgb = rgb(color)
    c.line.width = Pt(width)
    ln = c.line._get_or_add_ln()
    tail = etree.SubElement(ln, qn("a:tailEnd"))
    tail.set("type", "triangle")
    tail.set("w", "med")
    tail.set("len", "med")
    return c


# ---------------------------------------------------------------- khung slide
class Deck:
    def __init__(self, screens: Path):
        self.prs = Presentation()
        self.prs.slide_width = Inches(10)
        self.prs.slide_height = Inches(5.625)
        self.screens = screens
        self.n = 0
        self.placeholders: list[str] = []
        self.inserted: list[str] = []

    def slide(self, dark=False, kicker=None, title=None, notes=""):
        s = self.prs.slides.add_slide(self.prs.slide_layouts[6])
        self.n += 1
        s.background.fill.solid()
        s.background.fill.fore_color.rgb = rgb(NAVY if dark else WHITE)
        if kicker:
            text(s, 0.5, 0.24, 9.0, 0.25, kicker, size=10, bold=True,
                 color=LIME if dark else LIME_DEEP, name="Kicker")
        if title:
            text(s, 0.5, 0.48, 9.0, 0.6, title, size=26, bold=True, font=HEAD,
                 color=WHITE if dark else NAVY, anchor=MSO_ANCHOR.TOP, name="Title")
        if self.n > 1:
            text(s, 0.5, 5.2, 7.6, 0.25, FOOTER, size=9, color=SOFT if dark else SLATE, name="Footer")
            text(s, 8.9, 5.2, 0.6, 0.25, P(str(self.n), align=PP_ALIGN.RIGHT), size=9,
                 color=SOFT if dark else SLATE, name="Slide number")
        if notes:
            s.notes_slide.notes_text_frame.text = " ".join(notes.split())
        return s

    def screen(self, s, key, label, x, y, w, h, align="right"):
        path = self.screens / f"{key}.png"
        if path.is_file():
            if Image is not None:
                with Image.open(path) as im:
                    iw, ih = im.size
                sc = min(w / iw, h / ih)
                pw, ph = iw * sc, ih * sc
            else:
                pw, ph = w, h
            # bám mép ngoài của cột và mép trên để các slide thẳng hàng với nhau
            px = x + (w - pw) if align == "right" else x
            py = y
            pic = s.shapes.add_picture(str(path), Inches(px), Inches(py), Inches(pw), Inches(ph))
            pic.name = f"Ảnh màn hình {key}"
            pic.line.color.rgb = rgb(LINE)
            pic.line.width = Pt(0.75)
            self.inserted.append(key)
        else:
            box(s, x, y, w, h, fill=PAPER, line=SOFT, dash=True, radius=0.04, name=f"Khung chờ {key}",
                paras=[P(R(f"Ảnh màn hình: {label}", bold=True), align=PP_ALIGN.CENTER, after=4),
                       P(R(f"docs/submission/screens/{key}.png", size=9, color=SOFT), align=PP_ALIGN.CENTER)],
                size=13, color=MUTED)
            self.placeholders.append(key)


# ---------------------------------------------------------------- nội dung
def build(screens: Path, out: Path, video: Path | None = None, diagram: Path | None = None):
    d = Deck(screens)

    # 1 ─ Bìa
    s = d.slide(dark=True, notes="""
Chào ban giám khảo. Chúng em là đội Fprinciples, sản phẩm là Tax Referee, trọng tài cho thuế giá trị gia tăng đầu vào
trên hóa đơn điện tử. Cả bài gói trong một câu: máy quyết từng hóa đơn, người chốt cả lô. Quy tắc ra quyết định,
AI chỉ làm việc đọc chứng từ. Em sẽ kể hiện trạng, nỗi đau, cách làm, kiến trúc, ba phần giải pháp, bảo mật,
riêng tư, rồi mời xem video demo khoảng một phút rưỡi.""")
    text(s, 0.6, 0.6, 8.8, 0.3, "TAX REFEREE · ĐỀ A — THE ESCALATION REFEREE · VÒNG CẢI TIẾN 17/10",
         size=11, bold=True, color=LIME)
    text(s, 0.6, 1.0, 8.8, 1.45, [P("Máy quyết từng hóa đơn."), P(R("Người chốt cả lô.", color=LIME))],
         size=40, bold=True, font=HEAD, color=WHITE)
    text(s, 0.6, 2.6, 8.8, 0.4, "Trọng tài thuế GTGT đầu vào cho hóa đơn điện tử Việt Nam", size=18, color=ON_DARK)
    text(s, 0.6, 3.02, 8.8, 0.35, "Quy tắc quyết định. AI chỉ đọc chứng từ. Người có thẩm quyền chốt sổ.", size=15, color=LINE)
    steps = ["Nhận hóa đơn", "Đọc chứng từ", "Máy quyết", "Người chốt"]
    for i, st in enumerate(steps):
        x = 0.6 + i * 2.2
        box(s, x, 3.75, 1.8, 0.48, fill=None, line=LIME, line_w=1.0, radius=0.5,
            paras=[P(st, align=PP_ALIGN.CENTER)], size=13, bold=True, color=LIME, pad=0.04)
        if i < len(steps) - 1:
            arrow(s, x + 1.85, 3.99, x + 2.15, 3.99, color=SOFT)
    text(s, 0.6, 4.85, 8.8, 0.3, f"Đội Fprinciples · MLAI Hackathon 2026 · Track VNG · {LIVE}", size=10, color=SOFT)

    # 2 ─ Hiện trạng
    s = d.slide(kicker="HIỆN TRẠNG", title="Cuối tháng của chị kế toán", notes="""
Thử hình dung chị kế toán vào cuối tháng. Hóa đơn đổ về từ mail, từ Zalo, có cái là file XML, có cái chỉ là ảnh chụp,
có cái là giấy. Chị mở từng mail, tải từng file, lướt Zalo tìm ảnh, gõ lại vào Excel, rồi dò bằng mắt từng điều kiện
khấu trừ. Tất cả dồn vào mấy ngày cuối tháng.""")
    for i, ch in enumerate(["Gmail", "Zalo", "Giấy, ảnh chụp"]):
        y = 1.45 + i * 0.62
        box(s, 0.5, y, 1.5, 0.44, fill=WHITE, line=LINE, paras=[P(ch, align=PP_ALIGN.CENTER)], size=12,
            bold=True, color=SLATE, pad=0.04)
        arrow(s, 2.05, y + 0.22, 2.45, 2.07)
    box(s, 2.5, 1.45, 2.1, 1.25, fill=LIGHT,
        paras=[P(R("Hóa đơn dồn về", bold=True, size=15, color=NAVY), align=PP_ALIGN.CENTER),
               P("XML, PDF, ảnh, giấy", align=PP_ALIGN.CENTER, size=12, color=MUTED)])
    box(s, 0.5, 3.55, 4.1, 1.3, fill=LIME_TINT, pad=0.18,
        paras=[P(R("Dồn vào cuối tháng. ", bold=True),
                 "Mỗi hóa đơn phải đạt nhiều điều kiện cùng lúc mới được khấu trừ thuế.")],
        size=14, color=NAVY)
    text(s, 5.0, 1.4, 4.5, 0.3, "Chị làm từng bước bằng tay", size=14, bold=True, color=NAVY)
    for i, (t, b) in enumerate([("Mở mail, tải từng file", "Mỗi nhà cung cấp gửi một kiểu, một giờ."),
                                ("Lướt Zalo tìm ảnh chụp", "Ảnh mờ, thiếu trang, lẫn với tin nhắn khác."),
                                ("Gõ lại vào Excel", "Gõ tay số hóa đơn, mã số thuế, tiền thuế."),
                                ("Dò điều kiện bằng mắt", "Ngày lập, cách trả tiền, ngưỡng, người bán.")]):
        y = 1.85 + i * 0.78
        circle(s, 5.0, y + 0.05, 0.42, str(i + 1), fill=NAVY, size=13)
        text(s, 5.6, y, 3.9, 0.3, t, size=14, bold=True, color=NAVY)
        text(s, 5.6, y + 0.3, 3.9, 0.35, b, size=12, color=MUTED)

    # 3 ─ Nỗi đau
    s = d.slide(kicker="NỖI ĐAU", title="Bốn chỗ đau, chỗ nào cũng tốn tiền", notes="""
Có bốn chỗ đau. Một, sai một điều kiện là mất tiền thuế được khấu trừ: ví dụ hóa đơn sáu triệu trả tiền mặt,
lập sau ngày 1 tháng 7 năm 2025, thì không được khấu trừ vì ngưỡng nay là năm triệu. Hai, chỉ có hai cách làm
quen tay mà đều sai: cho qua hết thì thanh tra loại, cái gì cũng hỏi sếp thì sếp nghẽn. Ba, hóa đơn qua mail và Zalo
thì không chắc ai gửi, kẻ xấu có thể giả danh nhà cung cấp. Bốn, sếp không thấy toàn cảnh: lô nào đang kẹt, ở đâu,
chờ ai.""")
    pains = [("Mất tiền thuế vì sai một điều kiện", "Hóa đơn 6 triệu trả tiền mặt, lập sau 01/7/2025: không được khấu trừ. Ngưỡng nay là 5 triệu.", ROSE_TINT, ROSE),
             ("Duyệt bừa, hoặc dồn hết lên sếp", "Cho qua hết thì thanh tra loại. Cái gì cũng hỏi thì sếp nghẽn cuối tháng.", AMBER_TINT, AMBER),
             ("Không biết ai gửi hóa đơn", "Qua mail, Zalo, ai cũng có thể giả danh nhà cung cấp để lọt hóa đơn giả.", ROSE_TINT, ROSE),
             ("Sếp không thấy toàn cảnh", "Lô nào đang kẹt, chờ ai, vì sao: chỉ biết khi đã có chuyện.", AMBER_TINT, AMBER)]
    for i, (t, b, fill, c) in enumerate(pains):
        x = 0.5 + (i % 2) * 4.6
        y = 1.3 + (i // 2) * 1.85
        box(s, x, y, 4.4, 1.65, fill=fill, radius=0.06)
        circle(s, x + 0.22, y + 0.25, 0.46, str(i + 1), fill=c, size=14)
        text(s, x + 0.85, y + 0.22, 3.4, 0.55, t, size=15, bold=True, color=NAVY)
        text(s, x + 0.85, y + 0.8, 3.4, 0.8, b, size=12.5, color=SLATE)

    # 4 ─ Phương pháp
    s = d.slide(kicker="PHƯƠNG PHÁP", title="Quy tắc quyết định, AI chỉ đọc, người chốt", notes="""
Cách làm của chúng em giống cô giáo chấm bài. Bài đúng hết thì cho điểm luôn. Bài sai chỗ nào thì khoanh đỏ đúng chỗ đó
và hỏi lại. Bộ quy tắc viết sẵn theo luật quyết định từng hóa đơn; phần quyết định không gọi mô hình ngôn ngữ lần nào,
nên chạy lại bao nhiêu lần cũng ra một kết quả. AI chỉ làm việc chép chữ trên ảnh. Khi chưa chắc, máy dừng và nói rõ
vì sao, chỉ ba kiểu dừng: chưa rõ thông tin, ngoài quy định, vượt thẩm quyền. Cuối cùng người có thẩm quyền ký
thì mới ghi sổ. Ca máy duyệt vẫn bị hậu kiểm ngẫu nhiên.""")
    box(s, 0.5, 1.3, 4.1, 2.25, fill=LIGHT, pad=0.25,
        paras=[P(R("Giống cô giáo chấm bài", bold=True, size=13, color=LIME_DEEP), after=8),
               P(R("Bài đúng hết thì cho điểm luôn. Bài sai chỗ nào thì khoanh đỏ đúng chỗ đó và hỏi lại.",
                   font=HEAD, italic=True, size=17, color=NAVY))])
    text(s, 0.5, 3.8, 4.1, 1.1, [P("Ba kiểu dừng, nói rõ lý do:", bold=True, color=NAVY, after=4),
                                 P("chưa rõ thông tin · ngoài quy định · vượt thẩm quyền.", color=ROSE, bold=True)],
         size=13, color=SLATE)
    for i, (t, b, fill) in enumerate([
            ("Quy tắc quyết định", "Bộ quy tắc viết sẵn theo luật. Cùng dữ liệu, cùng quy chế thì ra cùng kết quả.", NAVY),
            ("AI chỉ đọc", "AI chỉ chép chữ trên ảnh vào ô có sẵn. AI không được duyệt, không được từ chối.", "2F4FB3"),
            ("Người chốt", "Chưa chắc thì dừng và hỏi đúng người. Người có thẩm quyền ký rồi mới ghi sổ.", LIME_DEEP)]):
        y = 1.3 + i * 1.22
        circle(s, 5.0, y + 0.08, 0.5, str(i + 1), fill=fill, color=WHITE, size=15)
        text(s, 5.7, y + 0.02, 3.8, 0.35, t, size=16, bold=True, color=NAVY)
        text(s, 5.7, y + 0.4, 3.8, 0.7, b, size=12.5, color=SLATE)

    # 5 ─ Kiến trúc + Q2
    s = d.slide(kicker="KIẾN TRÚC · TRẢ LỜI CÂU HỎI 2 CỦA BAN TỔ CHỨC", title="Đường đi của một hóa đơn", notes="""
Đây là kiến trúc. Hàng trên: hóa đơn vào từ Gmail, Zalo hoặc tải lên; hệ thống nhận diện người gửi bằng danh bạ và
kiểm SPF, DKIM của email; đọc chứng từ: file XML do máy đọc tất định, không qua AI, ảnh thì AI chỉ được trả mười bốn
trường nhìn thấy; rồi xếp vào lô theo mã số thuế, ngày, số hóa đơn và bỏ hóa đơn trùng. Hàng giữa: bộ quy tắc tất định
quyết định, căn cứ pháp lý chọn theo ngày lập hóa đơn. Ca đạt thì máy đề xuất duyệt kèm phiếu giải trình; ca chưa đạt
thì đặt câu hỏi kiểu 1A, 2B cho đúng kế toán trưởng hoặc giám đốc tài chính, câu giống nhau thì duyệt nhóm. Chốt lô
cần người ký rồi mới ghi sổ. Nền dưới cùng: nhật ký chỉ ghi thêm có chuỗi băm và HMAC, phân quyền và mỗi phiên một
cơ sở dữ liệu riêng. Trả lời câu hỏi 2: đánh đổi thứ nhất là dùng quy tắc thay vì để mô hình ngôn ngữ quyết định, đổi
độ linh hoạt lấy khả năng kiểm toán. Thứ hai, mỗi phiên một file SQLite thì cách ly đơn giản nhưng chỉ chạy một máy;
cần nhiều máy thì chuyển sang PostgreSQL. Thứ ba, gọi AI đọc ảnh đồng bộ qua proxy thì nhanh ra demo nhưng dữ liệu đi ra
ngoài, nên khách hàng thật phải có hợp đồng xử lý dữ liệu hoặc chạy chế độ chỉ XML. Lộ trình 30 ngày: SSO, MFA, worker
đọc file cô lập, hàng đợi. 90 ngày: lấy XML hóa đơn điện tử có chữ ký số làm nguồn sự thật, đối chiếu dữ liệu cơ quan thuế.""")
    dia = diagram if diagram is not None else ROOT / "docs" / "diagrams" / "kien-truc-cai-tien.png"
    if dia.is_file() and Image is not None:
        with Image.open(dia) as im:
            iw, ih = im.size
        dw = 7.05
        dh = dw * ih / iw
        if dh > 3.85:
            dh = 3.85
            dw = dh * iw / ih
        pic = s.shapes.add_picture(str(dia), Inches(0.5), Inches(1.15), Inches(dw), Inches(dh))
        pic.name = "Sơ đồ kiến trúc (Mermaid)"
    else:
        box(s, 0.5, 1.15, 7.05, 3.75, fill=PAPER, line=SOFT, dash=True, name="Khung chờ sơ đồ",
            paras=[P("Chạy docs/diagrams/render.py kien-truc-cai-tien", align=PP_ALIGN.CENTER)], size=12, color=MUTED)
        d.placeholders.append("kien-truc-cai-tien")
    box(s, 7.75, 1.15, 1.75, 3.8, fill=LIGHT, radius=0.05, pad=0.12, anchor=MSO_ANCHOR.TOP, name="Trả lời Q2",
        paras=[P(R("Lên production", bold=True, size=12, color=LIME_DEEP), after=6),
               P(R("Đánh đổi: ", bold=True, color=NAVY), "quy tắc thay vì AI quyết, đổi độ linh hoạt lấy kiểm toán được.", after=6),
               P(R("Hôm nay: ", bold=True, color=NAVY), "một máy, mỗi phiên một SQLite. Nhiều máy thì PostgreSQL.", after=6),
               P(R("30 ngày: ", bold=True, color=NAVY), "SSO, MFA, đọc file ở worker riêng, hàng đợi.", after=6),
               P(R("90 ngày: ", bold=True, color=NAVY), "XML có chữ ký số làm nguồn sự thật.")],
        size=10.5, color=SLATE)

    # 6 ─ Giải pháp 1: lô + phiếu giải trình
    s = d.slide(kicker="GIẢI PHÁP 1", title="Lô hóa đơn và phiếu giải trình", notes="""
Phần giải pháp thứ nhất. Chị kế toán không xử lý lẻ từng hóa đơn nữa mà gom thành lô. Trong lô, hóa đơn được xếp theo
mã số thuế người bán, rồi ngày, rồi số hóa đơn; hóa đơn trùng bị bỏ, và một hóa đơn chỉ nằm trong một lô nên không bị
ghi sổ hai lần. Mỗi hóa đơn có một phiếu giải trình viết bằng lời thường: đạt điều kiện nào, thiếu điều kiện nào,
căn cứ văn bản nào theo ngày lập, và kết quả cuối là đã duyệt, từ chối hay tạm giữ.""")
    d.screen(s, "batch", "Lô hóa đơn", 0.5, 1.2, 4.35, 2.45, align="left")
    d.screen(s, "explain", "Phiếu giải trình", 5.15, 1.2, 4.35, 2.45, align="left")
    text(s, 0.5, 3.85, 4.35, 1.1, [P("Lô hóa đơn", bold=True, color=NAVY, size=14, after=3),
                                   P("Xếp theo mã số thuế, ngày, số. Nhận ra hóa đơn trùng. Một hóa đơn chỉ nằm một lô, không ghi sổ hai lần.")],
         size=12.5, color=SLATE)
    text(s, 5.15, 3.85, 4.35, 1.1, [P("Phiếu giải trình", bold=True, color=NAVY, size=14, after=3),
                                    P("Nói bằng lời thường: đạt gì, thiếu gì, căn cứ nào, kết quả cuối là duyệt, từ chối hay tạm giữ.")],
         size=12.5, color=SLATE)

    # 7 ─ Giải pháp 2: máy quyết, người chốt, duyệt nhóm, kênh
    s = d.slide(kicker="GIẢI PHÁP 2", title="Máy quyết, người chốt, biết ai gửi", notes="""
Phần giải pháp thứ hai. Máy quyết từng hóa đơn, nhưng chốt lô là việc của người: kế toán trưởng hoặc giám đốc tài chính
ký thì mới ghi sổ, và kế toán trưởng không được chốt lô có hóa đơn do chính mình nhập. Câu hỏi cùng nội dung, cùng hệ quả
được gom lại, người có thẩm quyền trả lời một lần kiểu 1A, 2B cho cả nhóm; câu xác nhận số liệu riêng của từng tờ thì không gom. Hóa đơn đến qua Gmail hay Zalo thì hệ thống so với danh bạ
và kiểm SPF, DKIM để biết ai gửi; kiểu giả danh bằng địa chỉ như example.com@evil.net bị chặn. Chỉ kế toán viên lấy thư; người gửi lạ
phải được kế toán trưởng hoặc giám đốc tài chính xác nhận. Trong phiên demo của người lạ, kênh Gmail và Zalo thật không chạy.""")
    rows = [("Máy quyết, người chốt", "Lô chỉ vào sổ sau khi KTT/CFO chốt; chỉ KTT/CFO được xuất chứng từ. KTT không chốt lô có hóa đơn do chính mình nhập."),
            ("Duyệt nhóm 1A, 2B", "Câu hỏi giống nhau gom lại, trả lời một lần cho cả nhóm, đúng người đúng việc."),
            ("Gmail, Zalo biết ai gửi", "Gmail: danh bạ + SPF/DKIM. Zalo: đúng user id. Giả danh kiểu example.com@evil.net bị chặn.")]
    for i, (t, b) in enumerate(rows):
        y = 1.25 + i * 1.22
        circle(s, 0.5, y + 0.05, 0.44, str(i + 1), fill=LIME_DEEP, size=14)
        text(s, 1.1, y, 3.3, 0.35, t, size=15, bold=True, color=NAVY)
        text(s, 1.1, y + 0.38, 3.3, 0.75, b, size=12.5, color=SLATE)
    d.screen(s, "channels", "Kênh Gmail/Zalo", 4.6, 1.25, 4.9, 2.76)
    text(s, 4.6, 4.15, 4.9, 0.6, "Hộp thư vào (phiên demo, Gmail/Zalo mô phỏng): nhân viên đã xác thực, nghi mạo danh, ngoài danh bạ.",
         size=11, color=MUTED, italic=True)

    # 8 ─ Giải pháp 3: tổng quan + lịch sử
    s = d.slide(kicker="GIẢI PHÁP 3", title="Sếp thấy toàn cảnh, mỗi người thấy việc mình", notes="""
Phần giải pháp thứ ba. Màn hình Tổng quan cho sếp: bao nhiêu lô đã chốt, bao nhiêu chưa, hóa đơn nào đang chờ ai và vì sao dừng.
Màn hình Lịch sử của tôi cho từng người: mình đã nhập gì, trả lời gì, duyệt gì, bằng nhãn tiếng Việt dễ đọc.
Phần việc đã làm lấy từ nhật ký chỉ ghi thêm, nên không ai sửa lén được.""")
    d.screen(s, "dashboard", "Tổng quan cho sếp", 0.5, 1.2, 5.4, 3.04, align="left")
    text(s, 0.5, 4.38, 5.4, 0.6, [P(R("Tổng quan cho sếp: ", bold=True, color=NAVY),
                                    "bao nhiêu lô đã chốt, bao nhiêu chưa, hóa đơn nào chờ ai, vì sao dừng.")], size=12.5, color=SLATE)
    d.screen(s, "history", "Lịch sử của tôi", 6.2, 1.2, 3.3, 1.86)
    text(s, 6.2, 3.25, 3.3, 1.7, [P("Lịch sử của tôi", bold=True, color=NAVY, size=14, after=3),
                                  P("Mỗi người thấy mình đã nhập, trả lời, duyệt gì, bằng nhãn tiếng Việt.", after=6),
                                  P("Việc đã làm lấy từ nhật ký chỉ ghi thêm.", color=MUTED)],
         size=12.5, color=SLATE)

    # 9 ─ Bảo mật (Q1)
    s = d.slide(kicker="BẢO MẬT · TRẢ LỜI CÂU HỎI 1 CỦA BAN TỔ CHỨC", title="Máy đọc có thể bị lừa, trọng tài thì không", notes="""
Trả lời câu hỏi 1 về bảo mật hệ có agent AI. Chúng em cố ý không để agent AI quyết định: AI chỉ đọc, quyền ghi trạng thái
thuế nằm trong bộ quy tắc tất định. Bốn trụ. Định danh: khi máy tự duyệt, nhật ký ghi tên SYSTEM_REFEREE kèm hash
của policy và hash dữ liệu, máy không mượn danh người nhập. Đặc quyền tối thiểu: quyền kiểm ở máy chủ, kế toán trưởng
sửa ca 330 triệu xuống 198 triệu thì ca vẫn phải chờ giám đốc tài chính. Ranh giới thực thi tất định: agent đọc ảnh chỉ
được khai mười bốn trường nhìn thấy; nếu nó tự khai thêm "đã có ủy nhiệm chi" thì trường đó bị loại và ca phải hỏi người.
Cách ly: mỗi phiên một cơ sở dữ liệu riêng, nhật ký bị sửa là bị phát hiện. Các phép thử cho bốn trụ chạy ngay trên bản
đang deploy ở trang /trust. Giới hạn nói thẳng: định danh trong demo là vai trò mô phỏng, và trình đọc PDF chưa nằm
trong container riêng.""")
    pillars = [("Định danh", "Máy tự duyệt thì nhật ký ghi tên máy, không mượn danh người nhập."),
               ("Đặc quyền tối thiểu", "Quyền kiểm ở máy chủ. KTT sửa ca 330 triệu xuống 198 triệu vẫn phải chờ CFO."),
               ("Ranh giới thực thi tất định", "AI đọc ảnh chỉ khai 14 trường. Khai thêm “đã có ủy nhiệm chi” là bị loại, phải hỏi người."),
               ("Cách ly", "Mỗi phiên một cơ sở dữ liệu riêng. Nhật ký bị sửa là bị phát hiện.")]
    for i, (t, b) in enumerate(pillars):
        x = 0.5 + (i % 2) * 2.85
        y = 1.25 + (i // 2) * 1.62
        box(s, x, y, 2.7, 1.47, fill=LIGHT, radius=0.06)
        text(s, x + 0.15, y + 0.12, 2.4, 0.3, t, size=13.5, bold=True, color=NAVY)
        text(s, x + 0.15, y + 0.48, 2.4, 0.95, b, size=11.5, color=SLATE)
    text(s, 0.5, 4.55, 5.55, 0.45, "Giới hạn nói thẳng: vai trò trong demo là mô phỏng; trình đọc PDF chưa chạy trong container riêng.",
         size=11, color=MUTED, italic=True)
    d.screen(s, "trust", "Trang /trust", 6.3, 1.25, 3.2, 1.8)
    text(s, 6.3, 3.2, 3.2, 1.3, [P("Trang /trust", bold=True, color=NAVY, size=13, after=3),
                                 P("Các phép thử cho bốn trụ chạy ngay trên bản đang chạy, ai cũng bấm xem được.")],
         size=12, color=SLATE)

    # 10 ─ Riêng tư và nghị định
    s = d.slide(kicker="RIÊNG TƯ VÀ PHÁP LÝ", title="Dữ liệu đi đâu, luật nào áp dụng", notes="""
Về riêng tư. Nội dung file XML do máy đọc tất định, không gửi cho AI; riêng tên và mã số thuế người bán có thể được gửi đi
tra cứu qua dịch vụ tra cứu bên thứ ba và công cụ tìm kiếm giới hạn nguồn .gov.vn. Ảnh chụp thì AI chỉ được trả về mười bốn trường nhìn thấy, khai thêm là bị
loại. Đường quyết định không gọi AI, nên có thể chạy chế độ không AI: chỉ nhận XML và nhập tay. Mỗi phiên một cơ sở dữ liệu
riêng, nhật ký chỉ ghi thêm. Về luật dữ liệu cá nhân, chúng em đối chiếu Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15 và
Nghị định 356/2025/NĐ-CP qua nguồn thứ cấp, nên không trích số điều. Lên production phải có hợp đồng xử lý dữ liệu với
nhà cung cấp AI, hoặc chạy chế độ chỉ XML. Về thuế, căn cứ được chọn theo ngày lập hóa đơn: hóa đơn trước 1 tháng 7 năm
2025 dùng Thông tư 219/2013; từ ngày đó dùng Luật Thuế giá trị gia tăng 48/2024 và Nghị định 181/2025.""")
    text(s, 0.5, 1.2, 4.3, 0.3, "Dữ liệu đi đâu", size=15, bold=True, color=NAVY)
    priv = [("Nội dung XML không gửi AI", "Máy đọc tất định. Tên, MST người bán có thể tra qua bên thứ ba và .gov.vn."),
            ("Ảnh: AI chỉ trả 14 trường", "Trường thấy trên chứng từ. Khai thêm là bị loại."),
            ("Quyết định không cần AI", "Đường quyết định không gọi AI, nên chạy được chỉ với XML và nhập tay."),
            ("Mỗi phiên tách riêng", "Một cơ sở dữ liệu riêng mỗi phiên, nhật ký chỉ ghi thêm.")]
    for i, (t, b) in enumerate(priv):
        y = 1.6 + i * 0.84
        circle(s, 0.5, y + 0.04, 0.36, "✓", fill=LIME_DEEP, size=12)
        text(s, 1.0, y, 3.8, 0.3, t, size=13.5, bold=True, color=NAVY)
        text(s, 1.0, y + 0.3, 3.8, 0.5, b, size=11.5, color=SLATE)
    box(s, 5.15, 1.2, 4.35, 1.75, fill=LIGHT, radius=0.05, pad=0.16, anchor=MSO_ANCHOR.TOP,
        paras=[P(R("Thuế: căn cứ theo NGÀY LẬP hóa đơn", bold=True, color=NAVY, size=13.5), after=6),
               P(R("Trước 01/7/2025: ", bold=True), "Thông tư 219/2013/TT-BTC.", after=4),
               P(R("Từ 01/7/2025: ", bold=True), "Luật Thuế GTGT 48/2024/QH15, Nghị định 181/2025/NĐ-CP.")],
        size=12, color=SLATE)
    box(s, 5.15, 3.1, 4.35, 1.85, fill=AMBER_TINT, radius=0.05, pad=0.16, anchor=MSO_ANCHOR.TOP,
        paras=[P(R("Dữ liệu cá nhân", bold=True, color=NAVY, size=13.5), after=6),
               P("Luật Bảo vệ dữ liệu cá nhân 91/2025/QH15 và Nghị định 356/2025/NĐ-CP: đã đối chiếu qua nguồn thứ cấp, chưa trích số điều.", after=4),
               P(R("Lên production: ", bold=True), "hợp đồng xử lý dữ liệu với nhà cung cấp AI, hoặc chỉ chạy XML.")],
        size=12, color=SLATE)

    # 11 ─ Video demo
    s = d.slide(dark=True, kicker="DEMO", title="Xem Tax Referee chạy trong 1 phút", notes="""
Mời ban giám khảo xem video demo khoảng một phút rưỡi: tạo lô, xem phiếu giải trình, trả lời nhóm câu hỏi, chốt lô, màn hình tổng quan,
lịch sử của tôi, rồi hóa đơn đến từ Gmail và Zalo. Nếu video không chạy, mở bản đang chạy ở địa chỉ dưới màn hình.
Cảm ơn ban giám khảo, chúng em sẵn sàng nhận câu hỏi.""")
    vw, vh = 6.66, 3.75
    vx, vy = (10 - vw) / 2, 1.15
    poster = screens / "batch.png"
    embedded = False
    if video is not None and video.is_file():
        try:
            mv = s.shapes.add_movie(str(video), Inches(vx), Inches(vy), Inches(vw), Inches(vh),
                                    poster_frame_image=str(poster) if poster.is_file() else None,
                                    mime_type="video/mp4")
            mv.name = "Video demo 1 phút"
            embedded = True
        except Exception as e:  # nhúng hỏng thì để ảnh bìa + đường dẫn
            print("Không nhúng được video:", e)
    if not embedded:
        if poster.is_file():
            s.shapes.add_picture(str(poster), Inches(vx), Inches(vy), Inches(vw), Inches(vh))
        text(s, vx, vy + vh - 0.4, vw, 0.3, P(f"Video: {video or 'docs/submission/video/Tax-Referee-demo-1-phut.mp4'}",
                                             align=PP_ALIGN.CENTER), size=11, color=WHITE, bold=True)
    d.video_embedded = embedded
    text(s, 0.5, 4.95, 9.0, 0.22, P(LIVE, align=PP_ALIGN.CENTER), size=10, color=LIME)

    out.parent.mkdir(parents=True, exist_ok=True)
    d.prs.save(str(out))
    return d


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--screens", type=Path, default=ROOT / "docs" / "submission" / "screens")
    ap.add_argument("--out", type=Path, default=ROOT / "docs" / "submission" / "Tax-Referee-trinh-bay-cai-tien-17-10.pptx")
    ap.add_argument("--video", type=Path, default=ROOT / "docs" / "submission" / "video" / "Tax-Referee-demo-1-phut.mp4",
                    help="video demo nhúng vào slide cuối; thay file cùng đường dẫn rồi chạy lại")
    ap.add_argument("--diagram", type=Path, default=ROOT / "docs" / "diagrams" / "kien-truc-cai-tien.png")
    a = ap.parse_args()
    try:
        import sys
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    d = build(a.screens, a.out, a.video, a.diagram)
    print(f"Đã ghi {a.out} · {d.n} slide")
    print("Ảnh đã chèn: " + (", ".join(d.inserted) or "không có"))
    print("Khung chờ: " + (", ".join(d.placeholders) or "không có"))
    print("Video nhúng: " + ("có" if getattr(d, "video_embedded", False) else "không"))


if __name__ == "__main__":
    os.environ.setdefault("PYTHONIOENCODING", "utf-8")
    main()
