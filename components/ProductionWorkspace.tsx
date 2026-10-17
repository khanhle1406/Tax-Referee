'use client';
import WorkflowAuditHistory from '@/components/WorkflowAuditHistory';
import WorkflowControls from '@/components/WorkflowControls';
import {HandoffContext} from '@/components/HandoffContext';
import {HandoffAnswerPanel} from '@/components/HandoffAnswerPanel';
import {PostAuditPanel} from '@/components/PostAuditPanel';

import {caseDeadline, eventLabels, riskGroupLabels, workflowStatusLabels} from '@/lib/workflowPresentation';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { WorkspaceInvoice } from '@/lib/workspaceTypes';
import { useWorkspaceData } from '@/components/workspace/useWorkspaceData';
import { ReportsView } from '@/components/workspace/ReportsView';
import { InvoiceList } from '@/components/workspace/InvoiceList';
import { WorkspaceShell } from '@/components/workspace/WorkspaceShell';
import { ScreenState, WorkspaceSkeleton } from '@/components/workspace/ScreenState';
import { workspaceRoutes, viewForPath, invoiceIdForPath, readInboxFilters, writeInboxFilters, readInvoiceTab, invoiceReturnPath, readListPage, replaceWorkspaceQuery, type WorkspaceView } from '@/lib/workspaceNavigation';
import { AlertTriangle, CheckCircle2, Clock, FileText, XCircle, ShieldAlert, Trash2 } from 'lucide-react';
const InteractiveInputForm=dynamic(()=>import('@/components/InteractiveInputForm').then(module=>module.InteractiveInputForm),{loading:()=> <WorkspaceSkeleton/>});
import { PolicyViewerModal } from '@/components/PolicyViewerModal';
import { LedgerSyncModal } from '@/components/LedgerSyncModal';
import { DocumentViewer } from '@/components/DocumentViewer';
import { InboxFilterToolbar, InboxFilterState, DEFAULT_FILTER_STATE } from '@/components/InboxFilterToolbar';
const NotificationCenterView=dynamic(()=>import('@/components/NotificationCenterView').then(module=>module.NotificationCenterView),{loading:()=> <WorkspaceSkeleton/>});
const TctReconciliationView=dynamic(()=>import('@/components/reconciliation/TctReconciliationView').then(module=>module.TctReconciliationView),{loading:()=> <WorkspaceSkeleton/>});
const BankStatementView=dynamic(()=>import('@/components/banking/BankStatementView').then(module=>module.BankStatementView),{loading:()=> <WorkspaceSkeleton/>});
const SupplierMasterView=dynamic(()=>import('@/components/suppliers/SupplierMasterView').then(module=>module.SupplierMasterView),{loading:()=> <WorkspaceSkeleton/>});
import { AuditTrailTable } from '@/components/AuditTrailTable';
import { TaxDefenseModal } from '@/components/TaxDefenseModal';
import { ActionOption, AuditEntry, InvoiceInput, RefereeDecision } from '@/lib/schemas';

import { formatVND } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

import { toast } from 'sonner';
import { DashboardView } from '@/components/workspace/DashboardView';
import { BatchesView } from '@/components/workspace/BatchesView';
import { ChannelsView } from '@/components/workspace/ChannelsView';
import { HistoryView } from '@/components/workspace/HistoryView';

type AppUser = { id: string; email: string; displayName: string; role: 'ACCOUNTANT' | 'CHIEF_ACCOUNTANT' | 'CFO' };
type View = WorkspaceView;
type InboxItem = WorkspaceInvoice;
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
  PAUSED: {label:'Đã dừng xử lý',variant:'warning'},
  EVALUATING: {label:'Đang đánh giá',variant:'info'},
  APPROVED: { label: 'Đã hoàn tất', variant: 'success' },
  REJECTED: { label: 'Từ chối', variant: 'destructive' },
  ON_HOLD: { label: 'Tạm dừng', variant: 'secondary' },
  FORWARDED: { label: 'Đã chuyển cấp trên', variant: 'warning' }
};

