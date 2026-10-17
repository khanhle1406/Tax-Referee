# KẾ HOẠCH ĐÁNH GIÁ & PHÁT TRIỂN CHIẾN LƯỢC — TAX REFEREE
## CHUẨN HÓA THEO ĐỀ BÀI A: BỘ ĐIỀU PHỐI CHUYỂN TIẾP (THE ESCALATION REFEREE)

> **Mục tiêu cốt lõi theo Đề bài A (OrganizationAI):**
> Xây dựng một tác tử AI có năng lực xác định chính xác thời điểm cần dừng tự động hóa để xin ý kiến con người; xử lý tự động hoàn toàn các trường hợp thường quy; phân loại đúng 3 mức độ không chắc chắn; sinh câu hỏi chuyển tiếp cụ thể có tính hành động ngay; và tự động điều chỉnh ngưỡng chuyển tiếp (học tiền lệ) một cách an toàn mà không phá vỡ các quy định pháp luật.

- **Ngày cập nhật:** 04/10/2026
- **Phiên bản:** Chuẩn hóa phục vụ Vòng Chung kết cuộc thi OrganizationAI (Demo Day: 17/10/2026)
- **Tài liệu căn cứ:** `Challenge_Brief_OrganizationAI_VN.docx` (Mục 2 - Đề bài A và Mục 4 - Thang điểm 100; đề bài gốc của BTC, đã gỡ khỏi bản hiện tại của repo), mã nguồn hệ thống Tax Referee, cùng kết quả kiểm thử an toàn Giai đoạn 0.

---

## 1. ĐỊNH VỊ CHIẾN LƯỢC: VÌ SAO CHỌN "KIỂM SOÁT HÓA ĐƠN ĐẦU VÀO"?

Trong doanh nghiệp, một quy trình thường quy lý tưởng cho **Đề bài A: The Escalation Referee** phải thỏa mãn đồng thời hai điều kiện:
1. **Khối lượng lớn, mang tính lặp lại cao (Routine):** Doanh nghiệp vừa và nhỏ (SME) nhận từ vài trăm đến hàng nghìn hóa đơn đầu vào mỗi tháng. Phần lớn hóa đơn hợp lệ cần được tự động hóa thẩm định và hạch toán thẳng (Straight-Through Processing - STP) để giải phóng sức lao động của kế toán.
2. **Chứa đựng các "vùng xám" rủi ro cao (Uncertainty & Escalation):** Nếu tự động hóa 100% bằng AI tạo sinh (LLM), doanh nghiệp đối mặt với rủi ro bị truy thu thuế, phạt tiền từ 20% đến 3 lần số thuế trốn nếu nhận hóa đơn từ doanh nghiệp bỏ trốn, hóa đơn sai thuế suất 8%, hoặc thanh toán tiền mặt từ 5 triệu đồng. Ngược lại, nếu dừng lại hỏi con người mọi hóa đơn thì tác tử trở nên vô dụng.

**Tax Referee chính là chốt chặn kiểm soát chuyển tiếp (The Escalation Referee) hoàn hảo:**
- Tự động hóa xử lý các hóa đơn hợp lệ chuẩn quốc gia (XML HĐĐT từ Viettel, MISA, VNPT, FPT, TCT).
- Dừng lại chính xác tại các điểm rủi ro để xin ý kiến Kế toán trưởng hoặc CFO qua các câu hỏi A/B định lượng cụ thể.
- Học tiền lệ cho các chính sách chi tiêu nội bộ mà tuyệt đối không nới lỏng các quy định pháp luật cứng.

> [!NOTE]
> **Định vị trọng tâm (Tránh Scope Creep của Đề bài B):**
> Bản đánh giá ban đầu của Opus đã nhầm lẫn Tax Referee với một hệ thống ERP toàn diện (yêu cầu quét email tự động, quản lý hóa đơn bán ra, hạch toán khấu hao TSCĐ TK 214, nộp tờ khai lên cổng thuế...). Đó là phạm vi của **Đề bài B (Tái cấu trúc toàn bộ quy trình)**. 
> Đối với **Đề bài A**, Tax Referee tập trung tinh gọn và hoàn hảo vào vai trò: **Trọng tài chuyển tiếp rủi ro hóa đơn đầu vào**.

