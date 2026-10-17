'use client';
import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export type WorkspaceViewUser = { id: string; email: string; displayName: string; role: 'ACCOUNTANT' | 'CHIEF_ACCOUNTANT' | 'CFO' };
type Bucket = 'MACHINE_APPROVED' | 'HUMAN_APPROVED' | 'NEEDS_HUMAN' | 'ON_HOLD' | 'REJECTED' | 'ERROR' | 'PROCESSING';
type Check = { key: string; ok: boolean | null; label: string; detail: string };
type Highlight = { ruleId: string; ruleLabel: string; groupLabel: string; fieldLabels: string[]; reason: string };
type Explanation = { verdict: 'APPROVED' | 'STOPPED'; headline: string; plain: string; checks: Check[]; highlights: Highlight[]; vatAtStake: number; basisNote: string };
type Item = { position: number; invoiceId: string | null; fileName: string | null; error: string | null; bucket: Bucket; bucketLabel: string; invoiceNumber?: string; supplierName?: string; totalAmount?: number; taxAmount?: number; requiresCFO?: boolean; submitter?: { name: string; department: string | null } | null; explanation?: Explanation };
type Group = { key: string; label: string; invoiceIds: string[]; members: Array<{ invoiceId: string; invoiceNumber?: string; supplierName?: string; totalAmount?: number; revision: number; evaluationId: string | null }>; requiresCFO: boolean; questionItems: Array<{ n: number; text: string; answers: [string, string] }> };
type BatchRow = { id: string; label: string; source: string; status: 'OPEN' | 'SIGNED_OFF'; createdAt: string; signedOffAt: string | null; signoffNote: string | null; items?: number; approved?: number; waiting?: number };
type BatchDetail = { batch: BatchRow; items: Item[]; summary: Record<Bucket, number> & { total: number; vatApproved: number; vatPending: number; posted: number; awaitingPost: number; vatAwaitingPost: number }; groups: Group[]; canSignOff: boolean; signOffBlockers: string[] };
type Progress = { name: string; state: 'đang đọc' | 'đã đọc' | 'đang kiểm' | 'xong' | 'lỗi' | 'trùng'; note?: string };

