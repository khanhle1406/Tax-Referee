import type { ReactElement } from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatVND } from '@/lib/utils';

interface ReceptionSubmitBarProps {taxRate:number|undefined;taxAmount:number;totalAmount:number;uncertain:boolean;busy:boolean;disabled?:boolean}
export function ReceptionSubmitBar({taxRate,taxAmount,totalAmount,uncertain,busy,disabled}:ReceptionSubmitBarProps):ReactElement {
  return <footer className="shrink-0 space-y-3 border-t bg-card p-4">
    <div className={`flex flex-wrap items-baseline justify-between gap-2 text-sm ${uncertain?'text-amber-900':''}`}><span className="text-xs text-muted-foreground">Thuế {taxRate===undefined?'chưa rõ':taxRate+'%'}: <span id="taxAmount" className="font-numeric text-foreground">{formatVND(taxAmount)}</span></span><span className="text-xs text-muted-foreground">Tổng thanh toán <strong id="totalAmount" className="ml-1 text-base font-semibold font-numeric text-foreground">{formatVND(totalAmount)}</strong></span></div>
    <Button form="extraction-form" type="submit" disabled={busy||disabled} className="w-full gap-2">{busy?'Đang thẩm định…':'Thẩm định'}<ArrowRight className="h-4 w-4"/></Button>
  </footer>;
}
