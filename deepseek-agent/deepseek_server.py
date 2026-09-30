from fastapi import FastAPI, HTTPException, BackgroundTasks, Request
from pydantic import BaseModel
from patchright.async_api import async_playwright
from typing import Any
from contextlib import asynccontextmanager
import os
import asyncio
import time
import random
import uuid
import json
import re
import base64
import tempfile
import mimetypes
import urllib.request
import trafilatura

# Cấu hình
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
AUTH_FILE = os.path.join(SCRIPT_DIR, "deepseek_auth.json")

# --- XỬ LÝ HÌNH ẢNH / MULTIMODAL ---
def process_image_input(img_data: str) -> str | None:
    """
    Nhận chuỗi image (base64, data-uri, URL, hoặc đường dẫn file) và lưu ra file tạm.
    Trả về đường dẫn file tạm hợp lệ.
    """
    try:
        if not isinstance(img_data, str):
            return None
            
        # 1. Nếu là data URI: data:image/png;base64,...
        if img_data.startswith("data:image/") and ";base64," in img_data:
            header, b64 = img_data.split(";base64,", 1)
            mime_type = header.split("data:image/")[1]
            ext = "." + mime_type.split("+")[0].split(";")[0]
            if ext not in [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]:
                ext = ".png"
            raw_bytes = base64.b64decode(b64)
            temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
            temp_file.write(raw_bytes)
            temp_file.close()
            return temp_file.name

        # 2. Nếu là đường dẫn file cục bộ
        if os.path.exists(img_data) and os.path.isfile(img_data):
            return img_data

        # 3. Nếu là HTTP / HTTPS URL
        if img_data.startswith("http://") or img_data.startswith("https://"):
            headers = {"User-Agent": "Mozilla/5.0"}
            req = urllib.request.Request(img_data, headers=headers)
            with urllib.request.urlopen(req, timeout=15) as resp:
                content_type = resp.headers.get("Content-Type", "")
                ext = mimetypes.guess_extension(content_type) or ".png"
                temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
                temp_file.write(resp.read())
                temp_file.close()
                return temp_file.name

        # 4. Nếu là raw base64 (dài > 100 ký tự)
        if len(img_data) > 100:
            try:
                raw_bytes = base64.b64decode(img_data)
                temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".png")
                temp_file.write(raw_bytes)
                temp_file.close()
                return temp_file.name
            except Exception:
                pass
    except Exception as e:
        print(f"[Image Processing Error]: {e}")
    return None

def extract_text_and_images_from_content(content: Any) -> tuple[str, list[str]]:
    """
    Trích xuất text và danh sách đường dẫn ảnh từ content (string, list dict OpenAI/Anthropic format).
    """
    text_parts = []
    image_paths = []

    if isinstance(content, str):
        text_parts.append(content)
    elif isinstance(content, list):
        for item in content:
            if isinstance(item, str):
                text_parts.append(item)
            elif isinstance(item, dict):
                item_type = item.get("type", "")
                # OpenAI format: {"type": "text", "text": "..."}
                if item_type == "text" and "text" in item:
                    text_parts.append(item["text"])
                # OpenAI format: {"type": "image_url", "image_url": {"url": "..."}}
                elif item_type == "image_url":
                    img_url = item.get("image_url", {})
                    url_val = img_url.get("url") if isinstance(img_url, dict) else img_url
                    if url_val:
                        p = process_image_input(url_val)
                        if p:
                            image_paths.append(p)
                # Anthropic format: {"type": "image", "source": {"type": "base64", "media_type": "...", "data": "..."}}
                elif item_type == "image":
                    source = item.get("source", {})
                    if isinstance(source, dict) and source.get("type") == "base64":
                        data_val = source.get("data", "")
                        media_type = source.get("media_type", "image/png")
                        data_uri = f"data:{media_type};base64,{data_val}"
                        p = process_image_input(data_uri)
                        if p:
                            image_paths.append(p)
                # Generic image format: {"type": "image", "image": "..."} or {"image": "..."}
                elif "image" in item:
                    p = process_image_input(item["image"])
                    if p:
                        image_paths.append(p)
    return "\n".join(text_parts).strip(), image_paths

class Session:
    def __init__(self, page):
        self.page = page
        self.lock = asyncio.Lock()
        self.last_active = time.time()

class State:
    browser = None
    context = None
    page = None  # Page mặc định
    sessions = {}  # session_id -> Session object
    current_session_id = "default"
    lock = asyncio.Lock()  # Lock toàn cục quản lý danh sách session
    is_shutting_down = False

from fastapi.exceptions import RequestValidationError
from fastapi.responses import Response, JSONResponse
from fastapi.middleware.cors import CORSMiddleware

state = State()
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

LOG_FILE = os.path.join(SCRIPT_DIR, "deepseek_server.log")

@app.middleware("http")
async def custom_cors_and_pna_middleware(request: Request, call_next):
    origin = request.headers.get("origin") or "*"
    if request.method == "OPTIONS":
        res = Response(status_code=200)
        res.headers["Access-Control-Allow-Origin"] = origin
        res.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH"
        res.headers["Access-Control-Allow-Headers"] = "*"
        res.headers["Access-Control-Allow-Private-Network"] = "true"
        res.headers["Access-Control-Allow-Credentials"] = "true"
        return res

    body_str = ""
    if request.method == "POST":
        try:
            body_bytes = await request.body()
            body_str = body_bytes.decode("utf-8")
            async def receive():
                return {"type": "http.request", "body": body_bytes, "more_body": False}
            request._receive = receive
        except Exception:
            pass

    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(f"\n[API Request]: {request.method} {request.url.path}\nBody: {body_str}\n")

    response = await call_next(request)
    response.headers["Access-Control-Allow-Origin"] = origin
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH"
    response.headers["Access-Control-Allow-Headers"] = "*"
    response.headers["Access-Control-Allow-Private-Network"] = "true"
    response.headers["Access-Control-Allow-Credentials"] = "true"
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(f"[API Response Status]: {response.status_code} for {request.url.path}\n")
    return response



@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    print("[Validation Error] Payload validation failed:")
    print(exc.errors())
    try:
        body = await request.json()
        print("Received payload:", body)
    except Exception:
        try:
            body = await request.body()
            print("Received raw body:", body.decode())
        except Exception:
            pass
    return JSONResponse(status_code=422, content={"detail": exc.errors()})

# --- CÁC MÔ HÌNH DỮ LIỆU ĐỊNH DẠNG OPENAI ---
class ChatMessage(BaseModel):
    role: str
    content: Any = ""
    tool_calls: list[Any] | None = None
    tool_call_id: str | None = None
    name: str | None = None

class ChatCompletionRequest(BaseModel):
    model: str = "deepseek-chat"
    messages: list[Any]
    temperature: float | None = 1.0
    stream: bool | None = False
    session_id: str | None = None
    user: str | None = None
    tools: list[Any] | None = None  # Hỗ trợ thuộc tính user chuẩn của OpenAI như session_id

class Choice(BaseModel):
    index: int
    message: ChatMessage
    finish_reason: str = "stop"

class Usage(BaseModel):
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0

class ChatCompletionResponse(BaseModel):
    id: str
    object: str = "chat.completion"
    created: int
    model: str
    choices: list[Choice]
    usage: Usage

# --- CÁC MÔ HÌNH DỮ LIỆU ĐỊNH DẠNG ANTHROPIC ---
class AnthropicMessageItem(BaseModel):
    role: str
    content: Any  # Hỗ trợ cả chuỗi và danh sách block

class AnthropicMessagesRequest(BaseModel):
    model: str
    messages: list[AnthropicMessageItem]
    system: Any = None
    tools: Any = None
    tool_choice: Any = None
    max_tokens: int | None = 1024
    temperature: float | None = 1.0
    stream: bool | None = False
    session_id: str | None = None

class AnthropicUsage(BaseModel):
    input_tokens: int = 0
    output_tokens: int = 0

class AnthropicContentBlock(BaseModel):
    type: str = "text"
    text: str

class AnthropicMessagesResponse(BaseModel):
    id: str
    type: str = "message"
    role: str = "assistant"
    content: list[Any]
    model: str
    stop_reason: str = "end_turn"
    stop_sequence: str | None = None
    usage: AnthropicUsage

