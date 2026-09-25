Mình đã rà toàn bộ **476 dòng** của file và đối chiếu với khung pháp luật đang có hiệu lực tại **22/09/2026**. Kết luận là:

> **Không nên dùng nguyên trạng file này làm “căn cứ pháp lý/chuẩn nghiệp vụ hiện hành”.**
> Phần khung nghiệp vụ và cách tổ chức quy trình khá sát thực tế doanh nghiệp, nhưng có một số lỗi **rất quan trọng** ở ngưỡng thanh toán, biểu mẫu VAT, PIT, hóa đơn điện tử, hệ thống pháp luật 2026 và đặc biệt là “Hệ số K”. Một số đoạn còn biến **quy tắc nội bộ** thành **quy định pháp luật**, hoặc diễn đạt quá tuyệt đối.

File hiện đang tự xác định mình dựa trên Luật QLT 38/2019, NĐ 126/2020, NĐ 123/2020, TT 80/2021, TT 219/2013, NĐ 72/2024...  Nhưng từ **01/07/2026** đã có một loạt văn bản mới thay thế/điều chỉnh các nền tảng này. ([Văn Bản Chính Phủ][1])

## 1. Những phần đang đúng về mặt nghiệp vụ

Các ý tưởng sau **vẫn phản ánh khá đúng cách một doanh nghiệp thực tế vận hành**:

| Nội dung                                                       | Đánh giá                      |
| -------------------------------------------------------------- | ----------------------------- |
| Thu thập hóa đơn → kiểm tra → hạch toán → kê khai → đối soát   | ✅ Đúng hướng                  |
| Phân biệt VAT, CIT, PIT                                        | ✅ Đúng                        |
| Có kiểm tra giao dịch thực tế, hợp đồng, giao nhận, thanh toán | ✅ Đúng về tư duy kiểm soát    |
| Đối chiếu ngân hàng, công nợ, tồn kho                          | ✅ Rất thực tế                 |
| Tạm nộp TNDN theo quý, không nộp tờ khai TNDN quý thông thường | ✅ Đúng về nguyên tắc          |
| Quyết toán cuối năm                                            | ✅ Đúng                        |
| RACI để phân quyền                                             | ✅ Hợp lý về quản trị          |
| Có cơ chế escalation cho hóa đơn bất thường                    | ✅ Rất phù hợp với hệ thống AI |

Ví dụ, phần file mô tả quy trình hằng ngày/hằng tháng/hằng quý và đối chiếu ngân hàng, công nợ, lương, khấu hao, kê khai thuế nhìn chung khá sát workflow thực tế. 

Tuy nhiên, **“sát thực tế” không đồng nghĩa với “đúng luật”**. Điểm này rất quan trọng đối với Tax Referee.

---

# 2. 🔴 Lỗi lớn nhất: ngưỡng 20 triệu đã lỗi thời

File lặp lại quy tắc:

> “Hóa đơn từ 20.000.000 VNĐ trở lên → bắt buộc thanh toán không dùng tiền mặt.”



Đây là **điểm phải sửa ngay**.

### Hiện tại:

Đối với điều kiện khấu trừ VAT, từ **01/07/2025**, ngưỡng thanh toán không dùng tiền mặt đã giảm xuống **5 triệu đồng**, tính theo giá trị hàng hóa/dịch vụ mua vào bao gồm VAT. ([Ministry of Finance][2])

Ngoài ra, đối với chi phí được trừ khi tính TNDN, NĐ 320/2025 cũng áp dụng ngưỡng **5 triệu đồng** cho giao dịch thuộc diện phải có chứng từ thanh toán không dùng tiền mặt. ([Văn Bản Chính Phủ][3])

Nghĩa là logic:

```text
>= 20.000.000 → non-cash
```

phải được thay bằng logic hiện hành, về cơ bản:

```text
>= 5.000.000 → kiểm tra điều kiện thanh toán không dùng tiền mặt
```

và phải xét thêm các trường hợp ngoại lệ/phương thức thanh toán được pháp luật chấp nhận, chứ không đơn giản là:

