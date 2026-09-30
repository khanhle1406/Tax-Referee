'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
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
  BookmarkCheck,
  Copy,
  Columns2,
  CheckSquare,
  Square,
  Sparkles,
  Building2,
  RotateCcw,
  PanelLeftClose,
  PanelLeftOpen,
  SquarePen,
  Search,
  MessageSquare,
  MoreHorizontal,
  Bell
} from 'lucide-react';
import { InteractiveInputForm } from '@/components/InteractiveInputForm';
import { PolicyViewerModal } from '@/components/PolicyViewerModal';
import { LedgerSyncModal } from '@/components/LedgerSyncModal';
import { DocumentViewer } from '@/components/DocumentViewer';
import { InboxFilterToolbar, InboxFilterState, DEFAULT_FILTER_STATE } from '@/components/InboxFilterToolbar';
import { NotificationCenterView } from '@/components/NotificationCenterView';
import { ActionOption, InvoiceInput, MacroState, RefereeDecision, SystemPolicyConfig } from '@/lib/schemas';
import { DEFAULT_POLICY_CONFIG, MACRO_DEFAULTS } from '@/lib/constants';
import { formatVND } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';

type AppUser = { id: string; email: string; displayName: string; role: 'ACCOUNTANT' | 'CHIEF_ACCOUNTANT' | 'CFO' };
type View = 'inbox' | 'receive' | 'approval' | 'dossier' | 'reports' | 'notifications';
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

const statusConfig: Record<string, { label: string; variant: 'success' | 'warning' | 'destructive' | 'secondary' | 'default' | 'info' }> = {
  RECEIVED: { label: 'Mới nhận', variant: 'secondary' },
  NEEDS_CONFIRMATION: { label: 'Cần xác nhận', variant: 'warning' },
  ROUTINE_PROPOSED: { label: 'Routine', variant: 'success' },
  WAITING_CHIEF_ACCOUNTANT: { label: 'Chờ KTT', variant: 'warning' },
  WAITING_CFO: { label: 'Chờ CFO', variant: 'destructive' },
  APPROVED: { label: 'Đã duyệt', variant: 'success' },
  REJECTED: { label: 'Từ chối', variant: 'destructive' },
  ON_HOLD: { label: 'Tạm dừng', variant: 'secondary' }
};

const roleCanApprove = (user: AppUser, item: InboxItem) => {
  if (item.status === 'WAITING_CFO') return user.role === 'CFO';
  if (item.status === 'WAITING_CHIEF_ACCOUNTANT') return user.role === 'CHIEF_ACCOUNTANT';
  return false;
};

