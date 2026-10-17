# Playbook vòng cải tiến 4 giờ: Tax Referee (MLAI Hackathon 2026, Track VNG, Đề A)

> Nguyên tắc số 1: **ship một lát nhỏ chạy đúng trên live, đừng ship bản lớn còn lỗi.** Merge vào `main` của `khanhle1406/Tax-Referee` là deploy production. Live: `https://limegreen-salamander-517622.hostingersite.com`.
>
> Đi kèm: skill `.claude/skills/sprint-4h`, workflow `.claude/workflows/sprint-verify.js`, sổ tay sửa mã theo tên hàm [SPRINT-4H-COOKBOOK.md](SPRINT-4H-COOKBOOK.md) (công thức R1–R9).

## Thang điểm cần bảo vệ (nguyên văn đề, `scratch/challenge_brief.txt`)

Vòng Chung kết – Kiểm thử toàn diện (20 điểm): Ban giám khảo đưa ra **5 trường hợp mới dựa trên tài liệu quy định của đội thi**, trong đó có khoảng 2 trường hợp cần chuyển tiếp.

| Tiêu chí | Điểm | Hệ quả cho mọi thay đổi trong vòng 4 giờ |
|---|---|---|
| Chuyển tiếp đúng cả 2 trường hợp và phân loại chính xác (4 điểm nếu đúng 1/2) | 8 | Không làm yếu quy tắc nào; nhóm dừng phải đúng 3 nhóm của đề |
| 3 trường hợp thường quy xử lý tự động hoàn toàn (3 điểm nếu sai 1, 0 điểm nếu sai từ 2) | 6 | Thay đổi nào làm tăng chuyển tiếp trên ca thường quy là **không ship** — kiểm bằng `referee:diff` |
| Câu hỏi cụ thể, người xử lý quyết định ngay trong một câu trả lời mà không cần tra cứu hồ sơ gốc (3 điểm nếu vẫn cần tra cứu) | 6 | Câu hỏi phải nêu số ₫, dữ kiện và hai đáp án A/B có hệ quả đúng như nhãn |

Yêu cầu nâng cao Đề A (Sprint 2) còn có thể bị hỏi: tự điều chỉnh ngưỡng theo phản hồi; báo tỉ lệ bỏ sót và tỉ lệ chuyển thừa trên **tập kiểm thử độc lập**; thử nghiệm với ít nhất 3 nhân sự thực tế.

## 0. Hiện trạng (cập nhật 17/10, sau khi Khánh merge PR #9–#12)