const vnd = (n: number | undefined): string => `${new Intl.NumberFormat('vi-VN').format(Math.round(n ?? 0))}₫`;
const BUCKET_ORDER: Bucket[] = ['NEEDS_HUMAN', 'MACHINE_APPROVED', 'HUMAN_APPROVED', 'ON_HOLD', 'REJECTED', 'ERROR', 'PROCESSING'];
const BUCKET_TONE: Record<Bucket, 'success' | 'warning' | 'destructive' | 'secondary' | 'info'> = { MACHINE_APPROVED: 'success', HUMAN_APPROVED: 'info', NEEDS_HUMAN: 'warning', ON_HOLD: 'secondary', REJECTED: 'destructive', ERROR: 'destructive', PROCESSING: 'secondary' };
const SOURCE_LABEL: Record<string, string> = { UPLOAD: 'Tải lên', GMAIL: 'Gmail', ZALO: 'Zalo', MANUAL: 'Nhập tay' };

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Lỗi ${res.status}`);
  return data as T;
}

/** Lô hóa đơn: tải nhiều file → máy đọc và kiểm từng tờ theo thứ tự cố định → người duyệt nhóm và chốt lô. */
export function BatchesView({ user }: { user: WorkspaceViewUser }): ReactElement {
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<BatchDetail | null>(null);
  const [progress, setProgress] = useState<Progress[]>([]);
  const [running, setRunning] = useState(false);
  const loadList = useCallback(async () => {
    const res = await fetch('/api/batches', { cache: 'no-store' });
    if (res.ok) setBatches(((await res.json()) as { batches: BatchRow[] }).batches);
  }, []);
  const loadDetail = useCallback(async (id: string) => {
    const res = await fetch(`/api/batches/${encodeURIComponent(id)}`, { cache: 'no-store' });
    if (res.ok) setDetail(await res.json() as BatchDetail); else toast.error('Không tải được lô.');
  }, []);
  useEffect(() => { void loadList(); }, [loadList]);
  useEffect(() => { if (selected) void loadDetail(selected); }, [selected, loadDetail]);

  async function runBatch(files: File[]): Promise<void> {
    if (!files.length) return;
    setRunning(true);
    setProgress(files.map(f => ({ name: f.name, state: 'đang đọc' })));
    const mark = (i: number, state: Progress['state'], note?: string) => setProgress(p => p.map((x, k) => k === i ? { ...x, state, note } : x));
    try {
      const { batch } = await postJson<{ batch: BatchRow }>('/api/batches', { label: `Lô ${files.length} hóa đơn · ${new Date().toLocaleString('vi-VN')}`, source: 'UPLOAD' });
      // Bước 1: đọc hết mọi file (đúng đường đọc chứng từ của màn Tiếp nhận).
      const parsed: Array<{ index: number; sha: string; invoice?: Record<string, unknown>; uncertain: string[]; error?: string }> = [];
      for (const [index, file] of files.entries()) {
        const sha = await sha256Hex(file);
        try {
          const form = new FormData(); form.append('file', file);
          const res = await fetch('/api/documents/parse', { method: 'POST', body: form });
          const data = await res.json() as { error?: string; invoice?: Record<string, unknown>; documentType?: string; artifactId?: string; sourceHash?: string; uncertainFields?: string[] };
          if (!res.ok || data.documentType === 'NOT_INVOICE' || !data.invoice) throw new Error(data.error || 'Không phải hóa đơn hoặc không đọc được');
          const invoice = Object.fromEntries(Object.entries(data.invoice).filter(([, v]) => v !== undefined && v !== null && v !== ''));
          // File đọc được nhưng không có số hóa đơn lẫn số tiền (VD báo giá) thì không phải hóa đơn: không đưa vào máy kiểm.
          if (!invoice.invoiceNumber && !invoice.totalAmount) throw new Error('Không phải hóa đơn (không có số hóa đơn, số tiền)');
          parsed.push({ index, sha, invoice: { ...invoice, sourceArtifactId: data.artifactId, sourceHash: data.sourceHash }, uncertain: data.uncertainFields || [] });
          mark(index, 'đã đọc');
        } catch (error) {
          parsed.push({ index, sha, uncertain: [], error: error instanceof Error ? error.message : 'Lỗi đọc' });
          mark(index, 'lỗi', error instanceof Error ? error.message : undefined);
        }
      }
      // Bước 2: thứ tự cố định MST → ngày → số, để quy tắc cộng dồn trong ngày cho cùng kết quả dù file đến theo thứ tự nào.
      const key = (p: typeof parsed[number]) => [String(p.invoice?.supplierTaxCode ?? '~'), String(p.invoice?.invoiceDate ?? '~'), String(p.invoice?.invoiceNumber ?? '~')].join('|');
      parsed.sort((a, b) => key(a).localeCompare(key(b)) || a.index - b.index);
      // Bước 3: máy kiểm từng tờ, gắn vào lô.
      const seenSha = new Set<string>();
      for (const p of parsed) {
        const fileName = files[p.index].name;
        // File trùng nội dung trong cùng lượt: không đưa qua máy kiểm lần hai (tránh tạo hóa đơn trùng nằm ngoài lô).
        if (seenSha.has(p.sha)) { mark(p.index, 'trùng', 'cùng nội dung với file khác trong lô'); continue; }
        seenSha.add(p.sha);
        if (p.error || !p.invoice) { await postJson(`/api/batches/${batch.id}/items`, { fileName, fileSha256: p.sha, error: p.error ?? 'Không đọc được' }); continue; }
        mark(p.index, 'đang kiểm');
        try {
          const result = await postJson<{ decision: { invoiceId: string } }>('/api/evaluate', { invoice: { ...p.invoice, sourceUncertainFields: p.uncertain }, sourceUncertainFields: p.uncertain, demo: false });
          const attached = await postJson<{ duplicate: boolean }>(`/api/batches/${batch.id}/items`, { invoiceId: result.decision.invoiceId, fileName, fileSha256: p.sha });
          mark(p.index, attached.duplicate ? 'trùng' : 'xong');
        } catch (error) {
          await postJson(`/api/batches/${batch.id}/items`, { fileName, fileSha256: p.sha, error: error instanceof Error ? error.message : 'Lỗi kiểm' }).catch(() => undefined);
          mark(p.index, 'lỗi', error instanceof Error ? error.message : undefined);
        }
      }
      toast.success(`Đã xử lý lô ${files.length} file.`);
      await loadList(); setSelected(batch.id); await loadDetail(batch.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không xử lý được lô.');
    } finally { setRunning(false); }
  }

  return <div className="space-y-5">
    <section className="rounded-xl border bg-white p-4 space-y-3">
      <div><h2 className="text-base font-semibold">Tải nhiều hóa đơn một lần</h2>
        <p className="text-sm text-muted-foreground">Chọn XML, PDF hoặc ảnh. Máy đọc hết, xếp theo MST → ngày → số rồi kiểm từng tờ. Hóa đơn ổn được đề xuất duyệt; tờ nào có vấn đề thì hỏi đúng người. <strong>Chỉ khi Kế toán trưởng chốt lô thì mới ghi sổ.</strong></p></div>
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed px-4 py-3 text-sm font-medium hover:bg-slate-50">
        <input type="file" multiple accept=".xml,.pdf,.png,.jpg,.jpeg,.webp" className="sr-only" disabled={running} onChange={e => { const files = [...(e.target.files ?? [])]; e.target.value = ''; void runBatch(files); }} />
        {running ? 'Đang xử lý lô…' : 'Chọn các file hóa đơn'}
      </label>
      {progress.length > 0 && <ul className="max-h-48 overflow-y-auto text-xs space-y-1" aria-live="polite">{progress.map((p, i) => <li key={i} className="flex justify-between gap-3"><span className="truncate">{p.name}</span><span className={p.state === 'lỗi' ? 'text-rose-700' : p.state === 'xong' ? 'text-emerald-700' : 'text-slate-500'}>{p.state}{p.note ? ` — ${p.note}` : ''}</span></li>)}</ul>}
    </section>

    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <section className="rounded-xl border bg-white p-3 space-y-2" aria-label="Danh sách lô">
        <h2 className="px-1 text-sm font-semibold">Các lô gần đây</h2>
        {batches.length === 0 && <p className="px-1 text-sm text-muted-foreground">Chưa có lô nào.</p>}
        {batches.map(b => <button key={b.id} type="button" onClick={() => setSelected(b.id)} className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${selected === b.id ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:bg-slate-50'}`}>
          <div className="flex items-center justify-between gap-2"><span className="truncate font-medium">{b.label}</span><Badge variant={b.status === 'SIGNED_OFF' ? 'success' : 'warning'}>{b.status === 'SIGNED_OFF' ? 'Đã chốt' : 'Đang mở'}</Badge></div>
          <div className="mt-1 text-xs text-muted-foreground">{SOURCE_LABEL[b.source] ?? b.source} · {b.items ?? 0} hóa đơn · {b.waiting ?? 0} chờ người</div>
        </button>)}
      </section>
      {detail ? <BatchDetailView detail={detail} user={user} onChanged={async () => { await loadDetail(detail.batch.id); await loadList(); }} /> : <section className="rounded-xl border bg-white p-5 text-sm text-muted-foreground">Chọn một lô để xem kết quả.</section>}
    </div>
  </div>;
}