const roleCanApprove = (user: AppUser, item: InboxItem) => {
  if(item.allowedActions) return item.allowedActions.approve === true;
  if (item.status === 'WAITING_CFO' || item.status === 'FORWARDED') return user.role === 'CFO';
  if (item.status === 'WAITING_CHIEF_ACCOUNTANT') return user.role === 'CHIEF_ACCOUNTANT' || user.role === 'CFO';
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
  const [auditInvoiceId,setAuditInvoiceId]=useState('');

  const pathname=usePathname(); const router=useRouter(); const searchParams=useSearchParams();
  const view=viewForPath(pathname);
  const invoiceId=invoiceIdForPath(pathname);
  const invoiceTab=readInvoiceTab(new URLSearchParams(searchParams.toString()));
  const [detailError,setDetailError]=useState<'missing'|'network'|null>(null);
  const [detailLoading,setDetailLoading]=useState(false);
  const [detailAttempt,setDetailAttempt]=useState(0);
  const [hasVisitedReceive,setHasVisitedReceive]=useState(view==='receive');
  const [receiveDirty,setReceiveDirty]=useState(false);
  useEffect(()=>{if(view==='receive')setHasVisitedReceive(true);},[view]);
  const setView=useCallback((next:View):void=>{router.push(workspaceRoutes[next].path);},[router]);
  const {items,counts,isDemo,config,setConfig,policyVersion,setPolicyVersion,macro,duplicateGroups,unreadNotifCount,setUnreadNotifCount,loading,error,revision:workspaceRevision,loadWorkspace}=useWorkspaceData(onLogout);
  const [selected, setSelected] = useState<InboxItem | null>(null);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [saveAsPrecedent, setSaveAsPrecedent] = useState(false);
  const [filters,setFilterState]=useState<InboxFilterState>(()=>readInboxFilters(new URLSearchParams(searchParams.toString())));
  useEffect(()=>{if(!invoiceId)setFilterState(readInboxFilters(new URLSearchParams(searchParams.toString())));},[searchParams,invoiceId]);
  const setFilters=useCallback((next:InboxFilterState):void=>{setFilterState(next);replaceWorkspaceQuery(workspaceRoutes[view].path,writeInboxFilters(next));},[view]);
  const invoiceHref=(id:string):string=>{const params=writeInboxFilters(filters);const page=readListPage(new URLSearchParams(searchParams.toString()));if(page>1)params.set('page',String(page));params.set('from',view==='approval'?'approval':'inbox');return '/workspace/invoices/'+encodeURIComponent(id)+'?'+params.toString();};
  const openInvoice=(item:InboxItem):void=>{setSelected(item);router.push(invoiceHref(item.id));};
  useEffect(()=>{
    if(!invoiceId){setSelected(null);setDetailError(null);return;}
    const controller=new AbortController();setDetailLoading(true);setDetailError(null);
    fetch('/api/invoices/'+encodeURIComponent(invoiceId),{signal:controller.signal,cache:'no-store'}).then(async response=>{
      if(response.status===401){onLogout();return;}
      if(response.status===404){setSelected(null);setDetailError('missing');return;}
      if(!response.ok)throw new Error('Cannot load invoice');
      const data:{item:InboxItem}=await response.json();setSelected(data.item);
    }).catch(()=>{if(!controller.signal.aborted)setDetailError('network');}).finally(()=>{if(!controller.signal.aborted)setDetailLoading(false);});
    return ()=>controller.abort();
  },[invoiceId,detailAttempt,onLogout,workspaceRevision,user.role]);
  const [selectedRoutineIds, setSelectedRoutineIds] = useState<Set<string>>(new Set());
  const [isBulkConfirming, setIsBulkConfirming] = useState<boolean>(false);
  const [ledgerSyncOpen, setLedgerSyncOpen] = useState<boolean>(false);
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [selectedAuditEntry, setSelectedAuditEntry] = useState<AuditEntry | null>(null);
  const provisionalHoldIds=useMemo(()=>new Set(items.filter(item=>item.taxHold).map(item=>item.id)),[items]);

  const [confirmedFindings,setConfirmedFindings]=useState<string[]>([]);
  useEffect(()=>{setConfirmedFindings([]);setActionReason('');setSaveAsPrecedent(false);},[selected?.id,selected?.revision,user.id]);
  const [actionReason,setActionReason] = useState('');
  const [resolving,setResolving]=useState(false);const resolutionLock=useRef(false);const active=useRef(true);const activePath=useRef(pathname);activePath.current=pathname;
  const listScrollPositions=useRef(new Map<string,number>());
  useEffect(()=>{active.current=true;return ()=>{active.current=false;};},[]);
  const [precedentPurpose,setPrecedentPurpose] = useState('');
  const [precedentMaximum,setPrecedentMaximum] = useState('');
  const toggleProvisionalTaxHold = async (itemId:string) => {
    const item=items.find(i=>i.id===itemId);if(!item)return;
    try {
      const response=await fetch(`/api/invoices/${encodeURIComponent(itemId)}/audit-action`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:item.taxHold?'RELEASE_TAX_HOLD':'TAX_HOLD',reason:actionReason,evaluationId:item.evaluationId,revision:item.revision})});
      const data=await response.json();if(!response.ok)throw new Error(data.error);await loadWorkspace();showToast('Đã lưu trạng thái giữ thuế.','success');
    }catch(e){showToast(e instanceof Error?e.message:'Không thể giữ thuế','error');}
  };

  const renderSlaBadge = (item: InboxItem) => {
    if (!['WAITING_CHIEF_ACCOUNTANT', 'WAITING_CFO', 'NEEDS_CONFIRMATION', 'FORWARDED', 'ROUTINE_PROPOSED'].includes(item.status)) {
      return null;
    }
    const sla=caseDeadline(item.evaluatedAt || item.createdAt || item.updatedAt);
    if(!sla)return null;
    const urgent=sla.overdue || sla.hours<=4;
    return <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${urgent?'border-rose-200 bg-rose-50 text-rose-800':'border-amber-200 bg-amber-50 text-amber-800'}`} title="Mốc theo dõi nội bộ 24 giờ kể từ lượt đánh giá">
      <Clock className="h-3 w-3" aria-hidden="true"/>{sla.overdue?`Quá hạn ${sla.hours}h`:`Còn ${sla.hours}h`}
    </span>;
  };

  const itemStatusLabel=(item:InboxItem)=>item.status==='APPROVED' ? item.decision?.status==='ROUTINE' && !item.resolution ? 'Đã tự xử lý' : 'Đã được phê duyệt' : statusConfig[item.status]?.label || item.status;

  const auditEntries: AuditEntry[] = useMemo(() => {
    return items
      .filter((item) => Boolean(item.latestAudit))
      .map((item) => {
        const id = `AUDIT-${item.id}`;
        const isOverridden = ['INVOICE_HUMAN_OVERRIDE','OVERRIDE'].includes(item.latestAudit?.eventType || '');
        const initialStatus = item.decision?.status || (item.status === 'ROUTINE_PROPOSED' ? 'ROUTINE' : 'ESCALATED');
        return {
          id,
          invoiceRecordId: item.id,
          evaluationId: item.evaluationId || undefined,
          currentStatus: item.status,
          timestamp: item.latestAudit?.at || item.updatedAt,
          invoiceId: item.invoice.invoiceNumber || item.id,
          supplierName: item.supplierName,
          totalAmount: item.totalAmount,
          initialDecision: initialStatus as 'ROUTINE' | 'ESCALATED',
          riskGroup: item.decision?.status === 'ESCALATED' ? item.decision.riskGroup : undefined,
          actionTaken: isOverridden
            ? 'Người có thẩm quyền đã quyết định'
            : item.latestAudit?.eventType === 'ROUTINE_AUTO_APPROVED'
            ? 'Đã tự duyệt · chứng từ nội bộ'
            : item.latestAudit?.eventType && eventLabels[item.latestAudit.eventType]
            ? eventLabels[item.latestAudit.eventType]
            : item.status === 'APPROVED'
            ? 'Đã duyệt khấu trừ'
            : item.status === 'ROUTINE_PROPOSED'
            ? 'Đề xuất tự duyệt'
            : workflowStatusLabels[item.status] || item.status,
          actor: ((item.latestAudit?.payload?.actorRole as any) || (item.resolution?.role as any) || (item.latestAudit?.actorId ? 'UNKNOWN' : 'SYSTEM_REFEREE')),
          // Ca do người quyết định: hiện lý do của người duyệt, tách khỏi giải thích của hệ thống.
          plainExplanation: (item.latestAudit?.actorId && typeof item.latestAudit?.payload?.reason === 'string' ? `Lý do người duyệt: ${item.latestAudit.payload.reason}` : '') || item.decision?.plainExplanation || 'Đã kiểm tra đối chiếu qua bộ quy tắc Tax-SOP-2026',
          canOverride: Boolean(item.allowedActions?.approve || (isOverridden && item.allowedActions?.undo)),
          canUndo: Boolean(item.allowedActions?.undo),
          isOverridden,
          taxDefenseDossierReady: item.dossierReady===true,
          applicableRegulations: item.decision?.applicableRegulations || [],
          sopVersion: item.policyVersion || 'TAX-SOP-2026-v2.5'
        };
      });
  }, [items]);

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

  const approvalItems=useMemo(()=>items.filter(item=>{
    if(user.role==='ACCOUNTANT'||!['WAITING_CHIEF_ACCOUNTANT','WAITING_CFO','NEEDS_CONFIRMATION','FORWARDED','ON_HOLD'].includes(item.status))return false;
    const cfo=item.status==='WAITING_CFO'||item.status==='FORWARDED'||(item.decision?.status==='ESCALATED'&&item.decision.requiresCFO);
    return user.role==='CFO'||!cfo;
  }),[items,user.role]);
  const pendingCount=items.filter(item=>!['APPROVED','REJECTED','PAUSED'].includes(item.status)).length;
  const autoApprovedRoutineCount = items.filter((item) => item.status === 'APPROVED' && item.decision?.status === 'ROUTINE').length;

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
      status: decision.status === 'ROUTINE' ? 'APPROVED' : (decision.requiresCFO ? 'WAITING_CFO' : 'WAITING_CHIEF_ACCOUNTANT'),
      invoice,
      decision,
      policyVersion,
      evaluationId: null,
      legalVersion: null,
      updatedAt: new Date().toISOString(),
      resolution: null
    };
    setSelected(localItem);
    router.push('/workspace/invoices/'+encodeURIComponent(invoice.id));
    void loadWorkspace();
  };

  const handleResolve = async (option: ActionOption):Promise<void> => {
    if (!selected?.decision || selected.decision.status !== 'ESCALATED'||resolutionLock.current) return;
    resolutionLock.current=true;setResolving(true);const origin=pathname;
    try {
    showToast('Đang lưu phán quyết...', 'info');
    const response = await fetch('/api/resolutions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        invoiceId: selected.id,
        evaluationId: selected.evaluationId,
        optionId: option.id,
        revision:selected.revision,
        resolvedFindingIds:confirmedFindings,
        reason:actionReason,
        purpose:precedentPurpose,
        maximumAmount:Number(precedentMaximum),
        saveAsPrecedent
      })
    });
    const data = await response.json();
    if(!active.current)return;
    if (!response.ok) {
      if(response.status===409)await loadWorkspace();
      showToast(data.error&&data.error.length<100?data.error:'Không thể lưu. Hãy tải lại hồ sơ.', 'error');
      return;
    }
    if (data.precedent) {
      showToast(`Đã tạo Tiền lệ CFO (#${data.precedent.id})!`, 'success');
    } else {
      showToast('Đã lưu phán quyết thành công.', 'success');
    }
    setSaveAsPrecedent(false);
    if(activePath.current===origin)router.push(invoiceReturnPath(new URLSearchParams(searchParams.toString())));
    await loadWorkspace();
    } catch {if(active.current)showToast('Mất kết nối. Hãy thử lại.','error');}
    finally{resolutionLock.current=false;if(active.current)setResolving(false);}
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
      showToast(`Đang duyệt ${selectedRoutineIds.size} ca thường quy...`, 'info');
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
    if (!window.confirm('Xóa hết hóa đơn ('+(items.length>=200?'từ 200 trở lên':items.length)+') trong workspace này? Toàn bộ hóa đơn và chứng từ đính kèm sẽ bị xóa, nhật ký kiểm toán được giữ lại.')) {
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

  const visibleList = view === 'approval' ? approvalItems : [...items].sort((a,b)=>Number(['APPROVED','REJECTED'].includes(a.status))-Number(['APPROVED','REJECTED'].includes(b.status)));

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
          if (!['ROUTINE_PROPOSED', 'WAITING_CHIEF_ACCOUNTANT', 'WAITING_CFO', 'FORWARDED'].includes(item.status)) return false;
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
        <div className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center shadow-none">
          <FileText className="mb-2 h-10 w-10 text-slate-300" />
          <p className="font-medium text-slate-900 text-base">Chọn hóa đơn</p>

        </div>
      );
    }

    const decision = selected.decision;
    return (
      <Card className="space-y-5 p-6 sm:p-7 shadow-none">
        {/* Header - To & Rõ */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge variant={statusConfig[selected.status]?.variant || 'secondary'}>
                {itemStatusLabel(selected)}
              </Badge>
              {decision?.status === 'ROUTINE' && decision.precedentApplied && (
                <Badge variant="success">ÁP DỤNG TIỀN LỆ</Badge>
              )}
              {decision?.status === 'ESCALATED' && decision.duplicateInfo?.isDuplicate && (
                <Badge variant="destructive">TRÙNG HÓA ĐƠN</Badge>
              )}
              {provisionalHoldIds.has(selected.id) && (
                <Badge variant="info">TÁCH THUẾ TẠM TÍNH</Badge>
              )}
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
              HĐ #{selected.invoiceNumber}
            </h2>
            <p className="text-sm font-medium text-slate-700 mt-0.5">{selected.supplierName}</p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => router.push(invoiceReturnPath(new URLSearchParams(searchParams.toString())))}
              className="h-8 w-8 text-slate-400 hover:text-slate-950"
              aria-label="Về danh sách"
            >
              <XCircle className="h-5 w-5" />
            </Button>
          </div>
        </div>

        <dl className="grid gap-3 border-b pb-4 sm:grid-cols-3"><div><dt className="text-xs text-muted-foreground">Tổng thanh toán</dt><dd className="mt-1 text-lg font-semibold font-numeric">{formatVND(selected.totalAmount)}</dd></div><div><dt className="text-xs text-muted-foreground">Thuế GTGT</dt><dd className="mt-1 text-lg font-semibold font-numeric">{formatVND(selected.taxAmount)}</dd></div><div><dt className="text-xs text-muted-foreground">Ngày lập</dt><dd className="mt-1 text-base font-numeric">{selected.review?.unresolvedFields?.includes('invoiceDate')?'Chưa xác minh':formatDate(selected.invoiceDate)}</dd></div></dl>

        {/* Routine Outcome */}
        {decision?.status === 'ROUTINE' && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-5 space-y-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-700 shrink-0" />
              <div>
                <h3 className="font-semibold text-emerald-950 text-sm">
                  Thường quy
                </h3>
                <details className="mt-2 text-xs text-emerald-900"><summary className="cursor-pointer font-medium">Chi tiết đánh giá</summary><p className="mt-2 leading-relaxed">{decision.plainExplanation}</p></details>
              </div>
            </div>
            <p className="text-sm font-semibold">{selected.status==='APPROVED'?'Đã tự xử lý và tạo chứng từ nội bộ.':selected.status==='WAITING_CHIEF_ACCOUNTANT'?'Tự động hóa đang dừng: ca thường quy chờ Kế toán trưởng duyệt tay.':selected.status==='WAITING_CFO'?'Thẩm quyền không hạ theo số tiền: hồ sơ từng cần CFO và dữ liệu đã được người khác sửa, nên CFO phải duyệt tay.':'Hồ sơ đã bị can thiệp; xem trạng thái hiện hành trước khi xuất chứng từ.'}</p>
            {['WAITING_CHIEF_ACCOUNTANT','WAITING_CFO'].includes(selected.status) && <div className="grid gap-2">
              <label htmlFor="manual-approve-reason" className="text-xs">Lý do duyệt tay (ít nhất 8 ký tự)<textarea id="manual-approve-reason" value={actionReason} onChange={e=>setActionReason(e.target.value)} rows={2} className="mt-1 w-full rounded border p-2 text-sm" /></label>
              <Button type="button" disabled={resolving || actionReason.trim().length<8 || !selected.allowedActions?.approve} onClick={async()=>{setResolving(true);try{const response=await fetch(`/api/invoices/${encodeURIComponent(selected.id)}/audit-action`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'OVERRIDE',targetStatus:'APPROVED',reason:actionReason,revision:selected.revision,evaluationId:selected.evaluationId})});const data=await response.json();if(!response.ok)throw new Error(data.error||'Không thể duyệt');setActionReason('');showToast('Đã duyệt tay và ghi nhật ký.','success');await loadWorkspace();}catch(err){showToast(err instanceof Error?err.message:'Không thể duyệt','error');}finally{setResolving(false);}}}>{selected.allowedActions?.approve?'Duyệt tay':(selected.allowedActions?.blockedReason||'Cần Kế toán trưởng hoặc CFO')}</Button>
            </div>}
            <p className="text-xs">Cập nhật: {new Date(selected.updatedAt).toLocaleString('vi-VN')} · Chứng từ: {selected.internalVoucherId || 'Không có chứng từ có hiệu lực'}</p>
          </div>
        )}

        {/* Escalated Outcome */}
        {decision?.status === 'ESCALATED' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-700" />
                <span className="text-xs font-semibold text-amber-900">
                  {riskGroupLabels[decision.riskGroup]}
                </span>
              </div>
              <h3 className="whitespace-pre-line text-sm font-medium text-foreground leading-6">
                {decision.actionableQuestion}
              </h3>
              <p className="text-xs font-numeric font-medium text-slate-700 pt-1 flex items-center gap-1.5">
                <span className="text-slate-500">Căn cứ SOP:</span>
                <span className="font-semibold text-slate-900 bg-white/80 px-2 py-0.5 rounded border border-amber-200/80">{decision.sopClause}</span>
              </p>
            </div>

            {!['WAITING_CHIEF_ACCOUNTANT','WAITING_CFO','FORWARDED'].includes(selected.status) ? (
              <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">Câu hỏi này đã được xử lý — hồ sơ hiện ở trạng thái “{workflowStatusLabels[selected.status] || selected.status}”. Xem tab Lịch sử để thấy ai trả lời, lúc nào và lý do; dùng Hoàn tác bên dưới nếu cần mở lại.</p>
            ) : <HandoffAnswerPanel invoiceId={selected.id} decision={decision} revision={selected.revision} evaluationId={selected.evaluationId}
              canAnswer={user.role!=='ACCOUNTANT' && (!(decision.requiresCFO || selected.status==='FORWARDED') || user.role==='CFO') && ['WAITING_CHIEF_ACCOUNTANT','WAITING_CFO','FORWARDED'].includes(selected.status)}
              blockedHint={user.role==='ACCOUNTANT'?'Kế toán viên không trả lời câu hỏi chuyển tiếp. Trong demo, đổi vai trò ở góc trên.':(decision.requiresCFO && user.role!=='CFO')?'Ca này cần CFO. Trong demo, đổi vai trò sang CFO ở góc trên.':'Hồ sơ không còn chờ trả lời.'}
              onDone={loadWorkspace} />}

            {/* Danh sách toàn bộ vi phạm (IMP-P0: Multi-finding Engine) */}
            <HandoffContext decision={decision} showIssues={false} />
            {decision.findings && decision.findings.length > 1 && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 space-y-2.5">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                  <span>Phát hiện ({decision.findings.length})</span>

                </div>
                <div className="space-y-1.5">
                  {decision.findings.map((f, i) => (
                    <div key={i} className="flex items-start gap-2.5 text-xs bg-white p-2.5 rounded-lg border border-slate-200">
                      <span className={`px-1.5 py-0.5 rounded font-medium text-[10px] uppercase shrink-0 ${
                        f.kind === 'STATUTORY' ? 'bg-red-100 text-red-800 border border-red-200' :
                        f.kind === 'DATA_QUALITY' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                        f.kind === 'AUTHORITY' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                        'bg-amber-100 text-amber-800 border border-amber-200'
                      }`}>
                        {f.kind === 'STATUTORY' ? 'Luật định' :
                         f.kind === 'DATA_QUALITY' ? 'Dữ liệu' :
                         f.kind === 'AUTHORITY' ? 'Thẩm quyền' : 'Nội bộ'}
                      </span>
                      <div className="flex-1">
                        <span className="font-semibold text-slate-800 block">{f.flaggedReason}</span>
                        {f.legalBasis && (
                          <span className="block text-[10px] text-slate-500 font-numeric font-medium mt-0.5">{f.legalBasis}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Checkbox Save As Precedent */}
            {selected.allowedActions?.savePrecedent && (
              <label className="flex items-center gap-2.5 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer">
                <input
                  type="checkbox"
                  checked={saveAsPrecedent}
                  onChange={(e) => setSaveAsPrecedent(e.target.checked)}
                  className="rounded border-slate-300 text-slate-950 focus:ring-slate-950 w-4 h-4 cursor-pointer"
                />
                <span className="text-xs font-medium text-slate-900">
                  Lưu làm Tiền lệ Ngoại lệ cho đối tác này (áp dụng 6 tháng)
                </span>
              </label>
            )}

            <details className="rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer text-xs font-medium text-slate-700">Thao tác thủ công (nâng cao): chọn phương án A/B của phát hiện chính, xác nhận từng phát hiện</summary><div className="mt-3 space-y-3">
            <label htmlFor="manual-resolve-reason" className="block text-sm">Lý do / bằng chứng (ít nhất 8 ký tự)<textarea id="manual-resolve-reason" value={actionReason} onChange={e=>setActionReason(e.target.value)} className="mt-1 w-full rounded border p-2" /></label>
            {saveAsPrecedent && <div className="grid gap-2"><label>Mục đích được phép<input value={precedentPurpose} onChange={e=>setPrecedentPurpose(e.target.value)} className="w-full border p-2" /></label><label>Trần tiền CFO cho phép<input type="number" min="1" value={precedentMaximum} onChange={e=>setPrecedentMaximum(e.target.value)} className="w-full border p-2" /></label></div>}
            {decision.findings?.map(f=><label key={f.ruleId} className="flex gap-2 text-sm"><input type="checkbox" checked={confirmedFindings.includes(f.ruleId)} onChange={e=>setConfirmedFindings(prev=>e.target.checked?[...prev,f.ruleId]:prev.filter(id=>id!==f.ruleId))} />Đã xử lý: {f.flaggedReason}</label>)}
            {/* A/B Option Buttons */}
            <div className="grid gap-3 sm:grid-cols-2">
              {decision.options.map((option, idx) => (
                <button
                  key={option.id}
                  onClick={() => void handleResolve(option)}
                  disabled={resolving || actionReason.trim().length<8 || (["ACCEPT_WITH_DOCS","ACCEPT_ADJUSTMENT","ACCEPT_WITH_DEFENSE_DOSSIER"].includes(option.resultingAction) ? (!selected.allowedActions?.approve || decision.findings?.some(f=>!confirmedFindings.includes(f.ruleId))) : !selected.allowedActions?.requestInformation)}
                  className="p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-950 hover:shadow-none text-left transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer group"
                >
                  <span className="text-xs font-medium text-slate-500 uppercase tracking-wider block mb-1">
                    PHƯƠNG ÁN {idx === 0 ? 'A' : 'B'}
                  </span>
                  <span className="block font-medium text-sm text-slate-950">{option.label}</span>
                  <span className="block text-xs font-medium text-slate-600 mt-1 leading-relaxed">
                    {option.actionDescription}
                  </span>
                </button>
              ))}
            </div>

            </div></details>

            <details className="rounded-xl border border-slate-200 p-3 text-xs"><summary className="cursor-pointer font-medium text-slate-700">Giữ thuế tạm thời{provisionalHoldIds.has(selected.id) ? ' · Đang giữ' : ''}</summary>
            {/* Tách thuế tạm tính */}
            <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-1.5 text-xs font-medium text-blue-950 uppercase tracking-wide">
                  <ShieldAlert className="h-4 w-4 text-blue-700" />
                  <span>Giữ thuế tạm thời</span>
                </div>
                <p className="text-xs text-blue-900 mt-1 leading-relaxed">
                  {provisionalHoldIds.has(selected.id)
                    ? 'Đã tạm giữ thuế GTGT (chưa kê khai khấu trừ kỳ này), hồ sơ chờ xác minh và đánh giá lại.'
                    : 'Nếu cận hạn nộp tờ khai, tạm loại số tiền thuế GTGT này ra khỏi kỳ kê khai hiện tại để tránh bị xử phạt truy thu.'}
                </p>
              </div>
              <Button
                size="sm"
                variant={provisionalHoldIds.has(selected.id) ? 'default' : 'outline'}
                onClick={() => toggleProvisionalTaxHold(selected.id)}
                className={`text-xs font-medium shrink-0 ${
                  provisionalHoldIds.has(selected.id)
                    ? 'bg-blue-700 hover:bg-blue-800 text-white'
                    : 'border-blue-300 text-blue-900 hover:bg-blue-100'
                }`}
              >
                {provisionalHoldIds.has(selected.id) ? 'Đã giữ thuế' : 'Giữ thuế'}
              </Button>
            </div>

            </details>

          </div>
        )}

        <WorkflowControls key={`${selected.id}:${selected.revision}`} item={selected} user={user} onRefresh={loadWorkspace} reasonValue={actionReason} onReasonChange={setActionReason} hideReasonInput={false} />
        {/* Export actions */}
        {(selected.status === 'APPROVED' || selected.status === 'REJECTED') && (
          <div className="flex gap-2 pt-4 border-t border-slate-100">
            <Button variant="outline" size="sm" onClick={() => void exportDossier('json')} className="font-medium">
              Xuất JSON
            </Button>
            <Button variant="default" size="sm" onClick={() => void exportDossier('print')} className="font-medium">
              Bản in PDF
            </Button>
            <Button variant="secondary" size="sm" onClick={() => openTaxFormDraft('04/SS-HĐĐT')} className="font-medium">
              Mẫu 04/SS-HĐĐT
            </Button>
          </div>
        )}
      </Card>
    );
  };

  const renderList=(list:InboxItem[]):React.ReactElement => <InvoiceList items={list} empty={items.length===0} href={invoiceHref} statusLabel={itemStatusLabel} variant={item=>statusConfig[item.status]?.variant||'secondary'} deadline={renderSlaBadge} scrollPositions={listScrollPositions.current}/>;

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
    <WorkspaceShell view={view} user={user} demo={isDemo} counts={{pending:pendingCount,approvals:approvalItems.length,notifications:unreadNotifCount}} onRoleChange={switchRole} onLogout={onLogout} onReset={handleResetWorkspace} resetting={isResetting} detail={Boolean(invoiceId)} dirty={receiveDirty}>
      {hasVisitedReceive && <main className={view==='receive'?'workspace-content receive-active':'hidden'} aria-hidden={view!=='receive'}>
        <InteractiveInputForm onEvaluateResult={handleEvaluateResult} dynamicConfig={config} onDirtyChange={setReceiveDirty}/>
      </main>}
      {view!=='receive' && <>
        {/* Center Workspace Content */}
        {view === 'notifications' ? (
          <main>
          <NotificationCenterView
            onOpenPolicyModal={(tab) => {const allowed=['VIEW','EDIT','TIMELINE','LEGAL','PRECEDENTS','STUDIO'];router.push('/workspace/policy'+(tab&&allowed.includes(tab)?'?tab='+tab:''));}}
            onNavigateView={(nextView) => {
              const path='/workspace/'+nextView;if(Object.values(workspaceRoutes).some(route=>route.path===path))router.push(path);
            }}
            onUnreadChange={setUnreadNotifCount}
          />
          </main>
        ) : (
          <main className="workspace-content space-y-5">
            
            {!invoiceId && <div className="workspace-heading"><h1>{workspaceRoutes[view].label}</h1><div className="flex items-center gap-3">{['reports','reconciliation','banking','suppliers'].includes(view)&&<details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Dữ liệu demo / adapter</summary><p className="mt-2 max-w-xs">Chưa xác nhận kết nối ERP, ngân hàng, TCT hoặc cập nhật pháp luật trực tiếp.</p></details>}{['inbox','approval'].includes(view)&&<Link href="/workspace/receive" className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-primary px-4 text-sm font-medium text-primary-foreground"><FileText className="h-4 w-4"/>Tiếp nhận</Link>}</div></div>}
            {error && <ScreenState error title="Không thể tải dữ liệu" description="Kiểm tra kết nối rồi thử lại." onRetry={()=>void loadWorkspace()}/>}
            {loading && <WorkspaceSkeleton/>}
            {!loading&&!error&&!invoiceId&&['inbox','approval'].includes(view)&&<div className="workspace-metrics">
              <button type="button" onClick={()=>setFilters({...DEFAULT_FILTER_STATE,approvalStatus:'PENDING'})}><strong>{pendingCount}</strong><span>Cần xử lý</span></button>
              <button type="button" onClick={()=>setFilters({...DEFAULT_FILTER_STATE,riskGroup:'ROUTINE',approvalStatus:'APPROVED'})}><strong>{autoApprovedRoutineCount}</strong><span>Đã tự duyệt</span></button>
              <Link href="/workspace/approvals" className="flex flex-wrap items-baseline gap-2 rounded-lg px-3 py-2"><strong className="text-[22px] font-semibold">{counts.WAITING_CHIEF_ACCOUNTANT||0}</strong><span className="text-[13px] text-muted-foreground">Chờ KTT</span></Link>
              <Link href="/workspace/approvals" className="flex flex-wrap items-baseline gap-2 rounded-lg px-3 py-2"><strong className="text-[22px] font-semibold">{counts.WAITING_CFO||0}</strong><span className="text-[13px] text-muted-foreground">Chờ CFO</span></Link>
            </div>}
            {/* Reports use server values and an explicit draft period. */}
            {!loading&&!error&&view==='reports'&&<ReportsView macro={macro} items={items} policyVersion={policyVersion}/>}
            {!loading&&!error&&view==='dashboard'&&<DashboardView user={user}/>}
            {!loading&&!error&&view==='batches'&&<BatchesView user={user}/>}
            {!loading&&!error&&view==='channels'&&<ChannelsView user={user}/>}
            {!loading&&!error&&view==='history'&&<HistoryView user={user}/>}

            {/* TCT Reconciliation View */}
            {!loading && !error && view === 'reconciliation' && (
              <TctReconciliationView onNavigateToInvoice={(invId: string) => {router.push('/workspace/invoices/'+encodeURIComponent(invId));              }} />
            )}

            {/* Bank Statement View */}
            {!loading && !error && view === 'banking' && (
              <BankStatementView onNavigateToInvoice={(invId: string) => {router.push('/workspace/invoices/'+encodeURIComponent(invId));              }} />
            )}

            {/* Supplier Master View */}
            {!loading && !error && view === 'suppliers' && (
              <SupplierMasterView />
            )}

            {/* Dossier / Audit Trail View (Tiêu chí 6: 20 Điểm) */}
            {!loading && !error && view === 'dossier' && (
              <div className="space-y-4">
                <PostAuditPanel canReview={user.role !== 'ACCOUNTANT'} onChanged={loadWorkspace} />
                <label className="block text-sm">Chọn hồ sơ để xem đầu vào và lịch sử<select className="mt-1 w-full rounded border p-2" value={auditInvoiceId} onChange={e=>setAuditInvoiceId(e.target.value)}><option value="">Chọn hồ sơ</option><option value="system:auto-approve">Sự kiện hệ thống · công tắc dừng tự động hóa</option>{items.map(i=><option key={i.id} value={i.id}>{i.invoiceNumber} · {i.supplierName} · {workflowStatusLabels[i.status] || i.status}</option>)}</select></label>
                {auditInvoiceId && <WorkflowAuditHistory key={`${auditInvoiceId}:${items.find(i=>i.id===auditInvoiceId)?.revision}`} invoiceId={auditInvoiceId} />}
                <AuditTrailTable
                  entries={auditEntries}
                  onViewDossier={(entry) => setSelectedAuditEntry(entry)}
                  onOverride={async (entry, targetStatus, reason) => {
                    const target = items.find(i => i.id === entry.invoiceRecordId);
                    if (targetStatus === 'APPROVED' && target?.decision?.status === 'ESCALATED' && ['WAITING_CHIEF_ACCOUNTANT', 'WAITING_CFO', 'FORWARDED'].includes(target.status)) {
                      showToast('Ca chuyển tiếp: mở hồ sơ để xác nhận từng phát hiện rồi mới duyệt.', 'info');
                      router.push(`/workspace/invoices/${encodeURIComponent(target.id)}`);
                      return;
                    }
                    try {
                      const response = await fetch(`/api/invoices/${encodeURIComponent(entry.invoiceRecordId || '')}/audit-action`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'OVERRIDE', targetStatus, reason,revision:items.find(i=>i.id===entry.invoiceRecordId)?.revision,evaluationId:items.find(i=>i.id===entry.invoiceRecordId)?.evaluationId })
                      });
                      const data = await response.json();
                      if (!response.ok) throw new Error(data.error || 'Không thể ghi đè quyết định');
                      showToast('Đã ghi đè và lưu vào nhật ký kiểm toán.', 'success');
                      await loadWorkspace();
                    } catch (err) { showToast(err instanceof Error ? err.message : 'Không thể ghi đè', 'error'); }
                  }}
                  onUndo={async (entry, reason) => {
                    try {
                      const response = await fetch(`/api/invoices/${encodeURIComponent(entry.invoiceRecordId || '')}/audit-action`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'UNDO', reason,revision:items.find(i=>i.id===entry.invoiceRecordId)?.revision,evaluationId:items.find(i=>i.id===entry.invoiceRecordId)?.evaluationId })
                      });
                      const data = await response.json();
                      if (!response.ok) throw new Error(data.error || 'Không thể hoàn tác');
                      showToast('Đã ghi nhận bút toán hoàn tác trong audit.', 'success');
                      await loadWorkspace();
                    } catch (err) { showToast(err instanceof Error ? err.message : 'Không thể hoàn tác', 'error'); }
                  }}
                />
              </div>
            )}

            {!loading&&!error&&view==='policy'&&<PolicyViewerModal isOpen onClose={()=>setView('inbox')} presentation="page" onPolicyUpdated={setPolicyVersion} onConfigUpdated={setConfig}/>}
            {!loading&&!error&&view==='ledger'&&<LedgerSyncModal open onOpenChange={open=>{if(!open)setView('inbox');}} presentation="page"/>}
            {!loading&&!error&&invoiceId&&<>
              <Link href={invoiceReturnPath(new URLSearchParams(searchParams.toString()))} className="text-sm text-muted-foreground hover:text-foreground">← Quay lại danh sách</Link>
              <nav className="invoice-detail-tabs" aria-label="Các phần của hồ sơ">{([{id:'review',label:'Xử lý'},{id:'source',label:'Chứng từ'},{id:'history',label:'Lịch sử'}] as const).map(tab=>{const query=new URLSearchParams(searchParams.toString());query.set('tab',tab.id);return <Link key={tab.id} href={pathname+'?'+query.toString()} aria-current={invoiceTab===tab.id?'page':undefined}>{tab.label}</Link>;})}</nav>
              {detailLoading?<WorkspaceSkeleton/>:detailError?<ScreenState error title={detailError==='missing'?'Không tìm thấy hồ sơ':'Không thể tải hồ sơ'} description={detailError==='missing'?'Hồ sơ không có trong workspace đang mở.':'Kiểm tra kết nối rồi thử lại.'} onRetry={()=>setDetailAttempt(a=>a+1)}/>:selected&&<>
                {invoiceTab==='review'&&<div className={selected.invoice.sourceArtifactId?'grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]':'mx-auto max-w-4xl'}>{selected.invoice.sourceArtifactId&&<div className="hidden xl:block"><DocumentViewer invoice={selected.invoice}/></div>}{renderReview()}</div>}
                {invoiceTab==='source'&&<DocumentViewer invoice={selected.invoice}/>}
                {invoiceTab==='history'&&<WorkflowAuditHistory key={selected.id+':'+selected.revision} invoiceId={selected.id}/>}
              </>}
            </>}
            {!loading&&!error&&!invoiceId&&['inbox','approval'].includes(view)&&<div className="space-y-3">
              <InboxFilterToolbar filters={filters} onChange={setFilters} totalCount={visibleList.length} filteredCount={filteredList.length}/>
              {(isDemo||process.env.NEXT_PUBLIC_ALLOW_WORKSPACE_RESET==='1')&&items.length>0&&<div className="flex justify-end"><Button type="button" variant="outline" size="sm" disabled={isResetting} onClick={()=>void handleResetWorkspace()} className="gap-2 text-rose-700"><Trash2 className="h-4 w-4"/>{isResetting?'Đang xóa…':'Xóa hết hóa đơn'}</Button></div>}
              {renderList(filteredList)}
              <p className="text-xs text-muted-foreground">{items.length} hồ sơ được tải, tối đa 200 hồ sơ gần nhất.</p>
            </div>}
          </main>
        )}
      </>}

      {/* Floating Bulk Action Bar (1-Click Approve Routine) */}
      {selectedRoutineIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-[92%] max-w-xl bg-slate-950 text-white rounded-2xl p-4 shadow-2xl flex items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div>
            <div className="text-xs font-semibold text-slate-400">
              Đã chọn {selectedRoutineIds.size} ca thường quy
            </div>
            <div className="text-lg font-semibold font-numeric text-white mt-0.5">
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
              disabled={isBulkConfirming || user.role === 'ACCOUNTANT'}
              className="font-semibold"
            >
              {isBulkConfirming ? 'Đang duyệt...' : user.role === 'ACCOUNTANT' ? 'CHỜ KTT DUYỆT' : 'DUYỆT HÀNG LOẠT'}
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

      <TaxDefenseModal
        entry={selectedAuditEntry}
        onClose={() => setSelectedAuditEntry(null)}
      />
    </WorkspaceShell>
  );
}
