# ĐÁNH GIÁ THỰC TẾ HỆ THỐNG TAX REFEREE: MỤC TIÊU VS THỰC TẾ
> **Nguồn đánh giá:** Đối chiếu kỹ thuật từ Cursor IDE & Kiểm chứng trực tiếp trên mã nguồn Production.  
> **Ngày lập:** 24/09/2026  
> **Vị trí tệp:** brainstorming/evaluation.md  
> **Trạng thái xác thực:** ĐÃ XÁC NHẬN - CHÍNH XÁC VÀ KHÁCH QUAN 100%

---

## I. XÁC NHẬN TỔNG QUAN

Các đánh giá từ Cursor là **hoàn toàn chính xác và phản ánh trung thực hiện trạng mã nguồn**:

1. **Về mục tiêu cuộc thi (Đề bài A - MLAI Hackathon 2026):** **ĐẠT XUẤT SẮC**  
   - Hệ thống hoàn thành trọn vẹn vai trò **Trọng tài Chuyển tiếp (Referee)**: Tự động phân luồng rủi ro thuế (ROUTINE / 3 Nhóm Rủi ro), Zero-Hallucination khi ngoại lệ (không tự bịa thuế khấu trừ), và sinh câu hỏi đóng A/B đúng thẩm quyền KTT hoặc CFO.
2. **Về vai trò trong phòng kế toán doanh nghiệp:** **ĐẠT MỘT PHẦN (Copilot / Lớp tiền kiểm tra)**  
   - Đóng vai trò là màng lọc rủi ro đầu vào trước khi ghi sổ, đọc chứng từ đa định dạng (XML, PDF, JPG) và ngăn chặn rủi ro thuế kịp thời.
3. **Về vai trò thay thế hệ thống ERP / Cổng thuế / Hồ sơ thanh tra thật:** **CHƯA ĐẠT (Và không nên định vị như vậy)**  
   - App **không thay thế** phần mềm kế toán (MISA, FAST, Bravo, SAP), không thay thế cổng thuế điện tử (eTax/HTKK), và không tự tạo ra bộ chứng từ thanh tra pháp lý có chữ ký số điện tử.

---

## II. ĐIỂM LỆCH LỚN NHẤT SO VỚI BROCHURE / THIẾT KẾ BAN ĐẦU

- **Brochure / Ý tưởng ban đầu nói:** Hóa đơn thường quy tự động ghi sổ cái dưới 15 ms (Straight-Through Processing hoàn toàn).
- **Thực tế trong code:** Sau khi evaluate, hệ thống gán nhãn `ROUTINE_PROPOSED` và đưa vào Inbox. Kế toán viên (KTV) vẫn phải nhấn nút xác nhận đơn lẻ (`/api/invoices/[id]/confirm`) hoặc xác nhận hàng loạt (Bulk Confirm - IMP-09). Giao diện UI ghi chú rõ: *Chưa tự ghi sổ kế toán*.
- **Ý nghĩa nghiệp vụ:** Đây là thiết kế cố ý theo nguyên tắc an toàn Con người kiểm soát (Human-in-the-Loop), giúp kế toán kiểm soát lần cuối trước khi nhập liệu, nhưng về mặt kỹ thuật không phải là STP tự động 100% vào sổ cái ERP.

---

## III. NHỮNG NĂNG LỰC APP ĐANG LÀM ĐƯỢC (BẰNG CHỨNG TRONG CODE)

