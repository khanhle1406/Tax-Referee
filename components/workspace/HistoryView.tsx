'use client';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactElement } from 'react';
import Link from 'next/link';
import type { HistoryAction, HistorySubmission, MyHistory } from '@/services/historyService';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { formatVND, formatDate } from '@/lib/utils';
import { ScreenState, WorkspaceSkeleton } from './ScreenState';

export type WorkspaceViewUser = { id: string; email: string; displayName: string; role: 'ACCOUNTANT' | 'CHIEF_ACCOUNTANT' | 'CFO' };

type Tab = 'actions' | 'submissions';
type LoadState = { kind: 'loading' } | { kind: 'ready'; data: MyHistory } | { kind: 'error'; status: number; message: string };
const TABS: Array<{ id: Tab; label: string }> = [{ id: 'actions', label: 'Tôi đã làm' }, { id: 'submissions', label: 'Hóa đơn tôi gửi' }];

const when = (iso: string): string => new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso));
const href = (id: string): string => '/workspace/invoices/' + encodeURIComponent(id);
function variant(status: string | null, taxHold = false): BadgeProps['variant'] {
  if (taxHold) return 'warning';
  if (status === 'APPROVED') return 'success';
  if (status === 'REJECTED') return 'destructive';
  if (status && (status.startsWith('WAITING_') || status === 'FORWARDED' || status === 'NEEDS_CONFIRMATION')) return 'info';
  if (status === 'ON_HOLD' || status === 'PAUSED') return 'warning';
  return 'secondary';
}