```text
UNC = hợp lệ
cash = không hợp lệ
```

Ví dụ, quy định hiện hành còn có các trường hợp thanh toán qua người được ủy quyền/nhân viên và hoàn ứng nếu đáp ứng điều kiện. Vì vậy đoạn:

> “Giám đốc dùng tài khoản cá nhân ... không được coi là...”

đang viết **quá tuyệt đối**. ([Thư Viện Pháp Luật][4])

### Với Tax Referee

Rule engine không nên hard-code:

```python
if invoice >= 20_000_000:
```

mà phải có:

```text
NON_CASH_THRESHOLD = 5,000,000
effective_from = 2025-07-01
```

và tốt hơn nữa là version hóa theo ngày hiệu lực.

---

# 3. 🔴 Phần VAT 01/GTGT đã có lỗi về chỉ tiêu

Đây là lỗi nghiệp vụ khá nghiêm trọng vì file còn nói các chỉ tiêu này là “cốt tử”. 

File ghi:

> [21] = thuế GTGT chưa được khấu trừ kỳ trước
> [22] = tổng số thuế GTGT chưa được khấu trừ kỳ trước

Trong biểu mẫu hiện hành từ **01/07/2026**, cách mô tả này **không còn đúng**. Thông tư 89/2026/TT-BTC đã thay đổi hệ thống biểu mẫu; chỉ tiêu **[21]** hiện dùng cho trường hợp **không phát sinh hoạt động mua, bán trong kỳ**, còn số thuế GTGT còn được khấu trừ kỳ trước nằm ở **[22]**. ([THƯ VIỆN PHÁP LUẬT][5])

Đây là loại lỗi mà mình xếp **Critical** nếu Tax Referee định tự sinh hoặc kiểm tra tờ khai.

### Một lỗi khác:

File nói:

> “[32a] dành riêng cho hàng hóa áp dụng thuế 8% theo NĐ 72/2024.”



Điều này cũng **không còn đúng** với form hiện hành. [32a] hiện không phải đơn giản là “hàng hóa 8%”. Biểu mẫu 2026 đã được thay đổi thêm các chỉ tiêu và cách phân loại. ([THƯ VIỆN PHÁP LUẬT][5])

**Tức là phần mô tả 01/GTGT trong tài liệu cần viết lại gần như toàn bộ.**

---

# 4. 🔴 Quy định VAT 8% trong file đã lỗi thời

File dựa vào:

* NĐ 72/2024
* NQ 142/2024



Nhưng tại **22/09/2026**, chính sách giảm VAT 2% đang được thực hiện theo **Nghị quyết 204/2025/QH15**, kéo dài đến **31/12/2026**, cùng các văn bản hướng dẫn hiện hành. ([Văn Bản Chính Phủ][6])

Đặc biệt, file ghi:

> “CNTT ... thuộc danh mục loại trừ (bắt buộc 10%)”



Cách viết này **không đúng nếu hiểu là toàn bộ lĩnh vực CNTT bị loại khỏi 8%**. Danh mục loại trừ hiện hành không đơn giản là “tất cả CNTT”; việc áp 8% phải xác định **đúng hàng hóa/dịch vụ theo danh mục pháp luật**, không thể classify chỉ bằng keyword “CNTT”. Bộ Tài chính cũng đã có hướng dẫn cho thấy một số dịch vụ liên quan CNTT không mặc nhiên bị loại khỏi 8%. ([Văn Bản Chính Phủ][6])

### Với AI system

Không nên:

```text
product_category = "IT"
→ VAT = 10%
```

Mà nên:

```text
Determine legal commodity/service classification
→ compare against current VAT exclusion list
→ determine applicable rate
```

Đây là điểm rất quan trọng.

---

# 5. 🔴 PIT trong file đang dùng số liệu cũ

File ghi:

> Giảm trừ bản thân 11 triệu/tháng
> Người phụ thuộc 4,4 triệu/tháng



Đây là số liệu **cũ**.

