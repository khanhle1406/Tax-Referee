'use client';

import React from 'react';
import { ShieldCheck, Printer, CheckCircle2, FileText, Building2, Calendar, Award } from 'lucide-react';
import { AuditEntry } from '@/lib/schemas';
import { formatVND, formatDateTime } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface TaxDefenseModalProps {
  entry: AuditEntry | null;
  onClose: () => void;
}

export const TaxDefenseModal: React.FC<TaxDefenseModalProps> = ({ entry, onClose }) => {
  if (!entry) return null;

  return (
    <Dialog open={!!entry} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 overflow-hidden border-emerald-500/40 bg-slate-900 shadow-2xl">
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b border-slate-800 bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-900 text-left">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/20 rounded-xl border border-emerald-500/40 text-emerald-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <DialogTitle className="text-xl font-extrabold text-slate-100 flex items-center gap-2">
                Hồ sơ Giải trình Thuế 1-Click (Tax Defense Dossier)
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400 font-mono mt-0.5">
                Mã tham chiếu kiểm toán: <span className="text-emerald-300 font-bold">{entry.id}</span>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Dossier Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-slate-200">
          {/* Certificate Banner */}
          <div className="p-5 rounded-2xl bg-emerald-950/20 border border-emerald-500/30 flex items-start gap-4">
            <div className="p-2.5 bg-emerald-500/20 rounded-xl text-emerald-400 mt-1">
              <Award className="w-7 h-7" />
            </div>
            <div>
              <h4 className="text-base font-bold text-emerald-300 flex items-center gap-2">
                Hồ sơ giải trình đã ghi nhận
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              </h4>
              <p className="text-sm text-slate-300 mt-1 leading-relaxed">
                Hồ sơ này là snapshot phục vụ kiểm tra và giải trình nội bộ. Mọi thao tác đã được lưu vết; giá trị pháp lý cuối cùng vẫn thuộc người có thẩm quyền và quy trình ký số của doanh nghiệp.
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
              <Badge variant="secondary" className="bg-purple-500/20 text-purple-300 border-purple-500/30">
                Người duyệt: {entry.actor === 'CHIEF_ACCOUNTANT' ? 'Kế toán trưởng (KTT)' : entry.actor === 'CFO' ? 'Giám đốc Tài chính (CFO)' : 'Hệ thống AI Referee'}
              </Badge>
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
              Căn cứ pháp lý và trạng thái chứng thực
            </h5>
            <div className="space-y-1 text-xs text-slate-300 font-mono">
              <p>• Căn cứ quy chế nội bộ: <span className="text-purple-300 font-bold">{entry.sopVersion || 'Tax-SOP-2026 v2.1'}</span></p>
              {entry.applicableRegulations && entry.applicableRegulations.length > 0 ? (
                <p>• Văn bản pháp quy Nhà nước có hiệu lực: <span className="text-blue-300 font-bold">{entry.applicableRegulations.join(' · ')}</span></p>
              ) : (
                <p>• Căn cứ pháp quy Nhà nước: Nghị định 123/2020/NĐ-CP, Nghị định 72/2024/NĐ-CP & Thông tư 219/2013/TT-BTC</p>
              )}
              <p>• Audit hash: được lưu trong chuỗi audit server-side của hồ sơ này</p>
              <p>• Chữ ký số: <span className="text-amber-300 font-bold">CHƯA TÍCH HỢP — KHÔNG HIỂN THỊ LÀ HỢP LỆ</span></p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="px-6 py-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between sm:justify-between w-full">
          <Button
            type="button"
            variant="outline"
            onClick={() => window.print()}
            className="flex items-center gap-2 border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
          >
            <Printer className="w-4 h-4 text-cyan-400" />
            <span>In / Xuất PDF Giải trình</span>
          </Button>

          <Button
            type="button"
            onClick={onClose}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
          >
            Đóng cửa sổ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
