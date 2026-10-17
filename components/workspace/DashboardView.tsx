'use client';
import { useCallback, useEffect, useState, type ReactElement, type ReactNode } from 'react';
import Link from 'next/link';
import { CheckCircle2, Clock, AlertTriangle, ArrowRight } from 'lucide-react';
import type { DashboardData, SourceRow, SubmitterRow } from '@/services/dashboardService';
import { formatVND } from '@/lib/utils';
import { ScreenState, WorkspaceSkeleton } from './ScreenState';

export type WorkspaceViewUser = { id: string; email: string; displayName: string; role: 'ACCOUNTANT' | 'CHIEF_ACCOUNTANT' | 'CFO' };

type LoadState = { kind: 'loading' } | { kind: 'ready'; data: DashboardData } | { kind: 'error'; status: number; message: string };

const OUTCOMES: Array<{ key: keyof DashboardData['outcomes']; label: string; hint: string; bar: string }> = [
  { key: 'machine', label: 'Máy tự xử lý', hint: 'Đủ điều kiện, máy duyệt ngay, không cần ai.', bar: 'bg-emerald-600' },
  { key: 'human', label: 'Có người xử lý rồi duyệt', hint: 'Máy dừng hỏi; người trả lời hoặc duyệt tay.', bar: 'bg-blue-700' },
  { key: 'waiting', label: 'Đang chờ quyết định', hint: 'Đang chờ Kế toán trưởng hoặc CFO.', bar: 'bg-amber-500' },
  { key: 'onHold', label: 'Tạm giữ', hint: 'Chờ bổ sung chứng từ hoặc đang giữ thuế.', bar: 'bg-orange-700' },
  { key: 'rejected', label: 'Từ chối', hint: 'Không được khấu trừ VAT.', bar: 'bg-red-700' },
  { key: 'processing', label: 'Đang đánh giá', hint: 'Máy đang chạy quy tắc.', bar: 'bg-slate-400' },
];

/** "2 giờ 15 phút" — dễ đọc hơn số phút. */
function duration(minutes: number | null): string {
  if (minutes === null) return 'Chưa có';
  if (minutes < 1) return 'Dưới 1 phút';
  const d = Math.floor(minutes / 1440), h = Math.floor((minutes % 1440) / 60), m = minutes % 60;
  return [d && `${d} ngày`, h && `${h} giờ`, !d && m && `${m} phút`].filter(Boolean).join(' ');
}
const fmtTime = (iso: string): string => new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }).format(new Date(iso));

