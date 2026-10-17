# Sổ tay thay đổi (Change Cookbook): Tax Referee, vòng cải tiến 4 giờ

## 0. Nền tảng và quy ước

**Mã đã soát (sáng 17/10):** `main` `e496ab4` (đang chạy trên live), nhánh `fix/legal-citations` (PR #11) và nhánh `chore/sprint-tooling` (thêm `npm run referee:diff`, `referee:snapshot`, `live:check`, skill `sprint-4h`).

**Quy ước vận hành:** trong vòng thi chỉ một phiên được ghi vào thư mục làm việc; việc song song (review, đồng bộ repo khác) dùng `git worktree` riêng. Tạo nhánh vòng thi từ `origin/main` sau khi PR #11 và PR tooling đã merge.

**Lệnh test đơn lẻ (Git Bash):**
```bash
TAX_REFEREE_DATA_DIR=$(mktemp -d) NODE_ENV=test node --import tsx --test --test-concurrency=1 tests/unit/<file>.test.ts
```
- Nếu thiếu `TAX_REFEREE_DATA_DIR`, test sẽ ghi vào DB thật ở `data/runtime/tax-referee.sqlite` (`lib/server/db.ts`).
- Lọc bộ test: `npm test -- referee-core redteam`. Bộ được chọn khi tên bộ chứa chuỗi lọc.

**Bất biến chấm thi, không được phá:**
- `challenge_a` giữ đúng 3 ca thường quy và 2 ca chuyển tiếp (theo đề).
- `judge` là `common_4` cộng `challenge_a`, tức 9 ca. `live:check` và slide đều khẳng định 9/9.
- Không chuyển tiếp thừa. Các test giữ điều này: R1–R3 trong `judgeRehearsal`, test cuối của `engineProperties`, và FP=0 trên 60 ca ở `test-referee-core`.
- Dữ liệu bị gắn cờ nghi vấn không bao giờ được tự duyệt.

**Kiểm chứng tuần tự** (CI chạy thêm `typecheck:referee`, CLAUDE.md không ghi lệnh này):
```bash
npx tsc --noEmit && npm run typecheck:referee && npm run lint && npm run referee:diff && npm test && npm run build
```
- `tsconfig.json` **loại trừ `scripts/`**, nên lỗi kiểu trong `scripts/qa/*.ts` chỉ lộ khi chạy, trừ 7 file có trong `tsconfig.referee-qa.json`.

**Yêu cầu BTC → công thức:**

| Yêu cầu có thể gặp | Công thức |
|---|---|
| Thêm loại ngoại lệ hoặc quy tắc | R1 (+R8) |
| Đổi ngưỡng, hạn mức, mốc luật | R2 |
| Thêm cấp duyệt | R1 với tiền tố `AUTHORITY_` + R2, dùng ngưỡng cấu hình trong vai CFO |
| Thêm **vai trò mới** | Rủi ro cao: `AppRole` và `roleSeed` trong `lib/server/auth.ts`, `HUMAN_ROLES`/`PRINCIPALS`; mọi `SCENARIOS` trong `authzMatrix` chạy theo từng vai |
| Trường mới từ hóa đơn | R3 |
| API hoặc tích hợp | R4 |
| Màn hình, panel | R5 |
| Đo FN/FP, bộ ca mới | R6 (+`evaluate:independent`, `labels:lock`) |
| Tự chỉnh ngưỡng theo phản hồi | Đã có: `calibrateThreshold`/`rollbackThreshold` trong `services/feedbackService.ts`, giữ bởi `thresholdHoldout.test.ts` |
| Bằng chứng bảo mật | R7 (+R4) |
| Câu hỏi rõ hơn | R8 |

---

## R1. Thêm một quy tắc tất định

**Các bước:**

1. **Đặt tên theo tiền tố.** Tiền tố quyết định hành vi:
   - `STATUTORY_*`: `findPrecedentForInvoice` không bao giờ áp tiền lệ.
   - `INTERNAL_POLICY_*`: tiền tố duy nhất CFO tạo được tiền lệ (`createPrecedent` và `app/api/precedents/route.ts` kiểm `startsWith`).
   - `AUTHORITY_*`: `ruleContract().recipient='CFO'`. Nếu `kind:'AUTHORITY'` thì `requiresCFO` luôn true.
   - `RULE_*`: quy tắc dữ liệu.
   - `ruleContract` suy ra `legalVerification` bằng regex trên id. Id không khớp và không có `source` sẽ thành `UNVERIFIED`: căn cứ hiện "căn cứ pháp lý chưa xác minh" và lời giải thích bị nối thêm "Lưu ý: diễn giải…".
2. **`services/policyEngine.ts` › `evaluateInvoiceLocallyInternal`:** thêm `evaluatedFindings.push({ruleId, kind, severity, riskGroup, flaggedReason, plainExplanation, legalBasis, sopClause, actionableQuestion, options:[A,B], requiresCFO})`, đặt **trước** khối "XỬ LÝ KẾT QUẢ" (vòng tiền lệ).
   - Ngưỡng đọc từ `config?.x ?? mặc định`.
   - Từ khóa dùng `matchesKeyword` (khớp nguyên từ, có xử lý không dấu), không dùng `includes`.
   - Ngữ cảnh lấy qua `contextInvoices` (mẫu `sameDayPurchaseTotal`), không đọc thẳng DB.
   - Đúng 2 option, `resultingAction` thuộc enum `ActionOptionSchema`.
   - **`legalBasis` và `sopClause` sẽ bị `describeRuleEvidence` ghi đè.** Chữ hiển thị lấy từ `policyContract`.
3. **`lib/riskTaxonomy.ts` › `RULE_CATALOG[id] = {group, humanAcceptable, triggerFields}`.**
   - `group` thắng `riskGroup` do engine gán (qua `groupOf`).
   - `humanAcceptable:false` làm `approvalBlock` chặn mọi duyệt, nên đáp án `ACCEPT_*` sẽ lỗi.
   - `triggerFields` được dùng ở `orderFindings` (dữ kiện chưa xác minh không làm nhóm chính), ở `guardedFields` trong `evaluateWorkflow` (chống "rửa ca"), và ở nhánh `consequence` trong `answerHandoff`.
4. **`data/policyContract.ts`:**
   - Thêm dòng `[id,label,clause,condition]` vào `checks`. Thứ tự dòng là `priority`, chữ hiện trên `/sop`.
   - Thêm `fields[id]`, dùng cho `requiredFields` và phần facts trong `buildHandoff`.
   - Nếu có văn bản nguồn: thêm `officialSources` và nhánh chọn theo ngày trong `ruleContract`.
   - Nếu có công tắc cấu hình: thêm vào `enabled` trong `implementedPolicyRules`.
   - **Tăng `POLICY_CONTRACT_VERSION`.** `/api/health.contractVersion` dùng để kiểm live đã có bản mới. Nếu không tăng, `validatePolicyBundle` báo "SOP/registry không khớp" cho bản nháp soạn trước deploy.
5. **`services/questionBuilder.ts` › `concreteIssue`:** thêm `case` trả về `{reason (số ₫ cụ thể, tên qua clip()), ask, options}`, hoặc `return null` để dùng option của engine.
   - Nếu quy tắc cần một dữ kiện mới để quyết định: thêm điều kiện vào `requiredDecisionFields` trong `lib/refereeRequirements.ts`, **chỉ khi dữ kiện đó làm đổi kết quả** (tránh chuyển tiếp thừa), và thêm `fieldAsk` (R3).
6. **Đầu dò:** thêm `RULE_PROBES[id]` trong `data/verification/ruleProbes.ts`, là bản vá tối thiểu trên `RULE_PROBE_BASE` (ca A-01, ngày 2026-08-15).
   - Quy tắc cần DB hoặc ngữ cảnh: thêm id vào `contextOnly` trong `tests/unit/taxonomy.test.ts`, **và** thêm ca ngữ cảnh kèm `coverage.add(id)` trong `scripts/qa/test-referee-core.ts`.
7. **`/sop`** tự cập nhật: `app/sop/page.tsx` → `policyRuleMatrix(DEFAULT_POLICY_CONFIG)` → `components/PolicyRuleReference.tsx`.
8. **Test và tài liệu:**
   - Viết `tests/unit/<rule>.test.ts` có ít nhất một ca chặn và một ca "không chặn nhầm", rồi tăng `minChecks` của bộ unit.
   - Sửa con số "24 quy tắc": `docs/submission/slides-content.md` (dòng 30, 90), `proposal-tax-referee.md` (38, 139, 161, 196; dòng 93 đang ghi "23"), `tinh-nang-noi-bat.md:25`.
9. **Snapshot:** chạy `npm run referee:diff`. Chỉ được đổi đúng các ca đã định; chép danh sách vào commit message, rồi chạy `npm run referee:snapshot` và commit riêng.

**Hay vỡ:**
- `taxonomy.test`: "thiếu phân loại", "đầu dò không kích hoạt", "thiếu đầu dò engine", "engine gắn nhóm khác bảng phân loại".
- `test-referee-core`: MATRIX phải `deepEqual` với `policyRuleMatrix` (thừa hay thiếu đều đỏ); 60/60 ca, FP=0, FN=0; độc lập thứ tự; "Input must not be mutated".
- `engineProperties`: hóa đơn sinh với `SAFE_ITEMS`, ngày 2026-01-01→2026-10-08, chuyển khoản. Quy tắc bắn nhầm ở đây là chuyển tiếp thừa.
- R1–R3 của `judgeRehearsal`.
- `demoSeed.test`: MAU-0009001 phải thường quy; thứ tự nhóm U/O/A.
- 72 ca red team; `manifest` (9/9); `keywordCoverage` ("không chặn nhầm").
- Nếu `checkHandoff` sai, `evaluateWorkflow` ném `WorkflowError` 500 "Cấu trúc chuyển tiếp không đủ dữ kiện".

**Kiểm nhanh:**
```bash
TAX_REFEREE_DATA_DIR=$(mktemp -d) NODE_ENV=test node --import tsx --test tests/unit/taxonomy.test.ts tests/unit/engineProperties.test.ts tests/unit/judgeRehearsal.test.ts && npm test -- referee-core redteam manifest
```

---

## R2. Đổi ngưỡng hoặc mốc ngày pháp lý

**2a. Ngưỡng nội bộ (hạn mức KTT 200 triệu, ngưỡng trọng yếu MST 20 triệu, khoảng K, `postAuditRate`).** Giá trị mặc định nằm rải ở nhiều nơi, phải sửa đồng bộ:
- `DEFAULT_POLICY_CONFIG` trong `lib/constants.ts`.
- Default của `SystemPolicyConfigSchema` trong `lib/schemas.ts`. `taxonomy.test` dùng `SystemPolicyConfigSchema.parse({})`, tức default của schema.
- Giá trị fallback trong mã: `?? 200_000_000` trong engine; `?? 20_000_000` trong `requiredDecisionFields`, `validatePolicySafety`, `executablePolicySummary`.
- Hằng 0,95 / 1,35 và 1 tỷ trong `calculateKFactor` và rule K; câu chữ tương ứng trong `checks`.
- Nút chọn sẵn trong `components/PolicyViewerModal.tsx`.

Nếu là tham số mới:
- Giới hạn an toàn và đầu dò biên (AT/BELOW/ABOVE) trong `validatePolicySafety` (`services/policySafety.ts`). Hàm này chạy ở mỗi lần công bố, nên phải nhanh.
- Phát hiện nới lỏng trong `services/policyService.ts`: `LOOSER_WHEN_HIGHER` (tăng = lỏng), `STRICT_FLAGS` (tắt = lỏng), kiểm `dropped()` cho danh sách, hoặc kiểm riêng nếu giảm = lỏng. Thêm test vào `policyMakerChecker.test.ts`.

**2b. Ngưỡng hoặc mốc luật theo ngày lập:**
- Tiền mặt 5 triệu / 20 triệu, mốc 01/7/2025: `getApplicableRegulations` (`isLaw48Active`, `thresholdLawCode`) → `paymentThreshold` (`nonCashThresholdEffectiveFrom`) → `LEGAL_CONSTANTS_2026` → `cashPaymentBasis`/`sameDayCashBasis` (nhánh legal) → nhánh `invoiceDate<'2025-07-01'` trong `ruleContract`. `validatePolicySafety` cứng ở `>5_000_000`.
- Kỳ giảm VAT 8%: nguồn chính là `VAT_REDUCTION_PERIODS` trong `lib/legalBasis.ts`. Chữ cứng "01/07/2025–31/12/2026" còn nằm ở case `RULE_SCOPE_VAT8_PERIOD` của `questionBuilder`, `legalBasis` của rule 13c, `checks`, `effectiveTo` của NQ-204 trong registry, và `VAT_8_EXPIRY_DATE`. **Nếu gia hạn sang 2027, đầu dò `RULE_SCOPE_VAT8_PERIOD` (ngày 2027-01-05) phải đổi.**
- Khung hóa đơn điện tử (mốc 2025-06-01, 2026-07-01): `invoiceFrameworkAt`, các hàm `*Basis`, `ruleContract`, và mốc cứng `'2026-07-01'` trong `RULE_SIGNING_DELAY`.

**2c. Văn bản hoặc điều khoản hiển thị:**
- Chữ hiển thị lấy từ `ruleContract` (`officialSources`, `clause`) và `ARTICLE_BASIS` trong `services/handoffService.ts` (nhánh legal), **không** lấy từ `legalBasis` của engine.
- Sổ văn bản: `GOVERNMENT_REGULATORY_REGISTRY` và `LEGAL_CITATIONS_REGISTRY`. Docid phải có trong `VERIFIED_DOCID` của `tests/unit/legalCitations.test.ts`.
- Văn bản chưa đối chiếu nguyên văn thì chỉ ghi số hiệu (luật cứng).

**Bẫy dữ liệu đã lưu:**
- Mỗi DB (nội bộ, mỗi phiên demo `data/demo/<id>.sqlite`) giữ bundle policy riêng, do `initializeDatabase` tạo **một lần**.
- Đổi giá trị mặc định **không** đổi phiên demo cũ. `/verify` (DB `:memory:`) và phiên mới thì thấy ngay.
- Tham số mới có `.default()` trong zod sẽ tự có giá trị mặc định khi parse bundle cũ. Tham số bắt buộc thì làm `getActivePolicy` ném lỗi.
- "Xóa dữ liệu demo" (`/api/invoices/reset`) **không** reset policy.

**Hay vỡ:**
- `engineProperties` ("tiền mặt từ 5.000.000₫", "từ hạn mức KTT").
- Các ca bám hạn mức 200 triệu: `EA-01-exact-200m` (red team), A-05 (275 triệu), E3 (330 triệu), `splitPurchase` (2 × 165 triệu), MAU-0009004, đầu dò L2/L3 (330 triệu → 198 triệu), `cfoCase` trong `authzMatrix`.
- Ca "UNKNOWN-BUSINESS 22 triệu" trong `test-challenge-a` (ngưỡng trọng yếu 20 triệu); DEV-R-07/R-09 (mốc 01/7/2025).
- `keywordCoverage`, `legalCitations`, `policyMakerChecker`.
- `scripts/qa/test-phase1-sprint1.ts` **không nằm trong `npm test`**. Nếu đụng sổ văn bản, chạy `npm run test:phase1:sprint1`.

**Kiểm nhanh:**
```bash
TAX_REFEREE_DATA_DIR=$(mktemp -d) NODE_ENV=test node --import tsx --test tests/unit/legalCitations.test.ts tests/unit/keywordCoverage.test.ts tests/unit/policyMakerChecker.test.ts tests/unit/engineProperties.test.ts && npm test -- referee-core redteam challenge-a
```

---

## R3. Thêm một trường hóa đơn từ đầu đến cuối

1. **`lib/schemas.ts` › `InvoiceInputSchema`:** khai báo `.optional()` hoặc `.default()`. Payload cũ đã lưu được `validatePolicyBundle` và `answerHandoff` parse lại. `SourceConfirmationSchema` tự cho phép xác minh trường mới.
2. **Nạp XML trong `lib/documentParser.ts`:**
   - Thêm vào **cả hai** đường: `structuredXmlFallback` (`findXmlValues([...tên thẻ])`) và nhánh `tag()` trong `parseXml`.
   - Thêm vào `rawInvoice` trả về.
   - **Thêm vào `sanitizeInvoice`**. Hàm này dựng object mới theo danh sách trắng, nên thiếu thì trường bị rơi âm thầm.
   - Lớp chữ PDF hoặc văn bản dán: `parseInvoiceFromRawText` (`lib/rawTextParser.ts`).
3. **Bộ đệm trích xuất:** tăng `extractionVersion` trong `app/api/documents/parse/route.ts`. Nếu không, `getCachedDocumentResult` trả kết quả cũ theo hash file.
4. **Vision:** **chỉ thêm khi trường nhìn thấy được trên chứng từ.**
   - Sửa `VISION_ALLOWED_KEYS` và `buildVisionPrompt` (làm đổi `VISION_PROMPT_SHA256`, hiện trên `/api/health`).
   - Đổi `assert.equal(VISION_ALLOWED_KEYS.length, 14)` trong `executionBoundaries.test.ts`.
   - Đổi chữ "14 trường" ở `lib/capabilities.ts` (`AI_VISION`, `extract.fields`), `docs/security/threat-model.md`, `docs/architecture/demo-to-production.md`, thẻ nhắc và tài liệu bàn giao.
   - Sự kiện không thể nhìn thấy (đã có UNC, đã có bảng kê, trạng thái MST) tuyệt đối không cho AI hay lớp chữ PDF khai. Route parse đang xóa `hasBankSlip`/`hasItemManifest`.
5. **Workflow (`services/workflowService.ts`):**
   - Thêm vào `SOURCE_DIFF_FIELDS` nếu trường đến từ chứng từ, để bản sửa khác chứng từ gốc bị chặn.
   - Thêm vào `NUMERIC_FIELDS`/`BOOLEAN_FIELDS` của `coerceFieldValue` nếu là số hoặc boolean.
   - Thêm vào `triggerFields` của các quy tắc dùng trường này.
6. **Quyết định và câu hỏi:**
   - `requiredDecisionFields` chỉ thêm khi trường làm đổi kết quả.
   - `fieldAsk` thêm `case` có đáp án mang hệ quả (`SET_FIELDS`/`NEED_VALUE`…).
7. **Nhãn nằm ở 4 bản đồ khác nhau:** `FIELD_LABELS` (questionBuilder), `labels` (handoffService), `names` (trong `evaluateWorkflow`), `reviewFields` → `fieldLabels` (`lib/workflowPresentation.ts`; `SourceReviewForm` tự hiện ô nhập).
8. **UI:** `components/InteractiveInputForm.tsx`, chỉ khi cần ô nhập riêng ở màn tiếp nhận.

**Hay vỡ:** `executionBoundaries` (số trường Vision, D2), `qa-regressions` (chạy Vision giả lập), `challenge-a`, `answerCombos`, typecheck.

**Kiểm nhanh:**
```bash
npx tsc --noEmit && TAX_REFEREE_DATA_DIR=$(mktemp -d) NODE_ENV=test node --import tsx --test tests/unit/executionBoundaries.test.ts tests/unit/answerCombos.test.ts && npm test -- qa-regressions challenge-a
```

---

## R4. Thêm một API route an toàn

1. **Tạo file `app/api/<x>/route.ts`:**
   - Khai báo `export const dynamic='force-dynamic'`, cộng `runtime='nodejs'` nếu dùng sqlite hoặc fs.
   - Mẫu bọc: `async function handlePOST(req)` và `export async function POST(...args){return withRequestDatabase(args[0],()=>handlePOST(...args));}`.
   - **Không có test nào bắt quên `withRequestDatabase`.** Quên thì route chạy trên DB nội bộ: cookie phiên demo không tìm thấy user, và cách ly bị phá.
   - Route động theo chuẩn Next 15: `context:{params:Promise<{id:string}>}` rồi `await context.params`.
2. **Định danh:** `getRequestUser(req)` → 401; hoặc `requireRequestUser` kết hợp `requestErrorResponse` (`lib/server/http.ts`).
   - Đặt cổng vai trò **trong hàm service** để test gọi được hàm thật. Mẫu: `applyWorkflowAction` chặn ACCOUNTANT bằng 403.
   - Thao tác chỉ cho sandbox: `if(!isSandbox()) 403`.
3. **CSRF:** `middleware.ts` tự chặn POST/PUT/PATCH/DELETE khác origin trên `/api/*`.
   - Không đặt route trình duyệt dưới `/api/webhooks/` (được miễn kiểm).
   - GET phải không có tác dụng phụ (middleware không bảo vệ GET).
4. **Đầu vào:** schema zod (`.strict()` khi được), lỗi trả 400.
5. **Giới hạn tần suất:** `allowRate(\`x:${user.id}\`, n, ms)`, hoặc `clientIp(req.headers)` cho người chưa đăng nhập. Bộ đếm nằm trong bộ nhớ một tiến trình. Lời gọi AI dùng `allowVisionCall`/`allowGroundingCall` (`lib/server/aiBudget.ts`).
6. **Nhật ký:**
   - Thay đổi trạng thái hồ sơ: `recordAction(row,user,eventType,reason,before)` trong `db.transaction`.
   - Thay đổi khác: `appendAuditEvent({eventType,entityId,actorId:user.id,payload})` trong cùng transaction.
   - Thêm nhãn sự kiện vào `eventLabels` (`lib/workflowPresentation.ts`).
   - Header phản hồi: `'Cache-Control':'no-store'`.
7. **Quyền:** thêm dòng vào `CAPABILITIES` (`lib/capabilities.ts`). `enforcedBy` phải theo dạng `'hàm · đường/dẫn.ts'`, và test kiểm `fs.existsSync` phần sau dấu `·`. Sau đó, trong `tests/unit/authzMatrix.test.ts`:
   - Thêm `SCENARIOS[action]`: dựng tình huống bằng người khác, để `actor` thử, chạy cho từng vai trong `HUMAN_ROLES`.
   - Hoặc thêm `ROUTE_GATES[action]`: chuỗi cổng phải khớp **nguyên văn**. Nếu Prettier đổi `"['CHIEF_ACCOUNTANT', 'CFO'].includes(user.role)"` trong `app/api/policy/route.ts`, test sẽ đỏ.
   - `/trust` tự hiển thị bảng qua `/api/system/capabilities`.
8. **Đổi schema DB:** thêm `if(!applied.has(22)){…record.run(22,now())}` trong `applyMigrations` (bản mới nhất là 21). Chỉ cộng thêm, không xóa, để revert vẫn an toàn.

**Hay vỡ:** `authzMatrix` ("thiếu phép kiểm", "enforcedBy trỏ tới file có thật", "bảng quyền khớp hành vi thật"), `securityFixes` (CSRF, cookie demo tự đặt).

**Kiểm nhanh:**
```bash
TAX_REFEREE_DATA_DIR=$(mktemp -d) NODE_ENV=test node --import tsx --test tests/unit/authzMatrix.test.ts tests/unit/securityFixes.test.ts tests/unit/securityProbes.test.ts
```

---

## R5. Thêm trang hoặc panel giao diện

**Màn trong workspace:**
1. Thêm khóa vào `workspaceRoutes` (`lib/workspaceNavigation.ts`).
   - Nếu thiếu, `viewForPath` âm thầm trả `'inbox'`.
   - Nếu thiếu file page, catch-all `app/workspace/[...missing]` trả 404.
2. Tạo `app/workspace/<slug>/page.tsx` theo mẫu `export const metadata` và `return null`. Layout `WorkspaceSession` là nơi render thật.
3. Thêm vào `primary` hoặc `tools` và `icons` trong `components/workspace/WorkspaceShell.tsx`.
4. Thêm nhánh `{!loading&&!error&&view==='x'&&<XView/>}` trong `components/ProductionWorkspace.tsx`. Component nặng thì dùng `next/dynamic` như `SupplierMasterView`.
5. Fetch với `cache:'no-store'`; xử lý 401 theo `WorkspaceSession`.
6. Thêm `assert` cho `viewForPath('/workspace/<slug>')` trong `scripts/qa/test-workspace-ui.ts`.

**Trang công khai:**
- Tạo `app/<x>/page.tsx` (`dynamic='force-dynamic'` nếu có dữ liệu sống).
- Thêm `'/<x>'` vào danh sách `no-store` trong `next.config.ts` (`headers()`; hiện có `/`, `/verify`, `/sop`, `/trust`). Header bảo mật đã áp chung.

**Panel trong hồ sơ:** `EscalationCard`, `HandoffAnswerPanel`, `InvoiceDataSummary`.

**Lưu ý:**
- Bề rộng 360px; xem `docs/archive/design-system-MASTER.md` (đã lưu trữ).
- Chỉ kiểm UI trên bản build standalone (skill `verify-all`), rồi **tắt server `.next/standalone/server.js`**.

**Kiểm nhanh:**
```bash
npx tsc --noEmit && npm run lint && npm test -- workspace-ui
```

---

## R6. Thêm bộ ca kiểm thử hoặc chế độ Verify

1. **Unit test:**
   - Đặt ở `tests/unit/<x>.test.ts`, dùng `node:test`, `runIsolated`, `forceLocalOnly:true`.
   - Đặt `companyTaxCode` bằng mẫu `UPDATE policy_versions SET payload_json=…` như trong test có sẵn.
   - **Thêm k lời gọi `test()` thì cộng k vào `minChecks` của bộ `unit`** trong `scripts/qa/run-all.ts`. Số hiện tại: `main` 103; sau khi merge PR #11 là 109.
2. **Bộ QA mới:**
   - Script in các dòng `PASS …`.
   - Thêm `{name, files, minChecks, memoryDb?, env?}` vào `suites`. Mỗi bộ tự có `TAX_REFEREE_DATA_DIR` tạm.
   - Cập nhật chữ "16 bộ/16/16" trong tài liệu.
3. **Chế độ Verify mới:**
   - Tạo `data/verification/<x>Cases.ts` (`VerificationCase` hoặc `RefereeCase` kèm `expectedRuleIds`).
   - Trong `services/verificationService.ts`: thêm vào `VERIFY_MODES`, `SUITE_LABELS`, và chọn trong `single`.
   - Bộ lớn: thêm vào danh sách cần phiên trong GET của `app/api/verify/route.ts`.
   - Thêm `<option>` trong `components/VerifyHarness.tsx`.
   - Thêm mode vào mảng của `scripts/qa/test-regression-manifest.ts`, và cộng `minChecks` của bộ `manifest` (mỗi mode +1).
   - Thêm vào `cases` của `scripts/qa/referee-snapshot.ts`.
4. **Không nối thêm vào `developmentCases`:** `test-referee-core` khẳng định `report.total===60`, và tài liệu ghi "60 ca". Không đổi `judge`, `challenge_a`, `common_4`.
5. **Red team:** `data/verification/redteam/cases.json`, mỗi ca có `{id, invoice, expectedStatus, expectedRiskGroup, rationale, context.history?}`. Chữ "72 ca" có trong tài liệu.
6. **Đo FN/FP:** `evaluateRefereeCases` đã trả `falseNegative`, `falsePositive`, `stp`, mỗi chỉ số kèm mẫu số.

**Kiểm nhanh:**
```bash
npm test -- unit manifest referee-core
```

---

## R7. Thêm một phép thử bảo mật trên /trust

1. **`services/securityProbeService.ts` › `PROBES`:** thêm phần tử `{id, pillar:'Định danh'|'Đặc quyền tối thiểu'|'Ranh giới thực thi'|'Cách ly', attack, expected, enforcedBy, run:async()=>{const {acc,ktt,cfo}=setup(); …; return {pass, observed}}}`.
   - Mỗi phép thử chạy trong `runIsolated`, không gọi mạng (`forceLocalOnly`).
   - Nên có đối chứng trước/sau như D2.
2. **Phép thử S1** được chèn bằng `results.splice(9, 0, …)`, chữ ghi cứng "Chạy 11 phép thử".
   - Thêm phép thử thì sửa con số 11, và chỉnh chỉ số `splice` để S1 vẫn nằm trong nhóm "Cách ly".
   - Nếu không, S1 bị chèn trước phép thử vừa thêm.
3. **Các chỗ có con số 12 phải sửa:**
   - `tests/unit/securityProbes.test.ts`: `assert.equal(results.length, 12)` và tên test. Tổng thời gian phải dưới 5 giây, kể cả trên runner Windows của CI.
   - Nút "Chạy 12 phép thử tấn công" trong `components/TrustCenter.tsx`.
   - Tài liệu ghi "12/12".
   - `check-live.py` chỉ so `passed==total`, không cần sửa.

**Kiểm nhanh:**
```bash
TAX_REFEREE_DATA_DIR=$(mktemp -d) NODE_ENV=test node --import tsx --test tests/unit/securityProbes.test.ts
```

---

## R8. Đổi câu chữ hoặc đáp án của câu hỏi chuyển tiếp

**Vị trí trong `services/questionBuilder.ts`:**
- `concreteIssue`: lý do, câu hỏi, đáp án theo từng quy tắc.
- `fieldAsk`: theo từng dữ kiện.
- `composeQuestion`: phần đầu "… {Kế toán trưởng|CFO} trả lời N ý:", định dạng `[nhóm] … A: …; hoặc B: …?`, và dòng "Trả lời một lần, ví dụ: "1A, 2A"".
- `issueItem`: cắt bỏ đuôi "KTT xử lý thế nào?" và nối "(Căn cứ: sopClause)".
- `issueEffects`: suy hệ quả từ `resultingAction`.
- Nếu `concreteIssue` trả null, câu hỏi và option lấy từ engine.

**Ràng buộc của `checkHandoff`:** vi phạm thì `evaluateWorkflow` trả 500 và hồ sơ bị giữ.
- Câu hỏi chứa số hóa đơn và chữ "CFO" hoặc "Kế toán trưởng".
- Mọi đáp án xuất hiện nguyên văn trong câu hỏi.
- Mỗi ý không quá 700 ký tự (dùng `clip()`).
- Không lộ giá trị kỹ thuật như `undefined`, `NaN`, hay "là true".
- Option khớp giữa handoff và decision; có tham chiếu POLICY và `policyRef.clause`.
- Mọi phát hiện có trong `openIssues`.

**Ngữ nghĩa:** chữ trên nút không quyết định hệ quả, `resultingAction` mới quyết định.
- `ACCEPT_*` cho kết quả RESOLVE: được duyệt chỉ khi `humanAcceptable` là true.
- `REJECT_TAX_DEDUCTION` cho kết quả REJECTED.
- Giá trị còn lại cho kết quả ON_HOLD.
- `answerHandoff` nhận `answers:{"1":"A"}`, `reason` ít nhất 8 ký tự, `revision`, `evaluationId`.

**Hay vỡ (chuỗi bị khẳng định nguyên văn):**
- `judgeRehearsal`: `/Tiền mặt → không được khấu trừ 1\.100\.000₫/`, `/CFO trả lời 2 ý/`, `/1A, 2A/`, `/loại 300\.000₫ VAT/`, `/ A: .+; hoặc B: /`, `/495\.000₫/`.
- `test-challenge-a`: `Tiền mặt → không được khấu trừ 2\.000\.000₫`.
- `test-phase0-safety`: "Tiếp khách đối tác theo quy chế", "Chi cá nhân/ngoài quy chế".
- `demoSeed.test`: `/1A, 2A/`.
- `answerCombos`: mọi tổ hợp A/B trên MAU-0009002…4 phải kết thúc hoặc chuyển sang câu khác, và có đúng 1 sự kiện `HANDOFF_ANSWERED`.
- `reviewFixes`: các luồng 1A/1B; "cần nhập".
- `executionBoundaries`: tên hàng 600 ký tự.

**Kiểm nhanh:**
```bash
TAX_REFEREE_DATA_DIR=$(mktemp -d) NODE_ENV=test node --import tsx --test tests/unit/judgeRehearsal.test.ts tests/unit/answerCombos.test.ts tests/unit/reviewFixes.test.ts tests/unit/demoSeed.test.ts && npm test -- phase0 challenge-a redteam
```

---

## R9. Ship và rollback

1. **Tạo nhánh:**
   ```bash
   git fetch origin && git switch -c feat/btc-<tên> origin/main
   ```
   - Remote `origin` là repo đội (live deploy từ đây); `minh` là fork cá nhân.
   - CI chạy khi push lên `main` hoặc `feat/**`, và khi mở PR. Nhánh `fix/**` chỉ có CI qua PR.
2. **Commit:** mỗi lát một commit nhỏ, message tiếng Việt, kết thúc bằng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
   - `guard.mjs` chặn force-push, `--no-verify`, `rebase -i`, `reset --hard origin`, `gh pr merge --squash`.
   - Commit baseline snapshot riêng, ghi danh sách ca đổi.
3. **Mở PR:**
   ```bash
   git push -u origin feat/btc-<tên>
   gh pr create --repo khanhle1406/Tax-Referee --base main --reviewer khanhle1406 --title "…" --body "…\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)"
   gh pr checks <n> --repo khanhle1406/Tax-Referee --watch
   ```
   - CI chạy typecheck, `typecheck:referee`, lint, `npm test` trên Ubuntu và Windows, rồi build.
4. **Merge:** người dùng (Minh) hoặc Khánh bấm **Create a merge commit** (hoặc `gh pr merge <n> --repo khanhle1406/Tax-Referee --merge`). Merge vào main là deploy, live khởi động lại sau khoảng 97 giây.
5. **Kiểm live:**
   - `/api/health`: `status:'ok'`, `commit` trùng `gh pr view <n> --json mergeCommit`, `startedAt` mới, `contractVersion` mới (nếu đã tăng), `audit.hmac:true`, `warnings:[]`, `ai.decisionPathLlmCalls:0`.
   - `/api/verify?mode=judge`: 9/9.
   - `/trust`: 12/12 (POST cần phiên; tối đa 10 lần mỗi 10 phút).
   - Một lệnh: `npm run live:check -- --expect-commit <sha7>`. Thêm `--no-probes` nếu đã chạy nhiều lần.
   - Trên Windows, khi pipe JSON có tiếng Việt vào Python, đặt `PYTHONIOENCODING=utf-8`.
   - Nếu `startedAt` không đổi sau 10 phút, hPanel đã không tự deploy.
6. **Rollback:**
   ```bash
   git switch -c revert/<tên> origin/main && git revert -m 1 <merge-sha> && git push -u origin revert/<tên>
   ```
   - Sau đó mở PR và merge bằng merge commit; hoặc bấm "Revert" trên PR trong GitHub; hoặc trỏ symlink về release cũ theo `deployment/HOSTINGER.md`.
   - **Dữ liệu không quay lại theo mã.** Migration vẫn còn (vì vậy chỉ được cộng thêm). Policy đã công bố trong DB vẫn hiệu lực; dùng `rollbackPolicy` trong UI nếu cần. Nhật ký vẫn còn.
   - Tránh thêm giá trị enum mới (`resultingAction`, `RuleKind`, `RiskGroup`). `decision_json` đã lưu với enum mới sẽ làm `RefereeDecisionSchema.parse` của bản cũ lỗi (ở `approvalBlock`, `answerHandoff`).

---

## 10. Lệch và bẫy phát hiện khi soát (kiểm chứng trên mã)

1. **SOP lệch mã:** `checks` của `RULE_LINE_ITEM_MISMATCH` ghi "thuế dòng lệch quá **1 ₫**", nhưng `validateLineItems` dùng `AMOUNT_TOLERANCE=10`.
2. **Tài liệu ghi "24 quy tắc" (proposal dòng 93 ghi "23"):** `checks` có 25 dòng (24 quy tắc engine cộng `RULE_SOURCE_REVIEW`); `RULE_CATALOG` có 26 (thêm `RULE_SOURCE_CONFLICT`).
3. **`RULE_MCCQT_INVALID`:** đáp án B ghi "Tạm hoãn kê khai chờ cấp mã" nhưng `resultingAction:'REJECT_TAX_DEDUCTION'`, nên trả lời B là **từ chối**. `concreteIssue` không có case cho quy tắc này. Đây là đúng lỗi "đáp án ghi tạm hoãn nhưng thực tế từ chối" trong kế hoạch.
4. **Phạm vi kiểm chứng:**
   - `tsc --noEmit` không kiểm `scripts/`.
   - `test-phase1-sprint1/2/3`, `test-api-smoke`, `test-dual-engine` không nằm trong `npm test`.
   - Không test nào bắt route thiếu `withRequestDatabase`.
5. **Mặc định trùng lặp:**
   - `DEFAULT_POLICY_CONFIG` và default của `SystemPolicyConfigSchema` là hai nơi.
   - Danh sách `excludedVat8Categories` lặp 4 lần: constants, schema, `validateLineItems`, rule 12.
6. **Sửa `legalBasis` trong `policyEngine` không đổi chữ hiển thị**, vì `describeRuleEvidence` ghi đè bằng `ruleContract` và `ARTICLE_BASIS`. Chỉ `plainExplanation` của engine được giữ lại.