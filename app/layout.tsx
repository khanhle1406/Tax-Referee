import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Tax Referee · Workspace tiền hạch toán',
  description: 'Workspace kiểm tra chứng từ, phân luồng rủi ro và lưu vết quyết định cho kế toán.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body className="min-h-screen bg-[#f5f7fb] text-slate-900 flex flex-col antialiased selection:bg-amber-500 selection:text-slate-950">
        {children}
      </body>
    </html>
  );
}
