# Kịch bản thuyết trình Tax Referee — vòng cải tiến Demo Day 17/10/2026

> **Người đọc:** thành viên đội cầm lên sân khấu nói. **Người nghe:** Ban giám khảo.
> **Deck:** 11 slide dựng bằng `scripts/slides/build_deck.py` (hàm `build()`), thứ tự: 1 Bìa · 2 Hiện trạng · 3 Nỗi đau · 4 Phương pháp · 5 Kiến trúc + Câu hỏi 2 · 6 Giải pháp 1 · 7 Giải pháp 2 · 8 Giải pháp 3 · 9 Bảo mật (Câu hỏi 1) · 10 Riêng tư và pháp lý · 11 Video demo.
> **Cách đọc kịch bản:** đoạn trong khung trích dẫn (`>`) là lời nói nguyên văn. Chữ nhỏ trong <sub>[ngoặc vuông]</sub> là nguồn trong repo để đội tự kiểm, **không đọc to**.
> **Tổng thời lượng:** khoảng 8 phút nói + video 1 phút 24 giây. Tốc độ tính theo khoảng 200 tiếng mỗi phút (nói rõ, không vội).

## Bảng thời lượng

| # | Slide | Thời lượng | Người nói (phương án 2 người) |
|---|---|---|---|
| 1 | Bìa | 0:25 | Minh |
| 2 | Hiện trạng | 0:30 | Minh |
| 3 | Nỗi đau (và vì sao chọn thuế) | 0:55 | Minh |
| 4 | Phương pháp | 0:55 | Minh |
| 5 | Kiến trúc + trả lời Câu hỏi 2 | 1:15 | Khánh |
| 6 | Giải pháp 1: lô và phiếu giải trình | 0:35 | Minh |
| 7 | Giải pháp 2: máy quyết, người chốt, biết ai gửi | 0:45 | Minh |
| 8 | Giải pháp 3: Tổng quan, Lịch sử của tôi | 0:30 | Minh |
| 9 | Bảo mật, trả lời Câu hỏi 1 | 0:55 | Khánh |
| 10 | Riêng tư và pháp lý | 0:50 | Khánh |
| 11 | Video demo (giới thiệu 0:15 + câu kết 0:15) | 0:30 + 1:24 video | Minh |
| | **Cộng** | **khoảng 8:00 + 1:24 video** | |

Thời lượng đo bằng cách đếm số tiếng trong lời nói của từng slide, chia cho 200 tiếng mỗi phút. Nói nhanh hơn một chút (khoảng 215 tiếng mỗi phút) thì tổng còn khoảng 7 phút 30 giây. Nếu bị cắt còn khoảng 6 phút: bỏ slide 2 và slide 8, slide 5 chỉ nói phần Câu hỏi 2, slide 10 chỉ nói đoạn "về thuế".

## Chuẩn bị 2 phút trước khi lên

- Mở deck ở chế độ trình chiếu. Mở sẵn file dự phòng `docs/submission/video/Tax-Referee-demo-1-phut.mp4` (phòng khi video nhúng ở slide 11 không chạy).
- Video và ảnh chụp được quay trên **bản build ở máy của đội**, dữ liệu là 25 file XML tổng hợp do đội tự tạo <sub>[data/demo-batch/README.md; scripts/demo/record_demo_voice.py]</sub>. Chỉ nói "đã có trên bản live" khi `/api/health` trên live cho thấy commit có tính năng lô.
- **Không đọc to con số trên ảnh chụp màn hình** (số hóa đơn, phần trăm, tiền VAT trên ảnh). Đó là số của một phiên demo, không phải kết quả đo.
- **Không nói số liệu người dùng.** Buổi thử người dùng 16/10 không cho số liệu định lượng <sub>[docs/handoff/BAN-GIAO-DEMO-DAY-17-10.md mục 2]</sub>.
- Mục **"Cần sửa trên slide"** ở cuối file: các chỗ lệch mã đã sửa (xem hai ghi chú cập nhật đầu mục); danh sách gốc giữ lại để đối chiếu. Còn mở: xác nhận số slide với Ban tổ chức (C3).

---

## Slide 1 — Bìa

**Thời lượng:** 25 giây · **Người nói:** Minh

**Hành động:** Đứng giữa sân khấu, nhìn giám khảo, chưa bấm. Khi nói câu "máy quyết từng hóa đơn, người chốt cả lô", đưa tay lướt qua bốn ô "Nhận hóa đơn → Đọc chứng từ → Máy quyết → Người chốt".

**Lời nói:**

> Chào Ban giám khảo. Chúng em là đội Fprinciples. Sản phẩm của chúng em là Tax Referee: một trọng tài kiểm hóa đơn mua vào, để doanh nghiệp không mất tiền thuế.
>
> Cả bài gói trong một câu: máy quyết từng hóa đơn, người chốt cả lô. Quy tắc ra quyết định. AI chỉ đọc chứng từ. Người có thẩm quyền ký chốt.
>
> Em đi qua vấn đề, cách làm, ba phần giải pháp, bảo mật, pháp lý, rồi mời xem video khoảng một phút rưỡi.

**Chốt ý:** Máy quyết từng hóa đơn, người chốt cả lô.

---

## Slide 2 — Hiện trạng: cuối tháng của chị kế toán

**Thời lượng:** 30 giây · **Người nói:** Minh

**Hành động:** Chỉ lần lượt ba ô bên trái (Gmail, Zalo, Giấy/ảnh chụp) → ô giữa → bốn bước đánh số bên phải. Đây là **cảnh minh họa**, không phải số liệu khảo sát: dùng đúng chữ "thử hình dung".

**Lời nói:**

> Thử hình dung chị kế toán vào cuối tháng. Hóa đơn đổ về từ nhiều phía: email, Zalo, giấy. Có cái là file XML, có cái chỉ là ảnh chụp mờ.
>
> Chị mở từng mail, tải từng file, lướt Zalo tìm ảnh, gõ lại vào Excel. Rồi chị dò bằng mắt từng điều kiện: ngày lập, trả tiền mặt hay chuyển khoản, có quá ngưỡng không, người bán còn hoạt động không.
>
> Mỗi hóa đơn phải đạt nhiều điều kiện cùng lúc mới được khấu trừ thuế. Một người, rất nhiều tờ, vài ngày cuối tháng.

**Chốt ý:** Đúng hay sai đã có luật viết rõ, nhưng hôm nay vẫn kiểm bằng mắt và bằng tay.

---

## Slide 3 — Nỗi đau (kèm lý do chọn thuế)

**Thời lượng:** 55 giây · **Người nói:** Minh

**Hành động:** Nói đoạn "vì sao chọn thuế" khi chưa chỉ vào ô nào. Sau đó chỉ lần lượt bốn ô 1 → 2 → 3 → 4. Ở ô 1, dừng một nhịp sau câu "không được trừ".

**Lời nói:**

