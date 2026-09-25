'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, ShieldCheck } from 'lucide-react';
import { VerifyHarness } from '@/components/VerifyHarness';
import { InteractiveInputForm } from '@/components/InteractiveInputForm';
import { DEFAULT_POLICY_CONFIG } from '@/lib/constants';
import { InvoiceInput, RefereeDecision } from '@/lib/schemas';

export default function VerifyPage() {
  const [decision, setDecision] = useState<RefereeDecision | null>(null);
  const [invoice, setInvoice] = useState<InvoiceInput | null>(null);

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-slate-100 sm:px-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div className="flex items-center gap-3"><div className="rounded-xl bg-emerald-500 p-2 text-slate-950"><ShieldCheck className="h-5 w-5" /></div><div><div className="font-bold">Tax Referee Verify</div><div className="text-xs text-slate-400">Khu vực kiểm thử công khai · không ghi vào dữ liệu production</div></div></div><Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-300 hover:text-white"><ArrowLeft className="h-4 w-4" /> Về workspace</Link></header>
        <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5"><p className="text-sm font-semibold text-emerald-300">Đề bài A · Escalation Referee</p><h1 className="mt-2 text-2xl font-bold">Kiểm tra 5 ca chuẩn trong một thao tác</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Ba ca thường quy được xử lý tự động theo rule engine; hai ca rủi ro phải dừng và đưa ra câu hỏi A/B cụ thể. Bạn cũng có thể nhập một case mới để kiểm tra.</p></section>
        <VerifyHarness />
        <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]"><InteractiveInputForm demoMode onEvaluateResult={(nextDecision, nextInvoice) => { setDecision(nextDecision); setInvoice(nextInvoice); }} dynamicConfig={DEFAULT_POLICY_CONFIG} />{decision && invoice ? <section className="rounded-2xl border border-slate-700 bg-slate-900/90 p-5 shadow-xl"><div className="flex items-center gap-2 text-sm font-bold text-emerald-300"><CheckCircle2 className="h-4 w-4" /> Kết quả case mới</div><h2 className="mt-3 text-xl font-bold">{invoice.invoiceNumber} · {invoice.supplierName}</h2><div className={`mt-4 rounded-xl p-4 ${decision.status === 'ROUTINE' ? 'bg-emerald-500/10 text-emerald-200' : 'bg-amber-500/10 text-amber-200'}`}><div className="font-bold">{decision.status === 'ROUTINE' ? 'ROUTINE · Đề xuất xử lý tự động' : `ESCALATED · ${decision.riskGroup}`}</div><p className="mt-2 text-sm leading-6">{decision.plainExplanation}</p>{decision.status === 'ESCALATED' && <><p className="mt-3 font-semibold">{decision.actionableQuestion}</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{decision.options.map((option) => <div key={option.id} className="rounded-lg border border-white/10 p-3 text-xs"><b>Phương án {option.id}</b><br />{option.actionDescription}</div>)}</div></>}</div><p className="mt-4 text-xs text-slate-500">Case public chỉ phục vụ kiểm thử và không tạo hồ sơ production.</p></section> : <section className="flex min-h-[320px] items-center justify-center rounded-2xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-500">Kết quả case mới sẽ xuất hiện ở đây.</section>}</div>
      </div>
    </main>
  );
}
