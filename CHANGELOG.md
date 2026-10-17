# Lịch sử thay đổi

Định dạng phỏng theo [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), phiên bản theo [SemVer](https://semver.org/). **v1.0.0** ứng với commit `e496ab4` (merge PR #8), bản đã kiểm trên live sau deploy ngày 16/10/2026 ([bằng chứng](docs/evidence/live-2026-10-16-post-deploy.json)); commit đang chạy trên live xem `/api/health`. Repo đội chưa gắn tag phiên bản. Các mốc ứng với Pull Request đã merge vào `main` (merge vào `main` = deploy production). Lịch sử git không bị squash hay viết lại — chi tiết từng thay đổi xem `git log`.

## [Chưa phát hành]

Vòng cải tiến 17/10 theo góp ý của giám khảo: xử lý theo lô có người chốt, kênh nhận hóa đơn Gmail/Zalo, màn hình Tổng quan và Lịch sử, trang riêng tư, cùng các bản sửa engine tìm được khi mô phỏng giám khảo. Lên live khi PR vòng cải tiến được merge vào `main`.

### Thêm
- Nối chatbot Zalo (Goblin) vào Tax Referee: web tự làm mới khi có hóa đơn mới từ bot (hỏi `/api/inbox` mỗi 4 giây khi tab hiện), công tắc `TAX_REFEREE_ALLOW_WORKSPACE_RESET` cho nút "Xóa hết hóa đơn" ở workspace nội bộ (mặc định tắt, có test), bộ nối `integrations/goblin-relay/` (bộ nhận, cầu nối đọc ảnh, script chạy/kiểm tra). Xem [docs/integrations/zalo-goblin-relay.md](docs/integrations/zalo-goblin-relay.md).
- **Xử lý theo lô có kiểm soát** (`services/batchService.ts`, `app/api/batches/**`, màn hình *Lô hóa đơn*): tải nhiều file, đọc hết rồi xếp theo MST → ngày → số trước khi kiểm; máy vẫn quyết từng hóa đơn bằng cùng engine; kết quả chia nhóm (máy đề xuất duyệt, đã duyệt sau khi hỏi người, cần người quyết, tạm giữ, từ chối, không đọc được). File đọc được nhưng không có số hóa đơn lẫn số tiền (ví dụ báo giá) xếp vào "Không đọc được", không đưa vào máy kiểm.
- **Chốt lô trước khi ghi sổ** (KTT/CFO, ghi lý do): người tạo lô và người nhập hóa đơn không tự chốt; lô có hóa đơn từ hạn mức CFO thì CFO chốt; mỗi hóa đơn được ghi sổ có sự kiện nhật ký riêng. Ghi sổ theo **từng hóa đơn** (`batch_items.posted_at`): hóa đơn còn chờ hay tạm giữ lúc chốt, nếu được duyệt sau, phải **chốt bổ sung** trên cùng lô, cùng luật bất kiêm nhiệm và hạn mức CFO.
- **Trả lời nhóm** (KTT/CFO): một đáp án cho các hóa đơn cùng câu hỏi trong lô, đi qua bước trả lời của từng hóa đơn (thẩm quyền, bất kiêm nhiệm giữ nguyên). Chỉ gộp câu cùng nội dung và cùng hệ quả đáp án (ví dụ "đã có ủy nhiệm chi chưa?", "mục đích tiếp khách"); thẻ nhóm liệt kê từng hóa đơn.
- **Phiếu giải trình** (`lib/explainDecision.ts`): vì sao máy đề xuất duyệt (từng điều kiện kèm số, dùng chính hàm của engine) hoặc vì sao dừng (quy tắc, trường, VAT chờ quyết định); hóa đơn đã có người quyết thì phiếu nói theo kết quả cuối.
- **Hộp thư vào — Gmail/Zalo** (`services/channels/**`, `services/staffDirectory.ts`): nhận XML/PDF/ảnh qua Gmail (IMAP) và ảnh qua Zalo Bot (long polling); danh bạ người gửi; nhận diện người gửi bằng email qua SPF/DKIM hoặc Zalo user id; người gửi lạ chờ KTT/CFO xác nhận; mỗi lượt lấy thư có lô thì gửi tóm tắt cho KTT, báo kết quả cho người gửi qua email và tin "đã nhận" cho người gửi qua Zalo. Mọi tin gửi được ghi lại (gửi được, lỗi, chưa cấu hình, mô phỏng).
- **Kênh mô phỏng cho phiên demo:** hộp thư và bot giả với hóa đơn mẫu (nhân viên đã xác thực, thư giả danh SPF trượt, nhà cung cấp lạ, ảnh Zalo của nhân viên và của người lạ) đi đúng đường nhận diện người gửi, lưu file, máy kiểm, vào lô; tin gửi ghi `SIMULATED`, không gọi mạng. Kênh thật trong phiên demo chỉ bật có chủ đích bằng `TAX_REFEREE_ALLOW_REAL_CHANNELS_IN_DEMO=1` trên máy của đội.
- **Tổng quan** cho KTT/CFO (`services/dashboardService.ts`, `/api/dashboard`): việc đang chờ, máy tự xử lý bao nhiêu, VAT, lý do dừng, tốc độ trả lời, lô, kênh và người gửi.
- **Lịch sử của tôi** (`services/historyService.ts`, `/api/history`): "Tôi đã làm" và "Hóa đơn tôi gửi", chỉ bản ghi của chính người đăng nhập; nhãn tiếng Việt cho sự kiện lô, kênh, danh bạ.
- **Trang `/privacy`** — "Dữ liệu của bạn đi đâu": từng loại dữ liệu đi đâu, AI thấy gì (đọc cấu hình đang chạy), ai xem được gì, chế độ không AI, luật liên quan (nguồn thứ cấp, không trích số điều).
- **LLM dành cho demo** theo chuẩn OpenAI (`DEV_LLM_ENABLED`, `DEV_LLM_BASE_URL`, `DEV_LLM_API_KEY`, `DEV_LLM_MODEL`), mặc định tắt; cùng prompt, cùng bộ lọc 14 trường và timeout như đường đọc ảnh hiện có; `/api/health` chỉ hiện tên máy chủ, không lộ khóa.
- **Lô dựng sẵn cho buổi trình bày local** (`services/demo/**`, `TAX_REFEREE_DEMO_PRESET_BATCHES=1`, mặc định tắt): mỗi phiên demo mới có "Lô cuối tháng 10" (bộ 25 file XML tổng hợp trong `data/demo-batch/`, còn mở chờ KTT trả lời nhóm và chốt) và "Lô tuần 2" đã chốt. File trùng bị bỏ trước khi máy kiểm, không tạo hóa đơn mồ côi. `npm run demo:local` chạy bản build standalone có sẵn dữ liệu.
- **`/verify`:** dán mảng `[HĐ 1, HĐ 2]` để thử cụm mua cùng ngày (hóa đơn cuối được đánh giá, các hóa đơn trước làm lịch sử); form nhắc một lần khi để trống chứng từ thanh toán, bảng kê hay trạng thái MST mà quy định cần cho số tiền đó.
- **Công cụ:** `npm run channels:check` (kiểm Gmail IMAP/SMTP và Zalo Bot thật, gửi thử bằng `--send-test`, không in token); `scripts/demo/` (sinh bộ hóa đơn mẫu, quay video demo có giọng đọc); `scripts/slides/build_deck.py` (dựng deck vòng cải tiến).
- Migration 22 (chỉ cộng thêm: `batches`, `batch_items`, `staff_directory`, `channel_messages`, `outbound_notifications`) và migration 23 (`batch_items.posted_at`, người lấy thư của từng file kênh, mỗi hóa đơn chỉ thuộc một lô). Ma trận quyền thêm quyền cho lô, kênh, danh bạ, Tổng quan, Lịch sử và `ledger.export`.

### Sửa
- **Engine (lỗi tìm được khi mô phỏng giám khảo; test `tests/unit/judgeSimHardening.test.ts` đỏ trên mã cũ, xanh trên mã mới):**
  - Hóa đơn nhiều thuế suất (8% + 10%): thuế kỳ vọng tính theo nhóm thuế suất (`lib/invoiceMath.ts`, nguồn chung cho engine, câu hỏi và hệ quả đáp án); áp sai 8% xét theo từng dòng hàng khi có nhiều dòng, một dòng thì theo tên chung.
  - Danh mục loại trừ 8%: ô tô tải (kể cả bán tải ghi cabin đơn) không bị loại; ô tô con, bán tải/pick-up cabin kép hoặc không ghi loại cabin, tải VAN vẫn bị loại; "pick up" chỉ tính là xe khi đi sau "xe"/"ô tô" (không bắt "phí pick-up hàng"); dịch vụ sửa chữa, bảo dưỡng, thuê, phụ tùng, lốp, rửa xe bán tải không bị loại. Thuê văn phòng, mặt bằng, nhà xưởng, tiền thuê nhà, thuê đất bị loại như bất động sản (trừ thuê nhà hàng).
  - Quà tặng khách hàng/đối tác, quà trung thu được nhận là ngoài phạm vi tự duyệt; "bia hồ sơ" gõ không dấu không bị coi là đồ uống có cồn.
  - Câu hỏi: cụm tiền mặt cùng ngày nêu từng hóa đơn (số, tiền, cách trả) và tổng đúng như quy tắc đã cộng; câu hỏi 8% trung tính, không còn bị cắt cụt, tên dòng hàng cắt ngắn và tối đa 3 dòng để ý hỏi không quá 700 ký tự; đáp án B của câu hỏi 8% ghi đúng hệ quả (không khấu trừ toàn bộ VAT của hóa đơn); đáp án sửa số thuế chỉ tự sửa khi tổng in khớp số thuế tính lại, ngược lại phải nhập số theo chứng từ gốc.
  - Đầu vào: ô trống là chưa biết (hệ thống hỏi); hiểu "Tiền mặt", "Chuyển khoản", "Đang hoạt động" gõ tay; XML đọc thẻ `HTTToan`, "TM/CK" không đoán; tăng phiên bản bộ đệm trích xuất.
  - `npm run referee:diff`: 180 ca không đổi so với baseline của `main`.
- **Phiếu giải trình:** dòng thuế suất 8% nói đúng phép kiểm (tên hàng không khớp danh mục từ khóa loại trừ đang cấu hình), xét cả hóa đơn có dòng hàng 8%; ca tự duyệt nhờ tiền lệ CFO ghi rõ tiền lệ, không tô đỏ các phát hiện đã được tiền lệ giải tỏa.
- **Lô:** một hóa đơn chỉ nằm trong một lô; chỉ người tạo lô được gắn hóa đơn, và chỉ hóa đơn do chính người đó nhập; mỗi lần gắn có sự kiện `BATCH_ITEM_ATTACHED`; client không tự đặt nguồn Gmail/Zalo hay người gửi. Nhãn và mã lô theo giờ Việt Nam. Hóa đơn đã duyệt sau câu trả lời bổ sung dữ kiện (máy kiểm lại ra thường quy) có câu giải trình riêng thay cho "Máy dừng ở 0 điểm".
- **Sổ sách:** sổ và xuất chứng từ chỉ lấy hóa đơn đã duyệt không thuộc lô nào, hoặc đã được ghi sổ khi chốt lô.
- **Tổng quan:** "Đã được khấu trừ" chỉ cộng hóa đơn đã duyệt và đã ghi sổ; hóa đơn đã duyệt nhưng chưa ghi sổ (lô chưa chốt, hoặc duyệt sau khi chốt) hiện ở "Đã duyệt, chờ chốt lô".
- **Demo:** "Xóa dữ liệu demo" dọn cả bảng lô và kênh; dữ liệu nạp sẵn dùng MST riêng để ca chép từ `/verify` không bị gộp nhầm vào cụm cùng ngày; gợi ý `/verify` ghi mốc 5 triệu áp cho hóa đơn từ 01/7/2025.

### Bảo mật
- **Trả lời nhóm không xác nhận hộ số liệu:** không gộp câu xác nhận giá trị (`CONFIRM_FIELDS`, `NEED_VALUE`, `SET_FIELDS` kèm xác nhận trường) và ý ảnh mờ, số liệu lệch (`RULE_IMAGE_BLURRY`, `RULE_DATA_QUALITY`); bản gửi kèm phiên bản từng hóa đơn người duyệt đã thấy, hồ sơ vừa đổi thì bị chặn (409).
- **Chống mạo danh email:** tên miền SPF/DKIM phải trùng tên miền người gửi hoặc là miền con của nó (không nhận `example.com.evil.net`, `evilexample.com`); tách từng mệnh đề `Authentication-Results`, lấy tên miền sau `@` cuối cùng (chặn `example.com@evil.net`); bỏ comment và chuỗi trong ngoặc kép trước khi đọc.
- **Bất kiêm nhiệm ở kênh:** chỉ Kế toán viên (người nhập) lấy thư; KTT/CFO xác nhận người gửi lạ, sau đó file được xử lý dưới tên Kế toán viên đã lấy thư; người đã xác nhận người gửi không được tự trả lời, tự duyệt hay tự chốt chính hóa đơn đó.
- **Giới hạn nhận file:** tối đa 5 đính kèm mỗi thư, 50 file mỗi lượt, 10 file mỗi lượt từ người gửi chưa xác thực, và tổng hàng chờ xác nhận người gửi tối đa 100 file; phần vượt chỉ được đếm vào lượt lấy (không tạo dòng, không lưu nội dung). File trùng trong cùng lượt tính một lần; hóa đơn đã nằm ở lô khác được đánh dấu trùng, không tạo lô rỗng.
- **Truy vết:** mỗi file nhận qua kênh có sự kiện `CHANNEL_FILE_INGESTED` (mã nhân viên gửi, đã xác thực hay chưa; không ghi địa chỉ).
- **Cách ly phiên demo:** kênh thật và danh bạ thật (`TAX_REFEREE_STAFF_SEED`) không chạy trong phiên demo của người lạ; bộ gửi tin mô phỏng không bao giờ dùng người nhận thật (`GMAIL_NOTIFY_TO`, `ZALO_NOTIFY_CHAT_ID`).
- **Dữ liệu người gửi:** email/Zalo id trong danh bạ chỉ trả cho KTT/CFO; ở danh sách file nhận và tin đã gửi, Kế toán viên chỉ thấy địa chỉ đã che (email chỉ còn tên miền).
- **Sổ sách:** tải XML/CSV sổ cái (`GET /api/ledger/export`) và đẩy chứng từ (`POST /api/ledger/sync`) chỉ KTT/CFO (quyền `ledger.export`); xem trước danh sách (`GET /api/ledger/sync`) vẫn mở cho người đã đăng nhập. Ghi sổ gắn với nội dung lúc chốt (`posted_content_hash`): hồ sơ bị sửa sau khi chốt rời sổ cho tới khi được chốt bổ sung.
- **XML:** hai thẻ `<HTTToan>` bị từ chối là XML mơ hồ; hình thức thanh toán chỉ đọc ngoài dòng hàng (thẻ giả trong `<HHDVu>` không được chọn).
- **`/api/health`:** cảnh báo khi bật trên production các cờ chỉ dành cho máy local: `real_channels_in_demo`, `demo_preset_batches`, `dev_llm_enabled`; cùng cờ đăng nhập theo vai không mật khẩu `internal_role_login` (`TAX_REFEREE_ALLOW_INTERNAL_ROLE_LOGIN`).
- Zalo: chỉ tải ảnh từ máy chủ Zalo (https, không cổng lạ, không theo chuyển hướng) để chống SSRF.

### Tài liệu
- Kịch bản demo theo lô chạy local (`docs/handoff/KICH-BAN-DEMO-LO-17-10.md`), hướng dẫn bật Gmail/Zalo thật (`docs/handoff/KET-NOI-GMAIL-ZALO.md`), kịch bản thuyết trình và bộ hỏi đáp phản biện (`docs/submission/KICH-BAN-THUYET-TRINH-17-10.md`, `docs/submission/HOI-DAP-PHAN-BIEN-17-10.md`).
- Deck vòng cải tiến 11 slide (`docs/submission/Tax-Referee-trinh-bay-cai-tien-17-10.pptx`, kèm PDF) và video demo 1 phút 24 giây có giọng đọc; bản nộp 5 slide giữ nguyên.
- Sơ đồ kiến trúc vòng cải tiến (`docs/diagrams/src/kien-truc-cai-tien.mmd`); ảnh màn hình mới trong `docs/submission/screens/`.
- README thêm mục xử lý theo lô và kênh, bảng API, cấu hình và bảng thật/giả lập cập nhật; `.env.example` thêm `DEV_LLM_*`, `GMAIL_*`, `ZALO_*` và ba cờ chỉ dành cho máy local.
- Trang `/privacy` và tài liệu nói đúng phạm vi: nội dung XML do máy đọc, không gửi AI để đọc; tên/MST người bán có thể được gửi tới dịch vụ tra cứu bên thứ ba (VietQR; Xinvoice và doanhnghiep.vn nếu cấu hình khóa) và tới công cụ tìm kiếm của nhà cung cấp AI giới hạn nguồn `.gov.vn`.
- Ngưỡng số kiểm tra của bộ unit: xem `minChecks` trong `scripts/qa/run-all.ts`.
- Lưu ý số PR trong lịch sử: hai merge commit `5ef3bf5` ("Merge pull request #10 … fix/codeql-findings") và `c15e22c` ("Merge pull request #11 … legal-sync") là PR của repo cá nhân của Minh (@bminhnemhoi), không phải PR #10 (`docs/repo-polish`) và PR #11 (`fix/legal-citations`) của repo đội. Lịch sử không bị viết lại.

### Hạ tầng
- Phụ thuộc mới cho kênh Gmail: `imapflow`, `mailparser`, `nodemailer`.
- Lệnh npm mới: `channels:check`, `demo:local`.

### Giới hạn đã biết
- Ảnh/PDF nhận qua Gmail/Zalo được **lưu nhưng chưa tự đọc** (trạng thái `QUEUED`, nhãn "Ảnh/PDF đã lưu — chưa tự đọc"); muốn đọc thì tải ảnh lên ở màn Lô hóa đơn hoặc Tiếp nhận.
- Zalo Bot viết theo tài liệu bot.zaloplatforms.com; ảnh nằm ngoài các tên miền CDN Zalo đã biết bị từ chối, cần bổ sung sau khi xem payload thật.
- Số trên màn hình lô dựng sẵn (khoảng 10 máy đề xuất duyệt, 12 cần người, 1 tạm giữ, 1 lỗi; lô 24 dòng) phụ thuộc engine hiện tại và không có test khóa số chính xác; khi trình bày đọc theo màn hình.
- Danh mục loại trừ 8% và phạm vi SOP vẫn nhận diện bằng từ khóa tên hàng, nên có thể chặn thừa hoặc bỏ sót mặt hàng gọi tên khác; ca chặn thừa được chuyển cho KTT.

## [1.1.0] — 2026-10-17 — Sửa lỗi bảo mật đọc XML và nâng cấp repo

> Chưa có tag trên repo đội; các thay đổi này lên live cùng PR vòng cải tiến 17/10 khi được merge vào `main`.

### Bảo mật
- **Đọc XML không còn lệch do CDATA, chú thích, processing instruction, `>` trong thuộc tính hay tham chiếu ký tự:** chuẩn hóa trước mọi trích xuất. Trước đây hóa đơn chứa `2<![CDATA[2]]>880000` được đọc thành 2.880.000₫ trong khi phần mềm kế toán và cơ quan thuế đọc 22.880.000₫ — đủ để lọt ngưỡng tiền mặt và hạn mức Kế toán trưởng.
- **XML mơ hồ bị từ chối (fail-closed):** phần tử tổng tiền/số hóa đơn trùng tên ở phần đầu, khối bên bán/bên mua trùng, dòng hàng lồng nhau; tham chiếu tới ký tự cấm, `&` lẻ. Trước đây regex lấy phần tử trùng tên đầu tiên, nên một khối mở rộng đặt trước phần tổng thật làm hóa đơn 220 triệu thành 2,2 triệu và được tự duyệt.
- **XML và CSV sổ cái (beta):** escape mọi giá trị và loại ký tự cấm trong XML; CSV nhân đôi nháy kép, vô hiệu công thức — chặn chèn phần tử, cột hay dòng giả.
- **File tạm PDF:** thư mục riêng quyền 700, file 600, luôn được dọn; xóa hàm PDF→PNG không còn dùng.
- Bộ đệm trích xuất đổi phiên bản (`xml-canon-1`) để kết quả đọc theo cách cũ không bị dùng lại.
- Nguồn phát hiện: cảnh báo CodeQL cho lỗi đọc XML (CDATA, tham chiếu ký tự) và file tạm PDF; lỗi XML/CSV sổ cái và XML mơ hồ không có cảnh báo CodeQL riêng, được tìm ra khi phân loại và phản biện. Mỗi cảnh báo được phân loại và phản biện độc lập, bản sửa được phản biện lần hai (tìm ra và đã chặn một đường lệch mới qua processing instruction). Test hồi quy `tests/unit/xmlIntegrity.test.ts` (unit 103 → 110 kiểm tra), kiểm chứng ngược: 6/7 ca thất bại trên mã cũ.
- **Giới hạn còn lại:** trích theo tên thẻ, chưa theo đường dẫn schema — thẻ đồng nghĩa ưu tiên cao hơn (ví dụ `GrandTotal` so với `TotalAmount`) vẫn có thể được chọn (phép kiểm số học bắt trường hợp số không khớp); chuyển chuỗi thành số còn dễ dãi. Phép kiểm trùng tên có thể từ chối nhầm hóa đơn có bảng tổng hợp theo thuế suất dùng thẻ `TaxAmount`/`VATAmount`/`TotalAmount` ngoài dòng hàng (khi đó dùng PDF hoặc nhập tay) — cần thử với XML nhiều thuế suất thật trước khi đưa lên live.

### Tài liệu
- README viết lại: mục lục, kiến trúc (Mermaid), bảng bảo mật 4 trụ, cấu hình, API, giới hạn.
- Thêm `SECURITY.md`, `CODE_OF_CONDUCT.md`, `CHANGELOG.md`, `THIRD_PARTY_NOTICES.md`, mẫu issue/PR, mục lục tài liệu [`docs/README.md`](docs/README.md).
- `.env.example` bổ sung các biến mới (ngân sách AI, chống hạ cấp chữ ký, khóa audit tự sinh); `package.json` có metadata giấy phép và repository.
- Ảnh giao diện thật chụp từ bản live (`docs/screenshots/`), mục thuật ngữ, `CITATION.cff`; đồng bộ các tài liệu còn ghi số liệu cũ (buổi thử người dùng, số quy tắc, trạng thái PR, yêu cầu Node).
- Bằng chứng live sau deploy PR #8: [`docs/evidence/live-2026-10-16-post-deploy.json`](docs/evidence/live-2026-10-16-post-deploy.json).

### Hạ tầng repo
- CI: quyền token tối thiểu (`contents: read`), action ghim theo SHA, `concurrency`, `timeout-minutes`, thêm Node 24 trên Ubuntu.
- CodeQL quét JavaScript/TypeScript, Python và workflow; Dependabot cập nhật hằng tuần (bỏ qua `better-sqlite3` đang ghim cho Hostinger và mọi bản nâng major).
- `CODEOWNERS`, `.gitattributes` (LF), `.nvmrc` (Node 22); `.gitignore` chặn gói nộp bài `.zip` và bộ cài Python cục bộ.

## [1.0.0] — 2026-10-16 — Bảo mật hệ có agent AI cho Demo Day (PR [#6](https://github.com/khanhle1406/Tax-Referee/pull/6), [#7](https://github.com/khanhle1406/Tax-Referee/pull/7), [#8](https://github.com/khanhle1406/Tax-Referee/pull/8))

### Bảo mật
- **Ranh giới đầu ra Vision:** chỉ nhận 14 trường nhìn thấy trên chứng từ (`VISION_ALLOWED_KEYS`); trường lạ bị loại và ghi lại; bỏ tên file khỏi prompt; dấu vết `agent:vision@model#hash-prompt`.
- **Chuyển trạng thái ngược không nới lỏng kiểm soát:** hoàn tác không gỡ lệnh giữ do người khác đặt; lệnh giữ thuế của CFO chỉ CFO gỡ; duyệt chỉ hợp lệ khi hồ sơ đang chờ duyệt.
- **Thẩm quyền không hạ theo số tiền:** ca từng cần CFO vẫn chờ CFO khi người khác sửa số tiền; người nhập không tự xác nhận dữ liệu của chính mình.
- **Ngân sách gọi AI** (OWASP LLM10) cho đọc ảnh và tra cứu có grounding; vượt ngân sách thì fail-closed.
- **Rollback policy cũng bị kiểm nới lỏng:** quay về bản cũ mà nới lỏng kiểm soát thì người thực hiện phải là CFO; sửa danh mục nhà cung cấp được ghi nhật ký.
- **Nhật ký:** chống hạ cấp chữ ký (`TAX_REFEREE_AUDIT_SIGNED_SINCE`); production tự sinh khóa HMAC (`.audit-key`) khi chưa cấu hình.
- Tiến trình đọc PDF chỉ nhận biến môi trường trong danh sách cho phép.

### Thêm
- Trang **`/trust`**: ma trận quyền (8 principal, 20 quyền) và 12 phép thử tấn công chạy trên mã đang deploy, mỗi phép thử trên database `:memory:` riêng.
- `/api/health` có thêm `ai`, `warnings`, nguồn khóa audit; commit được ghi vào bản build.
- Tài liệu [mô hình mối đe dọa](docs/security/threat-model.md), [kiến trúc demo → production](docs/architecture/demo-to-production.md), [bàn giao Demo Day](docs/handoff/BAN-GIAO-DEMO-DAY-17-10.md); harness `.claude/` (agent chuyên gia, hook chặn lệnh nguy hiểm, skill kiểm chứng).

### Sửa
- Cụm tiền mặt cùng ngày không còn phụ thuộc thứ tự nhập hóa đơn.
- Giảm báo nhầm danh mục loại trừ thuế suất 8% (viễn thông, ô tô).
- Đóng ca bẫy U2 ("tiệc cưới người thân giám đốc") sau buổi thử 16/10.
- Giới hạn tạo phiên demo mặc định 200/giờ/IP.

## 2026-10-15 — Cải tiến từ nghiên cứu (PR [#5](https://github.com/khanhle1406/Tax-Referee/pull/5))

### Thêm
- **Hậu kiểm ngẫu nhiên** ca máy tự duyệt: 10%, gấp 3 ở vùng sát ngưỡng, chọn mẫu bằng HMAC; tỉ lệ đồng thuận người–máy kèm khoảng Wilson 95%.
- **Nguyên tắc bốn mắt cho policy:** bản nháp nới lỏng kiểm soát cần CFO khác người soạn.
- **Điểm neo nhật ký** (`/api/audit/anchor`): phát hiện cắt đuôi hoặc viết lại so với điểm neo lưu ngoài hệ thống.
- Phát hiện **tách nhỏ hóa đơn** để né hạn mức.
- **Cụm tiền mặt cùng ngày** vượt ngưỡng: giữ thuế cả các hóa đơn tiền mặt cùng bên bán đã tự duyệt trước đó (sự kiện `LINKED_CASH_HOLD`).
- **Căn cứ pháp lý theo ngày lập:** danh mục loại trừ 8% theo NQ 204/2025; khung hóa đơn TT 78/2021 → TT 32/2025 → NĐ 254/2026 + TT 91/2026 (số hiệu và hiệu lực theo nguồn thứ cấp).
- Trùng hóa đơn khác cách ghi số ("123" = "0000123"); **kiểm thử thuộc tính** bằng fast-check.
- Tổng hợp 63 nguồn nghiên cứu: [docs/research/nghien-cuu-lien-quan.md](docs/research/nghien-cuu-lien-quan.md).

## 2026-10-15 — Track A hardening và hồ sơ nộp bài (PR [#1](https://github.com/khanhle1406/Tax-Referee/pull/1) → [#4](https://github.com/khanhle1406/Tax-Referee/pull/4))

### Thêm
- Ba kiểu dừng nhất quán (chưa rõ thông tin / ngoài quy định / vượt thẩm quyền) từ một bảng phân loại duy nhất.
- Câu hỏi chuyển tiếp trả lời trong một câu ("1A, 2B") ngay trên hồ sơ; không chuyển tiếp thừa nhờ ngưỡng trọng yếu.
- Verify chế độ giám khảo: 9 ca một nút, dấu thời gian từng ca, câu hỏi hiển thị ngay.
- Nhật ký chỉ ghi thêm + HMAC; công tắc dừng tự động hóa toàn hệ thống.
- `npm test` chạy được trên Windows và Linux; CI GitHub Actions.
- `CONTRIBUTING.md`; danh mục nộp bài, bằng chứng Verify live, build log.

### Bảo mật
- Chặn leo thang thành CFO và chèn sự kiện nhật ký giả.
- Dữ liệu nghi vấn (đọc từ ảnh, lệch chứng từ gốc) không được coi là đã xác minh.

### Minh bạch
- Gỡ 3 persona giả định kèm trích dẫn không có thật do bản nháp AI tạo (commit `3ace396`); gắn đính chính cho bảng số liệu không có lần chạy tương ứng (commit `997ba93`). Không viết lại lịch sử.

## 2026-09-22 → 2026-10-13 — Giai đoạn đầu và Sprint 1

- Khởi tạo hệ thống: parser XML hóa đơn điện tử, policy engine, SQLite, sổ cái và adapter ERP (beta), trung tâm thông báo, luồng cập nhật văn bản pháp luật.
- Đọc ảnh/PDF scan bằng Gemini Vision; gỡ các engine AI cũ.
- Siết khâu đọc chứng từ (chặn `DOCTYPE`/`ENTITY` — XXE) và quy trình thẩm định; workspace cho kế toán.
- Verify chạy tất định, không gọi AI (13/10).
