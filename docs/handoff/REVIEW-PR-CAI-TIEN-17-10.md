# Hướng dẫn review PR "Cải tiến vòng 17/10" (dành cho người review và AI review)

> Viết cho: Khánh (chủ repo, người merge) và trợ lý AI review của repo đội. Merge vào `main` = **deploy production** (hPanel tự deploy).
> Base: `main` của `khanhle1406/Tax-Referee` (đã gộp `e9e4407` và `9fd3e98` — PR #15, #16 — vào nhánh bằng merge commit, không rebase). Lịch sử giữ nguyên (không squash, không force-push), nên hãy merge bằng **merge commit**.

## 1. PR này làm gì (một đoạn)

Biến Tax Referee từ "kiểm từng hóa đơn" thành **xử lý theo lô có người chốt**:
1. **Máy quyết.** Engine tất định kiểm từng hóa đơn như cũ (180 quyết định baseline không đổi) và kèm **phiếu giải trình** nói rõ vì sao duyệt hoặc vì sao dừng.
2. **Người chốt.** Kế toán trưởng/CFO trả lời chung cho nhóm câu hỏi giống nhau, rồi **ký chốt lô** trước khi ghi sổ. Ghi sổ đánh dấu theo từng hóa đơn; hóa đơn duyệt sau phải chốt bổ sung.
3. **Ba kênh nhận hóa đơn.** Hóa đơn vào qua tải lên, Gmail hoặc Zalo. Hệ thống **nhận diện người gửi** qua danh bạ và SPF/DKIM để chống mạo danh. Phiên demo dùng Gmail/Zalo **mô phỏng**.
4. **Màn hình cho sếp và cho từng người:** **Tổng quan cho sếp**, **Lịch sử của tôi**, trang **/privacy** "Dữ liệu của bạn đi đâu".

PR còn gồm:
- bản sửa engine từ mô phỏng giám khảo, tức nội dung PR #13;
- bản v1.1.0: sửa bảo mật đọc XML, xuất sổ cái, file tạm PDF;
- tài liệu, slide, video, kịch bản demo của vòng cải tiến.

## 2. Góp ý của giám khảo → thay đổi → mã → test

| Góp ý | Thay đổi | Mã chính | Test |
|---|---|---|---|
| "Phải làm theo lô"; "lô lớn xử lý thế nào" | Tải nhiều file, thứ tự cố định MST → ngày → số, bỏ file trùng, trả lời nhóm, chốt lô | `services/batchService.ts`, `components/workspace/BatchesView.tsx`, `app/api/batches/**` | `tests/unit/batchControl.test.ts`, `demoBatchPreset.test.ts` |
| "Không được auto duyệt cho tài chính" | Máy chỉ đề xuất. Hóa đơn trong lô chỉ vào sổ khi KTT/CFO chốt (`batch_items.posted_at`). Xuất/tải sổ chỉ KTT/CFO (`ledger.export`) | `LEDGER_READY_SQL` trong `batchService.ts`, `app/api/ledger/**`, `lib/capabilities.ts` | `batchControl.test.ts` (chốt lô, chốt bổ sung, sổ sách), `authzMatrix.test.ts` |
| "Có trigger cho người kiểm" | Câu hỏi đúng người "1A, 2B" (có sẵn); Tổng quan "Đang chờ anh/chị quyết định"; báo tin email/Zalo cho KTT sau mỗi lượt lấy thư | `services/dashboardService.ts`, `services/channels/notifier.ts` | `dashboardHistory.test.ts`, `channels.test.ts` |
| "Nếu duyệt thì vì sao tin; không duyệt thì highlight vì sao" | Phiếu giải trình: từng điều kiện đạt/trượt kèm số, ô đỏ đúng quy tắc và trường | `lib/explainDecision.ts` | `batchControl.test.ts` (test 1), `vat8ExplainFixes.test.ts` |
| "Dashboard cho các sếp" | Tổng quan KTT/CFO: hóa đơn đi đâu, VAT đã ghi sổ, chờ chốt, lý do dừng, theo người gửi | `services/dashboardService.ts`, `DashboardView.tsx` | `dashboardHistory.test.ts` |
| "Privacy, các bộ luật" | Trang /privacy; căn cứ thuế theo ngày lập (PR #11 đã merge); cách ly kênh thật khỏi phiên demo; che địa chỉ người gửi với Kế toán viên | `app/privacy/page.tsx`, `services/channels/demoMock.ts`, `lib/legalBasis.ts` | `channels.test.ts`, `legalCitations.test.ts` |
| Đội đề xuất: nhận qua Gmail/Zalo, biết ai gửi | Danh bạ người gửi + SPF/DKIM, nghi mạo danh, chờ xác nhận người lạ | `services/staffDirectory.ts`, `services/channels/**` | `channels.test.ts` |

## 3. Bất biến phải giữ (AI review nên kiểm từng dòng)

1. **Quyết định engine không đổi:** `npm run referee:diff` in `KHÔNG ĐỔI / 180 ca`. Ảnh chụp `data/verification/decision-snapshot.json` không bị sửa trong PR (`git diff origin/main...HEAD -- data/verification/` rỗng).
2. **Không hóa đơn nào trong lô vào sổ mà không qua chốt:** mọi truy vấn sổ trong `app/api/ledger/**` có `AND ${LEDGER_READY_SQL}`. `posted_at` và `posted_content_hash` chỉ được đặt trong `signOffBatch` (grep `posted_`); hồ sơ bị sửa sau khi chốt (mã băm nội dung khác) rời sổ cho tới khi chốt bổ sung.
3. **Bất kiêm nhiệm khi chốt:**
   - Kế toán viên không chốt được.
   - Người tạo lô không chốt được.
   - Người nhập hóa đơn không chốt chính hóa đơn đó.
   - Người đã xác nhận người gửi lạ cho hóa đơn không trả lời, duyệt hay chốt chính hóa đơn đó (`senderConfirmedBy`).
   - Hóa đơn từ hạn mức CFO (mặc định 200 triệu) chỉ CFO chốt.
   - Chốt bổ sung áp cùng các luật trên (`signOffBlockers`).
4. **Trả lời nhóm an toàn:**
   - Chỉ gộp các ý cùng quy tắc, cùng dạng câu và cùng hệ quả.
   - Không bao giờ gộp câu xác nhận giá trị (`CONFIRM_FIELDS`, `NEED_VALUE`, `SET_FIELDS` kèm `confirm`, `RULE_IMAGE_BLURRY`, `RULE_DATA_QUALITY`).
   - Mỗi hóa đơn vẫn đi qua `answerHandoff` với đúng phiên bản người duyệt đã thấy (`questionKey`, `answerGroup`).
5. **Kênh:**
   - Chỉ Kế toán viên lấy thư (`channel.pull`).
   - File của người lạ hoặc thư không qua SPF/DKIM của đúng tên miền thì không bao giờ được máy kiểm tự động.
   - Tên miền so khớp chính xác hoặc là miền con; bỏ quoted-string và comment trước khi đọc (`emailAuthenticated`).
   - Trần 5 file/thư, 50 file/lượt, 10 file/lượt từ người gửi chưa xác thực, hàng chờ xác nhận tối đa 100 file; phần vượt không tạo dòng, không lưu nội dung.
6. **Cách ly phiên demo:**
   - Phiên demo không bao giờ kéo hộp thư thật và không ghi người nhận thật (`demoChannelsActive`, `notify`), trừ khi chủ máy đặt `TAX_REFEREE_ALLOW_REAL_CHANNELS_IN_DEMO=1`.
   - Cờ này, `TAX_REFEREE_DEMO_PRESET_BATCHES`, `DEV_LLM_ENABLED` và `TAX_REFEREE_ALLOW_INTERNAL_ROLE_LOGIN` mà bật trên production thì `/api/health` có cảnh báo.
7. **Đường quyết định không gọi AI:** XML nhận qua kênh được kiểm bằng `forceLocalOnly`. Service lô, giải trình, tổng quan, lịch sử không import client AI.
8. **Migration chỉ cộng thêm:**
   - Migration 22 tạo bảng `batches`, `batch_items`, `staff_directory`, `channel_messages`, `outbound_notifications`.
   - Migration 23 thêm cột `posted_at`, `posted_by_user_id`, `posted_content_hash`, `pulled_by_user_id`, thêm `UNIQUE(batch_items.invoice_id)` và backfill cho lô đã chốt.
   - Không xóa hay đổi cột cũ.

## 4. Lệnh kiểm chứng (chạy tuần tự) và kết quả mong đợi

```bash
npm ci
npx tsc --noEmit          # không lỗi
npm run lint              # không lỗi
npm test                  # "16/16 bộ kiểm thử đạt"; bộ unit ≥ 169 kiểm tra (scripts/qa/run-all.ts)
npm run referee:diff      # "KHÔNG ĐỔI / 180 ca"
npm run build             # "Compiled successfully"
```
Kết quả trên máy tác giả, ngày 17/10/2026, sau commit cuối của PR:
- tsc và lint sạch;
- 16/16 bộ test, unit 169 kiểm tra;
- `referee:diff` không đổi;
- build thành công.

**Chạy thử giao diện (tùy chọn):** `npm run demo:local -- --build` → mở `http://127.0.0.1:3060` → vai **Kế toán viên** → "② Mở hộp chuyển tiếp — demo riêng". Phiên có sẵn 2 lô mẫu vì cờ `TAX_REFEREE_DEMO_PRESET_BATCHES=1` chỉ bật trong lệnh này. Kịch bản từng bước: `docs/handoff/KICH-BAN-DEMO-LO-17-10.md`.

## 5. Bản đồ rủi ro (review kỹ theo thứ tự)

| Mức | File | Điểm cần nhìn |
|---|---|---|
| Cao | `services/batchService.ts` | `LEDGER_READY_SQL`, `signOffBlockers`/`signOffBatch` (chốt bổ sung, transaction), `questionKey` (điều kiện gộp), `answerGroup` (members/phiên bản), `attachToBatch` (chỉ hóa đơn của chính người tạo lô) |
| Cao | `app/api/ledger/export/route.ts`, `app/api/ledger/sync/route.ts` | cổng vai trò KTT/CFO, điều kiện sổ |
| Cao | `lib/server/db.ts` (migration 22, 23) | chỉ cộng thêm; UNIQUE index trên DB production (tính năng lô mới nên chưa có dữ liệu) |
| Cao | `services/staffDirectory.ts` `emailAuthenticated`, `services/channels/channelService.ts` | chống mạo danh, trần file, người lấy thư/xác nhận, chống tạo lô rỗng |
| Cao | `services/policyEngine.ts` `ttdbVehicle` | chỉ giảm chặn thừa (xe cabin đơn, dịch vụ cho xe bán tải); `referee:diff` không đổi |
| Trung bình | `services/channels/notifier.ts`, `demoMock.ts`, `services/dashboardService.ts`, `lib/explainDecision.ts`, `services/questionBuilder.ts`, `components/workspace/*View.tsx` | câu chữ đúng hệ quả, số liệu Tổng quan khớp Lô |
| Thấp | `docs/**`, `README.md`, `CHANGELOG.md`, `scripts/demo/**`, `scripts/slides/**`, `data/demo-batch/**`, deck/video | khớp mã, không danh tính repo khác |

## 6. Cấu hình mới (chỉ tên biến; mặc định đều TẮT)

| Biến | Tác dụng | Production |
|---|---|---|
| `GMAIL_IMAP_USER`, `GMAIL_APP_PASSWORD`, `GMAIL_NOTIFY_TO`, `ZALO_BOT_TOKEN`, `ZALO_NOTIFY_CHAT_ID` | Kênh Gmail/Zalo thật cho workspace nội bộ | Tùy chọn; thiếu thì Hộp thư vào hiện "Chưa cấu hình" (phiên demo dùng mô phỏng) |
| `TAX_REFEREE_ALLOW_REAL_CHANNELS_IN_DEMO` | Cho phiên demo dùng kênh thật (chỉ máy của đội) | **Không đặt.** `/api/health` cảnh báo `real_channels_in_demo` |
| `TAX_REFEREE_DEMO_PRESET_BATCHES` | Phiên demo mới có sẵn 2 lô mẫu | **Không đặt.** Cảnh báo `demo_preset_batches` |
| `TAX_REFEREE_STAFF_SEED` | Danh bạ người gửi thật (JSON), không nạp vào phiên demo | Tùy chọn |
| `DEV_LLM_ENABLED`, `DEV_LLM_BASE_URL`, `DEV_LLM_API_KEY`, `DEV_LLM_MODEL` | LLM đọc ảnh dành cho demo | **Không đặt.** Cảnh báo `dev_llm_enabled` |

Gói mới: `imapflow`, `mailparser`, `nodemailer` (cùng `@types`).

## 7. Sau khi merge (merge = deploy)

Chờ 2–5 phút rồi kiểm:
1. `/api/health`: `commit` là merge commit mới, HMAC bật, `warnings` không có `real_channels_in_demo`, `demo_preset_batches` hay `dev_llm_enabled`. Nếu production cố ý bật `TAX_REFEREE_ALLOW_INTERNAL_ROLE_LOGIN` thì sẽ thấy cảnh báo mới `internal_role_login` — đúng ý đồ, không phải lỗi deploy.
2. `/verify` đạt 9/9.
3. `/trust` → "Chạy 12 phép thử tấn công" đạt 12/12.
4. `/privacy` mở được.
5. Phiên demo → **Lô hóa đơn** → tải vài file trong `data/demo-batch/` → thấy phiếu giải trình.
6. **Hộp thư vào** hiện "Mô phỏng · dữ liệu mẫu".

**Rollback:** `git revert -m 1 <merge-commit>` rồi đẩy lên `main`. Bảng và cột của migration 22–23 vẫn còn nhưng vô hại, vì mã cũ không đọc chúng.

## 8. Quan hệ với PR khác

- **PR #13** (`fix/judge-sim-hardening`): toàn bộ commit đã nằm trong nhánh này (đầu nhánh `fe535d0` là tổ tiên của HEAD). Merge PR này thì có thể đóng #13.
- **PR #14** (bản nháp `codex/fix-local-document-api`): cũng **thêm** `services/dashboardService.ts` và di chuyển `input-sample/`, nên sẽ xung đột thêm/thêm. Đề nghị merge PR này trước, rồi làm lại #14 trên `main` mới (hoặc đóng nếu trùng chức năng).

## 9. Giới hạn đã biết (nói thẳng)

- **Ảnh/PDF nhận qua Gmail/Zalo:** được lưu nhưng **chưa tự đọc** (trạng thái "đã lưu — chưa tự đọc"); muốn đọc thì tải ảnh ở màn Lô hóa đơn hoặc Tiếp nhận.
- **Lô lớn:** trình duyệt đọc và kiểm từng file tuần tự, chưa có hàng đợi phía máy chủ; chưa đo tải 1.000 hóa đơn.
- **Lô không đóng được:** lô rỗng hoặc lô chỉ có file lỗi (tải lên) chưa đóng được vì chưa có "đóng lô không ghi sổ".
- **Hóa đơn nhập lẻ:** hóa đơn nhập ở màn Tiếp nhận (không qua lô) vẫn được máy đặt "Đã duyệt"; xuất hay tải sổ vẫn cần KTT/CFO.
- **SPF/DKIM:** chỉ xác thực **tên miền** người gửi, không xác thực từng hộp thư.
- **Gmail:** mỗi lượt tải tối đa 20 thư vào bộ nhớ.
- **Việc của kế hoạch v1.2** (sẽ đổi quyết định, cần review nghiệp vụ riêng):
  - định nghĩa cụm tiền mặt cùng ngày (kết quả còn phụ thuộc thứ tự nạp);
  - thêm từ khóa loại trừ 8% (cát, tôn, điều hòa theo BTU…);
  - câu hỏi 8% có đáp án "8% đúng";
  - khấu trừ một phần.

## 10. Những điểm cần Khánh quyết (không tự sửa bằng mã)

- **Hai merge commit của repo cá nhân:**
  - Hai commit này sẽ vào lịch sử: `5ef3bf5` "Merge pull request #10 from bminhnemhoi/fix/codeql-findings" và `c15e22c` "Merge pull request #11 from bminhnemhoi/legal-sync".
  - Đây là PR của repo cá nhân, **không phải** PR #10/#11 của đội; GitHub có thể tự gắn liên kết nhầm.
  - Không viết lại lịch sử, theo luật của đội.
- **Tag:** repo đội chưa có tag `v1.0.0`/`v1.1.0`; tag chỉ có ở repo cá nhân.
- **File đề bài gốc:** nhánh xóa `brainstorming/Challenge_Brief_OrganizationAI_VN.docx`, vì đề bài là tài liệu của Ban tổ chức, không thuộc giấy phép MIT; file vẫn còn trong lịch sử. Muốn giữ thì khôi phục từ `main`.
- **CodeQL và Dependabot:** CodeQL chạy lần đầu sẽ tạo cảnh báo ở tab Security; Dependabot sẽ tự mở PR hằng tuần (không tự merge).
- **Deck 11 slide:** dành cho vòng cải tiến; bản nộp 5 slide vẫn còn trong `docs/submission/`.