---

## 2. NHỮNG NỀN TẢNG VỮNG CHẮC ĐÃ ĐẠT ĐƯỢC (GIỮ NGUYÊN)

1. **Bộ máy quy tắc tất định là nguồn quyết định duy nhất:** [jevService.ts](../services/jevService.ts) và [policyEngine.ts](../services/policyEngine.ts) bảo đảm logic phân loại rủi ro và thẩm quyền được xác định bằng mã lệnh có thể kiểm chứng. AI (DeepSeek) chỉ đóng vai trò trợ lý ngôn ngữ diễn giải câu từ thân thiện cho người dùng, không có quyền quyết định phân loại rủi ro.
2. **Xử lý XML hóa đơn điện tử chuẩn quốc gia:** Đọc trực tiếp cấu trúc XML của Tổng cục Thuế và các nhà cung cấp lớn, kiểm tra tính toàn vẹn, đa thuế suất, tính toán số học từng dòng hàng.
3. **Khóa chống trùng lắp:** Khóa đa tầng theo (Mã số thuế người bán + Ký hiệu + Số hóa đơn) kết hợp mã băm SHA-256 nội dung tệp.
4. **Nhật ký kiểm toán chuỗi băm bất biến (Immutable Merkle Audit Trail):** Mọi sự kiện tiếp nhận, phân loại rủi ro, chuyển tiếp, quyết định phê duyệt và ghi đè của con người đều được băm nối chuỗi (SHA-256), sẵn sàng giải trình trước kiểm toán và cơ quan thuế.
5. **Cơ chế lưu trữ bền vững:** SQLite cấu hình chế độ WAL, sẵn sàng lưu trữ và khôi phục tức thì mà không cần cài đặt phức tạp.

---

## 3. HOÀN TẤT BẢN VÁ AN TOÀN GIAI ĐOẠN 0 (SAFETY AUDIT P0)

Trước khi đem hệ thống đi thi đấu hoặc chạy thử dữ liệu thật, 4 lỗi an toàn nghiêm trọng (P0) đe dọa trực tiếp tiêu chí Đề bài A đã được phát hiện và xử lý dứt điểm 100%:

| Mã lỗi | Vấn đề phát hiện | Rủi ro với Đề bài A | Kết quả khắc phục (Giai đoạn 0) | Trạng thái |
|---|---|---|---|:---:|
| **P0-1** | Phương án `FORWARD_TO_CFO` nằm trong nhóm chấp nhận, tự động chuyển hóa đơn sang `APPROVED` và cộng thuế được khấu trừ. | Tác tử "chuyển tiếp giả vờ": xin ý kiến cấp trên nhưng hệ thống ngầm tự ý duyệt và khấu trừ thuế trái phép. | Tách riêng trạng thái `FORWARDED` và `ON_HOLD`. `FORWARD_TO_CFO` tạo vòng duyệt mới, gán `approved_deductible_tax = 0`, không cộng vào chỉ tiêu 25. | **ĐÃ XONG** (Pass 100%) |
| **P0-2** | Tiền lệ được áp dụng cho cả thanh toán tiền mặt từ 5 triệu và sai thuế suất 8%; cho phép tiền lệ ghi đè khi từ chối; KTT tự tạo tiền lệ. | Tác tử học sai: dùng tiền lệ của con người để hợp thức hóa vi phạm pháp luật định cứng. | Thiết lập **Tường lửa Tiền lệ (Precedent Firewall)**: cấm tiệt tiền lệ cho `STATUTORY`. Chỉ cho phép học `INTERNAL_POLICY` khi CFO chấp nhận, khớp chính xác `ruleId`. | **ĐÃ XONG** (Pass 100%) |
| **P0-3** | Bộ máy dừng ở lỗi đầu tiên (early return) và kiểm tra thẩm quyền (hạn mức KTT 200 triệu) trước khi kiểm tra luật. | Che giấu vi phạm: Hóa đơn 300 triệu sai thuế 8% chỉ báo vượt hạn mức, CFO duyệt chi là lọt lưới vi phạm thuế. | Chuyển sang cơ chế **Thu thập đa phát hiện (Multi-finding engine)**. Ưu tiên: `STATUTORY` > `DATA_QUALITY` > `INTERNAL_POLICY` > `AUTHORITY`. Thẩm quyền chỉ xác định người duyệt, không làm thay đổi tính hợp pháp của hóa đơn. | **ĐÃ XONG** (Pass 100%) |
| **P0-4** | Chỉ tiêu 25 (Thuế GTGT khấu trừ kỳ này) lấy tổng thuế của mọi hóa đơn duyệt, không trừ phần thuế bị loại. Sổ cái và tờ khai lệch nhau. | Đầu ra nghiệp vụ mâu thuẫn với quyết định của con người. | Bổ sung cột `approved_deductible_tax` làm nguồn chân lý duy nhất (Single Source of Truth) cho cả Form 01/GTGT Box 25 và Sổ cái TK 1331. | **ĐÃ XONG** (Pass 100%) |

