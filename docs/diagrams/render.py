"""Dựng sơ đồ Mermaid (docs/diagrams/src/*.mmd) thành PNG độ phân giải cao bằng Chromium (Playwright).
Chạy: python docs/diagrams/render.py  → docs/diagrams/*.png
Chỉ dựng vài sơ đồ: python docs/diagrams/render.py kien-truc-cai-tien"""
import json, os, pathlib, sys
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding='utf-8')
HERE = pathlib.Path(__file__).resolve().parent
THEME = {
    'theme': 'base', 'state': {'useMaxWidth': False}, 'flowchart': {'useMaxWidth': False, 'curve': 'basis', 'htmlLabels': True, 'nodeSpacing': 38, 'rankSpacing': 48, 'padding': 14},
    'sequence': {'useMaxWidth': False, 'mirrorActors': False, 'messageFontSize': 15, 'actorFontSize': 15, 'noteFontSize': 14},
    'themeVariables': {
        'fontFamily': 'Segoe UI, Arial, sans-serif', 'fontSize': '16px',
        'primaryColor': '#f4f8ec', 'primaryBorderColor': '#0f2a1d', 'primaryTextColor': '#0f2a1d',
        'lineColor': '#3b5243', 'secondaryColor': '#eef5dc', 'tertiaryColor': '#ffffff',
        'clusterBkg': '#fbfcf7', 'clusterBorder': '#b9c9a8', 'edgeLabelBackground': '#ffffff',
        'actorBkg': '#eef5dc', 'actorTextColor': '#0f2a1d', 'actorBorder': '#0f2a1d', 'actorLineColor': '#3b5243', 'labelTextColor': '#0f2a1d', 'loopTextColor': '#0f2a1d', 'labelBoxBorderColor': '#3b5243', 'noteBkgColor': '#fff8db', 'noteBorderColor': '#c9a227',
        'activationBkgColor': '#e3f1d0', 'signalColor': '#2f4a38', 'signalTextColor': '#0f2a1d', 'labelBoxBkgColor': '#eef5dc',
    },
}
PAGE = """<!doctype html><html><head><meta charset='utf-8'>
<script src='https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js'></script>
<style>body{margin:0;background:#fff;font-family:'Segoe UI',sans-serif} #c{display:inline-block;padding:18px 22px}</style></head>
<body><div id='c'><pre class='mermaid'>%s</pre></div>
<script>mermaid.initialize(Object.assign({startOnLoad:false}, %s)); mermaid.run({querySelector:'.mermaid'}).then(()=>{window.__done=true}).catch(e=>{window.__err=String(e)});</script></body></html>"""

# Mạng chậm: đặt MERMAID_JS=<đường dẫn mermaid.min.js cục bộ> để nhúng thẳng thay cho CDN
_local = os.environ.get('MERMAID_JS')
if _local and pathlib.Path(_local).is_file():
    PAGE = PAGE.replace("<script src='https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js'></script>",
                        '<script>' + pathlib.Path(_local).read_text(encoding='utf-8').replace('%', '%%') + '</script>')

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={'width': 2400, 'height': 1600}, device_scale_factor=2)
    only = set(sys.argv[1:])
    for src in sorted((HERE / 'src').glob('*.mmd')):
        if only and src.stem not in only:
            continue
        code = src.read_text(encoding='utf-8').replace('&', '&amp;').replace('<br/>', '&lt;br/&gt;')
        theme = json.loads(json.dumps(THEME))
        if src.stem.startswith(('s', 'kien-truc')):  # bản rút gọn cho slide: chữ lớn hơn
            theme['themeVariables']['fontSize'] = '22px'
        pg.set_content(PAGE % (code, json.dumps(theme)), wait_until='load')
        pg.wait_for_function('window.__done || window.__err', timeout=30000)
        err = pg.evaluate('window.__err || null')
        if err: print('LỖI', src.name, err); continue
        out = HERE / (src.stem + '.png')
        pg.locator('#c').screenshot(path=str(out))
        box = pg.locator('#c').bounding_box()
        print(f'{out.name}: {int(box["width"])}×{int(box["height"])} px (×2)')
    b.close()
