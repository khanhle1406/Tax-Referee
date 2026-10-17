# Báo cáo cải tiến Tax Referee — nhánh `feat/track-a-hardening` (14–15/10/2026)

> 📌 **Ảnh chụp lịch sử** — báo cáo ngày 15/10, nhánh đã vào `main` qua PR #1 và PR #2; số liệu là của lúc viết (44 unit test, "chờ 16/10"). Hiện hành: 110 kiểm tra unit; buổi thử người dùng 16/10 không có phản hồi chi tiết bằng văn bản nên repo không công bố số liệu người dùng; ca bẫy U2 đã đóng ở commit `02b8a24`. Số liệu hiện hành: [README](../../README.md), trang `/verify`, `/sop` và `docs/evidence/`.

**Đội:** Fprinciples · **Đề:** MLAI Hackathon 2026 · Track VNG · Đề A "The Escalation Referee"
**Phạm vi:** từ commit `33522a0` (main, 13/10) đến đầu nhánh `feat/track-a-hardening` (15/10) · 114 file, +5.260/−789 dòng, hơn 35 commit nhỏ.
**Người thực hiện:** Minh (bminhnemhoi), có Claude Code hỗ trợ. Mỗi thay đổi đều chạy test trước khi commit.

---

## 1. Tóm tắt

| | Trước (main `33522a0`) | Sau (nhánh này) |
|---|---|---|
| 11 ca diễn tập kiểu giám khảo xử lý đúng (trạng thái + nhóm dừng) | 3/11 | **11/11** |
| Ca thường quy bị chuyển tiếp thừa | 3/3 | **0/3** |
| Ca chuyển tiếp sai nhóm dừng | 4/8 | **0/8** |
| Câu hỏi qua kiểm tra tự động (có số tiền ₫, không bắt mở lại chứng từ)¹ | 1/10 | **8/8** |
| 72 ca "đánh lừa" do agent AI viết từ SOP² | 66/72 | **72/72** (nay là bộ hồi quy) |
| Bộ kiểm thử chuẩn `npm test` | không có | **16/16 bộ**, 44 unit test, chạy trên Windows/Linux |
| CI GitHub Actions (Ubuntu + Windows + build) | không có | **xanh** |
| Kiểm tra giao diện bằng trình duyệt thật (Playwright, máy tính + điện thoại 390px) | — | **18/19 mục đạt**³ |

¹ Mẫu số khác nhau: bản cũ chuyển tiếp 10 ca (gồm 3 ca thường quy bị hỏi thừa), bản mới 8 ca. Cách tái lập: `docs/evidence/before-after-judge-rehearsal-2026-10-14.md`.
² Agent không đọc `services/policyEngine.ts`, có đọc SOP và module ngưỡng; nhãn do AI gán, chưa được người nghiệp vụ duyệt.
³ Mục còn lại: trang chủ gọi `/api/auth/me` khi chưa đăng nhập nên nhận 401, đúng thiết kế.

**Tất cả số liệu trên là dữ liệu tổng hợp do đội/AI viết — không phải đánh giá độc lập và không phải kết quả người dùng thật.**
Kết quả 3 người dùng do BTC điều phối sẽ có ngày 16/10.

---

## 2. Phương pháp

1. **Rà soát như giám khảo nghiêm khắc (14/10 tối):** đối chiếu từng tiêu chí thang điểm (sơ loại 10/12/8/10/20/20/20; chung kết 45/35/20), feedback doanh nghiệp Sprint 1 và đề bài. Kết quả: kế hoạch P0 (phải xong trước khóa repo) và P1.
2. **Phản biện chéo + red team (14–15/10):** nhiều agent AI rà mã nguồn độc lập; chỉ sửa lỗi được ít nhất 2 agent xác nhận và tái hiện được bằng test. 72 ca bẫy viết từ SOP trở thành bộ hồi quy.
3. **Đợt chấm nghiêm khắc (15/10 rạng sáng):** 4 "giám khảo" agent độc lập (thử ca mới kiểu giám khảo; đi trọn kịch bản demo bằng HTTP + Playwright; soát tính trung thực hồ sơ nộp; kỹ thuật/bảo mật/thương mại), mỗi người có người phản biện. Mọi lỗi nặng được **tự tái hiện** trước khi sửa, sau đó kiểm lại bằng test và Playwright.

---

## 3. Cải tiến theo hạng mục