> Vì sao chúng em chọn thuế giá trị gia tăng đầu vào? Vì mỗi lỗi là tiền thật. Khi công ty mua hàng, trong giá đã có một phần tiền thuế. Hóa đơn đúng luật thì công ty được trừ lại phần đó khi nộp thuế, giống như giữ đúng phiếu thì được hoàn tiền. Luật thuế viết rõ nên máy chấm được, nhưng luật đổi theo ngày nên làm tay dễ nhầm.
>
> Có bốn chỗ đau. Một: sai một điều kiện là mất tiền. Ví dụ hóa đơn 6 triệu trả tiền mặt, lập sau ngày 1 tháng 7 năm 2025. Từ ngày đó, hóa đơn từ 5 triệu trở lên phải trả qua ngân hàng, nên phần thuế trong tờ này không được trừ.
>
> Hai: hai cách làm quen tay đều sai. Cho qua hết thì khi thanh tra bị loại. Cái gì cũng hỏi sếp thì sếp nghẽn cuối tháng.
>
> Ba: hóa đơn qua mail, qua Zalo thì không chắc ai gửi. Kẻ xấu có thể giả danh nhà cung cấp.
>
> Bốn: sếp không thấy cái gì đang kẹt, chờ ai, vì sao, cho tới khi có chuyện.

**Ghi chú cho người nói (không đọc):**
- Ngưỡng 5 triệu tính trên tổng tiền **đã gồm thuế**, áp cho hóa đơn lập từ 01/7/2025; trước đó ngưỡng là 20 triệu <sub>[data/regulatoryRegistry.ts `getApplicableRegulations`; services/policyEngine.ts quy tắc `STATUTORY_LAW_48_CASH_PAYMENT`]</sub>.
- Nếu giám khảo hỏi "mất bao nhiêu": với thuế suất 10%, phần thuế trong 6 triệu là khoảng 545 nghìn đồng <sub>[tính từ ví dụ trên slide: 6.000.000 ÷ 1,1 × 10%]</sub>.
- Bằng chứng cho câu "luật đổi theo ngày": riêng mức giảm thuế 8% đã có 6 đợt khác nhau từ 2022 đến hết 2026, mỗi đợt một danh sách loại trừ <sub>[lib/legalBasis.ts `VAT_REDUCTION_PERIODS`]</sub>.
- Máy **không tự kết luận** "không được trừ". Máy dừng ca này ở nhóm "Ngoài quy định" và hỏi Kế toán trưởng: A "Đã chuyển khoản, bổ sung ủy nhiệm chi để khấu trừ", B "Trả tiền mặt thật, loại phần thuế khỏi khấu trừ" <sub>[services/questionBuilder.ts `concreteIssue`]</sub>.

**Chốt ý:** Mỗi lỗi là tiền thật, mà duyệt bừa hay hỏi hết đều sai.

---

## Slide 4 — Phương pháp: quy tắc quyết định, AI chỉ đọc, người chốt

**Thời lượng:** 55 giây · **Người nói:** Minh

**Hành động:** Chỉ vào khung "Giống cô giáo chấm bài" khi mở đầu. Chỉ lần lượt ba vòng tròn 1, 2, 3 bên phải. Kết thúc bằng tay chỉ vào dòng đỏ "chưa rõ thông tin · ngoài quy định · vượt thẩm quyền".

**Lời nói:**

> Cách làm của chúng em giống cô giáo chấm bài theo đáp án. Bài đúng hết thì cho điểm luôn. Bài sai chỗ nào thì khoanh đỏ đúng chỗ đó và hỏi lại.
>
> Một, quy tắc quyết định: bộ quy tắc viết sẵn theo luật, không gọi AI lần nào, nên cùng dữ liệu thì chạy lại bao nhiêu lần cũng ra một kết quả. Hai, AI chỉ đọc: AI chép chữ trên ảnh vào ô có sẵn, không được duyệt, không được từ chối. Ba, người chốt: chưa chắc thì máy dừng và hỏi đúng người.
>
> Máy chỉ dừng theo ba kiểu, đúng như đề bài. Chưa rõ thông tin, như đề bị mờ. Ngoài quy định, như câu không có trong đáp án. Vượt thẩm quyền, như bài cần hiệu trưởng ký. Khi dừng, máy không hỏi chung chung "xem lại giúp", mà hỏi kiểu trắc nghiệm, trả lời một lần "1A, 2B", mỗi đáp án ghi rõ được trừ hay mất bao nhiêu tiền. Ca máy đã duyệt vẫn bị chấm lại ngẫu nhiên.

**Ghi chú cho người nói (không đọc):**
- 26 mã quy tắc, xếp vào đúng 3 nhóm dừng: 13 "chưa rõ thông tin", 10 "ngoài quy định", 3 "vượt thẩm quyền" <sub>[lib/riskTaxonomy.ts `RULE_CATALOG`]</sub>.
- Dữ liệu đang bị gắn cờ nghi vấn thì máy **không** kết luận "vi phạm" hay "vượt quyền" trên dữ liệu đó; nhóm chính khi ấy là "chưa rõ thông tin" (đúng yêu cầu Đề A: không khẳng định trên dữ liệu nghi vấn) <sub>[lib/riskTaxonomy.ts `dependsOnUnverified`, `orderFindings`; scratch/challenge_brief.txt (đề bài, file cục bộ, không có trong git), Đề A]</sub>.
- Câu hỏi "1A, 2B" là mẫu cố định, AI không tạo số liệu trong câu hỏi <sub>[services/questionBuilder.ts, chú thích đầu file]</sub>.
- Hậu kiểm ngẫu nhiên 10% số ca máy tự duyệt; gấp 3 lần khi số tiền nằm trong khoảng 15% sát dưới một ngưỡng (ví dụ hóa đơn 4,5 triệu sát ngưỡng 5 triệu) <sub>[services/postAuditService.ts `DEFAULT_POST_AUDIT_RATE`, `stratifiedRate`]</sub>.
- Nếu bị vặn "tất định là gì": cùng dữ liệu, cùng quy chế, cùng sổ sách trong ngày thì ra cùng kết quả. Hiện chưa lưu ảnh chụp sổ sách theo từng lần đánh giá <sub>[docs/handoff/the-nhac-thuyet-trinh-17-10.md, câu dự phòng]</sub>.

**Chốt ý:** Quy tắc quyết, AI chỉ đọc, người chốt; khi dừng thì hỏi một câu trả lời được ngay.

---

## Slide 5 — Kiến trúc: đường đi của một hóa đơn (trả lời Câu hỏi 2)

**Thời lượng:** 1 phút 15 giây · **Người nói:** Khánh

**Hành động:** Chuyển lời: Minh nói "Phần kiến trúc, mời Khánh". Khánh chỉ theo sơ đồ: hàng ① từ trái sang phải → mũi tên xuống → hàng ② → nền "an toàn dưới mọi bước". Sang phần Câu hỏi 2 thì chỉ sang khung xám "Lên production" bên phải.

**Lời nói (kiến trúc):**

> Đây là đường đi của một hóa đơn. Hàng trên: hóa đơn vào từ Gmail, Zalo hoặc tải lên. Hệ thống xem ai gửi. XML thì máy đọc theo khuôn cố định, không qua AI. Ảnh thì AI chỉ trả về 14 ô nhìn thấy. Rồi hóa đơn được xếp vào lô.
>
> Hàng giữa: quy tắc quyết định theo luật của đúng ngày lập. Đạt thì đề xuất duyệt kèm phiếu giải trình. Chưa đạt thì hỏi đúng người. Cuối cùng người có thẩm quyền chốt lô. Nền dưới cùng: nhật ký chống sửa và phân quyền.

