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
import { toast } from 'sonner';
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
        toast.success('Đã thu hồi tiền lệ thành công.');
        void loadPrecedents();
      } else {
        toast.error('Không thể thu hồi tiền lệ.');
      }
    } catch (e) {
      toast.error('Không thể thu hồi tiền lệ.');
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
      if (data.errors?.length) {
        toast.warning(`Đã đồng bộ nhưng có ${data.errors.length} nguồn lỗi.`);
      } else {
        toast.success(`Đã kiểm tra nguồn pháp lý: phát hiện ${data.found || 0} bản cập nhật.`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể đồng bộ nguồn pháp lý');
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
        toast.info(`Đã tạo bản nháp ${data.policy.version}. Bấm lại để duyệt và áp dụng.`);
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
        toast.success(`Đã duyệt và áp dụng ${data.policy.version} thành công.`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể lưu policy');
    } finally {
      setIsSaving(false);
    }
  };

  // Khôi phục cấu hình chuẩn 2026
  const handleResetDynamicConfig = () => {
    setDynamicConfig(DEFAULT_CONFIG);
    setPendingPolicyVersion(null);
    toast.info('Đã khôi phục cấu hình chuẩn 2026 (Ngưỡng 5M, KTT 200M). Bấm lưu để áp dụng.');
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
      if (onPolicyUpdated) onPolicyUpdated(nextVer);
      toast.success(`Đã tạo bản nháp ${data.policy.version}. Duyệt tại Policy Studio để kích hoạt.`);
      setActiveTab('VIEW');
    } catch (e) {
      toast.error('Không thể lưu quy chế mới vào bộ nhớ.');
    }
  };

  // Khôi phục quy chế văn bản chuẩn
  const handleResetPolicyText = () => {
    setPolicyMetadata(INITIAL_POLICY_METADATA);
    setEditableText(DEFAULT_TAX_SOP_2026_TEXT);
    setPendingPolicyVersion(null);
    toast.info('Đã khôi phục bản gốc chuẩn v2.5 vào trình soạn thảo.');
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl h-[92vh] flex flex-col p-0 overflow-hidden bg-white border border-slate-200 text-slate-950 shadow-[0_16px_48px_rgba(0,0,0,0.08)]">
        {/* Header */}
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between px-6 py-3.5 border-b border-slate-200 bg-slate-50/80 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-slate-900 text-white rounded-xl shadow-xs shrink-0">
              <Scale className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <DialogTitle className="text-base font-semibold text-slate-900 tracking-tight whitespace-nowrap">
                  Quản trị Quy chế & Pháp lý Thuế
                </DialogTitle>
                <Badge variant="secondary" className="bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-medium shrink-0">
                  {policyMetadata.version} · Hiệu lực
                </Badge>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                Mã SOP: TAX-SOP-2026 · Ngưỡng TM: {formatVND(dynamicConfig.nonCashThreshold)} · Hạn mức KTT: {formatVND(dynamicConfig.kttApprovalLimit)}
              </p>
            </div>
          </div>

          {/* Tab Selection */}
          <Tabs value={activeTab} onValueChange={(val) => {
            const nextTab = val as typeof activeTab;
            setActiveTab(nextTab);
            if (nextTab === 'LEGAL') void loadLegalUpdates();
            if (nextTab === 'PRECEDENTS') void loadPrecedents();
          }} className="shrink-0 max-w-full">
            <TabsList className="bg-slate-100/90 border border-slate-200 h-9 p-1 flex items-center overflow-x-auto">
              <TabsTrigger value="STUDIO" className="flex items-center gap-1.5 px-3 py-1 text-xs whitespace-nowrap">
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Studio</span>
              </TabsTrigger>
              <TabsTrigger value="VIEW" className="flex items-center gap-1.5 px-3 py-1 text-xs whitespace-nowrap">
                <BookOpen className="w-3.5 h-3.5" />
                <span>Toàn văn</span>
              </TabsTrigger>
              <TabsTrigger value="EDIT" className="flex items-center gap-1.5 px-3 py-1 text-xs whitespace-nowrap">
                <Edit3 className="w-3.5 h-3.5" />
                <span>Soạn thảo</span>
              </TabsTrigger>
              <TabsTrigger value="TIMELINE" className="flex items-center gap-1.5 px-3 py-1 text-xs whitespace-nowrap">
                <Clock className="w-3.5 h-3.5" />
                <span>Thời điểm</span>
              </TabsTrigger>
              <TabsTrigger value="LEGAL" className="flex items-center gap-1.5 px-3 py-1 text-xs whitespace-nowrap">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>Luật mới</span>
              </TabsTrigger>
              <TabsTrigger value="PRECEDENTS" className="flex items-center gap-1.5 px-3 py-1 text-xs whitespace-nowrap">
                <BookmarkCheck className="w-3.5 h-3.5" />
                <span>Tiền lệ ({precedents.length})</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Body Content by Tab */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* TAB 0: DYNAMIC POLICY STUDIO */}
          {activeTab === 'STUDIO' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-slate-800" />
                    Tham số Quy chế Thuế Động
                  </h4>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Điều chỉnh tham số để tạo bản nháp kiểm tra trước khi phê duyệt áp dụng chính thức.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={handleResetDynamicConfig}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 text-xs font-medium transition-all border border-slate-200 shadow-xs cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3 text-slate-500" />
                    <span>Chuẩn 2026</span>
                  </button>
                  <button
                    onClick={handleSaveDynamicConfig}
                    disabled={isSaving}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium shadow-xs transition-all cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{isSaving ? 'Đang lưu...' : pendingPolicyVersion ? 'Duyệt & Áp dụng' : 'Tạo bản nháp'}</span>
                  </button>
                </div>
              </div>

              {/* Grid 4 Control Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Knob 1: Non-cash Threshold */}
                <div className="p-5 bg-white border border-slate-200 rounded-2xl space-y-3 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-slate-500" />
                      1. Ngưỡng TT không dùng tiền mặt
                    </span>
                    <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-slate-100 text-slate-900 border border-slate-200 font-mono">
                      {formatVND(dynamicConfig.nonCashThreshold)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Ngưỡng bắt buộc chuyển khoản ngân hàng theo Luật Thuế GTGT 48/2024/QH15:
                  </p>
                  <div className="grid grid-cols-4 gap-2">
                    {[5_000_000, 10_000_000, 15_000_000, 20_000_000].map((amt) => (
                      <button
                        key={amt}
                        onClick={() => setDynamicConfig({ ...dynamicConfig, nonCashThreshold: amt })}
                        className={`py-1.5 px-2 rounded-lg text-xs font-mono transition-all text-center cursor-pointer whitespace-nowrap ${
                          dynamicConfig.nonCashThreshold === amt
                            ? 'bg-slate-900 text-white font-semibold shadow-xs'
                            : 'bg-slate-100/60 border border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                        }`}
                      >
                        {amt / 1_000_000}M {amt === 5_000_000 ? '(2026)' : amt === 20_000_000 ? '(Cũ)' : ''}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Knob 2: Chief Accountant Approval Limit */}
                <div className="p-5 bg-white border border-slate-200 rounded-2xl space-y-3 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                      <Scale className="w-3.5 h-3.5 text-slate-500" />
                      2. Hạn mức Kế toán trưởng tự duyệt
                    </span>
                    <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-slate-100 text-slate-900 border border-slate-200 font-mono">
                      {formatVND(dynamicConfig.kttApprovalLimit)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Hóa đơn vượt quá hạn mức này sẽ tự động chuyển tiếp lên Giám đốc Tài chính (CFO):
                  </p>
                  <div className="grid grid-cols-4 gap-2">
                    {[100_000_000, 200_000_000, 300_000_000, 500_000_000].map((amt) => (
                      <button
                        key={amt}
                        onClick={() => setDynamicConfig({ ...dynamicConfig, kttApprovalLimit: amt })}
                        className={`py-1.5 px-2 rounded-lg text-xs font-mono transition-all text-center cursor-pointer whitespace-nowrap ${
                          dynamicConfig.kttApprovalLimit === amt
                            ? 'bg-slate-900 text-white font-semibold shadow-xs'
                            : 'bg-slate-100/60 border border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                        }`}
                      >
                        {amt / 1_000_000}M {amt === 200_000_000 ? '(SOP)' : ''}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Knob 3: K-Factor Heuristic Safe Range */}
                <div className="p-5 bg-white border border-slate-200 rounded-2xl space-y-3 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-slate-500" />
                      3. Dải an toàn hệ số K (CV 2392)
                    </span>
                    <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-slate-100 text-slate-900 border border-slate-200 font-mono">
                      {dynamicConfig.kFactorSafeMin} - {dynamicConfig.kFactorSafeMax}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Biên độ an toàn nội bộ. Khi K vượt ngưỡng sẽ kích hoạt cảnh báo rủi ro Nhóm 3:
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] text-slate-500 font-medium block mb-1">Ngưỡng tối thiểu (Min):</label>
                      <input
                        type="number"
                        step="0.05"
                        value={dynamicConfig.kFactorSafeMin}
                        onChange={(e) => setDynamicConfig({ ...dynamicConfig, kFactorSafeMin: parseFloat(e.target.value) || 1.05 })}
                        className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 font-mono focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-500 font-medium block mb-1">Ngưỡng tối đa (Max):</label>
                      <input
                        type="number"
                        step="0.05"
                        value={dynamicConfig.kFactorSafeMax}
                        onChange={(e) => setDynamicConfig({ ...dynamicConfig, kFactorSafeMax: parseFloat(e.target.value) || 1.25 })}
                        className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 font-mono focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition"
                      />
                    </div>
                  </div>
                </div>

                {/* Knob 4: Staff Reimbursement Exception */}
                <div className="p-5 bg-white border border-slate-200 rounded-2xl space-y-3 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                      <ShieldAlert className="w-3.5 h-3.5 text-slate-500" />
                      4. Ngoại lệ hoàn ứng nhân viên
                    </span>
                    <span className={`px-2 py-0.5 rounded-md text-xs font-semibold border font-mono ${
                      dynamicConfig.allowStaffReimbursement
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : 'bg-rose-50 text-rose-800 border-rose-200'
                    }`}>
                      {dynamicConfig.allowStaffReimbursement ? 'BẬT' : 'TẮT'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Cho phép nhân viên tạm ứng thẻ cá nhân kèm ủy nhiệm chi hoàn ứng hợp lệ:
                  </p>
                  <button
                    onClick={() => setDynamicConfig({ ...dynamicConfig, allowStaffReimbursement: !dynamicConfig.allowStaffReimbursement })}
                    className={`w-full py-2 px-3 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs ${
                      dynamicConfig.allowStaffReimbursement
                        ? 'bg-slate-900 text-white hover:bg-slate-800'
                        : 'bg-slate-100/60 border border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <span>{dynamicConfig.allowStaffReimbursement ? '✓ Đang cho phép hoàn ứng hợp lệ' : '✕ Chỉ chấp nhận tài khoản công ty'}</span>
                  </button>
                </div>

              </div>
            </div>
          )}

          {/* TAB 1: VIEW FULL TEXT */}
          {activeTab === 'VIEW' && (
            <div className="space-y-5">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs">
                <div>
                  <span className="font-semibold text-slate-900">Phiên bản hiện hành: {policyMetadata.version}</span>
                  <span className="text-[11px] text-slate-500 ml-2">({policyMetadata.releaseDate})</span>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    Căn cứ tích hợp: Luật Thuế GTGT 48/2024/QH15, Nghị quyết 204/2025/QH15, Nghị định 254/2026/NĐ-CP, Thông tư 89/2026/TT-BTC, Công văn 2392/TCT-QLRR.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    Đang nạp làm Ground Truth
                  </span>
                </div>
              </div>

              <div className="font-mono text-xs leading-relaxed text-slate-700 bg-slate-50/50 p-5 rounded-xl border border-slate-200 whitespace-pre-wrap">
                {policyMetadata.text}
              </div>

              <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-2">
                <h4 className="text-[11px] font-mono uppercase tracking-wider text-slate-500">
                  Lịch sử Sửa đổi Phiên bản
                </h4>
                <div className="space-y-1.5">
                  {policyMetadata.changeLog.map((log, idx) => (
                    <div key={idx} className="text-xs text-slate-700 font-mono flex items-start gap-2">
                      <span className="text-slate-900">•</span>
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
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-900 leading-relaxed">
                  <p className="font-medium">
                    Trình Soạn Thảo Quy Chế Văn Bản:
                  </p>
                  <p className="mt-0.5 text-amber-800">
                    Bổ sung điều khoản nội bộ. Sau khi lưu, hệ thống tạo bản nháp cần kiểm tra và duyệt để có hiệu lực.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-mono uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-slate-900" />
                  Nội dung Quy chế Quản trị Thuế (TAX-SOP-2026):
                </label>
                <textarea
                  value={editableText}
                  onChange={(e) => setEditableText(e.target.value)}
                  rows={14}
                  className="w-full p-4 bg-white border border-slate-200 rounded-xl font-mono text-xs text-slate-900 leading-relaxed focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-colors"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-mono uppercase tracking-wider text-slate-500">
                  Ghi chú sửa đổi (Change Log):
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: Bổ sung điều khoản khấu trừ chi phí vé máy bay điện tử..."
                  value={changeLogNote}
                  onChange={(e) => setChangeLogNote(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={handleResetPolicyText}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium transition-all border border-slate-200 cursor-pointer shadow-xs"
                >
                  <RotateCcw className="w-3 h-3 text-slate-500" />
                  <span>Khôi phục bản gốc</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab('VIEW')}
                    className="px-3.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-medium transition-all hover:bg-slate-50 cursor-pointer"
                  >
                    Hủy bỏ
                  </button>
                  <button
                    type="button"
                    onClick={handleSavePolicyText}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium shadow-xs transition-all cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Lưu bản mới</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: TEMPORAL LAW TIMELINE */}
          {activeTab === 'TIMELINE' && (
            <div className="space-y-6">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-slate-800" />
                      Tra cứu Pháp lý Theo Mốc Thời gian
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Chọn ngày lập hóa đơn để tra cứu các văn bản pháp luật áp dụng tại thời điểm đó.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] font-mono text-slate-700 uppercase tracking-wider">
                      Ngày lập:
                    </label>
                    <input
                      type="date"
                      value={testDate}
                      onChange={(e) => handleDateChange(e.target.value)}
                      className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 font-mono focus:outline-none focus:border-slate-400"
                    />
                  </div>
                </div>

                <div className="mt-3 p-3 bg-white border border-slate-200 rounded-lg space-y-1 text-xs font-mono">
                  <div className="text-emerald-800 font-semibold">
                    ✓ {temporalResult.decreeSummary}
                  </div>
                  {temporalResult.notes.map((n, idx) => (
                    <div key={idx} className="text-slate-700">
                      • {n}
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-[11px] font-mono uppercase tracking-wider text-slate-500">
                  Văn bản Quy phạm Pháp luật 2025 - 2026 ({GOVERNMENT_REGULATORY_REGISTRY.length} văn bản)
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {GOVERNMENT_REGULATORY_REGISTRY.map((doc) => (
                    <div
                      key={doc.id}
                      className="p-4 bg-white border border-slate-200 rounded-xl space-y-2 shadow-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-slate-100 text-slate-900 border border-slate-200">
                          {doc.code}
                        </span>
                        <span className="text-[10px] font-mono text-slate-500">
                          {doc.effectiveFrom} {doc.effectiveTo ? '-> ' + doc.effectiveTo : '(Hiện hành)'}
                        </span>
                      </div>

                      <h5 className="text-xs font-semibold text-slate-900 leading-snug">
                        {doc.title}
                      </h5>

                      <p className="text-[11px] text-slate-600 leading-relaxed">
                        {doc.summary}
                      </p>

                      <div className="pt-2 border-t border-slate-200 space-y-1">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 block">
                          Quy chuẩn cốt lõi:
                        </span>
                        {doc.keyRules.map((rule, idx) => (
                          <div key={idx} className="text-[11px] text-slate-600 flex items-start gap-1.5">
                            <span className="text-slate-400">•</span>
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

          {/* TAB 4: LEGAL UPDATES */}
          {activeTab === 'LEGAL' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold text-slate-900">Theo dõi cập nhật văn bản pháp luật</h4>
                  <p className="text-xs text-slate-600 mt-0.5">Hệ thống tạo bản nháp candidate để rà soát trước khi phê duyệt áp dụng.</p>
                </div>
                <button
                  onClick={() => void handleSyncLegal()}
                  disabled={isSyncingLegal}
                  className="px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-medium cursor-pointer shadow-xs transition-all"
                >
                  {isSyncingLegal ? 'Đang kiểm tra...' : 'Kiểm tra nguồn pháp lý'}
                </button>
              </div>
              {legalUpdates.length === 0 ? (
                <div className="p-6 rounded-xl border border-slate-200 bg-white text-xs text-slate-500 text-center">
                  Chưa có candidate mới. Hãy cấu hình feed JSON từ nguồn chính thức rồi chạy kiểm tra.
                </div>
              ) : (
                <div className="space-y-3">
                  {legalUpdates.map((update) => (
                    <div key={update.id} className="p-4 rounded-xl border border-slate-200 bg-white space-y-2 shadow-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-slate-900 text-xs font-semibold">{update.documentCode}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">{update.status}</span>
                      </div>
                      <h5 className="font-semibold text-xs text-slate-900">{update.title}</h5>
                      <p className="text-xs text-slate-600">{update.summary}</p>
                      <pre className="whitespace-pre-wrap text-[11px] text-slate-700 bg-slate-50 p-3 rounded-lg max-h-40 overflow-auto border border-slate-200">{update.diff}</pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 5: SỔ TIỀN LỆ DOANH NGHIỆP */}
          {activeTab === 'PRECEDENTS' && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                    <BookmarkCheck className="w-4 h-4 text-slate-800" />
                    Sổ Tiền Lệ Doanh Nghiệp (Precedent Memory)
                  </h4>
                  <p className="text-xs text-slate-600 leading-relaxed max-w-2xl">
                    Lưu trữ các phán quyết đặc cách từ CFO / KTT để tự động chấp thuận các hóa đơn tương tự sau này.
                  </p>
                </div>
                <button
                  onClick={() => void loadPrecedents()}
                  disabled={isLoadingPrecedents}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 text-xs font-medium transition-all border border-slate-200 shrink-0 cursor-pointer shadow-xs"
                >
                  <RotateCcw className={`w-3 h-3 ${isLoadingPrecedents ? 'animate-spin' : ''}`} />
                  <span>Làm mới</span>
                </button>
              </div>

              {isLoadingPrecedents ? (
                <div className="p-8 text-center text-xs text-slate-500">Đang tải sổ tiền lệ...</div>
              ) : precedents.length === 0 ? (
                <div className="p-8 rounded-2xl border border-dashed border-slate-200 bg-white text-center space-y-2">
                  <BookmarkCheck className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="text-xs font-semibold text-slate-900">Chưa có tiền lệ nào được thiết lập</p>
                  <p className="text-[11px] text-slate-500 max-w-md mx-auto">
                    Khi CFO hoặc KTT phê duyệt một hóa đơn ngoại lệ và tích chọn "Lưu làm tiền lệ cho doanh nghiệp", tiền lệ sẽ xuất hiện ở đây.
                  </p>
                </div>
              ) : (
                <div className="grid gap-3">
                  {precedents.map((p) => (
                    <div
                      key={p.id}
                      className="p-4 rounded-xl border border-slate-200 bg-white transition space-y-3 shadow-xs"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
                        <div className="flex items-center gap-2.5">
                          <div className="p-1.5 rounded-lg bg-slate-100 text-slate-900">
                            <Building2 className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="text-xs font-semibold text-slate-900 flex items-center gap-2">
                              <span>MST: {p.supplierTaxCode}</span>
                              <span className="rounded bg-emerald-50 text-emerald-800 border border-emerald-200 px-1.5 py-0.2 text-[10px]">
                                {p.status === 'ACTIVE' ? 'Đang hiệu lực' : 'Đã thu hồi'}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                              ID: {p.id} · Ngày: {new Date(p.createdAt).toLocaleDateString('vi-VN')}
                            </div>
                          </div>
                        </div>

                        {p.status === 'ACTIVE' && (
                          <button
                            onClick={() => void handleRevokePrecedent(p.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-rose-200 bg-rose-50 text-rose-800 text-xs font-medium transition cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" /> Thu hồi
                          </button>
                        )}
                      </div>

                      <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                        <div className="bg-slate-50 p-2 rounded-lg border border-slate-200">
                          <span className="text-slate-500 block text-[10px] uppercase font-mono">Mô hình rủi ro</span>
                          <span className="text-slate-900 font-medium text-xs">{p.riskPattern}</span>
                        </div>
                        <div className="bg-slate-50 p-2 rounded-lg border border-slate-200">
                          <span className="text-slate-500 block text-[10px] uppercase font-mono">Phương án phê duyệt</span>
                          <span className="text-slate-900 font-semibold text-xs">{p.approvedOption}</span>
                        </div>
                        <div className="bg-slate-50 p-2 rounded-lg border border-slate-200">
                          <span className="text-slate-500 block text-[10px] uppercase font-mono">Người duyệt</span>
                          <span className="text-slate-900 font-medium text-xs">{p.approvedBy}</span>
                        </div>
                        <div className="bg-slate-50 p-2 rounded-lg border border-slate-200">
                          <span className="text-slate-500 block text-[10px] uppercase font-mono">Căn cứ SOP</span>
                          <span className="text-slate-900 font-mono text-xs">{p.sopClause}</span>
                        </div>
                      </div>

                      <div className="bg-slate-50/50 p-2.5 rounded-lg border border-slate-200 text-xs">
                        <span className="text-slate-500 font-mono text-[10px] uppercase block mb-0.5">Lý do giải trình:</span>
                        <p className="text-slate-700 italic text-[11px]">"{p.rationale}"</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-slate-200 bg-slate-50/80">
          <span className="text-xs text-slate-500 flex items-center gap-1.5 font-mono">
            <FileCheck2 className="w-3.5 h-3.5 text-emerald-700" />
            Đồng bộ 100% với Luật & Nghị định niên độ 2025 - 2026
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-900 hover:bg-slate-800 text-white px-4 py-1.5 text-xs font-medium cursor-pointer shadow-xs transition"
          >
            Đóng cửa sổ
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
