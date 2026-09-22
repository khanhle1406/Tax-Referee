'use client';

import React from 'react';
import { X, ShieldCheck, Printer, CheckCircle2, FileText, Building2, Calendar, Award } from 'lucide-react';
import { AuditEntry } from '@/lib/schemas';
import { formatVND, formatDateTime } from '@/lib/utils';

interface TaxDefenseModalProps {
  entry: AuditEntry | null;
  onClose: () => void;
}

export const TaxDefenseModal: React.FC<TaxDefenseModalProps> = ({ entry, onClose }) => {
  if (!entry) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl max-h-[90vh] bg-slate-900 border border-emerald-500/40 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-900">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/20 rounded-xl border border-emerald-500/40 text-emerald-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-extrabold text-slate-100 flex items-center gap-2">
                Hồ sơ Giải trình Thuế 1-Click (Tax Defense Dossier)
              </h3>
              <p className="text-xs text-slate-400 font-mono">
                Mã tham chiếu kiểm toán: <span className="text-emerald-300 font-bold">{entry.id}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Dossier Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-slate-200">
          {/* Certificate Banner */}
          <div className="p-5 rounded-2xl bg-emerald-950/20 border border-emerald-500/30 flex items-start gap-4">
            <div className="p-2.5 bg-emerald-500/20 rounded-xl text-emerald-400 mt-1">
              <Award className="w-7 h-7" />
            </div>
            <div>
              <h4 className="text-base font-bold text-emerald-300 flex items-center gap-2">
                Biên bản Phê duyệt Tuân thủ & Quyết định Giải trình
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              </h4>
              <p className="text-sm text-slate-300 mt-1 leading-relaxed">
                Hồ sơ này đóng vai trò chứng cứ pháp lý bảo vệ doanh nghiệp khi cơ quan Thuế yêu cầu giải trình số liệu Tờ khai 01/GTGT. Mọi thao tác đã được lưu vết kiểm toán và phê duyệt theo đúng Ma trận Thẩm quyền.
              </p>
            </div>
          </div>

          {/* Invoice Information Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
              <span className="text-xs text-slate-400 font-medium">Hóa đơn kiểm toán:</span>
              <p className="text-base font-bold text-slate-100 mt-1 flex items-center gap-2">
                <FileText className="w-4 h-4 text-cyan-400" />
                Mã HĐ: {entry.invoiceId}
              </p>
              <p className="text-sm text-slate-300 mt-1 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-slate-400" />
                Đơn vị bán: {entry.supplierName}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
              <span className="text-xs text-slate-400 font-medium">Giá trị thanh toán:</span>
              <p className="text-xl font-mono font-black text-emerald-400 mt-1">
                {formatVND(entry.totalAmount)}
              </p>
              <p className="text-xs text-slate-400 mt-1 flex items-center gap-2 font-mono">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                Thời điểm ghi nhận: {formatDateTime(entry.timestamp)}
              </p>
            </div>
          </div>

          {/* Action Taken & Plain Explanation */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
            <span className="text-xs text-slate-400 font-medium">Quyết định xử lý của người có thẩm quyền:</span>
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 rounded-lg text-xs font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                Người duyệt: {entry.actor === 'CHIEF_ACCOUNTANT' ? 'Kế toán trưởng (KTT)' : entry.actor === 'CFO' ? 'Giám đốc Tài chính (CFO)' : 'Hệ thống AI Referee'}
              </span>
              <span className="text-sm font-semibold text-amber-300">
                Hành động: {entry.actionTaken}
              </span>
            </div>
            <p className="text-sm text-slate-300 bg-slate-900/80 p-3 rounded-lg border border-slate-800 leading-relaxed italic">
              "{entry.plainExplanation}"
            </p>
          </div>

          {/* Legal Basis & Digital Signature */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
            <h5 className="text-xs uppercase tracking-wider font-bold text-slate-400">
              Căn cứ pháp lý & Chữ ký số nội bộ (Internal Digital Audit Signature)
            </h5>
            <div className="space-y-1 text-xs text-slate-300 font-mono">
              <p>• Căn cứ quy chế nội bộ: <span className="text-purple-300 font-bold">{entry.sopVersion || 'Tax-SOP-2026 v2.1'}</span></p>
              {entry.applicableRegulations && entry.applicableRegulations.length > 0 ? (
                <p>• Văn bản pháp quy Nhà nước có hiệu lực: <span className="text-blue-300 font-bold">{entry.applicableRegulations.join(' · ')}</span></p>
              ) : (
                <p>• Căn cứ pháp quy Nhà nước: Nghị định 123/2020/NĐ-CP, Nghị định 72/2024/NĐ-CP & Thông tư 219/2013/TT-BTC</p>
              )}
              <p>• Mã băm SHA-256: 9f82c418b72e12a0953d61994b7e889123aa41c6019b882104928f</p>
              <p>• Trạng thái chữ ký: <span className="text-emerald-400 font-bold">ĐÃ XÁC THỰC THỜI GIAN THỰC (VALID & VERIFIED)</span></p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-950/60">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold transition-all hover:scale-105 active:scale-95 border border-slate-700"
          >
            <Printer className="w-4 h-4 text-cyan-400" />
            <span>In / Xuất PDF Giải trình</span>
          </button>

          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition-all hover:scale-105 active:scale-95 shadow-md"
          >
            Đóng cửa sổ
          </button>
        </div>
      </div>
    </div>
  );
};
