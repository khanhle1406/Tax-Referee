'use client';

import React from 'react';
import { AlertOctagon, Scale, HelpCircle, ArrowRight, ShieldAlert, Sparkles } from 'lucide-react';
import { EscalatedDecision, ActionOption } from '@/lib/schemas';
import { formatVND } from '@/lib/utils';

interface EscalationCardProps {
  decision: EscalatedDecision | null;
  onResolve: (option: ActionOption) => void;
  onDismiss?: () => void;
  onSelectPreset?: (testId: string) => void;
}

export const EscalationCard: React.FC<EscalationCardProps> = ({ decision, onResolve, onSelectPreset }) => {
  if (!decision) {
    return (
      <div className="w-full bg-white border border-dashed border-slate-200 rounded-2xl p-6 text-center space-y-4">
        <p className="text-sm font-bold text-slate-700">
          Không có hồ sơ nào đang chờ duyệt ngoại lệ.
        </p>
        {onSelectPreset && (
          <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
            <button
              onClick={() => onSelectPreset('TC-07')}
              className="px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-900 text-xs font-bold transition cursor-pointer"
            >
              Xem ca nghi ngờ MST (KTT)
            </button>
            <button
              onClick={() => onSelectPreset('TC-14')}
              className="px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-900 text-xs font-bold transition cursor-pointer"
            >
              Xem ca vượt trần Hệ số K (CFO)
            </button>
          </div>
        )}
      </div>
    );
  }

  const riskLabels = {
    UNCERTAIN_INFO: { name: 'Chưa rõ thông tin thực tế', badge: 'bg-slate-100 text-slate-900 border-slate-300' },
    OUT_OF_POLICY: { name: 'Ngoài chính sách quy định', badge: 'bg-amber-100 text-amber-900 border-amber-300' },
    EXCEED_AUTHORITY: { name: 'Vượt thẩm quyền phê duyệt', badge: 'bg-rose-100 text-rose-900 border-rose-300' }
  }[decision.riskGroup];

  return (
    <div className="w-full bg-white border border-slate-200 rounded-2xl p-6 shadow-card space-y-5">
      {/* Top Tag & Approver Role */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
        <span className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider border ${riskLabels.badge}`}>
          {riskLabels.name}
        </span>

        <span className="text-xs font-bold text-slate-800 bg-slate-100 px-3 py-1 rounded-lg border border-slate-200">
          Cấp thẩm quyền: <strong className="text-slate-950 font-extrabold">{decision.requiresCFO ? 'CFO' : 'Kế toán trưởng'}</strong>
        </span>
      </div>

      {/* Invoice Overview */}
      <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 border border-slate-200">
        <div>
          <span className="text-xs text-slate-500 font-mono font-bold">HĐ #{decision.invoiceId}</span>
          <h4 className="text-base font-bold text-slate-950">{decision.supplierName}</h4>
          <p className="text-xs font-semibold text-rose-700 mt-0.5">{decision.flaggedReason}</p>
        </div>
        <div className="text-right">
          <div className="text-xs font-bold text-slate-500 uppercase">Tổng tiền</div>
          <div className="text-xl font-numeric font-extrabold text-slate-950 mt-0.5">
            {formatVND(decision.totalAmount)}
          </div>
        </div>
      </div>

      {/* Actionable Question Display */}
      <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-1.5">
        <span className="text-xs font-bold uppercase tracking-wider text-amber-800 block">
          Câu hỏi thẩm định:
        </span>
        <p className="text-base font-bold text-slate-950 leading-snug">
          {decision.actionableQuestion}
        </p>
        <p className="text-xs font-mono font-bold text-slate-600 pt-1">
          Căn cứ: {decision.sopClause}
        </p>
      </div>

      {/* Binary Choice Buttons: Option A & Option B */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
        {decision.options.slice(0, 2).map((opt, idx) => (
          <button
            key={opt.id}
            onClick={() => onResolve(opt)}
            className="flex flex-col text-left p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-950 hover:shadow-subtle transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between w-full text-xs font-bold text-slate-500 mb-1">
              <span>PHƯƠNG ÁN {idx === 0 ? 'A' : 'B'}</span>
              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-slate-950 group-hover:translate-x-0.5 transition-all" />
            </div>
            <div className="text-sm font-bold text-slate-950">
              {opt.label}
            </div>
            <div className="text-xs font-medium text-slate-600 mt-1 leading-relaxed">
              {opt.actionDescription}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