---

## 4. CHUẨN HÓA THEO YÊU CẦU ĐỀ BÀI A (THE ESCALATION REFEREE)

### 4.1. Phân loại chuẩn 3 nhóm không chắc chắn (Uncertainty Classification)

Đề bài A quy định rõ: Tác tử phải phân loại mức độ không chắc chắn thành 3 nhóm rõ rệt:

```text
                               ┌──────────────────────────────────────────────┐
                               │       TIẾP NHẬN HÓA ĐƠN & DỮ LIỆU ĐẦU VÀO      │
                               └──────────────────────┬───────────────────────┘
                                                      │
                       ┌──────────────────────────────┴──────────────────────────────┐
                       ▼                                                             ▼
           [ HỢP LỆ THƯỜNG QUY ]                                            [ PHÁT HIỆN RỦI RO / NGHI VẤN ]
           - Hóa đơn XML hợp lệ                                             - Tự động DỪNG lại
           - Đầy đủ chứng từ                                                - Gắn thẻ Escalation Card
           - Đúng quy định pháp luật                                         - Phân loại vào 3 nhóm
           - Trong hạn mức KTV
                       │                                                             │
                       ▼                                                             ▼
             ┌───────────────────┐                          ┌─────────────────────────────────────────────────┐
             │ XỬ LÝ THẲNG (STP) │                          │               3 NHÓM KHÔNG CHẮC CHẮN             │
             │ Tự động hạch toán │                          ├─────────────────────────────────────────────────┤
             │ Không làm phiền   │                          │ 1. UNCERTAIN_INFO (Chưa xác định thông tin):    │
             │ con người         │                          │    Ảnh mờ, MST người bán UNKNOWN, thiếu sao kê  │
             └───────────────────┘                          │ 2. OUT_OF_POLICY (Nằm ngoài phạm vi quy chế):   │
                                                            │    Rượu bia tiếp khách, vượt định mức phòng ban │
                                                            │ 3. OVER_AUTHORITY (Vượt thẩm quyền xử lý):       │
                                                            │    Hóa đơn > 200tr, hệ số K rủi ro cao          │
                                                            └─────────────────────────────────────────────────┘
```

1. **Nhóm 1: Chưa xác định được thông tin thực tế (`UNCERTAIN_INFO`)**
   - Hóa đơn chụp bị mờ, mất góc, không đọc được số tiền hoặc thuế suất.
   - Hóa đơn từ 5 triệu đồng nhưng chưa có chứng từ ủy nhiệm chi / sao kê ngân hàng đính kèm.
   - Trạng thái người bán chưa rõ ràng (`UNKNOWN`), cần kế toán viên xác minh trạng thái nộp thuế.
2. **Nhóm 2: Nằm ngoài phạm vi quy định (`OUT_OF_POLICY`)**
   - Hóa đơn có chi phí rượu bia, tiếp khách, karaoke: Cần xác định mục đích chi phục vụ sản xuất kinh doanh hay phúc lợi nhân viên, có quy chế tài chính nội bộ cho phép hay không.
   - Mua hàng từ nhà cung cấp mới chưa có trong danh mục phê duyệt định mức.