**Lời nói (Câu hỏi 2):**

> Đây cũng là câu trả lời cho câu hỏi 2: đi từ demo lên production thế nào. Một câu thôi: đổi hạ tầng, giữ nguyên nguyên tắc, quy tắc quyết định, AI chỉ đọc.
>
> Ba đánh đổi chúng em tự chọn. Quy tắc thay vì để AI quyết: mất độ linh hoạt, được khả năng kiểm toán. Mỗi phiên một file SQLite: cách ly đơn giản nhưng chỉ chạy một máy; cần nhiều máy thì chuyển PostgreSQL. Gọi AI đọc ảnh qua nhà cung cấp trung gian: nhanh ra demo, nhưng dữ liệu đi ra ngoài; khách thật phải có hợp đồng xử lý dữ liệu, hoặc chỉ chạy XML.
>
> Ba mươi ngày tới: đăng nhập một lần có MFA, tách phần đọc file ra máy riêng, thêm hàng đợi. Chín mươi ngày: lấy XML hóa đơn có chữ ký số làm nguồn sự thật. Nói thẳng: chúng em chưa đo tải, chưa cam kết thời gian khôi phục.

**Khung trả lời Câu hỏi 2 (khi giám khảo hỏi thêm):**

- **Câu hỏi, theo bản đội ghi lại:** "Kiến trúc và đường từ demo lên production" <sub>[docs/handoff/BAN-GIAO-DEMO-DAY-17-10.md mục 2; nguyên văn của Ban tổ chức không lưu trong repo]</sub>.
- **Trả lời một câu:** Hôm nay một máy, mỗi phiên một SQLite, gọi AI đồng bộ; lên production thì tách worker đọc file, chuyển PostgreSQL, thêm SSO/MFA, lấy XML có chữ ký số làm nguồn sự thật, còn nguyên tắc "quy tắc quyết định, AI chỉ đọc" giữ nguyên.
- **Bằng chứng trong sản phẩm:**
  - Kiến trúc 7 lớp có tên file từng lớp <sub>[docs/architecture/demo-to-production.md mục 1]</sub>.
  - Đường quyết định gọi AI 0 lần; khâu nạp một ảnh tối đa 1 lần gọi đọc ảnh (chờ tối đa 35 giây) và 2 lần tra cứu <sub>[/api/health khối `ai`; services/geminiService.ts `VISION_TIMEOUT_MS`; services/officialSupplierLookupService.ts `GROUNDING_MAX_CALLS`]</sub>.
  - Cái vỡ trước khi mở rộng đã ghi rõ: đọc PDF chặn tiến trình tới 3 giây, hạn mức nằm trong bộ nhớ từng tiến trình, chuỗi nhật ký giả định một người ghi <sub>[docs/architecture/demo-to-production.md mục 3]</sub>.
- **Giới hạn trung thực:** chưa đo p95; mới có một lần đo đọc ảnh trên live khoảng 7,8 giây, không phải p95 <sub>[docs/architecture/demo-to-production.md mục 2, mục 6]</sub>. Chưa có RPO/RTO. Dịch vụ VNG Cloud trong lộ trình mới tra qua tài liệu công khai, cần VNG xác nhận <sub>[docs/architecture/demo-to-production.md mục 7]</sub>.

**Chốt ý:** Đổi hạ tầng thì được, đổi nguyên tắc thì không: quy tắc quyết, AI chỉ đọc.

---

## Slide 6 — Giải pháp 1: lô hóa đơn và phiếu giải trình

**Thời lượng:** 35 giây · **Người nói:** Minh

**Hành động:** Chuyển lời: Khánh nói "Mời Minh vào ba phần giải pháp". Chỉ vào bốn ô số trên ảnh trái ("Máy đề xuất duyệt · Cần người quyết · Đã duyệt sau khi hỏi · Từ chối, tạm giữ, lỗi") nhưng **không đọc số**. Chỉ vào các dòng có dấu ✓ trên ảnh phải.

**Lời nói:**

> Giải pháp một: lô hóa đơn và phiếu giải trình. Chị kế toán không làm lẻ từng tờ nữa. Chị kéo cả lô vào. Máy đọc hết, xếp cố định theo mã số thuế người bán, rồi ngày, rồi số hóa đơn, để kết quả không phụ thuộc file nào đến trước. Gửi lại cùng một file thì không tạo bản thứ hai. Một hóa đơn chỉ nằm trong một lô, nên không bị ghi sổ hai lần.
>
> Mỗi tờ có một phiếu giải trình bằng lời thường: đạt điều kiện nào, thiếu điều kiện nào, căn cứ nào theo ngày lập, và kết quả cuối là duyệt, từ chối hay tạm giữ.

**Ghi chú cho người nói (không đọc):**
- Thứ tự cố định quan trọng vì có quy tắc cộng dồn trong ngày: hai hóa đơn tiền mặt cùng người bán, cùng ngày, mỗi tờ 3,3 triệu thì cộng lại vượt 5 triệu; chia nhỏ để lách ngưỡng vẫn bị bắt <sub>[components/workspace/BatchesView.tsx `runBatch` bước 2; services/securityProbeService.ts phép thử D3]</sub>.
- Chống trùng: file trùng nội dung trong cùng lượt tải bị bỏ trước khi máy kiểm; cùng mã băm file trong cùng lô thì trả lại mục cũ; hóa đơn đã nằm ở lô khác thì bị chặn <sub>[components/workspace/BatchesView.tsx `runBatch`; services/batchService.ts `attachToBatch`]</sub>. Hóa đơn khác file nhưng trùng số với hóa đơn đã nhận thì máy dừng ở quy tắc trùng hóa đơn <sub>[lib/riskTaxonomy.ts `RULE_DUPLICATE_INVOICE`]</sub>.
- Phiếu giải trình dùng chính các hàm của engine (ngưỡng theo ngày lập, thuế theo thuế suất, kỳ giảm 8%), nên phiếu không nói khác quyết định <sub>[lib/explainDecision.ts]</sub>.
- Câu trên phiếu khi đạt: "Giống bài kiểm tra không sai câu nào…" <sub>[lib/explainDecision.ts]</sub>.

**Chốt ý:** Cả lô có thứ tự, từng tờ có lý do.

---

## Slide 7 — Giải pháp 2: máy quyết, người chốt, biết ai gửi

**Thời lượng:** 45 giây · **Người nói:** Minh

**Hành động:** Chỉ lần lượt ba vòng tròn 1, 2, 3. Ở ý 3, chỉ sang ảnh màn hình Hộp thư vào. Nhấn giọng chữ "mô phỏng".

**Lời nói:**

