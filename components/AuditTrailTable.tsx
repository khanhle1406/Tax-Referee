'use client';

import React from 'react';
import { History, Undo2, RotateCcw, FileText } from 'lucide-react';
import { AuditEntry } from '@/lib/schemas';
import { formatVND, formatDateTime } from '@/lib/utils';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

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
  onViewDossier,
}) => {
  const [filter, setFilter] = React.useState<'ALL' | 'ROUTINE' | 'ESCALATED' | 'OVERRIDDEN'>('ALL');

  const countRoutine = entries.filter((e) => e.actor === 'SYSTEM_REFEREE').length;
  const countEscalated = entries.filter((e) => e.actor !== 'SYSTEM_REFEREE').length;
  const countOverridden = entries.filter((e) => e.isOverridden).length;

  const filteredEntries = entries.filter((e) => {
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

        {/* Quick Filter Tabs using shadcn Tabs */}
        <Tabs value={filter} onValueChange={(val) => setFilter(val as typeof filter)}>
          <TabsList className="bg-slate-950/80 border-slate-800 h-8">
            <TabsTrigger value="ALL" className="text-xs px-2.5 py-1">
              Tất cả ({entries.length})
            </TabsTrigger>
            <TabsTrigger value="ROUTINE" className="text-xs px-2.5 py-1">
              Tự duyệt ({countRoutine})
            </TabsTrigger>
            <TabsTrigger value="ESCALATED" className="text-xs px-2.5 py-1">
              HITL ({countEscalated})
            </TabsTrigger>
            <TabsTrigger value="OVERRIDDEN" className="text-xs px-2.5 py-1">
              Ghi đè ({countOverridden})
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Table Display using shadcn Table */}
      {filteredEntries.length > 0 ? (
        <div className="w-full rounded-xl border border-slate-800 bg-slate-950/60 max-h-[460px] overflow-y-auto">
          <Table className="table-fixed text-xs">
            <colgroup>
              <col className="w-[18%]" />
              <col className="w-[24%]" />
              <col className="w-[22%]" />
              <col className="w-[22%]" />
              <col className="w-[14%]" />
            </colgroup>
            <TableHeader className="sticky top-0 bg-slate-900/95 border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider z-10">
              <TableRow className="border-slate-800 hover:bg-transparent">
                <TableHead className="py-2.5 px-3">Thời gian & Mã HĐ</TableHead>
                <TableHead className="py-2.5 px-3">Nhà cung cấp & Số tiền</TableHead>
                <TableHead className="py-2.5 px-3">Người duyệt & Hành động</TableHead>
                <TableHead className="py-2.5 px-3">Căn cứ & Lý do giải trình</TableHead>
                <TableHead className="py-2.5 px-3 text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-slate-800/60 text-slate-300">
              {filteredEntries.map((entry) => (
                <TableRow key={entry.id} className="transition-colors hover:bg-slate-800/40 border-slate-800/60">
                  {/* Column 1: Time & Ref ID */}
                  <TableCell className="py-2.5 px-3 overflow-hidden">
                    <div className="font-mono text-slate-300 font-bold text-[11px]">
                      {entry.invoiceId}
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                      {formatDateTime(entry.timestamp)}
                    </div>
                    <div className="text-[9px] text-slate-600 font-mono">
                      Ref: {entry.id}
                    </div>
                  </TableCell>

                  {/* Column 2: Supplier & Amount */}
                  <TableCell className="py-2.5 px-3 overflow-hidden">
                    <div className="font-semibold text-slate-100 text-xs truncate" title={entry.supplierName}>
                      {entry.supplierName}
                    </div>
                    <div className="text-emerald-400 font-mono font-bold text-xs mt-0.5 whitespace-nowrap">
                      {formatVND(entry.totalAmount)}
                    </div>
                  </TableCell>

                  {/* Column 3: Actor & Action Taken */}
                  <TableCell className="py-2.5 px-3 overflow-hidden">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge
                        variant={
                          entry.actor === 'SYSTEM_REFEREE'
                            ? 'secondary'
                            : entry.actor === 'CHIEF_ACCOUNTANT'
                            ? 'info'
                            : 'destructive'
                        }
                        className="text-[10px] py-0 px-2 font-bold"
                      >
                        {entry.actor === 'SYSTEM_REFEREE' ? 'AI Referee' : entry.actor === 'CHIEF_ACCOUNTANT' ? 'Kế toán trưởng' : 'CFO'}
                      </Badge>

                      {entry.isOverridden && (
                        <Badge variant="destructive" className="text-[9px] py-0 px-1.5 font-bold">
                          ĐÃ GHI ĐÈ
                        </Badge>
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
                  </TableCell>

                  {/* Column 4: Plain explanation */}
                  <TableCell className="py-2.5 px-3 text-[11px] text-slate-400 overflow-hidden" title={entry.plainExplanation}>
                    <p className="line-clamp-2 leading-relaxed italic">
                      "{entry.plainExplanation}"
                    </p>
                  </TableCell>

                  {/* Column 5: 1-Click Dossier & Quick Actions */}
                  <TableCell className="py-2.5 px-3 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1.5">
                      {/* View Dossier Button */}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onViewDossier(entry)}
                        className="h-7 px-2.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 hover:text-emerald-200 border-emerald-500/40 text-xs font-bold shadow-sm"
                        title="Mở Biên bản & Hồ sơ Giải trình Thuế 1-Click (Tax Defense Dossier)"
                      >
                        <FileText className="w-3.5 h-3.5 mr-1 text-emerald-400" />
                        <span>Hồ sơ Thuế</span>
                      </Button>

                      {/* Override Button */}
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={() => onOverride(entry.id)}
                        className={`h-7 w-7 border text-xs ${
                          entry.isOverridden
                            ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 hover:bg-rose-500/30'
                            : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-amber-300 hover:border-amber-500/40'
                        }`}
                        title={entry.isOverridden ? "Khôi phục phán quyết gốc" : "Ghi đè phán quyết"}
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </Button>

                      {/* Undo Button */}
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={() => onUndo(entry.id)}
                        className="h-7 w-7 bg-slate-800 hover:bg-rose-950/40 text-slate-400 hover:text-rose-300 border-slate-700 hover:border-rose-500/40"
                        title="Hoàn tác quyết định kiểm toán này"
                      >
                        <Undo2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