Từ 2026, luật PIT mới đã thay đổi mức giảm trừ; mức hiện hành là:

* **15,5 triệu đồng/tháng** cho bản thân
* **6,2 triệu đồng/tháng/người phụ thuộc**

và biểu thuế lũy tiến tiền lương cũng đã được điều chỉnh thành **5 bậc** với các mức 5%, 10%, 20%, 30%, 35%. 

File cũng ghi:

> Không HĐLĐ/<3 tháng → khấu trừ 10% từ 2 triệu.



Ngưỡng này cũng đã thay đổi; quy định mới sử dụng mốc **5 triệu đồng/lần chi trả** trong trường hợp khấu trừ tương ứng từ 01/07/2026. ([Ministry of Finance][7])

Đây là **Critical** đối với một hệ thống tính lương/thuế.

---

# 6. 🔴 Nghị định hóa đơn điện tử trong file đã hết tính “current”

File lấy:

> NĐ 123/2020 + TT 78/2021



Nhưng từ **01/07/2026**, hệ thống hiện hành đã chuyển sang:

* **NĐ 254/2026/NĐ-CP**
* **TT 91/2026/TT-BTC**

liên quan hóa đơn, chứng từ điện tử. ([Văn Bản Chính Phủ][8])

Vì vậy phần:

> kiểm tra hóa đơn theo Điều 10 NĐ 123
> xử lý hóa đơn điều chỉnh
> xác định hóa đơn bất hợp pháp
> quy trình thay thế/điều chỉnh

không nên tiếp tục viết như thể NĐ123 là văn bản gốc hiện hành.

File cần chuyển sang mô hình:

```text
Current tax law
   ↓
Current e-invoice decree
   ↓
Current circular
   ↓
Case-specific rule
```

thay vì hard-code văn bản cũ.

---

# 7. 🟠 “Hóa đơn sai MST = không có giá trị” đang quá tuyệt đối

File viết:

> “Nếu sai mã số thuế thì hóa đơn không có giá trị khấu trừ.”



Cách viết này quá mạnh.

Thực tế pháp luật hóa đơn phân biệt nhiều loại sai sót: sai MST, sai tên, sai địa chỉ, sai số tiền, sai thuế suất, sai nội dung... và **cách xử lý không giống nhau**. Việc xử lý có thể là thông báo sai sót, điều chỉnh, thay thế hoặc các cơ chế tương ứng tùy trường hợp.

Thậm chí dưới NĐ70/2025, trường hợp tên/địa chỉ người mua sai nhưng MST đúng đã có cơ chế xử lý mà không đơn giản là “hóa đơn vô giá trị”. ([THƯ VIỆN PHÁP LUẬT][9])

Do đó Tax Referee nên trả:

```text
ERROR_TYPE = WRONG_TAX_CODE
LEGAL_EFFECT = CASE_SPECIFIC
ACTION = ESCALATE
```

chứ không:

```text
WRONG_MST → INVALID = TRUE
```

---

# 8. 🔴 Phần “Hệ số K” là phần đáng lo nhất

File dành cả chương cho K và đưa ra:

```text
K = Sales / (Opening Inventory + Purchases)
```

sau đó quy định:

```text
1.05 – 1.25 = xanh
0.95 – 1.05 = vàng
<0.95 hoặc >1.35 = đỏ
```



Đây là chỗ **không nên đưa vào sản phẩm dưới dạng luật**.

Công văn 2392/TCT-QLRR có cơ chế sử dụng tham số K để kiểm soát rủi ro hóa đơn và cảnh báo trường hợp giá trị bán ra vượt ngưỡng liên quan đến nguồn hàng. Nhưng **K ở đây là một tham số quản lý rủi ro của cơ quan thuế**, không phải một “tỷ số pháp lý” cố định có các vùng xanh/vàng/đỏ phổ quát cho mọi doanh nghiệp. Các tài liệu phân tích công khai về CV2392 cũng không cho thấy cơ sở để biến nó thành bảng ngưỡng 0.95/1.05/1.25/1.35 cố định cho toàn bộ doanh nghiệp. ([Freshdesk][10])

