'use client';
import type {ReactElement} from 'react';
import {Loader2, RotateCcw, Square, X} from 'lucide-react';
import {Button} from '@/components/ui/button';

export type ReceptionBatchStatus = 'QUEUED' | 'PROCESSING' | 'READY' | 'ERROR' | 'CANCELLED';
export interface ReceptionBatchItem {id: string; file: File; status: ReceptionBatchStatus; error?: string; evaluated?: boolean}
const labels: Record<ReceptionBatchStatus, string> = {QUEUED: 'Chờ đọc', PROCESSING: 'Đang đọc', READY: 'Đã đọc', ERROR: 'Lỗi', CANCELLED: 'Đã dừng'};
interface Props {
  items: ReceptionBatchItem[]; activeId: string | null; evaluating: boolean;
  onSelect: (id: string) => void; onRetry: () => void; onStop: () => void; onClose: () => void;
}
export function ReceptionBatchQueue({items, activeId, evaluating, onSelect, onRetry, onStop, onClose}: Props): ReactElement {
  const running = items.some(item => item.status === 'QUEUED' || item.status === 'PROCESSING');
  const completed = items.filter(item => item.status === 'READY').length;
  const failed = items.filter(item => item.status === 'ERROR' || item.status === 'CANCELLED').length;
  const active = items.find(item => item.id === activeId);
  return <section aria-label="Lô chứng từ" className="shrink-0 rounded-xl border bg-card px-3 py-2.5">
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor="batch-document" className="sr-only text-xs font-medium sm:not-sr-only">Lô chứng từ</label>
      <select id="batch-document" value={activeId || ''} disabled={evaluating} onChange={event => onSelect(event.target.value)} className="w-full min-w-0 rounded-[10px] border bg-card px-2 py-2 text-sm sm:w-auto sm:flex-1 sm:max-w-md">
        {items.map((item, index) => <option key={item.id} value={item.id}>{index + 1}. {item.file.name} · {item.evaluated ? 'Đã thẩm định' : labels[item.status]}</option>)}
      </select>
      <span role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">{running && <Loader2 className="h-3.5 w-3.5 animate-spin"/>}{completed}/{items.length} đã đọc{failed > 0 ? ` · ${failed} chưa đọc` : ''}</span>
      {running ? <Button type="button" size="sm" variant="ghost" onClick={onStop} className="gap-1"><Square className="h-3 w-3"/>Dừng</Button> : failed > 0 && <Button type="button" size="sm" variant="ghost" onClick={onRetry} className="gap-1"><RotateCcw className="h-3.5 w-3.5"/>Thử lại</Button>}
      <Button type="button" size="icon" variant="ghost" disabled={evaluating} aria-label="Đóng lô chứng từ" onClick={onClose}><X className="h-4 w-4"/></Button>
    </div>
    {active?.error && <p className="sr-only" role="status">{active.error}</p>}
  </section>;
}
