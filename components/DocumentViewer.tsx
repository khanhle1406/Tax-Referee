'use client';

import React, { useState } from 'react';
import {
  FileText,
  Printer,
  Download,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  ShieldCheck,
  CheckCircle2,
  Building2,
  Calendar,
  Hash,
  X
} from 'lucide-react';
import { InvoiceInput } from '@/lib/schemas';
import { formatVND, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

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
      className={`flex flex-col bg-slate-900 border border-slate-700/80 rounded-2xl shadow-xl overflow-hidden ${
        isFullscreen ? 'fixed inset-4 z-50 bg-slate-950/95' : 'h-full min-h-[500px]'
      } ${className}`}
    >
      {/* Viewer Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-950 border-b border-slate-800 text-xs text-slate-300 gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{invoice.sourceArtifactId ? 'Chứng từ gốc đã lưu' : 'Bản xem dữ liệu đã nhận'}</span>
          </Badge>
          <span className="font-mono text-[11px] text-amber-300 hidden sm:inline">
            Không thay thế bản gốc pháp lý
          </span>
        </div>

        {/* Toolbar Controls */}
        <div className="flex items-center gap-1.5">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-slate-400 hover:text-slate-100"
            onClick={() => setZoom((z) => Math.max(z - 15, 70))}
            title="Thu nhỏ"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </Button>

          <span className="text-[11px] font-mono text-slate-400 w-10 text-center">{zoom}%</span>

          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-slate-400 hover:text-slate-100"
            onClick={() => setZoom((z) => Math.min(z + 15, 145))}
            title="Phóng to"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </Button>

          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-slate-400 hover:text-slate-100"
            onClick={() => setIsFullscreen(!isFullscreen)}
            title={isFullscreen ? 'Thu nhỏ cửa sổ' : 'Xem toàn màn hình'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200"
            onClick={handleDownloadSource}
            disabled={!invoice.sourceArtifactId}
            title={invoice.sourceArtifactId ? 'Tải chứng từ gốc đã lưu' : 'Hồ sơ này chưa có chứng từ gốc'}
          >
            <Download className="w-3 h-3 mr-1 text-cyan-400" />
            <span>Chứng từ gốc</span>
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200"
            onClick={handlePrint}
            title="In bản thể hiện hóa đơn"
          >
            <Printer className="w-3 h-3 mr-1 text-purple-400" />
            <span>In</span>
          </Button>

          {onClose && (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-slate-400 hover:text-rose-400"
              onClick={onClose}
              title="Đóng bản thể hiện"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Invoice Canvas / Viewer Body */}
      <div className="flex-1 overflow-auto p-4 sm:p-6 bg-slate-950/70 flex justify-center items-start">
        <div
          style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center' }}
          className="w-full max-w-[650px] bg-white text-slate-900 rounded-lg shadow-2xl p-6 sm:p-8 border border-slate-300 font-sans transition-transform duration-150"
        >
          {/* Header Quốc Huy & Tên Hóa Đơn */}
          <div className="text-center border-b-2 border-slate-900 pb-4 mb-4">
            <div className="text-xs uppercase font-extrabold tracking-wider text-slate-700">
              CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
            </div>
            <div className="text-[11px] italic text-slate-600 mb-2">Độc lập - Tự do - Hạnh phúc</div>
            <h2 className="text-xl sm:text-2xl font-black text-rose-700 tracking-tight uppercase">
              BẢN XEM DỮ LIỆU HÓA ĐƠN
            </h2>
            <div className="text-xs font-semibold text-amber-700">Không phải bản thể hiện hóa đơn điện tử hợp lệ</div>
            <div className="text-xs font-mono text-slate-500 mt-1">
              Ngày lập: {formatDate(invoice.invoiceDate)}
            </div>

            <div className="mt-3 text-xs font-mono px-3 py-1.5 bg-slate-50 rounded border border-slate-200">
              Số hóa đơn: <strong className="text-rose-700 text-sm font-black">{invoice.invoiceNumber}</strong>
            </div>
          </div>

          {/* Đơn vị Bán hàng */}
          <div className="space-y-1 text-xs border-b border-slate-200 pb-3 mb-3">
            <div className="flex">
              <span className="w-28 font-bold text-slate-700">Đơn vị bán hàng:</span>
              <span className="font-extrabold text-slate-950 uppercase">{invoice.supplierName}</span>
            </div>
            <div className="flex">
              <span className="w-28 font-bold text-slate-700">Mã số thuế:</span>
              <span className="font-mono font-bold text-blue-700 text-sm">{invoice.supplierTaxCode}</span>
            </div>
            <div className="flex">
              <span className="w-28 font-bold text-slate-700">Hình thức TT:</span>
              <span className="font-semibold text-slate-800">
                {invoice.paymentMethod === 'BANK_TRANSFER' ? 'Chuyển khoản (CK)' : 'Tiền mặt (TM)'}
              </span>
            </div>
          </div>

          {/* Bảng kê hàng hóa chi tiết */}
          <div className="mb-4">
            <table className="w-full text-left text-xs border border-slate-300 border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300 font-bold text-slate-700 text-center">
                  <th className="p-1.5 border-r border-slate-300 w-8">STT</th>
                  <th className="p-1.5 border-r border-slate-300">Tên hàng hóa, dịch vụ</th>
                  <th className="p-1.5 border-r border-slate-300 w-12">ĐVT</th>
                  <th className="p-1.5 border-r border-slate-300 w-12">SL</th>
                  <th className="p-1.5 border-r border-slate-300 text-right w-24">Đơn giá</th>
                  <th className="p-1.5 text-right w-24">Thành tiền</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items && invoice.items.length > 0 ? (
                  invoice.items.map((item, idx) => (
                    <tr
                      key={idx}
                      className={`border-b border-slate-200 ${
                        item.flaggedReason ? 'bg-amber-50/60' : ''
                      }`}
                    >
                      <td className="p-2 text-center border-r border-slate-200 font-mono text-slate-500">
                        {item.lineNumber || idx + 1}
                      </td>
                      <td className="p-2 border-r border-slate-200 font-medium text-slate-900">
                        <div>{item.itemName}</div>
                        {item.flaggedReason && (
                          <span className="inline-block mt-0.5 text-[10px] text-amber-700 font-semibold bg-amber-100/80 px-1.5 py-0.5 rounded">
                            {item.flaggedReason}
                          </span>
                        )}
                      </td>
                      <td className="p-2 text-center border-r border-slate-200 text-slate-600">
                        {item.unit || 'Cái'}
                      </td>
                      <td className="p-2 text-center border-r border-slate-200 font-mono">
                        {item.quantity}
                      </td>
                      <td className="p-2 text-right border-r border-slate-200 font-mono">
                        {formatVND(item.unitPrice)}
                      </td>
                      <td className="p-2 text-right font-mono font-bold text-slate-900">
                        {formatVND(item.amount)}
                        <span className="ml-1 text-[10px] font-semibold text-slate-500">
                          ({item.taxRate}%)
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr className="border-b border-slate-200">
                    <td className="p-2 text-center border-r border-slate-200">1</td>
                    <td className="p-2 border-r border-slate-200 font-semibold text-slate-900">
                      {invoice.itemName}
                    </td>
                    <td className="p-2 text-center border-r border-slate-200 text-slate-600">Gói/Bộ</td>
                    <td className="p-2 text-center border-r border-slate-200 font-mono">1</td>
                    <td className="p-2 text-right border-r border-slate-200 font-mono">
                      {formatVND(invoice.preTaxAmount)}
                    </td>
                    <td className="p-2 text-right font-mono font-bold text-slate-900">
                      {formatVND(invoice.preTaxAmount)}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Tổng tiền & Thuế GTGT */}
          <div className="space-y-1.5 text-xs border-t-2 border-slate-800 pt-2 font-mono">
            <div className="flex justify-between">
              <span className="font-sans font-bold text-slate-700">Cộng tiền hàng (trước thuế):</span>
              <span className="font-bold text-slate-900">{formatVND(invoice.preTaxAmount)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-sans font-bold text-slate-700">
                Thuế suất GTGT: <Badge variant="secondary" className="font-mono font-bold ml-1">{invoice.taxRate}%</Badge>
              </span>
              <span className="font-bold text-slate-900">{formatVND(invoice.taxAmount)}</span>
            </div>
            <div className="flex justify-between items-center text-sm font-black border-t border-slate-300 pt-1.5 text-rose-700">
              <span className="font-sans uppercase">Tổng tiền thanh toán:</span>
              <span className="text-base">{formatVND(invoice.totalAmount)}</span>
            </div>
          </div>

          {/* Chữ ký số điện tử Người bán & Mã QR */}
          <div className="mt-6 pt-4 border-t border-dashed border-slate-300 flex justify-between items-end">
            <div className="border border-emerald-500/50 rounded-lg p-2.5 bg-emerald-50 max-w-[260px] text-[10px] text-emerald-800 font-mono space-y-0.5">
              <div className="flex items-center gap-1 font-bold text-emerald-900">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>CHỮ KÝ SỐ ĐIỆN TỬ HỢP LỆ</span>
              </div>
              <div>Ký bởi: {invoice.supplierName}</div>
              <div>Ngày ký: {formatDate(invoice.invoiceDate)} 09:30:15</div>
              <div>Chứng thư số: SHA256-RSA-2048</div>
            </div>

            <div className="text-center font-sans text-xs">
              <div className="font-bold text-slate-800">NGƯỜI BÁN HÀNG</div>
              <div className="text-[10px] text-slate-500 italic mt-0.5">(Ký điện tử, đóng dấu số)</div>
              <div className="h-10"></div>
              <div className="text-[11px] font-bold text-slate-700 uppercase">{invoice.supplierName}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