Quan trọng hơn, từ **01/07/2026**, quản lý tuân thủ và quản lý rủi ro thuế hiện được điều chỉnh bởi **Thông tư 94/2026/TT-BTC**. ([Văn Bản Chính Phủ][11])

### Vì vậy nên đổi mô hình

Không nên:

```text
K < 0.95 = RED
K > 1.35 = RED
```

mà:

```text
Tax Authority Risk Indicator
    ↓
Risk signal
    ↓
Investigate / explain
```

Nếu muốn dùng tỷ số nội bộ:

```text
sales / (inventory + purchases)
```

thì gọi nó là **Internal Source-Coverage Ratio** hoặc tên tương tự, **không nên gọi là “Hệ số K pháp lý”**.

### Và đặc biệt phải bỏ đoạn này

File nói khi K xuống đỏ thì CFO có thể:

> “giãn tiến độ kê khai sang kỳ sau để giữ Hệ số K ở Vùng Xanh”



**Đoạn này nên xóa.**

Doanh nghiệp phải kê khai theo **kỳ tính thuế và thời hạn pháp luật**, không được biến việc trì hoãn kê khai hợp pháp thành công cụ tối ưu một chỉ số rủi ro nội bộ.

Tax Referee nên làm:

```text
K/risk abnormal
       ↓
FLAG
       ↓
collect evidence
       ↓
explain / escalate
```

chứ không:

```text
K abnormal
       ↓
delay legitimate declaration
```

---

# 9. 🟠 Cơ cấu CFO 4 tầng và ngưỡng 200 triệu không phải luật

File quy định:

> CFO/CEO phê duyệt ≥200 triệu
> KTT tự duyệt <200 triệu



và RACI cũng lấy mốc này. 

Cái này **có thể là quy trình nội bộ rất tốt**, nhưng không nên trình bày như:

> “phòng kế toán doanh nghiệp Việt Nam chuẩn mực thường có 4 tầng”

hay như một nghĩa vụ pháp lý.

Thực tế doanh nghiệp Việt Nam rất khác nhau:

```text
Công ty nhỏ:
CEO
 └── Kế toán tổng hợp / thuê dịch vụ

Công ty vừa:
CFO/KTT
 ├── kế toán tổng hợp
 ├── công nợ
 ├── kho
 └── thuế

Tập đoàn:
CFO
 └── Finance Director
     └── Chief Accountant
         └── nhiều team
```

Do đó phần này nên ghi rõ:

> **“Mô hình kiểm soát nội bộ đề xuất cho Tax Referee”**

chứ không phải:

> **“Cấu trúc bắt buộc/chuẩn của doanh nghiệp Việt Nam”.**

---

# 10. 🟠 “3H: Hợp pháp – hợp lệ – hợp lý” nên coi là framework nội bộ

Phần 3H:

> Hợp pháp – Hợp lệ – Hợp lý



là một **framework nghiệp vụ dễ hiểu và hữu ích**.

Nhưng đừng nói đây là một “test pháp lý chính thức” gồm đúng 3 điều kiện như vậy.

Ví dụ:

```text
3H
├── Legal
├── Formal compliance
└── Business substance
```

rất phù hợp cho AI.

Nhưng wording nên là:

> “Khung kiểm soát nội bộ 3H”

thay vì:

> “để được công nhận, hóa đơn bắt buộc phải thỏa mãn đồng thời 3H”.

---

# 11. 🟠 Bộ “Tax Defense Dossier 4 lớp” rất tốt nhưng không phải checklist bắt buộc của luật

File đưa:

1. Hóa đơn
2. Hợp đồng
3. Giao nhận
4. Dòng tiền



Về mặt **quản trị chứng cứ**, cách làm này rất thực tế.

Nhưng không nên mô tả là:

> “Bộ hồ sơ 4 lớp bắt buộc theo pháp luật”.

Ví dụ ảnh bốc dỡ hàng, bảng kê món ăn, phiếu xuất kho bên bán... không phải mọi giao dịch đều bắt buộc phải có đúng toàn bộ các tài liệu đó.

