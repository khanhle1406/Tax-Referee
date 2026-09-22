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
  AlertCircle
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
import { STORAGE_KEYS } from '@/lib/constants';

interface PolicyViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPolicyUpdated?: (newVersion: string) => void;
}

export const PolicyViewerModal: React.FC<PolicyViewerModalProps> = ({
  isOpen,
  onClose,
  onPolicyUpdated
}) => {
  const [activeTab, setActiveTab] = useState<'VIEW' | 'EDIT' | 'TIMELINE'>('VIEW');
  const [policyMetadata, setPolicyMetadata] = useState<PolicyVersionMetadata>(INITIAL_POLICY_METADATA);
  const [editableText, setEditableText] = useState<string>(DEFAULT_TAX_SOP_2026_TEXT);
  const [changeLogNote, setChangeLogNote] = useState<string>('');
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  // Inspector ngày lập hóa đơn để tra cứu pháp luật theo thời gian
  const [testDate, setTestDate] = useState<string>('2026-08-10');
  const [temporalResult, setTemporalResult] = useState(() => getApplicableRegulations('2026-08-10'));

  // Load from localStorage on open
  useEffect(() => {
    if (typeof window !== 'undefined' && isOpen) {
      try {
        const savedMeta = localStorage.getItem(STORAGE_KEYS.POLICY_METADATA);
        if (savedMeta) {
          const parsed = JSON.parse(savedMeta) as PolicyVersionMetadata;
          setPolicyMetadata(parsed);
          setEditableText(parsed.text);
        } else {
          setPolicyMetadata(INITIAL_POLICY_METADATA);
          setEditableText(DEFAULT_TAX_SOP_2026_TEXT);
        }
      } catch (e) {
        console.warn('Không thể đọc policy metadata từ storage', e);
      }
    }
  }, [isOpen]);

  // Handle tra cứu ngày
  const handleDateChange = (newDate: string) => {
    setTestDate(newDate);
    setTemporalResult(getApplicableRegulations(newDate));
  };

  // Lưu và kích hoạt quy chế mới
  const handleSavePolicy = () => {
    try {
      const currentVerNum = parseFloat(policyMetadata.version.replace('v', '')) || 2.1;
      const nextVer = `v${(currentVerNum + 0.1).toFixed(1)}`;
      const newLog = changeLogNote.trim()
        ? `${nextVer} (${new Date().toLocaleDateString('vi-VN')}): ${changeLogNote.trim()}`
        : `${nextVer} (${new Date().toLocaleDateString('vi-VN')}): Kế toán trưởng cập nhật bổ sung điều khoản quy chế.`;

      const updated: PolicyVersionMetadata = {
        version: nextVer,
        releaseDate: new Date().toISOString().split('T')[0],
        updatedBy: 'Kế toán trưởng (Chỉnh sửa nội bộ)',
        status: 'ACTIVE',
        changeLog: [newLog, ...policyMetadata.changeLog],
        text: editableText
      };

      localStorage.setItem(STORAGE_KEYS.POLICY_METADATA, JSON.stringify(updated));
      localStorage.setItem(STORAGE_KEYS.DYNAMIC_SOP, editableText);
      setPolicyMetadata(updated);
      setChangeLogNote('');
      setSavedSuccess(true);
      if (onPolicyUpdated) onPolicyUpdated(nextVer);

      setTimeout(() => setSavedSuccess(false), 3000);
      setActiveTab('VIEW');
    } catch (e) {
      alert('Không thể lưu quy chế mới vào bộ nhớ trình duyệt.');
    }
  };

  // Khôi phục quy chế chuẩn ban đầu
  const handleResetPolicy = () => {
    if (confirm('Bạn có chắc chắn muốn khôi phục Quy chế Tax-SOP-2026 về bản gốc chuẩn v2.1 ban đầu?')) {
      localStorage.removeItem(STORAGE_KEYS.POLICY_METADATA);
      localStorage.removeItem(STORAGE_KEYS.DYNAMIC_SOP);
      setPolicyMetadata(INITIAL_POLICY_METADATA);
      setEditableText(DEFAULT_TAX_SOP_2026_TEXT);
      if (onPolicyUpdated) onPolicyUpdated(INITIAL_POLICY_METADATA.version);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-5xl h-[92vh] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/70 gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-purple-500/20 rounded-xl border border-purple-500/40 text-purple-400">
              <Scale className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-extrabold text-slate-100">
                  Trung tâm Quản trị Quy chế & Pháp lý Thuế
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40 font-mono">
                  {policyMetadata.version} · Active
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Mã hiệu: TAX-SOP-2026 · Cập nhật gần nhất: {policyMetadata.releaseDate} bởi {policyMetadata.updatedBy}
              </p>
            </div>
          </div>

          {/* Tab Selection */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-800/80 rounded-xl border border-slate-700 text-xs">
            <button
              onClick={() => setActiveTab('VIEW')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all ${
                activeTab === 'VIEW'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Toàn văn Quy chế</span>
            </button>
            <button
              onClick={() => setActiveTab('EDIT')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all ${
                activeTab === 'EDIT'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Cập nhật Quy chế (Động)</span>
            </button>
            <button
              onClick={() => setActiveTab('TIMELINE')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all ${
                activeTab === 'TIMELINE'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Bản đồ Pháp luật theo Thời gian</span>
            </button>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Success Alert Banner */}
        {savedSuccess && (
          <div className="px-6 py-2.5 bg-emerald-500/20 border-b border-emerald-500/40 text-emerald-300 text-sm flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Đã lưu và kích hoạt Quy chế mới thành công! Toàn bộ tác tử Jev và Gemini sẽ tự động sử dụng phiên bản này.</span>
          </div>
        )}

        {/* Body Content by Tab */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: VIEW FULL TEXT */}
          {activeTab === 'VIEW' && (
            <div className="space-y-6">
              {/* Version Banner */}
              <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-sm">
                <div>
                  <span className="font-bold text-slate-200">Phiên bản hiện hành: {policyMetadata.version}</span>
                  <span className="text-xs text-slate-400 ml-2">({policyMetadata.releaseDate})</span>
                  <p className="text-xs text-slate-400 mt-1">
                    Căn cứ tích hợp: Nghị định 123/2020/NĐ-CP, Nghị định 72/2024/NĐ-CP, Thông tư 219/2013/TT-BTC, Công văn 2392/TCT-QLRR.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Đang nạp làm Ground Truth
                  </span>
                </div>
              </div>

              {/* Text content */}
              <div className="font-mono text-sm leading-relaxed text-slate-300 bg-slate-950/80 p-6 rounded-xl border border-slate-800 whitespace-pre-wrap">
                {policyMetadata.text}
              </div>

              {/* Change Log */}
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

          {/* TAB 2: EDIT DYNAMIC POLICY */}
          {activeTab === 'EDIT' && (
            <div className="space-y-4">
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-200 leading-relaxed">
                  <p className="font-bold text-amber-100">
                    Cơ chế Quản lý & Cập nhật Context Quy chế Động (Mục tiêu 2.7 target.md):
                  </p>
                  <p className="mt-0.5">
                    Kế toán trưởng hoặc Hội đồng Pháp chế có thể trực tiếp bổ sung các điều khoản mới (ví dụ: Thông tư mới ban hành của Bộ Tài chính, thay đổi trần hạn mức, cập nhật danh mục loại trừ thuế 8%). Khi bấm <strong>"Lưu & Kích hoạt"</strong>, hệ thống sẽ tự động tăng phiên bản và đồng bộ ngay lập tức vào Context đối chiếu của tác tử AI.
                  </p>
                </div>
              </div>

              {/* Input for change note */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase tracking-wider">
                  Ghi chú sửa đổi phiên bản này (Change Log Note):
                </label>
                <input
                  type="text"
                  value={changeLogNote}
                  onChange={(e) => setChangeLogNote(e.target.value)}
                  placeholder="Ví dụ: Bổ sung Điều 5 về quy định áp dụng hóa đơn điện tử khởi tạo từ máy tính tiền năm 2026..."
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-purple-500"
                />
              </div>

              {/* Text editor */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase tracking-wider flex items-center justify-between">
                  <span>Nội dung Văn bản Quy chế TAX-SOP-2026:</span>
                  <span className="text-slate-400 lowercase font-normal">Chỉnh sửa trực tiếp bên dưới</span>
                </label>
                <textarea
                  value={editableText}
                  onChange={(e) => setEditableText(e.target.value)}
                  rows={16}
                  className="w-full p-4 bg-slate-950 border border-slate-700 rounded-xl font-mono text-sm leading-relaxed text-slate-200 focus:outline-none focus:border-purple-500 shadow-inner"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleResetPolicy}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all border border-slate-700"
                >
                  <RotateCcw className="w-4 h-4 text-slate-400" />
                  <span>Khôi phục Quy chế Chuẩn Gốc</span>
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
                    onClick={handleSavePolicy}
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
              {/* Interactive Date Inspector */}
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

                {/* Result summary */}
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

              {/* List of Regulatory Documents */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Danh mục Văn bản Quy phạm Pháp luật trong Cơ sở Tri thức AI ({GOVERNMENT_REGULATORY_REGISTRY.length} văn bản)
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
                          Hiệu lực: {doc.effectiveFrom} {doc.effectiveTo ? `-> ${doc.effectiveTo}` : '(Vô thời hạn)'}
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
                          Quy chuẩn cốt lõi áp dụng vào SOP:
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
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-950/70">
          <span className="text-xs text-slate-400 flex items-center gap-1.5">
            <FileCheck2 className="w-4 h-4 text-emerald-400" />
            Đồng bộ hóa 100% với Luật, Nghị định của Chính phủ & Công văn Tổng cục Thuế theo thời gian thực.
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-sm transition-all hover:scale-105 active:scale-95 shadow-md"
          >
            Đóng cửa sổ
          </button>
        </div>
      </div>
    </div>
  );
};
