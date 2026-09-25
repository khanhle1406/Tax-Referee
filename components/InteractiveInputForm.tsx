'use client';

import React, { useState } from 'react';
import { Send, FilePlus, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react';
import { InvoiceInput, RefereeDecision, SystemPolicyConfig } from '@/lib/schemas';
import { formatVND } from '@/lib/utils';
import { getApplicableRegulations } from '@/data/regulatoryRegistry';
import { toast } from 'sonner';

interface InteractiveInputFormProps {
  onEvaluateResult: (decision: RefereeDecision, invoice: InvoiceInput) => void;
  dynamicConfig?: Partial<SystemPolicyConfig>;
  demoMode?: boolean;
}

export const InteractiveInputForm: React.FC<InteractiveInputFormProps> = ({
  onEvaluateResult,
  dynamicConfig,
  demoMode = false
}) => {
  const [formData, setFormData] = useState<InvoiceInput>(() => {
    return {
      id: `INV-${Date.now()}`,
      invoiceNumber: '',
      invoiceDate: new Date().toISOString().slice(0, 10),
      supplierTaxCode: '',
      supplierName: '',
      itemName: '',
      preTaxAmount: 0,
      taxRate: 10,
      taxAmount: 0,
      totalAmount: 0,
      paymentMethod: 'BANK_TRANSFER',
      hasBankSlip: true,
      hasItemManifest: true,
      sellerStatus: 'ACTIVE',
      isImageBlurry: false,
      isAdjustment: false,
      isStaffReimbursed: false
    };
  });
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [lastEngine, setLastEngine] = useState<string | null>(null);
  const [isParsingDocument, setIsParsingDocument] = useState(false);
  const [documentWarnings, setDocumentWarnings] = useState<string[]>([]);
  const [lastResult, setLastResult] = useState<{
    status: 'ROUTINE' | 'ESCALATED';
    message: string;
    approvedTax?: number;
    riskGroup?: string;
  } | null>(null);

  const handleDocumentUpload = async (file: File) => {
    setIsParsingDocument(true);
    setDocumentWarnings([]);
    try {
      const form = new FormData();
      form.append('file', file);
      const response = await fetch('/api/documents/parse', { method: 'POST', body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Không thể đọc chứng từ');
      const extracted = Object.fromEntries(Object.entries(data.invoice || {}).filter(([, value]) => value !== undefined && value !== null && value !== ''));
      setFormData((previous) => ({
        ...previous,
        ...extracted,
        sourceArtifactId: data.artifactId,
        sourceHash: data.sourceHash,
        id: previous.id || `DOC-${Date.now()}`
      } as InvoiceInput));
      setDocumentWarnings(data.warnings || ['Dữ liệu trích xuất chỉ là đề xuất; hãy xác nhận lại trước khi thẩm định.']);
      setLastResult(null);
      toast.success(data.invoice?.invoiceNumber ? `Đã trích xuất thành công hóa đơn số ${data.invoice.invoiceNumber}` : 'Đã nạp dữ liệu chứng từ vào form');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Không thể đọc chứng từ';
      setDocumentWarnings([msg]);
      toast.error(msg);
    } finally {
      setIsParsingDocument(false);
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
        body: JSON.stringify({
          invoice: formData,
          customConfig: dynamicConfig,
          demo: demoMode,
          forceLocalOnly: false,
          useGenerativeQGen: true
        })
      });
      const data = await res.json();
      if (data.decision) {
        setLastEngine(data.engineUsed || 'JEV_AI');
        if (data.decision.status === 'ROUTINE') {
          setLastResult({
            status: 'ROUTINE',
            message: demoMode
              ? 'Dữ liệu phù hợp với nhánh Routine. Đây là đề xuất kiểm thử, chưa ghi vào hồ sơ production.'
              : 'Dữ liệu phù hợp với nhánh Routine. Hệ thống tạo đề xuất để kế toán xác nhận trước khi xuất hồ sơ.',
            approvedTax: data.decision.approvedTaxAmount
          });
        } else {
          setLastResult({
            status: 'ESCALATED',
            message: `Hồ sơ cần xử lý thêm (${data.decision.riskGroup}). Hãy đọc lý do và chọn một trong hai phương án.`,
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
              {demoMode ? 'Thử một hồ sơ mới' : 'Tiếp nhận chứng từ'}
            </h3>
          <p className="text-xs text-slate-400">
              {demoMode ? 'Nhập tay hoặc chọn nhanh một ca để kiểm thử.' : 'Nhập form hoặc tải chứng từ để bắt đầu kiểm tra.'}
            </p>
          </div>
        </div>

        {lastEngine && (
          <span className="text-[11px] font-mono font-bold px-2.5 py-1 rounded-full bg-slate-800 text-cyan-300 border border-slate-700">
            Engine: {lastEngine}
          </span>
        )}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30">
        <div className="text-xs text-cyan-200">
          <strong>Nhập chứng từ:</strong> XML đọc trực tiếp; PDF/ảnh cần xác nhận lại các trường OCR.
        </div>
        <label className="inline-flex items-center justify-center px-3 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold cursor-pointer">
          {isParsingDocument ? 'Đang đọc...' : 'Tải XML / PDF / ảnh'}
          <input
            type="file"
            accept=".xml,application/xml,application/pdf,image/png,image/jpeg"
            className="hidden"
            disabled={isParsingDocument}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleDocumentUpload(file);
              event.currentTarget.value = '';
            }}
          />
        </label>
      </div>

      {documentWarnings.length > 0 && (
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 space-y-1">
          <strong>Kiểm tra trước khi thẩm định:</strong>
          {documentWarnings.map((warning) => <div key={warning}>• {warning}</div>)}
        </div>
      )}

      {/* Manual input */}
      <div className="space-y-1.5">
        <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
          Nhập tay hoặc tải chứng từ thật ở phía trên:
        </label>
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

        {/* Options Row: Hoàn ứng & Điều chỉnh */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 rounded-lg bg-slate-950/70 border border-slate-800 text-xs">
          <label className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-white">
            <input
              type="checkbox"
              checked={!!formData.isStaffReimbursed}
              onChange={(e) => handleInputChange('isStaffReimbursed', e.target.checked)}
              className="rounded bg-slate-900 border-slate-700 text-amber-500 focus:ring-amber-400 w-4 h-4 cursor-pointer"
            />
            <span className="font-medium">Ngoại lệ hoàn ứng nhân viên (Staff Reimbursement)</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-white">
            <input
              type="checkbox"
              checked={!!formData.isAdjustment}
              onChange={(e) => handleInputChange('isAdjustment', e.target.checked)}
              className="rounded bg-slate-900 border-slate-700 text-amber-500 focus:ring-amber-400 w-4 h-4 cursor-pointer"
            />
            <span className="font-medium">Hóa đơn điều chỉnh / Thay thế</span>
          </label>

          <div className="text-[11px] text-slate-400 font-mono">
            Ngưỡng TM: <strong className="text-amber-400">{formatVND(dynamicConfig?.nonCashThreshold ?? 5_000_000)}</strong>
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
          <span>{isEvaluating ? 'Đang kiểm tra...' : 'Kiểm tra hồ sơ'}</span>
        </button>
      </form>
    </div>
  );
};