Nên đổi thành:

> **“Evidence package recommended for tax audit defense”**

---

# 12. 🔴 Chế độ kế toán cũng cần cập nhật

Từ **01/01/2026**, chế độ kế toán doanh nghiệp đã chuyển sang **Thông tư 99/2025/TT-BTC**, thay thế khung hướng dẫn cũ của TT200 trong phạm vi áp dụng tương ứng. ([Ministry of Finance][12])

Trong khi file vẫn thiết kế nhiều phần theo hệ thống cũ, ví dụ:

```text
TK 152/156/642/1331/331/112/1388
B01-DN
B02-DN
B03-DN
B09-DN
```

 

Không có nghĩa tất cả các số hiệu trên đều “sai”, nhưng **legal/accounting baseline của tài liệu đã không còn cập nhật theo framework 2026**.

---

# 13. TNDN: phần này tương đối ổn về logic, nhưng văn bản dẫn chiếu phải cập nhật

Phần:

> Không khai tạm tính TNDN từng quý
> Tạm nộp theo quý
> Tổng số đã tạm nộp phải đạt 80% số quyết toán



về nguyên tắc vẫn đúng.

Nhưng file đang lấy NĐ91/2022 + NĐ126/2020 làm nền. Hiện nay chế độ TNDN đã có **Luật Thuế TNDN 2025, NĐ320/2025**, cùng các sửa đổi 2026; giao dịch liên kết cũng đã chuyển sang **NĐ255/2026** từ 01/07/2026. ([Văn Bản Chính Phủ][3])

Đặc biệt dòng:

> “30% EBITDA đối với doanh nghiệp có giao dịch liên kết”



có thể giữ về **bản chất kiểm soát**, nhưng phải cập nhật căn cứ sang quy định giao dịch liên kết hiện hành.

---

# 14. Một số câu trong file quá “AI marketing”, không nên coi là nghiệp vụ pháp lý

Ví dụ:

> “Hóa đơn điện tử và tờ khai sai lệch sẽ bị phần mềm phát hiện ngay trong kỳ.”

> “Chặn đứng 100% nguy cơ...”

> “Bảo đảm tính tuân thủ tuyệt đối...”

> “Lá chắn pháp lý...”

 

Đối với một demo/hackathon thì wording này tạo cảm giác mạnh.

Nhưng nếu Tax Referee được đánh giá như **giải pháp nghiệp vụ thật**, nên đổi:

```text
100% → designed to reduce risk
tức thì → automated / near-real-time where data is available
chặn đứng → flag / prevent according to configured rules
bảo vệ pháp lý → hỗ trợ chuẩn bị hồ sơ giải trình
```

AI không thể đảm bảo “100% không bị truy thu”.

---

# 15. Bộ luật/văn bản nên dùng làm baseline cho hệ thống tại 22/09/2026

Mình sẽ thiết kế knowledge base của Tax Referee theo hierarchy này:

### General Tax Administration

**Luật Quản lý thuế 108/2025/QH15** — hiệu lực 01/07/2026. ([Văn Bản Chính Phủ][1])

### E-invoice

**NĐ 254/2026/NĐ-CP** + **TT 91/2026/TT-BTC** — hiệu lực từ 01/07/2026. ([Văn Bản Chính Phủ][8])

### Tax risk

**TT 94/2026/TT-BTC** về quản lý tuân thủ, quản lý rủi ro trong quản lý thuế. ([Văn Bản Chính Phủ][11])

### VAT

Luật VAT hiện hành và các luật sửa đổi 2025–2026; NĐ 181/2025 và các văn bản sửa đổi; **NQ 204/2025/QH15** cho chính sách 8% hiện hành đến hết 31/12/2026. ([Văn Bản Chính Phủ][6])

### CIT

Luật Thuế TNDN 2025 + **NĐ 320/2025/NĐ-CP** + văn bản sửa đổi 2026 + **TT 20/2026/TT-BTC**. ([Văn Bản Chính Phủ][3])

