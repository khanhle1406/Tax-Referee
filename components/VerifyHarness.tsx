'use client';
import React,{useEffect,useState} from 'react';
import Link from 'next/link';
import {riskGroupLabels,workflowStatusLabels} from '@/lib/workflowPresentation';

import {challengeCases} from '@/data/verification/challengeCases';
import type {RefereeDecision,RefereeHandoff,RiskGroup} from '@/lib/schemas';
import {HandoffContext} from './HandoffContext';
import {toast} from 'sonner';
import {useSearchParams,usePathname,useRouter} from 'next/navigation';
type Item={suite?:string;startedAt?:string;finishedAt?:string;executionTimeMs?:number;testId:string;sourceFile?:string;expectedStatus:string;expectedRiskGroup?:RiskGroup;actualStatus:string;riskGroup?:RiskGroup;riskGroups?:RiskGroup[];isMatchExpected:boolean;schemaValid:boolean;workflowValid:boolean;actualWorkflowStatus?:string;actionableQuestion?:string;requiresCFO?:boolean;plainExplanation?:string;provenance?:string;options?:Array<{id:string;label:string;actionDescription:string}>;handoff?:RefereeHandoff;questionCheck?:{valid:boolean;errors:string[]}};
type Summary={suites?:Array<{mode:string;label:string;passed:number;total:number}>;commit?:string;runId:string;policyHash:string;executionMode:string;errorCases:number;mode:string;totalCases:number;passedCases:number;routineCases:number;escalatedCases:number;timestamp:string;policyVersion:string;fixtureHash:string;totalTimeMs:number;isMatchExpected:boolean;metrics:{falseNegativeRate:number;falsePositiveRate:number;straightThroughProcessingRate:number;routineCompletionRate:number;denominators:{expectedEscalated:number;expectedRoutine:number;total:number}}};
interface SandboxOutcome {decision:RefereeDecision;workflow:{status:string;autoApproved:boolean;internalVoucherCreated:boolean}}

const time=(iso?:string)=>iso?new Date(iso).toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit',second:'2-digit'})+'.'+String(new Date(iso).getMilliseconds()).padStart(3,'0'):'';
const statusLabel=(status:string,group?:RiskGroup)=>status==='ROUTINE'?'Tự xử lý':status==='ESCALATED'?`Chuyển tiếp${group?` · ${riskGroupLabels[group]}`:''}`:'Lỗi';
/** Ca mẫu kiểu giám khảo: chỉ gõ các trường tối thiểu, chưa từng có trong bộ Verify. */
const judgeExamples:Array<{label:string;invoice:Record<string,unknown>}>=[
 {label:'Thường quy: nước uống 540.000₫',invoice:{invoiceNumber:'0000451',invoiceDate:'2026-10-05',supplierTaxCode:'0312345678',supplierName:'Công ty TNHH Dịch vụ Minh An',itemName:'Nước uống đóng bình 20L',preTaxAmount:500000,taxRate:8,taxAmount:40000,totalAmount:540000}},
 {label:'Lệch tổng: 480.000₫ hay 495.000₫?',invoice:{invoiceNumber:'0000458',invoiceDate:'2026-10-05',supplierTaxCode:'0312345678',supplierName:'Công ty TNHH Dịch vụ Minh An',itemName:'Mực in laser',preTaxAmount:450000,taxRate:10,taxAmount:45000,totalAmount:480000,paymentMethod:'BANK_TRANSFER'}},
 {label:'Rượu vang tiếp khách',invoice:{invoiceNumber:'0000457',invoiceDate:'2026-10-05',supplierTaxCode:'0312345678',supplierName:'Nhà hàng Sen Vàng',itemName:'Tiếp khách đối tác - rượu vang',preTaxAmount:3000000,taxRate:10,taxAmount:300000,totalAmount:3300000,paymentMethod:'BANK_TRANSFER'}},
 {label:'Laptop 330 triệu (vượt quyền)',invoice:{invoiceNumber:'0000456',invoiceDate:'2026-10-05',supplierTaxCode:'0312345678',supplierName:'Công ty TNHH Dịch vụ Minh An',itemName:'10 laptop Dell Latitude',preTaxAmount:300000000,taxRate:10,taxAmount:30000000,totalAmount:330000000,paymentMethod:'BANK_TRANSFER',hasBankSlip:true}}
];