> Giải pháp hai. Ban giám khảo góp ý: không để máy tự duyệt trong tài chính. Vì vậy máy kiểm từng tờ, còn chốt lô là việc của người. Người tạo lô không tự chốt. Ai đã nhập hóa đơn trong lô cũng không chốt lô đó, như không ai tự chấm bài của mình. Lô có hóa đơn từ 200 triệu thì Giám đốc tài chính chốt.
>
> Ba tờ cùng hỏi "đã có ủy nhiệm chi chưa" thì Kế toán trưởng trả lời một lần cho cả ba. Mỗi tờ vẫn được kiểm quyền và ghi nhật ký riêng.
>
> Hóa đơn qua Gmail được so với danh bạ và kiểm SPF, DKIM, như con dấu bưu điện trên phong bì. Thư mạo tên nhân viên mà không có dấu bị gắn nhãn nghi mạo danh. Trong phiên demo, Gmail và Zalo chạy chế độ mô phỏng, không gửi tin thật.

**Ghi chú cho người nói (không đọc):**
- Góp ý "không để máy tự duyệt trong tài chính" là cách đội ghi trong mã; nguyên văn của Ban giám khảo không lưu trong repo <sub>[services/batchService.ts, chú thích đầu file]</sub>.
- Điều kiện chốt lô: chỉ Kế toán trưởng hoặc CFO; người tạo lô không chốt; người đã nhập hóa đơn đã duyệt trong lô không chốt; có hóa đơn từ 200 triệu thì chỉ CFO; ghi lý do từ 8 ký tự; ghi sổ đánh dấu theo từng hóa đơn; hóa đơn còn chờ hay tạm giữ lúc chốt **không** được ghi sổ, nếu duyệt sau thì phải "chốt bổ sung" trên cùng lô, cùng luật <sub>[services/batchService.ts `signOffBlockers`, `signOffBatch`, `LEDGER_READY_SQL`; services/policyEngine.ts `kttApprovalLimit`]</sub>. Tải XML/CSV sổ cái và đẩy chứng từ chỉ Kế toán trưởng/CFO (quyền `ledger.export`) <sub>[app/api/ledger/export/route.ts; app/api/ledger/sync/route.ts]</sub>.
- Duyệt nhóm: chỉ Kế toán trưởng hoặc CFO; tối thiểu 2, tối đa 50 hóa đơn có câu hỏi cùng nội dung và cùng hệ quả đáp án; câu xác nhận giá trị riêng của từng tờ (số tiền, MST, ngày đọc từ ảnh; ảnh mờ; số liệu lệch) không bao giờ gộp; thẻ nhóm liệt kê từng hóa đơn; mỗi tờ đi qua đúng `answerHandoff` với phiên bản người duyệt đã thấy (hồ sơ vừa đổi thì 409), tờ nào bị chặn không làm hỏng tờ khác <sub>[services/batchService.ts `questionKey`, `answerGroup`]</sub>.
- Chữ trên slide "example.com@evil.net": mẹo viết địa chỉ trông giống tên miền công ty, nhưng đuôi thật là evil.net. Mã lấy tên miền sau dấu @ cuối cùng nên mẹo này bị chặn <sub>[services/staffDirectory.ts `emailAuthenticated`]</sub>.
- Zalo nhận diện bằng Zalo user id trong danh bạ, không có SPF/DKIM <sub>[services/staffDirectory.ts `identifySender`]</sub>. Ảnh/PDF đến qua kênh được **lưu nhưng chưa tự đọc** (trạng thái `QUEUED`, nhãn "Ảnh/PDF đã lưu — chưa tự đọc"); muốn đọc thì tải ảnh lên ở màn Lô hóa đơn hoặc Tiếp nhận. Chỉ file XML được kiểm ngay <sub>[services/channels/channelService.ts `ingestFile`]</sub>.
- Chỉ Kế toán viên (người nhập) bấm lấy thư; Kế toán trưởng/CFO xác nhận người gửi lạ, sau đó file được xử lý dưới tên Kế toán viên đã lấy thư, nên người xác nhận vẫn duyệt độc lập. Mỗi thư tối đa 5 đính kèm, mỗi lượt tối đa 50 file (10 file từ người gửi chưa xác thực) <sub>[services/channels/channelService.ts; lib/capabilities.ts `channel.pull`]</sub>.
- Chế độ mô phỏng bật trong phiên demo khi máy chủ **không** đặt biến `TAX_REFEREE_ALLOW_REAL_CHANNELS_IN_DEMO=1`; tin gửi đi được ghi trạng thái "Mô phỏng — không gửi thật" <sub>[services/channels/demoMock.ts `demoChannelsActive`, `demoNotifier`]</sub>. Không nói Gmail/Zalo "đang chạy thật" nếu máy demo chưa đặt biến kênh thật.

**Chốt ý:** Máy làm nhanh, người giữ chữ ký, và không ai lọt vào bằng tên giả.

---

## Slide 8 — Giải pháp 3: sếp thấy toàn cảnh, mỗi người thấy việc mình

**Thời lượng:** 30 giây · **Người nói:** Minh

**Hành động:** Chỉ khung vàng "Đang chờ anh/chị quyết định" trên ảnh trái (không đọc số), rồi chỉ ảnh "Lịch sử của tôi" bên phải.

**Lời nói:**

> Giải pháp ba. Màn hình Tổng quan cho Kế toán trưởng và Giám đốc tài chính: có bao nhiêu hóa đơn đang chờ chính mình quyết, tiền thuế đang chờ là bao nhiêu, bao nhiêu lô đã chốt, bao nhiêu lô chưa, lý do dừng nhiều nhất, và ca nào chờ quá 24 giờ.
>
> Màn hình Lịch sử của tôi cho từng người: mình đã nhập gì, trả lời gì, duyệt gì, ghi bằng tiếng Việt dễ đọc. Phần việc đã làm lấy thẳng từ nhật ký chỉ ghi thêm.

**Ghi chú cho người nói (không đọc):**
- Tổng quan chỉ đọc, không ghi dữ liệu; chỉ Kế toán trưởng và CFO xem được; có top 5 lý do dừng, mốc 24 giờ, số lô đã chốt/chưa chốt, theo kênh và theo người gửi <sub>[services/dashboardService.ts `getDashboard`; lib/workflowPresentation.ts `caseDeadline`]</sub>.
- "Máy tự xử lý" được tính theo nhật ký, không theo trạng thái: ca từng bị dừng rồi người duyệt thì tính là "có người xử lý" <sub>[services/dashboardService.ts `approvalSource`]</sub>.
- Lịch sử của tôi chỉ đọc bản ghi của chính người gọi, không có tham số xem người khác <sub>[services/historyService.ts `getMyHistory`]</sub>.

**Chốt ý:** Sếp thấy chỗ kẹt trước khi có chuyện.

---

## Slide 9 — Bảo mật: máy đọc có thể bị lừa, trọng tài thì không (trả lời Câu hỏi 1)

**Thời lượng:** 55 giây · **Người nói:** Khánh

**Hành động:** Chuyển lời: Minh nói "Phần bảo mật và pháp lý, mời Khánh". Chỉ lần lượt bốn ô: Định danh → Đặc quyền tối thiểu → Ranh giới thực thi tất định → Cách ly. Cuối cùng chỉ ảnh trang /trust. (Tùy chọn, nếu có mạng và còn giờ: mở `/trust`, bấm "Chạy 12 phép thử tấn công", chỉ dòng D2 và L3. Trang giới hạn 10 lần mỗi 10 phút, đừng bấm thử liên tục <sub>[docs/handoff/the-nhac-thuyet-trinh-17-10.md mục 0]</sub>.)