# --- YÊU CẦU MỚI CHO SỰ TƯƠNG THÍCH VỚI /ASK ---
class ChatRequest(BaseModel):
    prompt: str | None = None
    messages: list[Any] | None = None
    images: list[str] | None = None  # Danh sách file paths, URLs, hoặc Base64 strings
    session_id: str | None = "default"

class ResetRequest(BaseModel):
    session_id: str = "default"


# --- CÁC HÀM MÔ PHỎNG NGƯỜI DÙNG ---
async def human_delay(min_ms=400, max_ms=1000):
    await asyncio.sleep(random.uniform(min_ms, max_ms) / 1000)

async def human_click(page, locator_or_selector):
    if isinstance(locator_or_selector, str):
        loc = page.locator(locator_or_selector).first
    else:
        loc = locator_or_selector

    try:
        box = await loc.bounding_box()
        if box:
            target_x = box['x'] + box['width'] / 2 + random.uniform(-5, 5)
            target_y = box['y'] + box['height'] / 2 + random.uniform(-5, 5)
            await page.mouse.move(target_x, target_y)
            await human_delay(200, 400)
            await page.mouse.click(target_x, target_y)
    except:
        pass

async def perform_login(page, context):
    print("Yêu cầu đăng nhập...")
    if os.path.exists(AUTH_FILE):
        try:
            os.remove(AUTH_FILE)
        except:
            pass
    
    # Nhấn "Log In" nếu có
    login_btn = page.locator("text=Log In").first
    if await login_btn.is_visible():
        await human_click(page, login_btn)
        await human_delay(1500, 2500)
        
    # Chọn Password Login nếu có
    password_tab = page.get_by_text("Password Login").first
    if await password_tab.is_visible():
        await human_click(page, password_tab)
        await human_delay(400, 1000)

    # Nhập Email
    email_field = page.locator("input[placeholder*='phone'], input[placeholder*='email'], input[type='text'], input[type='email']").first
    await email_field.wait_for(state="visible", timeout=10000)
    await human_click(page, email_field)
    await human_typing(page, "dienthongminhsaithanh.social@gmail.com")
    
    # Nhập Password
    password_field = page.locator("input[placeholder*='password'], input[type='password']").first
    await human_click(page, password_field)
    await human_typing(page, "Jd3;(Gzdjr=8xxE")
    
    # Đồng ý điều khoản
    agree_checkbox = page.locator(".ds-checkbox, input[type='checkbox']").first
    if await agree_checkbox.is_visible():
        await human_click(page, agree_checkbox)
    
    # Nhấn Login
    login_submit = page.locator("button:has-text('Log In'), .ds-button--primary").first
    await human_click(page, login_submit)
    
    print("Vui lòng GIẢI CAPTCHA THỦ CÔNG trên trình duyệt nếu có hiển thị...")
    # Chờ cho textarea xuất hiện
    await page.wait_for_selector("textarea", timeout=120000)
    
    # Lưu session
    await context.storage_state(path=AUTH_FILE)
    print("Đăng nhập thành công và đã lưu session.")

async def human_typing(page, text):
    for char in text:
        await page.keyboard.type(char, delay=random.randint(20, 60))
        if random.random() < 0.03:
            await asyncio.sleep(random.uniform(0.1, 0.2))

# --- LOGIC LẤY DỮ LIỆU ---
async def get_latest_ai_message(page, prompt: str):
    """Tìm phần tử AI message cuối cùng trên trang và lấy dưới dạng Markdown"""
    return await page.evaluate(r"""
        (promptText) => {
            // Chỉ tìm các phần tử markdown chứa nội dung thực tế của câu trả lời
            const mdElements = Array.from(document.querySelectorAll('.ds-markdown, [class*="ds-markdown"]'));
            
            let aiMessages = mdElements.filter(el => {
                const isUser = el.closest('.ds-message-item--user') || el.classList.contains('ds-message-item--user');
                const isPrompt = el.innerText.trim() === promptText.trim();
                return !isUser && !isPrompt && el.innerText.trim().length > 0;
            });
            
            if (aiMessages.length > 0) {
                const mdEl = aiMessages[aiMessages.length - 1];
                // Clone element để không làm ảnh hưởng giao diện hiển thị
                const clone = mdEl.cloneNode(true);
                
                // --- BẢN VÁ: Tính toán Thụt lề (Indentation) thông minh hơn ---
                clone.querySelectorAll('li').forEach(li => {
                    let prefix = '- ';
                    let parentElement = li.parentElement;
                    
                    // Phân biệt Numbering (OL) và Bullet (UL)
                    if (parentElement && parentElement.tagName.toUpperCase() === 'OL') {
                        const index = Array.from(parentElement.children).indexOf(li) + 1;
                        prefix = index + '. ';
                    }

                    // Tính cấp độ lồng (Depth)
                    let depth = 0;
                    let curr = parentElement;
                    while (curr) {
                        if (curr.tagName === 'UL' || curr.tagName === 'OL') {
                            depth++;
                        }
                        curr = curr.parentElement;
                        if (!curr || (curr.classList && curr.classList.contains('ds-markdown'))) {
                            break;
                        }
                    }
                    
                    // SỬA Ở ĐÂY: Mọi danh sách (depth >= 1) đều thụt vô lề. 
                    // Depth 1 thụt 2 space, Depth 2 thụt 4 space...
                    const indentSpaces = '  '.repeat(depth);
                    
                    // Chèn khoảng trắng và ký hiệu vào đầu thẻ <li>
                    li.prepend(document.createTextNode(indentSpaces + prefix));
                });

                // --- BẢN VÁ: Xử lý Table ---
                clone.querySelectorAll('table').forEach(table => {
                    let mdTable = '\n';
                    const rows = table.querySelectorAll('tr');
                    rows.forEach((row, index) => {
                        let rowString = '|';
                        const cells = row.querySelectorAll('th, td');
                        cells.forEach(cell => {
                            let cellText = (cell.textContent || '').replace(/\r?\n/g, ' ').trim();
                            rowString += ` ${cellText} |`;
                        });
                        mdTable += rowString + '\n';
                        
                        if (index === 0) {
                            let sepString = '|';
                            cells.forEach(() => {
                                sepString += '---|';
                            });
                            mdTable += sepString + '\n';
                        }
                    });
                    const textNode = document.createTextNode(mdTable + '\n');
                    table.parentNode.replaceChild(textNode, table);
                });

                // --- Xử lý khối Code block ---
                clone.querySelectorAll('.md-code-block').forEach(block => {
                    const pre = block.querySelector('pre');
                    if (pre) {
                        let lang = 'bash';
                        const banner = block.querySelector('.md-code-block-banner, [class*="banner"]');
                        if (banner) {
                            const spans = banner.querySelectorAll('span');
                            for (let s of spans) {
                                const text = s.innerText.trim().toLowerCase();
                                if (text && text !== 'copy' && text !== 'download') {
                                    lang = text;
                                    break;
                                }
                            }
                        }
                        const codeText = pre.textContent || "";
                        const textNode = document.createTextNode(`\n\`\`\`${lang}\n${codeText.trim()}\n\`\`\`\n`);
                        block.parentNode.replaceChild(textNode, block);
                    }
                });
                
                // Thêm clone vào body để browser tính toán layout/innerText chính xác
                clone.style.position = 'absolute';
                clone.style.opacity = '0';
                clone.style.width = '0px';
                clone.style.height = '0px';
                clone.style.overflow = 'hidden';
                clone.style.left = '-9999px';
                clone.style.top = '-9999px';
                document.body.appendChild(clone);
                let resultText = clone.innerText || "";
                document.body.removeChild(clone);
                
                return resultText.replace(/\n\s*\n/g, '\n\n').trim();
            }
            // Tuyệt đối không fallback sang latestEl.innerText vì có thể bắt nhầm khối tìm kiếm "Searching for..."
            return "";
        }
    """, prompt)

async def count_user_messages_on_page(page) -> int:
    """Đếm số tin nhắn của user hiện tại trên trang"""
    return await page.evaluate("""
        () => {
            const messages = document.querySelectorAll('.ds-message');
            let userCount = 0;
            messages.forEach(el => {
                const hasMarkdown = el.querySelector('.ds-markdown, [class*="markdown"]');
                if (!hasMarkdown) {
                    userCount++;
                }
            });
            return userCount;
        }
    """)

