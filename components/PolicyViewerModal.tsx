'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  BookOpen,
  FileCheck2,
  Scale,
  Edit3,
  Calendar,
  Save,
  RotateCcw,
  Sparkles,
  CheckCircle2,
  Clock,
  FileText,
  AlertCircle,
  Sliders,
  ShieldAlert,
  SlidersHorizontal,
  BookmarkCheck,
  Trash2,
  Building2
} from 'lucide-react';
import {
  DEFAULT_TAX_SOP_2026_TEXT,
  INITIAL_POLICY_METADATA,
  PolicyVersionMetadata
} from '@/data/sopText';
import {
  GOVERNMENT_REGULATORY_REGISTRY,
  getApplicableRegulations,
  RegulatoryDocument
} from '@/data/regulatoryRegistry';
import { LEGAL_CONSTANTS_2026 } from '@/lib/constants';
import { CorporatePrecedent, LegalUpdateCandidate, SystemPolicyConfig, SystemPolicyConfigSchema } from '@/lib/schemas';
import { formatVND } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface PolicyViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPolicyUpdated?: (newVersion: string) => void;
  onConfigUpdated?: (config: SystemPolicyConfig) => void;
}

const DEFAULT_CONFIG: SystemPolicyConfig = {
  nonCashThreshold: 5_000_000,
  kttApprovalLimit: 200_000_000,
  kFactorSafeMin: 1.05,
  kFactorSafeMax: 1.25,
  vatReductionRate: 8,
  vatStandardRate: 10,
  allowStaffReimbursement: true,
  excludedVat8Categories: [
    'VIỄN THÔNG', 'TÀI CHÍNH', 'NGÂN HÀNG', 'CHỨNG KHOÁN', 'BẢO HIỂM',
    'BẤT ĐỘNG SẢN', 'KIM LOẠI', 'KHAI KHOÁNG', 'HÓA CHẤT', 'TIÊU THỤ ĐẶC BIỆT'
  ]
};

