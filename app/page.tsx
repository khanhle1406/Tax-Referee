'use client';

import React, { useState, useEffect } from 'react';
import { HeaderBanner } from '@/components/HeaderBanner';
import { VerifyHarness } from '@/components/VerifyHarness';
import { MacroHealthWidget } from '@/components/MacroHealthWidget';
import { InteractiveInputForm } from '@/components/InteractiveInputForm';
import { EscalationCard } from '@/components/EscalationCard';
import { AuditTrailTable } from '@/components/AuditTrailTable';
import { PolicyViewerModal } from '@/components/PolicyViewerModal';
import { TaxDefenseModal } from '@/components/TaxDefenseModal';
import {
  InvoiceInput,
  RefereeDecision,
  EscalatedDecision,
  ActionOption,
  AuditEntry,
  MacroState
} from '@/lib/schemas';
import { MACRO_DEFAULTS, STORAGE_KEYS } from '@/lib/constants';
import { calculateKFactor, evaluateInvoiceLocally } from '@/services/policyEngine';
import { MOCK_INVOICES } from '@/data/mockInvoices';
import { ShieldCheck, Layers, FileSpreadsheet, Zap, FilePlus } from 'lucide-react';
import confetti from 'canvas-confetti';

export default function DashboardPage() {
  // Modal states
  const [isPolicyOpen, setIsPolicyOpen] = useState(false);
  const [dossierEntry, setDossierEntry] = useState<AuditEntry | null>(null);

  // Business state
  const [activeInputTab, setActiveInputTab] = useState<'VERIFY' | 'CUSTOM'>('VERIFY');
  const [currentSopVersion, setCurrentSopVersion] = useState<string>('v2.1');
  const [escalatedCase, setEscalatedCase] = useState<EscalatedDecision | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [macroState, setMacroState] = useState<MacroState>({
    totalSales: MACRO_DEFAULTS.TOTAL_SALES,
    openingInventory: MACRO_DEFAULTS.OPENING_INVENTORY,
    totalPurchases: MACRO_DEFAULTS.INITIAL_PURCHASES,
    kFactor: 1.20,
    zone: 'SAFE_GREEN',
    totalDeductibleTax: 760_000_000 // Khấu trừ khởi điểm tích lũy
  });

  // Client-side hydration from localStorage
  useEffect(() => {
    try {
      const savedLogs = localStorage.getItem(STORAGE_KEYS.AUDIT_LOG);
      if (savedLogs) setAuditEntries(JSON.parse(savedLogs));

      const savedMacro = localStorage.getItem(STORAGE_KEYS.MACRO_STATE);
      if (savedMacro) setMacroState(JSON.parse(savedMacro));

      const savedPolicy = localStorage.getItem(STORAGE_KEYS.POLICY_METADATA);
      if (savedPolicy) {
        const parsed = JSON.parse(savedPolicy);
        if (parsed.version) setCurrentSopVersion(parsed.version);
      }
    } catch (e) {
      console.warn('Lỗi khi tải dữ liệu từ localStorage', e);
    }
  }, []);

  // Persist to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.AUDIT_LOG, JSON.stringify(auditEntries));
      localStorage.setItem(STORAGE_KEYS.MACRO_STATE, JSON.stringify(macroState));
    } catch (e) {
      console.warn('Lỗi khi lưu dữ liệu vào localStorage', e);
    }
  }, [auditEntries, macroState]);

  // Handler: Reset toàn bộ dữ liệu mẫu
  const handleResetData = () => {
    if (confirm('Bạn có chắc chắn muốn làm mới toàn bộ dữ liệu kiểm thử về trạng thái ban đầu?')) {
      const freshMacro: MacroState = {
        totalSales: MACRO_DEFAULTS.TOTAL_SALES,
        openingInventory: MACRO_DEFAULTS.OPENING_INVENTORY,
        totalPurchases: MACRO_DEFAULTS.INITIAL_PURCHASES,
        kFactor: 1.20,
        zone: 'SAFE_GREEN',
        totalDeductibleTax: 760_000_000
      };
      setMacroState(freshMacro);
      setAuditEntries([]);
      setEscalatedCase(null);
      setSelectedCaseId(null);
      localStorage.removeItem(STORAGE_KEYS.AUDIT_LOG);
      localStorage.removeItem(STORAGE_KEYS.MACRO_STATE);
    }
  };

  // Handler: Tiếp nhận kết quả đối soát từ Form hoặc Upload
  const handleEvaluateResult = (decision: RefereeDecision, invoice: InvoiceInput) => {
    if (decision.status === 'ROUTINE') {
      // Nhánh Thường quy: AI tự duyệt 100% -> Xóa bỏ case ngoại lệ cũ trên Escalation Card
      setEscalatedCase(null);
      setSelectedCaseId(null);

      const newEntry: AuditEntry = {
        id: `AUD-${Date.now().toString().slice(-6)}`,
        timestamp: new Date().toISOString(),
        invoiceId: invoice.invoiceNumber,
        supplierName: invoice.supplierName,
        totalAmount: invoice.totalAmount,
        initialDecision: 'ROUTINE',
        actionTaken: 'Tự động duyệt 100% (Straight-Through)',
        actor: 'SYSTEM_REFEREE',
        plainExplanation: decision.plainExplanation,
        canOverride: true,
        isOverridden: false,
        taxDefenseDossierReady: true,
        applicableRegulations: decision.applicableRegulations,
        sopVersion: decision.sopVersion || currentSopVersion
      };

      setAuditEntries(prev => [newEntry, ...prev]);

      // Cập nhật Hệ số K và Tờ khai thuế
      const newPurchases = macroState.totalPurchases + invoice.preTaxAmount;
      const { kFactor, zone } = calculateKFactor(invoice.preTaxAmount);
      setMacroState(prev => ({
        ...prev,
        totalPurchases: newPurchases,
        kFactor,
        zone,
        totalDeductibleTax: prev.totalDeductibleTax + decision.approvedTaxAmount
      }));

      // Bắn pháo hoa nhỏ ăn mừng duyệt hợp lệ
      confetti({
        particleCount: 30,
        spread: 50,
        origin: { y: 0.6 }
      });
    } else {
      // Nhánh Chuyển tiếp: Dừng tự động hóa, hiển thị Escalation Card
      setSelectedCaseId(invoice.id || invoice.invoiceNumber);
      setEscalatedCase(decision);
    }
  };

  // Handler: Con người quyết định trên Escalation Card (Nút A hoặc B)
  const handleResolveEscalation = (option: ActionOption) => {
    if (!escalatedCase) return;

    const actor = escalatedCase.requiresCFO ? 'CFO' : 'CHIEF_ACCOUNTANT';
    const isAccepted = option.resultingAction === 'ACCEPT_WITH_DOCS' || option.resultingAction === 'ACCEPT_ADJUSTMENT';

    const newEntry: AuditEntry = {
      id: `AUD-${Date.now().toString().slice(-6)}`,
      timestamp: new Date().toISOString(),
      invoiceId: escalatedCase.invoiceId,
      supplierName: escalatedCase.supplierName,
      totalAmount: escalatedCase.totalAmount,
      initialDecision: 'ESCALATED',
      riskGroup: escalatedCase.riskGroup,
      actionTaken: `${actor === 'CFO' ? 'CFO' : 'KTT'} chọn: ${option.label}`,
      actor,
      plainExplanation: `Đã chọn: "${option.actionDescription}". Căn cứ: ${escalatedCase.sopClause}.`,
      canOverride: true,
      isOverridden: false,
      taxDefenseDossierReady: true,
      applicableRegulations: escalatedCase.applicableRegulations,
      sopVersion: escalatedCase.sopVersion || currentSopVersion
    };

    setAuditEntries(prev => [newEntry, ...prev]);

    // Nếu con người chấp thuận, tính thuế tương ứng
    if (isAccepted) {
      const taxRate = escalatedCase.taxRate || 8;
      const estimatedTax = Math.round(escalatedCase.totalAmount * (taxRate / (100 + taxRate)));
      const { kFactor, zone } = calculateKFactor(escalatedCase.totalAmount);

      setMacroState(prev => ({
        ...prev,
        totalPurchases: prev.totalPurchases + escalatedCase.totalAmount,
        kFactor,
        zone,
        totalDeductibleTax: prev.totalDeductibleTax + estimatedTax
      }));
    }

    // Ẩn Escalation Card và bỏ highlight sau khi đã giải quyết
    setEscalatedCase(null);
    setSelectedCaseId(null);
  };

  // Handler: Hoàn tác một quyết định trong Audit Trail
  const handleUndo = (id: string) => {
    const entryToUndo = auditEntries.find(e => e.id === id);
    if (!entryToUndo) return;

    if (confirm(`Bạn có chắc muốn hoàn tác quyết định cho hóa đơn ${entryToUndo.invoiceId}?`)) {
      setAuditEntries(prev => prev.filter(e => e.id !== id));
      // Khôi phục lại Hệ số K và trừ lại thuế nếu từng duyệt
      if (entryToUndo.initialDecision === 'ROUTINE') {
        const estTax = Math.round(entryToUndo.totalAmount * 0.08);
        setMacroState(prev => ({
          ...prev,
          totalPurchases: Math.max(prev.totalPurchases - entryToUndo.totalAmount, MACRO_DEFAULTS.INITIAL_PURCHASES),
          totalDeductibleTax: Math.max(prev.totalDeductibleTax - estTax, 0)
        }));
      }
    }
  };

  // Handler: Ghi đè (Override)
  const handleOverride = (id: string) => {
    setAuditEntries(prev =>
      prev.map(e => {
        if (e.id === id) {
          const newAction = e.isOverridden ? 'Khôi phục quyết định gốc' : 'Ghi đè cưỡng chế bởi KTT/CFO';
          return { ...e, isOverridden: !e.isOverridden, actionTaken: newAction };
        }
        return e;
      })
    );
  };

  // Handler: Chọn 1 ca Escalated từ bảng Verify 90s để xem chi tiết
  const handleSelectEscalatedCaseFromVerify = (testId: string) => {
    setSelectedCaseId(testId);
    const inv = MOCK_INVOICES.find(i => i.id === testId);
    if (inv) {
      const decision = evaluateInvoiceLocally(inv);
      if (decision.status === 'ESCALATED') {
        setEscalatedCase(decision);
      }
    }
  };

  // Handler: Chọn nhanh preset từ Empty State của EscalationCard
  const handleSelectPresetCase = (testId: string) => {
    setSelectedCaseId(testId);
    const inv = MOCK_INVOICES.find(i => i.id === testId);
    if (inv) {
      const decision = evaluateInvoiceLocally(inv);
      if (decision.status === 'ESCALATED') {
        setEscalatedCase(decision);
      }
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 selection:bg-amber-500 selection:text-slate-950">
      {/* Top Banner Guide */}
      <HeaderBanner
        onOpenPolicy={() => setIsPolicyOpen(true)}
        onResetData={handleResetData}
        sopVersion={currentSopVersion}
      />

      {/* Main Dashboard Layout */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Brand Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-3">
              <span className="p-2 bg-gradient-to-tr from-amber-500 to-amber-600 rounded-xl text-slate-950 shadow-lg shadow-amber-500/20">
                <ShieldCheck className="w-7 h-7 stroke-[2.5]" />
              </span>
              TAX REFEREE <span className="text-amber-400 font-mono text-xl sm:text-2xl font-normal">· Escalation Dashboard</span>
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Hệ thống Trọng tài Điều phối Chuyển tiếp Thuế Doanh nghiệp · Type-Safe Jev Engine & Gemini AI
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-slate-400 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl self-start sm:self-auto">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Jev System One: <strong className="text-slate-200">READY</strong></span>
            <span>·</span>
            <span>Gemini Flash: <strong className="text-slate-200">ACTIVE</strong></span>
          </div>
        </div>

        {/* Tier 1: Macro Health Widget spanning the entire width */}
        <MacroHealthWidget macroState={macroState} />

        {/* Tier 2: 2-Column Core Workflow (Left: Input & Test / Right: Human Referee Decision) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT COLUMN (6 Cols): Unified Input & Verification Console */}
          <div className="lg:col-span-6 space-y-3">
            {/* Tab Switcher */}
            <div className="flex items-center gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-xl">
              <button
                onClick={() => setActiveInputTab('VERIFY')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeInputTab === 'VERIFY'
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-500 text-slate-950 shadow-md font-black'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Zap className="w-4 h-4" />
                <span>1. Kiểm Thử 5 Ca Chuẩn (Verify 90s)</span>
              </button>

              <button
                onClick={() => setActiveInputTab('CUSTOM')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeInputTab === 'CUSTOM'
                    ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 shadow-md font-black'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <FilePlus className="w-4 h-4" />
                <span>2. Thẩm Định Hóa Đơn Tùy Biến (Form)</span>
              </button>
            </div>

            {/* Content by active tab */}
            {activeInputTab === 'VERIFY' ? (
              <VerifyHarness
                onSelectEscalatedCase={handleSelectEscalatedCaseFromVerify}
                selectedCaseId={selectedCaseId}
              />
            ) : (
              <InteractiveInputForm onEvaluateResult={handleEvaluateResult} />
            )}
          </div>

          {/* RIGHT COLUMN (6 Cols): Dedicated Human Escalation Decision Center */}
          <div className="lg:col-span-6">
            <EscalationCard
              decision={escalatedCase}
              onResolve={handleResolveEscalation}
              onDismiss={() => {
                setEscalatedCase(null);
                setSelectedCaseId(null);
              }}
              onSelectPreset={(testId) => {
                handleSelectPresetCase(testId);
              }}
            />
          </div>
        </div>

        {/* Tier 3: Full-Width Audit Trail Table (100% width across the bottom) */}
        <AuditTrailTable
          entries={auditEntries}
          onUndo={handleUndo}
          onOverride={handleOverride}
          onViewDossier={(entry) => setDossierEntry(entry)}
        />
      </main>

      {/* Modals */}
      <PolicyViewerModal
        isOpen={isPolicyOpen}
        onClose={() => setIsPolicyOpen(false)}
        onPolicyUpdated={(newVer) => setCurrentSopVersion(newVer)}
      />

      <TaxDefenseModal
        entry={dossierEntry}
        onClose={() => setDossierEntry(null)}
      />
    </div>
  );
}
