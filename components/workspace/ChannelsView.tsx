'use client';
import { useCallback, useEffect, useState, type FormEvent, type ReactElement } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export type WorkspaceViewUser = { id: string; email: string; displayName: string; role: 'ACCOUNTANT' | 'CHIEF_ACCOUNTANT' | 'CFO' };
type ChannelName = 'GMAIL' | 'ZALO';
type ChannelState = { configured: boolean; simulated?: boolean; lastPullAt: string | null; counts: Record<string, number> };
type Message = {
  id: string; channel: ChannelName; senderAddress: string | null; senderName: string | null; senderStaffName: string | null;
  senderKind: 'VERIFIED' | 'SPOOF_SUSPECT' | 'UNKNOWN'; senderStaffId: string | null; fileName: string | null; receivedAt: string; status: string; batchId: string | null; note: string | null;
};
type Staff = { id: string; fullName: string; department: string | null; title: string | null; email: string | null; zaloUserId: string | null };
type Notice = { id: string; channel: string; recipient: string | null; kind: string; body: string; status: string; createdAt: string };

const STATUS_LABEL: Record<string, { text: string; variant: 'success' | 'warning' | 'info' | 'destructive' | 'secondary' }> = {
  PROCESSED: { text: 'Máy đã kiểm, đã vào lô', variant: 'success' },
  QUEUED: { text: 'Ảnh/PDF đã lưu — chưa tự đọc', variant: 'info' },
  NEEDS_SENDER_REVIEW: { text: 'Chờ xác nhận người gửi', variant: 'warning' },
  REJECTED: { text: 'Không nhận (xem lý do)', variant: 'destructive' },
  ERROR: { text: 'Không đọc được file', variant: 'destructive' },
  NEW: { text: 'Đang xử lý', variant: 'secondary' },
};
const NOTICE_LABEL: Record<string, string> = { SENT: 'Đã gửi', FAILED: 'Gửi lỗi', SKIPPED_NOT_CONFIGURED: 'Chưa cấu hình kênh gửi', SIMULATED: 'Mô phỏng — không gửi thật' };
const CHANNEL_NAME: Record<ChannelName, string> = { GMAIL: 'Gmail', ZALO: 'Zalo' };
const time = (iso: string | null) => (iso ? new Date(iso).toLocaleString('vi-VN') : 'chưa lấy lần nào');

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((body as { error?: string }).error || 'Có lỗi khi gọi máy chủ');
  return body as T;
}

function SenderBadge({ m }: { m: Message }): ReactElement {
  if (m.senderKind === 'VERIFIED') return <Badge variant="success">✓ Nhân viên đã xác thực{m.senderStaffName ? ` · ${m.senderStaffName}` : ''}</Badge>;
  if (m.senderStaffId) return <Badge variant="info">Đã xác nhận thủ công · {m.senderStaffName}</Badge>;
  if (m.senderKind === 'SPOOF_SUSPECT') return <Badge variant="destructive">⚠ Nghi mạo danh</Badge>;
  return <Badge variant="warning">? Ngoài danh bạ</Badge>;
}