function BatchDetailView({ detail, user, onChanged }: { detail: BatchDetail; user: WorkspaceViewUser; onChanged: () => Promise<void> }): ReactElement {
  const { batch, summary, items, groups } = detail;
  const grouped = useMemo(() => BUCKET_ORDER.map(b => ({ bucket: b, rows: items.filter(i => i.bucket === b) })).filter(g => g.rows.length), [items]);
  const approver = user.role !== 'ACCOUNTANT';
  return <section className="space-y-4" aria-label={`Lô ${batch.label}`}>
    <div className="rounded-xl border bg-white p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-semibold">{batch.label}</h2>
        <Badge variant={batch.status === 'SIGNED_OFF' ? 'success' : 'warning'}>{batch.status === 'SIGNED_OFF' ? `Đã chốt ${batch.signedOffAt ? new Date(batch.signedOffAt).toLocaleString('vi-VN') : ''}` : 'Đang mở — chưa ghi sổ'}</Badge></div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-sm">
        <Stat label="Máy đề xuất duyệt" value={summary.MACHINE_APPROVED} tone="text-emerald-700" />
        <Stat label="Cần người quyết" value={summary.NEEDS_HUMAN} tone="text-amber-700" />
        <Stat label="Đã duyệt sau khi hỏi" value={summary.HUMAN_APPROVED} tone="text-blue-700" />
        <Stat label="Từ chối · tạm giữ · lỗi" value={summary.REJECTED + summary.ON_HOLD + summary.ERROR} tone="text-rose-700" />
      </div>
      <p className="text-sm">VAT đủ điều kiện khấu trừ: <strong>{vnd(summary.vatApproved)}</strong> · VAT đang chờ quyết định: <strong>{vnd(summary.vatPending)}</strong></p>
      {batch.signoffNote && <p className="text-xs text-muted-foreground">Ghi chú khi chốt: {batch.signoffNote}</p>}
    </div>

    {/* Lô đã chốt vẫn trả lời được hóa đơn còn chờ; duyệt xong thì chốt bổ sung mới vào sổ. */}
    {approver && groups.map(g => <GroupAnswerCard key={g.key} batchId={batch.id} group={g} user={user} onDone={onChanged} />)}

    {grouped.map(g => <div key={g.bucket} className="rounded-xl border bg-white">
      <h3 className="flex items-center gap-2 border-b px-4 py-2 text-sm font-semibold"><Badge variant={BUCKET_TONE[g.bucket]}>{g.rows[0].bucketLabel}</Badge><span className="text-muted-foreground">{g.rows.length}</span></h3>
      <ul className="divide-y">{g.rows.map(item => <ItemRow key={item.position} item={item} />)}</ul>
    </div>)}

    {approver && (batch.status === 'OPEN' || summary.awaitingPost > 0) && <SignOffPanel detail={detail} onDone={onChanged} />}
  </section>;
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }): ReactElement {
  return <div className="rounded-lg border px-3 py-2"><div className={`text-xl font-semibold ${tone}`}>{value}</div><div className="text-xs text-muted-foreground">{label}</div></div>;
}