function formatDate(value: string): string {
  try { return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short' }).format(new Date(value)); } catch { return value; }
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
  const [filters, setFilters] = useState<InboxFilterState>(DEFAULT_FILTER_STATE);
  const [selectedRoutineIds, setSelectedRoutineIds] = useState<Set<string>>(new Set());
  const [isBulkConfirming, setIsBulkConfirming] = useState<boolean>(false);
  const [ledgerSyncOpen, setLedgerSyncOpen] = useState<boolean>(false);
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [unreadNotifCount, setUnreadNotifCount] = useState<number>(0);

  const userInitials = useMemo(() => {
    const name = user.displayName?.trim() || 'Khánh';
    const parts = name.split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }, [user.displayName]);

  const showToast = useCallback((message: string, type: 'info' | 'success' | 'error' = 'info') => {
    if (type === 'success') toast.success(message);
    else if (type === 'error') toast.error(message);
    else toast.info(message);
  }, []);

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [inboxRes, runtimeRes, dupRes, notifRes] = await Promise.all([
        fetch('/api/inbox'),
        fetch('/api/runtime'),
        fetch('/api/invoices/duplicates'),
        fetch('/api/notifications')
      ]);
      if (inboxRes.status === 401 || runtimeRes.status === 401) {
        onLogout();
        return;
      }
      const inbox = await inboxRes.json();
      const runtime = await runtimeRes.json();
      if (!inboxRes.ok) throw new Error(inbox.error || 'Lỗi tải Inbox');
      setItems(inbox.items || []);
      setCounts(inbox.counts || {});
      if (runtime.policy?.version) setPolicyVersion(runtime.policy.version);
      if (runtime.policy?.config) setConfig(runtime.policy.config);
      if (runtime.macroState) setMacro(runtime.macroState);
      if (dupRes.ok) {
        const dupData = await dupRes.json();
        setDuplicateGroups(dupData.groups || []);
      }
      if (notifRes.ok) {
        const notifData = await notifRes.json();
        if (typeof notifData.unreadCount === 'number') setUnreadNotifCount(notifData.unreadCount);
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
    showToast('Đang lưu phán quyết...', 'info');
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
      showToast(data.error || 'Lỗi ghi nhận phán quyết', 'error');
      return;
    }
    if (data.precedent) {
      showToast(`Đã tạo Tiền lệ CFO (#${data.precedent.id})!`, 'success');
    } else {
      showToast('Đã lưu phán quyết thành công.', 'success');
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
      showToast('Đã xác nhận hạch toán thành công.', 'success');
      setSelected(null);
      await loadWorkspace();
    } else {
      showToast(data.error || 'Không thể xác nhận', 'error');
    }
  };

  const handleBulkConfirm = async () => {
    if (selectedRoutineIds.size === 0) return;
    setIsBulkConfirming(true);
    try {
      showToast(`Đang duyệt ${selectedRoutineIds.size} ca Routine...`, 'info');
      const response = await fetch('/api/inbox/bulk-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceIds: Array.from(selectedRoutineIds) })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Không thể duyệt hàng loạt');
      showToast(`Duyệt thành công ${data.confirmedCount} ca (${formatVND(data.totalAmount)})!`, 'success');
      setSelectedRoutineIds(new Set());
      await loadWorkspace();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Lỗi duyệt hàng loạt', 'error');
    } finally {
      setIsBulkConfirming(false);
    }
  };

  const handleResetWorkspace = async () => {
    if (!window.confirm('Bạn có chắc chắn muốn RESET toàn bộ hóa đơn về trạng thái ban đầu không? Toàn bộ hóa đơn đã gửi lên sẽ được xóa sạch.')) {
      return;
    }
    setIsResetting(true);
    try {
      showToast('Đang reset dữ liệu hóa đơn...', 'info');
      const res = await fetch('/api/invoices/reset', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi reset hệ thống');
      showToast('Đã reset hệ thống về trạng thái chưa có hóa đơn nào!', 'success');
      setSelected(null);
      setSelectedRoutineIds(new Set());
      await loadWorkspace();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Lỗi reset hệ thống', 'error');
    } finally {
      setIsResetting(false);
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
      showToast('Lỗi xuất hồ sơ', 'error');
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `tax-referee-${selected.id}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    showToast('Đã tải hồ sơ JSON.', 'success');
  };

  const openTaxFormDraft = (form: '01/GTGT' | '04/SS-HĐĐT') => {
    const params = new URLSearchParams({ form, format: 'html' });
    if (form === '01/GTGT') params.set('period', new Date().toISOString().slice(0, 7));
    if (form === '04/SS-HĐĐT' && selected) params.set('invoiceId', selected.id);
    window.open(`/api/tax-forms?${params.toString()}`, '_blank', 'noopener,noreferrer');
  };

  const navItems: Array<{ id: View; label: string; icon: React.ReactNode; count?: number }> = [
    { id: 'inbox', label: 'Inbox', icon: <Inbox className="h-4 w-4" />, count: pendingCount },
    { id: 'receive', label: 'Tiếp nhận', icon: <FileText className="h-4 w-4" /> },
    { id: 'approval', label: 'Chờ duyệt', icon: <ClipboardCheck className="h-4 w-4" />, count: approvalItems.length },
    { id: 'dossier', label: 'Đã xử lý', icon: <CheckCircle2 className="h-4 w-4" /> },
    { id: 'reports', label: 'Báo cáo', icon: <ShieldCheck className="h-4 w-4" /> },
    { id: 'notifications', label: 'Thông báo', icon: <Bell className="h-4 w-4" />, count: unreadNotifCount }
  ];

  const visibleList = view === 'approval' ? approvalItems : view === 'dossier' ? items.filter((item) => ['APPROVED', 'REJECTED'].includes(item.status)) : items;

  const filteredList = useMemo(() => {
    return visibleList.filter((item) => {
      if (filters.searchTerm.trim()) {
        const query = removeAccents(filters.searchTerm.trim());
        const invNum = removeAccents(item.invoiceNumber || '');
        const supp = removeAccents(item.supplierName || '');
        const mst = (item.supplierTaxCode || '').toLowerCase();
        if (!invNum.includes(query) && !supp.includes(query) && !mst.includes(query)) return false;
      }
      if (filters.riskGroup !== 'ALL') {
        if (filters.riskGroup === 'ROUTINE') {
          if (item.decision?.status !== 'ROUTINE') return false;
        } else {
          if (item.decision?.status !== 'ESCALATED' || item.decision.riskGroup !== filters.riskGroup) return false;
        }
      }
      if (filters.amountRange !== 'ALL') {
        const amt = item.totalAmount || 0;
        if (filters.amountRange === 'UNDER_5M' && amt >= 5_000_000) return false;
        if (filters.amountRange === '5M_TO_20M' && (amt < 5_000_000 || amt >= 20_000_000)) return false;
        if (filters.amountRange === '20M_TO_200M' && (amt < 20_000_000 || amt >= 200_000_000)) return false;
        if (filters.amountRange === 'ABOVE_200M' && amt < 200_000_000) return false;
      }
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
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedRoutineIds(next);
  };

  const totalSelectedAmount = useMemo(() => {
    return items
      .filter(item => selectedRoutineIds.has(item.id))
      .reduce((sum, item) => sum + (item.totalAmount || 0), 0);
  }, [items, selectedRoutineIds]);

  // Review Pane (KẾT LUẬN THẨM TRA - To & Rõ)
  const renderReview = () => {
    if (!selected) {
      return (
        <div className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center shadow-subtle">
          <FileText className="mb-2 h-10 w-10 text-slate-300" />
          <p className="font-bold text-slate-900 text-base">Chọn hóa đơn để xem kết quả thẩm tra</p>
          <p className="mt-1 text-xs text-slate-500 max-w-xs">
            Bấm vào bất kỳ dòng hóa đơn nào bên trái để đối soát.
          </p>
        </div>
      );
    }

    const decision = selected.decision;
    return (
      <Card className="space-y-5 p-6 sm:p-7 shadow-card">
        {/* Header - To & Rõ */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge variant={statusConfig[selected.status]?.variant || 'secondary'}>
                {statusConfig[selected.status]?.label || selected.status}
              </Badge>
              {decision?.status === 'ROUTINE' && decision.precedentApplied && (
                <Badge variant="success">ÁP DỤNG TIỀN LỆ</Badge>
              )}
              {decision?.status === 'ESCALATED' && decision.duplicateInfo?.isDuplicate && (
                <Badge variant="destructive">TRÙNG HÓA ĐƠN</Badge>
              )}
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-950">
              HĐ #{selected.invoiceNumber}
            </h2>
            <p className="text-sm font-bold text-slate-700 mt-0.5">{selected.supplierName}</p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowDocumentPreview(!showDocumentPreview)}
              className="text-xs h-8 px-3 font-bold"
            >
              <Columns2 className="w-3.5 h-3.5 mr-1" />
              <span>{showDocumentPreview ? 'Ẩn bản gốc' : 'Xem song song'}</span>
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setSelected(null)}
              className="h-8 w-8 text-slate-400 hover:text-slate-950"
            >
              <XCircle className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* 3 Stat Numbers - To, Rõ, Đậm */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Tổng thanh toán</span>
            <div className="text-lg font-extrabold font-numeric text-slate-950 mt-1">
              {formatVND(selected.totalAmount)}
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Thuế GTGT</span>
            <div className="text-lg font-extrabold font-numeric text-slate-950 mt-1">
              {formatVND(selected.taxAmount)}
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Ngày lập</span>
            <div className="text-base font-bold text-slate-950 mt-1">
              {formatDate(selected.invoiceDate)}
            </div>
          </div>
        </div>

        {/* Routine Outcome */}
        {decision?.status === 'ROUTINE' && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-5 space-y-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-700 shrink-0" />
              <div>
                <h3 className="font-extrabold text-emerald-950 text-sm uppercase tracking-wider">
                  HỢP LỆ — ĐỀ XUẤT ROUTINE
                </h3>
                <p className="mt-1 text-sm font-semibold text-emerald-900 leading-relaxed">
                  {decision.plainExplanation}
                </p>
                <p className="mt-2 text-xs text-slate-600 font-mono font-bold">
                  Căn cứ: Thông tư 219/2013/TT-BTC &amp; Nghị định 123/2020/NĐ-CP
                </p>
              </div>
            </div>
            <Button
              onClick={() => void confirmRoutine()}
              variant="default"
              size="lg"
              className="w-full font-bold tracking-wide"
            >
              XÁC NHẬN HẠCH TOÁN
            </Button>
          </div>
        )}

        {/* Escalated Outcome */}
        {decision?.status === 'ESCALATED' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-5 space-y-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-700" />
                <span className="text-xs font-bold uppercase tracking-wider text-amber-900">
                  CẦN XỬ LÝ NGOẠI LỆ ({decision.riskGroup})
                </span>
              </div>
              <h3 className="text-base font-bold text-slate-950 leading-snug">
                {decision.actionableQuestion}
              </h3>
              <p className="text-xs font-mono font-bold text-slate-600">
                Căn cứ: {decision.sopClause}
              </p>
            </div>

            {/* Checkbox Save As Precedent */}
            {roleCanApprove(user, selected) && (
              <label className="flex items-center gap-2.5 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer">
                <input
                  type="checkbox"
                  checked={saveAsPrecedent}
                  onChange={(e) => setSaveAsPrecedent(e.target.checked)}
                  className="rounded border-slate-300 text-slate-950 focus:ring-slate-950 w-4 h-4 cursor-pointer"
                />
                <span className="text-xs font-bold text-slate-900">
                  Lưu làm Tiền lệ Ngoại lệ cho đối tác này (áp dụng 6 tháng)
                </span>
              </label>
            )}

            {/* A/B Option Buttons - To & Rõ */}
            <div className="grid gap-3 sm:grid-cols-2">
              {decision.options.map((option, idx) => (
                <button
                  key={option.id}
                  onClick={() => void handleResolve(option)}
                  disabled={!roleCanApprove(user, selected)}
                  className="p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-950 hover:shadow-subtle text-left transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer group"
                >
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
                    PHƯƠNG ÁN {idx === 0 ? 'A' : 'B'}
                  </span>
                  <span className="block font-bold text-sm text-slate-950">{option.label}</span>
                  <span className="block text-xs font-medium text-slate-600 mt-1 leading-relaxed">
                    {option.actionDescription}
                  </span>
                </button>
              ))}
            </div>

            {!roleCanApprove(user, selected) && (
              <p className="text-xs font-bold text-amber-700 text-center">
                Đang chờ cấp thẩm quyền ({selected.status === 'WAITING_CFO' ? 'CFO' : 'Kế toán trưởng'}) phê duyệt.
              </p>
            )}
          </div>
        )}

        {/* Export actions */}
        {(selected.status === 'APPROVED' || selected.status === 'REJECTED') && (
          <div className="flex gap-2 pt-4 border-t border-slate-100">
            <Button variant="outline" size="sm" onClick={() => void exportDossier('json')} className="font-bold">
              Xuất JSON
            </Button>
            <Button variant="default" size="sm" onClick={() => void exportDossier('print')} className="font-bold">
              Bản in PDF
            </Button>
            <Button variant="secondary" size="sm" onClick={() => openTaxFormDraft('04/SS-HĐĐT')} className="font-bold">
              Mẫu 04/SS-HĐĐT
            </Button>
          </div>
        )}
      </Card>
    );
  };

  // Inbox List Table
  const renderList = (list: InboxItem[]) => (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-subtle">
      <div className="hidden grid-cols-[36px_1.5fr_1fr_1fr_0.8fr] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-600 md:grid items-center">
        <div className="flex items-center justify-center">
          <button
            type="button"
            onClick={toggleSelectAllRoutine}
            title={allRoutineSelected ? 'Bỏ chọn' : 'Chọn tất cả ca Routine'}
            className="text-slate-600 hover:text-slate-950 cursor-pointer"
          >
            {allRoutineSelected ? <CheckSquare className="h-4 w-4 text-slate-950" /> : <Square className="h-4 w-4" />}
          </button>
        </div>
        <span>Hóa đơn</span>
        <span>Nhà cung cấp</span>
        <span className="text-right">Tổng tiền (VNĐ)</span>
        <span className="text-center">Trạng thái</span>
      </div>

      {list.length === 0 && (
        <div className="p-8 text-center text-sm font-semibold text-slate-500">
          Không có hóa đơn nào phù hợp.
        </div>
      )}

      {list.map((item) => {
        const isRoutine = item.status === 'ROUTINE_PROPOSED';
        const isChecked = selectedRoutineIds.has(item.id);
        const isSelected = selected?.id === item.id;

        return (
          <div
            key={item.id}
            onClick={() => setSelected(item)}
            className={`grid w-full gap-2 border-b border-slate-100 px-4 py-3 text-left transition hover:bg-slate-50 md:grid-cols-[36px_1.5fr_1fr_1fr_0.8fr] md:items-center md:gap-3 cursor-pointer ${
              isSelected ? 'bg-slate-100/80 font-medium' : ''
            } ${isChecked ? 'bg-amber-50/50' : ''}`}
          >
            {/* Checkbox */}
            <div className="flex items-center justify-center">
              {isRoutine ? (
                <button
                  type="button"
                  onClick={(e) => toggleSelectRoutine(item.id, e)}
                  className="text-slate-500 hover:text-slate-950 cursor-pointer"
                >
                  {isChecked ? <CheckSquare className="h-4 w-4 text-slate-950" /> : <Square className="h-4 w-4" />}
                </button>
              ) : (
                <span className="h-4 w-4 rounded border border-slate-200 bg-slate-100 block opacity-40 cursor-not-allowed" />
              )}
            </div>

            <div>
              <div className="font-bold text-sm text-slate-950">{item.invoiceNumber}</div>
              <div className="text-xs text-slate-500">{formatDate(item.invoiceDate)}</div>
            </div>

            <div className="text-xs font-bold text-slate-800 truncate">
              {item.supplierName}
              <div className="font-mono text-[11px] font-normal text-slate-500">{item.supplierTaxCode}</div>
            </div>

            <div className="text-sm font-numeric font-bold text-slate-950 text-right">
              {formatVND(item.totalAmount)}
            </div>

            <div className="text-center">
              <Badge variant={statusConfig[item.status]?.variant || 'secondary'}>
                {statusConfig[item.status]?.label || item.status}
              </Badge>
            </div>
          </div>
        );
      })}
    </div>
  );

  const switchRole = async (targetRole: AppUser['role']) => {
    try {
      const response = await fetch('/api/auth/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: targetRole })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Lỗi đổi vai trò');
      if (onRoleSwitched) onRoleSwitched(data.user);
      showToast(`Vai trò: ${roleLabels[targetRole]}`, 'success');
      await loadWorkspace();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Lỗi chuyển vai trò', 'error');
    }
  };

  return (
    <div className="relative min-h-screen bg-slate-50/70 text-slate-900 selection:bg-brand-lime selection:text-slate-950 flex flex-col md:flex-row">
      
      {/* Collapsible Left Sidebar (Fixed Icon Coordinates & Persistent Slots) */}
      <aside
        id="stage-slideover-sidebar"
        data-state={isSidebarCollapsed ? 'closed' : 'open'}
        className={`sticky top-0 h-screen flex flex-col bg-[#f9f9f9] text-slate-900 border-r border-slate-200/80 transition-[width] duration-200 ease-out shrink-0 z-40 select-none overflow-hidden ${
          isSidebarCollapsed ? 'w-[56px]' : 'w-[260px]'
        }`}
      >
        <div className="relative flex h-full flex-col w-[260px]">
          
          {/* ================= HEADER: LOGO + BRAND + CLOSE BUTTON ================= */}
          <div className="h-[52px] px-2.5 flex items-center justify-between shrink-0 border-b border-slate-200/60 w-full overflow-hidden">
            <div className="flex items-center gap-0 min-w-0">
              {/* Logo slot: Luôn cố định tại x=10px, y=8px, size 36x36px */}
              <button
                type="button"
                onClick={() => isSidebarCollapsed && setIsSidebarCollapsed(false)}
                className={`group/logo flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors ${
                  isSidebarCollapsed ? 'hover:bg-black/5 cursor-e-resize' : 'cursor-default'
                }`}
                title={isSidebarCollapsed ? 'Mở thanh điều hướng' : 'Tax Referee'}
                aria-label={isSidebarCollapsed ? 'Mở thanh điều hướng' : 'Tax Referee'}
              >
                <span className="grid place-items-center">
                  <span className={`col-start-1 row-start-1 transition-opacity duration-150 flex h-7 w-7 items-center justify-center rounded-lg bg-slate-950 text-brand-lime shadow-xs ${
                    isSidebarCollapsed ? 'group-hover/logo:opacity-0' : 'opacity-100'
                  }`}>
                    <ShieldCheck className="h-4 w-4" />
                  </span>
                  {isSidebarCollapsed && (
                    <span className="col-start-1 row-start-1 opacity-0 transition-opacity duration-150 group-hover/logo:opacity-100 flex h-7 w-7 items-center justify-center rounded-lg bg-slate-200 text-slate-900">
                      <PanelLeftOpen className="h-4 w-4" />
                    </span>
                  )}
                </span>
              </button>

              {/* Brand Wordmark: Xuất hiện mượt mà khi mở rộng */}
              <div className={`flex items-center gap-1.5 pl-2 whitespace-nowrap transition-opacity duration-150 ${
                isSidebarCollapsed ? 'opacity-0 pointer-events-none hidden' : 'opacity-100'
              }`}>
                <span className="font-semibold text-[15px] tracking-tight text-slate-900">Tax Referee</span>
                <span className="font-mono text-[9px] font-bold text-slate-500 uppercase tracking-wider bg-slate-200/70 px-1 py-0.5 rounded">
                  Beta
                </span>
              </div>
            </div>

            {/* Nút thu nhỏ bên phải (chỉ hiện khi mở) */}
            <div className={`shrink-0 transition-opacity duration-150 ${
              isSidebarCollapsed ? 'opacity-0 pointer-events-none hidden' : 'opacity-100'
            }`}>
              <button
                type="button"
                onClick={() => setIsSidebarCollapsed(true)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-black/5 transition-colors cursor-w-resize"
                title="Thu gọn thanh điều hướng"
                aria-label="Thu gọn thanh điều hướng"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* ================= NAVIGATION ITEMS: VỊ TRÍ & KÍCH THƯỚC ICON CỐ ĐỊNH 100% ================= */}
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pt-3 px-2.5 space-y-1 w-full">
            {navItems.map((item) => {
              const isActive = view === item.id;
              return (
                <div key={item.id} className="relative group/navitem flex items-center h-9 w-[240px]">
                  <button
                    type="button"
                    onClick={() => {
                      setView(item.id);
                      if (item.id !== 'receive') setSelected(null);
                    }}
                    className={`flex h-9 items-center rounded-lg text-[13px] transition-all duration-200 cursor-pointer overflow-hidden ${
                      isSidebarCollapsed ? 'w-9' : 'w-[240px]'
                    } ${
                      isActive
                        ? 'bg-black/10 text-slate-950 font-semibold'
                        : 'text-slate-700 hover:bg-black/5 hover:text-slate-950 font-medium'
                    }`}
                    aria-label={item.label}
                  >
                    {/* Icon Slot: Luôn giữ nguyên width=36px, height=36px, icon size=16px (h-4 w-4) tại left: 0 */}
                    <div className="w-9 h-9 shrink-0 flex items-center justify-center relative">
                      <span className="flex items-center justify-center h-4 w-4">
                        {item.icon}
                      </span>
                      {/* Chấm đỏ thông báo khi thu gọn */}
                      {isSidebarCollapsed && Boolean(item.count) && (
                        <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-[#f9f9f9]" />
                      )}
                    </div>

                    {/* Text Label + Badge số lượng (Chỉ hiện khi mở rộng, không chèn ép icon) */}
                    <div className={`flex items-center justify-between flex-1 min-w-0 pr-2.5 whitespace-nowrap transition-opacity duration-150 ${
                      isSidebarCollapsed ? 'opacity-0 pointer-events-none hidden' : 'opacity-100'
                    }`}>
                      <span className="truncate">{item.label}</span>
                      {Boolean(item.count) && (
                        <span
                          className={`inline-flex items-center justify-center min-w-[20px] h-5 rounded-full px-1.5 text-[11px] font-mono font-bold shrink-0 ${
                            isActive ? 'bg-black/10 text-slate-950' : 'bg-slate-200/80 text-slate-700'
                          }`}
                        >
                          {item.count}
                        </span>
                      )}
                    </div>
                  </button>

                  {/* Floating Tooltip kiểu Radix UI khi thu gọn */}
                  {isSidebarCollapsed && (
                    <div className="pointer-events-none absolute left-[calc(100%+8px)] z-50 hidden rounded-md bg-slate-900/90 backdrop-blur-xs px-2.5 py-1 text-[11px] font-medium text-white shadow-lg group-hover/navitem:flex items-center gap-1 whitespace-nowrap animate-in fade-in-0 zoom-in-95 duration-100">
                      <span>{item.label}</span>
                      {Boolean(item.count) && (
                        <span className="ml-1 px-1.5 py-0.2 rounded-full bg-rose-500/80 text-[10px] font-mono">
                          {item.count}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Mục Cấu hình SOP (cho Kế toán trưởng & CFO) */}
            {(user.role === 'CHIEF_ACCOUNTANT' || user.role === 'CFO') && (
              <div className="relative group/navitem flex items-center h-9 w-[240px]">
                <button
                  type="button"
                  onClick={() => setPolicyOpen(true)}
                  className={`flex h-9 items-center rounded-lg text-[13px] font-medium text-slate-700 hover:bg-black/5 hover:text-slate-950 transition-all duration-200 cursor-pointer overflow-hidden ${
                    isSidebarCollapsed ? 'w-9' : 'w-[240px]'
                  }`}
                  aria-label="Cấu hình SOP"
                >
                  <div className="w-9 h-9 shrink-0 flex items-center justify-center text-slate-500">
                    <Settings2 className="h-4 w-4" />
                  </div>
                  <div className={`flex items-center flex-1 min-w-0 pr-2.5 whitespace-nowrap transition-opacity duration-150 ${
                    isSidebarCollapsed ? 'opacity-0 pointer-events-none hidden' : 'opacity-100'
                  }`}>
                    <span className="truncate">Cấu hình SOP</span>
                  </div>
                </button>

                {isSidebarCollapsed && (
                  <div className="pointer-events-none absolute left-[calc(100%+8px)] z-50 hidden rounded-md bg-slate-900/90 backdrop-blur-xs px-2.5 py-1 text-[11px] font-medium text-white shadow-lg group-hover/navitem:flex items-center whitespace-nowrap animate-in fade-in-0 zoom-in-95 duration-100">
                    Cấu hình SOP
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ================= FOOTER: USER AVATAR CỐ ĐỊNH ================= */}
          <div className="pb-3 px-2.5 pt-2 border-t border-slate-200/60 shrink-0 w-full overflow-hidden">
            <div className="relative group/user flex items-center h-9 w-[240px]">
              <div
                onClick={() => isSidebarCollapsed && setIsSidebarCollapsed(false)}
                className={`flex h-9 items-center rounded-lg transition-all duration-200 cursor-pointer overflow-hidden ${
                  isSidebarCollapsed ? 'w-9 hover:bg-black/5' : 'w-[240px] hover:bg-black/5'
                }`}
              >
                {/* Avatar Slot: Giữ nguyên vị trí x=10px, y cố định, size h-7 w-7 */}
                <div className="w-9 h-9 shrink-0 flex items-center justify-center">
                  <div className="h-7 w-7 rounded-full bg-rose-500 text-white font-bold text-xs flex items-center justify-center shadow-xs transition hover:ring-2 hover:ring-rose-300">
                    {userInitials}
                  </div>
                </div>

                {/* Tên & Vai trò: Hiện khi mở rộng */}
                <div className={`flex flex-col min-w-0 pr-2.5 whitespace-nowrap transition-opacity duration-150 ${
                  isSidebarCollapsed ? 'opacity-0 pointer-events-none hidden' : 'opacity-100'
                }`}>
                  <span className="text-[13px] font-semibold text-slate-900 truncate leading-tight">
                    {user.displayName}
                  </span>
                  <span className="text-[11px] text-slate-500 truncate leading-tight">
                    {roleLabels[user.role]}
                  </span>
                </div>
              </div>

              {/* Floating Tooltip khi thu gọn */}
              {isSidebarCollapsed && (
                <div className="pointer-events-none absolute left-[calc(100%+8px)] z-50 hidden rounded-md bg-slate-900/90 backdrop-blur-xs px-2.5 py-1 text-[11px] font-medium text-white shadow-lg group-hover/user:flex flex-col whitespace-nowrap animate-in fade-in-0 zoom-in-95 duration-100">
                  <span className="font-semibold text-white">{user.displayName}</span>
                  <span className="text-[10px] text-slate-300">{roleLabels[user.role]}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* Right Content Area: Top Header + Main Workspace */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        
        {/* Top Header */}
        <header className="border-b border-slate-200 bg-white sticky top-0 z-30 shadow-subtle shrink-0">
          <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
            
            {/* Left: Role Switcher (Không có nút PanelLeftOpen thừa) */}
            <div className="flex items-center gap-3">
              {/* Role Switcher - Luôn hiển thị, không bao giờ khóa */}
              <div className="flex items-center rounded-xl bg-slate-100 p-1 border border-slate-200">
                {(['ACCOUNTANT', 'CHIEF_ACCOUNTANT', 'CFO'] as const).map((r) => {
                  const isActive = user.role === r;
                  return (
                    <button
                      key={r}
                      onClick={() => void switchRole(r)}
                      className={`rounded-lg px-2.5 sm:px-3 py-1 text-xs font-bold transition cursor-pointer ${
                        isActive
                          ? 'bg-slate-950 text-white shadow-sm'
                          : 'text-slate-600 hover:text-slate-950'
                      }`}
                    >
                      {roleLabels[r]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right: Actions, Benchmark link & logout */}
            <div className="flex items-center gap-2.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLedgerSyncOpen(true)}
                className="gap-1.5 text-xs font-bold text-slate-900 border-slate-300 hover:bg-slate-100 h-8 px-3"
              >
                <Building2 className="h-3.5 w-3.5 text-blue-600" />
                Đồng Bộ Sổ Sách
              </Button>

              <Link
                href="/verify"
                className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-900 transition h-8"
              >
                Verify Benchmark <ArrowRight className="h-3.5 w-3.5" />
              </Link>

              <div className="text-right hidden sm:block">
                <div className="text-xs font-bold text-slate-950">{user.displayName}</div>
                <div className="text-[11px] text-slate-500 font-mono">{user.email}</div>
              </div>

              <Button
                size="icon"
                variant="outline"
                onClick={onLogout}
                className="h-8 w-8 text-slate-600 hover:text-slate-950"
                title="Đăng xuất"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </header>

        {/* Center Workspace Content */}
        {view === 'notifications' ? (
          <NotificationCenterView
            onOpenPolicyModal={(tab) => {
              setPolicyOpen(true);
            }}
            onNavigateView={(nextView) => {
              setView(nextView as View);
            }}
            onUnreadChange={(count) => {
              setUnreadNotifCount(count);
            }}
          />
        ) : (
          <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto space-y-5">
            
            {/* Action & Reset Bar */}
            <div className="flex items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-950">
                  {view === 'receive' ? 'Tiếp Nhận Chứng Từ' : view === 'approval' ? 'Hồ Sơ Chờ Duyệt' : view === 'dossier' ? 'Hồ Sơ Đã Xử Lý' : view === 'reports' ? 'Báo Cáo Thuế' : 'Bàn Làm Việc Kế Toán'}
                </h1>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handleResetWorkspace()}
                disabled={isResetting}
                className="font-bold text-xs h-9 px-3 text-rose-700 hover:text-rose-800 hover:bg-rose-50 border-rose-200"
                title="Reset về trạng thái chưa có hóa đơn nào được gửi lên"
              >
                <RotateCcw className={`h-3.5 w-3.5 mr-1.5 ${isResetting ? 'animate-spin' : ''}`} />
                <span>{isResetting ? 'Đang reset...' : 'Reset'}</span>
              </Button>
            </div>

            {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">{error}</div>}
            
            {loading && (
              <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm font-bold text-slate-500 shadow-subtle">
                Đang tải dữ liệu...
              </div>
            )}

            {/* 4 Stat Metric Cards (To, Rõ số liệu, Cực ít chữ) */}
            {!loading && view !== 'receive' && view !== 'reports' && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-subtle">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Cần xử lý</span>
                  <div className="text-3xl font-extrabold font-numeric text-slate-950 mt-1">{pendingCount}</div>
                </div>
                <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-subtle">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">Routine</span>
                  <div className="text-3xl font-extrabold font-numeric text-emerald-700 mt-1">{counts.ROUTINE_PROPOSED || 0}</div>
                </div>
                <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-subtle">
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-700">Chờ KTT</span>
                  <div className="text-3xl font-extrabold font-numeric text-amber-700 mt-1">{counts.WAITING_CHIEF_ACCOUNTANT || 0}</div>
                </div>
                <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-subtle">
                  <span className="text-xs font-bold uppercase tracking-wider text-rose-700">Chờ CFO</span>
                  <div className="text-3xl font-extrabold font-numeric text-rose-700 mt-1">{counts.WAITING_CFO || 0}</div>
                </div>
              </div>
            )}

            {/* Receive Form View */}
            {!loading && view === 'receive' && (
              <Card className="p-6 sm:p-8 shadow-card">
                <InteractiveInputForm onEvaluateResult={handleEvaluateResult} dynamicConfig={config} />
              </Card>
            )}

            {/* Reports View */}
            {!loading && view === 'reports' && (
              <div className="grid gap-4 md:grid-cols-2">
                <Card className="p-6">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Chính sách hiện hành</span>
                  <p className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{policyVersion}</p>
                  <Button size="sm" variant="outline" onClick={() => setPolicyOpen(true)} className="mt-4 font-bold">
                    Quản trị quy tắc SOP →
                  </Button>
                </Card>

                <Card className="p-6">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Hệ số K (MacroState)</span>
                  <div className="mt-2 flex items-baseline justify-between">
                    <span className="text-3xl font-bold tracking-tight text-slate-950">{macro.kFactor.toFixed(2)}</span>
                    <Badge variant={macro.zone === 'SAFE_GREEN' ? 'success' : 'warning'}>
                      {macro.zone === 'SAFE_GREEN' ? 'An toàn' : 'Cảnh báo'}
                    </Badge>
                  </div>
                </Card>

                <Card className="p-6 md:col-span-2">
                  <h3 className="text-base font-bold text-slate-950 mb-2">Bản nháp tờ khai thuế</h3>
                  <Button variant="default" onClick={() => openTaxFormDraft('01/GTGT')} className="font-bold">
                    Mở tờ khai 01/GTGT
                  </Button>
                </Card>
              </div>
            )}

            {/* Main List & Review Grid */}
            {!loading && view !== 'receive' && view !== 'reports' && (
              selected && showDocumentPreview ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-subtle">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setShowDocumentPreview(false)}
                      className="font-bold text-xs"
                    >
                      ← Quay lại danh sách
                    </Button>
                    <span className="font-mono text-xs font-bold text-slate-950">
                      HĐ #{selected.invoice.invoiceNumber || selected.id}
                    </span>
                  </div>

                  <div className="grid gap-6 xl:grid-cols-2 items-start">
                    <DocumentViewer invoice={selected.invoice} onClose={() => setShowDocumentPreview(false)} />
                    <div>{renderReview()}</div>
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
        )}
      </div>

      {/* Floating Bulk Action Bar (1-Click Approve Routine) */}
      {selectedRoutineIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-[92%] max-w-xl bg-slate-950 text-white rounded-2xl p-4 shadow-2xl flex items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Đã chọn {selectedRoutineIds.size} ca Routine
            </div>
            <div className="text-lg font-extrabold font-numeric text-white mt-0.5">
              {formatVND(totalSelectedAmount)}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedRoutineIds(new Set())}
              disabled={isBulkConfirming}
              className="text-slate-300 hover:text-white"
            >
              Bỏ chọn
            </Button>
            <Button
              size="sm"
              variant="brand"
              onClick={() => void handleBulkConfirm()}
              disabled={isBulkConfirming}
              className="font-extrabold"
            >
              {isBulkConfirming ? 'Đang duyệt...' : 'DUYỆT HÀNG LOẠT'}
            </Button>
          </div>
        </div>
      )}

      <LedgerSyncModal
        open={ledgerSyncOpen}
        onOpenChange={setLedgerSyncOpen}
      />

      <PolicyViewerModal
        isOpen={policyOpen}
        onClose={() => setPolicyOpen(false)}
        onPolicyUpdated={(next) => setPolicyVersion(next)}
        onConfigUpdated={(next) => setConfig(next)}
      />
      <Toaster />
    </div>
  );
}