function ActionRow({ a }: { a: HistoryAction }): ReactElement {
  const body = <>
    <div className="min-w-0">
      <p className="text-sm font-medium">{a.label}</p>
      <p className="mt-1 text-xs text-muted-foreground">{when(a.at)}{a.invoiceNumber ? ` · Số ${a.invoiceNumber}` : ''}{a.supplierName ? ` · ${a.supplierName}` : ''}</p>
      {a.reason && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">Lý do: {a.reason}</p>}
    </div>
    <div className="text-right">
      {a.totalAmount !== null && <p className="text-sm font-medium font-numeric">{formatVND(a.totalAmount)}</p>}
      {a.resultingStatusLabel && <Badge variant={variant(a.resultingStatus)} className="mt-1">{a.resultingStatusLabel}</Badge>}
    </div>
  </>;
  const cls = 'grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b px-4 py-3 last:border-b-0';
  return a.invoiceId ? <li><Link href={href(a.invoiceId)} className={cls + ' hover:bg-muted/60'} aria-label={`${a.label} — mở hóa đơn ${a.invoiceNumber ?? ''}`}>{body}</Link></li> : <li className={cls}>{body}</li>;
}
function SubmissionRow({ s }: { s: HistorySubmission }): ReactElement {
  return <li><Link href={href(s.invoiceId)} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b px-4 py-3 last:border-b-0 hover:bg-muted/60" aria-label={`Mở hóa đơn ${s.invoiceNumber}`}>
    <div className="min-w-0">
      <p className="text-sm font-medium">Số {s.invoiceNumber}</p>
      <p className="mt-1 truncate text-xs text-muted-foreground">{s.supplierName} · lập {formatDate(s.invoiceDate)} · gửi {when(s.createdAt)}</p>
      <p className="mt-1 text-xs text-muted-foreground">VAT {formatVND(s.taxAmount)}{s.status === 'APPROVED' ? ` · được khấu trừ ${formatVND(s.approvedTax)}` : ''}</p>
    </div>
    <div className="text-right">
      <p className="text-sm font-medium font-numeric">{formatVND(s.totalAmount)}</p>
      <Badge variant={variant(s.status, s.taxHold)} className="mt-1">{s.taxHold ? 'Đang giữ thuế' : s.statusLabel}</Badge>
    </div>
  </Link></li>;
}

/** Lịch sử của tôi: việc tôi đã làm và hóa đơn tôi đã gửi — chỉ của chính người đang đăng nhập. */
export function HistoryView({ user }: { user: WorkspaceViewUser }): ReactElement {
  const [tab, setTab] = useState<Tab>(user.role === 'ACCOUNTANT' ? 'submissions' : 'actions');
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const load = useCallback(async (signal?: AbortSignal): Promise<void> => {
    setState({ kind: 'loading' });
    try {
      const response = await fetch('/api/history?limit=100', { cache: 'no-store', signal });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setState({ kind: 'error', status: response.status, message: body.error || 'Không thể tải lịch sử.' }); return; }
      setState({ kind: 'ready', data: body.history as MyHistory });
    } catch (cause) { if (!signal?.aborted) setState({ kind: 'error', status: 0, message: cause instanceof Error ? cause.message : 'Không thể tải lịch sử.' }); }
  }, []);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load, user.id]);

  if (state.kind === 'loading') return <WorkspaceSkeleton />;
  if (state.kind === 'error') {
    if (state.status === 401) return <section className="screen-state" role="alert"><h2 className="text-base font-semibold">Phiên đăng nhập đã hết</h2><p className="text-sm text-muted-foreground">Đăng nhập lại để xem lịch sử.</p><Link href="/" className="text-sm underline underline-offset-4">Về trang đăng nhập</Link></section>;
    return <ScreenState error title="Không tải được lịch sử" description={state.message} onRetry={() => void load()} />;
  }
  const d = state.data;
  const count = (id: Tab): number => (id === 'actions' ? d.totals.actions : d.totals.submissions);
  const onKey = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const next = (index + (event.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length;
    setTab(TABS[next].id); tabRefs.current[next]?.focus();
  };
  const rows = tab === 'actions' ? d.actions : d.submissions;
  const shown = rows.length, total = count(tab);

  return <div className="space-y-4">
    <div><h1 className="text-2xl font-semibold">Lịch sử của tôi</h1><p className="text-sm text-muted-foreground">Chỉ hiện việc của {user.displayName}. Bấm một dòng để mở hóa đơn.</p></div>
    <div role="tablist" aria-label="Lịch sử của tôi" className="flex gap-1 rounded-xl border bg-muted/40 p-1">
      {TABS.map((t, i) => <button key={t.id} ref={el => { tabRefs.current[i] = el; }} type="button" role="tab" id={`history-tab-${t.id}`} aria-controls={`history-panel-${t.id}`} aria-selected={tab === t.id} tabIndex={tab === t.id ? 0 : -1}
        onClick={() => setTab(t.id)} onKeyDown={event => onKey(event, i)}
        className={`min-h-11 flex-1 rounded-lg px-3 text-sm font-medium sm:min-h-9 ${tab === t.id ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
        {t.label} <span className="font-numeric text-muted-foreground">({count(t.id)})</span>
      </button>)}
    </div>
    <section role="tabpanel" id={`history-panel-${tab}`} aria-labelledby={`history-tab-${tab}`}>
      {shown === 0
        ? <ScreenState title={tab === 'actions' ? 'Bạn chưa thao tác hồ sơ nào' : 'Bạn chưa gửi hóa đơn nào'} description={tab === 'actions' ? 'Khi bạn duyệt, trả lời câu hỏi hay giữ thuế, việc đó sẽ hiện ở đây.' : 'Bấm Tiếp nhận để gửi hóa đơn đầu tiên.'} />
        : <>
          <ul className="overflow-hidden rounded-2xl border bg-card">{tab === 'actions' ? d.actions.map(a => <ActionRow key={a.eventId} a={a} />) : d.submissions.map(s => <SubmissionRow key={s.invoiceId} s={s} />)}</ul>
          {total > shown && <p className="mt-2 text-xs text-muted-foreground">Đang hiện {shown} mục gần nhất trên tổng {total}.</p>}
        </>}
    </section>
  </div>;
}
