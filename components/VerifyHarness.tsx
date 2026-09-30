'use client';

import React, { useState } from 'react';
import { Play, CheckCircle2, XCircle, Clock, ShieldCheck, AlertTriangle, ArrowRight } from 'lucide-react';
import { formatVND } from '@/lib/utils';
import confetti from 'canvas-confetti';

interface VerifyResultItem {
  testId: string;
  invoiceNumber: string;
  supplierName: string;
  totalAmount: number;
  actualStatus: 'ROUTINE' | 'ESCALATED';
  riskGroup?: string;
  schemaValid: boolean;
  executionTimeMs: number;
  actionableQuestion?: string;
  plainExplanation?: string;
}

interface VerifySummary {
  totalCases: number;
  passedCases: number;
  routineCases: number;
  escalatedCases: number;
  allSchemaValid: boolean;
  verificationScope: string;
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

      if (data.summary?.allSchemaValid) {
        confetti({
          particleCount: 35,
          spread: 45,
          origin: { y: 0.7 }
        });
      }
    } catch (error) {
      console.error('Lỗi kiểm thử:', error);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="w-full bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-card space-y-6">
      
      {/* Header & Run Action - To, Rõ, Cực ít chữ */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-950">
            Kiểm thử 5 Ca Mẫu Chuẩn
          </h2>
          <p className="text-sm font-semibold text-slate-500 mt-1">
            Đánh giá phân luồng: 3 Routine · 2 Escalated
          </p>
        </div>

        <button
          onClick={handleRunVerify}
          disabled={isRunning}
          className="flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl bg-slate-950 hover:bg-slate-900 active:scale-[0.99] text-white text-sm font-bold tracking-wide transition-all disabled:opacity-50 cursor-pointer shadow-sm shrink-0"
        >
          <Play className={`w-4 h-4 fill-brand-lime text-brand-lime ${isRunning ? 'animate-spin' : ''}`} />
          <span>{isRunning ? 'ĐANG CHẠY...' : 'CHẠY KIỂM THỬ TOÀN BỘ'}</span>
        </button>
      </div>

      {/* 4 Big KPI Stat Cards (To, Rõ số liệu, Ít chữ) */}
      {hasRun && summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Cấu trúc Schema</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-slate-950">
                {summary.allSchemaValid ? '100%' : 'Lỗi'}
              </span>
              <span className="text-xs font-bold text-emerald-600">Đạt chuẩn</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Tốc độ xử lý</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-slate-950 font-numeric">
                {summary.totalTimeMs} ms
              </span>
              <span className="text-xs font-semibold text-slate-500">~2ms/ca</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">Tự động duyệt</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-emerald-950 font-numeric">
                {summary.routineCases}
              </span>
              <span className="text-xs font-bold text-emerald-700">ca Routine</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-amber-50/60 border border-amber-200">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-700">Chặn xét duyệt</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-amber-950 font-numeric">
                {summary.escalatedCases}
              </span>
              <span className="text-xs font-bold text-amber-700">ca Escalated</span>
            </div>
          </div>

        </div>
      )}

      {/* Results Table - Chữ to, Rõ, Đậm số tiền */}
      {hasRun && results.length > 0 ? (
        <div className="w-full rounded-xl border border-slate-200 bg-white overflow-hidden shadow-subtle">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-600">
                <th className="py-3 px-4">Mã Ca & Đối Tác</th>
                <th className="py-3 px-4 text-right">Số Tiền (VNĐ)</th>
                <th className="py-3 px-4 text-center">Phân Luồng</th>
                <th className="py-3 px-4 text-center">Schema</th>
                <th className="py-3 px-4 text-right">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {results.map((item) => {
                const isSelected = selectedCaseId === item.testId;
                const isEscalated = item.actualStatus === 'ESCALATED';

                return (
                  <tr
                    key={item.testId}
                    className={`transition-colors ${
                      isSelected
                        ? 'bg-amber-50/80 font-medium'
                        : 'hover:bg-slate-50/60'
                    }`}
                  >
                    {/* Mã & Tên đối tác */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                          {item.testId}
                        </span>
                        <span className="font-bold text-slate-950 text-sm">
                          {item.supplierName}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 font-mono mt-0.5">
                        HĐ: {item.invoiceNumber}
                      </div>
                    </td>

                    {/* Số tiền to rõ */}
                    <td className="py-3.5 px-4 text-right font-numeric font-bold text-base text-slate-950">
                      {formatVND(item.totalAmount)}
                    </td>

                    {/* Badge trạng thái */}
                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`inline-flex px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider ${
                          item.actualStatus === 'ROUTINE'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : 'bg-amber-100 text-amber-900 border border-amber-200'
                        }`}
                      >
                        {item.actualStatus}
                      </span>
                    </td>

                    {/* Schema status */}
                    <td className="py-3.5 px-4 text-center">
                      {item.schemaValid ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
                          <CheckCircle2 className="w-4 h-4" /> Đạt
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-700">
                          <XCircle className="w-4 h-4" /> Lỗi
                        </span>
                      )}
                    </td>

                    {/* Thao tác */}
                    <td className="py-3.5 px-4 text-right">
                      {isEscalated && onSelectEscalatedCase ? (
                        <button
                          onClick={() => onSelectEscalatedCase(item.testId)}
                          className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                            isSelected
                              ? 'bg-slate-950 text-white'
                              : 'border border-slate-300 bg-white hover:bg-slate-100 text-slate-900'
                          }`}
                        >
                          <span>{isSelected ? 'Đang xem' : 'Xem phán quyết'}</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <span className="text-xs font-semibold text-slate-400">Tự động duyệt</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="py-12 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
          <p className="text-sm font-semibold text-slate-600">
            Bấm <span className="font-bold text-slate-950">"CHẠY KIỂM THỬ TOÀN BỘ"</span> ở trên để bắt đầu.
          </p>
        </div>
      )}

    </div>
  );
};