| Mục | Hiện trạng | Việc cần làm |
|---|---|---|
| `origin/main` | `94d7452` (PR #9–#12 đã merge), đang chạy trên live. `live:check`: HMAC bật, Verify 9/9, `/trust` 12/12, CI trên `main` xanh | — |
| PR #11 vá căn cứ pháp lý · PR #12 công cụ vòng thi | Đã merge và đã lên live; trên live không còn chuỗi `${…}`, văn bản kèm quyết định chỉ gồm văn bản đã đối chiếu | — |
| PR #13 `fix/judge-sim-hardening` (lỗi mất điểm tìm được khi mô phỏng kiểm thử chung kết) | CI và phản biện đang chạy; `referee:diff` 0/180; unit 117 | Người dùng quyết định merge trước giờ G hay không |
| CI | 3,5–4,5 phút (6 lần chạy gần nhất); chạy Ubuntu, Windows rồi build | — |
| Deploy | Live khởi động lại khoảng 97 giây sau merge | — |
| `referee:diff` | 180 ca, khoảng 2,4 giây | — |
| Thư mục làm việc | Sạch, trừ 3 mục chưa track: `Python/`, `NOP-BAI-Fprinciples.zip`, `Feedback_Doanh_Nghiep_Fprinciples.md` | **Không bao giờ `git add -A`** |

**Thực tế cần biết trước khi hứa với BTC (đã kiểm trên mã):**
- DB là SQLite ghi ra đĩa (`lib/server/db.ts`). Nhận xét "in-memory" của giám khảo ở Sprint 1 đã lỗi thời. Bằng chứng là `audit.events` không giảm sau deploy.
- XML đã có bí danh thẻ: `TotalAmount`, `GrandTotal`, `TotalAmountWithVAT`…
- `POST /api/verify` với `sampleType:'CUSTOM'` đã chạy được **một hóa đơn bất kỳ trên live, không cần đăng nhập**. Đây là đường demo dùng chung cho nhiều yêu cầu. Lưu ý: route này **cứng MST bên mua `0102030405`**. JSON demo phải có `buyerTaxCode` bằng số này hoặc bỏ trống. Nếu không, quy tắc lệch MST người mua sẽ chuyển tiếp mọi ca.
- `evaluate:independent` bắt **≥20 ca**, có đủ nhãn (`labeledBy`, `labeledAt`, `rationale`, `provenance` ≥8 ký tự) và phải khóa bằng `labels:lock`. Bài kiểm thử theo đề chỉ có 5 ca, nên phải gọi thẳng `evaluateRefereeCases` (xem Y1).
- Ngày lập tương lai chỉ bị chặn khi muộn hơn hôm nay quá 183 ngày (`getDataQualityIssue`, `services/policyEngine.ts`).

### Trước giờ G (T−45 phút) — checklist
1. [x] PR #9–#12 đã merge (Khánh, 17/10). PR #13: chỉ merge khi CI xanh và phản biện không còn blocker; nhắn nhóm trước khi merge.
2. [ ] `npm run live:check -- --expect-commit <sha7 merge cuối>`. Kỳ vọng: `hmac:true`, `warnings:[]`, Verify 9/9, `/trust` 12/12.
3. [x] `npm run referee:diff` trên `main` mới: KHÔNG ĐỔI / 180 ca.
4. [ ] **Đo thời gian trên máy này** và ghi vào đây: `npx tsc --noEmit` ___ phút; `npm test` ___ phút; `npm run build` ___ phút.
5. [ ] Lưu số đo "trước" vào scratchpad (không commit): JSON `/api/health` (đặc biệt `audit.events`), Verify 9/9, `/trust` 12/12.
6. [ ] Soạn sẵn: mẫu CSV (Y1), khoảng 15 file fuzz (Y4), 3 câu hỏi làm rõ (mục 1), JSON hóa đơn demo có `buyerTaxCode:"0102030405"`. Chỉ soạn **dữ liệu và checklist**, không viết sẵn tính năng.
7. [ ] Xác nhận người merge: `bminhnemhoi` tự merge được (mục 6b của `docs/handoff/BAN-GIAO-DEMO-DAY-17-10.md`). Trợ lý không tự merge repo đội; người dùng bấm. Khánh là dự phòng cho hPanel và biến bí mật.
8. [ ] Đóng app nặng, tắt server mồ côi `.next/standalone/server.js`, `export NODE_OPTIONS=--max-old-space-size=1536`.

---

## 1. Dòng thời gian và cổng go/no-go (T = lúc nhận đề, hạn chót T+4:00)

| Mốc | Việc | Cổng (đạt mới đi tiếp) |
|---|---|---|
| **T+0:00–0:15** | Đọc đề. Nhắc lại yêu cầu bằng 3 câu. Hỏi BTC **tối đa 3 câu**. Phân loại theo bảng công thức (R1–R9) | **G0:** người dùng chốt phạm vi và tiêu chí "xong" |
| T+0:15–0:25 | Chia 2–4 lát; **lát 1 phải demo được một mình**. `git fetch origin && git switch -c feat/btc-<tên> origin/main`. Viết test đỏ cho lát 1 | Có danh sách lát và tiêu chí xong từng lát |
| T+0:25–1:45 | Làm lát 1: test đỏ → sửa → `tsc` + test liên quan → `referee:diff` → commit nhỏ | **G1 (T+1:45):** lát 1 xanh ở local. Chưa xanh thì **cắt phạm vi** về phương án hẹp hoặc dự phòng của yêu cầu đó |
| (tùy chọn) T+1:45–2:15 | **Ship sớm lát 1** nếu nó có giá trị độc lập và lát 2 còn hơn 60 phút việc: chạy lưới đủ → PR → merge → `live:check` | Live có ít nhất một thứ mới |
| T+1:45–2:30 | Lát 2 (và 3) | **G2 (T+2:30): đóng băng tính năng.** Sau mốc này chỉ sửa lỗi |
| T+2:30–3:00 | Workflow `sprint-verify` (phản biện đối kháng → qa-verifier). Song song chạy 1 agent nhẹ (tax-domain, security hoặc docs-claims) tùy phạm vi. Sửa blocker, mỗi blocker ≤15 phút | Không còn blocker |
| T+3:00–3:05 | Chốt lưới an toàn | **G3:** tsc, typecheck:referee, lint, `referee:diff` (đúng ca định đổi), 16/16 bộ, build đều xanh. Đỏ thì `git revert` commit của lát đỏ **trên nhánh** rồi chạy lại |
| T+3:05–3:15 | Mở PR, chờ CI (khoảng 4 phút), người dùng merge bằng merge commit | **G4: merge chậm nhất T+3:15** (trước hạn 45 phút). Đến T+3:25 CI vẫn chưa xanh thì **không merge**: demo bằng bằng chứng local và nhánh |
| T+3:15–3:30 | `npm run live:check -- --expect-commit <sha7>` và bấm tay luồng demo | **G5:** đỏ thì **revert ngay** (xong trước T+3:40) |
| T+3:30–3:50 | Bằng chứng: JSON live, số trước/sau. Commit vào **nhánh**, chưa merge (mỗi lần merge là một lần deploy). Soạn lời nói 60 giây | Người dùng tập nói được một lần |
| T+3:50–4:00 | Đệm. Không đụng mã | — |

**Quy tắc cắt phạm vi:**
- Trễ một cổng thì bỏ lát cuối, không kéo dài cổng sau.
- Phần dở thì tắt bằng cờ hoặc revert trên nhánh, rồi **nói thật**.
- Đề mơ hồ thì làm phương án hẹp nhất thỏa yêu cầu và ghi rõ giới hạn.

**3 câu hỏi làm rõ mặc định (chọn ≤3):**
1. "BTC sẽ kiểm 'xong' bằng cách nào: thao tác trên live, chạy bộ dữ liệu của BTC, hay xem báo cáo?"
2. "Bản tối thiểu chấp nhận được là gì nếu không đủ 4 giờ?"
3. Tùy loại yêu cầu:
   - Dữ liệu: "Có nhãn kỳ vọng không? MST bên mua là gì? Đội có được commit dữ liệu này vào repo không?"
   - Luật: "Văn bản là thật hay giả định? Ngày hiệu lực? Áp theo ngày lập hóa đơn phải không?"

**Bảng công thức** (chi tiết ở [SPRINT-4H-COOKBOOK.md](SPRINT-4H-COOKBOOK.md)):

| Loại yêu cầu | Công thức |
|---|---|
| Quy tắc mới | R1 (+R8) |
| Ngưỡng hoặc mốc luật | R2 |
| Trường mới | R3 |
| API | R4 |
| UI | R5 |
| Bộ ca, đo bỏ sót/chuyển thừa | R6 |
| Phép thử bảo mật | R7 |
| Câu hỏi chuyển tiếp | R8 |
| Ship | R9 |

---

## 2. Vai trò

| Ai | Làm gì | Không làm |
|---|---|---|
| **Người dùng (Minh)** | Nói chuyện với BTC; chốt phạm vi ở G0, G1, G2; nhắn nhóm trước khi deploy; **bấm merge** (`gh pr merge <n> --repo khanhle1406/Tax-Referee --merge` hoặc nút "Create a merge commit"); demo; trả lời hỏi đáp | Không tự sửa mã song song (tránh xung đột) |
| **Khánh** (dự phòng) | hPanel, biến bí mật, deploy tay nếu `startedAt` không đổi sau 10 phút | — |
| **Assistant (phiên chính)** | **Là người ghi duy nhất** trên nhánh: làm từng lát, chạy test, viết commit/PR/CHANGELOG, soạn lời nói | Không đọc `env_*`/`.env*`; không squash, force-push hay `--no-verify` |
| **Agent `review:adversarial`** (trong `sprint-verify`) | Phản biện `git diff origin/main...HEAD` bằng ví dụ chạy thật; trả SHIP / FIX_FIRST / DO_NOT_SHIP | Chỉ đọc |
| **`qa-verifier`** (nặng) | Chạy lưới an toàn tuần tự đến build | Không chạy cùng lúc với `npm test` hay build của phiên chính |
| **`tax-domain-reviewer`** (nhẹ) | Khi sửa `policyEngine`, `legalBasis`, `regulatoryRegistry`, `policyContract`, `questionBuilder`: căn cứ theo ngày lập, ca biên hai phía ngưỡng, không bịa điều khoản | Chỉ đọc |
| **`security-reviewer`** (nhẹ) | Khi có route, auth, capabilities, audit, policy mới: 4 trụ, CSRF, `withRequestDatabase`, `authzMatrix` | Chỉ đọc |
| **`docs-claims-auditor`** (nhẹ) | Đối chiếu PR body, CHANGELOG, lời nói 60 giây với mã thật | Agent này có quyền Edit: **giao ở chế độ chỉ báo**, phiên chính tự sửa |

**Giới hạn máy ít RAM:**
- Tối đa **2 agent nặng** cùng lúc, và không bao giờ hai build song song.
- Cách ghép khuyến nghị: `sprint-verify` (tuần tự review → verify) cộng 1 agent nhẹ.
- Một `git worktree` duy nhất, không đổi nhánh giữa chừng.

---

## 3. Kế hoạch cho từng yêu cầu dự đoán (theo khả năng)

Mỗi mục gồm: làm rõ, các lát, tệp, test, demo, và câu nói khi chỉ xong một phần.

### Y1. Chạy trên tập dữ liệu độc lập của BTC, báo tỉ lệ bỏ sót và chuyển thừa (khả năng cao, 2–2,5h, công thức R6 + R4 + R5)

**Làm rõ:**
- Định dạng file?
- Có nhãn kỳ vọng không (cần chuyển hay không, nhóm, người duyệt)?
- MST bên mua?
- Chạy trên live hay chỉ cần báo cáo?
- Được commit dữ liệu không?

**Lát A (40 phút, không đụng live, ra số ngay):**
- Viết `scripts/qa/import-btc-cases.ts`: chuyển CSV/JSON sang danh sách `RefereeCase`.
  - Số dùng `parseNumberValue` (`lib/utils.ts`; hàm này đọc được "1.100.000").
  - Ngày dd/mm/yyyy đổi sang ISO bằng hàm nhỏ có test.
  - Cột tiếng Việt ánh xạ sang các trường của `InvoiceInputSchema` (`invoiceNumber`, `invoiceDate`, `supplierTaxCode`, `itemName`, `preTaxAmount`, `taxRate`, `taxAmount`, `totalAmount`, `paymentMethod`, `bankReference`, `hasBankSlip`, `sellerStatus`…).
  - `companyTaxCode` = **MST bên mua của BTC**. Nếu không đặt, mọi ca bị chuyển thừa.
  - `labeledBy:"BTC"`, `provenance:"BTC:<tên file>:<sha256 8 ký tự>"`.
- **Từ 20 ca trở lên, có nhãn:**
  ```bash
  npm run labels:lock -- draft.json docs/evidence/btc/<tên>-locked.json
  npm run evaluate:independent -- docs/evidence/btc/<tên>-locked.json --out docs/evidence/btc/<tên>-report.json
  ```
  Nếu không khớp hết, lệnh thoát với mã 1. Đó là kết quả đo, không phải lỗi máy.
- **Dưới 20 ca (bài kiểm thử theo đề có 5 ca):** importer gọi thẳng `evaluateRefereeCases` (`services/refereeEvaluationService.ts`), rồi ghi báo cáo bằng `writeReport` (`scripts/qa/referee-report-utils.ts`). Ghi rõ "n=5, không đủ để suy ra tỉ lệ".
- **Không có nhãn:** chỉ báo phân luồng (thường quy / 3 nhóm / KTT hay CFO / câu hỏi). Nếu cần tỉ lệ, đội gán nhãn **trước khi chạy**, khóa SHA-256 và ghi giờ khóa. Không gán nhãn sau khi đã thấy kết quả.

**Lát B (60–75 phút, đưa lên live):**
- Viết hàm service `services/independentRunService.ts` để test gọi trực tiếp, không qua HTTP:
  - Validate **từng ca riêng** bằng schema nới (nhãn tùy chọn). Ca hỏng thành dòng `ERROR` kèm lý do, không làm hỏng cả lô.
  - Ca có nhãn: chạy `evaluateRefereeCases` để lấy bỏ sót/chuyển thừa, kèm mẫu số và `wilson95` (`services/feedbackService.ts`).
  - Ca không nhãn: chỉ báo phân luồng.
  - Trả về `inputSHA256` (`hashPayload`), `policyHash`, commit, `runId`.
- Trong `POST /api/verify` (`app/api/verify/route.ts`), thêm nhánh `mode:'independent'`:
  - Bọc `withRequestDatabase` và bắt `getRequestUser` (theo mẫu `regression_15` của GET).
  - `allowRate`, tối đa 200 ca.
  - `companyTaxCode` lấy từ body, **không** dùng `demoCompanyTaxCode`.

**Lát C (45 phút):** thêm tab "Tập độc lập" trong `components/VerifyHarness.tsx`:
- Dán hoặc tải JSON/CSV, parse ở phía trình duyệt.
- Hiện SHA-256 **trước khi bấm chạy** (`crypto.subtle.digest`).
- Bảng từng ca, tỉ lệ kèm mẫu số, nút "Xuất CSV" dùng `csvCell` (chống CSV injection).

**Test:**
- `tests/unit/independentRun.test.ts`: 3 ca (1 thường quy, 1 chuyển tiếp, 1 hỏng schema thành `ERROR`), kiểm mẫu số và kiểm có cách ly MST. Cộng `minChecks` của bộ `unit` đúng bằng số `test()` thêm.
- Không đổi `judge`, `challenge_a`, `common_4`, `development_60`.

**Demo (90 giây):**
1. `/verify` → tab "Tập độc lập" → tải file của BTC.
2. Chỉ cho giám khảo mã SHA-256 nhãn trước khi chạy → bấm Chạy.
3. Chỉ vào tỉ lệ bỏ sót x/y và tỉ lệ chuyển thừa x/y (Wilson 95%).
4. Mở một ca chuyển tiếp: nhóm dừng, người nhận, câu hỏi có số ₫ và đáp án A/B.
5. Bấm "Xuất CSV".

**Nếu chỉ xong một phần:** "Chưa có giao diện trên live. Chúng tôi đã chạy đúng commit đang live bằng CLI; nhãn khóa SHA-256 lúc HH:MM; báo cáo nằm ở `docs/evidence/btc/`. Kết quả: bỏ sót a/b, chuyển thừa c/d. Ca sai là X, do Y."

### Y2. Thay đổi pháp lý hoặc ngưỡng có ngày hiệu lực (khả năng cao; 20–40 phút hoặc 1,5–2h; công thức R2)

**Phải phân loại ngay ở phút đầu:**
- **(a) Quy chế nội bộ** (hạn mức KTT, ngưỡng trọng yếu MST, danh mục ngoài SOP, tỉ lệ hậu kiểm): **không sửa mã.**
  - Vào `/workspace/policy`: soạn nháp → kiểm thử an toàn → chạy thử (danh sách hồ sơ đổi) → công bố.
  - Thay đổi nới lỏng: **soạn bằng vai KTT, công bố bằng vai CFO** (bốn mắt).
  - Policy nằm **trong DB của từng phiên demo**. Nếu BTC muốn mặc định của hệ thống đổi theo (phiên mới cũng thấy), phải sửa `DEFAULT_POLICY_CONFIG` (`lib/constants.ts`) **và** default trong `SystemPolicyConfigSchema` (`lib/schemas.ts`) cùng mọi fallback `??` (R2a).
- **(b) Luật theo ngày lập** (ngưỡng tiền mặt, kỳ giảm 8%, danh mục loại trừ, khung hóa đơn): **bắt buộc sửa mã**, vì policy là toàn cục và `policySafety` chặn ngưỡng tiền mặt > 5 triệu và thuế suất ≠ 8/10.

**Các lát của đường (b):**
1. **(45 phút)** Thêm mục có ngày hiệu lực vào bảng dữ liệu:
   - `VAT_REDUCTION_PERIODS`, `vat8ExcludedPhrases`, `invoiceFrameworkAt` trong `lib/legalBasis.ts`.
   - Hoặc `getApplicableRegulations` (`data/regulatoryRegistry.ts`) → `paymentThreshold` (`lib/refereeRequirements.ts`).
   - Nguồn ghi "**Giả định theo đề BTC**". Không ghi số hiệu hay số điều thật.
2. **(30 phút)** Chữ cứng cần sửa đồng bộ: case `RULE_SCOPE_VAT8_PERIOD` trong `questionBuilder`, `checks` trong `data/policyContract.ts` (tăng `POLICY_CONTRACT_VERSION`), `effectiveTo` trong registry, `VAT_8_EXPIRY_DATE`, nhánh ngày trong `ruleContract`, cổng `services/policySafety.ts` nếu cần.
3. **(30 phút)** Test biên: cùng hóa đơn × (ngày trước mốc / đúng mốc) × (dưới ngưỡng / đúng ngưỡng).
   - Chạy `referee:diff`: chỉ được đổi các ca có ngày ≥ mốc.
   - Coi chừng đầu dò `RULE_SCOPE_VAT8_PERIOD` (ngày 2027-01-05), `RULE_PROBE_BASE` (2026-08-15) và `engineProperties` (sinh ngày đến 2026-10-08).

**Test:**
- `tests/unit/legalCitations.test.ts`, `keywordCoverage`, `policyMakerChecker`, `engineProperties`.
- `npm test -- referee-core redteam challenge-a`.
- `npm run test:phase1:sprint1` (bộ này nằm ngoài `npm test`).

**Demo:**
- Vào `/verify` → "Dữ liệu mới" → dán JSON hóa đơn ngày trước mốc: kết quả A (kèm căn cứ cũ).
- Đổi sang ngày sau mốc: kết quả B, câu hỏi ghi căn cứ "giả định theo đề BTC".
- Với đường (a): mở nhật ký, chỉ sự kiện `POLICY_PUBLISHED` và người soạn ≠ người công bố.

**Nếu chỉ xong một phần:** "Engine đã chọn luật theo ngày lập và có test biên. Chữ trên `/sop` sẽ cập nhật sau. Hóa đơn cũ giữ nguyên kết quả: `referee:diff` 0 ca đổi trước mốc."

### Y3. Thêm quy tắc hoặc kịch bản dừng mới (khả năng cao, 1,5–2h, công thức R1 + R8)

**Danh sách điểm chạm (sót một điểm là đỏ):**
1. `evaluateInvoiceLocallyInternal` trong `services/policyEngine.ts`: push phát hiện **trước** khối "XỬ LÝ KẾT QUẢ".
   - Đúng 2 option; `matchesKeyword`, không dùng `includes`.
   - Ngữ cảnh lấy qua `contextInvoices`.
   - Ngưỡng đọc `config?.x ?? mặc định`.
2. `RULE_CATALOG` trong `lib/riskTaxonomy.ts`: `{group, humanAcceptable, triggerFields}`.
3. `checks` và `fields` trong `data/policyContract.ts`; **tăng `POLICY_CONTRACT_VERSION`**.
4. `concreteIssue` trong `services/questionBuilder.ts`: lý do có số ₫, hai đáp án A/B mang hệ quả qua `resultingAction`.
5. `RULE_PROBES` trong `data/verification/ruleProbes.ts`. Quy tắc cần ngữ cảnh thì thêm vào `contextOnly` (`tests/unit/taxonomy.test.ts`) và thêm ca ngữ cảnh trong `scripts/qa/test-referee-core.ts`.
6. Đặt tên theo tiền tố: `STATUTORY_*`, `INTERNAL_POLICY_*`, `AUTHORITY_*` hoặc `RULE_*`. Tiền tố quyết định tiền lệ và người nhận.

**Các lát:**
- S1 (75 phút): mục 1–3 và 5, kèm test chặn và test "không chặn nhầm".
- S2 (45 phút): mục 4, kèm test trả lời 1A/1B có hệ quả thật.
- S3 (10 phút): sửa số "24 quy tắc" trong slide và proposal.

**Bẫy riêng của "ngày lập tương lai":**
- `now` phải **tiêm từ ngoài vào**, so theo giờ Việt Nam, có dung sai ≥1 ngày.
- Đầu dò `RULE_SCOPE_VAT8_PERIOD` đang dùng ngày 2027-01-05 (ở tương lai) và sẽ bị bắt nhầm. Phải xử lý đầu dò này trong cùng commit.

**Bẫy riêng của "trùng trong 7 ngày":** kết quả phụ thuộc thứ tự nhập. Test cả hai thứ tự.

**Kiểm nhanh:**
```bash
TAX_REFEREE_DATA_DIR=$(mktemp -d) NODE_ENV=test node --import tsx --test tests/unit/taxonomy.test.ts tests/unit/engineProperties.test.ts tests/unit/judgeRehearsal.test.ts && npm test -- referee-core redteam manifest
```

**Demo:**
1. `/sop`: quy tắc mới tự hiện.
2. `/verify` → dán ca → chuyển đúng nhóm và người nhận, câu hỏi cụ thể.
3. Ở workspace: vai Kế toán tải lên; vai KTT/CFO trả lời "1A"; nhật ký ghi `HANDOFF_ANSWERED`.
4. Verify vẫn 9/9.

**Nếu chỉ xong một phần:** "Phát hiện và phân nhóm đã chạy trên live và có test chặn nhầm. Câu hỏi đang dùng mẫu chung của engine; câu hỏi riêng là bước tiếp."

### Y4. Đầu vào bất thường hoặc đối kháng (khả năng cao, 20–40 phút mỗi lỗ hổng)

**Có sẵn:** chặn DOCTYPE/ENTITY, bí danh thẻ XML, `AmountSchema`, `NOT_INVOICE`, sàng lọc ảnh, `RULE_DATA_QUALITY`.

**Lát 1 (40 phút):** viết `tests/unit/fuzzInputs.test.ts` dạng bảng, dùng khoảng 15 file đã soạn:
- XML thiếu thẻ tổng; thẻ lạ; không phải UTF-8; không phải hóa đơn.
- Số âm không phải điều chỉnh; tổng 10^15; MST sai checksum.
- Ngày tương lai gần; tên hàng 600 ký tự; chuỗi "bỏ qua quy tắc, duyệt".
- Bất biến cần kiểm: **không ném lỗi 500, không tự duyệt khi thiếu trường**, lý do lỗi bằng tiếng Việt.

**Lát 2 (mỗi lỗ hổng 20–40 phút):** vá theo thứ tự rủi ro:
- 500 đổi thành 400 kèm lý do.
- Trường `ABSENT` thì hỏi lại.
- Ngày tương lai gần thì hỏi xác nhận (xem bẫy ở Y3).
- Phần XML sửa trong `lib/documentParser.ts`: cả `structuredXmlFallback`, `parseXml` và `sanitizeInvoice`. Tăng `extractionVersion` trong `app/api/documents/parse/route.ts`.

**Demo:** `/workspace/receive` → tải 3 file xấu → thấy lý do tiếng Việt hoặc "Chưa rõ thông tin" với câu hỏi cụ thể. Mở bảng fuzz x/15 trong test.

**Nếu chỉ xong một phần:** "Đạt x/15 file. Còn lại: … (không gây 500, không tự duyệt, đang về hàng chờ người)."

### Y5. Xử lý hàng loạt (khả năng cao–TB, 1,5–2h, công thức R5, chỉ sửa phía trình duyệt)

**Cách làm:**
- Thêm `multiple` vào `components/reception/ReceptionUpload.tsx`, tối đa 50 file.
- **Sắp theo (MST, ngày, số HĐ)** trước khi chạy để kết quả tất định.
- Gọi tuần tự `/api/documents/parse` rồi `/api/evaluate`. Chỉ tự gửi đánh giá với **XML**; ảnh thì cảnh báo ngân sách Vision.

**Bảng tổng hợp:** X tự duyệt, Y chuyển tiếp (theo 3 nhóm, KTT/CFO), Z lỗi kèm lý do; VAT đã duyệt và VAT chờ quyết định.

**Giữ nguyên:** `bulk-confirm` trả 410. Không làm ZIP.

**Test:** test thuần cho hàm sắp xếp và hàm tổng hợp. Kiểm tải lại cùng lô không tạo bản trùng (kiểm thật trước khi tuyên bố).

**Demo:** chọn 10 XML → tiến trình từng file → bảng tổng hợp → `/workspace/inbox` chỉ còn các ca cần người.

**Nếu chỉ xong một phần:** "Đã nhập được nhiều file XML. Ảnh vẫn đi từng file để giữ ngân sách AI. Chưa có duyệt hàng loạt, và đây là chủ ý: không duyệt mù."

### Y6. Giải thích cho người không chuyên và xuất hồ sơ kiểm toán (TB–cao, rủi ro thấp nhất; **phương án dự phòng mặc định**)

**Lát 1 (60 phút):** hàm thuần `explainRoutine(inv, config)`: chỉ sinh chữ "điều kiện đã đạt kèm ngưỡng" cho ca tự duyệt. Lời hiện tại chung chung ("Hồ sơ đủ dữ kiện…"). `referee:diff` phải ra 0 ca đổi. Grep các test so nguyên văn `plainExplanation` trước khi sửa.

**Lát 2 (45 phút):** trang in đọc JSON từ `app/api/dossiers/[id]/export/route.ts`. Gồm: lời giải thích, dòng thời gian nhật ký, mã băm, `verifyAuditChain`, căn cứ theo ngày lập. In bằng CSS print (Ctrl+P ra PDF).

**Lát 3 (30 phút):** xuất CSV nhật ký theo kỳ, dùng `csvCell`.

**Demo:** chọn một hóa đơn tự duyệt và một hóa đơn bị dừng → "Xuất hồ sơ" → bản in: vì sao, ai quyết, lúc nào, dữ liệu nào → Lưu PDF.

**Nếu chỉ xong một phần:** "Chưa có chữ ký số trên PDF. Tính toàn vẹn chứng minh bằng chuỗi băm HMAC của nhật ký, kiểm được bằng `verifyAuditChain`."

### Y7. Đôn đốc theo hạn, tự leo thang khi quá hạn (TB, 1,5h)

**Cách làm:**
- Thêm `slaHours` vào policy, có `.default()` để bundle cũ vẫn parse. Thêm vào `LOOSER_WHEN_HIGHER` (tăng là nới lỏng).
- Quét lười khi đọc hộp thư trong `services/inboxReadService.ts` (theo mẫu `recoverExpiredEvaluations`), tiêm `now`.
- Mỗi ca và mỗi lượt đánh giá chỉ một sự kiện `HANDOFF_OVERDUE`; thêm nhãn vào `eventLabels`.
- Leo thang **chỉ đi lên** (KTT → CFO), không bao giờ tự duyệt.

**Demo:** đặt SLA bằng phút → mở hộp thư → badge "Quá hạn" và thông báo → nhật ký có sự kiện.

**Nếu chỉ xong một phần:** "Mới hiển thị và nhắc. Tự chuyển cấp trên là bước tiếp, vì phải khớp bánh cóc thẩm quyền."

### Y8. Thông báo ngoài ứng dụng (TB, 1,5–2h; **hỏi Khánh về hPanel trước**)

**Cách làm:**
- POST webhook ký HMAC tới URL lấy **từ biến môi trường**, không lấy từ UI (tránh SSRF).
- Gửi sau khi transaction xong, timeout 3 giây. Gửi lỗi không chặn workflow; ghi kết quả vào nhật ký.
- Link trong tin vẫn bắt đăng nhập đúng vai. **Không làm trả lời từ kênh.**
- Không có biến bí mật thì làm dự phòng: nút "Sao chép tin nhắn" gồm số HĐ, số tiền, VAT chờ quyết định và hai đáp án A/B.

**Nếu chỉ xong một phần:** "Tin nhắn đã soạn tất định và sao chép được. Gửi thật cần cấu hình bí mật trên hosting."

### Y9. Tầng duyệt mới hoặc ủy quyền (TB; rủi ro cao)

**Cách làm (2h):**
- **Không thêm `AppRole`.** Chuỗi `'CFO'` nằm ở 34 file; sót một chỗ là lỗ hổng leo quyền.
- Làm **ủy quyền**: migration 22 tạo bảng `delegations`, chỉ cộng thêm.
- `approvalBlock` chấp nhận khi ủy quyền còn hạn và dưới hạn mức; chỉ CFO tạo hoặc thu hồi.
- Thêm dòng `CAPABILITIES` và kịch bản trong `tests/unit/authzMatrix.test.ts`. Nhật ký ghi "duyệt theo ủy quyền #id".
- Nếu BTC đòi tầng mới: đề xuất "≥ X cần hai người duyệt khác nhau" (tái dùng logic bất kiêm nhiệm).

**Demo:** CFO ủy quyền → người nhận duyệt được ca ≤ hạn mức → ca vượt hạn mức trả 403 → `/trust` hiện dòng quyền mới.

### Y10. Agent làm thêm một hành động có ranh giới (Q1) (TB, 2h)

**Cách làm:**
- Yêu cầu NCC xuất lại hóa đơn (`REQUEST_SUPPLIER_REISSUE`): thư soạn bằng template tất định.
- Trạng thái DRAFT → người duyệt → SENT (outbox giả lập). Danh tính `agent:mailer`, có ngân sách lượt gọi.
- Agent gọi gửi trực tiếp thì bị 403.
- Thêm phép thử mới trên `/trust` theo R7. Phải sửa: "Chạy 11 phép thử" và chỉ số `splice(9…)` trong `services/securityProbeService.ts`; "12" trong `tests/unit/securityProbes.test.ts`, `components/TrustCenter.tsx` và tài liệu.

### Y11. Sẵn sàng production (Q2) (TB–thấp; làm bản hẹp, mỗi mục 45 phút)

- Readiness trả 503 khi thiếu khóa audit hoặc commit (hiện vẫn trả 200 kèm cảnh báo).
- Script diễn tập backup/khôi phục, sau đó chạy `verifyAuditChain`.
- Bằng chứng bền dữ liệu: `audit.events` trước và sau deploy không giảm.
- Postgres và nhiều doanh nghiệp: **chỉ trình bày lộ trình** theo `docs/architecture/demo-to-production.md`.

### Y12. Học từ phản hồi và đo tác động (TB–thấp, 1–1,5h)

- `calibrateThreshold` và `rollbackThreshold` đã có: cần ≥10 nhãn, học 70% / kiểm 30%, Wilson.
- Demo trong **một phiên demo**, dữ liệu dán nhãn "mô phỏng".
- Chỉ số tác động lấy từ nhật ký. Chưa có dữ liệu thật thì ghi "chưa có dữ liệu". **Không bịa phản hồi người dùng.**

**Khả năng thấp (từ chối khéo hoặc chỉ làm bản hẹp):**
- 1.000 hóa đơn: `recomputeMacro` có độ phức tạp O(n²).
- Đọc ảnh hai lần: tốn gấp đôi ngân sách Vision.
- Step-up/MFA, giao diện tiếng Anh, màn hình di động cho CFO.

---

## 4. Lưới an toàn và rollback

**Chạy tuần tự (Git Bash):**
```bash
export NODE_OPTIONS=--max-old-space-size=1536
npx tsc --noEmit                 # không kiểm scripts/
npm run typecheck:referee        # CI chạy; kiểm 7 file scripts/qa
npm run lint                     # lỗi chỉ nằm trong Python/ (không thuộc repo) thì bỏ qua
npm run referee:diff             # 180 ca ~2,4 giây; KHÔNG ĐỔI hoặc chỉ đổi đúng ca đã định
npm test                         # 16/16 bộ; thêm test() thì tăng minChecks trong scripts/qa/run-all.ts
NODE_OPTIONS=--max-old-space-size=2048 npm run build   # một lần, trước khi mở PR
```

**Test đơn lẻ (không đụng DB thật):**
```bash
TAX_REFEREE_DATA_DIR=$(mktemp -d) NODE_ENV=test node --import tsx --test --test-concurrency=1 tests/unit/<file>.test.ts
npm test -- referee-core redteam   # lọc bộ theo tên
```

**Chạy gì khi nào:**

| Khi nào | Chạy gì |
|---|---|
| Sau mỗi lần sửa | `tsc` + test liên quan |
| Cuối mỗi lát | `referee:diff` + các bộ bị ảnh hưởng |
| Trước PR | Toàn bộ lưới (qua `sprint-verify`) |
| Sau merge | `live:check` |

**Khi chủ ý đổi hành vi:** `npm run referee:diff`, chép danh sách ca đổi vào commit message, rồi `npm run referee:snapshot` và commit riêng.

**Ship:**
```bash
git push -u origin feat/btc-<tên>
gh pr create --repo khanhle1406/Tax-Referee --base main --reviewer khanhle1406 --title "…" --body-file <file trong scratchpad>
gh pr checks <n> --repo khanhle1406/Tax-Referee --watch
gh pr merge <n> --repo khanhle1406/Tax-Referee --merge     # người dùng bấm
```

**Kiểm live:**
```bash
PYTHONIOENCODING=utf-8 npm run live:check -- --expect-commit <sha7>   # thêm --no-probes nếu /trust đã chạy nhiều (giới hạn 10 lần/10 phút)
```
- Kỳ vọng: `status:ok`, `commit` khớp, `startedAt` mới, `contractVersion` mới (nếu đã tăng), `hmac:true`, `warnings:[]`, `decisionPathLlmCalls:0`, Verify 9/9, `/trust` 12/12.
- 10 phút mà `startedAt` không đổi: gọi Khánh deploy tay qua hPanel.

**Rollback (G5 đỏ):**
```bash
git switch -c revert/<tên> origin/main && git revert -m 1 <merge-sha> && git push -u origin revert/<tên>
# hoặc nút "Revert" trên PR → merge PR revert bằng merge commit → live:check --expect-commit <sha revert>
```
Lưu ý:
- Migration, policy đã công bố và nhật ký **không quay lại theo mã**. Vì vậy migration chỉ được cộng thêm; quay policy bằng `rollbackPolicy` trong UI.
- **Không thêm giá trị enum mới** (`resultingAction`, `RuleKind`, `RiskGroup`). Nếu revert, bản cũ sẽ không parse được `decision_json` đã lưu.

---

## 5. Mẫu giao tiếp

**Commit:**
```
feat(referee): <việc đã làm, tiếng Việt> — yêu cầu BTC vòng 4 giờ

- Yêu cầu: <1 câu của BTC>
- Đổi: <hàm · file chính>
- Quyết định đổi: không ca nào (referee:diff 180/180) | <ID ca: trước → sau>
- Kiểm chứng: tsc, typecheck:referee, lint, 16/16 bộ (unit <N>), build

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

**PR body:**
```
## Yêu cầu của BTC
<nguyên văn hoặc tóm 2 câu> — nhận lúc HH:MM

## Đã làm (theo lát)
- Lát 1: … (demo: <đường dẫn trên live>)
- Lát 2: …

## Chưa làm / giới hạn (nói thật)
- …

## Bằng chứng
- referee:diff: <0 ca đổi | danh sách>
- npm test 16/16 (unit <N>), tsc, lint, build xanh; review đối kháng: <SHIP>
- Số liệu (nếu có): bỏ sót a/b, chuyển thừa c/d (Wilson 95%)

## Rủi ro và rollback
Revert merge commit; không migration phá hủy; không enum mới.

## Kiểm sau merge
- [ ] /api/health commit = <sha7>, warnings [] — [ ] Verify 9/9 — [ ] /trust 12/12 — [ ] luồng demo

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

**CHANGELOG** (chỉ khi PR #10 đã merge, vì `CHANGELOG.md` chỉ có trong PR #10; nếu chưa merge thì đưa nội dung này vào PR body):
```
## 2026-10-17 — Vòng cải tiến 4 giờ: <tên yêu cầu> (PR #<n>)
### Thêm
- <tính năng> — <cách kiểm trên live>.
### Kiểm chứng
- referee:diff <kết quả>; 16/16 bộ; <số liệu nếu có>.
### Giới hạn
- <điều chưa làm>.
```

**Lời nói 60 giây cho giám khảo (khung):**
1. **(10 giây) Yêu cầu:** "BTC yêu cầu <X>. Chúng tôi hiểu tiêu chí xong là <Y>."
2. **(25 giây) Đã làm, trên live:** "Đây là <màn hình>. <Thao tác> → <kết quả nhìn thấy>. Quyết định vẫn do engine tất định ra, không có LLM trên đường quyết định (`decisionPathLlmCalls: 0`)."
3. **(15 giây) Không làm hỏng gì:** "Chạy lại 180 ca thì <0> quyết định đổi. 16/16 bộ test đạt. Verify 9/9 và 12/12 phép thử bảo mật vẫn xanh sau deploy, commit <sha7>."
4. **(10 giây) Giới hạn và bước tiếp:** "Chưa làm <Z> vì <lý do>. Bước tiếp: <1 câu>."

*Ví dụ cho Y1:* "Trên tập 30 ca BTC đưa, nhãn khóa SHA-256 lúc 10:42 trước khi chạy: bỏ sót 0/12, chuyển thừa 2/18 (Wilson 95%: …). Hai ca chuyển thừa là hóa đơn nhiều thuế suất; đây là lỗi đã biết trong kế hoạch sau Demo Day." Chỉ nói số thật đã đo.

**Hỏi đáp (35 điểm), câu trả lời sẵn:**
- *Sao biết không chuyển thừa?* Có FP=0 trên 60 ca phát triển, test thuộc tính `engineProperties`, và số đo trên tập độc lập (nếu đã chạy).
- *Restart có mất dữ liệu không?* Không: SQLite ghi ra đĩa, `audit.events` trước và sau deploy không giảm, chuỗi băm HMAC kiểm được.
- *Luật đổi thì sao?* Căn cứ chọn theo ngày lập; quy chế nội bộ đổi qua policy có phiên bản, chạy thử trước, bốn mắt.
- *AI sai thì sao?* Vision chỉ nhận 14 trường qua allowlist; dữ kiện chưa xác minh không bao giờ được tự duyệt; vượt ngân sách thì fail-closed.

---

## 6. Bẫy cần tránh

1. **Merge là deploy.** `main` hỏng thì mất phần "It runs". Merge chậm nhất T+3:15. Báo nhóm và BTC giờ deploy (gián đoạn khoảng 2 phút). **Không merge thêm PR tài liệu sau T+3:15**, vì mỗi lần merge là một lần restart.
2. **`git add -A` hoặc `git add .`** sẽ kéo theo `Python/`, file zip, file feedback. Luôn add theo đường dẫn cụ thể.
3. **Verify 9/9 không được đụng.** Không sửa fixture giám khảo. A-01..A-03 và C-01 không được chuyển thừa. `referee:diff` chỉ so quyết định, nên chữ câu hỏi phải kiểm bằng `checkHandoff`/`questionCheck`. Lỗi ở đó làm `evaluateWorkflow` trả 500.
4. **Thêm quy tắc mà quên** `POLICY_CONTRACT_VERSION`, `RULE_CATALOG` hoặc `concreteIssue`: hỏng lần công bố policy kế tiếp, sai nhóm, câu hỏi chung chung.
5. **MST bên mua:** dữ liệu BTC có `buyerTaxCode` khác `0102030405` sẽ bị chuyển tiếp hết, trong `/verify` sandbox lẫn evaluator. Đặt `companyTaxCode` theo dữ liệu.
6. **Ngày giờ:** `Date.now()` làm test phụ thuộc lúc chạy; UTC lệch giờ Việt Nam quanh nửa đêm; đầu dò ngày 2027-01-05 đang ở tương lai. Luôn tiêm `now`.
7. **Policy theo phiên:** đổi mặc định không đổi phiên demo cũ, và "Xóa dữ liệu demo" không reset policy. Sau deploy, **mở cửa sổ ẩn danh để có phiên mới** khi demo.
8. **Đổi luật qua UI policy** bị `policySafety` chặn, và policy áp toàn cục, không theo ngày lập. Luật phải sửa trong mã.
9. **Route mới thiếu `withRequestDatabase`** sẽ ghi vào DB nội bộ và phá cách ly; không test nào bắt lỗi này. Phải kiểm `getRequestUser`, giữ CSRF (không đặt route dưới `/api/webhooks/`), GET không có tác dụng phụ, thêm `capabilities.ts` và `authzMatrix`.
10. **Bịa:** số hiệu văn bản, số điều, số liệu người dùng, phản hồi giả đều cấm. Văn bản của BTC ghi "giả định theo đề BTC". Slide giữ **đúng 5 trang**.
11. **Đếm cứng:** "12 phép thử", "11" trong `splice`, "14 trường Vision", "24 quy tắc", "16 bộ", "60 ca", "72 ca", `minChecks`. Đổi một chỗ thì sửa mọi chỗ.
12. **Máy ít RAM:** không build song song; tối đa 2 agent nặng; tắt server `.next/standalone/server.js` mồ côi; một phiên ghi, một worktree.
13. **AI trên live:** Vision giới hạn 60 lượt/người/giờ. Tính năng mới phải chạy được với `forceLocalOnly`. Không đưa LLM vào đường quyết định.
14. **Ôm việc quá sức:** Postgres, nhiều doanh nghiệp đầy đủ, vai mới từ đầu, ZIP, nhập bằng ngôn ngữ tự nhiên qua LLM đều vượt 4 giờ. Đề xuất bản hẹp và ghi giới hạn.
15. **Lỗi tiềm ẩn đã biết** có thể lộ khi chạy dữ liệu BTC:
    - Nhiều thuế suất hợp lệ bị chuyển thừa.
    - `RULE_MCCQT_INVALID`: đáp án B ghi "tạm hoãn" nhưng `resultingAction` là `REJECT_TAX_DEDUCTION`.
    - VAT có thể khấu trừ hai lần.
    - Phụ thuộc thứ tự nhập.

    Nói thật và chỉ vào kế hoạch sau Demo Day. Chỉ sửa khi nằm trong phạm vi đề, có liệt kê ca đổi và chạy `referee:snapshot`.
16. **Cấm** squash, force-push, `--no-verify`, `rebase -i`. Không đọc `env_*`/`.env*`. Commit nhỏ, message tiếng Việt, có trailer `Co-Authored-By`.

### Tệp hay phải chạm
- D:\TAX_MLAI\services\policyEngine.ts
- D:\TAX_MLAI\services\refereeEvaluationService.ts
- D:\TAX_MLAI\app\api\verify\route.ts
- D:\TAX_MLAI\data\policyContract.ts
- D:\TAX_MLAI\scripts\qa\run-all.ts