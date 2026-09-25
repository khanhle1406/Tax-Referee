'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FileText,
  Inbox,
  LogOut,
  RefreshCw,
  Settings2,
  ShieldCheck,
  UserRound,
  XCircle,
  Eye,
  FileCheck,
  BookmarkCheck,
  Copy,
  Columns2,
  Check,
  CheckSquare,
  Square
} from 'lucide-react';
import { InteractiveInputForm } from '@/components/InteractiveInputForm';
import { PolicyViewerModal } from '@/components/PolicyViewerModal';
import { DocumentViewer } from '@/components/DocumentViewer';
import { InboxFilterToolbar, InboxFilterState, DEFAULT_FILTER_STATE } from '@/components/InboxFilterToolbar';
import { ActionOption, InvoiceInput, MacroState, RefereeDecision, SystemPolicyConfig } from '@/lib/schemas';
import { DEFAULT_POLICY_CONFIG, MACRO_DEFAULTS } from '@/lib/constants';
import { formatVND } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';

type AppUser = { id: string; email: string; displayName: string; role: 'ACCOUNTANT' | 'CHIEF_ACCOUNTANT' | 'CFO' };
type View = 'inbox' | 'receive' | 'approval' | 'dossier' | 'reports';
type InboxItem = {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  supplierTaxCode: string;
  supplierName: string;
  itemName: string;
  totalAmount: number;
  taxAmount: number;
  status: string;
  invoice: InvoiceInput;
  decision: RefereeDecision | null;
  evaluationId: string | null;
  policyVersion: string | null;
  legalVersion: string | null;
  updatedAt: string;
  resolution: { role: string; option: string; action: string; accepted: boolean; resolvedAt: string } | null;
};
type DuplicateGroup = { supplierTaxCode: string; invoiceNumber: string; count: number; invoiceIds: string };

const roleLabels: Record<AppUser['role'], string> = {
  ACCOUNTANT: 'Kế toán viên',
  CHIEF_ACCOUNTANT: 'Kế toán trưởng',
  CFO: 'CFO'
};

const statusLabels: Record<string, string> = {
  RECEIVED: 'Mới tiếp nhận',
  NEEDS_CONFIRMATION: 'Cần xác nhận',
  ROUTINE_PROPOSED: 'Đề xuất Routine',
  WAITING_CHIEF_ACCOUNTANT: 'Chờ Kế toán trưởng',
  WAITING_CFO: 'Chờ CFO',
  APPROVED: 'Đã chấp thuận',
  REJECTED: 'Đã từ chối',
  ON_HOLD: 'Tạm dừng'
};

const roleCanApprove = (user: AppUser, item: InboxItem) => {
  if (item.status === 'WAITING_CFO') return user.role === 'CFO';
  if (item.status === 'WAITING_CHIEF_ACCOUNTANT') return user.role === 'CHIEF_ACCOUNTANT';
  return false;
};

function statusStyle(status: string): string {
  if (status === 'APPROVED') return 'bg-emerald-100 text-emerald-800';
  if (status === 'REJECTED') return 'bg-rose-100 text-rose-800';
  if (status === 'WAITING_CFO') return 'bg-violet-100 text-violet-800';
  if (status === 'WAITING_CHIEF_ACCOUNTANT') return 'bg-amber-100 text-amber-800';
  if (status === 'ROUTINE_PROPOSED') return 'bg-sky-100 text-sky-800';
  return 'bg-slate-100 text-slate-700';
}