async def reset_chat(page):
    try:
        new_chat_btn = page.get_by_text("New chat").first
        if not await new_chat_btn.is_visible(timeout=1000):
            new_chat_btn = page.locator("div[role='button']:has-text('New chat'), div:has-text('New chat')").first
        if await new_chat_btn.is_visible(timeout=1000):
            await human_click(page, new_chat_btn)
            await asyncio.sleep(0.3)
            await page.locator("textarea").first.wait_for(state="visible", timeout=10000)
            return
    except Exception as e:
        print(f"Không thể click nút New Chat: {e}")
    
    print("Đang load lại trang để tạo chat mới...")
    await page.goto("https://chat.deepseek.com", wait_until="networkidle", timeout=30000)
    await page.locator("textarea").first.wait_for(state="visible", timeout=15000)
    await asyncio.sleep(0.5)

# --- QUẢN LÝ PHIÊN (SESSIONS) ---
async def get_or_create_session(session_id: str) -> Session:
    async with state.lock:
        # Tự động khôi phục Browser / Context nếu bị đóng đột ngột
        if not state.browser or not state.browser.is_connected() or not state.context:
            print("[Session Recovery] Browser/Context disconnected. Khởi động lại browser...")
            state.browser = await state.playwright.chromium.launch(
                headless=False,
                channel="chrome",
                args=[
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-blink-features=AutomationControlled",
                    "--disable-background-timer-throttling",
                    "--disable-backgrounding-occluded-windows",
                    "--disable-renderer-backgrounding"
                ]
            )
            state.context = await state.browser.new_context(
                user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                storage_state=AUTH_FILE if os.path.exists(AUTH_FILE) else None
            )
            state.browser.on("disconnected", lambda _: print("[Browser] Disconnected"))
            state.page = None
            state.sessions.clear()

        if not state.page or state.page.is_closed():
            state.page = await state.context.new_page()
            try:
                await state.page.goto("https://chat.deepseek.com", timeout=60000, wait_until="commit")
                await asyncio.sleep(0.5)
            except Exception as nav_err:
                print(f"[Session Warning] Goto deepseek.com: {nav_err}")
                
            try:
                is_login = await state.page.locator("text=Log In").first.is_visible(timeout=2000) or "login" in state.page.url
                if is_login:
                    await perform_login(state.page, state.context)
            except Exception:
                pass
                
        if session_id in state.sessions:
            sess = state.sessions[session_id]
            if sess.page and not sess.page.is_closed():
                return sess

        # Tạo session mới
        sess_page = state.page
        new_sess = Session(sess_page)
        state.sessions[session_id] = new_sess
        return new_sess

# --- THỰC THI GỬI TIN NHẮN ---
async def send_message_and_wait(page, prompt: str, image_paths: list[str] | None = None) -> str:
    # 1. Tải ảnh đính kèm lên khung chat nếu có
    if image_paths and len(image_paths) > 0:
        valid_paths = [p for p in image_paths if os.path.exists(p)]
        if valid_paths:
            print(f"[Vision] Đang tải lên {len(valid_paths)} ảnh vào DeepSeek chat...")
            file_input = page.locator("input[type='file']").first
            await file_input.wait_for(state="attached", timeout=10000)
            await file_input.set_input_files(valid_paths)
            
            # Đợi thumbnail attachment xuất hiện trong khung chat
            try:
                await page.locator("img._9f130b7, [class*='upload'], [class*='attachment'], [class*='preview']").first.wait_for(state="visible", timeout=10000)
                await asyncio.sleep(0.8)
            except Exception:
                await asyncio.sleep(1.5)
            print("[Vision] Ảnh đã được đính kèm vào khung chat thành công.")

    # 2. Đợi input sẵn sàng và điền prompt
    chat_input = page.locator("textarea").first
    await chat_input.wait_for(state="visible", timeout=15000)
    await chat_input.focus()
    await chat_input.fill(prompt if prompt else "Hãy phân tích hình ảnh đính kèm.")
    
    # Gửi prompt
    await chat_input.press("Enter")
    await asyncio.sleep(0.2)
    
    # Nếu textarea vẫn còn text (IME / Enter không ăn), click nút Send
    try:
        val = await chat_input.input_value()
        if val and len(val.strip()) > 0:
            send_btn = page.locator(".ds-button--circle:not(.ds-button--disabled)").first
            if await send_btn.is_visible(timeout=500):
                await human_click(page, send_btn)
    except Exception:
        pass
    
    # Đợi cho đến khi có phản hồi bắt đầu sinh hoặc tìm kiếm (tối đa 45s, polling nhanh 50ms)
    start_wait = time.time()
    connected = False
    while time.time() - start_wait < 45:
        is_generating = await page.evaluate("""
            () => {
                const btn = document.querySelector('.ds-button--primary.ds-button--circle, div[role="button"].ds-button--primary');
                if (btn) {
                    const path = btn.querySelector('svg path');
                    if (path) {
                        const d = path.getAttribute('d') || '';
                        if (!d.includes('V15.') && (d.includes('4.88') || d.includes('11.12') || d.includes('2H11.12'))) {
                            return true;
                        }
                    }
                }
                const stopBtn = document.querySelector('[aria-label*="Stop"], [title*="Stop"], .ds-stop-button');
                if (stopBtn) return true;
                const loadingIndicators = document.querySelectorAll('.ds-loading, .ds-spin');
                return loadingIndicators.length > 0;
            }
        """)
        current_text = await get_latest_ai_message(page, prompt)
        if is_generating or (current_text and len(current_text) > 0):
            connected = True
            break
        await asyncio.sleep(0.05)
        
    if not connected:
        raise HTTPException(status_code=504, detail="AI không phản hồi hoặc không bắt đầu sinh câu trả lời (Timeout 45s)")
        
    print("[API] Đã kết nối được với luồng phản hồi. Đang quan sát tiến trình sinh...")
    
    # Quan sát và chờ đến khi text trong .ds-markdown ổn định và kết thúc sinh
    try:
        response_text = await asyncio.wait_for(
            page.evaluate("""
                (promptText) => {
                    return new Promise((resolve) => {
                        const getLatestAIMarkdown = () => {
                            const mdElements = Array.from(document.querySelectorAll('.ds-markdown, [class*="ds-markdown"]'));
                            const valid = mdElements.filter(el => {
                                const isUser = el.closest('.ds-message-item--user') || el.classList.contains('ds-message-item--user');
                                const isPrompt = el.innerText.trim() === promptText.trim();
                                return !isUser && !isPrompt && el.innerText.trim().length > 0;
                            });
                            return valid.length > 0 ? valid[valid.length - 1] : null;
                        };

                        const isGenerating = () => {
                            const btn = document.querySelector('.ds-button--primary.ds-button--circle, div[role="button"].ds-button--primary');
                            if (btn) {
                                const path = btn.querySelector('svg path');
                                if (path) {
                                    const d = path.getAttribute('d') || '';
                                    if (!d.includes('V15.') && (d.includes('4.88') || d.includes('11.12') || d.includes('2H11.12'))) {
                                        return true;
                                    }
                                }
                            }
                            const stopBtn = document.querySelector('[aria-label*="Stop"], [title*="Stop"], .ds-stop-button');
                            if (stopBtn) return true;
                            const loadingIndicators = document.querySelectorAll('.ds-loading, .ds-spin');
                            return loadingIndicators.length > 0;
                        };

                        let lastText = "";
                        let stableCount = 0;
                        let observer = null;
                        let currentObserved = null;

                        const checkCompletion = () => {
                            const activeGenerating = isGenerating();
                            const mdEl = getLatestAIMarkdown();
                            const currentText = mdEl ? mdEl.innerText.trim() : "";
                            
                            // Điều kiện hoàn thành dứt điểm:
                            // 1. Phải có phần tử .ds-markdown với text câu trả lời > 0
                            // 2. Không còn nút Dừng / spinner sinh câu trả lời
                            // 3. Nội dung văn bản ổn định qua ít nhất 3 chu kỳ liên tiếp (>= 240ms)
                            if (!activeGenerating && currentText.length > 0 && currentText === lastText) {
                                stableCount++;
                                if (stableCount >= 3) {
                                    if (observer) observer.disconnect();
                                    clearInterval(intervalId);
                                    resolve(currentText);
                                    return;
                                }
                            } else {
                                stableCount = 0;
                            }
                            lastText = currentText;

                            // Đảm bảo observer luôn theo dõi element .ds-markdown mới nhất
                            if (mdEl && (!observer || currentObserved !== mdEl)) {
                                if (observer) observer.disconnect();
                                observer = new MutationObserver(() => {
                                    stableCount = 0;
                                });
                                observer.observe(mdEl, { childList: true, subtree: true, characterData: true });
                                currentObserved = mdEl;
                            }
                        };

                        const initialMd = getLatestAIMarkdown();
                        if (initialMd) {
                            observer = new MutationObserver(() => {
                                stableCount = 0;
                            });
                            observer.observe(initialMd, { childList: true, subtree: true, characterData: true });
                            currentObserved = initialMd;
                            lastText = initialMd.innerText.trim();
                        }

                        const intervalId = setInterval(checkCompletion, 80);
                    });
                }
            """, prompt),
            timeout=180
        )
        return await get_latest_ai_message(page, prompt)
    except Exception as e:
        # Fallback kiểm tra nếu tin nhắn AI đã hiển thị đầy đủ
        final_msg = await get_latest_ai_message(page, prompt)
        if final_msg and len(final_msg) > 0:
            return final_msg
        raise HTTPException(status_code=504, detail=f"Lỗi hoặc timeout chờ phản hồi: {e}")

