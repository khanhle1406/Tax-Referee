'use client';
import { useEffect, useRef, useState, type ReactElement, type RefObject } from 'react';
import { Camera, FilePlus, UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
interface ReceptionUploadProps {
  mode:'FILE'|'PASTE';busy:boolean;fileRef:RefObject<HTMLInputElement|null>;
  upload:(file:File)=>Promise<void>;uploadMany:(files:File[])=>Promise<void>;onCapture:()=>void;
  text:string;onText:(value:string)=>void;onParse:()=>Promise<void>;onSample:(sample:'CASH_5M'|'ROUTINE')=>void;
}
export function ReceptionUpload({mode,busy,fileRef,upload,uploadMany,onCapture,text,onText,onParse,onSample}:ReceptionUploadProps):ReactElement {
  const [dragging,setDragging]=useState(false);
  const camera=useRef<HTMLInputElement>(null);const [mobile,setMobile]=useState(false);
  useEffect(()=>{const query=window.matchMedia('(max-width:767px)');const update=():void=>setMobile(query.matches);update();query.addEventListener('change',update);return ()=>query.removeEventListener('change',update);},[]);
  if(mode==='PASTE')return <section className="flex h-full min-h-0 flex-col gap-4 rounded-2xl border bg-card p-4">
    <label htmlFor="pasted-document" className="text-sm font-medium">Văn bản hóa đơn</label><textarea id="pasted-document" value={text} onChange={event=>onText(event.target.value)} placeholder="Dán số hóa đơn, ngày, nhà cung cấp và số tiền…" className="min-h-32 flex-1 resize-none rounded-[10px] border bg-transparent p-3 text-sm"/>
    <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Văn bản mẫu</summary><div className="mt-2 flex gap-2"><Button type="button" variant="outline" size="sm" onClick={()=>onSample('CASH_5M')}>Tiền mặt</Button><Button type="button" variant="outline" size="sm" onClick={()=>onSample('ROUTINE')}>Thường quy</Button></div></details>
    <Button type="button" onClick={()=>void onParse()} disabled={busy||!text.trim()}>{busy?'Đang đọc…':'Trích xuất'}</Button>
  </section>;
  return <div className={`flex h-full min-h-0 flex-col items-center justify-center gap-4 rounded-2xl border border-dashed px-5 py-6 text-center ${dragging?'border-foreground bg-accent/20':'border-input bg-card/40'}`} role="region" tabIndex={0} aria-label="Tiếp nhận file chứng từ" onClick={event=>{if(event.target!==fileRef.current&&event.target!==camera.current&&!busy)fileRef.current?.click();}} onKeyDown={event=>{if(event.target===event.currentTarget&&(event.key==='Enter'||event.key===' ')){event.preventDefault();if(!busy)fileRef.current?.click();}}} onDragOver={event=>{event.preventDefault();if(!busy)setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={event=>{event.preventDefault();setDragging(false);const files=Array.from(event.dataTransfer.files);if(files.length&&!busy)void uploadMany(files);}}>
    <input ref={fileRef} type="file" multiple accept=".xml,application/xml,application/pdf,image/png,image/jpeg,image/webp" className="hidden" disabled={busy} onChange={event=>{const files=Array.from(event.target.files||[]);if(files.length)void uploadMany(files);event.currentTarget.value='';}}/>
    <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" disabled={busy} onChange={event=>{const file=event.target.files?.[0];if(file)void upload(file);event.currentTarget.value='';}}/>
    <UploadCloud className="h-8 w-8 text-foreground" aria-hidden="true"/>
    <div><p className="text-base font-medium">{busy?'Đang đọc chứng từ…':dragging?'Thả tệp để tiếp nhận':'Tải chứng từ'}</p><p className="mt-2 text-xs text-muted-foreground">Tối đa 20 tệp XML, PDF hoặc ảnh · 15 MB/tệp</p></div>
    <div className="flex flex-wrap justify-center gap-2"><Button type="button" disabled={busy} variant="outline" onClick={event=>{event.stopPropagation();fileRef.current?.click();}} className="gap-2"><FilePlus className="h-4 w-4"/>Chọn tệp</Button><Button type="button" disabled={busy} onClick={event=>{event.stopPropagation();if(mobile)camera.current?.click();else onCapture();}} className="gap-2"><Camera className="h-4 w-4"/>{mobile?'Chụp ảnh':'Chụp bằng điện thoại'}</Button></div>
  </div>;
}