### PIT

Luật Thuế TNCN mới + **NĐ 253/2026/NĐ-CP** + **TT 87/2026/TT-BTC**. ([Ministry of Finance][7])

### Accounting

**TT 99/2025/TT-BTC**, áp dụng từ 01/01/2026. ([Ministry of Finance][12])

---

# 16. Tổng hợp các lỗi theo mức độ

| Mục                           | Mức độ      | Vấn đề                                           |
| ----------------------------- | ----------- | ------------------------------------------------ |
| Ngưỡng thanh toán 20 triệu    | 🔴 Critical | Phải cập nhật 5 triệu                            |
| VAT 01/GTGT                   | 🔴 Critical | Mô tả [21], [22], [32a] sai/cũ                   |
| PIT 11m/4,4m                  | 🔴 Critical | Hiện là 15,5m/6,2m                               |
| PIT 10% từ 2m                 | 🔴 Critical | Mốc hiện tại đã thay đổi                         |
| NĐ123/TT78                    | 🔴 Critical | Baseline hóa đơn đã chuyển sang NĐ254/TT91       |
| NĐ126/2020                    | 🔴 Critical | Luật QLT/framework quản lý thuế đã thay đổi 2026 |
| K-factor xanh/vàng/đỏ         | 🔴 Critical | Không nên coi là ngưỡng pháp lý cố định          |
| “Delay kê khai để giữ K xanh” | 🔴 Critical | Nên xóa                                          |
| CNTT mặc định 10%             | 🔴 Critical | Không thể classify blanket như vậy               |
| Sai MST = vô hiệu             | 🟠 High     | Diễn đạt quá tuyệt đối                           |
| 4 tầng CFO/KTT/KTV            | 🟠 Medium   | Internal control, không phải luật                |
| Tax Defense 4 lớp             | 🟠 Medium   | Best practice, không phải checklist bắt buộc     |
| 3H                            | 🟠 Medium   | Framework nội bộ, không phải test luật định      |
| 31/03 mọi trường hợp          | 🟡 Medium   | Chỉ đúng điển hình với năm dương lịch            |
| “100% bảo đảm”                | 🟡 Medium   | Quá mức so với khả năng hệ thống                 |

## Kết luận

**Về “business workflow”: khoảng khung của file là đúng và khá tốt.**

**Về “current legal accuracy 2026”: chưa đạt để làm tài liệu chuẩn.**

Đặc biệt, nếu đây là tài liệu nền cho **Tax Referee của MLAI Hackathon**, mình sẽ không sửa lặt vặt mà **tách tài liệu thành 3 lớp**:

```text
                    TAX REFEREE
                         │
        ┌────────────────┼────────────────┐
        ↓                ↓                ↓
   LAW / REGULATION   COMPANY SOP      AI RISK MODEL
   "Pháp luật"        "Quy trình"      "Risk signal"
        │                │                │
   bắt buộc            tùy DN          heuristic
        │                │                │
 Không được AI       Có thể config    Không được
 tự suy diễn         theo DN          gọi là luật
```

Đây sẽ làm hệ thống **thực tế doanh nghiệp hơn rất nhiều**, đồng thời tránh việc AI trả lời một heuristic như thể đó là quy định pháp luật.



Nếu dùng file này để **build knowledge base + rule engine cho Tax Referee**, các lỗi mình đánh dấu 🔴 ở trên nên được sửa trước khi xây logic AI; đặc biệt **20 triệu → 5 triệu, PIT 11/4.4 → 15.5/6.2, cập nhật NĐ254/TT91, cập nhật form 01/GTGT và loại bỏ “K xanh/đỏ + trì hoãn kê khai”**.