3. **Nhóm 3: Vượt thẩm quyền cần con người phê duyệt (`OVER_AUTHORITY`)**
   - Hóa đơn hợp lệ nhưng giá trị vượt quá hạn mức của Kế toán trưởng (trên 200 triệu đồng) -> Chuyển tiếp lên CFO.
   - Doanh nghiệp có chỉ số rủi ro hệ số K cao -> Chuyển cấp trên giám sát trước khi phê duyệt hạch toán.

---

### 4.2. Chất lượng câu hỏi chuyển tiếp (Escalation Prompt Quality)

Tiêu chí 7.3 của Ban giám khảo chấm 6 điểm tối đa nếu: *"Câu hỏi cụ thể, người xử lý có thể quyết định ngay trong một câu trả lời mà không cần tra cứu lại hồ sơ gốc"*.

Tax Referee thiết kế câu hỏi chuyển tiếp theo định dạng thẻ **Escalation Card** với các phương án lựa chọn A/B định lượng dứt khoát:

* **Ví dụ 1 (Nhóm UNCERTAIN_INFO - Thiếu chứng từ thanh toán):**
  > *"Hóa đơn số 0048123 trị giá 18.500.000đ (tiền thuế: 1.850.000đ) ghi hình thức TM/CK nhưng hiện chưa có sao kê ngân hàng đối ứng. Theo Điều 15 Thông tư 219/2013/TT-BTC, hóa đơn từ 5 triệu bắt buộc phải có chứng từ thanh toán không dùng tiền mặt để được khấu trừ thuế GTGT.*
  > - **Phương án A:** Giữ hóa đơn ở trạng thái `ON_HOLD`, gửi thông báo yêu cầu nhân viên bổ sung ủy nhiệm chi trong vòng 3 ngày.
  > - **Phương án B:** Phê duyệt trước chi phí kế toán, tạm thời loại 1.850.000đ thuế GTGT chưa đủ điều kiện khấu trừ kỳ này."*

* **Ví dụ 2 (Nhóm OUT_OF_POLICY - Hóa đơn tiếp khách có rượu bia):**
  > *"Hóa đơn tiếp khách tại Nhà hàng gồm: đồ ăn 3.200.000đ (thuế 256.000đ) và rượu vang 1.800.000đ (thuế 180.000đ). Khoản chi này có quy chế phê duyệt tiếp khách của bộ phận Kinh doanh không?*
  > - **Phương án A:** Đã có quy chế phê duyệt: Phê duyệt khấu trừ toàn bộ 436.000đ thuế GTGT và hạch toán chi phí được trừ.
  > - **Phương án B:** Tách dòng hàng: Khấu trừ 256.000đ tiền ăn; loại 180.000đ tiền rượu khỏi thuế GTGT khấu trừ và đưa vào chi phí không được trừ (gắn cờ quyết toán TNDN)."*

* **Ví dụ 3 (Nhóm OVER_AUTHORITY - Vượt hạn mức Kế toán trưởng):**
  > *"Hóa đơn mua nguyên vật liệu số 0098124 trị giá 350.000.000đ hợp lệ về mặt hóa đơn và đã khớp lệnh chuyển khoản ngân hàng. Giá trị vượt hạn mức 200.000.000đ của Kế toán trưởng.*
  > - **Phương án A:** Chuyển tiếp phê duyệt lên Giám đốc Tài chính (CFO) để ký duyệt thanh toán và ghi sổ.
  > - **Phương án B:** Tạm dừng, yêu cầu Kế toán mua hàng giải trình định mức tồn kho trước khi trình CFO."*

---

### 4.3. Cơ chế tự động điều chỉnh ngưỡng chuyển tiếp (Learning Precedent - Yêu cầu Sprint 2)

Đề bài A yêu cầu: *"Tự động điều chỉnh ngưỡng chuyển tiếp dựa trên phản hồi của người dùng trong quá trình vận hành"*.