### 3.1. Gỡ rủi ro truất quyền, vệ sinh repo
- Gỡ 3 "người dùng thật" do AI bịa trong bản nháp brainstorm, ghi **đính chính công khai** (`brainstorming/opus-evaluation.md` §6, §7; `brainstorming/README.md`; README). Không viết lại lịch sử git để giữ minh bạch. — `3ace396`, `997ba93`
- Che IP/user/port SSH trong `deployment/HOSTINGER.md`; `.gitignore` chặn `*.local`, `env_*`. — `3ace396`
- Persona đăng nhập demo đổi thành tên vai trò ("Kế toán viên (demo)"…). Tài liệu cũ mâu thuẫn được gắn nhãn "ảnh chụp lịch sử". — `3ace396`, `997ba93`

### 3.2. Lõi Đề A: dừng đúng lúc, hỏi đúng người
- **Một bảng phân loại duy nhất** cho 3 kiểu dừng (`lib/riskTaxonomy.ts`): nhóm, người nhận, có cho người duyệt chấp nhận không, trường dữ kiện kích hoạt. SOP, engine và workflow dùng chung. Thứ tự nhóm chính: Ngoài quy định > Vượt thẩm quyền > Chưa rõ thông tin. — `67a7eaf`
- **Không kết luận trên dữ kiện nghi vấn:** số tiền chưa chắc (ảnh mờ; tổng in và tiền hàng + thuế nằm hai phía một ngưỡng) thì không nói "vượt quyền"/"vi phạm" mà hỏi số đúng trước. So giá trị nhập với chứng từ gốc; trường đọc từ ảnh không bị coi là đã xác minh. — `5d8ac31`, `6fa7b63`
- **"Ngoài quy định" thật** (trước đây ca không khớp quy tắc nào bị tự duyệt): tài trợ, từ thiện, tiền phạt, quà biếu/tặng, chi cá nhân, tài sản tài chính; VAT 8% ngoài thời hạn giảm thuế; danh mục loại trừ 8% (viễn thông, CNTT, kim loại, xăng dầu, bia/rượu, thuốc lá, ô tô…); tiếp khách/đồ uống có cồn. Nhận ra cả khi **gõ không dấu** và tiếng Anh, nhưng không chặn nhầm ("bìa hồ sơ", "chuyển phát", "mũ bảo hiểm"). — `67a7eaf`, `1c996d9`
- **Không chuyển tiếp thừa:** chỉ hỏi phương thức thanh toán khi tổng tiền (cộng cùng bên bán trong ngày) từ 5 triệu; chỉ hỏi trạng thái MST bên bán từ 20 triệu. — `67a7eaf`, `7ef115b`
- **Câu hỏi "trả lời trong một lần":** có số hóa đơn, số tiền ₫, hệ quả từng đáp án (VD "Tiền mặt → không được khấu trừ 1.100.000₫"); ca nhiều vấn đề gộp thành ý đánh số, trả lời "1A, 2A". — `67a7eaf`, `3a76110`
- Một MST công ty cho cả Verify và workspace (trước đây lệch nhau nên cùng hóa đơn ra kết quả ngược nhau). Ngày lập muộn hơn hôm nay quá 6 tháng không được tự duyệt. — `9801259`

### 3.3. Trả lời ngay trên hồ sơ và con người kiểm soát
- **Bảng trả lời "1A, 2B"** (`components/HandoffAnswerPanel.tsx`, `POST /api/invoices/[id]/answer`): mỗi đáp án có hệ quả thật — gán/xác nhận dữ kiện rồi đánh giá lại, chấp nhận phát hiện để duyệt, yêu cầu bổ sung, hoặc từ chối. — `3a76110`
- Đáp án có hệ quả (tiền mặt ≥ 5 triệu, NCC tạm ngừng, chưa có bảng kê) **kết thúc hồ sơ** đúng như nhãn: từ chối hoặc treo chờ bổ sung. Đã kiểm mọi tổ hợp A/B của các ca mẫu. — `a80721c`
- **Chặn "rửa" ca chờ CFO:** Kế toán viên sửa số tiền/MST/tên hàng sau khi hồ sơ đã chuyển tiếp thì phải KTT/CFO xác nhận, không tự duyệt. — `a80721c`
- **Công tắc dừng tự động hóa toàn hệ thống:** khi dừng, ca thường quy chờ duyệt tay; bật lại thì tự hoàn tất; bật/tắt có người, lý do, sự kiện audit. — `3d41870`
- **Nhật ký kiểm toán chỉ ghi thêm** (trigger SQLite chặn sửa/xóa) + **HMAC nối chuỗi** phát hiện tính lại chuỗi, xóa chữ ký, mốc giả; `/api/health` hiện commit đang chạy và head hash. — `295e31c`, `3e38224`, `a6a0803`
- Dừng rồi tiếp tục: ca đang chờ trả lời trở lại trạng thái chờ (trước đây thành "Tạm dừng", không trả lời được). Kế toán trưởng không duyệt/từ chối thay CFO. — `efb8fd8`
- Tự điều chỉnh ngưỡng theo phản hồi có kiểm chứng holdout 70/30 theo thời gian (yêu cầu Sprint 2). — `9f5230d`