function ItemRow({ item }: { item: Item }): ReactElement {
  const [open, setOpen] = useState(item.bucket === 'NEEDS_HUMAN');
  const e = item.explanation;
  return <li className="px-4 py-3 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <button type="button" className="min-w-0 text-left" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span className="font-medium">{item.invoiceNumber ? `HĐ ${item.invoiceNumber}` : item.fileName}</span>
        <span className="text-muted-foreground"> · {item.supplierName ?? item.error ?? ''}</span>
        {item.submitter && <span className="text-muted-foreground"> · gửi bởi {item.submitter.name}{item.submitter.department ? ` (${item.submitter.department})` : ''}</span>}
      </button>
      <span className="whitespace-nowrap">{item.totalAmount !== undefined ? `${vnd(item.totalAmount)} · VAT ${vnd(item.taxAmount)}` : ''}{item.requiresCFO ? ' · CFO' : ''}</span>
    </div>
    {open && e && <div className="mt-2 space-y-2 rounded-lg bg-slate-50 p-3">
      <p className="font-medium">{e.headline}</p>
      <p className="text-xs text-muted-foreground">{e.plain}</p>
      {e.highlights.length > 0 && <ul className="space-y-1">{e.highlights.map(h => <li key={h.ruleId} className="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-900"><strong>[{h.groupLabel}] {h.ruleLabel}</strong>{h.fieldLabels.length ? ` — trường: ${h.fieldLabels.join(', ')}` : ''}<br />{h.reason}</li>)}</ul>}
      <ul className="grid gap-1 sm:grid-cols-2">{e.checks.map(c => <li key={c.key} className="text-xs"><span aria-hidden="true" className={c.ok === true ? 'text-emerald-700' : c.ok === false ? 'text-rose-700' : 'text-slate-400'}>{c.ok === true ? '✓' : c.ok === false ? '✗' : '–'}</span> <strong>{c.label}:</strong> {c.detail}</li>)}</ul>
      <p className="text-[11px] text-muted-foreground">{e.basisNote}</p>
      {item.invoiceId && <Link href={`/workspace/invoices/${encodeURIComponent(item.invoiceId)}`} className="text-xs font-medium underline">Mở hồ sơ, xem chứng từ và trả lời riêng</Link>}
    </div>}
  </li>;
}