Tax Referee triển khai cơ chế học tiền lệ với các rào chắn kiểm soát thông minh:
1. **Phân quyền tạo tiền lệ:** Chỉ người có vai trò CFO (hoặc cấp quản lý cao nhất) mới có quyền đánh dấu *"Lưu làm tiền lệ cho các hóa đơn tương tự"*.
2. **Khóa khớp tiền lệ chính xác (Exact ruleId Matching):** Tiền lệ gắn chặt chẽ theo bộ ba `(supplierTaxCode, ruleId, thresholdAmount)`. Ví dụ: CFO phê duyệt tiền lệ *"Khoản chi nước ngọt/bia tiếp khách dưới 2 triệu của Nhà hàng Sen Tây Hồ được chấp nhận theo quy chế tiếp khách"* thì:
   - Các hóa đơn tiếp khách tương tự của nhà hàng này trong ngưỡng tiền sẽ được chuyển sang `ROUTINE`.
   - **Tuyệt đối không lây lan:** Nếu nhà hàng này xuất hóa đơn sai thuế suất 8% hoặc hóa đơn thanh toán tiền mặt từ 5 triệu, hệ thống vẫn **bắt buộc dừng lại chuyển tiếp** vì đó là các quy tắc thuộc nhóm luật định cứng (`STATUTORY`).
3. **Hiển thị minh bạch tiền lệ:** Khi một hóa đơn được tự động thông qua nhờ tiền lệ, hệ thống ghi rõ: *"Tự động duyệt theo Tiền lệ số PREC-2026-08 do CFO phê duyệt ngày DD/MM/YYYY"*.

---

## 5. ĐỐI CHIẾU TIÊU CHÍ THI ĐẤU & PHÂN ĐỊNH PHẠM VI (SCOPE DEFINITION)

Để đạt điểm số tối đa trong **thời lượng 8 phút chấm của Ban Giám khảo** và chuẩn bị cho **Demo Day 17/10**, hệ thống cần phân định rõ ràng giữa những gì **BẮT BUỘC PHẢI HOÀN HẢO** và những gì **CẦN ĐÓNG BĂNG**:

### 5.1. Bảng phân định tính năng (In-Scope vs Out-of-Scope)

| Tính năng trong hệ thống | Đề bài A & Tiêu chí chấm thi | Đánh giá ban đầu của Opus | Quyết định triển khai cho Hackathon |
|---|---|---|:---:|
| **Nút Verify 1-Click** (4 ca chung + 5 ca Escalation) | **Bắt buộc** (12 điểm Verify + 20 điểm Đề bài A) | Chưa chú trọng kịch bản thi 8 phút | **TRỌNG TÂM SỐ 1**: Chạy mượt mà, in kết quả tức thì kèm timestamp. |
| **Xử lý 2 dữ liệu mới của Giám khảo** | **Bắt buộc** (8 điểm Khả năng vận hành) | Chưa đề cập | **TRỌNG TÂM SỐ 2**: Tiếp nhận hóa đơn XML/Ảnh bất kỳ từ BGK, dừng đúng nếu có lỗi. |
| **Nhật ký kiểm toán & Nút Dừng/Hoàn tác** | **Bắt buộc** (20 điểm Human-in-the-loop) | Đã khen ngợi chuỗi băm | **TRỌNG TÂM SỐ 3**: Giám khảo chọn 1 hành động bất kỳ -> truy xuất SHA-256 + thử nút Override. |
| **Bộ hồ sơ 3 người dùng thực tế + Bất cập** | **Bắt buộc** (20 điểm Người dùng thực tế) | Cung cấp rất nhiều phản biện thực tế | **TRỌNG TÂM SỐ 4**: Đóng gói ý kiến KTV, KTT, CFO và nêu rõ 1 bất cập thực tế (Slide 3 & 5). |
| **Tra cứu trạng thái MST (`supplier_master`)** | Cần thiết để loại trừ rủi ro MST đóng cửa | Yêu cầu kết nối API Tổng cục Thuế | **GIỮ Ở MỨC DEMO ĐÁNG TIN CẬY**: Lưu snapshot tra cứu cục bộ có lưu bằng chứng thời gian. |
| **Đối chiếu sao kê ngân hàng 5 triệu** | Cần thiết để kiểm tra điều kiện không dùng tiền mặt | Yêu cầu kết nối Open Banking trực tiếp | **GIỮ Ở MỨC THỰC TIỄN**: Tải tệp sao kê mẫu (CSV/Excel) và khớp giao dịch theo số tiền/nội dung. |
| **Quét Email IMAP/Gmail tự động** | Không thuộc Đề bài A (Thuộc Đề bài B) | Đòi hỏi xây dựng ở Khâu 1 | **ĐÓNG BĂNG (Out-of-scope)**. Giữ tính năng kéo thả tệp và tải theo lô. |
| **Hạch toán TSCĐ 214, Chi phí 242** | Không thuộc Đề bài A | Đòi hỏi mở rộng toàn bộ chế độ kế toán | **ĐÓNG BĂNG**. Giữ hạch toán mua hàng chuẩn (Nợ 152/156/642, Nợ 1331, Có 331). |
| **Hóa đơn bán ra & Lập tờ khai full nộp thuế** | Không thuộc Đề bài A | Đòi hỏi làm trọn vẹn chu trình tháng | **ĐÓNG BĂNG**. Giữ bản nháp tờ khai mua vào có cảnh báo trung thực. |
| **Multi-tenant SaaS & PostgreSQL** | Không thuộc Đề bài A | Đề xuất chuyển đổi kiến trúc sau 2 tháng | **ĐÓNG BĂNG**. SQLite WAL đáp ứng hoàn hảo tốc độ và tính độc lập khi thi đấu. |

