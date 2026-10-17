# Tax Referee — UI system

> ARCHIVED: Người dùng đã yêu cầu khôi phục giao diện trước redesign ngày 11/10/2026. Tài liệu này không còn là design system đang áp dụng; không tự triển khai lại.
>
> 📌 Chuyển từ `design-system/tax-referee/MASTER.md` sang `docs/archive/` ngày 17/10/2026; nội dung giữ nguyên, chỉ bỏ đường dẫn cục bộ trên máy thành viên và thêm khoảng trắng bị dính ("collapsed 64", "dưới 1280").

Product: workspace kế toán MVP, công cụ phân luồng và xử lý hóa đơn. Hướng thiết kế: enterprise workspace nhẹ, ưu tiên dữ liệu, thao tác và khả năng đối chiếu.

## Tokens

| Thành phần | Giá trị |
|---|---|
| Nền | #f8fafc |
| Panel | #ffffff |
| Nội dung | #0f172a |
| Nội dung phụ | #475569 / #64748b |
| Viền | #e2e8f0 |
| Hành động/focus | #1e40af |
| Active background | #eff6ff |
| Thành công | emerald 700/50 |
| Cần xử lý | amber 800/50 |
| Lỗi/từ chối | red 800/50 |
| Font | Inter tự lưu trữ, license trong public/fonts |
| H1 / H2 / body / meta | 24 / 16–18 / 14 / 12px |
| Weight | 400 / 500 / 600 |
| Spacing | 4 / 8 / 12 / 16 / 24 / 32px |
| Control / panel radius | 6 / 10px |
| Control height | 36 desktop, 44 mobile |
| Sidebar / header | 216 (collapsed 64) / 56px |

## Patterns

Bảng là điểm vào hồ sơ; panel là không gian làm việc, không phải trang quảng cáo. Một quyết định chính tại một thời điểm; thao tác bổ sung qua disclosure. Tab hồ sơ có keyboard semantics. Lỗi biểu mẫu hiển thị summary và từng trường. Chứng từ phải là file gốc, không được dựng lại rồi gọi là bản gốc. Hash/JSON và các hướng dẫn dài đóng mặc định.

>=1280: bảng + panel sticky; 640–1279: panel overlay; <640: full-width review, supplier/next-step rút khỏi bảng, nhà cung cấp vẫn hiện trong ô hóa đơn. Tiếp nhận dùng hai cột desktop và Nguồn/Dữ liệu dưới 1280. Giữ dữ liệu form khi đổi tab. Nút/links có focus ring; reduced-motion không animation. Không dùng màu làm tín hiệu duy nhất.

## Nguồn và áp dụng

- ui-ux-pro-max (skill cài trên máy thành viên; nguồn công khai: [ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)): đã dùng để chọn hướng và rà soát keyboard/focus, responsive, typography. Query `modal focus return keyboard` trả về Focus States và Focus Not Obscured; áp dụng focus ring, focus containment/return và vùng cuộn của panel.
- [Taste redesign](https://github.com/Leonxlnx/taste-skill/blob/main/skills/redesign-skill/SKILL.md): audit hierarchy, density, consistency và progressive disclosure; không sao chép hiệu ứng trang marketing vào workspace nghiệp vụ.
- Quyết định màu, phạm vi toàn UI và MVP role picker do người dùng chốt. Những token ở trên là bản điều chỉnh cho sản phẩm hiện tại, không phải nguyên mẫu mặc định của skill.
