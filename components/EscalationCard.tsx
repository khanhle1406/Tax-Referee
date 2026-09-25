'use client';

import React from 'react';
import { AlertOctagon, Scale, HelpCircle, Check, ArrowRight, UserCheck, ShieldAlert, Sparkles } from 'lucide-react';
import { EscalatedDecision, ActionOption } from '@/lib/schemas';
import { formatVND } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface EscalationCardProps {
  decision: EscalatedDecision | null;
  onResolve: (option: ActionOption) => void;
  onDismiss?: () => void;
  onSelectPreset?: (testId: string) => void;
}

export const EscalationCard: React.FC<EscalationCardProps> = ({ decision, onResolve, onSelectPreset }) => {
  if (!decision) {
    return (
      <div className="w-full bg-slate-900/60 border border-dashed border-slate-700/80 rounded-2xl p-6 text-center backdrop-blur-sm space-y-4">
        <div className="mx-auto w-12 h-12 rounded-2xl bg-slate-800/80 flex items-center justify-center text-slate-400">
          <UserCheck className="w-6 h-6 text-amber-400" />
        </div>
        <div>
          <h3 className="text-base font-bold text-slate-200">Không có hồ sơ nào đang chờ duyệt</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto leading-relaxed">
            Mọi hóa đơn hợp lệ đã được AI xử lý thông suốt tự động (Straight-Through). Khi phát sinh ngoại lệ, thẻ này sẽ hiển thị câu hỏi hành động kèm 2 phương án A/B để con người phán quyết.
          </p>
        </div>

        {onSelectPreset && (
          <div className="pt-3 border-t border-slate-800/80 space-y-2">
            <div className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">
              Bấm thử nhanh 1 ca ngoại lệ để trải nghiệm Thẻ Phán quyết A/B:
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5">
              <button
                onClick={() => onSelectPreset('TC-07')}
                className="w-full sm:w-auto px-4 py-2 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all hover:scale-105 active:scale-95 cursor-pointer shadow-sm"
              >
                <HelpCircle className="w-3.5 h-3.5 text-cyan-400" />
                <span>Ca Nghi ngờ MST (TC-07 · KTT)</span>
              </button>

              <button
                onClick={() => onSelectPreset('TC-14')}
                className="w-full sm:w-auto px-4 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all hover:scale-105 active:scale-95 cursor-pointer shadow-sm"
              >
                <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                <span>Ca Vượt trần Hệ số K (TC-14 · CFO)</span>
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Label phân loại 3 nhóm chuẩn Đề bài A
  const riskLabels = {
    UNCERTAIN_INFO: {
      name: 'NHÓM 1: CHƯA XÁC ĐỊNH THÔNG TIN THỰC TẾ',
      badgeClass: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
      icon: HelpCircle
    },
    OUT_OF_POLICY: {
      name: 'NHÓM 2: NẰM NGOÀI PHẠM VI QUY ĐỊNH',
      badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      icon: AlertOctagon
    },
    EXCEED_AUTHORITY: {
      name: 'NHÓM 3: VƯỢT THẨM QUYỀN PHÊ DUYỆT (CẦN CFO)',
      badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
      icon: ShieldAlert
    }
  }[decision.riskGroup];

  const RiskIcon = riskLabels.icon;

  return (
    <div className="w-full bg-gradient-to-b from-slate-900 via-slate-900/95 to-slate-950 border-2 border-amber-500/60 rounded-2xl p-6 shadow-2xl shadow-amber-500/10 backdrop-blur-md animate-in slide-in-from-top-4 duration-300 space-y-5">
      {/* Top Tag & Approver Role */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
        <Badge variant="outline" className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black ${riskLabels.badgeClass}`}>
          <RiskIcon className="w-4 h-4" />
          <span>{riskLabels.name}</span>
        </Badge>

        <div className="flex items-center gap-2 flex-wrap">
          {decision.engineUsed && (
            <Badge variant="outline" className="text-[11px] font-mono font-bold px-2.5 py-1 rounded-full bg-slate-800 text-emerald-300 border-emerald-500/30 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-emerald-400" />
              {decision.engineUsed === 'JEV_AND_GEMINI_AI'
                ? 'Gemini Flash AI + Jev AI'
                : decision.engineUsed === 'GEMINI_AI'
                ? 'Gemini Flash Q-Gen'
                : decision.engineUsed === 'JEV_AI'
                ? 'Jev System One AI'
                : 'Local Ground Truth'}
              {decision.confidence && (
                <span className="text-slate-400 font-normal">({Math.round(decision.confidence * 100)}%)</span>
              )}
            </Badge>
          )}

          <Badge variant="secondary" className="text-xs font-bold text-slate-300 bg-slate-800/80 px-3 py-1 border-slate-700">
            Cấp duyệt: <span className={decision.requiresCFO ? 'text-rose-400 font-extrabold ml-1' : 'text-purple-400 font-extrabold ml-1'}>
              {decision.requiresCFO ? 'Giám đốc Tài chính (CFO)' : 'Kế toán trưởng (KTT)'}
            </span>
          </Badge>
        </div>
      </div>

      {/* Invoice Overview */}
      <div className="flex items-start justify-between gap-4 p-4 rounded-xl bg-slate-950/70 border border-slate-800/80">
        <div className="min-w-0 flex-1">
          <span className="text-xs text-slate-400 font-mono">Hóa đơn: {decision.invoiceId}</span>
          <h4 className="text-lg font-extrabold text-slate-100 truncate" title={decision.supplierName}>
            {decision.supplierName}
          </h4>
          <p className="text-xs text-slate-400 mt-0.5">
            Lý do cắm cờ: <span className="text-rose-300 font-medium">{decision.flaggedReason}</span>
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-xs text-slate-400">Tổng thanh toán</div>
          <div className="text-2xl font-mono font-black text-amber-400 whitespace-nowrap">
            {formatVND(decision.totalAmount)}
          </div>
        </div>
      </div>

      {/* Actionable Question Display - Chữ To Rõ */}
      <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-400">
          <Scale className="w-4 h-4" />
          <span>Câu hỏi Hành động Cụ thể (Actionable Question)</span>
        </div>
        <p className="text-lg sm:text-xl font-bold text-amber-100 leading-relaxed">
          {decision.actionableQuestion}
        </p>
        <p className="text-xs text-slate-400 pt-1 font-mono">
          Căn cứ: <span className="text-slate-300">{decision.sopClause}</span>
        </p>
      </div>

      {/* Binary Choice Buttons: Option A & Option B */}
      <div className="space-y-2 pt-1">
        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
          Chọn 1 trong 2 phương án giải quyết (Con người quyết định):
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Button A */}
          <button
            onClick={() => onResolve(decision.options[0])}
            className="flex flex-col text-left p-4 rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 hover:from-purple-950/60 hover:to-slate-900 border border-purple-500/40 hover:border-purple-400 text-slate-100 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-md group cursor-pointer"
          >
            <div className="flex items-center justify-between w-full text-xs text-purple-400 font-black mb-1">
              <span>PHƯƠNG ÁN A</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
            <div className="text-base font-extrabold text-white group-hover:text-purple-300 transition-colors">
              {decision.options[0].label}
            </div>
            <div className="text-xs text-slate-400 mt-1 leading-snug">
              {decision.options[0].actionDescription}
            </div>
          </button>

          {/* Button B */}
          <button
            onClick={() => onResolve(decision.options[1])}
            className="flex flex-col text-left p-4 rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 hover:from-rose-950/60 hover:to-slate-900 border border-rose-500/40 hover:border-rose-400 text-slate-100 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-md group cursor-pointer"
          >
            <div className="flex items-center justify-between w-full text-xs text-rose-400 font-black mb-1">
              <span>PHƯƠNG ÁN B</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
            <div className="text-base font-extrabold text-white group-hover:text-rose-300 transition-colors">
              {decision.options[1].label}
            </div>
            <div className="text-xs text-slate-400 mt-1 leading-snug">
              {decision.options[1].actionDescription}
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};