export const PolicyViewerModal: React.FC<PolicyViewerModalProps> = ({
  isOpen,
  onClose,
  onPolicyUpdated,
  onConfigUpdated
}) => {
  const [activeTab, setActiveTab] = useState<'VIEW' | 'STUDIO' | 'EDIT' | 'TIMELINE' | 'LEGAL' | 'PRECEDENTS'>('STUDIO');
  const [policyMetadata, setPolicyMetadata] = useState<PolicyVersionMetadata>(INITIAL_POLICY_METADATA);
  const [editableText, setEditableText] = useState<string>(DEFAULT_TAX_SOP_2026_TEXT);
  const [changeLogNote, setChangeLogNote] = useState<string>('');
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [pendingPolicyVersion, setPendingPolicyVersion] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [legalUpdates, setLegalUpdates] = useState<LegalUpdateCandidate[]>([]);
  const [isSyncingLegal, setIsSyncingLegal] = useState(false);

  // Precedents State
  const [precedents, setPrecedents] = useState<CorporatePrecedent[]>([]);
  const [isLoadingPrecedents, setIsLoadingPrecedents] = useState(false);

  // Dynamic Policy Config State
  const [dynamicConfig, setDynamicConfig] = useState<SystemPolicyConfig>(DEFAULT_CONFIG);

  // Inspector ngày lập hóa đơn để tra cứu pháp luật theo thời gian
  const [testDate, setTestDate] = useState<string>('2026-08-10');
  const [temporalResult, setTemporalResult] = useState(() => getApplicableRegulations('2026-08-10'));

  const loadPrecedents = async () => {
    setIsLoadingPrecedents(true);
    try {
      const response = await fetch('/api/precedents');
      const data = await response.json();
      setPrecedents(data.precedents || []);
    } catch (e) {
      console.error('Failed to load precedents:', e);
    } finally {
      setIsLoadingPrecedents(false);
    }
  };

  const handleRevokePrecedent = async (id: string) => {
    if (!confirm('Bạn có chắc chắn muốn thu hồi tiền lệ này? Các hóa đơn tương tự sau này sẽ phải chuyển trình duyệt thay vì tự động chấp thuận theo tiền lệ.')) {
      return;
    }
    try {
      const res = await fetch(`/api/precedents?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setSuccessMessage('Đã thu hồi tiền lệ thành công.');
        setSavedSuccess(true);
        setTimeout(() => setSavedSuccess(false), 3000);
        void loadPrecedents();
      }
    } catch (e) {
      alert('Không thể thu hồi tiền lệ.');
    }
  };

  // Load the active policy from the server. Browser storage is not authoritative.
  useEffect(() => {
    if (!isOpen) return;
    void loadLegalUpdates();
    void loadPrecedents();
    fetch('/api/policy')
      .then((response) => response.json())
      .then((data) => {
        const active = data.active;
        if (active?.version) {
          setPolicyMetadata((previous) => ({ ...previous, version: active.version, releaseDate: active.effectiveFrom, text: active.policyText || previous.text }));
          setEditableText(active.policyText || DEFAULT_TAX_SOP_2026_TEXT);
        }
        const valid = SystemPolicyConfigSchema.safeParse(active?.config);
        if (valid.success) setDynamicConfig(valid.data);
      })
      .catch((error) => console.warn('Không thể tải policy server-side', error));
  }, [isOpen]);

  // Handle tra cứu ngày
  const handleDateChange = (newDate: string) => {
    setTestDate(newDate);
    setTemporalResult(getApplicableRegulations(newDate));
  };

  const loadLegalUpdates = async () => {
    const response = await fetch('/api/legal-updates');
    if (response.ok) {
      const data = await response.json();
      setLegalUpdates(data.updates || []);
    }
  };

  const handleSyncLegal = async () => {
    setIsSyncingLegal(true);
    try {
      const response = await fetch('/api/legal-updates', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Không thể đồng bộ nguồn pháp lý');
      await loadLegalUpdates();
      setSuccessMessage(data.errors?.length ? `Đã đồng bộ nhưng có ${data.errors.length} nguồn lỗi.` : `Đã kiểm tra nguồn pháp lý, phát hiện ${data.found || 0} bản cập nhật.`);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 4500);
    } catch (error) {
      setSuccessMessage(error instanceof Error ? error.message : 'Không thể đồng bộ nguồn pháp lý');
      setSavedSuccess(true);
    } finally {
      setIsSyncingLegal(false);
    }
  };

  // Lưu cấu hình động (Dynamic Policy Studio)
  const handleSaveDynamicConfig = async () => {
    setIsSaving(true);
    try {
      if (!pendingPolicyVersion) {
        const response = await fetch('/api/policy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config: dynamicConfig, policyText: editableText, sourceDocumentVersions: ['TAX-SOP-2026'] })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Không thể tạo policy draft');
        setPendingPolicyVersion(data.policy.version);
        setSuccessMessage(`Đã tạo bản nháp ${data.policy.version}. Hãy kiểm tra test rồi bấm lại để duyệt và áp dụng.`);
      } else {
        const response = await fetch('/api/policy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'publish', version: pendingPolicyVersion, actorId: 'local-admin', reason: 'Đã kiểm tra cấu hình trên Policy Studio' })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Không thể publish policy');
        setPendingPolicyVersion(null);
        onConfigUpdated?.(data.policy.config);
        onPolicyUpdated?.(data.policy.version);
        setPolicyMetadata((previous) => ({ ...previous, version: data.policy.version, releaseDate: data.policy.effectiveFrom, text: data.policy.policyText || previous.text }));
        setSuccessMessage(`Đã duyệt và áp dụng ${data.policy.version}.`);
      }
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 4500);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Không thể lưu policy');
    } finally {
      setIsSaving(false);
    }
  };

  // Khôi phục cấu hình chuẩn 2026
  const handleResetDynamicConfig = () => {
    if (confirm('Bạn có chắc chắn muốn khôi phục Cấu hình Quy định về chuẩn mực Luật Thuế 2026 (Ngưỡng 5M, KTT 200M)?')) {
      setDynamicConfig(DEFAULT_CONFIG);
      setPendingPolicyVersion(null);
      setSuccessMessage('Đã nạp cấu hình chuẩn vào bản nháp. Bấm lưu để tạo và duyệt policy mới.');
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3500);
    }
  };

  // Lưu văn bản quy chế mới
  const handleSavePolicyText = async () => {
    try {
      const currentVerNum = parseFloat(policyMetadata.version.replace('v', '')) || 2.5;
      const nextVer = 'v' + (currentVerNum + 0.1).toFixed(1);
      const newLog = changeLogNote.trim()
        ? nextVer + ' (' + new Date().toLocaleDateString('vi-VN') + '): ' + changeLogNote.trim()
        : nextVer + ' (' + new Date().toLocaleDateString('vi-VN') + '): Kế toán trưởng cập nhật bổ sung điều khoản quy chế.';

      const updated: PolicyVersionMetadata = {
        version: nextVer,
        releaseDate: new Date().toISOString().split('T')[0],
        updatedBy: 'Kế toán trưởng (Chỉnh sửa nội bộ)',
        status: 'ACTIVE',
        changeLog: [newLog, ...policyMetadata.changeLog],
        text: editableText
      };

      setPolicyMetadata(updated);
      setChangeLogNote('');
      const response = await fetch('/api/policy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: dynamicConfig, policyText: editableText, sourceDocumentVersions: ['TAX-SOP-2026'] })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Không thể tạo policy draft');
      setPendingPolicyVersion(data.policy.version);
      setSuccessMessage(`Đã tạo bản nháp ${data.policy.version}; cần quay lại Policy Studio để duyệt và áp dụng.`);
      setSavedSuccess(true);
      if (onPolicyUpdated) onPolicyUpdated(nextVer);

      setTimeout(() => setSavedSuccess(false), 3500);
      setActiveTab('VIEW');
    } catch (e) {
      alert('Không thể lưu quy chế mới vào bộ nhớ trình duyệt.');
    }
  };

  // Khôi phục quy chế văn bản chuẩn
  const handleResetPolicyText = () => {
    if (confirm('Bạn có chắc chắn muốn khôi phục Quy chế Tax-SOP-2026 về bản gốc chuẩn v2.5 ban đầu?')) {
      setPolicyMetadata(INITIAL_POLICY_METADATA);
      setEditableText(DEFAULT_TAX_SOP_2026_TEXT);
      setPendingPolicyVersion(null);
      setSuccessMessage('Đã nạp bản gốc vào form; chưa publish policy.');
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3500);
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl h-[92vh] flex flex-col p-0 overflow-hidden bg-slate-900 border-slate-700 shadow-2xl">
        {/* Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/70 gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-purple-500/20 rounded-xl border border-purple-500/40 text-purple-400">
              <Scale className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <DialogTitle className="text-xl font-extrabold text-slate-100">
                  Trung tâm Quản trị Quy chế & Pháp lý Thuế Động
                </DialogTitle>
                <Badge variant="secondary" className="bg-purple-500/20 text-purple-300 border-purple-500/40 font-mono text-xs">
                  {policyMetadata.version} · Active
                </Badge>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Mã hiệu: TAX-SOP-2026 · Ngưỡng không tiền mặt: {formatVND(dynamicConfig.nonCashThreshold)} · Hạn mức KTT: {formatVND(dynamicConfig.kttApprovalLimit)}
              </p>
            </div>
          </div>

          {/* Tab Selection using shadcn Tabs */}
          <Tabs value={activeTab} onValueChange={(val) => {
            const nextTab = val as typeof activeTab;
            setActiveTab(nextTab);
            if (nextTab === 'LEGAL') void loadLegalUpdates();
            if (nextTab === 'PRECEDENTS') void loadPrecedents();
          }}>
            <TabsList className="bg-slate-800/80 border-slate-700 h-9 p-1">
              <TabsTrigger value="STUDIO" className="flex items-center gap-1.5 px-3 py-1 text-xs">
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Policy Studio</span>
              </TabsTrigger>
              <TabsTrigger value="VIEW" className="flex items-center gap-1.5 px-3 py-1 text-xs">
                <BookOpen className="w-3.5 h-3.5" />
                <span>Toàn văn</span>
              </TabsTrigger>
              <TabsTrigger value="EDIT" className="flex items-center gap-1.5 px-3 py-1 text-xs">
                <Edit3 className="w-3.5 h-3.5" />
                <span>Sửa Văn bản</span>
              </TabsTrigger>
              <TabsTrigger value="TIMELINE" className="flex items-center gap-1.5 px-3 py-1 text-xs">
                <Clock className="w-3.5 h-3.5" />
                <span>Temporal</span>
              </TabsTrigger>
              <TabsTrigger value="LEGAL" className="flex items-center gap-1.5 px-3 py-1 text-xs">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>Cập nhật luật</span>
              </TabsTrigger>
              <TabsTrigger value="PRECEDENTS" className="flex items-center gap-1.5 px-3 py-1 text-xs">
                <BookmarkCheck className="w-3.5 h-3.5" />
                <span>Sổ Tiền lệ ({precedents.length})</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Success Alert Banner */}
        {savedSuccess && (
          <div className="px-6 py-2.5 bg-emerald-500/20 border-b border-emerald-500/40 text-emerald-300 text-sm flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Body Content by Tab */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* TAB 0: DYNAMIC POLICY STUDIO (THE WOW FACTOR) */}
          {activeTab === 'STUDIO' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="p-4 bg-gradient-to-r from-purple-950/40 via-blue-950/30 to-slate-950 border border-purple-500/30 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h4 className="text-base font-extrabold text-purple-300 flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-purple-400" />
                    Trình Điều Khiển Quy Chế & Tham Số Luật Động (Dynamic Policy Studio)
                  </h4>
                  <p className="text-xs text-slate-300 leading-relaxed max-w-2xl">
                    Dành cho Kế toán trưởng: thay đổi tham số để tạo bản nháp, chạy kiểm tra rồi mới duyệt áp dụng. Policy đang chạy không bị thay đổi khi chưa publish.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={handleResetDynamicConfig}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all border border-slate-700"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Chuẩn Luật 2026</span>
                  </button>
                  <button
                    onClick={handleSaveDynamicConfig}
                    disabled={isSaving}
                    className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-purple-900/30 transition-all hover:scale-105"
                  >
                    <Save className="w-4 h-4" />
                    <span>{isSaving ? 'Đang lưu...' : pendingPolicyVersion ? 'Duyệt & Áp dụng' : 'Tạo bản nháp'}</span>
                  </button>
                </div>
              </div>

              {/* Grid 4 Control Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                
                {/* Knob 1: Non-cash Threshold */}
                <div className="p-5 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-4 hover:border-purple-500/40 transition-all">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
                      <Sliders className="w-4 h-4" />
                      1. Ngưỡng Thanh Toán Không Dùng Tiền Mặt
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-purple-500/20 text-purple-300 border border-purple-500/40 font-mono">
                      {formatVND(dynamicConfig.nonCashThreshold)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Theo Luật Thuế GTGT 48/2024/QH15, ngưỡng chuẩn từ 01/07/2025 là <strong>5.000.000 VNĐ</strong> (thay thế mức 20.000.000 VNĐ cũ). Thử đổi ngưỡng để xem AI phản ứng:
                  </p>
                  <div className="grid grid-cols-4 gap-2">
                    {[5_000_000, 10_000_000, 15_000_000, 20_000_000].map((amt) => (
                      <button
                        key={amt}
                        onClick={() => setDynamicConfig({ ...dynamicConfig, nonCashThreshold: amt })}
                        className={`py-2 px-2 rounded-xl text-xs font-bold font-mono transition-all text-center ${
                          dynamicConfig.nonCashThreshold === amt
                            ? 'bg-purple-600 text-white shadow-md'
                            : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {amt / 1_000_000}M {amt === 5_000_000 ? '(2026)' : amt === 20_000_000 ? '(Cũ)' : ''}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Knob 2: Chief Accountant Approval Limit */}
                <div className="p-5 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-4 hover:border-purple-500/40 transition-all">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
                      <Scale className="w-4 h-4" />
                      2. Hạn Mức Tự Duyệt Chi Của KTT
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-blue-500/20 text-blue-300 border border-blue-500/40 font-mono">
                      {formatVND(dynamicConfig.kttApprovalLimit)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Hóa đơn điều chỉnh giảm hoặc chi phí đặc thù vượt quá hạn mức này sẽ tự động kích hoạt chuyển tiếp lên Giám đốc Tài chính (CFO):
                  </p>
                  <div className="grid grid-cols-4 gap-2">
                    {[100_000_000, 200_000_000, 300_000_000, 500_000_000].map((amt) => (
                      <button
                        key={amt}
                        onClick={() => setDynamicConfig({ ...dynamicConfig, kttApprovalLimit: amt })}
                        className={`py-2 px-2 rounded-xl text-xs font-bold font-mono transition-all text-center ${
                          dynamicConfig.kttApprovalLimit === amt
                            ? 'bg-blue-600 text-white shadow-md'
                            : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {amt / 1_000_000}M {amt === 200_000_000 ? '(SOP)' : ''}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Knob 3: K-Factor Heuristic Safe Range */}
                <div className="p-5 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-4 hover:border-purple-500/40 transition-all">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                      <Sliders className="w-4 h-4" />
                      3. Dải An Toàn Tham Số Nguồn Hàng K (CV 2392)
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono">
                      {dynamicConfig.kFactorSafeMin} - {dynamicConfig.kFactorSafeMax}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Biên độ an toàn nội bộ (Vùng Xanh). Khi K tụt dưới 0.95 hoặc vọt trên 1.35, hệ thống lập tức gắn cờ Nhóm 3 (EXCEED_AUTHORITY):
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] text-slate-400 font-semibold block mb-1">Ngưỡng tối thiểu (Min Safe):</label>
                      <input
                        type="number"
                        step="0.05"
                        value={dynamicConfig.kFactorSafeMin}
                        onChange={(e) => setDynamicConfig({ ...dynamicConfig, kFactorSafeMin: parseFloat(e.target.value) || 1.05 })}
                        className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-sm text-emerald-300 font-mono focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400 font-semibold block mb-1">Ngưỡng tối đa (Max Safe):</label>
                      <input
                        type="number"
                        step="0.05"
                        value={dynamicConfig.kFactorSafeMax}
                        onChange={(e) => setDynamicConfig({ ...dynamicConfig, kFactorSafeMax: parseFloat(e.target.value) || 1.25 })}
                        className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-sm text-emerald-300 font-mono focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Knob 4: Staff Reimbursement Exception */}
                <div className="p-5 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-4 hover:border-purple-500/40 transition-all">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                      <ShieldAlert className="w-4 h-4" />
                      4. Ngoại Lệ Hoàn Ứng Ủy Quyền Nhân Viên
                    </span>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-black border font-mono ${
                      dynamicConfig.allowStaffReimbursement
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                    }`}>
                      {dynamicConfig.allowStaffReimbursement ? 'BẬT' : 'TẮT'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Chấp thuận nhân viên dùng thẻ cá nhân thanh toán các giao dịch phục vụ công ty sau đó công ty chuyển khoản hoàn ứng kèm UNC:
                  </p>
                  <button
                    onClick={() => setDynamicConfig({ ...dynamicConfig, allowStaffReimbursement: !dynamicConfig.allowStaffReimbursement })}
                    className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                      dynamicConfig.allowStaffReimbursement
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                    }`}
                  >
                    <span>{dynamicConfig.allowStaffReimbursement ? '✓ Đang cho phép hoàn ứng hợp lệ theo Luật 48' : '✕ Cấm hoàn ứng (Bắt buộc tài khoản công ty)'}</span>
                  </button>
                </div>

              </div>
            </div>
          )}

          {/* TAB 1: VIEW FULL TEXT */}
          {activeTab === 'VIEW' && (
            <div className="space-y-6">
              <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-sm">
                <div>
                  <span className="font-bold text-slate-200">Phiên bản hiện hành: {policyMetadata.version}</span>
                  <span className="text-xs text-slate-400 ml-2">({policyMetadata.releaseDate})</span>
                  <p className="text-xs text-slate-400 mt-1">
                    Căn cứ tích hợp: Luật Thuế GTGT 48/2024/QH15, Nghị quyết 204/2025/QH15, Nghị định 254/2026/NĐ-CP, Thông tư 89/2026/TT-BTC, Công văn 2392/TCT-QLRR.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Đang nạp làm Ground Truth
                  </span>
                </div>
              </div>

              <div className="font-mono text-sm leading-relaxed text-slate-300 bg-slate-950/80 p-6 rounded-xl border border-slate-800 whitespace-pre-wrap">
                {policyMetadata.text}
              </div>

              <div className="p-4 bg-slate-950/40 border border-slate-800 rounded-xl space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Lịch sử Sửa đổi & Quản lý Phiên bản (Version Change Log)
                </h4>
                <div className="space-y-1.5">
                  {policyMetadata.changeLog.map((log, idx) => (
                    <div key={idx} className="text-xs text-slate-300 font-mono flex items-start gap-2">
                      <span className="text-purple-400">•</span>
                      <span>{log}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: EDIT TEXT */}
          {activeTab === 'EDIT' && (
            <div className="space-y-4">
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-200 leading-relaxed">
                  <p className="font-bold text-amber-100">
                    Trình Biên Soạn Quy Chế Văn Bản Trực Tiếp:
                  </p>
                  <p className="mt-0.5">
                    Kế toán trưởng có thể bổ sung câu chữ hoặc điều khoản nội bộ. Khi bấm lưu, hệ thống tạo bản nháp; người có thẩm quyền phải kiểm tra và duyệt trước khi policy mới có hiệu lực.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-purple-400" />
                  Nội dung Toàn văn Quy chế Quản trị Thuế (TAX-SOP-2026):
                </label>
                <textarea
                  value={editableText}
                  onChange={(e) => setEditableText(e.target.value)}
                  rows={16}
                  className="w-full p-4 bg-slate-950 border border-slate-700 rounded-xl font-mono text-xs text-slate-200 leading-relaxed focus:outline-none focus:border-purple-500 transition-colors"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Ghi chú sửa đổi (Change Log Note):
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: Bổ sung điều khoản khấu trừ chi phí vé máy bay điện tử..."
                  value={changeLogNote}
                  onChange={(e) => setChangeLogNote(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={handleResetPolicyText}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all border border-slate-700"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Khôi phục Bản Gốc Chuẩn</span>
                </button>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setActiveTab('VIEW')}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all"
                  >
                    Hủy bỏ
                  </button>
                  <button
                    type="button"
                    onClick={handleSavePolicyText}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-bold shadow-lg shadow-purple-900/30 transition-all hover:scale-105 active:scale-95"
                  >
                    <Save className="w-4 h-4" />
                    <span>Lưu & Kích hoạt Phiên bản Mới</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: TEMPORAL LAW TIMELINE */}
          {activeTab === 'TIMELINE' && (
            <div className="space-y-6">
              <div className="p-4 bg-gradient-to-r from-blue-950/40 via-purple-950/30 to-slate-950/60 border border-blue-500/30 rounded-xl">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div>
                    <h4 className="text-base font-bold text-blue-300 flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-blue-400" />
                      Công cụ Tra cứu Mốc Thời gian Pháp lý (Temporal Law Inspector)
                    </h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Chọn ngày lập hóa đơn để kiểm tra ngay AI sẽ áp dụng các Nghị định, Thông tư nào có hiệu lực tại ngày đó.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-300 font-bold uppercase tracking-wider">
                      Ngày lập hóa đơn:
                    </label>
                    <input
                      type="date"
                      value={testDate}
                      onChange={(e) => handleDateChange(e.target.value)}
                      className="px-3 py-1.5 bg-slate-950 border border-blue-500/50 rounded-lg text-sm text-blue-200 font-mono focus:outline-none focus:border-blue-400"
                    />
                  </div>
                </div>

                <div className="mt-4 p-3 bg-slate-950/70 border border-slate-800 rounded-lg space-y-1 text-xs font-mono">
                  <div className="text-emerald-400 font-bold">
                    ✓ {temporalResult.decreeSummary}
                  </div>
                  {temporalResult.notes.map((n, idx) => (
                    <div key={idx} className="text-slate-300">
                      • {n}
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Danh mục Văn bản Quy phạm Pháp luật Niên độ 2025 - 2026 ({GOVERNMENT_REGULATORY_REGISTRY.length} văn bản)
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {GOVERNMENT_REGULATORY_REGISTRY.map((doc) => (
                    <div
                      key={doc.id}
                      className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2 hover:border-slate-700 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="px-2 py-0.5 rounded text-xs font-extrabold bg-blue-500/20 text-blue-300 border border-blue-500/40 font-mono">
                          {doc.code}
                        </span>
                        <span className="text-[11px] font-mono text-slate-400">
                          Hiệu lực: {doc.effectiveFrom} {doc.effectiveTo ? '-> ' + doc.effectiveTo : '(Đang hiệu lực)'}
                        </span>
                      </div>

                      <h5 className="text-sm font-bold text-slate-100 leading-snug">
                        {doc.title}
                      </h5>

                      <p className="text-xs text-slate-400 leading-relaxed">
                        {doc.summary}
                      </p>

                      <div className="pt-2 border-t border-slate-800/80 space-y-1">
                        <span className="text-[11px] font-bold text-purple-400 uppercase tracking-wider block">
                          Quy chuẩn cốt lõi áp dụng:
                        </span>
                        {doc.keyRules.map((rule, idx) => (
                          <div key={idx} className="text-xs text-slate-300 flex items-start gap-1.5">
                            <span className="text-slate-500">-</span>
                            <span>{rule}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'LEGAL' && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div className="p-4 bg-cyan-500/10 border border-cyan-500/30 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <h4 className="text-base font-bold text-cyan-300">Theo dõi cập nhật pháp luật</h4>
                  <p className="text-xs text-slate-300 mt-1">Hệ thống chỉ tạo candidate và policy draft. Luật mới không tự động áp dụng khi chưa được người có thẩm quyền duyệt.</p>
                </div>
                <button
                  onClick={() => void handleSyncLegal()}
                  disabled={isSyncingLegal}
                  className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-bold"
                >
                  {isSyncingLegal ? 'Đang kiểm tra...' : 'Kiểm tra nguồn pháp lý'}
                </button>
              </div>
              {legalUpdates.length === 0 ? (
                <div className="p-6 rounded-xl border border-slate-800 bg-slate-950/60 text-sm text-slate-400">
                  Chưa có candidate mới. Hãy cấu hình `LEGAL_UPDATE_FEED_URLS` bằng feed JSON từ nguồn chính thức rồi chạy đồng bộ.
                </div>
              ) : (
                <div className="space-y-3">
                  {legalUpdates.map((update) => (
                    <div key={update.id} className="p-4 rounded-xl border border-slate-800 bg-slate-950/70 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-cyan-300 text-sm">{update.documentCode}</span>
                        <span className="text-[11px] px-2 py-1 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">{update.status}</span>
                      </div>
                      <h5 className="font-bold text-slate-100">{update.title}</h5>
                      <p className="text-xs text-slate-300">{update.summary}</p>
                      <pre className="whitespace-pre-wrap text-[11px] text-slate-400 bg-slate-900 p-3 rounded-lg max-h-40 overflow-auto">{update.diff}</pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 5: SỔ TIỀN LỆ DOANH NGHIỆP (CORPORATE PRECEDENT REGISTRY) */}
          {activeTab === 'PRECEDENTS' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="p-4 bg-gradient-to-r from-emerald-950/40 via-teal-950/30 to-slate-950 border border-emerald-500/30 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h4 className="text-base font-extrabold text-emerald-300 flex items-center gap-2">
                    <BookmarkCheck className="w-5 h-5 text-emerald-400" />
                    Sổ Tiền Lệ Doanh Nghiệp & Vòng Học Tự Động AI (Precedent Memory)
                  </h4>
                  <p className="text-xs text-slate-300 leading-relaxed max-w-2xl">
                    Lưu trữ các phán quyết đặc cách từ CFO / KTT. Các hóa đơn tương lai từ cùng đối tác và nhóm rủi ro tương tự sẽ được AI đối soát và tự động thông qua Routine.
                  </p>
                </div>
                <button
                  onClick={() => void loadPrecedents()}
                  disabled={isLoadingPrecedents}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all border border-slate-700 shrink-0"
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${isLoadingPrecedents ? 'animate-spin' : ''}`} />
                  <span>Làm mới</span>
                </button>
              </div>

              {isLoadingPrecedents ? (
                <div className="p-8 text-center text-sm text-slate-400">Đang tải sổ tiền lệ...</div>
              ) : precedents.length === 0 ? (
                <div className="p-8 rounded-2xl border border-slate-800 bg-slate-950/60 text-center space-y-2">
                  <BookmarkCheck className="w-10 h-10 text-slate-600 mx-auto" />
                  <p className="text-sm font-semibold text-slate-300">Chưa có tiền lệ nào được thiết lập</p>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    Khi CFO hoặc KTT phê duyệt một hóa đơn ngoại lệ và tích chọn "Lưu làm tiền lệ cho doanh nghiệp", tiền lệ sẽ xuất hiện ở đây để tự động hóa các hóa đơn tương tự sau này.
                  </p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {precedents.map((p) => (
                    <div
                      key={p.id}
                      className="p-5 rounded-2xl border border-slate-800 bg-slate-950/80 hover:border-slate-700 transition space-y-3"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <Building2 className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="text-sm font-bold text-slate-100 flex items-center gap-2">
                              <span>MST: {p.supplierTaxCode}</span>
                              <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-[10px]">
                                {p.status === 'ACTIVE' ? 'Đang hiệu lực' : 'Đã thu hồi'}
                              </Badge>
                            </div>
                            <div className="text-xs text-slate-400 font-mono mt-0.5">
                              ID: {p.id} · Ngày lập: {new Date(p.createdAt).toLocaleDateString('vi-VN')}
                            </div>
                          </div>
                        </div>

                        {p.status === 'ACTIVE' && (
                          <button
                            onClick={() => void handleRevokePrecedent(p.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-semibold transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Thu hồi tiền lệ
                          </button>
                        )}
                      </div>

                      <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                        <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                          <span className="text-slate-500 block text-[10px] uppercase font-bold">Mô hình rủi ro</span>
                          <span className="text-slate-200 font-medium">{p.riskPattern}</span>
                        </div>
                        <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                          <span className="text-slate-500 block text-[10px] uppercase font-bold">Phương án phê duyệt</span>
                          <span className="text-emerald-400 font-bold">{p.approvedOption}</span>
                        </div>
                        <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                          <span className="text-slate-500 block text-[10px] uppercase font-bold">Người duyệt tiền lệ</span>
                          <span className="text-slate-200 font-medium">{p.approvedBy}</span>
                        </div>
                        <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                          <span className="text-slate-500 block text-[10px] uppercase font-bold">Căn cứ SOP</span>
                          <span className="text-sky-400 font-mono text-[11px]">{p.sopClause}</span>
                        </div>
                      </div>

                      <div className="bg-slate-900/40 p-3 rounded-xl border border-slate-800/80 text-xs">
                        <span className="text-slate-400 font-bold block mb-1">Căn cứ giải trình & Phê duyệt của Lãnh đạo:</span>
                        <p className="text-slate-300 leading-relaxed italic">"{p.rationale}"</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-950/70">
          <span className="text-xs text-slate-400 flex items-center gap-1.5">
            <FileCheck2 className="w-4 h-4 text-emerald-400" />
            Đồng bộ hóa 100% với Luật, Nghị định của Chính phủ niên độ 2025 - 2026.
          </span>
          <Button
            type="button"
            onClick={onClose}
            className="bg-purple-600 hover:bg-purple-500 text-white font-bold"
          >
            Đóng cửa sổ
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
