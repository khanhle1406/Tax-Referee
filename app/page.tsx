'use client';

import React, { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, LockKeyhole, ShieldCheck } from 'lucide-react';
import { ProductionWorkspace } from '@/components/ProductionWorkspace';

type AppUser = { id: string; email: string; displayName: string; role: 'ACCOUNTANT' | 'CHIEF_ACCOUNTANT' | 'CFO' };

export default function HomePage() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState('ke-toan@local');
  const [password, setPassword] = useState('accountant-local');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(async (response) => response.ok ? response.json() : null)
      .then((data) => setUser(data?.user || null))
      .catch(() => undefined)
      .finally(() => setChecking(false));
  }, []);

  const login = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Không thể đăng nhập');
      setUser(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể đăng nhập');
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
  };

  if (checking) return <div className="flex min-h-screen items-center justify-center bg-[#f5f7fb] text-sm text-slate-500">Đang mở Tax Referee...</div>;
  if (user) return <ProductionWorkspace user={user} onLogout={() => void logout()} onRoleSwitched={(next) => setUser(next)} />;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5f7fb] px-4 py-10">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl md:grid-cols-[1fr_0.9fr]">
        <section className="hidden bg-slate-900 p-10 text-white md:block"><div className="flex items-center gap-3"><div className="rounded-xl bg-white/10 p-2.5"><ShieldCheck className="h-6 w-6" /></div><span className="text-xl font-bold">Tax Referee</span></div><div className="mt-24 max-w-sm"><p className="text-sm font-semibold text-sky-300">WORKSPACE TIỀN HẠCH TOÁN</p><h1 className="mt-3 text-4xl font-bold leading-tight">Xử lý đúng việc, đúng người, đúng thời điểm.</h1><p className="mt-5 text-sm leading-7 text-slate-300">Hệ thống kiểm tra chứng từ, dừng tự động hóa khi có rủi ro và lưu lại căn cứ cho từng quyết định.</p></div></section>
        <section className="p-7 sm:p-10">
          <div className="mb-8 md:hidden">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-slate-900 p-2.5 text-white">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <span className="text-xl font-bold">Tax Referee</span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
            <LockKeyhole className="h-4 w-4" /> Đăng nhập workspace vận hành
          </div>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">Chọn vai trò đăng nhập</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Chuyển nhanh giữa 3 vai trò kế toán thực tế hoặc nhập tài khoản:
          </p>

          {/* Quick Role Switcher Buttons */}
          <div className="mt-5 grid grid-cols-3 gap-2">
            {[
              { role: 'ACCOUNTANT', title: 'Kế toán viên', email: 'ke-toan@local', pass: 'accountant-local', badge: 'Tiếp nhận / Routine' },
              { role: 'CHIEF_ACCOUNTANT', title: 'Kế toán trưởng', email: 'ktt@local', pass: 'ktt-local', badge: 'Duyệt ngoại lệ' },
              { role: 'CFO', title: 'CFO', email: 'cfo@local', pass: 'cfo-local', badge: 'Hạn mức cao / K' }
            ].map((r) => {
              const isSelected = email === r.email;
              return (
                <button
                  key={r.role}
                  type="button"
                  onClick={() => {
                    setEmail(r.email);
                    setPassword(r.pass);
                    setError('');
                  }}
                  className={`flex flex-col items-start p-3 rounded-xl border text-left transition ${
                    isSelected
                      ? 'border-sky-600 bg-sky-50/70 ring-2 ring-sky-500'
                      : 'border-slate-200 bg-slate-50/60 hover:bg-slate-100 hover:border-slate-300'
                  }`}
                >
                  <span className="text-xs font-bold text-slate-900">{r.title}</span>
                  <span className="text-[10px] text-slate-500 mt-0.5 leading-tight">{r.badge}</span>
                </button>
              );
            })}
          </div>

          <form onSubmit={login} className="mt-5 space-y-3.5">
            <label className="block text-xs font-semibold text-slate-700">
              Email / Tài khoản
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                autoComplete="username"
              />
            </label>
            <label className="block text-xs font-semibold text-slate-700">
              Mật khẩu
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                autoComplete="current-password"
              />
            </label>
            {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
            <button
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-60 shadow-md"
            >
              {busy ? 'Đang mở workspace...' : `Vào làm việc với quyền ${email === 'cfo@local' ? 'CFO' : email === 'ktt@local' ? 'Kế toán trưởng' : 'Kế toán viên'}`} <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          <div className="mt-6 border-t border-slate-100 pt-4 flex items-center justify-between text-xs">
            <span className="text-slate-500">Môi trường thi đấu / Benchmark:</span>
            <Link href="/verify" className="inline-flex items-center gap-1 font-bold text-sky-700 hover:text-sky-900">
              Mở Verify Harness public <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
