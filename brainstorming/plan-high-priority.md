# KẾ HOẠCH TRIỂN KHAI CÁC CẢI THIỆN MỨC ĐỘ ƯU TIÊN CAO (HIGH PRIORITY)
> **Tài liệu Kế hoạch Kỹ thuật & Nghiệp vụ Chi tiết (Detailed Technical Specification)**  
> **Dự án:** Tax Referee — Trọng tài Thuế Tiền Hạch toán & Điều phối Chuyển tiếp  
> **Căn cứ kế hoạch tổng thể:** [improvements.md](file:///Users/xuannguyen/Desktop/Competitions/2026/MLAI%20-%20Track%202/Tax%20Referee/brainstorming/improvements.md) (Nhóm III: High Priority)  
> **Phạm vi triển khai:** 3 Hạng mục cốt lõi tăng tốc độ xử lý và mở rộng độ sâu nghiệp vụ:
> 1. **IMP-08:** Xác thực Chi tiết đến Từng Dòng Hàng & Đa Thuế suất (Line-item Level Validation)
> 2. **IMP-09:** Xử lý Hàng loạt Ca Thường quy 1-Click (Bulk Confirm Routine Action)
> 3. **IMP-10:** Bộ lọc Chuyên sâu & Tìm kiếm Đa tiêu chí trong Inbox (Advanced Multi-criteria Filter & Search)

---

## MỤC LỤC
1. [TỔNG QUAN & BỐI CẢNH NGHIỆP VỤ](#1-tổng-quan--bối-cảnh-nghiệp-vụ)
2. [HẠNG MỤC 1: XÁC THỰC CHI TIẾT TỪNG DÒNG HÀNG & ĐA THUẾ SUẤT (IMP-08)](#2-hạng-mục-1-xác-thực-chi-tiết-từng-dòng-hàng--đa-thuế-suất-imp-08)
   - 2.1 Bài toán thực tế & Rủi ro pháp lý
   - 2.2 Thiết kế Cấu trúc Dữ liệu (Schema Line-item)
   - 2.3 Quy tắc Đối soát Dòng hàng (Rule Engine)
   - 2.4 Tích hợp Bóc tách Dòng hàng từ XML & Gemini OCR
   - 2.5 Giao diện Hiển thị Dòng hàng (UI/UX)
3. [HẠNG MỤC 2: XỬ LÝ HÀNG LOẠT CA THƯỜNG QUY 1-CLICK (IMP-09)](#3-hạng-mục-2-xử-lý-hàng-loạt-ca-thường-quy-1-click-imp-09)
   - 3.1 Nỗi đau thao tác của Kế toán viên
   - 3.2 Cơ chế Guardrail: Điều kiện an toàn cho Bulk Action
   - 3.3 Thiết kế API Endpoint Batch Processing
   - 3.4 Giao diện Thanh Thao tác Nổi (Floating Bulk Action Bar)
   - 3.5 Lưu vết Kiểm toán Hàng loạt (Batch Audit Logging)
4. [HẠNG MỤC 3: BỘ LỌC CHUYÊN SÂU & TÌM KIẾM ĐA TIÊU CHÍ (IMP-10)](#4-hạng-mục-3-bộ-lọc-chuyên-sâu--tìm-kiếm-đa-tiêu-chí-imp-10)
   - 4.1 Yêu cầu tìm kiếm và truy vết tức thời
   - 4.2 Thiết kế Bộ lọc Đa chiều (Faceted Search Engine)
   - 4.3 Component Thanh Công cụ Lọc `InboxFilterToolbar`
   - 4.4 Tối ưu hóa Hiệu năng Tìm kiếm Realtime
5. [MA TRẬN CA KIỂM THỬ NGHIỆM THU (TEST SUITE)](#5-ma-trận-ca-kiểm-thử-nghiệm-thu-test-suite)
6. [LỘ TRÌNH TRIỂN KHAI THEO TỪNG GIAI ĐOẠN (ROADMAP)](#6-lộ-trình-triển-khai-theo-từng-giai-đoạn-roadmap)

---

## 1. TỔNG QUAN & BỐI CẢNH NGHIỆP VỤ

Sau khi đã hoàn thiện các tính năng thuộc hàng **TỐI CAO (CRITICAL)** bao gồm:
- **IMP-11:** Trình xem chứng từ gốc song song (Side-by-Side Document Viewer).
- **IMP-12:** Bộ nhớ tiền lệ doanh nghiệp tự học (AI Feedback Loop / Precedent Memory).
- **IMP-13:** Bộ lọc chống trùng lặp hóa đơn & gian lận kê khai (Duplicate Invoice Check).

Hệ thống Tax Referee cần bước vào giai đoạn nâng cấp nhóm **ƯU TIÊN CAO (HIGH PRIORITY)** nhằm:
- **Độ sâu kiểm toán:** Không chỉ dừng lại ở số tổng trên đầu hóa đơn (Header-level) mà đi sâu vào từng dòng sản phẩm (Line-item level).
- **Năng suất vận hành:** Giải phóng kế toán viên khỏi thao tác lặp lại đơn điệu khi đối soát hàng chục hóa đơn an toàn mỗi ngày.
- **Khả năng kiểm soát dữ liệu lớn:** Cho phép tìm kiếm, lọc và phân nhóm chứng từ tức thời khi số lượng hồ sơ lên đến hàng nghìn bản ghi.

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│             KIẾN TRÚC TỔNG THỂ NHÓM TÍNH NĂNG ƯU TIÊN CAO (HIGH)            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  [INBOX QUEUE] ──> [BỘ LỌC ĐA TIÊU CHÍ (IMP-10)]                            │
│                         │                                                   │
│                         ├─ Lọc theo Nhóm Rủi ro (Routine / Group 1, 2, 3)   │
│                         ├─ Lọc theo Khoảng tiền (Dưới 5M / 5-20M / > 200M)  │
│                         ├─ Lọc theo Ngày lập & Nhà cung cấp                 │
│                         └─ Tìm kiếm tức thì theo Số HĐ / Tên mặt hàng       │
│                                                                             │
│  [PHÂN LUỒNG XỬ LÝ]                                                         │
│         │                                                                   │
│         ├─► [HỒ SƠ ROUTINE (AN TOÀN)] ──> [XỬ LÝ HÀNG LOẠT 1-CLICK (IMP-09)]│
│         │                                        │                          │
│         │                                        └─ Phê duyệt 50 ca/click   │
│         │                                           Lưu vết Audit Batch     │
│         │                                                                   │
│         └─► [HỒ SƠ CẦN THẨM ĐỊNH CHI TIẾT] ──> [ĐỐI SOÁT DÒNG HÀNG (IMP-08)]│
│                                                          │                  │
│                                                          ├─ Đa thuế suất    │
│                                                          ├─ Danh mục cấm 8% │
│                                                          └─ Hàng không HĐ   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. HẠNG MỤC 1: XÁC THỰC CHI TIẾT TỪNG DÒNG HÀNG & ĐA THUẾ SUẤT (IMP-08)

### 2.1 Bài toán thực tế & Rủi ro pháp lý
Trong thực tế doanh nghiệp tại Việt Nam:
1. **Hóa đơn đa thuế suất:** Một hóa đơn mua sắm siêu thị hoặc vật tư có thể bao gồm:
   - Dòng hàng nông sản tươi sống: Thuế suất **0%**.
   - Dòng hàng văn phòng phẩm, dịch vụ gia công: Thuế suất **8%** (theo Nghị quyết 204/2025/QH15).
   - Dòng hàng đồ uống có cồn, hóa chất tẩy rửa: Thuế suất **10%** (thuộc danh mục loại trừ không được giảm thuế).
   - *Rủi ro:* Nếu chỉ kiểm tra `taxRate` ở mức tổng hợp, hệ thống sẽ bỏ qua lỗi áp sai thuế suất ở từng mặt hàng con, dẫn đến bị cơ quan thuế truy thu 2% chênh lệch kèm tiền chậm nộp 0.03%/ngày.
2. **Hàng hóa dịch vụ không phục vụ sản xuất kinh doanh:**
   - Hóa đơn tiếp khách ăn uống có kèm hóa đơn thuốc lá, rượu mạnh trên 20 độ (thuộc diện thuế Tiêu thụ đặc biệt và bị khống chế điều kiện chi phí hợp lý theo Thông tư 96/2015/TT-BTC).
   - Hệ thống cần phát hiện dòng hàng nhạy cảm này ngay trên bảng kê chi tiết để bóc tách loại trừ chi phí.

### 2.2 Thiết kế Cấu trúc Dữ liệu (Schema Line-item)
Cập nhật `lib/schemas.ts`:

```typescript
export const InvoiceLineItemSchema = z.object({
  lineNumber: z.number().int().positive(),
  itemCode: z.string().optional(),
  itemName: z.string().min(1, 'Tên mặt hàng không được để trống'),
  unit: z.string().optional(),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  discountRate: z.number().min(0).max(100).optional(),
  discountAmount: z.number().nonnegative().optional(),
  amount: z.number().nonnegative(), // Thành tiền trước thuế
  taxRate: z.union([z.literal(0), z.literal(5), z.literal(8), z.literal(10)]),
  taxAmount: z.number().nonnegative(),
  totalAmount: z.number().nonnegative(),
  // Các cờ phân tích AI
  isVat8Applicable: z.boolean().default(true),
  isExcludedCategory: z.boolean().default(false),
  flaggedReason: z.string().optional()
});

export type InvoiceLineItem = z.infer<typeof InvoiceLineItemSchema>;
```

Tích hợp trường `items?: InvoiceLineItem[]` vào `InvoiceInputSchema`.

### 2.3 Quy tắc Đối soát Dòng hàng (Rule Engine)
Tại `services/policyEngine.ts`, bổ sung bước thẩm định chi tiết dòng hàng:
1. **Kiểm tra tính toán số học từng dòng:**
   - So sánh `amount` với `quantity * unitPrice - discountAmount`. Dung sai làm tròn tối đa 1.000 VNĐ.
   - So sánh `taxAmount` với `amount * (taxRate / 100)`.
2. **Kiểm tra danh mục loại trừ thuế suất 8%:**
   - Đối chiếu từ khóa `itemName` của từng dòng với `DEFAULT_POLICY_CONFIG.excludedVat8Categories` (Viễn thông, Tài chính, Bất động sản, Hóa chất, Rượu bia, Kim loại...).
   - Nếu `taxRate === 8` nhưng mặt hàng nằm trong danh mục cấm -> Cắm cờ rủi ro: `"Dòng số X: Mặt hàng [Tên] thuộc danh mục loại trừ nhưng đang áp thuế suất ưu đãi 8% thay vì 10%"`.
3. **Cộng dồn và đối chiếu Header vs Sum(Items):**
   - Tổng tiền trước thuế trên Header phải bằng tổng `amount` của các dòng.
   - Tổng thuế trên Header phải bằng tổng `taxAmount` của các dòng.

### 2.4 Tích hợp Bóc tách Dòng hàng từ XML & Gemini OCR
- **Đọc từ XML:** Các thẻ lặp `<Item>`, `<Product>`, `<HHDVu>` trong XML chuẩn Viettel, MISA, VNPT, FPT, TCT sẽ được bóc tách thành mảng đối tượng `InvoiceLineItem`.
- **Đọc từ OCR:** Prompt Gemini Vision được bổ sung yêu cầu:
  ```json
  "items": [
    {
      "lineNumber": 1,
      "itemName": "Tên món hàng",
      "quantity": 1,
      "unitPrice": 100000,
      "amount": 100000,
      "taxRate": 10,
      "taxAmount": 10000,
      "totalAmount": 110000
    }
  ]
  ```

### 2.5 Giao diện Hiển thị Dòng hàng (UI/UX)
- Tại `components/DocumentViewer.tsx` và modal chi tiết hóa đơn:
  - Bảng dòng hàng dạng lưới (Data Grid) thu nhỏ.
  - Cột thuế suất có gắn badge màu: `0%` (Xám), `5%` (Xanh lục), `8%` (Xanh cyan), `10%` (Tím).
  - Dòng nào bị cắm cờ cảnh báo sẽ được highlight viền đỏ kèm icon tam giác cảnh báo và tooltip giải thích điều khoản.

---

## 3. HẠNG MỤC 2: XỬ LÝ HÀNG LOẠT CA THƯỜNG QUY 1-CLICK (IMP-09)

### 3.1 Nỗi đau thao tác của Kế toán viên
- Khi hệ thống phân loại đúng 80% hóa đơn vào nhánh **ROUTINE (An toàn)**, kế toán viên hiện tại vẫn phải click vào từng ca và bấm nút *"Xác nhận đề xuất Routine"*.
- Nếu có 40 hóa đơn/ngày, kế toán phải thực hiện 80 cú click và mất hơn 15 phút chỉ cho các việc lặp đi lặp lại.
- Yêu cầu đặt ra: Cho phép duyệt hàng loạt tất cả các ca Routine chỉ bằng **1 cú click**, tiết kiệm 95% thời gian thao tác.

### 3.2 Cơ chế Guardrail: Điều kiện an toàn cho Bulk Action
Để đảm bảo tuyệt đối không có sai sót pháp lý khi duyệt hàng loạt:
- **Điều kiện 1 (Khóa an toàn):** Nút duyệt hàng loạt **CHỈ** áp dụng cho các hóa đơn có trạng thái thẩm định sơ bộ là `ROUTINE`.
- **Điều kiện 2 (Không có cờ ngoại lệ):** Hóa đơn không bị cảnh báo trùng lặp (`duplicateCheck === false`), MST người bán còn hiệu lực (`sellerStatus === 'ACTIVE'`).
- **Điều kiện 3 (Ngưỡng giá trị):** Từng hóa đơn phải có giá trị `< 200.000.000 VNĐ` (nằm trong hạn mức phê duyệt thường quy của KTT).
- Nếu người dùng chọn nhầm một ca `ESCALATED`, hệ thống sẽ tự động tách ca đó ra, hiển thị thông báo: *"Đã loại trừ 1 ca có rủi ro chuyển tiếp khỏi đợt xác nhận hàng loạt"*.

### 3.3 Thiết kế API Endpoint Batch Processing
Tạo endpoint `POST /api/inbox/bulk-confirm`:

```typescript
// Request Body
{
  invoiceIds: string[],
  confirmedBy: string, // "Trần Thị Mai (Kế toán trưởng)"
  note?: string
}

// Response Body
{
  success: boolean,
  confirmedCount: number,
  totalApprovedAmount: number,
  totalDeductibleTax: number,
  batchAuditHash: string,
  timestamp: string,
  skippedIds: Array<{ id: string; reason: string }>
}
```

### 3.4 Giao diện Thanh Thao tác Nổi (Floating Bulk Action Bar)
- Tại bảng danh sách hàng đợi `ProductionWorkspace.tsx`:
  - Thêm cột Checkbox ở đầu mỗi hàng.
  - Checkbox trên tiêu đề: Click để chọn toàn bộ ca Routine đang hiển thị trên trang.
  - Khi có ít nhất 1 ca được chọn, xuất hiện **Thanh công cụ nổi (Floating Action Bar)** ở đáy màn hình với hiệu ứng trượt mượt mà (Slide-up):
    ```text
    ┌────────────────────────────────────────────────────────────────────────┐
    │  ☑ Đã chọn 18 hồ sơ Routine an toàn (Tổng tiền: 142.500.000 VNĐ)        │
    │  [ Hủy chọn ]   [ ⚡ Xác nhận 1-Click toàn bộ 18 ca an toàn ]           │
    └────────────────────────────────────────────────────────────────────────┘
    ```
- Sau khi bấm, kích hoạt hiệu ứng pháo hoa nhẹ (`canvas-confetti`), hiển thị Toast thông báo: *"Đã chuyển 18 hóa đơn an toàn vào Sổ nhật ký hạch toán"*.

### 3.5 Lưu vết Kiểm toán Hàng loạt (Batch Audit Logging)
- Tạo một bản ghi kiểm toán tổng hợp (Batch Audit Trail Record) với mã băm SHA-256 kết hợp danh sách tất cả các ID hóa đơn trong đợt phê duyệt.
- Xuất được biên bản bàn giao kiểm toán hàng loạt phục vụ thanh tra thuế.

---

## 4. HẠNG MỤC 3: BỘ LỌC CHUYÊN SÂU & TÌM KIẾM ĐA TIÊU CHÍ (IMP-10)

### 4.1 Yêu cầu tìm kiếm và truy vết tức thời
Khi danh sách hóa đơn trong tháng vượt quá 50 - 100 chứng từ, người dùng cần công cụ để thu hẹp phạm vi kiểm tra:
- Tìm nhanh xem hóa đơn của một nhà cung cấp cụ thể đã về chưa.
- Lọc tất cả các hóa đơn thanh toán tiền mặt từ 5 triệu đến 20 triệu để chuẩn bị hồ sơ thanh toán qua ngân hàng trước khi chốt kỳ thuế.
- Lọc riêng các hóa đơn bị cắm cờ Nhóm 3 (Vượt thẩm quyền) để chuẩn bị cuộc họp báo cáo với CFO.

### 4.2 Thiết kế Bộ lọc Đa chiều (Faceted Search Engine)
Xây dựng interface cấu hình bộ lọc `InboxFilterState`:

```typescript
export interface InboxFilterState {
  searchTerm: string;          // Tìm kiếm trên Số HĐ, Tên NCC, MST, Mặt hàng
  riskGroup: 'ALL' | 'ROUTINE' | 'GROUP_1' | 'GROUP_2' | 'GROUP_3';
  dateRange: {
    startDate?: string;        // YYYY-MM-DD
    endDate?: string;          // YYYY-MM-DD
  };
  amountRange: {
    min?: number;
    max?: number;
  };
  sourceType: 'ALL' | 'XML' | 'PDF' | 'IMAGE';
  status: 'ALL' | 'PENDING' | 'ROUTINE_CONFIRMED' | 'ESCALATED' | 'REJECTED';
  hasWarningsOnly: boolean;    // Chỉ hiện các hóa đơn có cảnh báo
}
```

### 4.3 Component Thanh Công cụ Lọc `InboxFilterToolbar`
Tạo component [components/InboxFilterToolbar.tsx](file:///Users/xuannguyen/Desktop/Competitions/2026/MLAI%20-%20Track%202/Tax%20Referee/components/InboxFilterToolbar.tsx):
- **Hàng 1 (Quick Search & Presets):**
  - Ô tìm kiếm tức thì với icon kính lúp và phím tắt `Ctrl + K`.
  - Các nút preset lọc nhanh:
    - `[Tất cả]`
    - `[⚡ Routine (An toàn)]`
    - `[⚠️ Cần chuyển tiếp KTT/CFO]`
    - `[💵 Tiền mặt > 5M]`
    - `[🔍 Có nghi vấn trùng]`
- **Hàng 2 (Bộ lọc nâng cao có thể thu gọn/mở rộng):**
  - Dropdown chọn Nhà cung cấp.
  - Dropdown chọn Khoảng tiền (`Dưới 5 triệu`, `5 - 20 triệu`, `20 - 200 triệu`, `Trên 200 triệu`).
  - Chọn khoảng ngày (Từ ngày - Đến ngày).
  - Nút `[ Xóa toàn bộ bộ lọc ]` khi có bộ lọc đang kích hoạt.
  - Badge đếm số lượng: *"Hiển thị 14 / 52 chứng từ"*.

### 4.4 Tối ưu hóa Hiệu năng Tìm kiếm Realtime
- Sử dụng hàm lọc `useMemo` với thuật toán chuẩn hóa tiếng Việt không dấu (`removeAccents`) để người dùng gõ `viettel` vẫn tìm thấy `Tập đoàn Công nghiệp - Viễn thông Quân đội Viettel`.
- Tốc độ phản hồi tìm kiếm đạt `< 5ms` ngay trên client mà không cần gọi API liên tục.

---

## 5. MA TRẬN CA KIỂM THỬ NGHIỆM THU (TEST SUITE)

| Mã Test | Hạng mục | Tình Huống Kiểm Thử (Test Scenario) | Kết Quả Kỳ Vọng (Expected Outcome) |
| :---: | :---: | :--- | :--- |
| **TC-HIGH-01** | Line-item | Hóa đơn có 2 dòng: Giấy in (8%) và Rượu vang tiếp khách (10%) | Dòng giấy in được chấp nhận 8%; dòng rượu vang bị gắn cờ cảnh báo chi phí nhạy cảm và yêu cầu xác nhận quy chế tiếp khách. |
| **TC-HIGH-02** | Line-item | Dòng hàng cước viễn thông áp thuế suất 8% thay vì 10% | Hệ thống cắm cờ vi phạm Nghị quyết 204/2025/QH15 tại đúng dòng cước viễn thông, hiển thị rõ số tiền thuế thiếu. |
| **TC-HIGH-03** | Line-item | Tổng tiền các dòng hàng lệch 50.000 VNĐ so với số tổng trên đầu HĐ | Báo lỗi không khớp số học giữa Chi tiết và Tổng hợp (`Item Sum Mismatch`), đưa vào diện chuyển tiếp. |
| **TC-HIGH-04** | Bulk Action | Chọn 15 hóa đơn Routine và bấm `Xác nhận hàng loạt` | Cả 15 hóa đơn chuyển trạng thái `CONFIRMED`, xuất hiện Toast thành công, ghi 1 bản ghi Batch Audit Trail. |
| **TC-HIGH-05** | Bulk Action | Cố tình chọn 1 hóa đơn Routine + 1 hóa đơn Escalated rồi bấm Bulk | Hệ thống tự động tách ca Escalated ra, chỉ xác nhận ca Routine và hiển thị cảnh báo cho ca còn lại. |
| **TC-HIGH-06** | Filter | Gõ từ khóa `"vinh long"` không dấu vào ô tìm kiếm | Bảng danh sách ngay lập tức hiển thị hóa đơn của `HỘ KINH DOANH VĨNH LONG 999` trong `< 5ms`. |
| **TC-HIGH-07** | Filter | Lọc khoảng tiền từ 5.000.000 đến 20.000.000 và phương thức Tiền mặt | Hiển thị đúng các hóa đơn rơi vào vùng cảnh báo Luật 48/2024/QH15. |
| **TC-HIGH-08** | Filter | Bấm nút `Xóa bộ lọc` | Trả lại toàn bộ danh sách chứng từ đầy đủ ban đầu. |

---

---

## 7. KẾT QUẢ TRIỂN KHAI THỰC TẾ (COMPLETED 100%)

Toàn bộ 3 hạng mục đã được lập trình và nghiệm thu thực tế:
- **IMP-08 (Line-item Validation & Multi-VAT):**
  - Schema: [lib/schemas.ts](file:///Users/xuannguyen/Desktop/Competitions/2026/MLAI%20-%20Track%202/Tax%20Referee/lib/schemas.ts) bổ sung `InvoiceLineItemSchema`, `LineItemAnalysisSchema`, `items` trong `InvoiceInputSchema`.
  - Engine: [services/policyEngine.ts](file:///Users/xuannguyen/Desktop/Competitions/2026/MLAI%20-%20Track%202/Tax%20Referee/services/policyEngine.ts) với `validateLineItems()` kiểm toán số học dòng hàng, rà soát loại trừ 8% (NQ 204/2025/QH15), chi phí nhạy cảm, dung sai lệch vs Header.
  - Parser: [app/api/documents/parse/route.ts](file:///Users/xuannguyen/Desktop/Competitions/2026/MLAI%20-%20Track%202/Tax%20Referee/app/api/documents/parse/route.ts) tự động bóc tách chi tiết dòng hàng từ file XML chuẩn hóa đơn điện tử (MISA, Viettel, VNPT) và [services/geminiService.ts](file:///Users/xuannguyen/Desktop/Competitions/2026/MLAI%20-%20Track%202/Tax%20Referee/services/geminiService.ts) từ PDF/ảnh.
  - UI: [components/DocumentViewer.tsx](file:///Users/xuannguyen/Desktop/Competitions/2026/MLAI%20-%20Track%202/Tax%20Referee/components/DocumentViewer.tsx) hiển thị bảng hàng hóa chi tiết với badge thuế suất và cảnh báo dòng vi phạm.
- **IMP-09 (Bulk Confirm Routine Action 1-Click):**
  - API: [app/api/inbox/bulk-confirm/route.ts](file:///Users/xuannguyen/Desktop/Competitions/2026/MLAI%20-%20Track%202/Tax%20Referee/app/api/inbox/bulk-confirm/route.ts) phê duyệt hàng loạt ca `ROUTINE_PROPOSED` với guardrails an toàn và ghi Batch Audit Trail.
  - UI: Floating Bulk Action Bar và hệ thống Checkbox chọn từng dòng / chọn tất cả trong [components/ProductionWorkspace.tsx](file:///Users/xuannguyen/Desktop/Competitions/2026/MLAI%20-%20Track%202/Tax%20Referee/components/ProductionWorkspace.tsx).
- **IMP-10 (Advanced Multi-criteria Filter & Search):**
  - Component: [components/InboxFilterToolbar.tsx](file:///Users/xuannguyen/Desktop/Competitions/2026/MLAI%20-%20Track%202/Tax%20Referee/components/InboxFilterToolbar.tsx) hỗ trợ tìm kiếm tức thì tiếng Việt không dấu (`removeAccents`), lọc theo Nhóm rủi ro, lọc theo mức tiền, lọc theo trạng thái duyệt và nút đặt lại.
  - Test Suite: Toàn bộ ca kiểm thử TC-HIGH-01 đến TC-HIGH-08 đã vượt qua kiểm chứng thành công.

---
*Tài liệu Kế hoạch Kỹ thuật được cập nhật hoàn tất bởi Trợ lý AI Cấp cao phục vụ công tác phát triển dự án Tax Referee.*
