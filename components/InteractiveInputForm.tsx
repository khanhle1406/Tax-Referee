'use client';

import React, { useState } from 'react';
import { Send, FilePlus, Sparkles, CheckCircle2, AlertCircle, Upload } from 'lucide-react';
import { InvoiceInput, RefereeDecision, SystemPolicyConfig } from '@/lib/schemas';
import { formatVND } from '@/lib/utils';
import { getApplicableRegulations } from '@/data/regulatoryRegistry';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
      if (!response.ok) throw new Error(data.error || 'Lỗi đọc chứng từ');
      const extracted = Object.fromEntries(
        Object.entries(data.invoice || {}).filter(([, value]) => value !== undefined && value !== null && value !== '')
      );
      setFormData((prev) => ({
        ...prev,
        ...extracted,
        sourceArtifactId: data.artifactId,
        sourceHash: data.sourceHash,
        id: prev.id || `DOC-${Date.now()}`
      } as InvoiceInput));
      setDocumentWarnings(data.warnings || []);
      setLastResult(null);
      toast.success(data.invoice?.invoiceNumber ? `Đã đọc HĐ số ${data.invoice.invoiceNumber}` : 'Đã nạp dữ liệu chứng từ');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Không thể đọc file';
      setDocumentWarnings([msg]);
      toast.error(msg);
    } finally {
      setIsParsingDocument(false);
    }
  };

  const handleInputChange = (field: keyof InvoiceInput, value: any) => {
    setLastResult(null);
    setFormData(prev => {
      const updated = { ...prev, [field]: value };
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
    if (!formData.supplierName || formData.totalAmount <= 0) {
      toast.error('Vui lòng điền đủ Tên nhà cung cấp và Số tiền');
      return;
    }

    setIsEvaluating(true);
    try {
      const payload = {
        invoice: formData,
        policyConfig: dynamicConfig,
        mode: demoMode ? 'DEMO' : 'PRODUCTION'
      };

      const res = await fetch('/api/invoices/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi thẩm định');

      const decision: RefereeDecision = data.decision;
      setLastEngine(data.engine || decision.engineUsed || null);

      if (decision.status === 'ROUTINE') {
        setLastResult({
          status: 'ROUTINE',
          message: decision.plainExplanation,
          approvedTax: decision.approvedTaxAmount
        });
      } else {
        setLastResult({
          status: 'ESCALATED',
          message: decision.actionableQuestion,
          riskGroup: decision.riskGroup
        });
      }

      onEvaluateResult(decision, formData);
      toast.success(decision.status === 'ROUTINE' ? 'Hồ sơ Thường quy (Routine)' : 'Cần xử lý ngoại lệ (Escalated)');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lỗi thẩm định');
    } finally {
      setIsEvaluating(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Upload File Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Tải chứng từ tự động</span>
          <div className="text-xs font-semibold text-slate-700 mt-0.5">
            Hỗ trợ file XML HĐĐT, PDF hoặc ảnh chụp hóa đơn
          </div>
        </div>
        <label className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-slate-950 hover:bg-slate-900 text-white text-xs font-bold cursor-pointer transition shadow-xs shrink-0">
          <Upload className="h-4 w-4 text-brand-lime" />
          <span>{isParsingDocument ? 'Đang đọc...' : 'Tải XML / PDF / Ảnh'}</span>
          <input
            type="file"
            accept=".xml,application/xml,application/pdf,image/png,image/jpeg"
            className="hidden"
            disabled={isParsingDocument}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleDocumentUpload(file);
              e.currentTarget.value = '';
            }}
          />
        </label>
      </div>

      {documentWarnings.length > 0 && (
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-900 space-y-1">
          {documentWarnings.map((w, i) => <div key={i}>• {w}</div>)}
        </div>
      )}

      {/* Form Fields - To, Rõ ràng */}
      <form onSubmit={handleSubmit} className="space-y-4 text-sm text-slate-800">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
              Số HĐ & Ngày lập:
            </label>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={formData.invoiceNumber}
                onChange={(e) => handleInputChange('invoiceNumber', e.target.value)}
                placeholder="Số hóa đơn"
                className="px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-sm font-mono font-bold focus:border-slate-950 focus:ring-1 focus:ring-slate-950 outline-none transition"
              />
              <input
                type="date"
                value={formData.invoiceDate}
                onChange={(e) => handleInputChange('invoiceDate', e.target.value)}
                className="px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-sm font-mono font-bold focus:border-slate-950 focus:ring-1 focus:ring-slate-950 outline-none transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
              MST & Tên đơn vị bán:
            </label>
            <div className="grid grid-cols-12 gap-2">
              <input
                type="text"
                value={formData.supplierTaxCode}
                onChange={(e) => handleInputChange('supplierTaxCode', e.target.value)}
                placeholder="MST"
                className="col-span-4 px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-sm font-mono font-bold focus:border-slate-950 focus:ring-1 focus:ring-slate-950 outline-none transition"
              />
              <input
                type="text"
                value={formData.supplierName}
                onChange={(e) => handleInputChange('supplierName', e.target.value)}
                placeholder="Tên nhà cung cấp"
                className="col-span-8 px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-sm font-bold focus:border-slate-950 focus:ring-1 focus:ring-slate-950 outline-none transition"
              />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
            Nội dung hàng hóa / Dịch vụ:
          </label>
          <input
            type="text"
            value={formData.itemName}
            onChange={(e) => handleInputChange('itemName', e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-sm font-bold focus:border-slate-950 focus:ring-1 focus:ring-slate-950 outline-none transition"
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
              Tiền trước thuế:
            </label>
            <input
              type="number"
              value={formData.preTaxAmount}
              onChange={(e) => handleInputChange('preTaxAmount', Number(e.target.value))}
              className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 font-mono text-sm font-bold focus:border-slate-950 focus:ring-1 focus:ring-slate-950 outline-none transition"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
              Thuế suất GTGT:
            </label>
            <select
              value={formData.taxRate}
              onChange={(e) => handleInputChange('taxRate', Number(e.target.value))}
              className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 font-mono text-sm font-bold focus:border-slate-950 focus:ring-1 focus:ring-slate-950 outline-none cursor-pointer transition"
            >
              <option value={0}>0%</option>
              <option value={8}>8%</option>
              <option value={10}>10%</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
              Phương thức thanh toán:
            </label>
            <select
              value={formData.paymentMethod}
              onChange={(e) => handleInputChange('paymentMethod', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-sm font-bold focus:border-slate-950 focus:ring-1 focus:ring-slate-950 outline-none cursor-pointer transition"
            >
              <option value="BANK_TRANSFER">Chuyển khoản (CK)</option>
              <option value="CASH">Tiền mặt (TM)</option>
            </select>
          </div>
        </div>

        {/* Options Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
          <label className="flex items-center gap-2 cursor-pointer text-slate-900 font-bold">
            <input
              type="checkbox"
              checked={!!formData.isStaffReimbursed}
              onChange={(e) => handleInputChange('isStaffReimbursed', e.target.checked)}
              className="rounded border-slate-300 text-slate-950 focus:ring-slate-950 w-4 h-4 cursor-pointer"
            />
            <span>Hoàn ứng nhân viên</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer text-slate-900 font-bold">
            <input
              type="checkbox"
              checked={!!formData.isAdjustment}
              onChange={(e) => handleInputChange('isAdjustment', e.target.checked)}
              className="rounded border-slate-300 text-slate-950 focus:ring-slate-950 w-4 h-4 cursor-pointer"
            />
            <span>HĐ Điều chỉnh / Thay thế</span>
          </label>

          <div className="text-xs font-mono font-bold text-slate-600">
            Ngưỡng TM: {formatVND(dynamicConfig?.nonCashThreshold ?? 5_000_000)}
          </div>
        </div>

        {/* Live Calculation Bar */}
        <div className="p-4 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-between text-sm font-numeric font-bold">
          <div className="text-slate-600">
            Thuế ({formData.taxRate}%): <span className="text-slate-950">{formatVND(formData.taxAmount)}</span>
          </div>
          <div className="text-slate-950 text-base">
            TỔNG: <span className="font-extrabold text-lg">{formatVND(formData.totalAmount)}</span>
          </div>
        </div>

        {/* Result Banner */}
        {lastResult && (
          <div
            className={`p-4 rounded-xl border text-sm font-bold flex items-start gap-2.5 animate-in fade-in duration-200 ${
              lastResult.status === 'ROUTINE'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                : 'bg-amber-50 border-amber-200 text-amber-950'
            }`}
          >
            {lastResult.status === 'ROUTINE' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            )}
            <div>
              <div>{lastResult.message}</div>
              {lastResult.approvedTax !== undefined && (
                <div className="font-mono text-emerald-800 mt-1">
                  Thuế được khấu trừ: +{formatVND(lastResult.approvedTax)}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Action Button */}
        <Button
          type="submit"
          disabled={isEvaluating}
          size="lg"
          className="w-full font-bold tracking-wide"
        >
          <Sparkles className="w-4 h-4 mr-2 text-brand-lime" />
          <span>{isEvaluating ? 'ĐANG THẨM ĐỊNH...' : 'THẨM ĐỊNH HỒ SƠ'}</span>
        </Button>
      </form>
    </div>
  );
};
