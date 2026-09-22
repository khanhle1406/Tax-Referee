'use client';

import React from 'react';
import { ShieldCheck, BookOpen, RotateCcw, Sparkles } from 'lucide-react';

interface HeaderBannerProps {
  onOpenPolicy: () => void;
  onResetData: () => void;
  sopVersion?: string;
}

export const HeaderBanner: React.FC<HeaderBannerProps> = ({ onOpenPolicy, onResetData, sopVersion = 'v2.1' }) => {
  return (
    <div className="w-full bg-gradient-to-r from-amber-500/20 via-amber-500/10 to-transparent border-b border-amber-500/30 px-4 sm:px-6 py-3.5 backdrop-blur-md">
      <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        {/* Banner content & 3-Step Stepper */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="p-2 bg-amber-500/20 rounded-xl border border-amber-500/40 text-amber-400 shrink-0 hidden sm:block">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500 text-slate-950 uppercase tracking-wider">
                Quy trình Nghiệm thu Đề bài A
              </span>
              <span className="text-[11px] text-amber-300/80 font-mono">
                MLAI Hackathon 2026 · The Escalation Referee
              </span>
            </div>

            {/* Stepper Flow */}
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-200 flex-wrap pt-0.5">
              <span className="flex items-center gap-1 text-emerald-400 font-extrabold bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-500/30">
                1. RUN VERIFY 90s
              </span>
              <span className="text-slate-500">➔</span>
              <span className="flex items-center gap-1 text-amber-300 font-extrabold bg-amber-950/40 px-2 py-0.5 rounded border border-amber-500/30">
                2. Phán quyết Thẻ A/B (HITL)
              </span>
              <span className="text-slate-500">➔</span>
              <span className="flex items-center gap-1 text-cyan-300 font-extrabold bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-500/30">
                3. Xuất Hồ sơ Giải trình 1-Click
              </span>
            </div>
          </div>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end shrink-0">
          <button
            onClick={onOpenPolicy}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900/90 hover:bg-purple-950/50 border border-purple-500/50 text-slate-200 text-xs font-bold transition-all hover:scale-105 active:scale-95 shadow-sm cursor-pointer group"
            title="Mở Trung tâm Quản trị Quy chế nội bộ và Pháp lý Thuế"
          >
            <BookOpen className="w-4 h-4 text-purple-400 group-hover:rotate-12 transition-transform" />
            <span>Quy chế Tax-SOP-2026 ({sopVersion})</span>
            <span className="px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 text-[10px] font-mono border border-purple-500/30">
              GROUND TRUTH
            </span>
          </button>

          <button
            onClick={onResetData}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900/90 hover:bg-rose-950/50 border border-rose-500/40 text-rose-300 text-xs font-bold transition-all hover:scale-105 active:scale-95 shadow-sm cursor-pointer"
            title="Khôi phục toàn bộ dữ liệu kiểm thử về trạng thái ban đầu"
          >
            <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
            <span>Reset Data</span>
          </button>
        </div>
      </div>
    </div>
  );
};