# --- ĐỒNG BỘ TIN NHẮN & XỬ LÝ CHÍNH ---
async def get_last_user_message_on_page(page) -> str:
    """Lấy nội dung tin nhắn cuối cùng của user trên trang"""
    return await page.evaluate("""
        () => {
            const userMessages = [];
            document.querySelectorAll('.ds-message').forEach(el => {
                const hasMarkdown = el.querySelector('.ds-markdown, [class*="markdown"]');
                if (!hasMarkdown) {
                    userMessages.push(el.innerText.trim());
                }
            });
            return userMessages.length > 0 ? userMessages[userMessages.length - 1] : "";
        }
    """)

# --- ĐỒNG BỘ TIN NHẮN & XỬ LÝ CHÍNH ---
async def sync_and_get_response(session_id: str, session: Session, messages: list[ChatMessage], tools: list[Any] | None = None) -> str:
    # Lấy system prompt nếu có
    system_prompts = [m.content for m in messages if m.role == "system"]
    system_prefix = ""
    if system_prompts:
        system_prefix = f"[SYSTEM INSTRUCTION]\n{system_prompts[0]}\n\n[USER REQUEST]\n"

    user_msgs = [m for m in messages if m.role == "user"]
    if not user_msgs:
        raise HTTPException(status_code=400, detail="Danh sách tin nhắn cần chứa ít nhất một tin nhắn của 'user'")
        
    # Số lượng tin nhắn hiện tại trên trang
    num_present = await count_user_messages_on_page(session.page)
    
    # Tin nhắn user cuối cùng trong yêu cầu hiện tại
    raw_target_content = user_msgs[-1].content
    target_prompt, image_paths = extract_text_and_images_from_content(raw_target_content)
    
    # Lấy tin nhắn user cuối cùng đang hiển thị trên trang
    last_present_user = await get_last_user_message_on_page(session.page)
    
    # Chuẩn hóa khoảng trắng để so khớp chính xác
    def normalize_text(t: str) -> str:
        return "".join(t.split())
        
    # Trích xuất danh sách tên tool đang khả dụng để đính kèm reminder
    tool_names = []
    if tools:
        for t in tools:
            name = ""
            if isinstance(t, dict):
                name = t.get("name")
                if not name and t.get("type") == "function":
                    name = t.get("function", {}).get("name", "")
            elif hasattr(t, "name"):
                name = getattr(t, "name", "")
            if name:
                tool_names.append(name)

    reminder = ""
    if tool_names:
        reminder = f"\n\n(Reminder: You have access to these tools: {', '.join(tool_names)}. To call a tool, you MUST write a <tool_call name=\"tool_name\">{{\"parameter_name\": \"value\"}}</tool_call> XML tag.)"

    norm_last = normalize_text(last_present_user)
    norm_expected = normalize_text(system_prefix + target_prompt + reminder)
    norm_target_part = normalize_text(target_prompt + reminder)
    
    is_matched = (norm_last == norm_expected) or (norm_last.endswith(norm_target_part))
    
    # Nếu trang hiện tại đang có hội thoại cũ và đây là lượt đầu tiên của hội thoại mới -> reset trang.
    # Hoặc nếu số lượng tin nhắn trên trang hiện tại quá nhiều (>= 25) -> chủ động reset để tránh giới hạn context.
    need_reset = False
    if session_id != state.current_session_id:
        print(f"[Sync] Chuyển đổi session từ '{state.current_session_id}' sang '{session_id}'. Reset trang...")
        need_reset = True
        state.current_session_id = session_id
    elif session_id == "default" and len(user_msgs) == 1 and num_present > 0 and not is_matched:
        print("[Sync] Phát hiện bắt đầu hội thoại mới cho session default (prompt khác biệt)...")
        need_reset = True
    elif num_present >= 25:
        print(f"[Sync] Số lượng tin nhắn trên trang ({num_present}) đạt giới hạn an toàn. Thực hiện reset để giải phóng bộ nhớ...")
        need_reset = True

    if need_reset:
        print("[Sync] Đang reset trang DeepSeek...")
        await reset_chat(session.page)
        num_present = 0
        last_present_user = ""
        is_matched = False
        
        # Khôi phục ngữ cảnh gần nhất bằng cách gửi lại tin nhắn trước đó (nếu có)
        if len(user_msgs) > 1:
            prev_raw = user_msgs[-2].content
            prev_prompt, prev_images = extract_text_and_images_from_content(prev_raw)
            # Luôn gửi kèm system_prefix và reminder để đảm bảo AI có đầy đủ chỉ dẫn hệ thống và công cụ
            prev_prompt_to_send = system_prefix + prev_prompt + reminder
            print(f"[Sync] Đang gửi lại tin nhắn trước đó để khôi phục ngữ cảnh: {prev_prompt[:60]}...")
            await send_message_and_wait(session.page, prev_prompt_to_send, image_paths=prev_images)
            num_present = 1
        
    try:
        # Nếu tin nhắn cuối cùng trùng khớp và không có đính kèm ảnh -> lấy kết quả
        if is_matched and not image_paths:
            print("[Sync] Trang đã đồng bộ (phát hiện trùng khớp), lấy phản hồi mới nhất...")
            response_text = await get_latest_ai_message(session.page, target_prompt)
            if not response_text:
                print("[Sync] Cảnh báo: Không tìm thấy phản hồi, gửi lại...")
                prompt_to_send = system_prefix + target_prompt + reminder
                response_text = await send_message_and_wait(session.page, prompt_to_send, image_paths=image_paths)
        else:
            # Nếu tin nhắn khác biệt (hoặc có đính kèm ảnh) -> gửi ngay lập tức!
            img_log = f" (kèm {len(image_paths)} ảnh)" if image_paths else ""
            print(f"[Sync] Phát hiện prompt mới{img_log}, gửi lên trình duyệt: {target_prompt[:50]}...")
            # LUÔN prepended system_prefix để đảm bảo AI không bao giờ quên identity, harness và tool schemas
            prompt_to_send = system_prefix + target_prompt + reminder
            response_text = await send_message_and_wait(session.page, prompt_to_send, image_paths=image_paths)
            
        return response_text
    finally:
        for p in image_paths:
            if p.startswith(tempfile.gettempdir()) and os.path.exists(p):
                try:
                    os.remove(p)
                except Exception:
                    pass

async def process_chat_completions(session_id: str, messages: list[ChatMessage], model: str, tools: list[Any] | None = None) -> ChatCompletionResponse:
    session = await get_or_create_session(session_id)
    
    # Khóa theo từng session để tránh xung đột tab
    async with session.lock:
        try:
            response_text = await sync_and_get_response(session_id, session, messages, tools)
            
            # Trả về định dạng chuẩn của OpenAI
            return ChatCompletionResponse(
                id=f"chatcmpl-{uuid.uuid4()}",
                created=int(time.time()),
                model=model,
                choices=[
                    Choice(
                        index=0,
                        message=ChatMessage(role="assistant", content=response_text),
                        finish_reason="stop"
                    )
                ],
                usage=Usage(
                    prompt_tokens=len(str(messages)) // 4,
                    completion_tokens=len(response_text) // 4,
                    total_tokens=(len(str(messages)) + len(response_text)) // 4
                )
            )
        except Exception as e:
            print(f"[API Error] Lỗi xử lý session '{session_id}': {e}")
            raise HTTPException(status_code=504 if "Timeout" in str(e) else 500, detail=str(e))

