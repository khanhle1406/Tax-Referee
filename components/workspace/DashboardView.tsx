'use client';

import {useEffect, useState, type ReactElement} from 'react';
import Link from 'next/link';
import {ArrowUpRight, RefreshCw} from 'lucide-react';
import {DashboardSummarySchema, type DashboardSummary} from '@/lib/dashboard';
import type {AppRole} from '@/lib/server/auth';
import {Button, buttonVariants} from '@/components/ui/button';
import {ScreenState, WorkspaceSkeleton} from './ScreenState';

interface DashboardProps {role: AppRole; demo: boolean; revision: number}
const integer = new Intl.NumberFormat('vi-VN');
const percent = new Intl.NumberFormat('vi-VN', {style: 'percent', maximumFractionDigits: 0});

export function DashboardView({role, demo, revision}: DashboardProps): ReactElement {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (role === 'ACCOUNTANT') return;
    const controller = new AbortController(); setLoading(true); setError(false);
    void fetch('/api/dashboard', {signal: controller.signal, cache: 'no-store'})
      .then(async response => {
        if (!response.ok) throw new Error('Không thể tải thống kê');
        const result = DashboardSummarySchema.parse(await response.json());
        if (!controller.signal.aborted) setSummary(result);
      }).catch(() => {if (!controller.signal.aborted) setError(true);})
      .finally(() => {if (!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  }, [role, revision, attempt]);

  if (role === 'ACCOUNTANT') return <div><ScreenState title="Dành cho Kế toán trưởng và CFO" description="Đổi vai trò để xem thống kê phê duyệt."/><Link href="/workspace/inbox" className="text-sm underline underline-offset-4">Về Thẩm định</Link></div>;
  if (error) return <ScreenState error title="Chưa tải được thống kê" description="Dữ liệu chưa được cập nhật." onRetry={() => setAttempt(value => value + 1)}/>;
  if (loading || !summary) return <WorkspaceSkeleton/>;

  const approved = summary.approvals;
  const metrics = [
    {label: 'Tổng hóa đơn', value: summary.totalInvoices, note: 'Toàn bộ dữ liệu', href: '/workspace/inbox'},
    {label: 'Tự duyệt', value: approved.automatic, note: 'Không cần người duyệt', href: null},
    {label: 'Kế toán duyệt', value: approved.human, note: 'Kế toán trưởng / CFO', href: null},
    {label: 'Cần xử lý', value: summary.pending.total, note: 'Chưa hoàn tất', href: '/workspace/approvals'}
  ];
  return <section className="space-y-6" aria-label="Thống kê phê duyệt">
    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
      <p>{demo ? 'Toàn bộ hóa đơn trong phiên demo' : 'Toàn bộ hóa đơn nội bộ'}</p>
      <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => setAttempt(value => value + 1)}><RefreshCw className="h-3.5 w-3.5"/>Làm mới</Button>
    </div>
    <dl className="grid grid-cols-2 overflow-hidden rounded-2xl border bg-card lg:grid-cols-4">
      {metrics.map((metric, index) => <div key={metric.label} className={`min-w-0 p-4 sm:p-5 ${index % 2 ? 'border-l' : ''} ${index > 1 ? 'border-t lg:border-t-0' : ''} ${index === 2 ? 'lg:border-l' : ''}`}>
        <dt className="text-sm text-muted-foreground">{metric.label}</dt>
        <dd className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">{integer.format(metric.value)}</dd>
        {metric.href ? <Link href={metric.href} className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">{metric.note}<ArrowUpRight className="h-3 w-3"/></Link> : <p className="mt-3 text-xs text-muted-foreground">{metric.note}</p>}
      </div>)}
    </dl>
    {summary.totalInvoices === 0 ? <div className="rounded-2xl border bg-card p-6"><h2 className="font-medium">Chưa có hóa đơn được thẩm định</h2><p className="mt-2 text-sm text-muted-foreground">Tiếp nhận chứng từ để bắt đầu demo.</p><Link className={buttonVariants({className: 'mt-4'})} href="/workspace/receive">Tiếp nhận hóa đơn</Link></div> : <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-2xl border bg-card p-4 sm:p-5" aria-labelledby="dashboard-approvals">
        <div className="flex items-baseline justify-between gap-3"><h2 id="dashboard-approvals" className="font-semibold">Đã duyệt</h2><span className="text-sm tabular-nums text-muted-foreground">{integer.format(approved.total)} hóa đơn</span></div>
        <dl className="mt-4 space-y-4 text-sm">
          <div className="flex items-center justify-between gap-3"><dt>Hệ thống tự duyệt</dt><dd className="tabular-nums font-medium">{integer.format(approved.automatic)}</dd></div>
          <div className="flex items-center justify-between gap-3"><dt>Kế toán trưởng duyệt</dt><dd className="tabular-nums font-medium">{integer.format(approved.byRole.CHIEF_ACCOUNTANT)}</dd></div>
          <div className="flex items-center justify-between gap-3"><dt>CFO duyệt</dt><dd className="tabular-nums font-medium">{integer.format(approved.byRole.CFO)}</dd></div>
          {approved.unknown > 0 && <div className="flex items-center justify-between gap-3 text-muted-foreground"><dt>Chưa rõ nguồn duyệt</dt><dd className="tabular-nums">{integer.format(approved.unknown)}</dd></div>}
        </dl>
        <div className="mt-5 flex items-center justify-between gap-3 border-t pt-4 text-sm"><span className="text-muted-foreground">Tỷ lệ tự duyệt</span><strong className="rounded-lg bg-accent px-2.5 py-1 tabular-nums font-medium">{approved.automationRate === null ? '—' : percent.format(approved.automationRate)}</strong></div>
        <p className="mt-2 text-xs text-muted-foreground">Trong số hóa đơn hiện đã duyệt.</p>
      </section>
      <section className="rounded-2xl border bg-card p-4 sm:p-5" aria-labelledby="dashboard-pending">
        <div className="flex items-baseline justify-between gap-3"><h2 id="dashboard-pending" className="font-semibold">Đang chờ</h2><Link href="/workspace/approvals" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">Mở hàng đợi<ArrowUpRight className="h-3 w-3"/></Link></div>
        <dl className="mt-4 space-y-4 text-sm">
          <div className="flex items-center justify-between gap-3"><dt>Kế toán trưởng</dt><dd className="tabular-nums font-medium">{integer.format(summary.pending.chiefAccountant)}</dd></div>
          <div className="flex items-center justify-between gap-3"><dt>CFO</dt><dd className="tabular-nums font-medium">{integer.format(summary.pending.cfo)}</dd></div>
          <div className="flex items-center justify-between gap-3"><dt>Bổ sung / tạm giữ</dt><dd className="tabular-nums font-medium">{integer.format(summary.pending.onHold + summary.pending.paused + (summary.statusCounts.NEEDS_CONFIRMATION || 0))}</dd></div>
          {(summary.pending.received + summary.pending.evaluating + (summary.statusCounts.ROUTINE_PROPOSED || 0)) > 0 && <div className="flex items-center justify-between gap-3"><dt>Tiếp nhận / đang thẩm định</dt><dd className="tabular-nums font-medium">{integer.format(summary.pending.received + summary.pending.evaluating + (summary.statusCounts.ROUTINE_PROPOSED || 0))}</dd></div>}
          <div className="flex items-center justify-between gap-3 text-muted-foreground"><dt>Đã từ chối</dt><dd className="tabular-nums">{integer.format(summary.rejected)}</dd></div>
        </dl>
      </section>
    </div>}
    <p className="text-xs text-muted-foreground">Theo trạng thái hiện tại · cập nhật {new Intl.DateTimeFormat('vi-VN', {hour: '2-digit', minute: '2-digit', second: '2-digit'}).format(new Date(summary.generatedAt))}</p>
  </section>;
}
