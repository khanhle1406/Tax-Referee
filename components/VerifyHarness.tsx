'use client';

import React, { useState } from 'react';
import { Play, CheckCircle2, XCircle, Clock, Zap, AlertTriangle, ShieldCheck, ChevronRight } from 'lucide-react';
import { formatVND } from '@/lib/utils';
import confetti from 'canvas-confetti';

interface VerifyResultItem {
  testId: string;
  invoiceNumber: string;
  supplierName: string;
  totalAmount: number;
  expectedStatus: 'ROUTINE' | 'ESCALATED';
  actualStatus: 'ROUTINE' | 'ESCALATED';
  riskGroup?: string;
  passed: boolean;
  executionTimeMs: number;
  actionableQuestion?: string;
  plainExplanation?: string;
}

interface VerifySummary {
  totalCases: number;
  passedCases: number;
  routineCases: number;
  escalatedCases: number;
  allPassed: boolean;
  totalTimeMs: number;
  timestamp: string;
}

interface VerifyHarnessProps {
  onSelectEscalatedCase?: (testId: string) => void;
  selectedCaseId?: string | null;
}

export const VerifyHarness: React.FC<VerifyHarnessProps> = ({ onSelectEscalatedCase, selectedCaseId }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [summary, setSummary] = useState<VerifySummary | null>(null);
  const [results, setResults] = useState<VerifyResultItem[]>([]);
  const [hasRun, setHasRun] = useState(false);

  const handleRunVerify = async () => {
    setIsRunning(true);
    try {
      const response = await fetch('/api/verify');
      const data = await response.json();
      
      setSummary(data.summary);
      setResults(data.results);
      setHasRun(true);

      if (data.summary?.allPassed) {
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.7 }
        });
      }
    } catch (error) {
      console.error('Lỗi khi chạy Verify Harness:', error);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="w-full bg-slate-900/90 border border-slate-700/80 rounded-2xl p-5 shadow-xl backdrop-blur-md space-y-4">
      {/* Header with Run Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h2 className="text-xl font-extrabold text-slate-100 flex items-center gap-2">
            <Zap className="w-6 h-6 text-emerald-400" />
            Bộ Công cụ Kiểm thử Tự động (Verify Harness)
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Thao tác 1 chạm dành cho Giám khảo · Thực thi 5 ca chuẩn theo Đề bài A
          </p>
        </div>

        <button
          onClick={handleRunVerify}
          disabled={isRunning}
          className="relative flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-slate-950 text-base font-black uppercase tracking-wider shadow-lg shadow-emerald-500/25 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed group cursor-pointer shrink-0"
        >
          <Play className={`w-5 h-5 fill-current ${isRunning ? 'animate-spin' : 'group-hover:scale-110'} transition-transform`} />
          <span className="whitespace-nowrap">{isRunning ? 'Đang Kiểm thử...' : 'RUN VERIFY 90s'}</span>
          <span className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
          </span>
        </button>
      </div>

      {/* Summary Stat Pills */}
      {hasRun && summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 animate-in fade-in duration-300">
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center gap-2.5">
            <div className={`p-1.5 rounded-lg ${summary.allPassed ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
              {summary.allPassed ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            </div>
            <div>
              <div className="text-[11px] text-slate-400">Kết quả chung</div>
              <div className="text-xs sm:text-sm font-black text-slate-200">
                {summary.allPassed ? '100% ĐẠT CHUẨN' : 'CÓ LỖI'}
              </div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-cyan-500/20 text-cyan-400">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[11px] text-slate-400">Tổng thời gian</div>
              <div className="text-xs sm:text-sm font-mono font-bold text-cyan-300">
                {summary.totalTimeMs} ms <span className="text-[10px] text-slate-500 font-normal">(~2ms/ca)</span>
              </div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[11px] text-slate-400">Tự động duyệt</div>
              <div className="text-xs sm:text-sm font-bold text-emerald-400">
                {summary.routineCases} / 3 ca (ROUTINE)
              </div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[11px] text-slate-400">Dừng chuyển tiếp</div>
              <div className="text-xs sm:text-sm font-bold text-amber-400">
                {summary.escalatedCases} / 2 ca (ESCALATED)
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Results Table - Streamlined 4-Column Layout with strict column constraints */}
      {hasRun && results.length > 0 ? (
        <div className="w-full rounded-xl border border-slate-800 bg-slate-950/60 overflow-hidden">
          <table className="w-full table-fixed text-left text-xs border-collapse">
            <colgroup>
              <col className="w-5/12" />
              <col className="w-3/12" />
              <col className="w-2/12" />
              <col className="w-2/12" />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/90 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="py-2.5 px-3 truncate">Hóa đơn & Đối tác</th>
                <th className="py-2.5 px-1 text-center">Phân loại AI</th>
                <th className="py-2.5 px-1 text-center">Đánh giá</th>
                <th className="py-2.5 px-2 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300 font-normal">
              {results.map((item) => {
                const isSelected = selectedCaseId === item.testId;
                const isEscalated = item.actualStatus === 'ESCALATED';

                return (
                  <tr
                    key={item.testId}
                    className={`transition-all ${
                      isSelected
                        ? 'bg-amber-500/15 border-l-4 border-amber-400 shadow-inner'
                        : isEscalated
                        ? 'bg-amber-500/5 hover:bg-slate-800/40'
                        : 'hover:bg-slate-800/40'
                    }`}
                  >
                    {/* Column 1: Supplier & Invoice Info */}
                    <td className="py-2.5 px-3 overflow-hidden">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-mono font-bold text-slate-200 text-[10px] bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700 shrink-0">
                          {item.testId}
                        </span>
                        <span className="font-semibold text-slate-100 text-xs truncate" title={item.supplierName}>
                          {item.supplierName}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono flex items-center gap-1.5 mt-0.5 truncate">
                        <span>{item.invoiceNumber}</span>
                        <span>·</span>
                        <span className="text-emerald-400 font-bold whitespace-nowrap">
                          {formatVND(item.totalAmount)}
                        </span>
                      </div>
                    </td>

                    {/* Column 2: Status Badge */}
                    <td className="py-2.5 px-1 text-center overflow-hidden">
                      <span
                        className={`inline-flex items-center justify-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold whitespace-nowrap ${
                          item.actualStatus === 'ROUTINE'
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                        }`}
                      >
                        {item.actualStatus}
                      </span>
                    </td>

                    {/* Column 3: Verification Result */}
                    <td className="py-2.5 px-1 text-center overflow-hidden">
                      {item.passed ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 whitespace-nowrap">
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          <span>ĐẠT</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-400 whitespace-nowrap">
                          <XCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>SAI</span>
                        </span>
                      )}
                    </td>

                    {/* Column 4: Actions */}
                    <td className="py-2.5 px-2 text-right">
                      {isEscalated && onSelectEscalatedCase ? (
                        <button
                          onClick={() => onSelectEscalatedCase(item.testId)}
                          className={`inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all shadow-sm cursor-pointer whitespace-nowrap ${
                            isSelected
                              ? 'bg-amber-400 text-slate-950 ring-2 ring-amber-300'
                              : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 hover:scale-105 active:scale-95'
                          }`}
                          title="Mở Thẻ Phán Quyết Con Người (Option A/B) ở cột bên phải"
                        >
                          <span>{isSelected ? 'Đang mở' : 'Xử lý A/B'}</span>
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      ) : (
                        <span className="text-[10px] text-slate-500 font-mono italic">Routine</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="py-8 text-center border border-dashed border-slate-800 rounded-xl bg-slate-950/30">
          <p className="text-xs sm:text-sm text-slate-400">
            Chưa có kết quả kiểm thử. Hãy bấm nút <span className="text-emerald-400 font-bold uppercase">"RUN VERIFY 90s"</span> ở trên để khởi chạy tự động 5 ca chuẩn.
          </p>
        </div>
      )}
    </div>
  );
};