# --- CÁC ĐƯỜNG DẪN API (ENDPOINTS) ---

def strip_ansi(text: str) -> str:
    ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
    return ansi_escape.sub('', text)

def extract_text_content(content) -> str:
    def _extract_raw(c) -> str:
        if isinstance(c, str):
            return c
        elif isinstance(c, list):
            texts = []
            for item in c:
                if isinstance(item, dict):
                    itype = item.get("type")
                    if itype == "text":
                        texts.append(item.get("text", ""))
                    elif itype == "tool_use":
                        texts.append(f"\n[Tool Call Request: {item.get('name')} (ID: {item.get('id')}) with parameters: {item.get('input')}]")
                    elif itype == "tool_result":
                        tool_result_content = item.get("content", "")
                        sub_text = _extract_raw(tool_result_content)
                        texts.append(f"\n[Tool Result (ID: {item.get('tool_use_id')}):\n{sub_text}\n]")
                elif isinstance(item, str):
                    texts.append(item)
            return "\n".join(texts)
        elif isinstance(c, dict):
            itype = c.get("type")
            if itype == "text":
                return c.get("text", "")
            elif itype == "tool_use":
                return f"\n[Tool Call Request: {c.get('name')} (ID: {c.get('id')}) with parameters: {c.get('input')}]"
            elif itype == "tool_result":
                tool_result_content = c.get("content", "")
                sub_text = _extract_raw(tool_result_content)
                return f"\n[Tool Result (ID: {c.get('tool_use_id')}):\n{sub_text}\n]"
        return ""
        
    return strip_ansi(_extract_raw(content))

def extract_msg_role(m) -> str:
    if hasattr(m, 'role'):
        return getattr(m, 'role', "") or ""
    if isinstance(m, dict):
        return m.get('role', "") or ""
    return ""

def extract_raw_msg_content(m) -> Any:
    if hasattr(m, 'content'):
        return getattr(m, 'content', "")
    if isinstance(m, dict):
        return m.get('content', "")
    return ""

def extract_msg_content(m) -> str:
    if hasattr(m, 'content'):
        return extract_text_content(getattr(m, 'content', ""))
    if isinstance(m, dict):
        return extract_text_content(m.get('content', ""))
    return ""

def extract_msg_tool_calls(m):
    if hasattr(m, 'tool_calls'):
        return getattr(m, 'tool_calls', None)
    if isinstance(m, dict):
        return m.get('tool_calls')
    return None

def extract_msg_tool_call_id(m):
    if hasattr(m, 'tool_call_id'):
        return getattr(m, 'tool_call_id', None)
    if isinstance(m, dict):
        return m.get('tool_call_id')
    return None

def extract_msg_name(m):
    if hasattr(m, 'name'):
        return getattr(m, 'name', None)
    if isinstance(m, dict):
        return m.get('name')
    return None

KNOWN_KEYS = {
    "file_path", "content", "instructions", "command", "description", "args", "query", "url", "text", "name",
    "offset", "limit", "old_text", "new_text", "filePath", "fileContent", "startLine", "endLine",
    "target_content", "replacement_content", "old_string", "new_string", "oldString", "newString",
    "prompt", "subagent_type", "model", "isolation", "run_in_background", "path"
}

def parse_json_flexible(args_str: str) -> dict:
    try:
        return json.loads(args_str)
    except Exception:
        pass
        
    cleaned = re.sub(r"^```json\s*", "", args_str)
    cleaned = re.sub(r"\s*```$", "", cleaned).strip()
    
    try:
        return json.loads(cleaned)
    except Exception:
        pass
        
    # Sửa các ký tự escape backslash không hợp lệ trong chuỗi JSON (ví dụ \ C -> \\ C)
    try:
        fixed_escapes = re.sub(r'\\(?![\\"/bfnrtu])', r'\\\\', cleaned)
        return json.loads(fixed_escapes)
    except Exception:
        pass
        
    # Loại bỏ ngoặc nhọn ngoài cùng
    s = cleaned.strip()
    if s.startswith('{') and s.endswith('}'):
        s = s[1:-1].strip()
        
    # Phát hiện các vị trí key top-level
    keys_found = []
    
    # Key đầu tiên
    m_first = re.match(r'^\s*"([a-zA-Z_0-9]+)"\s*:\s*', s)
    if m_first:
        keys_found.append((m_first.group(1), m_first.end()))
        
    # Các key tiếp theo (phân tách bằng dấu phẩy)
    pattern = re.compile(r',\s*"([a-zA-Z_0-9]+)"\s*:\s*')
    for m in pattern.finditer(s):
        key_name = m.group(1)
        if key_name in KNOWN_KEYS:
            keys_found.append((key_name, m.start(), m.end()))
            
    # Tính khoảng giá trị (intervals) cho từng key
    intervals = []
    if keys_found:
        first_key, first_end = keys_found[0]
        intervals.append({
            "key": first_key,
            "start_val": first_end,
            "end_val": len(s)
        })
        
        for i in range(1, len(keys_found)):
            key_name, m_start, m_end = keys_found[i]
            intervals[-1]["end_val"] = m_start
            intervals.append({
                "key": key_name,
                "start_val": m_end,
                "end_val": len(s)
            })
            
    # Trích xuất và giải mã giá trị của từng key
    result = {}
    for item in intervals:
        val_str = s[item["start_val"]:item["end_val"]].strip()
        # Loại bỏ dấu phẩy ở cuối nếu có (do phân tách trường trong JSON)
        if val_str.endswith(','):
            val_str = val_str[:-1].strip()
            
        # Loại bỏ dấu ngoặc kép bọc ngoài cùng nếu có
        if val_str.startswith('"') and val_str.endswith('"'):
            val_str = val_str[1:-1]
        elif val_str.startswith("'") and val_str.endswith("'"):
            val_str = val_str[1:-1]
            
        try:
            # Giải mã bằng json.loads dạng chuỗi để xử lý các ký tự escape (\n, \t, ...)
            val_decoded = json.loads(f'"{val_str}"')
        except Exception:
            # Khôi phục thủ công nếu giải mã JSON lỗi
            val_decoded = val_str.replace('\\"', '"').replace('\\n', '\n').replace('\\t', '\t').replace('\\r', '\r').replace('\\\\', '\\')
            
        result[item["key"]] = val_decoded
        
    if result:
        return result
    return {"raw_input": args_str}

def parse_tool_calls(text: str):
    tool_calls = []
    pattern = re.compile(r'<tool_call\s+name=["\']([^"\']+)["\']\s*>([\s\S]*?)<\/tool_call>', re.DOTALL)
    
    matches = list(pattern.finditer(text))
    clean_text = text
    
    for match in matches:
        name = match.group(1).strip()
        args_str = match.group(2).strip()
        args = parse_json_flexible(args_str)
                
        tool_calls.append({
            "type": "tool_use",
            "id": f"toolu_{uuid.uuid4().hex[:8]}",
            "name": name,
            "input": args
        })
        
    clean_text = pattern.sub("", clean_text).strip()
    return clean_text, tool_calls