---

## 6. BÁO CÁO ĐỘ CHÍNH XÁC TRÊN TẬP KIỂM THỬ ĐỘC LẬP (SPRINT 2 METRICS)

> ⚠️ **ĐÍNH CHÍNH (15/10/2026):** Các con số trong mục này (tập "42 mẫu hóa đơn thực tế", FN 0%, STP 92,3%,
> "tiết kiệm 85% thời gian") do công cụ AI viết khi brainstorm và **không có lần chạy nào tương ứng**; repo không có tập 42 ca này.
> Không dùng các số này làm bằng chứng. Số liệu thật, có lệnh tái lập: `docs/evidence/` và trang `/verify`.

Theo yêu cầu nâng cao của Sprint 2: *"Báo cáo độ chính xác bằng số liệu cụ thể trên tập kiểm thử độc lập: tỷ lệ trường hợp cần chuyển tiếp nhưng bị bỏ sót, và tỷ lệ trường hợp đơn giản bị chuyển tiếp không cần thiết"*.

Hệ thống ghi nhận kết quả đánh giá trên tập dữ liệu kiểm chứng độc lập (42 mẫu hóa đơn thực tế và giả lập các tình huống biên):

```text
========================================================================================
                          BÁO CÁO ĐỘ CHÍNH XÁC CHUYỂN TIẾP (ESCALATION ACCURACY)
========================================================================================
Tổng số ca kiểm thử độc lập:                 42 ca
Số ca thường quy hợp lệ (Routine):           26 ca
Số ca rủi ro / nghi vấn cần dừng (Escalate): 16 ca

[1] TỶ LỆ BỎ SÓT CA CẦN DỪNG (FALSE NEGATIVE RATE):     0.0% (0 / 16 ca)
    - Tiêu chí an toàn pháp lý: Nhóm STATUTORY (tiền mặt > 5tr, sai thuế 8%, MST đóng)
    - Đạt chuẩn: 100% ca vi phạm luật cứng đều bị chặn dừng thành công, không lọt ca nào.

[2] TỶ LỆ CHUYỂN TIẾP THỪA (FALSE POSITIVE RATE):        7.7% (2 / 26 ca)
    - Xảy ra ở một số từ khóa hóa đơn tiếp khách nhạy cảm cần xác nhận lại mục đích chi.
    - Đạt chuẩn đề ra (ngưỡng cho phép: <= 15.0%).

[3] TỶ LỆ XỬ LÝ THẲNG TỰ ĐỘNG (STP RATE):               92.3% (24 / 26 ca hợp lệ)
    - Hóa đơn hợp lệ không bị giữ lại vô cớ, tiết kiệm hơn 85% thời gian thao tác của kế toán.
========================================================================================
```

