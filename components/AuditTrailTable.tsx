'use client';

import React from 'react';
import { History, Undo2, RotateCcw, FileText, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';
import { AuditEntry } from '@/lib/schemas';
import { formatVND, formatDateTime } from '@/lib/utils';

interface AuditTrailTableProps {
  entries: AuditEntry[];
  onUndo: (id: string) => void;
  onOverride: (id: string) => void;
  onViewDossier: (entry: AuditEntry) => void;
}

export const AuditTrailTable: React.FC<AuditTrailTableProps> = ({
  entries,
  onUndo,
  onOverride,
  onViewDossier
}) => {
  const [filter, setFilter] = React.useState<'ALL' | 'ROUTINE' | 'ESCALATED' | 'OVERRIDDEN'>('ALL');

  const countRoutine = entries.filter(e => e.actor === 'SYSTEM_REFEREE').length;
  const countEscalated = entries.filter(e => e.actor !== 'SYSTEM_REFEREE').length;
  const countOverridden = entries.filter(e => e.isOverridden).length;

  const filteredEntries = entries.filter(e => {
    if (filter === 'ROUTINE') return e.actor === 'SYSTEM_REFEREE';
    if (filter === 'ESCALATED') return e.actor !== 'SYSTEM_REFEREE';
    if (filter === 'OVERRIDDEN') return e.isOverridden;
    return true;
  });

  return (
    <div className="w-full bg-slate-900/90 border border-slate-700/80 rounded-2xl p-5 shadow-xl backdrop-blur-md space-y-4">
      {/* Header with Title and Filter Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-purple-500/15 text-purple-400 border border-purple-500/30">
            <History className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-slate-100 flex items-center gap-2">
              Nhật ký Kiểm toán & Lưu vết Trách nhiệm (Audit Trail)
            </h3>
            <p className="text-xs text-slate-400">
              Minh bạch 100% người duyệt, thời gian, lý do · Hỗ trợ Hoàn tác (Undo) và Ghi đè (Override)
            </p>
          </div>
        </div>

        {/* Quick Filter Tabs */}
        <div className="flex items-center gap-1 p-1 bg-slate-950/80 rounded-xl border border-slate-800 text-[11px] self-start sm:self-auto overflow-x-auto max-w-full">
          <button
            onClick={() => setFilter('ALL')}
            className={`px-2.5 py-1 rounded-lg font-semibold transition-all whitespace-nowrap cursor-pointer ${
              filter === 'ALL'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            Tất cả ({entries.length})
          </button>
          <button
            onClick={() => setFilter('ROUTINE')}
            className={`px-2.5 py-1 rounded-lg font-semibold transition-all whitespace-nowrap cursor-pointer ${
              filter === 'ROUTINE'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            Tự duyệt ({countRoutine})
          </button>
          <button
            onClick={() => setFilter('ESCALATED')}
            className={`px-2.5 py-1 rounded-lg font-semibold transition-all whitespace-nowrap cursor-pointer ${
              filter === 'ESCALATED'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            HITL ({countEscalated})
          </button>
          <button
            onClick={() => setFilter('OVERRIDDEN')}
            className={`px-2.5 py-1 rounded-lg font-semibold transition-all whitespace-nowrap cursor-pointer ${
              filter === 'OVERRIDDEN'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            Ghi đè ({countOverridden})
          </button>
        </div>
      </div>

      {/* Table Display */}
      {filteredEntries.length > 0 ? (
        <div className="w-full rounded-xl border border-slate-800 bg-slate-950/60 max-h-[460px] overflow-y-auto">
          <table className="w-full table-fixed text-left text-xs border-collapse">
            <colgroup>
              <col className="w-[18%]" />
              <col className="w-[24%]" />
              <col className="w-[22%]" />
              <col className="w-[22%]" />
              <col className="w-[14%]" />
            </colgroup>
            <thead className="sticky top-0 bg-slate-900/95 border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider z-10">
              <tr>
                <th className="py-2.5 px-3">Thời gian & Mã HĐ</th>
                <th className="py-2.5 px-3">Nhà cung cấp & Số tiền</th>
                <th className="py-2.5 px-3">Người duyệt & Hành động</th>
                <th className="py-2.5 px-3">Căn cứ & Lý do giải trình</th>
                <th className="py-2.5 px-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {filteredEntries.map((entry) => (
                <tr key={entry.id} className="transition-colors hover:bg-slate-800/40">
                  {/* Column 1: Time & Ref ID */}
                  <td className="py-2.5 px-3 overflow-hidden">
                    <div className="font-mono text-slate-300 font-bold text-[11px]">
                      {entry.invoiceId}
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                      {formatDateTime(entry.timestamp)}
                    </div>
                    <div className="text-[9px] text-slate-600 font-mono">
                      Ref: {entry.id}
                    </div>
                  </td>

                  {/* Column 2: Supplier & Amount */}
                  <td className="py-2.5 px-3 overflow-hidden">
                    <div className="font-semibold text-slate-100 text-xs truncate" title={entry.supplierName}>
                      {entry.supplierName}
                    </div>
                    <div className="text-emerald-400 font-mono font-bold text-xs mt-0.5 whitespace-nowrap">
                      {formatVND(entry.totalAmount)}
                    </div>
                  </td>

                  {/* Column 3: Actor & Action Taken */}
                  <td className="py-2.5 px-3 overflow-hidden">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${
                          entry.actor === 'SYSTEM_REFEREE'
                            ? 'bg-slate-800 text-slate-300 border border-slate-700'
                            : entry.actor === 'CHIEF_ACCOUNTANT'
                            ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                            : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        }`}
                      >
                        {entry.actor === 'SYSTEM_REFEREE' ? 'AI Referee' : entry.actor === 'CHIEF_ACCOUNTANT' ? 'Kế toán trưởng' : 'CFO'}
                      </span>

                      {entry.isOverridden && (
                        <span className="text-[9px] font-bold bg-rose-500/20 text-rose-300 px-1.5 py-0.5 rounded border border-rose-500/40 whitespace-nowrap">
                          ĐÃ GHI ĐÈ
                        </span>
                      )}
                    </div>

                    <div className="text-[11px] font-medium text-slate-200 mt-1 leading-snug truncate" title={entry.actionTaken}>
                      {entry.actionTaken}
                    </div>

                    {entry.applicableRegulations && entry.applicableRegulations.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {entry.applicableRegulations.slice(0, 3).map((reg, rIdx) => (
                          <span key={rIdx} className="text-[9px] bg-blue-950/60 text-blue-300 px-1.5 py-0.5 rounded border border-blue-800/40 font-mono whitespace-nowrap">
                            {reg}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>

                  {/* Column 4: Plain explanation */}
                  <td className="py-2.5 px-3 text-[11px] text-slate-400 overflow-hidden" title={entry.plainExplanation}>
                    <p className="line-clamp-2 leading-relaxed italic">
                      "{entry.plainExplanation}"
                    </p>
                  </td>

                  {/* Column 5: 1-Click Dossier & Quick Actions */}
                  <td className="py-2.5 px-3 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1.5">
                      {/* View Dossier Button */}
                      <button
                        onClick={() => onViewDossier(entry)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 hover:text-emerald-200 border border-emerald-500/40 text-xs font-bold transition-all hover:scale-105 active:scale-95 shadow-sm cursor-pointer whitespace-nowrap"
                        title="Mở Biên bản & Hồ sơ Giải trình Thuế 1-Click (Tax Defense Dossier)"
                      >
                        <FileText className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Hồ sơ Thuế</span>
                      </button>

                      {/* Override Button */}
                      <button
                        onClick={() => onOverride(entry.id)}
                        className={`p-1.5 rounded-lg border text-xs transition-all cursor-pointer ${
                          entry.isOverridden
                            ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 hover:bg-rose-500/30'
                            : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-amber-300 hover:border-amber-500/40'
                        }`}
                        title={entry.isOverridden ? "Khôi phục phán quyết gốc" : "Ghi đè phán quyết"}
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>

                      {/* Undo Button */}
                      <button
                        onClick={() => onUndo(entry.id)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/40 text-slate-400 hover:text-rose-300 border border-slate-700 hover:border-rose-500/40 transition-all cursor-pointer"
                        title="Hoàn tác quyết định kiểm toán này"
                      >
                        <Undo2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="py-8 text-center border border-dashed border-slate-800 rounded-xl bg-slate-950/30">
          <p className="text-xs sm:text-sm text-slate-400">
            {filter === 'ALL'
              ? 'Chưa có thao tác nào trong nhật ký. Mọi hóa đơn được duyệt hoặc xử lý chuyển tiếp sẽ lưu lại ở đây.'
              : 'Không có bản ghi nào trong mục lọc này.'}
          </p>
        </div>
      )}
    </div>
  );
};