/** Bộ 5 ca thử với người dùng thực tế (docs/submission/proposal-user-questions.md): người dùng ghi quyết định của mình TRƯỚC khi bấm đánh giá. */
const studyCases:Array<{label:string;invoice:Record<string,unknown>}>=[
 {label:'U1',invoice:{invoiceNumber:'U1-0001',invoiceDate:'2026-10-06',supplierTaxCode:'0312345678',supplierName:'Công ty TNHH Văn phòng phẩm Hồng Hà',itemName:'Văn phòng phẩm tháng 10',preTaxAmount:2000000,taxRate:10,taxAmount:200000,totalAmount:2200000,paymentMethod:'BANK_TRANSFER'}},
 {label:'U2',invoice:{invoiceNumber:'U2-0002',invoiceDate:'2026-10-06',supplierTaxCode:'0315678901',supplierName:'Trung tâm Tiệc cưới Hoa Sen',itemName:'Chi phí tiệc cưới người thân giám đốc',preTaxAmount:4000000,taxRate:10,taxAmount:400000,totalAmount:4400000,paymentMethod:'BANK_TRANSFER'}},
 {label:'U3',invoice:{invoiceNumber:'U3-0003',invoiceDate:'2026-10-06',supplierTaxCode:'0100109106',supplierName:'Tổng Công ty Viễn thông A',itemName:'Cước Internet cáp quang tháng 9',preTaxAmount:1000000,taxRate:8,taxAmount:80000,totalAmount:1080000,paymentMethod:'BANK_TRANSFER'}},
 {label:'U4',invoice:{invoiceNumber:'U4-0004',invoiceDate:'2026-10-06',supplierTaxCode:'0319876543',supplierName:'Công ty CP Thiết bị Trình chiếu Sao Mai',itemName:'Máy chiếu phòng họp',preTaxAmount:25000000,taxRate:10,taxAmount:2500000,totalAmount:27500000,paymentMethod:'BANK_TRANSFER',hasBankSlip:true}},
 {label:'U5',invoice:{invoiceNumber:'U5-0005',invoiceDate:'2026-10-06',supplierTaxCode:'0314567890',supplierName:'Công ty TNHH Giải pháp Hệ thống Nam Việt',itemName:'Hợp đồng bảo trì hệ thống máy chủ năm 2026',preTaxAmount:220000000,taxRate:10,taxAmount:22000000,totalAmount:242000000,paymentMethod:'BANK_TRANSFER',hasBankSlip:true,sellerStatus:'ACTIVE'}}
];

