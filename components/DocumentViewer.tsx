'use client';

import React, { useState } from 'react';
import {
  Printer,
  Download,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  CheckCircle2,
  X
} from 'lucide-react';
import { InvoiceInput } from '@/lib/schemas';
import { formatVND, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface DocumentViewerProps {
  invoice: InvoiceInput;
  className?: string;
  onClose?: () => void;
}

export const DocumentViewer: React.FC<DocumentViewerProps> = ({ invoice, className = '', onClose }) => {
  const [zoom, setZoom] = useState<number>(100);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadSource = () => {
    if (!invoice.sourceArtifactId) return;
    const a = document.createElement('a');
    a.href = `/api/documents/artifacts/${encodeURIComponent(invoice.sourceArtifactId)}`;
    a.download = '';
    a.click();
  };

  return (
    <div
      className={`flex flex-col bg-white border border-slate-200 rounded-2xl shadow-card overflow-hidden ${
        isFullscreen ? 'fixed inset-4 z-50 bg-white shadow-2xl border-slate-300' : 'h-full min-h-[480px]'
      } ${className}`}
    >
      {/* Viewer Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs text-slate-700 gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 border border-emerald-200 px-2 py-0.5 text-xs font-bold text-emerald-800">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Chứng từ {invoice.sourceArtifactId ? 'gốc' : 'số'}</span>
          </span>
          <span className="font-mono text-xs font-bold text-slate-500">
            HĐ: {invoice.invoiceNumber}
          </span>
        </div>

        {/* Toolbar Controls */}
        <div className="flex items-center gap-1.5">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-slate-600 hover:text-slate-950 cursor-pointer"
            onClick={() => setZoom((z) => Math.max(z - 15, 70))}
            title="Thu nhỏ"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </Button>

          <span className="text-xs font-mono font-bold text-slate-700 w-10 text-center">{zoom}%</span>

          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-slate-600 hover:text-slate-950 cursor-pointer"
            onClick={() => setZoom((z) => Math.min(z + 15, 145))}
            title="Phóng to"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </Button>

          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-slate-600 hover:text-slate-950 cursor-pointer"
            onClick={() => setIsFullscreen(!isFullscreen)}
            title={isFullscreen ? 'Thu nhỏ cửa sổ' : 'Toàn màn hình'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </Button>

          <button
            className="h-7 px-2.5 text-xs font-bold border border-slate-200 bg-white hover:bg-slate-100 text-slate-800 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
            onClick={handleDownloadSource}
            disabled={!invoice.sourceArtifactId}
            title={invoice.sourceArtifactId ? 'Tải tệp gốc' : 'Chưa có tệp'}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Tải</span>
          </button>

          <button
            className="h-7 px-2.5 text-xs font-bold border border-slate-200 bg-white hover:bg-slate-100 text-slate-800 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
            onClick={handlePrint}
            title="In hóa đơn"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>In</span>
          </button>

          {onClose && (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-slate-500 hover:text-rose-600 cursor-pointer"
              onClick={onClose}
              title="Đóng"
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Invoice Canvas / Viewer Body */}
      <div className="flex-1 overflow-auto p-4 sm:p-6 bg-slate-100/60 flex justify-center items-start">
        <div
          style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center' }}
          className="w-full max-w-[620px] bg-white text-slate-900 rounded-xl shadow-card p-6 border border-slate-200 font-sans transition-transform duration-150"
        >
          {/* Header */}
          <div className="text-center border-b border-slate-200 pb-4 mb-4">
            <h2 className="text-xl font-bold text-slate-950 uppercase tracking-tight">
              HÓA ĐƠN ĐIỆN TỬ
            </h2>
            <div className="text-xs font-mono font-bold text-slate-500 mt-1">
              Số: <strong className="text-slate-950 text-sm">{invoice.invoiceNumber}</strong> · Ngày: {formatDate(invoice.invoiceDate)}
            </div>
          </div>

          {/* Supplier Info - Rõ ràng, Chữ to */}
          <div className="space-y-2 text-sm border-b border-slate-200 pb-4 mb-4">
            <div className="flex justify-between">
              <span className="font-semibold text-slate-500">Đơn vị bán:</span>
              <span className="font-bold text-slate-950 uppercase text-right">{invoice.supplierName}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-semibold text-slate-500">Mã số thuế:</span>
              <span className="font-mono font-bold text-slate-950">{invoice.supplierTaxCode}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-semibold text-slate-500">Thanh toán:</span>
              <span className="font-bold text-slate-800">
                {invoice.paymentMethod === 'BANK_TRANSFER' ? 'Chuyển khoản (CK)' : 'Tiền mặt (TM)'}
              </span>
            </div>
          </div>

          {/* Item details table */}
          <div className="mb-4 overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 font-bold text-slate-700 uppercase">
                  <th className="p-2 w-8 text-center">#</th>
                  <th className="p-2">Hàng hóa / Dịch vụ</th>
                  <th className="p-2 w-12 text-center">SL</th>
                  <th className="p-2 w-24 text-right">Đơn giá</th>
                  <th className="p-2 w-28 text-right">Thành tiền</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {invoice.items && invoice.items.length > 0 ? (
                  invoice.items.map((item, idx) => (
                    <tr key={idx} className={item.flaggedReason ? 'bg-amber-50/70 font-semibold' : ''}>
                      <td className="p-2 text-center font-mono text-slate-500">{item.lineNumber || idx + 1}</td>
                      <td className="p-2 font-bold text-slate-900">
                        <div>{item.itemName}</div>
                        {item.flaggedReason && (
                          <span className="inline-block mt-0.5 text-[10px] text-amber-900 bg-amber-100 px-1.5 py-0.5 rounded font-bold">
                            {item.flaggedReason}
                          </span>
                        )}
                      </td>
                      <td className="p-2 text-center font-mono font-semibold">{item.quantity}</td>
                      <td className="p-2 text-right font-mono font-semibold">{formatVND(item.unitPrice)}</td>
                      <td className="p-2 text-right font-mono font-bold text-slate-950">{formatVND(item.amount)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="p-2 text-center font-mono">1</td>
                    <td className="p-2 font-bold text-slate-900">{invoice.itemName || 'Hàng hóa / Dịch vụ chung'}</td>
                    <td className="p-2 text-center font-mono font-semibold">1</td>
                    <td className="p-2 text-right font-mono font-semibold">{formatVND(invoice.totalAmount - (invoice.taxAmount || 0))}</td>
                    <td className="p-2 text-right font-mono font-bold text-slate-950">{formatVND(invoice.totalAmount - (invoice.taxAmount || 0))}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Totals Section - To, Rõ, Đậm số tiền */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1.5 text-sm">
            <div className="flex justify-between text-slate-600 font-semibold">
              <span>Tiền chưa thuế:</span>
              <span className="font-numeric font-bold text-slate-900">
                {formatVND(invoice.totalAmount - (invoice.taxAmount || 0))}
              </span>
            </div>
            <div className="flex justify-between text-slate-600 font-semibold">
              <span>Thuế GTGT ({invoice.taxRate ?? 10}%):</span>
              <span className="font-numeric font-bold text-slate-900">{formatVND(invoice.taxAmount || 0)}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-950">
              <span>TỔNG THANH TOÁN:</span>
              <span className="font-numeric text-lg text-slate-950 font-extrabold">{formatVND(invoice.totalAmount)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