@app.post("/v1/messages", response_model=AnthropicMessagesResponse)
@app.post("/messages", response_model=AnthropicMessagesResponse)
@app.post("/v1/v1/messages", response_model=AnthropicMessagesResponse)
async def anthropic_messages(request: AnthropicMessagesRequest, raw_request: Request):
    print(f"\n[API Headers]: {dict(raw_request.headers)}")
    roles_list = [extract_msg_role(m) for m in request.messages]
    last_msg_text = extract_msg_content(request.messages[-1]) if request.messages else ""
    print(f"[API Request]: model={request.model}, messages={len(request.messages)}, roles={roles_list}, last_msg_text={repr(last_msg_text)}, system_len={len(str(request.system))}\n")
    
    # Phát hiện và xử lý nhanh yêu cầu sinh tiêu đề (Title/Metadata request) từ Claude Code
    is_title_request = False
    system_text = ""
    if request.system:
        system_text = extract_text_content(request.system)
        
    last_msg = request.messages[-1] if request.messages else None
    last_text = extract_msg_content(last_msg) if last_msg else ""
    
    # Duyệt kiểm tra nội dung tin nhắn user
    for m in request.messages:
        if extract_msg_role(m) == "user":
            u_text = extract_msg_content(m)
            if "write the title" in u_text.lower() or "generate a title" in u_text.lower():
                is_title_request = True
                break
                
    if len(system_text) < 1000 and ("title" in system_text.lower() or "summarize" in system_text.lower() or "metadata" in system_text.lower()):
        is_title_request = True
    elif last_msg and extract_msg_role(last_msg) == "assistant" and ("\"title\"" in last_text or "{" in last_text):
        is_title_request = True
        
    if is_title_request:
        user_msgs = [m for m in request.messages if extract_msg_role(m) == "user"]
        first_prompt = extract_msg_content(user_msgs[0]) if user_msgs else "Claude Code Chat"
        # Lấy tối đa 5 từ đầu tiên của prompt làm tiêu đề
        words = first_prompt.strip().split()
        short_title = " ".join(words[:5])
        if len(words) > 5:
            short_title += "..."
        # Loại bỏ các ký tự có thể gây lỗi cú pháp chuỗi JSON
        short_title = short_title.replace('"', '\\"').replace('\n', ' ').strip()
        stubbed_response = json.dumps({"title": short_title}, ensure_ascii=False)
        
        print(f"[API] Phát hiện yêu cầu sinh tiêu đề. Trả về stubbed title ngay lập tức: {stubbed_response}")
        
        return AnthropicMessagesResponse(
            id=f"msg_{uuid.uuid4()}",
            model=request.model,
            content=[AnthropicContentBlock(type="text", text=stubbed_response)],
            usage=AnthropicUsage(
                input_tokens=10,
                output_tokens=10
            )
        )

    # Trích xuất nội dung tin nhắn và cấu trúc lại theo chuẩn OpenAI ChatMessage
    openai_messages = []
    
    # Tạo mô tả tools để tiêm vào system prompt để AI biết cách dùng
    tool_instructions = ""
    if request.tools:
        print(f"[API Tools]: {[t.get('name') for t in request.tools]}")
        tool_descriptions = []
        for t in request.tools:
            name = t.get("name", "")
            desc = t.get("description", "")
            schema = t.get("input_schema", {})
            tool_descriptions.append(json.dumps({
                "name": name,
                "description": desc,
                "input_schema": schema
            }, indent=2, ensure_ascii=False))
        
        tool_instructions = "\n\nIn this environment, you have access to a set of tools you can use to answer the user's question.\n\n"
        tool_instructions += "You can invoke one or more tools by writing a <tool_call> XML tag that has a name attribute, and optionally a JSON-formatted body containing the arguments. String and scalar parameters should be specified as is, while lists and objects should use JSON format. Note that spaces for string values are not stripped. The output is not expected to be valid XML and is parsed with regular expressions.\n\n"
        tool_instructions += "Here are the functions available in JSONSchema format:\n"
        tool_instructions += "\n\n".join(tool_descriptions)
        tool_instructions += """\n\nWhen you choose to call a tool, please use the following format:
<tool_call name="tool_name">
{ "parameter_name": "value" }
</tool_call>
"""

    # Lấy system prompt gốc
    system_text = ""
    if request.system:
        system_text = extract_text_content(request.system)
    
    # Gộp system prompt với hướng dẫn gọi tool
    full_system = system_text + tool_instructions
    if full_system:
        openai_messages.append(ChatMessage(role="system", content=full_system))
        
    for msg in request.messages:
        raw_c = extract_raw_msg_content(msg)
        openai_messages.append(ChatMessage(role=extract_msg_role(msg), content=raw_c))
        
    # Xác định session_id thông qua body hoặc mặc định "default"
    session_id = request.session_id or "default"
    openai_response = await process_chat_completions(session_id, openai_messages, request.model, request.tools)
    
    assistant_raw_text = openai_response.choices[0].message.content
    print(f"\n[API] Phản hồi thô từ DeepSeek:\n{assistant_raw_text}\n")
    
    # Phân tích cú pháp tool calls từ phản hồi của DeepSeek
    clean_text, tool_calls = parse_tool_calls(assistant_raw_text)
    print(f"[API] Phân tích xong. Clean text: {repr(clean_text)}, Tool calls: {tool_calls}\n")
    
    # Xây dựng danh sách content block trả về cho Anthropic SDK
    content_blocks = []
    if clean_text:
        content_blocks.append(AnthropicContentBlock(type="text", text=clean_text))
    for call in tool_calls:
        content_blocks.append(call)
        
    # Nếu cả text và tool_calls đều rỗng, trả về một block text trống tránh lỗi
    if not content_blocks:
        content_blocks.append(AnthropicContentBlock(type="text", text=assistant_raw_text))
        
    return AnthropicMessagesResponse(
        id=f"msg_{uuid.uuid4()}",
        model=request.model,
        content=content_blocks,
        usage=AnthropicUsage(
            input_tokens=openai_response.usage.prompt_tokens,
            output_tokens=openai_response.usage.completion_tokens
        )
    )

@app.get("/v1/models")
@app.get("/models")
@app.get("/v1/v1/models")
async def list_models():
    return {
        "data": [
            {
                "id": "claude-3-5-sonnet-20241022",
                "object": "model",
                "created": 1700000000,
                "owned_by": "anthropic"
            },
            {
                "id": "claude-3-5-sonnet",
                "object": "model",
                "created": 1700000000,
                "owned_by": "anthropic"
            },
            {
                "id": "claude-3-5-sonnet-latest",
                "object": "model",
                "created": 1700000000,
                "owned_by": "anthropic"
            },
            {
                "id": "deepseek-chat",
                "object": "model",
                "created": 1700000000,
                "owned_by": "deepseek"
            }
        ]
    }

