# Hướng dẫn đóng góp

Cảm ơn bạn quan tâm tới **Tax Referee**. Dự án tự xử lý hóa đơn đầu vào thường quy và chuyển cho người những ca cần quyết định, có kiểm soát và nhật ký minh bạch. Vì hệ thống quyết định chuyện tiền thuế, mọi đóng góp đều đi qua kiểm thử và review.

Khi tham gia, bạn đồng ý tuân theo [Quy tắc ứng xử](CODE_OF_CONDUCT.md). Lỗ hổng bảo mật xin báo theo [SECURITY.md](SECURITY.md), không mở issue công khai.

## 1. Chuẩn bị môi trường

**Yêu cầu:** Node.js 22 (giống CI và production; có sẵn `.nvmrc`) hoặc 24, kèm npm. Python 3 với PyMuPDF là tùy chọn (đọc lớp chữ PDF).

```bash
git clone https://github.com/khanhle1406/Tax-Referee.git
cd Tax-Referee
npm ci
cp .env.example .env.local   # khóa AI chỉ cần cho đọc ảnh/PDF scan
npm run dev                  # http://localhost:3000
```

Verify và toàn bộ test chạy tất định, **không cần khóa API**. Không commit file môi trường thật (`.env*` trừ `.env.example`, `env_*`).

## 2. Kiểm chứng trước khi mở PR

Chạy **tuần tự** (CI chạy typecheck, lint, test trên Ubuntu với Node 22 và 24, Windows với Node 22; build chạy trên Ubuntu sau khi test đạt; CodeQL quét bảo mật):

```bash
npm run typecheck
npm run typecheck:referee
npm run lint
npm test          # 16 bộ, mỗi bộ trên database tạm riêng
npm run build     # một lần, cuối cùng
```

Chạy một file test:

```bash
TAX_REFEREE_DATA_DIR=$(mktemp -d) NODE_ENV=test node --import tsx --test tests/unit/<file>.test.ts
```

**Viết test mới:**
- Dùng `node:test` trong `tests/unit/`.
- Bọc trong `runIsolated` (`lib/server/db.ts`) để chạy trên database `:memory:`.
- Truyền `forceLocalOnly: true` khi gọi workflow để không gọi mạng.
- Bộ unit có ngưỡng `minChecks` trong `scripts/qa/run-all.ts`; thêm test thì tăng ngưỡng tương ứng.

## 3. Quy trình Pull Request

1. **Tạo nhánh từ `main`:** `feat/<tinh-nang>`, `fix/<loi>`, `docs/<noi-dung>`, `test/<pham-vi>`.
2. **Commit nhỏ, một ý một commit**, message tiếng Việt theo dạng Conventional Commits:
   - `feat(referee): ...`, `fix(auth): ...`, `docs: ...`, `test: ...`, `refactor: ...`, `chore: ...`
   - Commit có trợ lý AI tham gia thì thêm trailer `Co-Authored-By:` tương ứng.
3. **Mở PR vào `main`** theo mẫu có sẵn: mục đích, thay đổi, cách kiểm chứng, rủi ro. Reviewer: `@khanhle1406` (mặc định theo [`.github/CODEOWNERS`](.github/CODEOWNERS)).
4. **CI phải xanh** trước khi merge.
5. **Merge bằng *Create a merge commit*.** Không squash, không rebase, không force-push, không `--no-verify` — lịch sử git là bằng chứng quá trình làm.
6. **Merge vào `main` = deploy production** (hPanel tự deploy sau khoảng 1,5 phút; chờ 2–5 phút rồi kiểm). Sau merge, kiểm `/api/health` (commit mới), `/verify` (9/9), `/trust` (12/12).

## 4. Nguyên tắc cốt lõi

- **Quy tắc tất định quyết định, AI chỉ đọc chứng từ.** Hệ thống chạy 25 quy tắc SOP (24 trong engine, 1 do workflow thêm khi dữ liệu chưa xác minh), không gọi LLM trên đường quyết định, không có vòng lặp agent. Trường nào AI viết ra mà quy tắc dùng tới phải nằm trong danh sách cho phép (`VISION_ALLOWED_KEYS`).
- **Căn cứ pháp lý theo ngày lập hóa đơn** (`lib/legalBasis.ts`). Văn bản chưa đối chiếu nguyên văn thì không ghi số điều.
- **Không đoán bừa, không chuyển tiếp thừa.** Dữ liệu nghi vấn thì hỏi; dữ kiện không làm đổi kết quả thì không hỏi.
- **Kiểm soát không được nới lỏng ngầm.** Hoàn tác, sửa số tiền, đổi policy không được hạ thẩm quyền hay gỡ lệnh giữ của người khác.
- **Nhật ký chỉ ghi thêm.** Mọi quyết định và thao tác ghi vào chuỗi SHA-256 + HMAC.
- **Trung thực về bằng chứng.** Không bịa số liệu, tên, chức danh hay trích dẫn người dùng; tài liệu phải khớp mã.

## 5. Tài liệu

- Mục lục: [docs/README.md](docs/README.md).
- Tài liệu nộp thi viết tiếng Việt có dấu. Bộ slide giữ đúng 5 slide theo thể lệ.
- Đổi hành vi thì cập nhật README, `/trust` hoặc tài liệu liên quan trong cùng PR, và ghi vào [CHANGELOG.md](CHANGELOG.md) mục *Chưa phát hành*.
