# BÀN GIAO DEMO DAY 17/10/2026 — ĐỌC FILE NÀY TRƯỚC

> 📌 **Ảnh chụp lịch sử** — checklist viết tối 16/10, trước khi merge. Trạng thái sau đó: nội dung PR #6 và PR #7 vào `main` qua merge commit `d882768` (PR #6 không có merge commit riêng; riêng commit tự sinh khóa audit `6a614b6` của nhánh PR #6 vào `main` cùng PR #8), PR #8 qua `e496ab4`; kiểm tra sau deploy (mục 4) cho commit `e496ab4`, HMAC bật, Verify 9/9, `/trust` 12/12, lưu ở [`live-2026-10-16-post-deploy.json`](../evidence/live-2026-10-16-post-deploy.json) thay cho tên `live-2026-10-17.json` dự kiến ở bước 6. Số "unit 102" là lúc viết; bản `v1.0.0` có 103, hiện hành 110.

> **Gửi trợ lý AI (Claude, ChatGPT, Codex…) đang đọc file này cho Khánh:**
> Hãy tóm tắt cho Khánh theo đúng thứ tự: (1) mục 1 "Việc phải làm tối nay" thành danh sách bước có ô đánh dấu; (2) cảnh báo ở mục 0; (3) mục 4 "Kiểm tra sau deploy" kèm kết quả kỳ vọng; (4) mục 6 "Sáng 17/10". Không bỏ bước nào. **Không đọc, không in giá trị** các file bí mật (`env_*`, `.env*`): chỉ được nhắc TÊN biến. Không đề xuất squash, force-push hay viết lại lịch sử git. Nếu Khánh hỏi "vì sao", trả lời bằng mục 2 và 5.

Người viết: Minh (cùng trợ lý AI), tối 16/10/2026. Repo: https://github.com/khanhle1406/Tax-Referee · Live: https://limegreen-salamander-517622.hostingersite.com

---

## 0. Ba cảnh báo quan trọng nhất