| Năng lực | Mức độ | Bằng chứng kỹ thuật trong Code |
| :--- | :---: | :--- |
| **Phân 3 nhóm rủi ro + ROUTINE** | **ĐẠT** | `policyEngine.ts`: Phân loại chính xác `ROUTINE`, `UNCERTAIN_INFO` (Nhóm 1), `OUT_OF_POLICY` (Nhóm 2), `EXCEED_AUTHORITY` (Nhóm 3). |
| **Câu hỏi đóng A/B, đúng quyền KTT hoặc CFO** | **ĐẠT** | `EscalationCard.tsx` + `/api/resolutions`: Thẻ ngoại lệ chuyển đúng `requiredRole: CHIEF_ACCOUNTANT` hoặc `CFO` kèm 2 phương án đối ứng rõ ràng. |
| **Zero-Hallucination khi Escalate** | **ĐẠT** | Cấu trúc Zod Discriminated Union: Chỉ hóa đơn `ROUTINE` mới có `approvedTaxAmount`. Hóa đơn rủi ro tuyệt đối không cấp quyền khấu trừ thuế trước khi lãnh đạo duyệt. |
| **Rà soát quy chế thuế 2026** | **ĐẠT** | Bắt chuẩn ngưỡng tiền mặt từ 5.000.000 VNĐ (Luật 48/2024), ma trận thuế suất 8% vs 10% (NQ 204/2025), chi phí nhạy cảm rượu bia, HĐ trước/sau ngày đóng MST. |
| **Nạp đa định dạng (XML, PDF, Ảnh)** | **ĐẠT** | Parser XML thuần local (không phụ thuộc mạng); Parser PDF và Ảnh hóa đơn/bill bán lẻ qua Google Gemini Vision. |
| **Inbox điều phối, lọc & Bulk Confirm** | **ĐẠT** | `ProductionWorkspace.tsx`: Hộp thư chứng từ phân luồng, lọc theo trạng thái, hỗ trợ duyệt hàng loạt hóa đơn thường quy cho KTV. |
| **Phân quyền 3 vai trò (RBAC)** | **ĐẠT** | Hệ thống Auth session cookie 3 vai trò: Kế toán viên (`ke-toan@local`), Kế toán trưởng (`ktt@local`), Giám đốc Tài chính (`cfo@local`). |
| **Chuỗi bằng chứng Kiểm toán (Audit Hash)** | **ĐẠT** | `audit_events` trên SQLite liên kết chuỗi băm SHA-256 (`previous_hash` -> `event_hash`), bảo đảm tính toàn vẹn dữ liệu. |
| **Kiểm soát Hệ số rủi ro K (CV 2392)** | **DEMO** | Mô phỏng tính toán tham số K = Doanh thu / (Tồn kho + Mua vào) trên SQLite; phát hiện rơi vào Vùng Đỏ (< 0.95 hoặc > 1.35) khi có lô mua sắm đột biến. |

---

## IV. NHỮNG ĐIỂM CHƯA ĐẠT (KHOẢNG CÁCH GIỮA BROCHURE VÀ CODE)

| Lời hứa trên giấy | Thực tế triển khai trong Code | Hệ quả thực tế đối với Doanh nghiệp |
| :--- | :--- | :--- |
| **ROUTINE tự vào sổ < 15 ms** | Ghi nhận `ROUTINE_PROPOSED`; Kế toán viên phải bấm xác nhận. | Vẫn cần một thao tác duyệt của người dùng; nhanh hơn gõ tay thủ công nhưng chưa phải STP tự động vào sổ cái ERP. |
| **Tra cứu MST live trên cổng Thuế** | Đọc trường `sellerStatus` từ payload; nếu `UNKNOWN` thì đưa về Nhóm 1. Chưa gọi API live `tracuunnt.gdt.gov.vn`. | File XML thực tế thiếu trường MST đóng cửa sẽ bị xếp vào `UNCERTAIN_INFO` chờ kế toán tra cứu thủ công. |
| **Tờ khai 01/GTGT đầy đủ nộp cơ quan thuế** | Là bản nháp tổng hợp nội bộ; các chỉ tiêu phức tạp [22], [30], [36], [40], [43] đang để giá trị 0; gắn nhãn `submissionReady: false`. | Không thể nộp trực tiếp lên HTKK hoặc eTax; chỉ có giá trị ước tính và đối chiếu nội bộ. |
| **Hồ sơ phòng vệ thuế 4 lớp 1-Click** | Xuất snapshot định dạng JSON/HTML gồm: Dữ liệu HĐ, Phán quyết A/B, Hash file và Audit log; ghi chú rõ *Chưa tích hợp chữ ký số pháp lý*. | Không tự động liên kết hợp đồng kinh tế ký số, phiếu nhập kho ERP, hay file sổ phụ/UNC từ ngân hàng số. |
| **Webhook đồng bộ MISA / FAST / Bravo / SAP** | Chưa có webhook hoặc adapter API để đẩy bút toán sang phần mềm kế toán. | Kế toán sau khi duyệt trên Tax Referee vẫn phải xuất file hoặc nhập liệu sang phần mềm kế toán chính thức. |
| **Spot-check 2% & Cảnh báo Zalo/Email** | Chưa triển khai module background job chọn mẫu kiểm tra ngẫu nhiên 2% hay bot Zalo gửi thông báo nhà cung cấp. | Không duy trì được cơ chế phản xạ kho tức thì hay gửi công văn tự động sang nhà cung cấp qua kênh OTT. |
| **Hoàn tác (Undo) / Ghi đè (Override) trên Production** | Giao diện Audit log hiển thị lịch sử; tuy nhiên bảng `resolutions` một khi đã chọn A hoặc B thì cố định, chưa có nút bấm Rollback trên UI production. | Quyết định ngoại lệ mang tính chất một lần, chưa linh hoạt đảo ngược quyết định ngay trên màn hình chính. |

