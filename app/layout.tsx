import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Tax Referee · Workspace Tiền Hạch Toán',
  description: 'Hệ thống thẩm định rủi ro hóa đơn và tiền hạch toán thuế B2B theo chuẩn SOP 2026.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" className="h-full scroll-smooth">
      <body className="min-h-full bg-slate-50/70 text-slate-900 font-sans flex flex-col antialiased selection:bg-brand-lime selection:text-slate-950">
        {children}
      </body>
    </html>
  );
}
