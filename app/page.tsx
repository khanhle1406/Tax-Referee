'use client';

import React, { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ShieldCheck, Check } from 'lucide-react';
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
      .then(async (res) => res.ok ? res.json() : null)
      .then((data) => setUser(data?.user || null))
      .catch(() => undefined)
      .finally(() => setChecking(false));
  }, []);

  const login = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi đăng nhập');
      setUser(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi đăng nhập');
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-500 font-sans">
        <div className="flex items-center gap-3">
          <span className="h-3 w-3 rounded-full bg-brand-lime animate-ping" />
          <span className="text-base font-medium text-slate-900">Đang khởi tạo Tax Referee...</span>
        </div>
      </div>
    );
  }

  if (user) {
    return (
      <ProductionWorkspace
        user={user}
        onLogout={() => void logout()}
        onRoleSwitched={(next) => setUser(next)}
      />
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100/80 px-4 py-8">
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
        
        {/* Header - To & Rõ ràng, Tối giản chữ */}
        <div className="border-b border-slate-200 bg-white p-6 sm:p-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 text-brand-lime">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-950">Tax Referee</h1>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Tiền hạch toán thuế</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 border border-emerald-200">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Online
            </span>
          </div>
        </div>

        {/* Content & Form */}
        <div className="p-6 sm:p-8 space-y-6">
          
          {/* Chọn vai trò (Role tiles - To, Rõ, Ít chữ) */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5">
              Chọn vai trò
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              {[
                { role: 'ACCOUNTANT', title: 'Kế toán viên', email: 'ke-toan@local', pass: 'accountant-local' },
                { role: 'CHIEF_ACCOUNTANT', title: 'Kế toán trưởng', email: 'ktt@local', pass: 'ktt-local' },
                { role: 'CFO', title: 'CFO', email: 'cfo@local', pass: 'cfo-local' }
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
                    className={`flex flex-col items-center justify-center p-3.5 rounded-xl border text-center transition cursor-pointer ${
                      isSelected
                        ? 'border-slate-950 bg-slate-950 text-white font-bold shadow-sm'
                        : 'border-slate-200 bg-slate-50/70 hover:bg-slate-100 text-slate-700 font-semibold'
                    }`}
                  >
                    <span className="text-sm tracking-tight">{r.title}</span>
                    {isSelected && (
                      <span className="mt-1 flex items-center gap-1 text-[11px] font-bold text-brand-lime">
                        <Check className="h-3 w-3" /> Đã chọn
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Form */}
          <form onSubmit={login} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                Tài khoản
              </label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-base font-semibold text-slate-900 outline-none transition focus:border-slate-900 focus:bg-white focus:ring-1 focus:ring-slate-900"
                autoComplete="username"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                Mật khẩu
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-base font-semibold text-slate-900 outline-none transition focus:border-slate-900 focus:bg-white focus:ring-1 focus:ring-slate-900"
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700">
                {error}
              </div>
            )}

            {/* CTA Button: Ramp Accent Lime or Slate Ink, Big & Clear */}
            <button
              type="submit"
              disabled={busy}
              className="w-full mt-2 flex items-center justify-center gap-2 rounded-xl bg-slate-950 hover:bg-slate-900 px-6 py-3.5 text-base font-bold text-white transition active:scale-[0.99] disabled:opacity-50 cursor-pointer shadow-sm"
            >
              {busy ? (
                'Đang xử lý...'
              ) : (
                <>
                  <span>VÀO WORKSPACE</span>
                  <ArrowRight className="h-4 w-4 text-brand-lime" />
                </>
              )}
            </button>
          </form>

          {/* Footer link to verify */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-sm">
            <span className="text-slate-500 font-medium">Bộ kiểm thử:</span>
            <Link
              href="/verify"
              className="inline-flex items-center gap-1.5 font-bold text-slate-900 hover:text-slate-700 underline underline-offset-4"
            >
              Verify Harness & Benchmark <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

      </div>
    </main>
  );
}