**Lời nói:**

> Câu hỏi 1 của Ban tổ chức: bảo mật cho hệ có agent AI. Trả lời một câu: máy đọc có thể bị lừa, trọng tài thì không. Agent AI của chúng em không có quyền quyết định, và mỗi chữ nó viết ra bị kiểm như một quyền.
>
> Bốn trụ. Định danh: máy tự duyệt thì nhật ký ghi tên máy, không mượn tên người nhập. Đặc quyền tối thiểu: quyền kiểm ở máy chủ. Kế toán trưởng sửa ca 330 triệu xuống 198 triệu thì ca vẫn chờ Giám đốc tài chính. Ranh giới thực thi: AI đọc ảnh chỉ được khai 14 ô. Nếu bị lừa và tự khai "đã có ủy nhiệm chi", ô đó bị loại, ca phải hỏi người. Cách ly: mỗi phiên một cơ sở dữ liệu riêng. Nhật ký bị sửa là lộ, như cuốn sổ đánh số trang, xé một trang là biết.
>
> Mười hai phép thử cho bốn trụ chạy ngay trên trang /trust. Giới hạn nói thẳng: vai trò trong demo là mô phỏng, và trình đọc PDF chưa chạy trong container riêng.

**Khung trả lời Câu hỏi 1 (khi giám khảo hỏi thêm):**

- **Câu hỏi, theo bản đội ghi lại:** "Hiểu thật thách thức bảo mật của hệ có agent AI trong doanh nghiệp: định danh, đặc quyền tối thiểu, ranh giới thực thi tất định, cách ly" <sub>[docs/handoff/BAN-GIAO-DEMO-DAY-17-10.md mục 2; nguyên văn của Ban tổ chức không lưu trong repo]</sub>.
- **Trả lời một câu:** AI chỉ đọc, quyền ghi trạng thái thuế nằm trong bộ quy tắc tất định; vì vậy rủi ro chuyển sang dữ liệu, và từng ô AI viết ra được kiểm như một quyền.
- **Bằng chứng trong sản phẩm:**
  - 12 phép thử chạy trên mã đang deploy, mỗi phép thử một cơ sở dữ liệu trong bộ nhớ riêng, không gọi mạng: Định danh 2 (I1, I2), Đặc quyền tối thiểu 3 (L1, L2, L3), Ranh giới thực thi 4 (D1 đến D4), Cách ly 3 (S1, S2, S3) <sub>[services/securityProbeService.ts]</sub>.
  - D2: cùng một đầu ra của agent bị chiếm, tin AI thì ca thành "thường quy", qua ranh giới thì thành "chuyển người" <sub>[services/securityProbeService.ts D2; services/geminiService.ts `filterVisionInvoice`]</sub>.
  - L3: sửa 330 triệu xuống 198 triệu vẫn `WAITING_CFO` <sub>[services/securityProbeService.ts L3]</sub>.
  - Nhật ký nối chuỗi SHA-256, có HMAC và điểm neo; S2 gỡ trigger rồi sửa một dòng thì bị phát hiện <sub>[lib/server/audit.ts `verifyAuditChain`, `auditAnchor`]</sub>.
  - Ngân sách AI (OWASP LLM10): 60 lần đọc ảnh mỗi giờ mỗi người, 600 lần mỗi giờ toàn hệ thống; tra cứu 60 lần mỗi giờ mỗi phiên, 300 lần mỗi giờ toàn hệ thống; vượt trần thì không gọi AI <sub>[lib/server/aiBudget.ts `AI_BUDGET_DEFAULTS`]</sub>.
- **Giới hạn trung thực:**
  - Vai trò trong demo là mô phỏng, một người đổi được ba vai trong phiên demo. Production cần SSO và MFA khi CFO duyệt <sub>[docs/handoff/BAN-GIAO-DEMO-DAY-17-10.md mục 5]</sub>.
  - Agent bị chiếm vẫn quyết định được giá trị của 14 ô, kể cả số tiền. Lớp chặn là kiểm số học, kiểm mã số thuế, người đối chiếu và hậu kiểm, không tuyệt đối <sub>[docs/handoff/the-nhac-thuyet-trinh-17-10.md mục A2]</sub>.
  - Khóa HMAC nằm cùng máy chủ: chống người chỉ sửa được file dữ liệu, không chống người chiếm cả máy <sub>[docs/handoff/BAN-GIAO-DEMO-DAY-17-10.md mục 5]</sub>.
  - Đây là phép thử hồi quy mô phỏng tấn công, không phải pentest độc lập. Không nói "tuân thủ" chuẩn nào.

**Chốt ý:** Chúng em không tin mô hình; chúng em giới hạn nó, và chứng minh bằng phép thử chạy trên chính bản đang chạy.

---

## Slide 10 — Riêng tư và pháp lý: dữ liệu đi đâu, luật nào áp dụng

**Thời lượng:** 50 giây · **Người nói:** Khánh

**Hành động:** Nửa đầu chỉ bốn dấu ✓ bên trái. Nửa sau chỉ khung "Thuế: căn cứ theo NGÀY LẬP hóa đơn", rồi khung vàng "Dữ liệu cá nhân".

**Lời nói:**

> Dữ liệu đi đâu. File XML máy tự đọc, không gửi cho AI. Riêng tên và mã số thuế người bán có thể được gửi đi tra cứu: qua dịch vụ tra cứu bên thứ ba, và qua công cụ tìm kiếm chỉ nhận kết quả từ trang .gov.vn. Ảnh thì AI chỉ trả về 14 ô nhìn thấy. Không muốn ảnh rời máy chủ thì tắt AI, chỉ nhận XML và nhập tay.
>
> Về thuế, máy chọn luật theo ngày lập hóa đơn. Cùng hóa đơn 6 triệu trả tiền mặt: lập ngày 30 tháng 6 năm 2025 thì theo Thông tư 219, ngưỡng 20 triệu, chưa cần chuyển khoản. Lập từ 1 tháng 7 thì theo Luật 48 và Nghị định 181, ngưỡng 5 triệu, phải chuyển khoản.
>
> Về dữ liệu cá nhân, chúng em đối chiếu Luật Bảo vệ dữ liệu cá nhân số 91 năm 2025 và Nghị định 356 qua nguồn thứ cấp, nên không trích số điều. Lên production phải có hợp đồng xử lý dữ liệu với nhà cung cấp AI, hoặc chỉ chạy XML.