### 3.4. Bảo mật
| Lỗ hổng (trước) | Đã sửa | Commit |
|---|---|---|
| Ai cũng đăng nhập/đổi vai thành CFO trên DB dùng chung; `POST /api/audit` cho chèn sự kiện giả | Chặn; đổi vai chỉ trong demo riêng | `e4fc674` |
| Mã QR chụp ảnh chứa mã phiên demo (tương đương cookie đăng nhập) | Định tuyến theo mã phiên chụp | `3e38224` |
| Webhook pháp luật có khóa mặc định trong mã | Chỉ nhận khóa từ env (≥ 24 ký tự), so sánh thời gian hằng | `3e38224` |
| Chứng từ tải lên (VD "XML" mang text/html) chạy được script cùng origin | Chỉ ảnh/PDF hiển thị trực tiếp, loại khác là text thuần + CSP sandbox + nosniff; header bảo mật toàn cục | `efb8fd8` |
| Không chống giả mạo yêu cầu từ trang khác (kể cả *.hostingersite.com) | `middleware.ts` chặn POST/PUT/PATCH/DELETE khác nguồn | `efb8fd8` |
| Cookie demo tự đặt tạo database mới không giới hạn, lách giới hạn tạo demo | Chỉ mở phiên đã tạo qua `/api/demo/session`; trần tổng số phiên; IP lấy từ proxy | `efb8fd8` |
| Tên sự kiện audit do client đặt | Chỉ nhận thao tác đã biết | `efb8fd8` |
| Tra cứu NCC (gọi AI tính phí) không cần đăng nhập | Cần phiên, 60 lần/giờ | `16c3dbc` |
| Không giới hạn độ dài đầu vào (tên hàng 2 MB vẫn duyệt) | Trần độ dài các trường | `16c3dbc` |

### 3.5. Verify và trải nghiệm giám khảo
- Verify chế độ giám khảo: **một nút chạy 9 ca** (4 ca chung + 5 ca Đề A), dấu thời gian từng ca, câu hỏi hiện ngay, xuất JSON/CSV; không gọi AI. — `005fa7a`, `a8a9518`
- Trang chủ: dòng hướng dẫn giám khảo + 2 nút ① Chạy Verify, ② Mở hộp chuyển tiếp — demo riêng; module ngoài Đề A gom vào "Mở rộng · beta". — `e4fc674`
- **Phiên demo mới có sẵn 4 ca mẫu** (1 tự xử lý + 1 ca mỗi kiểu dừng; ca CFO có 2 ý "1A, 2A"). — `e8b21e6`
- Giao diện: ô lý do luôn hiện cạnh Dừng/Hoàn tác; ca đã xử lý không còn bảng trả lời bị khóa; không lộ chữ kỹ thuật; không tràn ngang ở 390px; Nhật ký có mục "Sự kiện hệ thống". — `fb27481`, `e8b21e6`

### 3.6. Kiểm thử và CI
- `npm test` (`scripts/qa/run-all.ts`): unit test node:test + 15 bộ hồi quy, mỗi bộ chạy trên database tạm riêng, có **số kiểm tra tối thiểu** để bộ thoát sớm không bị tính là đạt. — `8aa8101`, `a8a9518`
- Unit test mới: diễn tập giám khảo, phân loại chạy engine thật (20 đầu dò quy tắc), tổ hợp đáp án, chống rửa ca, từ khóa (19 ca phải chặn, 8 ca không được chặn nhầm), bảo mật, ca mẫu, audit.
- Smoke HTTP trên bản build (`npm run test:api`) và test chụp QR (`npm run test:capture`). CI chạy khi đẩy lên `main`/`feat/**` và khi mở PR.

### 3.7. Tài liệu nộp bài
- README/RUNBOOK cho giám khảo 8 phút, bảng 4 trường hợp kiểm thử, giới hạn ghi trung thực.
- Mục câu hỏi người dùng cho Proposal (`docs/submission/proposal-user-questions.md`): kịch bản 15 phút, nhãn ghi trước khi xem kết quả, ca bẫy đo mức tin máy quá mức, đồng ý trích dẫn.
- 5 slide `.pptx` (`docs/submission/Tax-Referee-5-slides.pptx`) + nội dung (`slides-content.md`), build log 1 trang, kịch bản video 3 phút, hướng dẫn giám khảo 8 phút, đo trước/sau có lệnh tái lập.