---

## V. LUỒNG NGHIỆP VỤ THỰC TẾ HÔM NAY

### 1. Những gì diễn ra bên trong Tax Referee
```text
[Nạp Hóa đơn (XML/PDF/Ảnh)]
       ↓
[Engine Thẩm định (Policy + Gemini AI)]
       ↓
[Hộp thư Phân luồng (Inbox)]
   ├── Hóa đơn Thường quy → Kế toán viên bấm Bulk Confirm
   └── Hóa đơn Rủi ro (Nhóm 1/2/3) → KTT hoặc CFO chọn phương án A/B
       ↓
[Ghi vết Audit Hash SHA-256 vào SQLite]
       ↓
[Cập nhật Hệ số K nội bộ & Xuất bản nháp Hồ sơ phòng vệ / Tờ khai 01]
```

### 2. Những gì Kế toán vẫn phải làm thủ công bên ngoài App
1. **Tra cứu tình trạng hoạt động doanh nghiệp:** Truy cập cổng thông tin của Tổng cục Thuế (`tracuunnt.gdt.gov.vn`) để kiểm tra MST có đang tạm ngừng hay bỏ trốn hay không.
2. **Đối chiếu chứng từ thanh toán:** Lấy sổ phụ, sao kê hoặc ủy nhiệm chi (UNC) từ Internet Banking để kẹp cùng hóa đơn trên 5 triệu đồng.
3. **Ghi sổ cái:** Nhập liệu hoặc import hóa đơn đã duyệt vào phần mềm kế toán (MISA, FAST, Bravo, v.v.).
4. **Kê khai thuế chính thức:** Tổng hợp tờ khai 01/GTGT chính thức trên phần mềm HTKK và nộp qua cổng thuế điện tử (thuedientu.gdt.gov.vn).
5. **Soạn thảo hồ sơ giải trình thanh tra:** Thu thập bản cứng hợp đồng kinh tế có chữ ký tươi hoặc chữ ký số, biên bản giao nhận, phiếu nhập kho thực tế khi có đoàn kiểm tra thuế.

---

## VI. ĐỊNH VỊ CHIẾN LƯỢC KHI THUYẾT TRÌNH BẢO VỆ CUỘC THI

- **Đề bài A yêu cầu:** Xây dựng một **Tác tử Trọng tài Chuyển tiếp (Referee / Gatekeeper)** – tự xử lý các ca hợp lệ thường quy, dừng lại và cảnh báo khi dữ liệu không chắc chắn, chuyển tiếp đúng người có thẩm quyền bằng các câu hỏi đóng A/B, và lưu vết kiểm toán không thể chối cãi.
- **Tax Referee đã giải quyết:** **Hoàn thành 100% mục tiêu cốt lõi của Đề bài A**.
- **Thông điệp đúng đắn:** 
  > *"Tax Referee là Hệ thống Trọng tài Tiền kiểm soát Thuế (Pre-Accounting Tax Referee & Risk Gatekeeper), hoạt động như một lớp lọc thông minh đứng trước phần mềm kế toán. Hệ thống không thay thế sổ cái MISA/FAST hay cổng nộp thuế của Tổng cục Thuế, mà trao quyền cho phòng kế toán phát hiện rủi ro và ra quyết định chỉ trong 3 giây."*

---

## VII. LỘ TRÌNH NÂNG CẤP ĐỀ XUẤT (THEO THỨ TỰ ƯU TIÊN)

1. **Ưu tiên 1 (Nối Tra cứu MST Live):** Tích hợp crawler hoặc dịch vụ API kiểm tra trạng thái MST người bán từ Cổng thông tin Tổng cục Thuế để loại bỏ hoàn toàn việc phân loại sai `UNCERTAIN_INFO` đối với các XML thiếu metadata.
2. **Ưu tiên 2 (Cải tiến Tờ khai 01/GTGT):** Bổ sung logic tính toán cho chỉ tiêu [25] (Tổng thuế GTGT đầu vào đủ điều kiện khấu trừ) liên kết trực tiếp từ tổng tiền thuế của các hóa đơn đã được duyệt hợp lệ.
3. **Ưu tiên 3 (Adapter xuất MISA/FAST):** Xây dựng tính năng xuất khẩu file Excel mẫu nhập liệu chuẩn của MISA SME hoặc API Webhook đẩy hóa đơn đã duyệt sang phần mềm kế toán.
4. **Ưu tiên 4 (Tích hợp Chữ ký số CA):** Hỗ trợ ký số điện tử (USB Token hoặc SmartCA) trực tiếp lên file snapshot Hồ sơ Phòng vệ Thuế 4 lớp (Dossier).