**Ghi chú cho người nói (không đọc):**
- Căn cứ theo ngày lập: trước 01/7/2025 là Thông tư 219/2013/TT-BTC; từ 01/7/2025 là Luật Thuế GTGT 48/2024/QH15 và Nghị định 181/2025/NĐ-CP <sub>[lib/legalBasis.ts `cashPaymentBasis`; data/regulatoryRegistry.ts]</sub>. Số điều khoản trong mã (Điều 14 Luật 48/2024, Điều 26 NĐ 181/2025, Điều 15 TT 219/2013) đã được đội đối chiếu nguyên văn ngày 17/10/2026 <sub>[lib/legalBasis.ts, chú thích trước `buyerTaxCodeBasis`]</sub>; trên sân khấu chỉ cần nói số hiệu văn bản.
- Ví dụ thứ hai nếu được hỏi: hóa đơn laptop thuế suất 8% lập tháng 3/2025 thì sai, vì đợt giảm thuế khi đó loại hàng công nghệ thông tin; lập từ 01/7/2025 thì đúng, vì Nghị quyết 204/2025 và Nghị định 174/2025 cho nhóm này được giảm <sub>[lib/legalBasis.ts `VAT8_EXCLUDED_BEFORE_NQ204`, `vat8ExcludedPhrases`]</sub>.
- Từ 01/7/2026, văn bản về hóa đơn điện tử đổi sang Nghị định 254/2026/NĐ-CP và Thông tư 91/2026/TT-BTC; máy cũng chọn theo ngày. Chỉ nói số hiệu, không nói số điều ở nhiều nội dung chưa đối chiếu <sub>[lib/legalBasis.ts `invoiceFrameworkAt`]</sub>.
- Tài chính: "không để máy tự duyệt trong tài chính" được xử lý bằng chốt lô có bất kiêm nhiệm và hạn mức CFO (slide 7), cộng hậu kiểm ngẫu nhiên (slide 4) <sub>[services/batchService.ts; services/postAuditService.ts]</sub>.
- Tra cứu bên bán khi tải chứng từ: MST có thể được gửi tới dịch vụ tra cứu bên thứ ba (`api.vietqr.io`, không cần khóa; Xinvoice và doanhnghiep.vn nếu cấu hình khóa) và tên/MST tới công cụ tìm kiếm của nhà cung cấp AI, công cụ này chỉ nhận nguồn `*.gov.vn`. Vì vậy **không nói** "XML hoàn toàn không qua AI" hay "chỉ tra trên .gov.vn" <sub>[services/taxLookupService.ts `lookupByTaxCode`; services/supplierIdentityResolver.ts; services/officialSupplierLookupService.ts; docs/handoff/BAN-GIAO-DEMO-DAY-17-10.md mục 5]</sub>. Nếu bật `QGEN_AI=1` (tắt mặc định), dữ liệu hóa đơn được gửi AI để diễn đạt câu hỏi <sub>[app/privacy/page.tsx]</sub>.
- Danh sách 14 ô AI được trả về: số hóa đơn, ngày lập, mã số thuế, tên và địa chỉ người bán, mã số thuế và tên người mua, tên hàng, tổng tiền, tiền hàng, thuế suất, tiền thuế, hình thức thanh toán, ảnh có mờ không <sub>[services/geminiService.ts `VISION_ALLOWED_KEYS`]</sub>.
- Mã số thuế 12 số của cá nhân, hộ kinh doanh là dữ liệu gắn với một người cụ thể; trang `/privacy` ghi rõ việc này và ghi luôn "điều chúng tôi chưa làm" (chưa có hợp đồng xử lý dữ liệu, khóa ký nhật ký còn cùng máy chủ, chưa tự xóa theo hạn lưu trữ) <sub>[app/privacy/page.tsx]</sub>.

**Chốt ý:** Luật chọn theo ngày lập, dữ liệu đi đâu nói rõ, cái chưa làm cũng nói rõ.

---

## Slide 11 — Video demo (1 phút 24 giây)

**Thời lượng:** 15 giây giới thiệu + 1 phút 24 giây video + 15 giây kết · **Người nói:** Minh

**Hành động:** Chuyển lời: Khánh nói "Mời Minh giới thiệu video". Bấm vào khung video để phát. Nếu video nhúng không chạy trong 5 giây, mở file dự phòng `docs/submission/video/Tax-Referee-demo-1-phut.mp4`. Không mở bản live để thay thế nếu live chưa có tính năng lô. Sau video, nói câu kết (xem mục "Câu kết 15 giây").

**Lời nói (trước video):**

> Mời Ban giám khảo xem Tax Referee chạy trong khoảng một phút rưỡi: tải cả lô, xem phiếu giải trình, Kế toán trưởng trả lời một lần cho cả nhóm, chốt lô, màn hình Tổng quan, Lịch sử của tôi, rồi hóa đơn đến từ Gmail và Zalo ở chế độ mô phỏng.

**Ghi chú cho người nói (không đọc):**
- Video quay trên bản build ở máy của đội, dữ liệu tổng hợp, giọng đọc máy <sub>[scripts/demo/record_demo_voice.py]</sub>.
- Video dài khoảng 1 phút 24 giây. Câu về riêng tư trong video đã sửa thành "Hóa đơn điện tử do máy đọc, và AI không quyết định hóa đơn nào". Nếu giám khảo hỏi sâu, trả lời theo slide 10 (tên, mã số thuế người bán có thể được gửi tới dịch vụ tra cứu bên thứ ba và công cụ tìm kiếm giới hạn .gov.vn).

**Chốt ý:** Xem máy làm, người chốt, trong khoảng một phút rưỡi.

---

## Phân vai

**Phương án 2 người (khuyến nghị):**

| Người | Slide | Vai trên sân khấu |
|---|---|---|
| Minh | 1, 2, 3, 4, 6, 7, 8, 11 | Kể chuyện, giải thích bằng ví dụ đời thường, giới thiệu video, nói câu mở và câu kết |
| Khánh | 5, 9, 10 | Kiến trúc, trả lời Câu hỏi 2 và Câu hỏi 1, pháp lý; trả lời câu hỏi kỹ thuật sau phần trình bày |

**Phương án 3 người** (nếu đội có thêm một người lên nói; điền đúng tên thật):

| Người | Slide |
|---|---|
| Minh | 1, 2, 3, 4, 11 |
| Khánh | 5, 9 (hai câu hỏi của Ban tổ chức) |
| Người thứ ba | 6, 7, 8, 10 (giải pháp và pháp lý) |

**Câu chuyển lời (mỗi câu dưới 3 giây):** "Phần kiến trúc, mời Khánh." · "Mời Minh vào ba phần giải pháp." · "Phần bảo mật và pháp lý, mời Khánh." · "Mời Minh giới thiệu video."

**Khi hỏi đáp:** câu hỏi về nghiệp vụ, quy trình kế toán, demo → Minh. Câu hỏi về kiến trúc, bảo mật, mở rộng, pháp lý → Khánh. Người không trả lời thì đứng yên, không chen.

## Câu mở đầu 15 giây

Dùng khi được yêu cầu giới thiệu nhanh, hoặc nói ngay sau lời chào ở slide 1 (thay câu giới thiệu sản phẩm) nếu muốn mở mạnh hơn.

> Mỗi hóa đơn mua vào có một phần tiền thuế được trừ lại, nếu hóa đơn đúng luật. Sai một điều kiện là mất tiền thật. Tax Referee kiểm từng tờ theo luật của đúng ngày lập, tự xử lý ca rõ ràng, và dừng đúng chỗ để hỏi đúng người.

## Câu kết 15 giây

> Tóm lại: máy kiểm nhanh theo luật, AI chỉ đọc, người giữ chữ ký. Mỗi quyết định có lý do, có nhật ký, và những gì chưa làm được chúng em đều nói thẳng. Cảm ơn Ban giám khảo, chúng em xin nghe câu hỏi và góp ý.