function formatDate(value: string): string {
  try { return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium' }).format(new Date(value)); } catch { return value; }
}

function removeAccents(str: string): string {
  return (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function ProductionWorkspace({
  user,
  onLogout,
  onRoleSwitched
}: {
  user: AppUser;
  onLogout: () => void;
  onRoleSwitched?: (nextUser: AppUser) => void;
}) {
  const [view, setView] = useState<View>('inbox');
  const [items, setItems] = useState<InboxItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<InboxItem | null>(null);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [policyVersion, setPolicyVersion] = useState('TAX-SOP-2026-v2.5');
  const [config, setConfig] = useState<SystemPolicyConfig>(DEFAULT_POLICY_CONFIG);
  const [macro, setMacro] = useState<MacroState>({
    totalSales: MACRO_DEFAULTS.TOTAL_SALES,
    openingInventory: MACRO_DEFAULTS.OPENING_INVENTORY,
    totalPurchases: MACRO_DEFAULTS.INITIAL_PURCHASES,
    kFactor: 1.2,
    zone: 'SAFE_GREEN',
    totalDeductibleTax: 760_000_000
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showDocumentPreview, setShowDocumentPreview] = useState(true);
  const [saveAsPrecedent, setSaveAsPrecedent] = useState(false);
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);

  // IMP-10: State bộ lọc & tìm kiếm nâng cao
  const [filters, setFilters] = useState<InboxFilterState>(DEFAULT_FILTER_STATE);

  // IMP-09: State chọn hàng loạt ca Routine & loading
  const [selectedRoutineIds, setSelectedRoutineIds] = useState<Set<string>>(new Set());
  const [isBulkConfirming, setIsBulkConfirming] = useState<boolean>(false);

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [inboxResponse, runtimeResponse, duplicateResponse] = await Promise.all([fetch('/api/inbox'), fetch('/api/runtime'), fetch('/api/invoices/duplicates')]);
      if (inboxResponse.status === 401 || runtimeResponse.status === 401) {
        onLogout();
        return;
      }
      const inbox = await inboxResponse.json();
      const runtime = await runtimeResponse.json();
      if (!inboxResponse.ok) throw new Error(inbox.error || 'Không thể tải Inbox');
      setItems(inbox.items || []);
      setCounts(inbox.counts || {});
      if (runtime.policy?.version) setPolicyVersion(runtime.policy.version);
      if (runtime.policy?.config) setConfig(runtime.policy.config);
      if (runtime.macroState) setMacro(runtime.macroState);
      if (duplicateResponse.ok) {
        const duplicateData = await duplicateResponse.json();
        setDuplicateGroups(duplicateData.groups || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu');
    } finally {
      setLoading(false);
    }
  }, [onLogout]);

  useEffect(() => { void loadWorkspace(); }, [loadWorkspace]);

  const approvalItems = useMemo(() => items.filter((item) => roleCanApprove(user, item)), [items, user]);
  const pendingCount = (counts.ROUTINE_PROPOSED || 0) + (counts.WAITING_CHIEF_ACCOUNTANT || 0) + (counts.WAITING_CFO || 0);

  const handleEvaluateResult = (decision: RefereeDecision, invoice: InvoiceInput) => {
    const localItem: InboxItem = {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      supplierTaxCode: invoice.supplierTaxCode,
      supplierName: invoice.supplierName,
      itemName: invoice.itemName,
      totalAmount: invoice.totalAmount,
      taxAmount: invoice.taxAmount,
      status: decision.status === 'ROUTINE' ? 'ROUTINE_PROPOSED' : (decision.requiresCFO ? 'WAITING_CFO' : 'WAITING_CHIEF_ACCOUNTANT'),
      invoice,
      decision,
      policyVersion,
        evaluationId: null,
      legalVersion: null,
      updatedAt: new Date().toISOString(),
      resolution: null
    };
    setSelected(localItem);
    setView('inbox');
    void loadWorkspace();
  };

  const handleResolve = async (option: ActionOption) => {
    if (!selected?.decision || selected.decision.status !== 'ESCALATED') return;
    showToast('Đang ghi nhận quyết định...', 'info');
    const response = await fetch('/api/resolutions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
          invoiceId: selected.id,
          evaluationId: selected.evaluationId,
          optionId: option.id,
        reason: option.actionDescription,
        saveAsPrecedent
      })
    });
    const data = await response.json();
    if (!response.ok) {
      showToast(data.error || 'Không thể ghi nhận quyết định', 'error');
      return;
    }
    if (data.precedent) {
      showToast(`Đã lưu phán quyết & tạo Tiền lệ CFO (#${data.precedent.id}) cho đối tác!`, 'success');
    } else {
      showToast('Đã lưu quyết định và audit thành công.', 'success');
    }
    setSaveAsPrecedent(false);
    setSelected(null);
    await loadWorkspace();
  };

  const confirmRoutine = async () => {
    if (!selected) return;
    const response = await fetch(`/api/invoices/${selected.id}/confirm`, { method: 'POST' });
    const data = await response.json();
    if (response.ok) {
      showToast('Đã xác nhận đề xuất Routine thành công.', 'success');
      setSelected(null);
      await loadWorkspace();
    } else {
      showToast(data.error || 'Không thể xác nhận hồ sơ', 'error');
    }
  };

  // IMP-09: Xử lý Xác nhận Hàng loạt 1-Click cho các ca Routine hợp lệ
  const handleBulkConfirm = async () => {
    if (selectedRoutineIds.size === 0) return;
    setIsBulkConfirming(true);
    try {
      showToast(`Đang xác nhận ${selectedRoutineIds.size} ca Thường quy...`, 'info');
      const response = await fetch('/api/inbox/bulk-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceIds: Array.from(selectedRoutineIds) })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Không thể xác nhận hàng loạt');
      showToast(`Đã duyệt thành công ${data.confirmedCount} ca Thường quy (${formatVND(data.totalAmount)})!`, 'success');
      setSelectedRoutineIds(new Set());
      await loadWorkspace();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Lỗi xử lý duyệt hàng loạt', 'error');
    } finally {
      setIsBulkConfirming(false);
    }
  };

  const exportDossier = async (format: 'json' | 'print') => {
    if (!selected) return;
    if (format === 'print') {
      window.open(`/api/dossiers/${selected.id}/export?format=print`, '_blank', 'noopener,noreferrer');
      return;
    }
    const response = await fetch(`/api/dossiers/${selected.id}/export?format=json`);
    if (!response.ok) {
      showToast('Không thể xuất hồ sơ', 'error');
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `tax-referee-${selected.id}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    showToast('Đã tải hồ sơ Tax Dossier thành công.', 'success');
  };

  const openTaxFormDraft = (form: '01/GTGT' | '04/SS-HĐĐT') => {
    const params = new URLSearchParams({ form, format: 'html' });
    if (form === '01/GTGT') params.set('period', new Date().toISOString().slice(0, 7));
    if (form === '04/SS-HĐĐT' && selected) params.set('invoiceId', selected.id);
    window.open(`/api/tax-forms?${params.toString()}`, '_blank', 'noopener,noreferrer');
  };

  const confirmDuplicate = async (group: DuplicateGroup) => {
    const [canonicalInvoiceId, ...duplicateIds] = group.invoiceIds.split(',');
    const invoiceId = duplicateIds[0];
    if (!invoiceId || !canonicalInvoiceId) return;
    const response = await fetch('/api/invoices/duplicates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoiceId, canonicalInvoiceId, status: 'CONFIRMED_DUPLICATE', reason: 'Xác nhận từ màn hình kiểm soát duplicate' })
    });
    const data = await response.json();
    if (!response.ok) {
      showToast(data.error || 'Không thể xử lý duplicate', 'error');
      return;
    }
    showToast(`Đã chuyển ${invoiceId} sang ON_HOLD để ngăn kê khai trùng.`, 'success');
    await loadWorkspace();
  };

  const navItems: Array<{ id: View; label: string; icon: React.ReactNode; count?: number }> = [
    { id: 'inbox', label: 'Inbox', icon: <Inbox className="h-4 w-4" />, count: pendingCount },
    { id: 'receive', label: 'Tiếp nhận', icon: <FileText className="h-4 w-4" /> },
    { id: 'approval', label: 'Chờ tôi xử lý', icon: <ClipboardCheck className="h-4 w-4" />, count: approvalItems.length },
    { id: 'dossier', label: 'Hồ sơ đã xử lý', icon: <CheckCircle2 className="h-4 w-4" /> },
    { id: 'reports', label: 'Báo cáo', icon: <ShieldCheck className="h-4 w-4" /> }
  ];

  const renderReview = () => {
    if (!selected) return (
      <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
        <div><FileText className="mx-auto mb-3 h-9 w-9 text-slate-300" /><p className="font-semibold text-slate-700">Chọn một hồ sơ để xem chi tiết</p><p className="mt-1 text-sm text-slate-500">Hệ thống sẽ hiển thị lý do, căn cứ và bước tiếp theo.</p></div>
      </div>
    );
    const decision = selected.decision;
    return (
      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Hồ sơ đang xem</p>
              {decision?.status === 'ESCALATED' && decision.duplicateInfo?.isDuplicate && (
                <Badge variant="destructive" className="text-[10px] font-bold flex items-center gap-1">
                  <Copy className="w-3 h-3" />
                  <span>TRÙNG LẶP HÓA ĐƠN</span>
                </Badge>
              )}
              {decision?.status === 'ROUTINE' && decision.precedentApplied && (
                <Badge variant="success" className="text-[10px] font-bold flex items-center gap-1">
                  <BookmarkCheck className="w-3 h-3" />
                  <span>TIỀN LỆ CFO ÁP DỤNG</span>
                </Badge>
              )}
            </div>
            <h2 className="text-xl font-bold text-slate-900">Hóa đơn {selected.invoiceNumber}</h2>
            <p className="text-sm text-slate-500">{selected.supplierName} · {formatDate(selected.invoiceDate)}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowDocumentPreview(!showDocumentPreview)}
              className="text-xs h-8 px-2.5 flex items-center gap-1.5 border-slate-300 text-slate-700 hover:bg-slate-100"
              title="Bật/Tắt chế độ xem song song bản gốc hóa đơn"
            >
              <Columns2 className="w-3.5 h-3.5 text-sky-600" />
              <span>{showDocumentPreview ? 'Tắt xem song song' : 'Bật xem song song'}</span>
            </Button>
            <button onClick={() => setSelected(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Đóng chi tiết">
              <XCircle className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Duplicate Invoice Alert (IMP-13) */}
        {decision?.status === 'ESCALATED' && decision.duplicateInfo?.isDuplicate && (
          <div className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-xs text-rose-900 space-y-1 animate-in fade-in">
            <div className="flex items-center gap-2 font-bold text-rose-800 text-sm">
              <Copy className="w-4 h-4 text-rose-600" />
              <span>CẢNH BÁO PHÁT HIỆN HÓA ĐƠN TRÙNG LẶP</span>
            </div>
            <p className="leading-relaxed">{decision.duplicateInfo.duplicateReason}</p>
            <p className="text-[11px] font-mono text-rose-700">Mã tham chiếu chứng từ gốc: {decision.duplicateInfo.originalInvoiceId}</p>
          </div>
        )}

        {/* Precedent Applied Banner (IMP-12) */}
        {decision?.status === 'ROUTINE' && decision.precedentApplied && (
          <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3.5 text-xs text-emerald-900 space-y-1 animate-in fade-in">
            <div className="flex items-center gap-2 font-bold text-emerald-800">
              <BookmarkCheck className="w-4 h-4 text-emerald-600" />
              <span>TỰ ĐỘNG THÔNG QUA THEO TIỀN LỆ LÃNH ĐẠO (AI FEEDBACK LOOP)</span>
            </div>
            <p className="leading-relaxed font-medium">Mã tiền lệ: {decision.precedentApplied.precedentId} · Phê duyệt: {decision.precedentApplied.approvedBy}</p>
            <p className="text-[11px] italic text-emerald-700">"{decision.precedentApplied.rationale}"</p>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <Info label="Tổng thanh toán" value={formatVND(selected.totalAmount)} />
          <Info label="Thuế GTGT" value={formatVND(selected.taxAmount)} />
          <Info label="Ngày cập nhật" value={formatDate(selected.updatedAt)} />
           <Info label="ID Đánh giá" value={selected.evaluationId || 'Chưa có'} />
        </div>
        {!decision && <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">Hồ sơ chưa có kết quả kiểm tra. Hãy mở lại bước tiếp nhận.</div>}
        {decision?.status === 'ROUTINE' && <div className="rounded-xl border border-sky-200 bg-sky-50 p-4"><div className="flex gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 text-sky-600" /><div><h3 className="font-bold text-sky-900">Đề xuất Routine</h3><p className="mt-1 text-sm text-sky-800">{decision.plainExplanation}</p><p className="mt-2 text-xs text-sky-700">Policy {selected.policyVersion || policyVersion} · Chưa tự ghi sổ. Kế toán cần xác nhận dữ liệu trước khi xuất hồ sơ.</p></div></div><button onClick={() => void confirmRoutine()} className="mt-4 w-full rounded-xl bg-sky-600 px-4 py-3 text-sm font-bold text-white hover:bg-sky-700">Xác nhận đề xuất Routine</button></div>}
        {decision?.status === 'ESCALATED' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" />
                <div>
                  <span className="rounded-full bg-amber-200 px-2 py-1 text-xs font-bold text-amber-900">{decision.riskGroup}</span>
                  <h3 className="mt-3 font-bold text-amber-950">{decision.actionableQuestion}</h3>
                  <p className="mt-2 text-sm text-amber-900">{decision.plainExplanation}</p>
                  <p className="mt-2 text-xs text-amber-800">Căn cứ: {decision.sopClause} · {selected.policyVersion || policyVersion}</p>
                </div>
              </div>
            </div>

            {/* Checkbox Save As Precedent (IMP-12) */}
            {roleCanApprove(user, selected) && (
              <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl space-y-1">
                <label className="flex items-center gap-2 text-xs font-bold text-purple-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={saveAsPrecedent}
                    onChange={(e) => setSaveAsPrecedent(e.target.checked)}
                    className="rounded border-purple-400 text-purple-600 focus:ring-purple-400 w-4 h-4 cursor-pointer"
                  />
                  <span>Lưu phán quyết này làm Tiền lệ Ngoại lệ cho đối tác này trong 6 tháng</span>
                </label>
                <p className="text-[11px] text-purple-700 pl-6 leading-relaxed">
                  Lần sau các hóa đơn tương tự từ <strong>{selected.supplierName}</strong> sẽ được AI tự động thông qua mà không cắm cờ phiền sếp nữa.
                </p>
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-2">
              {decision.options.map((option) => (
                <button
                  key={option.id}
                  onClick={() => void handleResolve(option)}
                  disabled={!roleCanApprove(user, selected)}
                  className="rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-slate-900 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="text-xs font-black uppercase tracking-wider text-slate-400">Phương án {option.id}</span>
                  <span className="mt-2 block font-bold text-slate-900">{option.label}</span>
                  <span className="mt-1 block text-sm text-slate-600">{option.actionDescription}</span>
                </button>
              ))}
            </div>
            {!roleCanApprove(user, selected) && <p className="text-xs font-semibold text-amber-700">Hồ sơ đang chờ vai trò khác xử lý.</p>}
          </div>
        )}
        {(selected.status === 'APPROVED' || selected.status === 'REJECTED') && (
          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            <button onClick={() => void exportDossier('json')} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">Tải hồ sơ JSON</button>
            <button onClick={() => void exportDossier('print')} className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-bold text-white hover:bg-slate-800">Mở bản in / lưu PDF</button>
            <button onClick={() => openTaxFormDraft('04/SS-HĐĐT')} className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900 hover:bg-amber-100">Bản nháp 04/SS-HĐĐT</button>
          </div>
        )}
      </section>
    );
  };

  const visibleList = view === 'approval' ? approvalItems : view === 'dossier' ? items.filter((item) => ['APPROVED', 'REJECTED'].includes(item.status)) : items;

  // IMP-10: Áp dụng đa tiêu chí lọc & tìm kiếm không dấu
  const filteredList = useMemo(() => {
    return visibleList.filter((item) => {
      // 1. Search term
      if (filters.searchTerm.trim()) {
        const query = removeAccents(filters.searchTerm.trim());
        const invNum = removeAccents(item.invoiceNumber || '');
        const supp = removeAccents(item.supplierName || '');
        const mst = (item.supplierTaxCode || '').toLowerCase();
        const itm = removeAccents(item.itemName || '');
        if (!invNum.includes(query) && !supp.includes(query) && !mst.includes(query) && !itm.includes(query)) {
          return false;
        }
      }

      // 2. Risk group
      if (filters.riskGroup !== 'ALL') {
        if (filters.riskGroup === 'ROUTINE') {
          if (item.decision?.status !== 'ROUTINE') return false;
        } else {
          if (item.decision?.status !== 'ESCALATED' || item.decision.riskGroup !== filters.riskGroup) {
            return false;
          }
        }
      }

      // 3. Amount range
      if (filters.amountRange !== 'ALL') {
        const amt = item.totalAmount || 0;
        if (filters.amountRange === 'UNDER_5M' && amt >= 5_000_000) return false;
        if (filters.amountRange === '5M_TO_20M' && (amt < 5_000_000 || amt >= 20_000_000)) return false;
        if (filters.amountRange === '20M_TO_200M' && (amt < 20_000_000 || amt >= 200_000_000)) return false;
        if (filters.amountRange === 'ABOVE_200M' && amt < 200_000_000) return false;
      }

      // 4. Approval status
      if (filters.approvalStatus !== 'ALL') {
        if (filters.approvalStatus === 'PENDING') {
          if (!['ROUTINE_PROPOSED', 'WAITING_CHIEF_ACCOUNTANT', 'WAITING_CFO'].includes(item.status)) return false;
        } else if (filters.approvalStatus === 'APPROVED') {
          if (item.status !== 'APPROVED') return false;
        } else if (filters.approvalStatus === 'REJECTED') {
          if (item.status !== 'REJECTED') return false;
        }
      }

      return true;
    });
  }, [visibleList, filters]);

  // IMP-09: Quản lý chọn checkbox cho các ca Thường quy hợp lệ
  const routineItemsInFiltered = useMemo(() => {
    return filteredList.filter(item => item.status === 'ROUTINE_PROPOSED');
  }, [filteredList]);

  const allRoutineSelected = routineItemsInFiltered.length > 0 && routineItemsInFiltered.every(item => selectedRoutineIds.has(item.id));

  const toggleSelectAllRoutine = () => {
    if (allRoutineSelected) {
      setSelectedRoutineIds(new Set());
    } else {
      const next = new Set(selectedRoutineIds);
      routineItemsInFiltered.forEach(item => next.add(item.id));
      setSelectedRoutineIds(next);
    }
  };

  const toggleSelectRoutine = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(selectedRoutineIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedRoutineIds(next);
  };

  const totalSelectedAmount = useMemo(() => {
    return items
      .filter(item => selectedRoutineIds.has(item.id))
      .reduce((sum, item) => sum + (item.totalAmount || 0), 0);
  }, [items, selectedRoutineIds]);

  const renderList = (list: InboxItem[]) => (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="hidden grid-cols-[40px_1.5fr_1fr_1fr_0.9fr] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500 md:grid items-center">
        {/* Checkbox Header chọn tất cả ca Routine */}
        <div className="flex items-center justify-center">
          <button
            type="button"
            onClick={toggleSelectAllRoutine}
            title={allRoutineSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả ca Routine'}
            className="text-slate-400 hover:text-sky-600 transition"
          >
            {allRoutineSelected ? (
              <CheckSquare className="h-4 w-4 text-sky-600" />
            ) : (
              <Square className="h-4 w-4" />
            )}
          </button>
        </div>
        <span>Hồ sơ</span>
        <span>Nhà cung cấp</span>
        <span>Giá trị</span>
        <span>Trạng thái</span>
      </div>
      {list.length === 0 && <div className="p-12 text-center text-sm text-slate-500">Không có hồ sơ nào phù hợp với điều kiện tìm kiếm.</div>}
      {list.map((item) => {
        const isRoutine = item.status === 'ROUTINE_PROPOSED';
        const isChecked = selectedRoutineIds.has(item.id);

        return (
          <div
            key={item.id}
            onClick={() => setSelected(item)}
            className={`grid w-full gap-2 border-b border-slate-100 px-4 py-3.5 text-left transition hover:bg-slate-50 md:grid-cols-[40px_1.5fr_1fr_1fr_0.9fr] md:items-center md:gap-3 cursor-pointer ${
              selected?.id === item.id ? 'bg-slate-50 ring-2 ring-inset ring-sky-500' : ''
            } ${isChecked ? 'bg-sky-50/40' : ''}`}
          >
            {/* Checkbox từng dòng hàng */}
            <div className="flex items-center justify-center">
              {isRoutine ? (
                <button
                  type="button"
                  onClick={(e) => toggleSelectRoutine(item.id, e)}
                  title={isChecked ? 'Bỏ chọn' : 'Chọn ca này để duyệt hàng loạt'}
                  className="text-slate-400 hover:text-sky-600 transition"
                >
                  {isChecked ? (
                    <CheckSquare className="h-4 w-4 text-sky-600" />
                  ) : (
                    <Square className="h-4 w-4" />
                  )}
                </button>
              ) : (
                <span title="Ca cần thẩm định riêng, không áp dụng duyệt hàng loạt" className="h-4 w-4 rounded border border-slate-200 bg-slate-100 block opacity-40 cursor-not-allowed" />
              )}
            </div>

            <div>
              <div className="font-bold text-slate-900">{item.invoiceNumber}</div>
              <div className="text-xs text-slate-500">{formatDate(item.invoiceDate)} · {item.itemName}</div>
            </div>
            <div className="text-sm text-slate-700">
              {item.supplierName}
              <div className="font-mono text-xs text-slate-400">{item.supplierTaxCode}</div>
            </div>
            <div className="text-sm font-semibold text-slate-800">{formatVND(item.totalAmount)}</div>
            <div>
              <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${statusStyle(item.status)}`}>
                {statusLabels[item.status] || item.status}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );

  const showToast = useCallback((message: string, type: 'info' | 'success' | 'error' = 'info') => {
    if (type === 'success') {
      toast.success(message);
    } else if (type === 'error') {
      toast.error(message);
    } else {
      toast.info(message);
    }
  }, []);

  const switchRole = async (targetRole: AppUser['role']) => {
    try {
      showToast('Đang chuyển vai trò...', 'info');
      const response = await fetch('/api/auth/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: targetRole })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Không thể đổi vai trò');
      if (onRoleSwitched) onRoleSwitched(data.user);
      showToast(`Đã chuyển sang vai trò: ${roleLabels[targetRole]}`, 'success');
      await loadWorkspace();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Không thể chuyển vai trò', 'error');
    }
  };

  return (
    <div className="relative min-h-screen bg-[#f5f7fb] text-slate-900">

      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
          {/* Left section: App Brand + Role Switcher placed next to brand to avoid layout shift */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-slate-900 p-2.5 text-white shadow-sm">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <div className="font-bold tracking-tight text-slate-950">Tax Referee</div>
                <div className="text-[11px] text-slate-500 hidden sm:block">Trọng tài Thuế</div>
              </div>
            </div>

            {/* Quick In-App Role Switcher on the LEFT beside brand */}
            <div className="flex items-center rounded-xl bg-slate-100 p-1 text-xs font-semibold text-slate-600 border border-slate-200">
              <span className="hidden lg:inline px-2 py-1 text-[10px] text-slate-400 font-bold uppercase tracking-wider">Vai trò:</span>
              {(['ACCOUNTANT', 'CHIEF_ACCOUNTANT', 'CFO'] as const).map((r) => {
                const isActive = user.role === r;
                return (
                  <button
                    key={r}
                    onClick={() => void switchRole(r)}
                    className={`rounded-lg px-2.5 py-1 text-xs transition ${
                      isActive
                        ? 'bg-white text-slate-950 font-bold shadow-sm'
                        : 'hover:text-slate-900 text-slate-600'
                    }`}
                  >
                    {roleLabels[r]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right section: User info & logout */}
          <div className="flex items-center gap-3">
            <div className="text-right sm:block">
              <div className="text-xs font-bold text-slate-900">{user.displayName}</div>
              <div className="text-[11px] text-slate-500 font-mono">{user.email}</div>
            </div>
            <button
              onClick={onLogout}
              className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 transition"
              title="Đăng xuất"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row">
        <aside className="w-full shrink-0 lg:w-56">
          <nav className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm space-y-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => { setView(item.id); if (item.id !== 'receive') setSelected(null); }}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                  view === item.id ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <span className="flex items-center gap-3">
                  {item.icon}
                  {item.label}
                </span>
                <span className="flex items-center justify-end w-7">
                  {Boolean(item.count) && (
                    <span
                      className={`inline-flex items-center justify-center min-w-[20px] h-5 rounded-full px-1.5 text-[11px] font-bold ${
                        view === item.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {item.count}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </nav>
          <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-500">
            <div className="flex items-center gap-2 font-semibold text-slate-700">
              <UserRound className="h-4 w-4" /> Quyền đang dùng
            </div>
            <p className="mt-2 leading-relaxed">
              Bạn đang ở quyền <strong className="text-slate-900">{roleLabels[user.role]}</strong>. Danh sách & việc cần xử lý tự động lọc đúng theo vai trò.
            </p>
            {(user.role === 'CHIEF_ACCOUNTANT' || user.role === 'CFO') && (
              <button
                onClick={() => setPolicyOpen(true)}
                className="mt-3 flex items-center gap-2 font-semibold text-sky-700 hover:text-sky-900"
              >
                <Settings2 className="h-4 w-4" /> Quản trị policy
              </button>
            )}
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <p className="text-sm font-semibold text-sky-700">
                {view === 'receive' ? 'Tiếp nhận chứng từ' : view === 'approval' ? 'Việc cần bạn xử lý' : view === 'dossier' ? 'Hồ sơ đã xử lý' : view === 'reports' ? 'Báo cáo vận hành' : 'Tổng quan công việc'}
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">
                {view === 'receive' ? 'Bắt đầu từ một chứng từ' : 'Inbox kế toán'}
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                {view === 'receive' ? 'Tải XML/PDF/ảnh hoặc nhập form. Bạn luôn được xem lại dữ liệu trước khi kiểm tra.' : 'Xử lý việc cần làm trước; thông tin kỹ thuật nằm trong chi tiết hồ sơ.'}
              </p>
            </div>
            <button
              onClick={() => void loadWorkspace()}
              className="inline-flex items-center justify-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 sm:self-auto"
            >
              <RefreshCw className="h-4 w-4" /> Làm mới
            </button>
          </div>

          {error && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}
          {loading && <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Đang tải workspace...</div>}
          {!loading && view !== 'receive' && view !== 'reports' && (
            <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric label="Cần xử lý" value={pendingCount} hint="Routine hoặc chờ phê duyệt" />
              <Metric label="Đề xuất Routine" value={counts.ROUTINE_PROPOSED || 0} hint="Chưa tự ghi sổ" />
              <Metric label="Chờ KTT" value={counts.WAITING_CHIEF_ACCOUNTANT || 0} hint="Nhóm thông tin/chính sách" />
              <Metric label="Chờ CFO" value={counts.WAITING_CFO || 0} hint="Vượt thẩm quyền/rủi ro cao" />
            </div>
          )}
          {!loading && view === 'receive' && <InteractiveInputForm onEvaluateResult={handleEvaluateResult} dynamicConfig={config} />}
          {!loading && view === 'reports' && (
            <section className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="font-bold">Trạng thái policy</h2>
                <p className="mt-2 text-2xl font-bold text-slate-900">{policyVersion}</p>
                <p className="mt-1 text-sm text-slate-500">Policy đang chạy. Luật mới chỉ được áp dụng sau khi duyệt.</p>
                <button onClick={() => setPolicyOpen(true)} className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-sky-700">
                  Mở khu vực quản trị <ArrowRight className="h-4 w-4" />
                </button>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="font-bold">MacroState</h2>
                <div className="mt-4 flex items-end justify-between">
                  <span className="text-sm text-slate-500">K-factor hiện tại</span>
                  <span className="text-3xl font-bold">{macro.kFactor.toFixed(2)}</span>
                </div>
                <p className="mt-2 text-sm text-slate-500">
                  Vùng {macro.zone === 'SAFE_GREEN' ? 'an toàn' : macro.zone === 'WARNING_YELLOW' ? 'cảnh báo' : 'rủi ro cao'}. Chỉ xem trong báo cáo nâng cao.
                </p>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm md:col-span-2">
                <h2 className="font-bold text-amber-950">Bản nháp biểu mẫu thuế</h2>
                <p className="mt-1 text-sm text-amber-900">Các file này chỉ là bản tổng hợp để kế toán kiểm tra, chưa phải biểu mẫu ký nộp chính thức.</p>
                <button onClick={() => openTaxFormDraft('01/GTGT')} className="mt-4 rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-700">
                  Mở bản nháp 01/GTGT
                </button>
              </div>
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 shadow-sm md:col-span-2">
                <h2 className="font-bold text-rose-950">Duplicate cần đối chiếu</h2>
                {duplicateGroups.length === 0 ? (
                  <p className="mt-1 text-sm text-rose-900">Không phát hiện nhóm số hóa đơn trùng.</p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {duplicateGroups.map((group) => (
                      <div key={`${group.supplierTaxCode}-${group.invoiceNumber}`} className="flex flex-col gap-2 rounded-xl border border-rose-200 bg-white p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <strong>{group.invoiceNumber}</strong> · MST {group.supplierTaxCode} · {group.count} hồ sơ
                          <div className="text-xs text-slate-500">{group.invoiceIds}</div>
                        </div>
                        <button onClick={() => void confirmDuplicate(group)} className="rounded-lg bg-rose-700 px-3 py-2 text-xs font-bold text-white hover:bg-rose-800">Giữ bản đầu, treo bản sau</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}
          {!loading && view !== 'receive' && view !== 'reports' && (
            selected && showDocumentPreview ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between bg-white border border-slate-200 rounded-2xl px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setShowDocumentPreview(false)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 border border-slate-200 bg-slate-50 hover:bg-slate-100 rounded-lg px-3 py-1.5 transition shadow-2xs"
                    >
                      <ArrowRight className="h-3.5 w-3.5 rotate-180" /> Quay lại danh sách Inbox
                    </button>
                    <span className="text-slate-300">|</span>
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Columns2 className="h-4 w-4 text-sky-600" />
                      Chế độ Xem Song Song: Hóa đơn gốc điện tử & Thẩm định AI
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 font-mono">
                    HĐ: #{selected.invoice.invoiceNumber || selected.id}
                  </div>
                </div>

                <div className="grid gap-6 xl:grid-cols-2 items-start">
                  <div className="min-w-0">
                    <DocumentViewer
                      invoice={selected.invoice}
                      onClose={() => setShowDocumentPreview(false)}
                    />
                  </div>
                  <div className="min-w-0">
                    {renderReview()}
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
                <div className="space-y-3">
                  <InboxFilterToolbar
                    filters={filters}
                    onChange={setFilters}
                    totalCount={visibleList.length}
                    filteredCount={filteredList.length}
                  />
                  {renderList(filteredList)}
                </div>
                <div>{renderReview()}</div>
              </div>
            )
          )}
        </main>
      </div>

      {/* IMP-09: Floating Bulk Action Bar khi có ít nhất 1 ca Routine được chọn */}
      {selectedRoutineIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-[92%] max-w-2xl bg-slate-950/95 backdrop-blur-md border border-slate-800 rounded-2xl p-4 shadow-2xl text-white flex flex-col sm:flex-row items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-bold flex items-center gap-2">
                <span>Đã chọn {selectedRoutineIds.size} ca Thường quy (ROUTINE)</span>
                <Badge className="bg-emerald-500/20 text-emerald-300 border-0 text-[10px] font-mono">
                  Hợp lệ 100%
                </Badge>
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                Tổng giá trị: <strong className="text-slate-100 font-mono">{formatVND(totalSelectedAmount)}</strong>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              onClick={() => setSelectedRoutineIds(new Set())}
              disabled={isBulkConfirming}
              className="px-3 py-2 text-xs font-semibold text-slate-400 hover:text-white transition rounded-xl cursor-pointer"
            >
              Bỏ chọn
            </button>
            <button
              onClick={() => void handleBulkConfirm()}
              disabled={isBulkConfirming}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-bold bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white rounded-xl shadow-lg shadow-emerald-950/40 transition disabled:opacity-50 cursor-pointer"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>{isBulkConfirming ? 'Đang duyệt...' : 'Duyệt hàng loạt 1-Click'}</span>
            </button>
          </div>
        </div>
      )}

      <PolicyViewerModal isOpen={policyOpen} onClose={() => setPolicyOpen(false)} onPolicyUpdated={(next) => setPolicyVersion(next)} onConfigUpdated={(next) => setConfig(next)} />
      <Toaster />
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 text-sm font-bold text-slate-900">{value}</div></div>; }
function Metric({ label, value, hint }: { label: string; value: number; hint: string }) { return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><span className="text-sm font-semibold text-slate-600">{label}</span><Clock className="h-4 w-4 text-slate-300" /></div><div className="mt-2 text-3xl font-bold text-slate-950">{value}</div><div className="mt-1 text-xs text-slate-500">{hint}</div></div>; }
