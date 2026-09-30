from patchright.sync_api import sync_playwright
import os
import time
import random

# Đường dẫn lưu file session
AUTH_FILE = "deepseek_auth.json"

def human_delay(min_ms=400, max_ms=1200):
    """Tạo khoảng nghỉ ngẫu nhiên"""
    time.sleep(random.uniform(min_ms, max_ms) / 1000)

def human_click(page, locator_or_selector):
    """Di chuyển chuột tới vùng phần tử rồi mới click"""
    if isinstance(locator_or_selector, str):
        loc = page.locator(locator_or_selector).first
    else:
        loc = locator_or_selector

    try:
        loc.wait_for(state="visible", timeout=10000)
        box = loc.bounding_box()
        if box:
            target_x = box['x'] + box['width'] / 2 + random.uniform(-5, 5)
            target_y = box['y'] + box['height'] / 2 + random.uniform(-5, 5)
            page.mouse.move(target_x, target_y)
            human_delay(200, 500)
            page.mouse.click(target_x, target_y)
    except:
        print(f"Không thể click vào phần tử: {locator_or_selector}")

def human_typing(page, text):
    """Gõ phím với tốc độ nhanh hơn nhưng vẫn tự nhiên"""
    for char in text:
        # Giảm độ trễ xuống 20ms - 60ms để gõ nhanh hơn
        page.keyboard.type(char, delay=random.randint(20, 60))
        # Giảm tỷ lệ dừng lại suy nghĩ
        if random.random() < 0.03:
            time.sleep(random.uniform(0.1, 0.2))

def get_random_question():
    """Trả về một câu hỏi ngẫu nhiên từ danh sách"""
    questions = [
        "What is the capital of Vietnam?",
        "Tell me a fun fact about space.",
        "How does artificial intelligence work?",
        "Give me a simple recipe for pancakes.",
        "What are the benefits of learning Python?",
        "Summarize the plot of the movie Inception.",
        "Why is the sky blue?",
        "Write a short poem about coding.",
        "What is the distance between the Earth and the Moon?",
        "How can I improve my SEO ranking?"
    ]
    return random.choice(questions)

