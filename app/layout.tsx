import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Tax Referee · Tác tử Điều phối Chuyển tiếp Thuế Doanh nghiệp',
  description: 'Hệ thống AI phòng vệ thuế toàn cục theo chuẩn Đề bài A - MLAI Hackathon 2026 (HCMUT x HUTECH)',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" className="dark">
      <body className="min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased selection:bg-amber-500 selection:text-slate-950">
        {children}
      </body>
    </html>
  );
}
