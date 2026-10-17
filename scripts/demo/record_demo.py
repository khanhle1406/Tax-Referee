"""Quay video demo (~1 phút) và chụp ảnh màn hình cho slide, trên bản build chạy LOCAL.

Luồng: Kế toán viên tải lô 25 hóa đơn (dữ liệu tổng hợp) → phiếu giải trình → Kế toán trưởng trả lời chung một nhóm
→ chốt lô → Tổng quan cho sếp → Lịch sử của tôi → Hộp thư vào (Gmail/Zalo) → /trust 12 phép thử.

Chạy (server standalone đang chạy ở --base):
  python scripts/demo/record_demo.py --base http://127.0.0.1:3060
Kết quả: docs/submission/screens/*.png và docs/submission/video/demo-raw.webm (có phụ đề trên màn hình).
"""
from __future__ import annotations

import argparse
import glob
import os
import shutil
import sys
import time

from playwright.sync_api import Page, sync_playwright

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', '..'))
SCREENS = os.path.join(ROOT, 'docs', 'submission', 'screens')
VIDEO_DIR = os.path.join(ROOT, 'docs', 'submission', 'video')
DATA = os.path.join(ROOT, 'data', 'demo-batch')


def caption(page: Page, text: str, hold: float = 2.2) -> None:
    """Phụ đề lớn ở cuối màn hình — người xem video hiểu được cả khi tắt tiếng."""
    page.evaluate("""(t) => {
      let el = document.getElementById('demo-caption');
      if (!el) { el = document.createElement('div'); el.id = 'demo-caption';
        Object.assign(el.style, { position: 'fixed', left: '50%', bottom: '24px', transform: 'translateX(-50%)', zIndex: 99999,
          background: 'rgba(15,23,42,.92)', color: '#fff', padding: '12px 20px', borderRadius: '12px', font: '600 20px system-ui, sans-serif',
          maxWidth: '88%', textAlign: 'center', boxShadow: '0 8px 24px rgba(0,0,0,.25)' });
        document.body.appendChild(el); }
      el.textContent = t; }""", text)
    time.sleep(hold)


def shot(page: Page, name: str) -> None:
    os.makedirs(SCREENS, exist_ok=True)
    page.evaluate("document.getElementById('demo-caption')?.remove()")
    page.screenshot(path=os.path.join(SCREENS, f'{name}.png'))
    print('ảnh', name, flush=True)


def switch_role(page: Page, role: str) -> None:
    page.select_option('#workspace-role', role)
    page.wait_for_timeout(1500)


def main() -> None:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', default='http://127.0.0.1:3060')
    ap.add_argument('--headed', action='store_true')
    args = ap.parse_args()
    files = sorted(glob.glob(os.path.join(DATA, '*.xml')))
    os.makedirs(VIDEO_DIR, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=not args.headed)
        ctx = browser.new_context(viewport={'width': 1366, 'height': 768}, record_video_dir=VIDEO_DIR, record_video_size={'width': 1366, 'height': 768}, locale='vi-VN')
        page = ctx.new_page()
        page.on('dialog', lambda d: d.accept())
        page.set_default_timeout(120_000)

        page.goto(args.base + '/')
        caption(page, 'Tax Referee — máy kiểm hóa đơn, người giữ quyền ký', 2.5)
        page.select_option('#demo-role', 'ACCOUNTANT')
        page.get_by_role('button', name='② Mở hộp chuyển tiếp — demo riêng').click()
        page.wait_for_url('**/workspace/**')

        page.goto(args.base + '/workspace/batches')
        caption(page, 'Cuối tháng: kế toán tải một lô 25 hóa đơn (dữ liệu tổng hợp)', 2.5)
        page.set_input_files('input[type=file]', files)
        page.wait_for_selector('text=Chốt lô', timeout=240_000) if False else page.wait_for_selector('section[aria-label^="Lô "]', timeout=240_000)
        page.wait_for_timeout(1500)
        caption(page, 'Máy đọc hết, xếp theo MST → ngày → số rồi kiểm từng tờ: tờ ổn được đề xuất duyệt, tờ có vấn đề hỏi đúng người', 3.5)
        shot(page, 'batch')

        page.get_by_text('HĐ 0000107').first.click()
        page.wait_for_timeout(800)
        page.get_by_text('HĐ 0000107').first.scroll_into_view_if_needed()
        caption(page, 'Vì sao máy đề xuất duyệt? Mỗi điều kiện đạt kèm số — kể cả hóa đơn hai thuế suất 8% và 10%', 3.2)
        shot(page, 'explain')

        switch_role(page, 'CHIEF_ACCOUNTANT')
        page.goto(args.base + '/workspace/batches')
        page.locator('section[aria-label="Danh sách lô"] button').first.click()
        page.wait_for_selector('text=Trả lời chung', timeout=60_000)
        caption(page, 'Kế toán trưởng: 3 hóa đơn cùng câu hỏi "đã có ủy nhiệm chi chưa?" — trả lời một lần, mỗi tờ vẫn ghi nhật ký riêng', 3.2)
        card = page.locator('div', has_text='ủy nhiệm chi').filter(has=page.get_by_role('button', name='Áp dụng cho 3 hóa đơn')).last
        card.get_by_text('A:', exact=False).first.click()
        card.get_by_placeholder('Lý do (ít nhất 8 ký tự)').fill('Đã đối chiếu ủy nhiệm chi trên sao kê ngân hàng')
        card.get_by_role('button', name='Áp dụng cho 3 hóa đơn').click()
        page.wait_for_timeout(2500)

        caption(page, 'Không để máy tự ghi sổ: Kế toán trưởng xem tổng hợp rồi ký chốt lô', 2.6)
        page.get_by_placeholder('Ghi chú khi chốt (ít nhất 8 ký tự)').fill('Chốt lô cuối tháng 10 sau khi xem phiếu giải trình')
        page.get_by_role('button', name='Chốt ').last.click()
        page.wait_for_timeout(2500)

        page.goto(args.base + '/workspace/dashboard')
        page.wait_for_timeout(2500)
        caption(page, 'Sếp nhìn một màn hình: bao nhiêu hóa đơn máy xử lý, bao nhiêu người duyệt, VAT nào đang chờ ai', 3.5)
        shot(page, 'dashboard')

        page.goto(args.base + '/workspace/history')
        page.wait_for_timeout(2000)
        caption(page, 'Ai cũng xem lại được lịch sử duyệt của chính mình', 2.6)
        shot(page, 'history')

        page.goto(args.base + '/workspace/channels')
        page.wait_for_timeout(2000)
        caption(page, 'Hóa đơn gửi qua Gmail, Zalo: biết ai gửi; email không qua xác thực SPF/DKIM thì không được tin là nhân viên', 3.5)
        shot(page, 'channels')

        page.goto(args.base + '/trust')
        caption(page, 'Bảo mật chứng minh bằng 12 phép thử chạy trên chính bản đang chạy', 2.2)
        page.get_by_role('button', name='Chạy 12 phép thử tấn công').click()
        page.wait_for_selector('text=12/12', timeout=60_000)
        page.wait_for_timeout(1200)
        shot(page, 'trust')
        caption(page, 'Quy tắc quyết định. AI chỉ đọc. Con người chốt.', 2.5)

        video = page.video.path() if page.video else None
        ctx.close()
        browser.close()
        if video:
            target = os.path.join(VIDEO_DIR, 'demo-raw.webm')
            shutil.move(video, target)
            print('video', target, flush=True)


if __name__ == '__main__':
    main()