def run():
    # Nếu bạn có proxy, hãy điền vào đây
    proxy_config = None 

    with sync_playwright() as p:
        print("Khởi chạy trình duyệt trong nền (Headless Mode)...")
        # Chuyển headless thành True để chạy ẩn
        browser = p.chromium.launch(
            headless=True,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
                "--disable-dev-shm-usage"
            ]
        )
        
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            storage_state=AUTH_FILE if os.path.exists(AUTH_FILE) else None,
            viewport={'width': 1280, 'height': 800}
        )

        page = context.new_page()
        
        try:
            print("Đang truy cập DeepSeek...")
            page.goto("https://chat.deepseek.com", wait_until="domcontentloaded")
            human_delay(2000, 3000)

            # Kiểm tra đăng nhập
            if page.locator("text=Log In").is_visible() or "login" in page.url:
                print("Yêu cầu đăng nhập...")
                if os.path.exists(AUTH_FILE): os.remove(AUTH_FILE)
                
                human_click(page, "text=Log In")
                human_delay(1500, 2500)
                
                password_tab = page.get_by_text("Password Login")
                if password_tab.is_visible():
                    human_click(page, password_tab)
                    human_delay()

                # Nhập Email
                email_field = page.locator("input[placeholder*='phone'], input[placeholder*='email'], input[type='text'], input[type='email']").first
                human_click(page, email_field)
                human_typing(page, "dienthongminhsaithanh.social@gmail.com")
                
                # Nhập Password
                password_field = page.locator("input[placeholder*='password'], input[type='password']").first
                human_click(page, password_field)
                human_typing(page, "Jd3;(Gzdjr=8xxE")
                
                # Đồng ý điều khoản
                agree_checkbox = page.locator(".ds-checkbox, input[type='checkbox']").first
                if agree_checkbox.is_visible():
                    human_click(page, agree_checkbox)
                
                # Nhấn Login
                human_click(page, "button:has-text('Log In'), .ds-button--primary")
                
                print("Vui lòng GIẢI CAPTCHA THỦ CÔNG nếu có...")
                page.wait_for_selector("textarea", timeout=120000)
                context.storage_state(path=AUTH_FILE)
                print("Đăng nhập thành công.")

            # Gửi tin nhắn
            question = get_random_question()
            print(f"Câu hỏi ngẫu nhiên được chọn: {question}")
            
            print("Đang soạn tin nhắn...")
            chat_input = page.locator("textarea").first
            chat_input.wait_for(state="visible")
            human_click(page, chat_input)
            
            human_typing(page, question)
            human_delay(500, 1000)
            page.keyboard.press("Enter")
            
            # --- LOGIC STREAM CẢI TIẾN MẠNH MẼ ---
            print("\nĐang chờ DeepSeek phản hồi...")
            
            # Đợi một chút để tin nhắn được gửi đi
            time.sleep(2) 
            
            message_item = None
            start_wait = time.time()
            
            while time.time() - start_wait < 40:
                # SỬ DỤNG JAVASCRIPT ĐỂ TÌM TIN NHẮN MỚI NHẤT
                # Chúng ta tìm các thẻ có chứa 'markdown' hoặc nằm trong bubble tin nhắn
                # mà KHÔNG phải là tin nhắn của User (thường user nằm bên phải/có class user)
                script = """
                () => {
                    // Tìm tất cả các phần tử có khả năng chứa câu trả lời
                    const selectors = ['.ds-markdown', '.ds-message-item', '[class*="markdown"]', '[class*="message"]'];
                    let candidates = [];
                    selectors.forEach(s => {
                        document.querySelectorAll(s).forEach(el => candidates.push(el));
                    });
                    
                    // Lọc ra các phần tử có nội dung và không phải là của user
                    // (Giả định tin nhắn AI thường không có class 'user' hoặc nằm trong ds-message-item--bot)
                    let aiMessages = candidates.filter(el => {
                        const isUser = el.closest('.ds-message-item--user') || el.classList.contains('ds-message-item--user');
                        return !isUser && el.innerText.trim().length > 0;
                    });
                    
                    if (aiMessages.length > 0) {
                        // Trả lại nội dung của phần tử AI cuối cùng
                        return aiMessages[aiMessages.length - 1].innerText;
                    }
                    return null;
                }
                """
                
                content = page.evaluate(script)
                if content and len(content.strip()) > 0:
                    print("\nĐã kết nối được với luồng phản hồi.")
                    break
                
                # Giả lập hành động người dùng để duy trì kết nối
                page.mouse.move(random.randint(0, 50), random.randint(0, 50))
                time.sleep(1.5)

            print("\nDeepSeek đang trả lời:\n" + "-"*30)
            
            last_text = ""
            start_time = time.time()
            
            while time.time() - start_time < 300: 
                try:
                    current_text = page.evaluate(script) or ""
                    
                    if current_text != last_text and len(current_text) > len(last_text):
                        # Lấy phần nội dung mới
                        new_content = current_text[len(last_text):]
                        
                        # Tách theo khoảng trắng để in từng từ
                        # Dùng split(' ') để giữ lại các ký tự đặc biệt dính liền với từ
                        words = new_content.split(' ')
                        for i, word in enumerate(words):
                            if i > 0:
                                print(' ', end="", flush=True)
                            
                            print(word, end="", flush=True)
                            
                            # Nếu có nhiều từ cùng lúc, nghỉ một chút giữa các từ (0.03s - 0.08s)
                            if len(words) > 1:
                                time.sleep(random.uniform(0.03, 0.08))
                            
                        last_text = current_text
                    
                    # Kiểm tra kết thúc
                    is_generating = page.evaluate("""
                        () => {
                            const stopBtn = document.querySelector('button[aria-label*="Stop"], .ds-icon--stop');
                            return !!stopBtn;
                        }
                    """)
                    
                    if not is_generating and len(current_text) > 0:
                        # Kiểm tra lại lần cuối để chắc chắn không sót chữ
                        time.sleep(1)
                        final_text = page.evaluate(script) or ""
                        if final_text == current_text:
                            break
                except Exception:
                    pass
                # Giảm thời gian nghỉ vòng lặp để bắt dữ liệu nhạy hơn
                time.sleep(0.1)
            
            print("\n" + "-"*30 + "\nHoàn tất stream.")

        except KeyboardInterrupt:
            print("\nĐã dừng bằng Ctrl+C.")
        except Exception as e:
            print(f"\nLỗi: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    run()