@app.post("/v1/chat/completions", response_model=ChatCompletionResponse)
@app.post("/chat/completions", response_model=ChatCompletionResponse)
@app.post("/v1/v1/chat/completions", response_model=ChatCompletionResponse)
async def chat_completions(request: ChatCompletionRequest):
    # Phát hiện và xử lý nhanh yêu cầu sinh tiêu đề (Title request) từ client
    is_title_request = False
    system_text = ""
    for m in request.messages:
        r = extract_msg_role(m)
        c = extract_msg_content(m)
        if r == "system":
            system_text = c
        elif r == "user":
            if "generate a short title" in c.lower() or "generate a title" in c.lower():
                is_title_request = True
                
    if len(system_text) < 1000 and ("title" in system_text.lower() or "summarize" in system_text.lower()):
        is_title_request = True
        
    if is_title_request:
        user_msgs = [m for m in request.messages if extract_msg_role(m) == "user"]
        first_prompt = "Goose Chat"
        for m in user_msgs:
            u_text = extract_msg_content(m)
            if "---BEGIN USER MESSAGES---" in u_text:
                match = re.search(r"---BEGIN USER MESSAGES---\s*(.*?)\s*---END USER MESSAGES---", u_text, re.DOTALL)
                if match:
                    first_prompt = match.group(1)
                    break
            elif not u_text.strip().startswith("<turn-context>") and not "generate a short title" in u_text.lower():
                first_prompt = u_text
                break
                
        words = first_prompt.strip().split()
        short_title = " ".join(words[:4])
        if len(words) > 4:
            short_title += "..."
        short_title = short_title.replace('"', '\\"').replace('\n', ' ').strip()
        
        print(f"[API] Phát hiện yêu cầu sinh tiêu đề (OpenAI). Trả về stubbed title: {short_title}")
        
        return ChatCompletionResponse(
            id=f"chatcmpl-{uuid.uuid4()}",
            created=int(time.time()),
            model=request.model,
            choices=[
                Choice(
                    index=0,
                    message=ChatMessage(role="assistant", content=short_title),
                    finish_reason="stop"
                )
            ],
            usage=Usage(
                prompt_tokens=10,
                completion_tokens=10,
                total_tokens=20
            )
        )

    # Dịch tin nhắn lịch sử (gồm cả tool call & tool result trước đó)
    translated_messages = []
    for m in request.messages:
        role = extract_msg_role(m)
        raw_content = extract_raw_msg_content(m)
        tool_calls = extract_msg_tool_calls(m)
        tool_call_id = extract_msg_tool_call_id(m)
        name = extract_msg_name(m)
        
        if role == "assistant" and tool_calls:
            tool_texts = []
            for call in tool_calls:
                f = call.get("function", {}) if isinstance(call, dict) else getattr(call, "function", {})
                name_val = f.get("name", "") if isinstance(f, dict) else getattr(f, "name", "")
                args_val = f.get("arguments", "") if isinstance(f, dict) else getattr(f, "arguments", "")
                call_id = call.get("id") if isinstance(call, dict) else getattr(call, "id", "")
                tool_texts.append(f"\n[Tool Call Request: {name_val} (ID: {call_id}) with parameters: {args_val}]")
            text_content = extract_text_content(raw_content) + "".join(tool_texts)
            translated_messages.append(ChatMessage(role=role, content=text_content))
        elif role == "tool":
            role = "user"
            text_content = f"\n[Tool Result (ID: {tool_call_id or name}):\n{extract_text_content(raw_content)}\n]"
            translated_messages.append(ChatMessage(role=role, content=text_content))
        else:
            translated_messages.append(ChatMessage(role=role, content=raw_content))
        
    # Tiêm hướng dẫn tools vào system prompt nếu có tools được truyền vào
    if request.tools:
        tool_descriptions = []
        for t in request.tools:
            if t.get("type") == "function":
                f = t.get("function", {})
                name = f.get("name", "")
                desc = f.get("description", "")
                schema = f.get("parameters", {})
                tool_descriptions.append(json.dumps({
                    "name": name,
                    "description": desc,
                    "input_schema": schema
                }, indent=2, ensure_ascii=False))
                
        if tool_descriptions:
            tool_instructions = "\n\nIn this environment, you have access to a set of tools you can use to answer the user's question.\n\n"
            tool_instructions += "You can invoke one or more tools by writing a <tool_call> XML tag that has a name attribute, and optionally a JSON-formatted body containing the arguments. String and scalar parameters should be specified as is, while lists and objects should use JSON format. Note that spaces for string values are not stripped. The output is not expected to be valid XML and is parsed with regular expressions.\n\n"
            tool_instructions += "Here are the functions available in JSONSchema format:\n"
            tool_instructions += "\n\n".join(tool_descriptions)
            tool_instructions += """\n\nWhen you choose to call a tool, please use the following format:
<tool_call name="tool_name">
{ "parameter_name": "value" }
</tool_call>
"""
            # Tìm hoặc tạo system prompt để ghép
            system_msg = None
            for m in translated_messages:
                if m.role == "system":
                    system_msg = m
                    break
            if system_msg:
                system_msg.content += tool_instructions
            else:
                translated_messages.insert(0, ChatMessage(role="system", content=tool_instructions))

    # Xác định session_id thông qua body hoặc user field
    session_id = request.session_id or request.user or "default"
    
    # Chạy completions thông thường qua browser
    session = await get_or_create_session(session_id)
    async with session.lock:
        try:
            response_text = await sync_and_get_response(session_id, session, translated_messages, request.tools)
            
            # Phân tích cú pháp tool calls từ phản hồi thô của DeepSeek
            clean_text, tool_calls = parse_tool_calls(response_text)
            
            openai_tool_calls = None
            finish_reason = "stop"
            if tool_calls:
                openai_tool_calls = []
                for call in tool_calls:
                    openai_tool_calls.append({
                        "id": call["id"].replace("toolu_", "call_"),
                        "type": "function",
                        "function": {
                            "name": call["name"],
                            "arguments": json.dumps(call["input"])
                        }
                    })
                finish_reason = "tool_calls"
                
            # Tạo Choice
            choice_message = ChatMessage(role="assistant", content=clean_text or None)
            if openai_tool_calls:
                choice_message.tool_calls = openai_tool_calls
                
            return ChatCompletionResponse(
                id=f"chatcmpl-{uuid.uuid4()}",
                created=int(time.time()),
                model=request.model,
                choices=[
                    Choice(
                        index=0,
                        message=choice_message,
                        finish_reason=finish_reason
                    )
                ],
                usage=Usage(
                    prompt_tokens=len(str(request.messages)) // 4,
                    completion_tokens=len(response_text) // 4,
                    total_tokens=(len(str(request.messages)) + len(response_text)) // 4
                )
            )
        except Exception as e:
            print(f"[API Error] Lỗi xử lý session '{session_id}': {e}")
            raise HTTPException(status_code=504 if "Timeout" in str(e) else 500, detail=str(e))

@app.post("/ask")
async def ask_deepseek(request: ChatRequest):
    """Giữ nguyên tương thích ngược với API /ask cũ và hỗ trợ Vision qua trường images / messages"""
    session_id = request.session_id or "default"
    
    if request.messages and len(request.messages) > 0:
        messages = [
            ChatMessage(
                role=m.get("role", "user") if isinstance(m, dict) else getattr(m, "role", "user"),
                content=m.get("content", "") if isinstance(m, dict) else getattr(m, "content", "")
            )
            for m in request.messages
        ]
    else:
        content_payload: Any = request.prompt or ""
        if request.images and len(request.images) > 0:
            content_parts = []
            if request.prompt:
                content_parts.append({"type": "text", "text": request.prompt})
            for img in request.images:
                content_parts.append({"type": "image_url", "image_url": {"url": img}})
            content_payload = content_parts
        messages = [ChatMessage(role="user", content=content_payload)]
        
    response = await process_chat_completions(session_id, messages, "deepseek-chat")
    return {"response": response.choices[0].message.content}

@app.post("/v1/chat/reset")
async def reset_session(request: ResetRequest):
    """Chủ động reset một session"""
    session_id = request.session_id
    async with state.lock:
        if session_id in state.sessions:
            session = state.sessions[session_id]
            async with session.lock:
                print(f"[API] Reset session '{session_id}' chủ động...")
                await reset_chat(session.page)
                return {"status": "success", "message": f"Session '{session_id}' reset successfully"}
        else:
            raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")

@app.delete("/v1/chat/sessions/{session_id}")
async def delete_session(session_id: str):
    """Reset session chủ động (thay vì đóng tab) để giải phóng hội thoại"""
    async with state.lock:
        if session_id in state.sessions:
            session = state.sessions[session_id]
            async with session.lock:
                print(f"[API] Reset session '{session_id}' chủ động...")
                await reset_chat(session.page)
                if session_id != "default":
                    state.sessions.pop(session_id)
                return {"status": "success", "message": f"Session '{session_id}' reset successfully"}
        else:
            raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")

class ScrapeRequest(BaseModel):
    url: str
    include_tables: bool = True

@app.post("/v1/scrape")
async def scrape_url_endpoint(request: ScrapeRequest):
    """Bóc tách nhanh URL thành Markdown sạch bằng trafilatura"""
    try:
        url = request.url.strip()
        if not url or not (url.startswith('http://') or url.startswith('https://')):
            raise HTTPException(status_code=400, detail="URL không hợp lệ")
        
        print(f"[Trafilatura] Đang cào dữ liệu sạch từ URL: {url}")
        
        downloaded = trafilatura.fetch_url(url)
        if not downloaded:
            headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"}
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=10) as resp:
                downloaded = resp.read().decode('utf-8', errors='ignore')

        md_content = trafilatura.extract(
            downloaded,
            output_format="markdown",
            include_tables=request.include_tables,
            include_images=False,
            include_links=False
        )

        if not md_content or len(md_content.strip()) < 20:
            return {"success": False, "markdown": "", "message": "Không trích xuất được nội dung bài viết từ link"}

        print(f"[Trafilatura] Cào thành công! Độ dài Markdown: {len(md_content)} ký tự")
        return {
            "success": True,
            "url": url,
            "markdown": md_content.strip()
        }
    except Exception as e:
        print(f"[Trafilatura Error]: {e}")
        return {"success": False, "markdown": "", "error": str(e)}