function Card({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }): ReactElement {
  return <section className="rounded-2xl border bg-card p-4 sm:p-5" aria-label={title}>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-semibold">{title}</h2>{action}</div>
    {children}
  </section>;
}
function Bar({ value, max, color = 'bg-blue-700', label }: { value: number; max: number; color?: string; label: string }): ReactElement {
  const width = max > 0 ? Math.max(value > 0 ? 3 : 0, Math.round((value / max) * 100)) : 0;
  return <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label={label}><div className={`h-full rounded-full ${color}`} style={{ width: `${width}%` }} /></div>;
}
function Big({ label, value, sub, tone = '' }: { label: string; value: string; sub?: string; tone?: string }): ReactElement {
  return <div className="min-w-0 rounded-xl border bg-background p-4"><p className="text-sm text-muted-foreground">{label}</p><p className={`mt-1 break-words text-2xl font-semibold font-numeric ${tone}`}>{value}</p>{sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}</div>;
}
function Breakdown({ rows, empty, withDepartment }: { rows: Array<SourceRow | SubmitterRow>; empty: string; withDepartment?: boolean }): ReactElement {
  if (!rows.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return <ul className="space-y-3">{rows.slice(0, 8).map(r => <li key={r.key} className="space-y-1">
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm"><span className="min-w-0 font-medium">{r.label}{withDepartment && 'department' in r && r.department ? <span className="font-normal text-muted-foreground"> · {r.department}</span> : null}</span>
      <span className="font-numeric text-muted-foreground">{r.invoices} hóa đơn · phải hỏi người {r.needsHuman} ({r.needsHumanPct}%)</span></div>
    <Bar value={r.needsHumanPct} max={100} color={r.needsHumanPct > 50 ? 'bg-amber-500' : 'bg-emerald-600'} label={`${r.label}: ${r.needsHumanPct}% phải hỏi người`} />
  </li>)}</ul>;
}

/** Tổng quan cho Kế toán trưởng và CFO: số lớn, câu chữ đơn giản, nhìn một lần biết việc cần làm. */
export function DashboardView({ user }: { user: WorkspaceViewUser }): ReactElement {
  const [period, setPeriod] = useState('');
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const load = useCallback(async (signal?: AbortSignal): Promise<void> => {
    setState({ kind: 'loading' });
    try {
      const response = await fetch('/api/dashboard' + (period ? '?' + new URLSearchParams({ period }) : ''), { cache: 'no-store', signal });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setState({ kind: 'error', status: response.status, message: body.error || 'Không thể tải Tổng quan.' }); return; }
      setState({ kind: 'ready', data: body.dashboard as DashboardData });
    } catch (cause) { if (!signal?.aborted) setState({ kind: 'error', status: 0, message: cause instanceof Error ? cause.message : 'Không thể tải Tổng quan.' }); }
  }, [period]);
  useEffect(() => {
    if (user.role === 'ACCOUNTANT') return;
    const controller = new AbortController(); void load(controller.signal); return () => controller.abort();
  }, [load, user.role]);

  if (user.role === 'ACCOUNTANT') return <ScreenState title="Tổng quan dành cho Kế toán trưởng và CFO" description="Bạn có thể xem việc của mình ở mục Lịch sử của tôi." />;
  if (state.kind === 'loading') return <WorkspaceSkeleton />;
  if (state.kind === 'error') {
    if (state.status === 401) return <section className="screen-state" role="alert"><h2 className="text-base font-semibold">Phiên đăng nhập đã hết</h2><p className="text-sm text-muted-foreground">Đăng nhập lại để xem Tổng quan.</p><Link href="/" className="text-sm underline underline-offset-4">Về trang đăng nhập</Link></section>;
    if (state.status === 403) return <ScreenState error title="Bạn không có quyền xem Tổng quan" description={state.message} />;
    return <ScreenState error title="Không tải được Tổng quan" description={state.message} onRetry={() => void load()} />;
  }

  const d = state.data, total = d.totals.invoices, o = d.outcomes;
  const you = d.viewerRole === 'CFO' ? 'CFO' : 'Kế toán trưởng';
  const maxReason = Math.max(1, ...d.stopReasons.map(r => r.count)), maxGroup = Math.max(1, ...d.riskGroups.map(g => g.count));
  const periodPicker = <label className="flex items-center gap-2 text-sm"><span className="text-muted-foreground">Kỳ</span>
    <select value={period} onChange={event => setPeriod(event.target.value)} className="h-11 rounded-[10px] border bg-background px-3 sm:h-9" aria-label="Chọn kỳ theo ngày lập hóa đơn">
      <option value="">Tất cả</option>{[...new Set([...(period ? [period] : []), ...d.periods])].map(p => <option key={p} value={p}>Tháng {p.slice(5)}/{p.slice(0, 4)}</option>)}
    </select></label>;

  return <div className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-semibold">Tổng quan</h1><p className="text-sm text-muted-foreground">Số liệu lúc {fmtTime(d.generatedAt)} · {d.period ? `hóa đơn lập trong tháng ${d.period.slice(5)}/${d.period.slice(0, 4)}` : 'tất cả hóa đơn'}</p></div>
      <div className="flex flex-wrap items-center gap-2">{periodPicker}<button type="button" onClick={() => void load()} className="h-11 rounded-[10px] border px-3 text-sm hover:bg-muted sm:h-9">Tải lại</button></div>
    </div>

    {/* Việc cần làm ngay: một câu, một nút. */}
    {d.myQueue.count > 0
      ? <Link href="/workspace/approvals" className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950 hover:bg-amber-100 sm:p-5">
          <Clock className="h-6 w-6 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1"><span className="block text-lg font-semibold">Đang chờ anh/chị quyết định: {d.myQueue.count} hóa đơn</span><span className="block text-sm">VAT chờ {formatVND(d.myQueue.vat)} · việc của {you}</span></span>
          <span className="inline-flex items-center gap-1 text-sm font-medium">Xử lý ngay <ArrowRight className="h-4 w-4" aria-hidden="true" /></span>
        </Link>
      : <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950 sm:p-5"><CheckCircle2 className="h-6 w-6 shrink-0" aria-hidden="true" /><span className="text-lg font-semibold">Không có hóa đơn nào chờ anh/chị quyết định.</span></div>}

    {total === 0 ? <ScreenState title="Chưa có hóa đơn" description={d.period ? 'Kỳ này chưa có hóa đơn nào. Chọn "Tất cả" để xem toàn bộ.' : 'Khi có hóa đơn được tiếp nhận, số liệu sẽ hiện ở đây.'} /> : <>
      <Card title="Hóa đơn đi đâu?">
        <p className="mb-3 text-lg"><span className="font-semibold font-numeric">Máy tự xử lý {o.machine.count}/{total} hóa đơn ({o.machine.pct}%)</span> <span className="text-muted-foreground">· tổng VAT {formatVND(d.totals.vat)}</span></p>
        <div className="flex h-4 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label={OUTCOMES.map(x => `${x.label} ${o[x.key].count}`).join(', ')}>
          {OUTCOMES.map(x => o[x.key].count > 0 && <div key={x.key} className={x.bar} style={{ width: `${(o[x.key].count / total) * 100}%` }} />)}
        </div>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {OUTCOMES.filter(x => x.key !== 'processing' || o.processing.count > 0).map(x => <li key={x.key} className="flex gap-3 rounded-xl border bg-background p-3">
            <span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${x.bar}`} aria-hidden="true" />
            <span className="min-w-0"><span className="block text-sm font-medium">{x.label}</span><span className="block text-2xl font-semibold font-numeric">{o[x.key].count} <span className="text-sm font-normal text-muted-foreground">({o[x.key].pct}%)</span></span><span className="block text-xs text-muted-foreground">{x.hint}</span></span>
          </li>)}
        </ul>
      </Card>

      <Card title="Tiền thuế GTGT (VAT)">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Big label="Đã được khấu trừ" value={formatVND(d.vat.deducted)} tone="text-emerald-800" sub="Đã duyệt và đã ghi sổ (hóa đơn trong lô: sau khi chốt)" />
          <Big label="Không được khấu trừ" value={formatVND(d.vat.excluded)} tone="text-red-800" sub="Bị từ chối hoặc bị loại một phần" />
          <Big label="Đang chờ quyết định" value={formatVND(d.vat.pending)} tone="text-amber-800" sub={`${o.waiting.count} hóa đơn chờ KTT/CFO`} />
          <Big label="Đang tạm giữ" value={formatVND(d.vat.onHold)} sub={`${o.onHold.count} hóa đơn chờ bổ sung / giữ thuế`} />
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Vì sao máy dừng lại hỏi người?">
          {d.stopReasons.length ? <ol className="space-y-3">{d.stopReasons.map((r, i) => <li key={r.ruleId} className="space-y-1">
            <div className="flex items-baseline justify-between gap-3 text-sm"><span className="min-w-0">{i + 1}. {r.label}</span><span className="shrink-0 font-numeric text-muted-foreground">{r.count} hóa đơn</span></div>
            <Bar value={r.count} max={maxReason} label={`${r.label}: ${r.count} hóa đơn`} />
          </li>)}</ol> : <p className="text-sm text-muted-foreground">Chưa có hóa đơn nào phải dừng.</p>}
          <div className="mt-4 border-t pt-4"><p className="mb-2 text-sm font-medium">Theo 3 kiểu dừng</p><ul className="space-y-2">{d.riskGroups.map(g => <li key={g.group} className="grid grid-cols-[minmax(0,8.5rem)_1fr_auto] items-center gap-3 text-sm">
            <span>{g.label}</span><Bar value={g.count} max={maxGroup} color={g.group === 'OUT_OF_POLICY' ? 'bg-red-700' : g.group === 'EXCEED_AUTHORITY' ? 'bg-violet-700' : 'bg-amber-500'} label={`${g.label}: ${g.count}`} /><span className="font-numeric text-muted-foreground">{g.count}</span>
          </li>)}</ul></div>
        </Card>

        <Card title="Tốc độ xử lý">
          <div className="grid gap-3 sm:grid-cols-2">
            <Big label="Trả lời trung bình" value={duration(d.response.averageMinutes)} sub={d.response.answered ? `Từ lúc máy hỏi đến lúc có người xử lý · ${d.response.answered} lần` : 'Chưa có lần trả lời nào'} />
            <Big label="Chờ quá 24 giờ" value={`${d.response.overdue24h} hóa đơn`} tone={d.response.overdue24h ? 'text-red-800' : 'text-emerald-800'} sub={d.response.overdue24h ? 'Cần xử lý sớm' : 'Không có ca trễ hạn'} />
          </div>
          {d.response.overdueItems.length > 0 && <ul className="mt-3 divide-y rounded-xl border">{d.response.overdueItems.map(item => <li key={item.id}>
            <Link href={'/workspace/invoices/' + encodeURIComponent(item.id)} className="flex items-center gap-3 px-3 py-3 text-sm hover:bg-muted/60">
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-700" aria-hidden="true" /><span className="min-w-0 flex-1 truncate">Số {item.invoiceNumber} · {item.supplierName}</span><span className="shrink-0 font-numeric text-red-800">{item.hoursWaiting} giờ</span>
            </Link></li>)}</ul>}
          <div className="mt-4 border-t pt-4">
            <p className="text-sm font-medium">Hậu kiểm ngẫu nhiên ca máy tự duyệt</p>
            {d.postAudit.sampled ? <p className="mt-1 text-sm">Đã kiểm <span className="font-semibold font-numeric">{d.postAudit.reviewed}/{d.postAudit.sampled}</span> mẫu · đồng ý {d.postAudit.agreed} · không đồng ý {d.postAudit.disagreed}{d.postAudit.pending ? ` · còn ${d.postAudit.pending} chờ kiểm` : ''}</p>
              : <p className="mt-1 text-sm text-muted-foreground">Chưa có mẫu nào được chọn.</p>}
          </div>
        </Card>
      </div>

      <Card title="Lô hóa đơn" action={<Link href="/workspace/batches" className="text-sm underline underline-offset-4">Mở Lô hóa đơn</Link>}>
        {d.batches.total ? <div className="grid gap-3 sm:grid-cols-3">
          <Big label="Số lô" value={String(d.batches.total)} sub={`Đã chốt ${d.batches.signedOff} · chưa chốt ${d.batches.open}`} />
          <Big label="Đã duyệt, chờ chốt lô" value={`${d.batches.approvedInOpenBatches} hóa đơn`} tone={d.batches.approvedInOpenBatches ? 'text-amber-800' : ''} sub={`VAT ${formatVND(d.batches.approvedVatInOpenBatches)} chờ người ký chốt lô`} />
          <Big label="Lô chưa chốt" value={String(d.batches.open)} sub={d.batches.open ? 'Cần ký chốt trước khi ghi sổ' : 'Tất cả lô đã chốt'} />
        </div> : <p className="text-sm text-muted-foreground">Chưa có lô nào.</p>}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Theo kênh gửi"><Breakdown rows={d.bySource} empty="Chưa có dữ liệu kênh." /></Card>
        <Card title="Theo người gửi"><Breakdown rows={d.bySubmitter} empty="Chưa có dữ liệu người gửi." withDepartment /></Card>
      </div>
    </>}
  </div>;
}