/** Hộp thư vào: nhận hóa đơn thật từ Gmail / Zalo, chống mạo danh người gửi, danh bạ người gửi, tin đã gửi. */
export function ChannelsView({ user }: { user: WorkspaceViewUser }): ReactElement {
  const [channels, setChannels] = useState<Record<ChannelName, ChannelState> | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [busy, setBusy] = useState<ChannelName | null>(null);
  const [autoPoll, setAutoPoll] = useState(false);
  const [assignTo, setAssignTo] = useState<Record<string, string>>({});
  const manager = user.role === 'CHIEF_ACCOUNTANT' || user.role === 'CFO';

  const load = useCallback(async () => {
    try {
      const [status, list, people] = await Promise.all([
        api<{ channels: Record<ChannelName, ChannelState> }>('/api/channels/status'),
        api<{ messages: Message[] }>('/api/channels/messages'),
        api<{ staff: Staff[] }>('/api/staff'),
      ]);
      setChannels(status.channels); setMessages(list.messages); setStaff(people.staff);
      const sent = await api<{ notifications: Notice[] }>('/api/channels/notifications').catch(() => ({ notifications: [] as Notice[] }));
      setNotices(sent.notifications);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Không tải được hộp thư vào'); }
  }, []);

  const pull = useCallback(async (channel: ChannelName, quiet = false) => {
    setBusy(channel);
    try {
      const r = await api<{ files: number; duplicates: number; batchId: string | null; counts: Record<string, number> }>('/api/channels/pull', { method: 'POST', body: JSON.stringify({ channel }) });
      if (!quiet || r.files > 0) toast.success(`${CHANNEL_NAME[channel]}: nhận ${r.files} file mới · ${r.counts.PROCESSED ?? 0} đã kiểm · ${r.counts.NEEDS_SENDER_REVIEW ?? 0} chờ xác nhận người gửi${r.batchId ? ` · lô ${r.batchId}` : ''}`);
      await load();
    } catch (error) { if (!quiet) toast.error(error instanceof Error ? error.message : 'Không lấy được hóa đơn'); }
    finally { setBusy(null); }
  }, [load]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!autoPoll) return;
    const timer = window.setInterval(() => {
      if (user.role !== 'ACCOUNTANT') return;
      if (channels?.GMAIL.configured) void pull('GMAIL', true);
      if (channels?.ZALO.configured) void pull('ZALO', true);
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [autoPoll, channels, pull, user.role]);

  async function assign(id: string) {
    const staffId = assignTo[id];
    if (!staffId) { toast.error('Chọn nhân viên trước'); return; }
    try { await api(`/api/channels/messages/${encodeURIComponent(id)}/assign`, { method: 'POST', body: JSON.stringify({ staffId }) }); toast.success('Đã xác nhận người gửi'); await load(); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Không xác nhận được'); }
  }

  async function addPerson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (k: string) => String(form.get(k) ?? '').trim();
    try {
      await api('/api/staff', { method: 'POST', body: JSON.stringify({ fullName: value('fullName'), department: value('department') || null, title: value('title') || null, email: value('email') || null, zaloUserId: value('zaloUserId') || null }) });
      toast.success('Đã thêm vào danh bạ người gửi'); (event.target as HTMLFormElement).reset(); await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Không thêm được'); }
  }

  return (
    <section className="space-y-5" aria-label="Hộp thư vào" data-user-role={user.role}>
      <div className="grid gap-3 sm:grid-cols-2">
        {(['GMAIL', 'ZALO'] as ChannelName[]).map(channel => {
          const state = channels?.[channel];
          return (
            <div key={channel} className="rounded-xl border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-semibold">{CHANNEL_NAME[channel]}</h3>
                <Badge variant={state?.simulated ? 'info' : state?.configured ? 'success' : 'secondary'}>{state?.simulated ? 'Mô phỏng · dữ liệu mẫu' : state?.configured ? 'Đã kết nối' : 'Chưa cấu hình'}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Lần lấy gần nhất: {time(state?.lastPullAt ?? null)}</p>
              {state?.simulated ? <p className="mt-1 text-xs text-muted-foreground">Phiên demo: {channel === 'GMAIL' ? 'hộp thư' : 'bot Zalo'} giả với hóa đơn mẫu, chạy đúng quy trình nhận diện người gửi và kiểm như kênh thật; không gọi mạng, không gửi tin thật.</p> : null}
              {user.role !== 'ACCOUNTANT' && <p className="mt-1 text-xs text-muted-foreground">Kế toán viên (người nhập) lấy thư; Kế toán trưởng/CFO xác nhận người gửi và duyệt.</p>}
              <Button className="mt-3 w-full sm:w-auto" disabled={user.role !== 'ACCOUNTANT' || !(state?.configured || state?.simulated) || busy !== null} onClick={() => void pull(channel)}>
                {busy === channel ? 'Đang lấy…' : `Lấy hóa đơn từ ${CHANNEL_NAME[channel]}`}
              </Button>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={autoPoll} onChange={e => setAutoPoll(e.target.checked)} /> Tự kiểm tra mỗi 60 giây (khi trang đang mở)</label>
        <Link href="/workspace/batches" className="text-primary underline">Mở Lô hóa đơn</Link>
      </div>
      <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
        Chống mạo danh: chỉ hóa đơn từ nhân viên có trong danh bạ, gửi từ email đã qua kiểm tra chữ ký của Gmail (SPF/DKIM) hoặc từ đúng tài khoản Zalo đã đăng ký, mới được máy kiểm. Thư lạ hoặc thư giả địa chỉ nhân viên phải chờ Kế toán trưởng xác nhận người gửi.
      </p>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr><th className="p-2">File</th><th className="p-2">Người gửi</th><th className="p-2">Trạng thái</th><th className="p-2">Lô</th></tr>
          </thead>
          <tbody>
            {messages.length === 0 && <tr><td colSpan={4} className="p-4 text-center text-muted-foreground">Chưa nhận file nào.</td></tr>}
            {messages.map(m => {
              const label = STATUS_LABEL[m.status] ?? STATUS_LABEL.NEW;
              return (
                <tr key={m.id} className="border-t align-top">
                  <td className="p-2"><div className="font-medium break-all">{m.fileName}</div><div className="text-xs text-muted-foreground">{CHANNEL_NAME[m.channel]} · {time(m.receivedAt)}</div></td>
                  <td className="p-2"><SenderBadge m={m} /><div className="mt-1 text-xs text-muted-foreground break-all">{m.senderName ? `${m.senderName} · ` : ''}{m.senderAddress}</div></td>
                  <td className="p-2">
                    <Badge variant={label.variant}>{label.text}</Badge>
                    {m.note && <div className="mt-1 text-xs text-muted-foreground">{m.note}</div>}
                    {m.status === 'NEEDS_SENDER_REVIEW' && manager && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <select aria-label="Chọn nhân viên" className="rounded border px-2 py-1 text-xs" value={assignTo[m.id] ?? ''} onChange={e => setAssignTo(s => ({ ...s, [m.id]: e.target.value }))}>
                          <option value="">Là nhân viên…</option>
                          {staff.map(s => <option key={s.id} value={s.id}>{s.fullName}</option>)}
                        </select>
                        <Button size="sm" variant="outline" onClick={() => void assign(m.id)}>Xác nhận và xử lý</Button>
                      </div>
                    )}
                  </td>
                  <td className="p-2 text-xs">{m.batchId ? <Link href="/workspace/batches" className="text-primary underline">{m.batchId}</Link> : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {notices.length > 0 && (
        <div className="rounded-xl border p-4">
          <h3 className="text-sm font-semibold">Tin đã gửi</h3>
          <ul className="mt-2 space-y-2 text-xs">
            {notices.map(n => <li key={n.id} className="flex flex-wrap gap-2"><Badge variant={n.status === 'SENT' ? 'success' : n.status === 'FAILED' ? 'destructive' : 'secondary'}>{NOTICE_LABEL[n.status] ?? n.status}</Badge><span>{n.channel} → {n.recipient ?? '—'}</span><span className="text-muted-foreground">{n.body}</span></li>)}
          </ul>
        </div>
      )}

      <div className="rounded-xl border p-4">
        <h3 className="text-sm font-semibold">Danh bạ người gửi</h3>
        <ul className="mt-2 space-y-1 text-xs">
          {staff.map(s => <li key={s.id} className="break-all"><span className="font-medium">{s.fullName}</span> · {s.department ?? '—'}{s.email ? ` · ${s.email}` : ''}{s.zaloUserId ? ` · Zalo ${s.zaloUserId}` : ''}</li>)}
        </ul>
        {manager ? (
          <form onSubmit={e => void addPerson(e)} className="mt-3 grid gap-2 sm:grid-cols-2">
            <input name="fullName" required minLength={2} placeholder="Họ tên" className="rounded border px-2 py-1 text-sm" />
            <input name="department" placeholder="Phòng ban" className="rounded border px-2 py-1 text-sm" />
            <input name="title" placeholder="Chức danh" className="rounded border px-2 py-1 text-sm" />
            <input name="email" type="email" placeholder="Email (nếu gửi qua Gmail)" className="rounded border px-2 py-1 text-sm" />
            <input name="zaloUserId" placeholder="Zalo user id (nếu gửi qua Zalo)" className="rounded border px-2 py-1 text-sm" />
            <Button type="submit" size="sm">Thêm vào danh bạ</Button>
          </form>
        ) : <p className="mt-2 text-xs text-muted-foreground">Chỉ Kế toán trưởng hoặc CFO được thêm người vào danh bạ.</p>}
      </div>
    </section>
  );
}
