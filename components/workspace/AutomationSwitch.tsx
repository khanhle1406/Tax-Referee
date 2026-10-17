'use client';
import { useEffect, useState, type ReactElement } from 'react';
import { PauseCircle, PlayCircle } from 'lucide-react';
import { toast } from 'sonner';

/** Công tắc dừng tự động hóa toàn hệ thống (KTT/CFO). Mọi lần bật/tắt được ghi audit kèm lý do. */
export function AutomationSwitch({ canControl }: { canControl: boolean }): ReactElement | null {
  const [paused, setPaused] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/system/automation', { signal: controller.signal, cache: 'no-store' })
      .then(r => r.ok ? r.json() : null).then(data => { if (data) setPaused(Boolean(data.paused)); }).catch(() => {});
    return () => controller.abort();
  }, []);
  if (paused === null) return null;
  async function toggle(): Promise<void> {
    if (!canControl) { toast.info('Chỉ Kế toán trưởng hoặc CFO được dừng/bật lại tự động hóa.'); return; }
    const reason = window.prompt(paused ? 'Lý do bật lại tự động hóa (ít nhất 8 ký tự):' : 'Lý do dừng tự động hóa toàn hệ thống (ít nhất 8 ký tự):');
    if (!reason) return;
    setBusy(true);
    try {
      const response = await fetch('/api/system/automation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paused: !paused, reason }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Không thể cập nhật');
      setPaused(Boolean(data.paused));
      toast.success(data.paused ? 'Đã dừng tự động hóa: ca thường quy sẽ chờ duyệt tay. Đã ghi nhật ký.' : 'Đã bật lại tự động hóa. Đã ghi nhật ký.');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Không thể cập nhật'); } finally { setBusy(false); }
  }
  return <button type="button" disabled={busy} onClick={() => void toggle()} title={paused ? 'Tự động duyệt đang dừng. Bấm để bật lại.' : 'Tự động duyệt đang bật. Bấm để dừng.'} aria-label={paused ? 'Tự động duyệt đang dừng' : 'Tự động duyệt đang bật'}
    className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[10px] border px-2.5 py-1.5 text-xs font-medium ${paused ? 'border-rose-300 bg-rose-50 text-rose-800' : 'border-emerald-300 bg-emerald-50 text-emerald-800'}`}>
    {paused ? <PauseCircle className="h-3.5 w-3.5" /> : <PlayCircle className="h-3.5 w-3.5" />}
    {paused ? 'Đã dừng' : 'Tự duyệt'}
  </button>;
}
