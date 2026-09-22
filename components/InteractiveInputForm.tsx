'use client';

import React, { useState } from 'react';
import { Send, FilePlus, Sparkles, ChevronDown, CheckCircle2, AlertCircle } from 'lucide-react';
import { InvoiceInput, RefereeDecision } from '@/lib/schemas';
import { MOCK_INVOICES } from '@/data/mockInvoices';
import { formatVND } from '@/lib/utils';
import { getApplicableRegulations } from '@/data/regulatoryRegistry';

interface InteractiveInputFormProps {
  onEvaluateResult: (decision: RefereeDecision, invoice: InvoiceInput) => void;
}

export const InteractiveInputForm: React.FC<InteractiveInputFormProps> = ({ onEvaluateResult }) => {
  // 10 ca ngoài bộ verify 90s để Giám khảo chọn nhanh
  const extraCases = MOCK_INVOICES.filter(inv => inv.id !== 'TC-01' && inv.id !== 'TC-02' && inv.id !== 'TC-06' && inv.id !== 'TC-07' && inv.id !== 'TC-13');

  const [selectedCaseId, setSelectedCaseId] = useState<string>('TC-10');
  const [formData, setFormData] = useState<InvoiceInput>(
    MOCK_INVOICES.find(inv => inv.id === 'TC-10') || MOCK_INVOICES[0]
  );
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [lastEngine, setLastEngine] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{
    status: 'ROUTINE' | 'ESCALATED';
    message: string;
    approvedTax?: number;
    riskGroup?: string;
  } | null>(null);

  const handleSelectPreset = (id: string) => {
    setSelectedCaseId(id);
    setLastResult(null);
    const found = MOCK_INVOICES.find(inv => inv.id === id);
    if (found) {
      setFormData({ ...found });
    }
  };

  const handleInputChange = (field: keyof InvoiceInput, value: any) => {
    setLastResult(null); // Xóa feedback cũ khi người dùng điều chỉnh thông số
    setFormData(prev => {
      const updated = { ...prev, [field]: value };
      // Tự động tính lại tổng tiền nếu đổi tiền trước thuế hoặc thuế suất
      if (field === 'preTaxAmount' || field === 'taxRate') {
        const pre = field === 'preTaxAmount' ? Number(value) : updated.preTaxAmount;
        const rate = field === 'taxRate' ? Number(value) : updated.taxRate;
        const tax = Number((pre * (rate / 100)).toFixed(0));
        updated.taxAmount = tax;
        updated.totalAmount = pre + tax;
      }
      return updated;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsEvaluating(true);
    try {
      const res = await fetch('/api/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (data.decision) {
        setLastEngine(data.engineUsed || 'JEV_AI');
        if (data.decision.status === 'ROUTINE') {
          setLastResult({
            status: 'ROUTINE',
            message: 'Hóa đơn HỢP LỆ 100%! AI đã tự động duyệt thông suốt (Straight-Through). Thẻ phán quyết ngoại lệ đã được giải phóng.',
            approvedTax: data.decision.approvedTaxAmount
          });
        } else {
          setLastResult({
            status: 'ESCALATED',
            message: `Hóa đơn phát sinh rủi ro (${data.decision.riskGroup}). Đã kích hoạt Thẻ Phán quyết A/B bên cột phải.`,
            riskGroup: data.decision.riskGroup
          });
        }
        onEvaluateResult(data.decision, formData);
      }
    } catch (err) {
      console.error('Lỗi khi đối soát hóa đơn:', err);
    } finally {
      setIsEvaluating(false);
    }
  };

  return (
    <div className="w-full bg-slate-900/90 border border-slate-700/80 rounded-2xl p-5 shadow-xl backdrop-blur-md space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <FilePlus className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-slate-100 flex items-center gap-2">
              Thử nghiệm Hóa đơn Mới Tùy biến (Giám khảo Input)
            </h3>
            <p className="text-xs text-slate-400">
              Tiêu chí 8 điểm dữ liệu mới · Nhập tay hoặc chọn nhanh các ca ngoại lệ
            </p>
          </div>
        </div>

        {lastEngine && (
          <span className="text-[11px] font-mono font-bold px-2.5 py-1 rounded-full bg-slate-800 text-cyan-300 border border-slate-700">
            Engine: {lastEngine}
          </span>
        )}
      </div>

      {/* Preset Selector */}
      <div className="space-y-1.5">
        <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
          Chọn nhanh hồ sơ mẫu để thử nghiệm:
        </label>
        <div className="relative">
          <select
            value={selectedCaseId}
            onChange={(e) => handleSelectPreset(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 text-sm font-semibold focus:outline-none focus:border-amber-500 transition-colors appearance-none cursor-pointer"
          >
            {extraCases.map((c) => (
              <option key={c.id} value={c.id}>
                [{c.id}] {c.supplierName} - {formatVND(c.totalAmount)} ({c.itemName.substring(0, 45)}...)
              </option>
            ))}
          </select>
          <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5 pointer-events-none" />
        </div>
      </div>

      {/* Interactive Form */}
      <form onSubmit={handleSubmit} className="space-y-3.5 text-xs text-slate-300">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-slate-400 font-medium mb-1">Mã HĐ & Ngày lập hóa đơn:</label>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={formData.invoiceNumber}
                onChange={(e) => handleInputChange('invoiceNumber', e.target.value)}
                placeholder="Số hóa đơn"
                className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 text-xs font-mono focus:border-amber-500 outline-none"
              />
              <input
                type="date"
                value={formData.invoiceDate}
                onChange={(e) => handleInputChange('invoiceDate', e.target.value)}
                className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 text-xs font-mono focus:border-amber-500 outline-none"
              />
            </div>
            {/* Live temporal legal hint */}
            <div className="mt-1 text-[10px] text-blue-400/90 font-mono truncate">
              Hiệu lực: {getApplicableRegulations(formData.invoiceDate).applicableRegulations.map(d => d.code).slice(0, 3).join(', ')}
            </div>
          </div>

          <div>
            <label className="block text-slate-400 font-medium mb-1">Mã số thuế & Tên Đối tác:</label>
            <div className="grid grid-cols-12 gap-2">
              <input
                type="text"
                value={formData.supplierTaxCode}
                onChange={(e) => handleInputChange('supplierTaxCode', e.target.value)}
                placeholder="MST"
                className="col-span-4 px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 text-xs font-mono focus:border-amber-500 outline-none"
              />
              <input
                type="text"
                value={formData.supplierName}
                onChange={(e) => handleInputChange('supplierName', e.target.value)}
                placeholder="Tên đầy đủ nhà cung cấp"
                className="col-span-8 px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 text-xs font-semibold focus:border-amber-500 outline-none"
                title={formData.supplierName}
              />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-slate-400 font-medium mb-1">Mặt hàng / Dịch vụ ghi trên HĐ:</label>
          <input
            type="text"
            value={formData.itemName}
            onChange={(e) => handleInputChange('itemName', e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:border-amber-500 outline-none"
          />
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          <div>
            <div className="flex items-center justify-between text-slate-400 font-medium mb-1">
              <span>Tiền trước thuế:</span>
              <span className="text-[10px] text-emerald-400 font-mono font-bold">
                {formatVND(formData.preTaxAmount)}
              </span>
            </div>
            <input
              type="number"
              value={formData.preTaxAmount}
              onChange={(e) => handleInputChange('preTaxAmount', Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-emerald-400 font-mono text-xs font-bold focus:border-amber-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-slate-400 font-medium mb-1">Thuế suất:</label>
            <select
              value={formData.taxRate}
              onChange={(e) => handleInputChange('taxRate', Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 font-mono text-xs font-bold focus:border-amber-500 outline-none cursor-pointer"
            >
              <option value={0}>0% (KCT)</option>
              <option value={8}>8% (Giảm thuế)</option>
              <option value={10}>10% (Chuẩn)</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-400 font-medium mb-1">Thanh toán:</label>
            <select
              value={formData.paymentMethod}
              onChange={(e) => handleInputChange('paymentMethod', e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 text-xs font-bold focus:border-amber-500 outline-none cursor-pointer"
            >
              <option value="BANK_TRANSFER">Chuyển khoản (CK)</option>
              <option value="CASH">Tiền mặt (TM)</option>
            </select>
          </div>
        </div>

        {/* Live Tax Preview Bar */}
        <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-slate-400">Hàng: <strong className="text-slate-200">{formatVND(formData.preTaxAmount)}</strong></span>
            <span className="text-slate-500">+</span>
            <span className="text-slate-400">Thuế ({formData.taxRate}%): <strong className="text-cyan-400">+{formatVND(formData.taxAmount)}</strong></span>
          </div>
          <div className="flex items-center gap-1.5 sm:border-l sm:border-slate-800 sm:pl-3">
            <span className="text-slate-400">Tổng thanh toán:</span>
            <span className="text-amber-400 font-black text-sm">{formatVND(formData.totalAmount)}</span>
          </div>
        </div>

        {/* Result Feedback Banner */}
        {lastResult && (
          <div
            className={`p-3 rounded-xl border text-xs font-semibold flex items-start gap-2.5 animate-in fade-in duration-200 ${
              lastResult.status === 'ROUTINE'
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                : 'bg-amber-500/15 border-amber-500/40 text-amber-300'
            }`}
          >
            {lastResult.status === 'ROUTINE' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            )}
            <div className="leading-relaxed">
              <span>{lastResult.message}</span>
              {lastResult.approvedTax !== undefined && (
                <div className="font-mono font-bold text-emerald-200 mt-1">
                  Thuế GTGT khấu trừ được duyệt: +{formatVND(lastResult.approvedTax)}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Action Button */}
        <button
          type="submit"
          disabled={isEvaluating}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-sm uppercase tracking-wider shadow-lg shadow-amber-500/20 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 cursor-pointer"
        >
          <Sparkles className="w-4 h-4 fill-current" />
          <span>{isEvaluating ? 'Đang thẩm định bằng AI...' : 'Thẩm định bằng Jev Referee AI'}</span>
        </button>
      </form>
    </div>
  );
};
