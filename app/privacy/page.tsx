import type { Metadata } from 'next';
import Link from 'next/link';
import { devLlmConfig, SHOPAIKEY_GEMINI_API_CONFIG } from '@/lib/constants';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Dữ liệu của bạn đi đâu · Tax Referee' };

/** Trang riêng tư: mỗi loại dữ liệu đi đâu, AI được thấy gì, ai xem được, giữ bao lâu, luật nào — đọc cấu hình đang chạy thật. */
export default function PrivacyPage() {
  const dev = devLlmConfig();
  const visionOn = Boolean(dev || SHOPAIKEY_GEMINI_API_CONFIG.API_KEY);
  const rows: Array<[string, string, string]> = [
    ['Hóa đơn XML (hóa đơn điện tử)', 'Đọc ngay trên máy chủ bằng quy tắc cố định. Không gửi cho AI.', 'Máy chủ của doanh nghiệp'],
    ['Ảnh chụp, PDF scan', visionOn ? `Gửi cho AI đọc ảnh (${dev ? `máy chủ demo ${dev.host}` : 'Gemini qua nhà cung cấp trung gian'}). AI chỉ được trả về 14 trường nhìn thấy trên hóa đơn; trường khác bị loại.` : 'Đang tắt AI: ảnh không được gửi đi đâu, kế toán nhập tay.', visionOn ? 'Bên thứ ba, có thể ở nước ngoài' : 'Không gửi đi'],
    ['Tên, MST bên bán', 'Khi chưa có kết quả tra cứu lưu sẵn, MST có thể được gửi tới dịch vụ tra cứu bên thứ ba (VietQR; Xinvoice nếu doanh nghiệp cấu hình khóa), tên tới doanhnghiep.vn nếu cấu hình khóa, và tên/MST tới công cụ tìm kiếm của nhà cung cấp AI — công cụ này chỉ nhận kết quả từ nguồn *.gov.vn có trích dẫn.', 'Bên thứ ba và nguồn công khai của Nhà nước'],
    ['Email, Zalo của người gửi', 'Chỉ dùng để biết ai gửi; người gửi qua email nhận lại kết quả hóa đơn của mình, người gửi qua Zalo chỉ nhận tin báo đã nhận.', 'Máy chủ của doanh nghiệp'],
    ['Dữ liệu hóa đơn khi bật AI diễn đạt câu hỏi', 'Tắt mặc định. Chỉ khi doanh nghiệp bật QGEN_AI=1, các trường của hóa đơn được gửi cho AI để diễn đạt lại câu hỏi chuyển tiếp; câu AI viết bị loại nếu thêm số liệu hoặc đổi người nhận, phương án.', 'Bên thứ ba, chỉ khi bật'],
    ['Quyết định, câu trả lời, chốt lô', 'Ghi vào nhật ký chỉ ghi thêm, nối chuỗi băm có HMAC — sửa một dòng là bị phát hiện.', 'Máy chủ của doanh nghiệp'],
  ];
  return <main className="mx-auto max-w-3xl space-y-8 px-4 py-10 text-slate-900">
    <header className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tax Referee · Riêng tư</p>
      <h1 className="text-3xl font-semibold">Dữ liệu của bạn đi đâu</h1>
      <p className="text-slate-600">Nói ngắn gọn: <strong>máy quyết định bằng quy tắc, không bằng AI</strong>. AI chỉ được nhìn ảnh để đọc chữ, và chỉ khi doanh nghiệp bật (AI diễn đạt câu hỏi tắt mặc định, xem bảng dưới). Nội dung hóa đơn điện tử (XML) do máy đọc, không gửi cho AI để đọc; riêng tên và mã số thuế người bán có thể được gửi đi tra cứu: tới dịch vụ tra cứu bên thứ ba (như VietQR) và tới công cụ tìm kiếm của nhà cung cấp AI, chỉ nhận kết quả từ nguồn .gov.vn.</p>
    </header>

    <section className="space-y-3">
      <h2 className="text-xl font-semibold">Từng loại dữ liệu</h2>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Dữ liệu</th><th className="px-3 py-2">Đi đâu, để làm gì</th><th className="px-3 py-2">Nằm ở</th></tr></thead>
          <tbody className="divide-y">{rows.map(([what, how, where]) => <tr key={what}><td className="px-3 py-2 font-medium">{what}</td><td className="px-3 py-2">{how}</td><td className="px-3 py-2 text-slate-600">{where}</td></tr>)}</tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">Bảng này đọc cấu hình đang chạy: AI đọc ảnh hiện <strong>{visionOn ? 'đang bật' : 'đang tắt'}</strong>{dev ? ` (LLM demo tại ${dev.host}, bật bằng DEV_LLM_ENABLED)` : ''}. Đường quyết định gọi AI 0 lần.</p>
    </section>

    <section className="space-y-2">
      <h2 className="text-xl font-semibold">Ai được xem gì</h2>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        <li>Mỗi người thấy <strong>lịch sử của chính mình</strong> (hóa đơn đã gửi, việc đã làm).</li>
        <li>Kế toán trưởng và CFO thấy tổng quan của doanh nghiệp và địa chỉ đầy đủ của người gửi (Kế toán viên chỉ thấy địa chỉ đã che); CFO mới duyệt được khoản từ 200 triệu.</li>
        <li>Người gửi hóa đơn qua email chỉ nhận kết quả hóa đơn của mình; người gửi qua Zalo chỉ nhận tin báo đã nhận.</li>
        <li>Bản demo: mỗi phiên một cơ sở dữ liệu riêng, phiên này không đọc được dữ liệu phiên khác.</li>
      </ul>
    </section>

    <section className="space-y-2">
      <h2 className="text-xl font-semibold">Chế độ không AI</h2>
      <p className="text-sm">Doanh nghiệp không muốn ảnh rời máy chủ thì không cấu hình khóa AI: hệ thống chỉ nhận XML và nhập tay, mọi quy tắc và câu hỏi vẫn chạy đủ. Tra cứu MST qua dịch vụ bên thứ ba (VietQR) không dùng AI và vẫn chạy.</p>
    </section>

    <section className="space-y-2">
      <h2 className="text-xl font-semibold">Luật liên quan</h2>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        <li><strong>Bảo vệ dữ liệu cá nhân:</strong> Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15 và Nghị định 356/2025/NĐ-CP. Đội mới kiểm qua nguồn thứ cấp, chưa đối chiếu nguyên văn nên không trích số điều. Dùng thật cần thỏa thuận xử lý dữ liệu với nhà cung cấp AI và đánh giá việc chuyển dữ liệu ra nước ngoài — hoặc dùng chế độ không AI.</li>
        <li><strong>MST 12 số</strong> của cá nhân, hộ kinh doanh là dữ liệu gắn với một người cụ thể: chỉ dùng cho việc kiểm hóa đơn.</li>
        <li><strong>Thuế GTGT:</strong> căn cứ chọn theo ngày lập hóa đơn (Luật 48/2024/QH15, Nghị định 181/2025/NĐ-CP, Thông tư 219/2013/TT-BTC cho hóa đơn trước 01/7/2025…), đã đối chiếu nguyên văn ngày 17/10/2026. Xem <Link href="/sop" className="underline">tài liệu quy định</Link>.</li>
      </ul>
    </section>

    <section className="space-y-2">
      <h2 className="text-xl font-semibold">Điều chúng tôi chưa làm (nói thẳng)</h2>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        <li>Chưa có hợp đồng xử lý dữ liệu với nhà cung cấp AI; bản demo dùng nhà cung cấp trung gian.</li>
        <li>Khóa ký nhật ký đang nằm cùng máy chủ; triển khai thật cần đưa vào KMS.</li>
        <li>Chưa có công cụ tự xóa dữ liệu theo hạn lưu trữ; hiện dọn bằng script vận hành.</li>
      </ul>
      <p className="text-xs text-slate-500">Bằng chứng bảo mật chạy trên chính bản đang chạy: <Link href="/trust" className="underline">Trung tâm tin cậy</Link>.</p>
    </section>
  </main>;
}