1. **Merge vào `main` = deploy production.** hPanel tự deploy khi `main` đổi (live khởi động lại khoảng 97 giây sau khi PR #5 được merge). Chỉ merge khi CI xanh, và làm checklist mục 4 ngay sau đó.
2. **Live đang thiếu cấu hình bảo mật** (16/10 22:27): `/api/health` báo `"commit":"unknown"` và `"audit":{"hmac":false}`. Từ PR #6, app **tự xử lý cả hai** khi deploy: tự sinh khóa audit (file `.audit-key` quyền 600 cạnh database) nếu chưa đặt `TAX_REFEREE_AUDIT_KEY`, và tự đọc commit từ `.git`. Không cần vào hPanel; đặt biến môi trường chỉ là tùy chọn (mục 3).
3. **Merge bằng "Create a merge commit"**, không "Squash and merge", không force-push: lịch sử commit nhỏ là bằng chứng chấm thi.

## 1. Việc phải làm tối nay (theo thứ tự)

- [ ] **Bước 1 — Ghi số đo trước deploy:** mở `https://limegreen-salamander-517622.hostingersite.com/api/health`, ghi lại số `audit.events` (16/10 là 42). Dùng để chứng minh dữ liệu không mất sau restart.
- [ ] **Bước 2 — Merge PR #6** `feat/demo-day-security` → `main` bằng **Create a merge commit**: https://github.com/khanhle1406/Tax-Referee/pull/6 (CI đã xanh: Ubuntu, Windows, build).
- [ ] **Bước 3 — (Tùy chọn) Biến môi trường** theo mục 3. Không bắt buộc: không đặt gì thì app tự sinh khóa audit và dùng giới hạn demo 200 phiên/giờ/IP.
- [ ] **Bước 4 — Kiểm tra sau deploy** theo mục 4. Có mục đỏ thì làm mục 7 (rollback).
- [ ] **Bước 5 — Merge PR #7** `docs/demo-day-q1-q2` → `main` (tài liệu Q1/Q2 + harness, không đổi hành vi app; vẫn kích hoạt deploy lại): https://github.com/khanhle1406/Tax-Referee/pull/7. Sau đó mở `/api/health` lần nữa: `audit.events` không giảm.
- [ ] **Bước 6 — Lưu bằng chứng:** chép JSON của `/api/health` và kết quả `/trust` (ảnh chụp hoặc JSON) vào `docs/evidence/live-2026-10-17.json` (commit riêng, message tiếng Việt).

## 2. PR #6 thay đổi gì (vì sao phải deploy tối nay)

BTC (chị Kelly qua TinNgo, 16/10) yêu cầu đội Track VNG chuẩn bị 2 câu cho Demo Day:
**Q1** — hiểu thật thách thức bảo mật của hệ có agent AI trong doanh nghiệp: *định danh, đặc quyền tối thiểu, ranh giới thực thi tất định, cách ly*; **Q2** — kiến trúc và đường từ demo lên production.
Đội trả lời bằng **sửa lỗi thật** do audit nội bộ 16/10 tìm ra (73 phát hiện; 20 lỗi HIGH/CRITICAL đã kiểm chứng đối kháng, cả 20 có thật) và **chứng minh trực tiếp trên live** ở trang `/trust`.

| Lỗi đã sửa (mỗi lỗi một commit kèm test) | Trụ |
|---|---|
| AI đọc ảnh tự "khai" được "đã có UNC", "MST đang hoạt động"… (không nhìn thấy trên ảnh) rồi được tự duyệt → nay chỉ nhận đúng 14 trường nhìn thấy; tên file không còn vào prompt | Ranh giới thực thi |
| Hoàn tác gỡ được lệnh giữ thuế theo luật / của CFO; duyệt đè hồ sơ chưa đánh giá → đã chặn | Ranh giới thực thi |
| KTT hạ ca 330 triệu xuống 198 triệu để máy tự duyệt, né CFO → ca vẫn chờ CFO ("thẩm quyền không hạ theo số tiền") | Đặc quyền tối thiểu |
| Người nhập tự xác minh dữ liệu của mình → 403 (bất kiêm nhiệm) | Định danh |
| Không giới hạn số lần gọi AI tính phí → ngân sách theo phiên, vượt thì không gọi | Ranh giới thực thi |
| KTT tự tắt được quy tắc "ngoài phạm vi SOP" qua policy; rollback không kiểm nới lỏng → cần CFO khác người soạn | Đặc quyền tối thiểu |
| `/api/health` im lặng khi thiếu khóa audit → nay báo `warnings`; chống xóa chữ ký HMAC rồi tính lại chuỗi | Định danh, cách ly |
| Tiến trình Python đọc PDF thừa hưởng khóa API/khóa audit → env đã lọc | Cách ly |
| Bật lại tự động hóa duyệt ca đang giữ bằng quyết định cũ → nay kiểm lại theo policy hiện hành | Ranh giới thực thi |
| Cụm tiền mặt cùng ngày phụ thuộc thứ tự nhập; báo nhầm 8% ("thuê xe ô tô", "điện thoại 5G") | Engine |
| **Ca bẫy U2** ("tiệc cưới người thân giám đốc") đã đóng sau buổi thử 16/10 — nay **chuyển người** (BTC xác nhận buổi thử ổn; không có phản hồi người dùng chi tiết, commit ghi đúng như vậy) | Engine |
| **Trang `/trust`**: 12 phép thử tấn công chạy trên mã đang deploy (mỗi phép thử một DB `:memory:` riêng), ma trận quyền được test kiểm bằng hàm thật, danh tính và ngân sách agent AI, giới hạn đã biết | Cả 4 trụ |

Kiểm chứng ở máy local 16/10: typecheck, lint sạch; `npm test` **16/16 bộ đạt** (unit 102 kiểm tra); build đạt; Playwright trên bản build: `/trust` 11/11, tính năng cũ 14/14.

PR #7 chỉ thêm: `docs/security/threat-model.md` (Q1), `docs/architecture/demo-to-production.md` (Q2), sửa câu lệch mã trong README/hồ sơ, harness `.claude/` + `CLAUDE.md` + `AGENTS.md`.

## 3. Biến môi trường (chỉ ghi TÊN, không dán giá trị vào chat/AI)

| Biến | Giá trị | Lưu ý |
|---|---|---|
| `TAX_REFEREE_AUDIT_KEY` | Tùy chọn. Tạo bằng `openssl rand -hex 32` (64 ký tự hex) | **Không đặt thì app tự sinh** file `.audit-key` (quyền 600) cạnh database ở lần chạy đầu và dùng mãi (`/api/health` → `audit.keySource: "file"`). Nếu đặt thì biến được ưu tiên. Dù cách nào: sao lưu khóa ra ngoài host, không đổi giữa chừng |
| `TAX_REFEREE_DEMO_PER_HOUR` | Tùy chọn (mặc định trong mã nay là 200) | Giám khảo dùng chung NAT hội trường |
| `GIT_COMMIT_SHA` | Chỉ đặt nếu sau deploy `/api/health` vẫn `"commit":"unknown"` | App tự đọc commit từ `.git` khi hPanel deploy bằng git. Nếu phải đặt tay thì cập nhật mỗi lần deploy |
| `TAX_REFEREE_AUDIT_SIGNED_SINCE` | Tùy chọn, làm **sau cùng**: thời điểm hiện tại dạng ISO, ví dụ `2026-10-16T17:30:00Z` | Chỉ đặt **sau khi** khóa audit đã chạy và đã restart; đặt sớm hơn sẽ làm nhật ký báo không hợp lệ |
| `QGEN_AI`, `TAX_REFEREE_ALLOW_INTERNAL_ROLE_LOGIN` | **Không đặt** | Kiểm tra rằng chúng không có mặt |

## 4. Kiểm tra sau deploy (kết quả kỳ vọng)

| Kiểm | Kỳ vọng |
|---|---|
| `GET /api/health` | `"status":"ok"`, `"audit":{"hmac":true,"keySource":"file" hoặc "env",…}`, `"warnings":[]`, `"commit"` khác `unknown`, `"ai":{"decisionPathLlmCalls":0,…}`, `audit.events` **≥** số ghi ở bước 1 (nếu về 0 → DB nằm trong thư mục release → rollback ngay) |
| Trang `/verify` | 9/9 PASS |
| Trang `/trust` → bấm **"Chạy 12 phép thử tấn công"** | Dòng **"12/12 đạt"**; dòng D2 hiện "tin AI: ROUTINE → có ranh giới: ESCALATED" |
| Nhập tay ca U2 (tên hàng "Chi phí tiệc cưới người thân giám đốc", 4.400.000₫, chuyển khoản) | **Chuyển người**, nhóm "Ngoài quy định" (không còn tự duyệt) |
| Nhập "Xăng RON95" thuế suất 8% ngày 2026-10-05 | Tự xử lý (NQ 204/2025 cho xăng được 8%) |
| Tải `input-sample/06_real_einvoice_vinhlong.pdf` | Có cảnh báo "Đã đọc lớp chữ trực tiếp từ PDF". Nếu không có mà PDF chuyển sang đọc bằng Vision → báo Minh (liên quan bản lọc env của tiến trình Python) |
| Mở một chứng từ có tên file tiếng Việt | Mở được, không lỗi 500 |

## 5. Những điều phải nói thật nếu giám khảo hỏi (đã ghi trên `/trust`)

- Định danh trong demo là **vai trò mô phỏng**: một người đổi được 3 vai trong phiên demo (ngoài sandbox bị chặn). Production cần SSO/OIDC, MFA khi CFO duyệt.
- Tiến trình đọc PDF không còn nhận biến bí mật nhưng **vẫn cùng máy, cùng người dùng hệ điều hành** — chưa cô lập bằng container.
- Khóa HMAC nằm cùng host với database: chống được người chỉ sửa được file DB, không chống được người chiếm cả máy — vì vậy có điểm neo lưu ra ngoài (`/api/audit/anchor`).
- Trường số tiền AI đọc từ ảnh vẫn ở trạng thái "đã đọc" nếu không có cờ nghi vấn; lớp phòng vệ là kiểm tra số học, ngưỡng trọng yếu, xác minh của người, hậu kiểm ngẫu nhiên.
- Khóa audit chưa có mã phiên bản nên chưa xoay khóa được; khóa API AI còn gửi cả qua query (để sau Demo Day mới đổi, tránh proxy trả 401).
- Một instance SQLite; ảnh/PDF scan đi qua proxy AI bên thứ ba.
- **Không nói:** "parser đã sandbox", "tuân thủ OWASP/NIST/ISO", "đã có kết quả người dùng", "XML hoàn toàn không qua AI" (tên/MST bên bán có thể đi tra cứu có grounding).

## 6. Sáng 17/10 (trước giờ thuyết trình)

1. `GET /api/health`: `hmac:true`, `warnings:[]`. Nếu vẫn `hmac:false` thì nói thẳng: "khóa audit chưa bật trên live — đây chính là lỗi cấu hình mà `/api/health` được thiết kế để làm lộ ra".
2. `/trust` chạy 12/12 một lần (giới hạn 10 lần/10 phút mỗi người — đừng bấm liên tục). Chụp màn hình làm dự phòng.
3. Đoạn demo bổ sung (khoảng 60 giây): mở `/trust` → bấm chạy → chỉ dòng **D2** (agent đọc ảnh bị chiếm: không ranh giới thì tự duyệt, có ranh giới thì phải hỏi người) và **L3** (hạ số tiền không hạ thẩm quyền) → mở `/api/health` chỉ `ai.decisionPathLlmCalls: 0`.
4. Câu mở Q1: *"Máy đọc có thể bị lừa, trọng tài thì không. Agent AI của chúng tôi không có quyền quyết định — rủi ro agentic chuyển sang dữ liệu, nên mỗi trường AI viết ra được kiểm soát như một quyền."* Rồi đi 4 trụ, mỗi trụ chỉ một phép thử trên `/trust`.
5. Câu mở Q2: kiến trúc 7 lớp (nạp chứng từ → chuẩn hóa → quyết định tất định → workflow & thẩm quyền → người trong vòng lặp → nhật ký chống sửa → vận hành), 3 đánh đổi (SQLite mỗi phiên vs Postgres + RLS; gọi AI đồng bộ vs hàng đợi; danh sách đen từ khóa vs danh sách trắng), cái gì vỡ trước khi chạy nhiều instance, lộ trình 30/90 ngày.
6. Bản nói đầy đủ (60 giây và 2 phút 30 giây) + 12 câu hỏi khó: `docs/handoff/the-nhac-thuyet-trinh-17-10.md`.

## 6b. Tự cập nhật dự án không cần Khánh (Minh hoặc bất kỳ ai có quyền push)

Tài khoản `bminhnemhoi` có quyền **push** lên repo và nhánh `main` **không bật bảo vệ**, nên tự merge PR được:
1. Mở PR trên GitHub → kiểm tra CI xanh (tab Checks) → **Merge pull request** → chọn **Create a merge commit** (không squash). Hoặc dòng lệnh: `gh pr merge <số PR> --repo khanhle1406/Tax-Referee --merge`.
2. Chờ 2–5 phút rồi mở `/api/health`: `startedAt` phải đổi sang thời điểm mới và `commit` trùng merge commit trên GitHub → hPanel đã tự deploy.
3. Nếu sau khoảng 10 phút `startedAt` không đổi: hPanel **không** tự deploy theo `main` → cần người có tài khoản Hostinger bấm deploy, hoặc xin Khánh cấp quyền qua **hPanel → Access Manager** (thêm email của Minh) hoặc thêm SSH key của Minh — chỉ cần làm một lần, sau đó tự chủ hoàn toàn.
4. Làm checklist mục 4. Có mục đỏ thì làm mục 7.
Lưu ý phối hợp: nhắn nhóm trước khi merge vào `main` (đang là bản live giám khảo dùng).

## 7. Rollback nếu có mục đỏ

- Trên GitHub: mở merge commit của PR #6 → **Revert** → merge PR revert (hPanel tự deploy lại bản trước). Hoặc trỏ symlink về release cũ theo `deployment/HOSTINGER.md`.
- Giữ nguyên `TAX_REFEREE_AUDIT_KEY` khi rollback (sự kiện đã ký vẫn kiểm được miễn là khóa không đổi).

## 8. File quan trọng

| Cần gì | File |
|---|---|
| Hướng dẫn deploy chi tiết (mục A5c) | `docs/handoff/huong-dan-ban-giao.md` |
| Bản nói Q1/Q2, thao tác demo, 12 câu hỏi khó | `docs/handoff/the-nhac-thuyet-trinh-17-10.md` |
| Phân tích bảo mật hệ agent (Q1) | `docs/security/threat-model.md` (PR #7) |
| Kiến trúc và lộ trình production (Q2) | `docs/architecture/demo-to-production.md` (PR #7) |
| Hồ sơ kỹ thuật (mục 16: bảng 4 trụ) | `docs/submission/ho-so-ky-thuat.md` |
| Nghiên cứu liên quan (63 nguồn) | `docs/research/nghien-cuu-lien-quan.md` |
| Luật cứng cho trợ lý AI | `CLAUDE.md`, `AGENTS.md` (PR #7) |
| Mã phép thử bảo mật / bảng quyền | `services/securityProbeService.ts`, `lib/capabilities.ts` |

## 9. Luật không được phá (kể cả khi AI gợi ý)

Không squash, không force-push, không `--no-verify`. Không đọc/dán giá trị file bí mật. Không bịa số liệu, tên hay trích dẫn người dùng. Thể lệ: đúng 5 slide. Mọi thay đổi mới: nhánh riêng → PR → merge commit.