export function VerifyHarness(_props:{onSelectEscalatedCase?:(id:string)=>void;selectedCaseId?:string|null}) {
 const params=useSearchParams();const pathname=usePathname();const router=useRouter();const [tab,setTab]=useState('suite');
 useEffect(()=>{const t=params.get('tab');setTab(t==='results'||t==='custom'?t:'suite');},[params]);
 const changeTab=(next:string):void=>{setTab(next);const query=new URLSearchParams(params.toString());query.set('tab',next);router.replace(pathname+'?'+query.toString(),{scroll:false});};
 const [mode,setMode]=useState('judge');const [busy,setBusy]=useState(false);const [summary,setSummary]=useState<Summary|null>(null);const [results,setResults]=useState<Item[]>([]);
 const [custom,setCustom]=useState(JSON.stringify(judgeExamples[0].invoice,null,2));const [outcome,setOutcome]=useState<SandboxOutcome|null>(null);
 async function run():Promise<void>{setBusy(true);try{let r=await fetch(`/api/verify?mode=${mode}`,{cache:'no-store'});
  // Bộ 15/60 ca cần phiên: tự mở phiên demo riêng rồi chạy lại, giám khảo không phải đăng nhập.
  if(r.status===401){await fetch('/api/demo/session',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});r=await fetch(`/api/verify?mode=${mode}`,{cache:'no-store'});}
  const data=await r.json();if(!r.ok)throw new Error(data.error);setSummary(data.summary);setResults(data.results);changeTab('results');}catch(e){toast.error(e instanceof Error?e.message:'Lỗi kiểm thử');}finally{setBusy(false);}}
 /** Mảng [HĐ 1, …, HĐ n]: hóa đơn cuối được đánh giá, các hóa đơn trước làm lịch sử (thử cụm mua cùng ngày, tách nhỏ). */
 function sandboxBody(parsed:unknown):Record<string,unknown>{if(!Array.isArray(parsed)||parsed.length===0)return {sampleType:'CUSTOM',customInvoice:parsed};const history=parsed.slice(0,-1).map((inv,i)=>({...(inv as Record<string,unknown>),id:`LICH-SU-${i+1}`}));return {sampleType:'CUSTOM',customInvoice:parsed[parsed.length-1],...(history.length?{context:{history}}:{})};}
 async function sandbox():Promise<void>{setBusy(true);try{const r=await fetch('/api/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(sandboxBody(JSON.parse(custom)))});const d=await r.json();if(!r.ok)throw new Error(d.error);setOutcome(d);}catch(e){toast.error(e instanceof Error?e.message:'Dữ liệu không hợp lệ');}finally{setBusy(false);}}
 function downloadCsv():void{
   if(!summary)return;
   const cell=(value:unknown):string=>'"'+String(value??'').replace(/"/g,'""')+'"';
   const rows=[['suite','case','expected','expectedGroup','actual','actualGroups','workflow','match','startedAt','finishedAt','ms','question'],...results.map(r=>[r.suite||summary.mode,r.testId,r.expectedStatus,r.expectedRiskGroup||'',r.actualStatus,(r.riskGroups||[r.riskGroup].filter(Boolean)).join('|'),r.actualWorkflowStatus||'',r.isMatchExpected?'PASS':'FAIL',r.startedAt||'',r.finishedAt||'',r.executionTimeMs??'',r.actionableQuestion||''])];
   const url=URL.createObjectURL(new Blob([rows.map(row=>row.map(cell).join(',')).join('\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`verify-${summary.runId}.csv`;a.click();URL.revokeObjectURL(url);
 }
 const suites=summary?.suites?.length?summary.suites:summary?[{mode:summary.mode,label:summary.mode,passed:summary.passedCases,total:summary.totalCases}]:[];
 return <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
  <nav className="invoice-detail-tabs" aria-label="Phần kiểm chứng">{[{id:'suite',label:'Bộ kiểm thử'},{id:'results',label:'Kết quả'},{id:'custom',label:'Thử dữ liệu mới'}].map(t=><button key={t.id} type="button" onClick={()=>changeTab(t.id)} aria-pressed={tab===t.id} className={tab===t.id?'border-b-2 border-foreground px-3 py-2 text-sm font-medium':'px-3 py-2 text-sm text-muted-foreground'}>{t.label}</button>)}</nav>
  <Link href="/sop" className="inline-block text-sm font-semibold underline">Đọc SOP và các quy tắc đang kiểm thử</Link>
  {tab==='suite'&&<div className="space-y-3"><div className="flex flex-wrap items-center gap-3"><label className="text-sm font-medium" htmlFor="verify-mode">Bộ kiểm thử</label><select id="verify-mode" style={{maxWidth:"100%"}} className="rounded-lg border bg-white px-3 py-2" value={mode} onChange={e=>{setMode(e.target.value);setSummary(null);setResults([]);}}><option value="judge">9 ca giám khảo · 4 ca chung + 5 ca Đề A (khuyến nghị)</option><option value="common_4">4 ca kiểm tra chung</option><option value="challenge_a">5 ca Đề A · 3 thường quy / 2 chuyển tiếp</option><option value="regression_15">15 ca hồi quy</option><option value="development_60">60 ca phát triển · dữ liệu tổng hợp</option></select><button disabled={busy} onClick={run} className="rounded-lg bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy?'Đang chạy…':'Chạy Verify'}</button></div>
   <p className="text-sm text-slate-600">Một nút chạy tuần tự từng ca trên database tạm riêng, in PASS/FAIL kèm thời điểm chạy từng ca. Quy tắc tất định, không gọi AI nên kết quả tái lập được.</p></div>}

  {tab==='results'&&!summary&&<p className="py-8 text-sm text-muted-foreground">Chọn bộ kiểm thử và bấm Chạy Verify để xem kết quả.</p>}
  {tab==='results'&&summary && <>
   <div role="status" className={`rounded-lg p-4 ${summary.isMatchExpected?'bg-emerald-50 text-emerald-900':'bg-red-50 text-red-900'}`}>
    <strong className="text-lg">{summary.isMatchExpected?'PASS':'FAIL'} · {summary.passedCases}/{summary.totalCases} ca đúng kỳ vọng</strong>
    <p className="mt-1 text-sm">{suites.map(s=>`${s.label}: ${s.passed}/${s.total}`).join(' · ')}</p>
    <p className="mt-1 text-sm">Chạy lúc {new Date(summary.timestamp).toLocaleString('vi-VN')} · {summary.routineCases} tự xử lý · {summary.escalatedCases} chuyển tiếp · {summary.totalTimeMs} ms</p>
    <p className="mt-1 break-all text-xs opacity-80">Run {summary.runId}{summary.commit?` · commit ${summary.commit.slice(0,7)}`:''} · {summary.policyVersion}</p>
   </div>
   <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><caption className="sr-only">Kết quả từng ca: kỳ vọng, thực tế, thời điểm chạy và câu hỏi chuyển tiếp</caption><thead><tr className="border-b"><th className="p-3">Ca</th><th className="p-3">Kỳ vọng</th><th className="p-3">Thực tế</th><th className="p-3">Thời điểm</th><th className="p-3">Kết quả</th></tr></thead>
    <tbody>{suites.map(s=><React.Fragment key={s.mode}>
     {suites.length>1&&<tr className="bg-slate-50"><th colSpan={5} scope="rowgroup" className="p-3 text-xs font-semibold uppercase tracking-wide text-slate-600">{s.label} — {s.passed}/{s.total} PASS</th></tr>}
     {results.filter(r=>(r.suite||summary.mode)===s.mode).map(r=><React.Fragment key={`${s.mode}:${r.testId}`}><tr className="border-b align-top">
      <th scope="row" className="p-3 font-medium">{r.testId}<span className="block text-xs font-normal text-slate-500">{r.sourceFile}</span></th>
      <td className="p-3">{statusLabel(r.expectedStatus,r.expectedRiskGroup)}</td>
      <td className="p-3">{statusLabel(r.actualStatus,r.riskGroup)}{(r.riskGroups?.length||0)>1&&<span className="block text-xs text-slate-600">Còn: {r.riskGroups!.slice(1).map(g=>riskGroupLabels[g]).join(', ')}</span>}<span className="block text-xs text-slate-500">{workflowStatusLabels[r.actualWorkflowStatus || ''] || r.actualWorkflowStatus || 'Lỗi'}{r.actualStatus==='ESCALATED'?` · ${r.requiresCFO?'CFO':'Kế toán trưởng'}`:''}</span></td>
      <td className="p-3 font-mono text-xs">{time(r.startedAt)}<span className="block text-slate-500">{r.executionTimeMs??''} ms</span></td>
      <td className={`p-3 font-semibold ${r.isMatchExpected?'text-emerald-700':'text-red-700'}`}>{r.isMatchExpected?'PASS':'FAIL'}</td></tr>
      {(r.actionableQuestion || !r.isMatchExpected) && <tr className="border-b"><td colSpan={5} className="bg-muted/40 p-4"><p className="whitespace-pre-line text-sm font-medium leading-6">{r.actionableQuestion || r.plainExplanation}</p><details className="mt-2"><summary className="cursor-pointer text-xs text-slate-600">Dữ kiện và căn cứ</summary><HandoffContext handoff={r.handoff} /><p className="mt-2 text-xs text-slate-500">Cấu trúc câu hỏi: {r.questionCheck?.valid?'Đạt':'Cần kiểm tra'}{r.questionCheck?.errors?.length?` (${r.questionCheck.errors.join(', ')})`:''}</p></details></td></tr>}
     </React.Fragment>)}
    </React.Fragment>)}</tbody></table></div>
   <div className="grid gap-3 text-sm sm:grid-cols-2"><p>Bỏ sót: {summary.metrics.falseNegativeRate.toFixed(1)}% / {summary.metrics.denominators.expectedEscalated} ca cần chuyển tiếp</p><p>Chuyển tiếp thừa: {summary.metrics.falsePositiveRate.toFixed(1)}% / {summary.metrics.denominators.expectedRoutine} ca thường quy</p></div>
   <div className="flex flex-wrap gap-2"><button type="button" className="rounded-lg border px-4 py-2 text-sm font-semibold" onClick={()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({summary,results},null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=`verify-${summary.runId}.json`;link.click();URL.revokeObjectURL(url);}}>Tải báo cáo JSON</button><button type="button" onClick={downloadCsv} className="rounded-lg border px-4 py-2 text-sm font-semibold">Tải báo cáo CSV</button></div>
   <details><summary className="cursor-pointer text-xs text-muted-foreground">Dấu vết tái lập</summary><p className="mt-2 break-all text-xs text-slate-500">Lỗi: {summary.errorCases} · Policy SHA-256: {summary.policyHash} · Fixture SHA-256: {summary.fixtureHash} · {summary.executionMode}</p></details>
   <p className="text-xs text-slate-600">Dữ liệu tổng hợp được công bố trong repository. Đây là hồi quy nội bộ, chưa phải kết quả đánh giá độc lập hoặc thử nghiệm người dùng.</p>
  </>}
  {tab==='custom'&&<section className="space-y-4"><h2 className="text-lg font-semibold">Thử dữ liệu mới</h2><p className="mt-3 text-sm text-slate-600">Sửa JSON hoặc chọn một ca mẫu. Trường không biết cứ bỏ trống: hệ thống sẽ chỉ hỏi những dữ kiện thực sự ảnh hưởng tới kết quả, không đoán. Dán mảng <code>[HĐ 1, HĐ 2]</code> để thử cụm mua cùng ngày (hóa đơn cuối được đánh giá, các hóa đơn trước là lịch sử). Ca thường quy chuyển khoản từ 5 triệu (hóa đơn từ 01/7/2025; trước đó 20 triệu) cần <code>&quot;hasBankSlip&quot;: true</code>; từ 20 triệu cần thêm <code>&quot;sellerStatus&quot;: &quot;ACTIVE&quot;</code> — bỏ trống thì hệ thống hỏi lại (nhóm chưa xác định thông tin).</p><div className="my-3 flex flex-wrap gap-2">{judgeExamples.map(c=><button key={c.label} className="rounded border px-3 py-2 text-sm" onClick={()=>{setCustom(JSON.stringify(c.invoice,null,2));setOutcome(null);}}>{c.label}</button>)}<button className="rounded border px-3 py-2 text-sm" onClick={()=>{setCustom(JSON.stringify(challengeCases[3].invoice,null,2));setOutcome(null);}}>{challengeCases[3].name}</button></div><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-medium text-slate-600">Bộ thử người dùng (ghi quyết định của bạn trước khi bấm đánh giá):</span>{studyCases.map(c=><button key={c.label} className="rounded border border-lime-300 bg-lime-50 px-3 py-1.5 text-sm" onClick={()=>{setCustom(JSON.stringify(c.invoice,null,2));setOutcome(null);}}>{c.label}</button>)}</div><label htmlFor="custom-invoice" className="text-sm font-medium">Dữ liệu đầu vào</label><textarea id="custom-invoice" rows={12} value={custom} onChange={e=>setCustom(e.target.value)} className="mt-2 w-full rounded-lg border p-3 font-mono text-xs"/><button disabled={busy} onClick={sandbox} className="mt-3 rounded-lg bg-slate-950 px-4 py-3 text-sm text-white">Đánh giá dữ liệu mới</button>
   {outcome && <div role="status" className="mt-4 rounded-lg bg-slate-50 p-4"><strong>{statusLabel(outcome.decision.status,outcome.decision.status==='ESCALATED'?outcome.decision.riskGroup:undefined)} · {workflowStatusLabels[outcome.workflow.status] || outcome.workflow.status}</strong><p className="mt-2 text-sm">{outcome.decision.plainExplanation}</p>{outcome.decision.status==='ESCALATED' && <><p className="mt-3 whitespace-pre-line font-semibold leading-6">{outcome.decision.actionableQuestion}</p><HandoffContext handoff={outcome.decision.handoff} /></>}</div>}</section>}
 </section>;
}