function GroupAnswerCard({ batchId, group, user, onDone }: { batchId: string; group: Group; user: WorkspaceViewUser; onDone: () => Promise<void> }): ReactElement {
  const [answers, setAnswers] = useState<Record<string, 'A' | 'B'>>({});
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const cfoOnly = group.requiresCFO && user.role !== 'CFO';
  const ready = group.questionItems.every(q => answers[String(q.n)]) && reason.trim().length >= 8 && !cfoOnly;
  async function submit(): Promise<void> {
    setBusy(true);
    try {
      const members = group.members.map(m => ({ invoiceId: m.invoiceId, revision: m.revision, evaluationId: m.evaluationId }));
      const { results } = await postJson<{ results: Array<{ invoiceId: string; ok: boolean; error?: string }> }>(`/api/batches/${batchId}/answer`, { invoiceIds: group.invoiceIds, answers, reason, members });
      const failed = results.filter(r => !r.ok);
      if (failed.length) toast.warning(`${results.length - failed.length}/${results.length} hóa đơn đã xử lý; ${failed.length} bị chặn: ${failed[0].error}`); else toast.success(`Đã trả lời chung cho ${results.length} hóa đơn.`);
      await onDone();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Không gửi được.'); } finally { setBusy(false); }
  }
  return <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-3 text-sm">
    <p className="font-semibold">Trả lời chung {group.invoiceIds.length} hóa đơn cùng câu hỏi: {group.label}</p>
    <p className="text-xs text-muted-foreground">Mỗi hóa đơn vẫn được kiểm quyền riêng và ghi nhật ký riêng. Hóa đơn nào không hợp lệ hoặc vừa bị sửa sẽ bị chặn, không ảnh hưởng hóa đơn khác.</p>
    <ul className="space-y-0.5 text-xs" aria-label="Hóa đơn trong nhóm">{group.members.map(m => <li key={m.invoiceId}>HĐ {m.invoiceNumber ?? m.invoiceId} · {m.supplierName ?? ''}{m.totalAmount !== undefined ? ` · ${vnd(m.totalAmount)}` : ''}</li>)}</ul>
    {cfoOnly && <p className="text-xs font-medium text-rose-800">Nhóm này có hóa đơn cần CFO trả lời.</p>}
    {group.questionItems.map(q => <fieldset key={q.n} className="space-y-1"><legend className="text-xs">{q.n}. {q.text}</legend>
      <div className="flex flex-wrap gap-2">{(['A', 'B'] as const).map((letter, k) => <label key={letter} className={`cursor-pointer rounded border px-2 py-1 text-xs ${answers[String(q.n)] === letter ? 'border-slate-900 bg-white' : 'border-slate-300'}`}>
        <input type="radio" className="sr-only" name={`${group.key}-${q.n}`} checked={answers[String(q.n)] === letter} onChange={() => setAnswers(a => ({ ...a, [String(q.n)]: letter }))} />{letter}: {q.answers[k]}</label>)}</div></fieldset>)}
    <input className="w-full rounded border px-2 py-1 text-xs" placeholder="Lý do (ít nhất 8 ký tự)" value={reason} onChange={e => setReason(e.target.value)} />
    <Button size="sm" disabled={!ready || busy} onClick={() => void submit()}>{busy ? 'Đang gửi…' : `Áp dụng cho ${group.invoiceIds.length} hóa đơn`}</Button>
  </div>;
}

function SignOffPanel({ detail, onDone }: { detail: BatchDetail; onDone: () => Promise<void> }): ReactElement {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const eligible = detail.summary.awaitingPost;
  const supplement = detail.batch.status === 'SIGNED_OFF';
  const waiting = detail.summary.NEEDS_HUMAN + detail.summary.ON_HOLD;
  async function submit(): Promise<void> {
    if (!window.confirm(`${supplement ? 'Chốt bổ sung' : 'Chốt'} ${eligible} hóa đơn, ghi sổ VAT ${vnd(detail.summary.vatAwaitingPost)}. ${waiting} hóa đơn còn chờ hoặc tạm giữ KHÔNG được ghi sổ; nếu được duyệt sau thì cần chốt bổ sung. Tiếp tục?`)) return;
    setBusy(true);
    try { const r = await postJson<{ postedInvoices: number }>(`/api/batches/${detail.batch.id}/signoff`, { note }); toast.success(`${supplement ? 'Đã chốt bổ sung' : 'Đã chốt lô'}: ghi sổ ${r.postedInvoices} hóa đơn.`); await onDone(); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Không chốt được lô.'); } finally { setBusy(false); }
  }
  return <div className="rounded-xl border bg-white p-4 space-y-2 text-sm">
    <p className="font-semibold">{supplement ? `Chốt bổ sung — ${eligible} hóa đơn được duyệt sau khi chốt lô` : 'Chốt lô (người ký trước khi ghi sổ)'}</p>
    {detail.signOffBlockers.length > 0
      ? <ul className="list-disc pl-5 text-xs text-rose-800">{detail.signOffBlockers.map(b => <li key={b}>{b}</li>)}</ul>
      : <>
        <p className="text-xs text-muted-foreground">Máy đã kiểm từng hóa đơn và đề xuất. Anh/chị xem tổng hợp, mở vài phiếu giải trình bất kỳ rồi ký chốt. Hóa đơn còn chờ người quyết hoặc tạm giữ không bị ghi sổ.</p>
        <input className="w-full rounded border px-2 py-1 text-xs" placeholder="Ghi chú khi chốt (ít nhất 8 ký tự)" value={note} onChange={e => setNote(e.target.value)} />
        <Button size="sm" disabled={note.trim().length < 8 || busy} onClick={() => void submit()}>{busy ? 'Đang chốt…' : `${supplement ? 'Chốt bổ sung' : 'Chốt'} ${eligible} hóa đơn`}</Button>
      </>}
  </div>;
}
