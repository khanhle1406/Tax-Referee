# scripts/ — mục lục

Bảng dưới đây ghi script nào được `npm test` chạy, script nào chỉ chạy tay, và script nào là công cụ đo một lần hoặc đã ngừng dùng. Tên lệnh npm lấy từ `package.json` (17/10/2026). Danh sách bộ kiểm thử lấy từ `scripts/qa/run-all.ts`.

| Thư mục | Nội dung |
|---|---|
| `qa/` | Bộ kiểm thử hồi quy, công cụ chấm điểm và đánh giá, fixture dùng chung |
| `ops/` | Vận hành: đồng bộ văn bản pháp luật, reset hoặc dọn dữ liệu demo, nạp mẫu, nạp `.env.local` cho script CLI, kiểm bản live (`check-live.py`), kiểm kênh Gmail/Zalo thật (`channels-check.ts`) |
| `demo/` | Demo vòng cải tiến 17/10: chạy server local có lô dựng sẵn (`start-local-demo.sh`), sinh bộ 25 hóa đơn XML tổng hợp (`generate_demo_invoices.py` → `data/demo-batch/`), quay video demo và chụp ảnh màn hình (`record_demo.py`, `record_demo_voice.py`) |
| `slides/` | Dựng deck vòng cải tiến 17/10 bằng python-pptx (`build_deck.py` → `docs/submission/`) |
| `ocr/` | OCR cục bộ: Apple Vision trên macOS (`apple_vision_ocr.py`) và worker OCR chạy trong container (`local-ocr/`) |
| `benchmarks/` | Đo tốc độ và độ chính xác OCR/VLM; chạy một lần, không thuộc `npm test` |

## 1. `npm test` chạy gì

`npm test` (cũng là `npm run test:acceptance`) chạy `scripts/qa/run-all.ts`: 16 bộ, mỗi bộ trong tiến trình riêng với thư mục dữ liệu tạm. Bộ nào in ít dòng PASS hơn ngưỡng `minChecks` thì bị tính là FAIL. Lọc theo tên bộ: `npm test -- referee-core workflow`.

| Bộ | File | Lệnh npm chạy riêng |
|---|---|---|
| `unit` | `tests/unit/*.test.ts` (node:test; ngưỡng `minChecks` xem `qa/run-all.ts`) | `npm run test:unit` |
| `manifest` | `qa/test-regression-manifest.ts` | `test:manifest` |
| `referee-core` | `qa/test-referee-core.ts` | `test:referee-core` |
| `redteam` | `qa/test-redteam.ts` (72 ca trong `data/verification/redteam/cases.json`) | — |
| `referee-labels` | `qa/test-referee-labeling.ts` | `test:referee-labels` |
| `workflow` | `qa/test-workflow-safety.ts` | `test:workflow` |
| `phase0` | `qa/test-phase0-safety.ts` | `test:phase0` |
| `challenge-a` | `qa/test-challenge-a-improvements.ts` | `test:challenge-a` |
| `supplier-inference` | `qa/test-supplier-inference-safety.ts` | `test:supplier-inference` |
| `official-supplier` | `qa/test-official-supplier-lookup.ts`, `qa/test-supplier-identity-resolver.ts` | `test:official-supplier` |
| `ai-fallback` | `qa/test-ai-fallback.ts` | `test:ai-fallback` |
| `review-regressions` | `qa/test-review-regressions.ts` | `test:review-regressions` |
| `receipt-entities` | `qa/test-receipt-entities.ts` | `test:receipt-entities` |
| `image-preflight` | `qa/test-image-preflight.ts` | `test:image-preflight` |
| `qa-regressions` | `qa/test-qa-regressions.ts` | `test:qa` |
| `workspace-ui` | `qa/test-workspace-ui.ts` | `test:workspace-ui` |

Các bộ có đường gọi AI nhận khóa giả (`MOCK_AI` trong `run-all.ts`), nên `npm test` không cần khóa AI thật.

Module dùng chung, không chạy riêng: `qa/qa-fixtures.ts` (tạo fixture trước khi chạy; `npm run test:fixtures` tạo riêng), `qa/invoice-image-fixture.ts`, `qa/referee-report-utils.ts`, `ops/setup-env.ts` (nạp `.env.local`/`.env` cho script CLI).

## 2. Lệnh npm chạy tay (không thuộc `npm test`)

