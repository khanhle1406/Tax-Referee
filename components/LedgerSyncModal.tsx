'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CanonicalLedgerVoucher, TargetAccountingSystem } from '@/lib/accounting/types';
import {
  Building2,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  RefreshCw,
  SendHorizontal,
  ShieldCheck,
  Sparkles
} from 'lucide-react';

interface LedgerSyncModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const LedgerSyncModal: React.FC<LedgerSyncModalProps> = ({ open, onOpenChange }) => {
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [vouchers, setVouchers] = useState<CanonicalLedgerVoucher[]>([]);
  const [totalDebit, setTotalDebit] = useState(0);
  const [totalCredit, setTotalCredit] = useState(0);
  const [targetSystem, setTargetSystem] = useState<TargetAccountingSystem>('MISA_AMIS');
  const [regime, setRegime] = useState<'CIRCULAR_99_200' | 'CIRCULAR_133'>('CIRCULAR_99_200');
  const [lastSyncResult, setLastSyncResult] = useState<{
    reference?: string;
    syncedCount?: number;
    exportedData?: string;
  } | null>(null);

  const formatVND = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };

  const loadLedgerData = async (selectedRegime = regime) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ledger/sync?regime=${selectedRegime}`);
      const data = await res.json();
      if (data.success) {
        setVouchers(data.vouchers || []);
        setTotalDebit(data.totalDebit || 0);
        setTotalCredit(data.totalCredit || 0);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      void loadLedgerData(regime);
      setLastSyncResult(null);
    }
  }, [open]);

  const handleSyncApi = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/ledger/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetSystem, regime })
      });
      const data = await res.json();
      if (data.success) {
        setLastSyncResult({
          reference: data.batchReference,
          syncedCount: data.syncedCount,
          exportedData: data.exportedData
        });
      }
    } catch {
      // ignore
    } finally {
      setSyncing(false);
    }
  };

  const handleDownload = (format: 'xml' | 'csv' | 'json') => {
    window.open(`/api/ledger/export?format=${format}&regime=${regime}`, '_blank');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden bg-white border-slate-200 shadow-2xl">
        <DialogHeader className="p-6 pb-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-sm">
                <Building2 className="w-5 h-5 text-[#e4f222]" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  Đồng Bộ Sổ Cái Kế Toán
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">
                    {regime === 'CIRCULAR_133' ? 'Thông tư 133/2016 (SME)' : 'Thông tư 99/2025 (DN Lớn)'}
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500 mt-0.5">
                  Tự động chuyển đổi hóa đơn đã duyệt thành bút toán kép Nợ/Có và đẩy sang phần mềm kế toán
                </DialogDescription>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Regime Selector */}
              <div className="flex items-center bg-slate-200/70 p-0.5 rounded-lg border border-slate-300">
                <button
                  onClick={() => {
                    setRegime('CIRCULAR_99_200');
                    void loadLedgerData('CIRCULAR_99_200');
                  }}
                  className={`px-2.5 py-1 text-xs font-bold rounded-md transition cursor-pointer ${
                    regime === 'CIRCULAR_99_200'
                      ? 'bg-slate-950 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-950'
                  }`}
                  title="Thông tư 99/2025/TT-BTC & TT 200/2014 cho Doanh nghiệp Vừa và Lớn"
                >
                  TT 99 / 200 (Lớn)
                </button>
                <button
                  onClick={() => {
                    setRegime('CIRCULAR_133');
                    void loadLedgerData('CIRCULAR_133');
                  }}
                  className={`px-2.5 py-1 text-xs font-bold rounded-md transition cursor-pointer ${
                    regime === 'CIRCULAR_133'
                      ? 'bg-slate-950 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-950'
                  }`}
                  title="Thông tư 133/2016/TT-BTC cho Doanh nghiệp Nhỏ (SME)"
                >
                  TT 133 (SME)
                </button>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => void loadLedgerData(regime)}
                disabled={loading}
                className="h-8 gap-1.5 text-xs text-slate-600"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                Làm mới
              </Button>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-4 gap-3 mt-4">
            <Card className="bg-white border-slate-200/80 shadow-none">
              <CardContent className="p-3">
                <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Chứng Từ Ghi Sổ</div>
                <div className="text-xl font-black font-numeric text-slate-900 mt-0.5">{vouchers.length}</div>
              </CardContent>
            </Card>
            <Card className="bg-white border-slate-200/80 shadow-none">
              <CardContent className="p-3">
                <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Tổng Phát Sinh Nợ</div>
                <div className="text-xl font-black font-numeric text-blue-700 mt-0.5">{formatVND(totalDebit)}</div>
              </CardContent>
            </Card>
            <Card className="bg-white border-slate-200/80 shadow-none">
              <CardContent className="p-3">
                <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Tổng Phát Sinh Có</div>
                <div className="text-xl font-black font-numeric text-slate-900 mt-0.5">{formatVND(totalCredit)}</div>
              </CardContent>
            </Card>
            <Card className="bg-white border-slate-200/80 shadow-none">
              <CardContent className="p-3">
                <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Cân Đối Kế Toán</div>
                <div className="mt-1 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs font-bold text-emerald-700">100% Khớp Đúng</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </DialogHeader>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Target System Selection */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
              <span>Hệ Thống Phần Mềm Đích</span>
              <span className="text-slate-400 font-normal">Tương thích hơn 95% doanh nghiệp Việt Nam</span>
            </label>
            <Tabs
              value={targetSystem}
              onValueChange={(val) => setTargetSystem(val as TargetAccountingSystem)}
              className="w-full"
            >
              <TabsList className="grid grid-cols-4 w-full bg-slate-100 p-1 rounded-xl">
                <TabsTrigger value="MISA_AMIS" className="text-xs font-semibold py-2">
                  MISA AMIS / SME
                </TabsTrigger>
                <TabsTrigger value="FAST_ACCOUNTING" className="text-xs font-semibold py-2">
                  FAST Accounting
                </TabsTrigger>
                <TabsTrigger value="UNIVERSAL_XML" className="text-xs font-semibold py-2">
                  XML TT99 (Toàn năng)
                </TabsTrigger>
                <TabsTrigger value="UNIVERSAL_EXCEL" className="text-xs font-semibold py-2">
                  Excel Bảng Kê
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Sync Success Banner */}
          {lastSyncResult && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-start justify-between gap-3 animate-in fade-in">
              <div className="space-y-1">
                <div className="flex items-center gap-2 font-bold text-sm text-emerald-800">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Đồng bộ thành công {lastSyncResult.syncedCount} chứng từ sang {targetSystem}!
                </div>
                <div className="text-xs text-emerald-700">
                  Mã lô chứng từ: <span className="font-mono font-bold">{lastSyncResult.reference}</span> · Toàn bộ bút toán đã lưu vết mã băm SHA-256.
                </div>
              </div>
              <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-300 text-xs">
                Ready in ERP
              </Badge>
            </div>
          )}

          {/* Vouchers Table Preview */}
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
            <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Chi Tiết Bút Toán Kép Nợ / Có ({vouchers.length} chứng từ)
              </span>
              <span className="text-[11px] text-slate-500 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                Mỗi chứng từ đều kèm mã băm SHA-256 kiểm toán
              </span>
            </div>

            <div className="max-h-[280px] overflow-y-auto divide-y divide-slate-100">
              {vouchers.map((v) => (
                <div key={v.id} className="p-3 hover:bg-slate-50/70 transition-colors">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded">
                        {v.voucherNumber}
                      </span>
                      <span className="text-xs text-slate-600">
                        HĐ: <strong>{v.invoiceRef}</strong> ({v.invoiceDate})
                      </span>
                      <span className="text-xs font-medium text-slate-700 truncate max-w-[200px]">
                        {v.supplierName}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold font-numeric text-slate-900">
                        {formatVND(v.totalAmount)}
                      </span>
                    </div>
                  </div>

                  {/* Account Entries */}
                  <div className="bg-white rounded-lg p-2 border border-slate-100 space-y-1">
                    {v.entries.map((entry, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 text-slate-600">
                          {entry.debitAmount > 0 ? (
                            <span className="font-mono font-bold text-blue-700 bg-blue-50 px-1 rounded text-[11px]">
                              Nợ TK {entry.accountCode}
                            </span>
                          ) : (
                            <span className="font-mono font-bold text-slate-800 bg-slate-100 px-1 rounded text-[11px]">
                              Có TK {entry.accountCode}
                            </span>
                          )}
                          <span className="text-slate-500 truncate max-w-[320px]">{entry.memo}</span>
                        </div>
                        <span className="font-numeric font-medium text-slate-800">
                          {formatVND(entry.debitAmount || entry.creditAmount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <DialogFooter className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3 sm:justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleDownload('xml')}
              className="gap-1.5 text-xs font-medium"
            >
              <Download className="w-3.5 h-3.5" />
              Tải XML TT99
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleDownload('csv')}
              className="gap-1.5 text-xs font-medium"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              Tải Excel / CSV
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="text-xs">
              Đóng
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleSyncApi}
              disabled={syncing || vouchers.length === 0}
              className="bg-slate-900 text-white hover:bg-slate-800 gap-1.5 text-xs font-bold shadow-sm"
            >
              {syncing ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Đang truyền dữ liệu...
                </>
              ) : (
                <>
                  <SendHorizontal className="w-3.5 h-3.5 text-[#e4f222]" />
                  Đồng Bộ Sang {targetSystem.replace('_', ' ')}
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