## Ba câu đội muốn hỏi lại giám khảo (xin góp ý, mở rộng)

1. **Về mức tự động:** "Theo anh chị, doanh nghiệp sẽ chấp nhận mức nào: máy đề xuất cả lô rồi người ký chốt như hiện nay, hay muốn người ký riêng từng hóa đơn trên một ngưỡng tiền nào đó? Nếu có ngưỡng, anh chị gợi ý dựa vào đâu?"
2. **Về đường lên production trên VNG Cloud:** "Trong lộ trình 30 ngày, anh chị khuyên đội làm trước phần nào: tách worker đọc file, hay SSO, MFA và PostgreSQL? Có dịch vụ nào của VNG phù hợp để đọc ảnh mà dữ liệu nằm trong nước không, vì đó là điều kiện để bỏ nhà cung cấp trung gian?"
3. **Về đo tác động thật:** "Đề bài yêu cầu báo tỉ lệ bỏ sót và tỉ lệ hỏi thừa trên tập độc lập, cùng thử nghiệm với ít nhất ba người làm thật. Anh chị có thể giới thiệu một phòng kế toán thử hai tuần không, và anh chị muốn thấy chỉ số nào nhất?" <sub>[scratch/challenge_brief.txt (đề bài, file cục bộ, không có trong git), Đề A, Yêu cầu nâng cao]</sub>

---

## Các con số được phép nói (đều có trong mã hoặc tài liệu repo)

| Nói | Nguồn |
|---|---|
| Ngưỡng tiền mặt 5 triệu (đã gồm thuế) từ 01/7/2025; 20 triệu trước đó | data/regulatoryRegistry.ts `getApplicableRegulations`; services/policyEngine.ts |
| Hạn mức Kế toán trưởng 200 triệu; từ mức này là việc của CFO | services/policyEngine.ts `kttApprovalLimit`; services/batchService.ts `signOffBlockers` |
| AI đọc ảnh chỉ trả 14 ô | services/geminiService.ts `VISION_ALLOWED_KEYS` |
| Đường quyết định gọi AI 0 lần | /api/health khối `ai`; docs/handoff/the-nhac-thuyet-trinh-17-10.md |
| 12 phép thử, chia 2/3/4/3 theo bốn trụ | services/securityProbeService.ts |
| 330 triệu sửa xuống 198 triệu vẫn chờ CFO | services/securityProbeService.ts phép thử L3 |
| 26 mã quy tắc, 13/10/3 theo ba kiểu dừng | lib/riskTaxonomy.ts `RULE_CATALOG` |
| 6 đợt giảm thuế 8% từ 2022 đến hết 2026 | lib/legalBasis.ts `VAT_REDUCTION_PERIODS` |
| Hậu kiểm 10%, gấp 3 khi trong khoảng 15% sát dưới ngưỡng | services/postAuditService.ts |
| Ngân sách AI 60/600 lần đọc ảnh mỗi giờ, 60/300 lần tra cứu mỗi giờ | lib/server/aiBudget.ts `AI_BUDGET_DEFAULTS` |
| Ca chờ quá 24 giờ được đánh dấu | lib/workflowPresentation.ts `caseDeadline` |
| Duyệt nhóm 2 đến 50 hóa đơn cùng câu hỏi; lý do từ 8 ký tự | services/batchService.ts `answerGroup`, `signOffBatch` |
| File qua kênh tối đa 15 MB | services/channels/channelService.ts `MAX_FILE_BYTES` |
| Mỗi thư tối đa 5 đính kèm; mỗi lượt tối đa 50 file, 10 file từ người gửi chưa xác thực | services/channels/channelService.ts `MAX_ATTACHMENTS_PER_MAIL`, `MAX_FILES_PER_PULL`, `MAX_UNVERIFIED_FILES_PER_PULL` |
| Bộ demo 25 file XML tổng hợp | data/demo-batch/README.md |

**Không nói:** số liệu buổi thử người dùng; "tuân thủ" OWASP/NIST/ISO; "parser đã sandbox"; "XML hoàn toàn không qua AI"; "tra cứu MST chỉ trên .gov.vn"; "ảnh gửi qua Zalo/Gmail được AI đọc tự động"; con số trên ảnh chụp màn hình như thể là kết quả đo <sub>[docs/handoff/BAN-GIAO-DEMO-DAY-17-10.md mục 5]</sub>.

---

## Cần sửa trên slide

> **Cập nhật 17/10 sau khi rà:** đã sửa trong mã và deck: A1 (sổ sách/xuất chứng từ không lấy hóa đơn trong lô chưa chốt, chỉ KTT/CFO được xuất; slide 1 và 7 đổi chữ cho khớp), A2 (chụp lại ảnh Hộp thư vào với Gmail/Zalo mô phỏng), A3, B4–B8 (đổi chữ theo gợi ý; sơ đồ ghi "Gmail: danh bạ + SPF/DKIM · Zalo: user id"), C1 (trang /privacy và lời đọc video bỏ câu tuyệt đối), C2 (kênh mô phỏng đã commit). Slide 10 đổi tiêu đề thành "Nội dung XML không gửi AI" và "Quyết định không cần AI". Còn lại: C3 (xác nhận số slide với Ban tổ chức), C4 (không bắt buộc). Danh sách gốc giữ bên dưới để đối chiếu.

> **Cập nhật lần 2 (trước khi mở PR vào repo đội):** tải XML/CSV sổ cái (`GET /api/ledger/export`) trước đó chưa kiểm vai trò, nay chỉ Kế toán trưởng/CFO (quyền `ledger.export`); xem trước danh sách (`GET /api/ledger/sync`) vẫn mở cho người đã đăng nhập. Sổ ghi theo từng hóa đơn khi chốt (`batch_items.posted_at`); hóa đơn duyệt sau khi chốt phải "chốt bổ sung". Slide 10 sửa câu tra cứu MST: có dịch vụ tra cứu bên thứ ba, không chỉ .gov.vn. Gợi ý ở C1 bên dưới đã được thay bằng câu đúng.

Đối chiếu từng câu trên deck (`scripts/slides/build_deck.py`) và ảnh xem trước với mã trên nhánh `feat/batch-control-v2`. Kịch bản ở trên đã tránh nói sai các chỗ này.

### A. Phải sửa trước khi trình bày (slide đang lệch mã)