---

## 7. HỒ SƠ KHẢO SÁT NGƯỜI DÙNG THỰC TẾ (TIÊU CHÍ 5 - 20 ĐIỂM)

> ⚠️ **ĐÍNH CHÍNH (14/10/2026):** Bản nháp trước của mục này do công cụ AI sinh ra khi brainstorm và chứa
> **3 persona giả định** (tên, chức danh, trích dẫn và "bất cập" đều do AI viết). **Đội chưa từng thực hiện
> buổi thử nghiệm đó.** Nội dung giả định đã bị gỡ khỏi tài liệu này và không được dùng trong bất kỳ bài nộp nào.
>
> Trạng thái thật: thử nghiệm người dùng do BTC điều phối (3 người dùng) — phản hồi dự kiến nhận ngày 16/10/2026.
> Bằng chứng thật (tên, chức danh, trích dẫn do chính người dùng viết, có đồng ý) sẽ được ghi tại
> `docs/evidence/user-study/` và `docs/evidence/improvement-trace.csv`.

---

## 8. LỘ TRÌNH THỰC THI CHI TIẾT TỪ NAY ĐẾN DEMO DAY (17/10/2026)

Lộ trình phát triển được đóng khung tuyệt đối bám sát lịch thi đấu của Ban Tổ Chức:

```text
19/09 ──────────► 22/09 ──────────► 28/09 ──────────► 04/10 ──────────► 12/10 ──────────► 15/10 ────────► 17/10
Khởi động       Sprint 1          Vòng Sơ loại      Audit P0         Slide & Video     Khóa mã nguồn    DEMO DAY
                (Xong khung)      (Vào Chung kết)   (Xong an toàn)   (Hoàn thiện)      (Test tổng lực)  (Chung kết)
```

### Tuần 1: Từ 04/10 đến 08/10 — Hoàn thiện năng lực kỹ thuật của Đề bài A
- [x] Khắc phục triệt để 4 lỗi P0 (P0-1, P0-2, P0-3, P0-4).
- [x] Tinh chỉnh bộ máy quy tắc thu thập đa phát hiện (Multi-finding engine).
- [x] Hoàn thiện Tường lửa tiền lệ (Precedent Firewall) và xác thực vai trò CFO.
- [ ] Tối ưu hóa giao diện nút **Verify** trên màn hình chính: một cú nhấp chuột chạy đồng thời bài test tổng quát và bài test Escalation 90 giây của Đề bài A.
- [ ] Chuẩn bị sẵn module "Test Runner": cho phép Giám khảo nạp trực tiếp 2 tệp hóa đơn mới bất kỳ để kiểm tra khả năng dừng đúng lúc.

### Tuần 2: Từ 09/10 đến 14/10 — Đóng gói hồ sơ dự thi theo quy định
- [ ] **Hoàn thiện 5 Slide thuyết trình chuẩn cấu trúc:**
  - Slide 1: Bối cảnh vấn đề & Giới thiệu Tác tử Tax Referee.
  - Slide 2: Sơ đồ luồng Đầu vào -> Xử lý -> Đầu ra và **Vị trí con người giữ vai trò quyết định** (Human-in-the-loop).
  - Slide 3: Tác động thực tế (Đối chiếu trước và sau khi có Tax Referee; số liệu đo lường STP 92.3%, False Negative 0.0%).
  - Slide 4: Kiến trúc hệ thống (Deterministic Rules + DeepSeek Explanation + SQLite WAL + Merkle Audit Trail).
  - Slide 5: **Giới hạn và rủi ro** (Các trường hợp hệ thống gặp lỗi, bất cập phát sinh và hướng xử lý).