[1]: https://vanban.chinhphu.vn/?docid=216541&orggroupid=1&pageid=27160&utm_source=chatgpt.com "Luật số 108/2025/QH15 của Quốc hội: Luật Quản lý thuế"
[2]: https://nif.mof.gov.vn/hoidapcstc/home/cthoidap/160797?utm_source=chatgpt.com "Hỏi đáp CSTC"
[3]: https://vanban.chinhphu.vn/?docid=216219&pageid=27160&typegroupid=4&utm_source=chatgpt.com "Nghị định số 320/2025/NĐ-CP của Chính phủ: Quy định chi tiết một số điều và biện pháp để tổ chức, hướng dẫn thi hành Luật Thuế thu nhập doanh nghiệp"
[4]: https://cdn.thuvienphapluat.vn/uploads/Hoidapphapluat/2026/MDV/4300460005_776.pdf?utm_source=chatgpt.com "2

đồng trở lên. Chứng từ thanh toán không dùng ti"
[5]: https://thuvienphapluat.vn/ma-so-thue/phap-luat-thue/bang-so-sanh-toan-bo-chi-tieu-to-khai-01gtgt-tt892026-va-tt-802021-khac-gi-230017.html?utm_source=chatgpt.com "Bảng so sánh toàn bộ chỉ tiêu tờ khai 01/GTGT TT89/2026 và TT 80/2021 khác gì?"
[6]: https://vanban.chinhphu.vn/?classid=1&docid=214209&pageid=27160 "Nghị quyết số 204/2025/QH15 của Quốc hội: Về giảm thuế giá trị gia tăng"
[7]: https://isa.mof.gov.vn/hoidapcstc/home/cthoidap/164896?utm_source=chatgpt.com "Hỏi đáp CSTC"
[8]: https://vanban.chinhphu.vn/?docid=218689&pageid=27160&typegroupid=4&utm_source=chatgpt.com "Nghị định số 254/2026/NĐ-CP của Chính phủ: Quy định chi tiết một số điều và biện pháp để tổ chức, hướng dẫn thi hành Luật Quản lý thuế số 108/2025/QH15 về hóa đơn điện tử, chứng từ điện tử"
[9]: https://thuvienphapluat.vn/ma-so-thue/phap-luat-thue/hoa-don-sai-sot-nhu-the-nao-thi-khong-can-lap-hoa-don-moi-thay-the-813671-215507.html?utm_source=chatgpt.com "Hóa đơn sai sót như thế nào thì không cần lập hóa đơn mới thay thế?"
[10]: https://vbpl.attachments5.freshdesk.com/data/helpdesk/attachments/production/16107128585/original/2392_TCT_QLRR_2023_Vv_Kiem_tra_hoa_don_dien_tu.pdf?Expires=1776342128&Key-Pair-Id=APKAJ7JARUX3F6RQIXLA&Signature=HUspDIHoW9ojTUmCky7TosWq9tyjNTlnk3Q1aHLji912oUnJRDeUUaItwDRlLk~Am-xGKfBVg2GQvb3wtu-wE34Z5sR2h6cIa8USdwtHuxa1WZ8FAoh5zbpRyUIq7yc5gZE7fOrj6f4nLfuH83lybM1omB41vOPRfzsguZr8MpFD-EC5Zjsa3Pa~nrCvRTUn39JWgAGTo6z9eP0qc1U~Jdu2UEfh0rJYYClBIx5EcTSXzXFgzB2ja-J~ut7-RdTrbF1EV4HE~kHbNRjtoxXJ5EIKS-TngMzo~oHy99-B6xH8h~1bibtc0haX6BFAQf1~slGKmCFJnytaDmHkXhZc1Q__&response-content-disposition=attachment&response-content-type=application%2Fpdf&utm_source=chatgpt.com "Văn bản pháp luật - TS24corp"
[11]: https://vanban.chinhphu.vn/?classid=1&docid=218894&pageid=27160&utm_source=chatgpt.com "Thông tư số 94/2026/TT-BTC của Bộ Tài chính: Quy định về quản lý tuân thủ, quản lý rủi ro trong quản lý thuế"
[12]: https://www.mof.gov.vn/tin-tuc-tai-chinh/tin-chinh-sach-tai-chinh/quy-dinh-moi-ve-che-do-ke-toan-doanh-nghiep?utm_source=chatgpt.com "Cổng thông tin điện tử Bộ Tài Chính"