| Lệnh npm | File | Ghi chú |
|---|---|---|
| `test:recovery` | `qa/test-standalone-recovery.ts` | Tự khởi động `.next/standalone/server.js`, nên cần `npm run build` trước |
| `test:capture` | `qa/test-capture-session.ts` | Tự khởi động `.next/standalone/server.js`, nên cần bản build |
| `test:api` | `qa/test-api-smoke.ts` | Gọi server đang chạy ở `TEST_BASE_URL` (mặc định `http://localhost:3000`) |
| `test:real`, `test:dual-engine`, `test:comprehensive` | `qa/test-all-cases.ts`, `qa/test-dual-engine.ts`, `qa/test-comprehensive-suites.ts` | Cần hóa đơn thật đã nạp vào SQLite (`ops/ingest-real-samples.ts`) |
| `test:phase1:sprint1`, `…sprint2`, `…sprint3` | `qa/test-phase1-sprint{1,2,3}.ts` | Kiểm thử theo module của giai đoạn 1 (sprint 1–3) |
| `dataset:verify` | `qa/verify-invoice-dataset.ts` | Kiểm tra chứng từ mẫu theo `input-sample/manifest.json` (nguồn, giấy phép, đáp án, SHA-256) |
| `evaluate:independent` | `qa/evaluate-independent.ts` | Chấm trên tập nhãn độc lập (`docs/evidence/independent-labels.json`) |
| `evaluate:referee` | `qa/evaluate-referee-development.ts` | Chấm trên tập phát triển |
| `evaluate:supplier-samples` | `qa/evaluate-camera-supplier-extraction.ts` | Đánh giá trích xuất nhà cung cấp từ ảnh |
| `score:referee-questions` | `qa/score-referee-questions.ts` | Tổng hợp điểm người chấm cho câu hỏi chuyển tiếp của một lần chạy |
| `labels:lock` | `qa/lock-referee-labels.ts` | Khóa nhãn trước khi chấm độc lập |
| `typecheck:referee` | (không có file script) `tsc -p tsconfig.referee-qa.json` | Typecheck riêng các script chấm |
| `legal:sync` | `ops/sync-legal-updates.ts` | Lấy văn bản pháp luật mới từ nguồn cập nhật, in danh sách ứng viên chờ duyệt |
| `demo:reset` | `ops/reset-demo-data.ts` | Xóa hóa đơn, đánh giá và chứng từ trong database theo cấu hình hiện tại (`TAX_REFEREE_DB_PATH`/`TAX_REFEREE_DATA_DIR`) |
| `referee:snapshot` | `qa/referee-snapshot.ts --write` | Ghi lại ảnh chụp quyết định baseline `data/verification/decision-snapshot.json`; chỉ chạy khi chủ ý đổi hành vi engine |
| `referee:diff` | `qa/referee-snapshot.ts` | Chạy lại engine trên mọi fixture (mỗi ca một DB `:memory:`, không gọi mạng), so với baseline, liệt kê từng ca đổi; thoát mã 1 nếu có ca đổi |
| `live:check` | `ops/check-live.py` | Kiểm bản live sau deploy: `/api/health`, Verify 9/9, phép thử `/trust`; `--expect-commit <sha>` |
| `channels:check` | `ops/channels-check.ts` | Kiểm kết nối Gmail IMAP/SMTP và Zalo Bot thật, in chat id Zalo gần đây, `--send-test` gửi thử; không in token. Cách nạp biến ghi ở đầu file |
| `demo:local` | `demo/start-local-demo.sh` | Chạy bản build standalone ở `127.0.0.1:3060` với `TAX_REFEREE_DEMO_PRESET_BATCHES=1` và thư mục dữ liệu tạm; `-- --build` để build trước. Chỉ dùng trên máy local |

## 3. Chạy trực tiếp, có tài liệu hoặc mã khác nhắc tới

| File | Ai dùng |
|---|---|
| `qa/compare-rehearsal.ts` | Tạo bảng trước/sau trong `docs/evidence/before-after-judge-rehearsal-2026-10-14.md` |
| `qa/evaluate-user-study.ts` | Tính số liệu thử nghiệm người dùng (`docs/handoff/huong-dan-ban-giao.md`, `docs/submission/ho-so-ky-thuat.md`) |
| `qa/run-cases.ts` | Không file khác nhắc tới; cách dùng ghi ở đầu file (red team/diễn tập): chạy một tệp ca JSON qua workflow thật (`npx tsx scripts/qa/run-cases.ts <cases.json> <out.json>`) |
| `ops/cleanup-demo.py` | Dọn phiên demo cũ (`deployment/HOSTINGER.md`); mặc định chỉ xem trước, xóa cần `--apply --offline` |
| `ops/ingest-real-samples.ts` | Nạp hóa đơn mẫu vào SQLite cho các lệnh `test:real`, `test:dual-engine`, `test:comprehensive` |
| `ocr/apple_vision_ocr.py` | `services/localOcrService.ts` gọi trên macOS khi có PyObjC (Quartz, Vision) |
| `ocr/local-ocr/worker.py`, `requirements.txt` | `deployment/ocr.Dockerfile` |
| `benchmarks/benchmark_openrouter_qwen3_vl_8b.py` | `docs/qa-2026-10-10/PERFORMANCE.md` |

## 4. Không file nào gọi tới (một lần hoặc đã ngừng dùng)

Giữ lại để truy vết lịch sử, không bảo đảm còn chạy được với mã hiện tại:

- `qa/seed-taste-browser.ts`, `qa/test-diverse-invoice-types.ts`, `qa/test-e2e-real-files.ts`, `qa/test-ledger-integration.ts`, `qa/test-step2-features.ts`, `qa/test_tax_lookup.ts`.
- `qa/test_clean_10_invoices.ts`: đường dẫn cứng tới một thư mục trên máy thành viên, thuộc dự án khác, nên không chạy được trên máy khác.
- `benchmarks/benchmark_local_ocr.ts` (ghi vào `docs/qa-2026-10-10/local-ocr-evidence/`, thư mục không commit), `benchmarks/compare_ocr_vs_vlm.ts`, `benchmarks/colab_benchmark_paddleocr_vl.py`, `benchmarks/colab_benchmark_qwen3_vl.py`.

Ba file `docs/evidence/benchmarks/*.json` do các script `benchmark_10_invoices.ts`, `benchmark_hybrid_pipeline.ts`, `benchmark_hybrid_suite_2.ts` tạo ra. Các script này đã gỡ ở commit `6b1143e` (10/10/2026), vẫn xem được trong lịch sử git.