---

## 4. Đợt chấm nghiêm khắc 15/10 — lỗi xác nhận và trạng thái

| Lỗi | Mức | Trạng thái |
|---|---|---|
| `main` công khai còn 3 người dùng bịa | Nghiêm trọng | **Cần merge PR** (bản gỡ chỉ có trên nhánh này) |
| Live URL vẫn chạy bản 10/10 | Nghiêm trọng | **Cần Khánh deploy** |
| Lách CFO bằng cách gửi lại số tiền thấp hơn | Cao | Đã sửa `a80721c` |
| Trả lời B bị hỏi lại | Cao | Đã sửa `a80721c` |
| Bỏ sót "ngoài quy định" (không dấu, quà, chi cá nhân, thép/xăng/bia 8%) | Cao | Đã sửa `1c996d9` (trừ ca bẫy U2, xem mục 5) |
| XSS qua chứng từ; cookie demo tự đặt; CSRF; KTT ghi đè ca CFO | Cao/TB | Đã sửa `efb8fd8` |
| Nút Dừng/Hoàn tác bị khóa không thấy ô lý do; tràn ngang điện thoại | Cao/Thấp | Đã sửa `fb27481` |
| Lệnh tái lập Slide 3 cho ra 6/11 | Cao | Đã sửa `997ba93` |
| Số liệu AI viết trong bản nháp (42 ca, STP 92,3%) chưa đính chính | Cao | Đã sửa `997ba93` |
| MST công ty lệch giữa Verify và workspace | TB | Đã sửa `9801259` |
| Video chưa quay | Cao | Việc của đội (sau deploy) |

---

## 5. Giới hạn còn lại (đã ghi trong README)

- "Ngoài phạm vi" nhận diện bằng **danh sách từ khóa**: chi cá nhân ghi tên khác vẫn có thể tự duyệt. Riêng **"tiệc cưới người thân giám đốc" (ca U2)** được giữ nguyên có chủ đích, vì là ca bẫy đã công bố trong Proposal để đo mức tin máy quá mức. Sửa ngay sau buổi thử 16/10, thành commit cải tiến từ phản hồi.
- Hóa đơn tách nhỏ cùng nhà cung cấp trong cùng ngày **chưa được cộng dồn khi xét hạn mức CFO** (đã cộng dồn cho ngưỡng tiền mặt).
- Ngày lập tương lai gần chưa bị chặn (chỉ chặn quá 6 tháng).
- Ảnh hóa đơn được gửi qua dịch vụ AI bên thứ ba (ShopAIKey/Gemini); SQLite một instance; đăng nhập nội bộ ở mức MVP.

---

## 6. Ước lượng điểm (từ đợt chấm, đã điều chỉnh theo phản biện)

| Tiêu chí sơ loại | Nếu chấm ngay trên live cũ | Sau deploy + video + 3 user thật |
|---|---|---|
| Live URL /10 | 6 | 10 |
| Verify /12 | 8 | 12 |
| Dữ liệu mới của giám khảo /8 | 4 | 7 |
| Slide + video /10 | 5 | 8–9 |
| Người dùng thật /20 | 0 (đúng lịch, chờ 16/10) | ~15 |
| Human-in-the-loop + audit /20 | 11 | 18 |
| Track test /20 | 8 | 17–18 |
| **Tổng** | **≈ 42** | **≈ 86–88** |

Chung kết (nếu deploy kịp): Live demo ≈ 36/45, Q&A ≈ 27/35 (sau khi chuẩn bị), Track test ≈ 17/20. Đây là ước lượng, không phải cam kết. Yếu tố quyết định nhất là **deploy bản mới** và **phản hồi thật của 3 người dùng**.

---

## Phụ lục — danh sách commit (theo thời gian)

Xem `git log --reverse origin/main..feat/track-a-hardening`. Các mốc chính:
`3ace396` gỡ persona · `8aa8101` npm test + CI · `e4fc674` chặn leo thang CFO · `67a7eaf` 3 kiểu dừng + câu hỏi một lần ·
`005fa7a` Verify 9 ca · `3d41870` công tắc dừng · `295e31c` audit chỉ ghi thêm + HMAC · `3a76110` trả lời "1A, 2B" ·
`34c52a7` red team 72 ca · `3e38224` bảo mật QR/webhook/HMAC · `e8b21e6` ca mẫu demo · `a80721c` chống rửa ca + trả lời B ·
`1c996d9` từ khóa · `efb8fd8` XSS/CSRF/cookie · `fb27481` giao diện · `997ba93` sửa tài liệu · `16c3dbc` tra cứu NCC + trần đầu vào.