1. **Slide 1 "Người ký mới ghi sổ." và slide 7 "Người có thẩm quyền ký thì mới ghi sổ"** (cùng ghi chú slide 5 "Chốt lô cần người ký rồi mới ghi sổ"). Mã chỉ bảo đảm điều này **bên trong luồng Lô**: chốt lô ghi sự kiện `INVOICE_POSTED_BY_BATCH` <sub>[services/batchService.ts `signOffBatch`]</sub>. Nhưng màn Sổ sách gọi `/api/ledger/sync` xuất chứng từ cho **mọi** hóa đơn trạng thái `APPROVED`, kể cả hóa đơn máy tự duyệt đang nằm trong lô chưa chốt, và mọi người dùng đã đăng nhập (cả Kế toán viên) đều gọi được: route chỉ gọi `requireRequestUser`, không kiểm vai trò, không có mục nào trong `lib/capabilities.ts` <sub>[app/api/ledger/sync/route.ts]</sub>. Hóa đơn nhập lẻ ở màn Tiếp nhận cũng được máy đặt `APPROVED` và tạo chứng từ nội bộ trạng thái `READY_TO_POST` mà không qua chốt lô <sub>[services/workflowService.ts `syncVoucher`]</sub>. **Cách sửa:** hoặc sửa mã (chỉ xuất hóa đơn đã có `INVOICE_POSTED_BY_BATCH`, chỉ Kế toán trưởng/CFO được xuất), hoặc đổi chữ thành "Trong luồng lô: người ký chốt thì mới ghi sổ". Kịch bản hiện nói "người có thẩm quyền ký chốt" để không khẳng định quá mức.
2. **Slide 7, ảnh và chú thích không khớp.** Chú thích ghi "Màn hình Kênh: hóa đơn từ Gmail và Zalo, kèm người gửi đã nhận diện", nhưng ảnh `docs/submission/screens/channels.png` đang hiện thẻ Gmail và Zalo "Chưa cấu hình", bảng file "Chưa nhận file nào". **Cách sửa:** chụp lại trong phiên demo sau khi bấm "Lấy hóa đơn từ Gmail" và "Lấy hóa đơn từ Zalo" (thấy nhãn "Mô phỏng · dữ liệu mẫu", nhãn "Nghi mạo danh", tên người gửi đã nhận diện) <sub>[components/workspace/ChannelsView.tsx]</sub>, hoặc đổi chú thích cho đúng ảnh.
3. **Slide 8 "lô nào đã chốt, lô nào đang chờ, chờ ai, vì sao".** Tổng quan hiện **số lượng** lô đã chốt và chưa chốt, không liệt kê từng lô (danh sách từng lô nằm ở màn Lô hóa đơn) <sub>[services/dashboardService.ts trường `batches`; components/workspace/DashboardView.tsx thẻ "Lô hóa đơn"]</sub>. **Cách sửa:** "bao nhiêu lô đã chốt, bao nhiêu chưa, hóa đơn nào chờ ai, vì sao dừng".

### B. Nên sửa (dễ bị giám khảo vặn)

4. **Slide 8 "Lấy từ nhật ký chỉ ghi thêm, không ai sửa lén được."** Chỉ đúng với phần "việc tôi đã làm" (đọc `audit_events`). Phần "hóa đơn tôi đã gửi" đọc bảng hóa đơn, tức trạng thái hiện tại <sub>[services/historyService.ts `getMyHistory`]</sub>. Gợi ý: "Việc đã làm lấy từ nhật ký chỉ ghi thêm."
5. **Slide 6 "Bỏ hóa đơn trùng".** Thực tế: gửi lại cùng một file (cùng mã băm) trong cùng lô thì không tạo bản thứ hai; hóa đơn ở lô khác thì bị chặn; hóa đơn khác file nhưng trùng số thì máy **dừng hỏi** theo quy tắc trùng hóa đơn, không tự bỏ <sub>[services/batchService.ts `attachToBatch`; lib/riskTaxonomy.ts `RULE_DUPLICATE_INVOICE`]</sub>. Gợi ý: "Nhận ra hóa đơn trùng".
6. **Slide 5, sơ đồ "Nhận diện người gửi: danh bạ + SPF/DKIM" đặt chung cho cả ba kênh.** Tải lên không qua bước này (người tải là người đăng nhập); Zalo nhận diện bằng user id, không có SPF/DKIM; ảnh, PDF đến qua kênh chỉ được lưu và xếp hàng chờ (`QUEUED`), chưa tự đọc <sub>[services/staffDirectory.ts `identifySender`; services/channels/channelService.ts `ingestFile`]</sub>. Gợi ý ghi nhỏ: "Gmail: SPF/DKIM · Zalo: user id".
7. **Slide 4 "Cùng một hóa đơn, chạy lại bao lần cũng ra một kết quả."** Đúng khi cùng quy chế và cùng sổ sách trong ngày; quy tắc trùng hóa đơn và cụm tiền mặt cùng ngày phụ thuộc các hóa đơn khác đã có <sub>[docs/handoff/the-nhac-thuyet-trinh-17-10.md, câu dự phòng "Tất định nghĩa là gì?"]</sub>. Gợi ý: "Cùng dữ liệu, cùng quy chế thì ra cùng kết quả."
8. **Slide 2 "Hàng trăm hóa đơn", "Một người, vài ngày cuối tháng".** Đây là cảnh minh họa; repo không có số đo hay khảo sát cho các con số này. Gợi ý: đổi thành "Rất nhiều hóa đơn", hoặc giữ và nói rõ "thử hình dung" như kịch bản.

### C. Ngoài slide nhưng sẽ được chiếu hoặc nói

1. **Video và trang `/privacy` nói tuyệt đối hơn mức được phép.** Giọng đọc cuối video: "Hóa đơn điện tử không bao giờ đi qua AI" <sub>[scripts/demo/record_demo_voice.py `LINES['privacy']`]</sub>; câu mở trang `/privacy`: "Hóa đơn điện tử (XML) không bao giờ đi qua AI" <sub>[app/privacy/page.tsx]</sub>. Tài liệu bàn giao cấm nói "XML hoàn toàn không qua AI", vì tên, mã số thuế người bán có thể đi tra cứu qua công cụ tìm kiếm của nhà cung cấp AI <sub>[docs/handoff/BAN-GIAO-DEMO-DAY-17-10.md mục 5; services/officialSupplierLookupService.ts]</sub>. Slide 10 đã ghi đúng. Gợi ý cho video và trang: "Nội dung hóa đơn điện tử không gửi cho AI để đọc; riêng tên, mã số thuế người bán có thể được gửi tới dịch vụ tra cứu bên thứ ba và công cụ tìm kiếm giới hạn nguồn .gov.vn."
2. **Chế độ kênh mô phỏng chưa có trong lịch sử git.** Theo `git status` lúc bắt đầu phiên làm việc này, `services/channels/demoMock.ts` và `services/channels/demoMockData.ts` chưa được theo dõi (`??`); `channelService.ts`, `notifier.ts`, `ChannelsView.tsx` đang sửa dở. Slide 7 và video dựa vào chế độ này. Cần commit và mở PR trước khi nói tính năng "đã có"; và chỉ nói "có trên live" sau khi PR đã merge và `/api/health` xác nhận commit.
3. **Số slide và thể lệ.** `CLAUDE.md` ghi luật cứng "Thể lệ: đúng 5 slide", còn deck vòng cải tiến có 11 slide. Cần xác nhận với Ban tổ chức rằng vòng cải tiến cho phép nhiều hơn 5 slide. Nếu không, dùng bộ 5 slide và đưa phần còn lại vào phụ lục hoặc demo.
4. **Gợi ý thêm cho slide 10 (không bắt buộc).** Ô "Thuế" còn trống phía dưới. Có thể thêm hai dòng đều có trong mã: "Ngưỡng tiền mặt: 20 triệu → 5 triệu" và "Từ 01/7/2026: hóa đơn điện tử theo NĐ 254/2026, TT 91/2026" <sub>[data/regulatoryRegistry.ts; lib/legalBasis.ts `invoiceFrameworkAt`]</sub>.