@app.get("/debug/dom")
async def debug_dom(session_id: str = "default"):
    async with state.lock:
        if session_id in state.sessions:
            session = state.sessions[session_id]
            async with session.lock:
                result = await session.page.evaluate(r"""
                    () => {
                        const selectors = ['.ds-markdown', '.ds-message-item', '[class*="markdown"]', '[class*="message"]'];
                        let candidates = [];
                        selectors.forEach(s => {
                            document.querySelectorAll(s).forEach(el => candidates.push(el));
                        });
                        
                        let aiMessages = candidates.filter(el => {
                            const isUser = el.closest('.ds-message-item--user') || el.classList.contains('ds-message-item--user');
                            return !isUser && el.innerText.trim().length > 0;
                        });
                        
                        if (aiMessages.length > 0) {
                            const latestEl = aiMessages[aiMessages.length - 1];
                            const mdEl = latestEl.classList.contains('ds-markdown') ? latestEl : latestEl.querySelector('.ds-markdown');
                            if (mdEl) {
                                const clone = mdEl.cloneNode(true);
                                const blocks = clone.querySelectorAll('.md-code-block');
                                const blockCount = blocks.length;
                                
                                blocks.forEach(block => {
                                    const pre = block.querySelector('pre');
                                    if (pre) {
                                        let lang = 'bash';
                                        const banner = block.querySelector('.md-code-block-banner, [class*="banner"]');
                                        if (banner) {
                                            const spans = banner.querySelectorAll('span');
                                            for (let s of spans) {
                                                const text = s.innerText.trim().toLowerCase();
                                                if (text && text !== 'copy' && text !== 'download') {
                                                    lang = text;
                                                    break;
                                                }
                                            }
                                        }
                                        const codeText = pre.innerText.trim();
                                        const textNode = document.createTextNode(`\n\`\`\`${lang}\n${codeText}\n\`\`\`\n`);
                                        block.parentNode.replaceChild(textNode, block);
                                    }
                                });
                                return {
                                    blockCount: blockCount,
                                    originalText: mdEl.innerText,
                                    convertedText: clone.innerText
                                };
                            }
                        }
                        return { error: "No AI message found" };
                    }
                """)
                page_url = session.page.url
                page_title = await session.page.title()
                return {
                    "url": page_url,
                    "title": page_title,
                    "result": result
                }
        else:
            if state.page:
                return {
                    "page_url": state.page.url,
                    "page_title": await state.page.title(),
                    "sessions": list(state.sessions.keys())
                }
            return {"error": "Session not found", "sessions": list(state.sessions.keys())}

AUDIT_LOG_DIR = "/Users/xuannguyen/Desktop/Keyword CNT/test article"
if not os.path.exists(AUDIT_LOG_DIR):
    AUDIT_LOG_DIR = SCRIPT_DIR

AUDIT_LOG_JSONL = os.path.join(AUDIT_LOG_DIR, "ai_audit_logs.jsonl")
AUDIT_LOG_TEXT = os.path.join(AUDIT_LOG_DIR, "ai_debug_history.log")

class AuditLogRequest(BaseModel):
    action: str = "EDIT_ARTICLE_SECTION"
    title: str = ""
    user_instruction: str = ""
    session_id: str = "default"
    system_prompt: str | None = None
    user_prompt: str | None = None
    ai_raw_response: str | None = None
    harness_replacements: list[Any] | None = None
    applied_count: int = 0
    status: str = "SUCCESS"
    summary: str = ""
    error_message: str | None = None
    timestamp: str | None = None

@app.post("/v1/audit_log")
@app.post("/audit_log")
async def save_audit_log(req: AuditLogRequest):
    """Lưu nhật ký tương tác đầy đủ giữa câu hỏi của user, phản hồi của AI và kết quả harness để gỡ lỗi"""
    try:
        now_str = req.timestamp or time.strftime("%Y-%m-%d %H:%M:%S")
        log_entry = {
            "timestamp": now_str,
            "action": req.action,
            "title": req.title,
            "session_id": req.session_id,
            "user_instruction": req.user_instruction,
            "status": req.status,
            "applied_count": req.applied_count,
            "summary": req.summary,
            "error_message": req.error_message,
            "harness_replacements": req.harness_replacements,
            "ai_raw_response": req.ai_raw_response,
            "user_prompt": req.user_prompt,
            "system_prompt": req.system_prompt
        }

        # 1. Ghi vào file JSON Lines (ai_audit_logs.jsonl)
        with open(AUDIT_LOG_JSONL, "a", encoding="utf-8") as f:
            f.write(json.dumps(log_entry, ensure_ascii=False) + "\n")

        # 2. Ghi vào file text định dạng dễ đọc (ai_debug_history.log)
        separator = "=" * 80
        text_entry = f"\n{separator}\n"
        text_entry += f"[{now_str}] ACTION: {req.action} | STATUS: {req.status} | APPLIED: {req.applied_count}\n"
        text_entry += f"PRODUCT: {req.title}\n"
        text_entry += f"USER INSTRUCTION / QUESTION:\n{req.user_instruction}\n\n"
        if req.error_message:
            text_entry += f"ERROR: {req.error_message}\n\n"
        text_entry += f"AI SUMMARY: {req.summary}\n\n"
        text_entry += f"AI RAW OUTPUT:\n{req.ai_raw_response or '(empty)'}\n\n"
        if req.harness_replacements:
            text_entry += f"HARNESS REPLACEMENTS ({len(req.harness_replacements)} items):\n"
            text_entry += json.dumps(req.harness_replacements, ensure_ascii=False, indent=2) + "\n"

        with open(AUDIT_LOG_TEXT, "a", encoding="utf-8") as f:
            f.write(text_entry)

        return {"success": True, "message": "Đã lưu nhật ký audit log thành công"}
    except Exception as e:
        print(f"[AuditLog Error]: {e}")
        return {"success": False, "error": str(e)}

@app.get("/v1/audit_log/recent")
async def get_recent_audit_logs(limit: int = 10):
    """Đọc nhanh N tương tác gần nhất từ file log để hỗ trợ phân tích và sửa lỗi"""
    try:
        if not os.path.exists(AUDIT_LOG_JSONL):
            return {"success": True, "logs": []}
        
        with open(AUDIT_LOG_JSONL, "r", encoding="utf-8") as f:
            lines = [line.strip() for line in f.readlines() if line.strip()]
        
        recent_lines = lines[-limit:]
        logs = [json.loads(line) for line in reversed(recent_lines)]
        return {"success": True, "total": len(lines), "logs": logs}
    except Exception as e:
        return {"success": False, "error": str(e)}

# --- LIFESPAN KHỞI TẠO BROWSER ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("--- KHỔI CHẠY DEEPSEEK BROWSER SERVER (OPENAI-COMPATIBLE MULTI-SESSION) ---")
    pw = await async_playwright().start()
    state.browser = await pw.chromium.launch(
        headless=False,
        channel="chrome",
        args=[
            "--disable-blink-features=AutomationControlled",
            "--disable-background-timer-throttling",
            "--disable-backgrounding-occluded-windows",
            "--disable-renderer-backgrounding"
        ]
    )
    state.context = await state.browser.new_context(
        user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        storage_state=AUTH_FILE if os.path.exists(AUTH_FILE) else None
    )
    
    # Khởi tạo page mặc định
    state.page = await state.context.new_page()
    
    # Tự động tắt server khi người dùng đóng trình duyệt hoặc tab chính
    def on_browser_close():
        if not state.is_shutting_down:
            state.is_shutting_down = True
            print("[Server] Trình duyệt Chrome hoặc Tab chính đã bị đóng bởi người dùng. Đang tắt tiến trình server...")
            import signal
            os.kill(os.getpid(), signal.SIGINT)

    state.browser.on("disconnected", lambda _: on_browser_close())
    state.page.on("close", lambda _: on_browser_close())
    
    try:
        await state.page.goto("https://chat.deepseek.com", timeout=60000, wait_until="commit")
        await asyncio.sleep(2.0)
    except Exception as nav_err:
        print(f"[Server Warning] Goto deepseek.com: {nav_err}")
    
    # Kiểm tra login
    try:
        is_login_page = await state.page.locator("text=Log In").first.is_visible(timeout=3000) or "login" in state.page.url
        if is_login_page:
            await perform_login(state.page, state.context)
    except Exception:
        pass
        
    print("Deepseek Server đã sẵn sàng.")
    yield
    # Dọn dẹp tài nguyên khi tắt server
    async with state.lock:
        state.is_shutting_down = True
        for sid, sess in list(state.sessions.items()):
            try:
                await sess.page.close()
            except:
                pass
        state.sessions.clear()
        
    await state.browser.close()
    await pw.stop()

app.router.lifespan_context = lifespan

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