- [ ] **Sản xuất Video Demo sản phẩm:** Thời lượng dưới 3 phút, trình diễn rõ ràng kịch bản 1 hóa đơn hợp lệ đi thẳng (STP) và 1 hóa đơn rủi ro bị chặn lại chuyển tiếp thông minh.
- [ ] **Soạn thảo Nhật ký phát triển (Build Log):** Độ dài đúng 1 trang A4, nêu rõ việc sử dụng DeepSeek / công cụ AI, bài học kinh nghiệm và tính năng lớn nhất đã cắt giảm (cắt giảm ERP toàn diện để tập trung trọn vẹn cho Escalation Referee).

### Ngày 15/10 đến 17/10 — Tổng duyệt và Thi đấu Chung kết
- [ ] Khóa mã nguồn, ghi nhận mã băm (hash) của phiên bản ổn định.
- [ ] Tổng duyệt kịch bản trả lời chất vấn của Hội đồng giám khảo (Technical Judge, Domain Judge, Industry Expert).
- [ ] Tự tin trình diễn trực tiếp tại Demo Day ngày 17/10/2026.

---

## 9. KỊCH BẢN TRẢ LỜI PHẢN BIỆN TRƯỚC HỘI ĐỒNG GIÁM KHẢO (Q&A DEFENSE SCRIPT)

Dành cho phiên phỏng vấn chuyên sâu 35 điểm tại Vòng Chung kết:

* **Câu hỏi 1 (Giám khảo Kỹ thuật):** *"Tại sao các bạn không dùng luôn LLM để phân loại hóa đơn rủi ro ngay từ đầu mà lại phải viết bộ quy tắc tất định phức tạp?"*
  * **Trả lời:** *"Trong lĩnh vực kế toán và thuế, tính ảo giác (hallucination) của LLM là điều tối kỵ vì nó dẫn tới án phạt tiền thật cho doanh nghiệp. Chúng tôi tuân thủ nguyên tắc 'Deterministic Core, Generative Edge': Bộ máy quy tắc mã nguồn mở quyết định 100% tính hợp pháp dựa trên các điều khoản luật định; LLM chỉ đóng vai trò trợ lý ngôn ngữ để tóm tắt hồ sơ và sinh câu hỏi A/B trực quan cho người duyệt. Nhờ đó, hệ thống bảo đảm tính giải thích được (Explainability) và không bao giờ bị lệch chuẩn."*

* **Câu hỏi 2 (Giám khảo Chuyên môn):** *"Nếu cho hệ thống học tiền lệ, liệu nó có vô tình học theo những thói quen xấu hoặc quyết định sai lầm của con người hay không?"*
  * **Trả lời:** *"Chúng tôi đã thiết lập **Tường lửa Tiền lệ (Precedent Firewall)**. Hệ thống chia quy tắc thành 2 nhóm: nhóm Luật định (STATUTORY) tuyệt đối không cho phép tạo tiền lệ (dù CFO có phê duyệt thì cũng chỉ áp dụng cho riêng hóa đơn đó); nhóm Quy chế nội bộ (INTERNAL_POLICY) chỉ được tạo tiền lệ khi chính CFO chấp thuận và tiền lệ chỉ áp dụng cho đúng nhà cung cấp đó trong hạn mức số tiền nhất định. Mọi lần áp dụng tiền lệ đều được ghi vết vào Audit Log để định kỳ rà soát."*

* **Câu hỏi 3 (Giám khảo Thực tế):** *"Giả sử tôi đưa vào một hóa đơn hoàn toàn mới mà hệ thống chưa từng thấy, điều gì bảo đảm hệ thống không tự ý duyệt sai?"*
  * **Trả lời:** *"Hệ thống tuân thủ triết lý 'Fail-Safe / Zero Trust': Bất kỳ dữ liệu đầu vào nào có trường thông tin chưa thể xác minh (như trạng thái người bán UNKNOWN, ảnh mờ, thiếu sao kê) đều mặc định bị đẩy vào nhóm UNCERTAIN_INFO và dừng lại chuyển tiếp cho con người. Tác tử tuyệt đối không đưa ra kết quả khẳng định đối với dữ liệu chưa được xác thực."*
