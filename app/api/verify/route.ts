import {NextRequest,NextResponse} from 'next/server';
import {runVerification,VERIFY_MODES} from '@/services/verificationService';
import {coerceFieldValue,evaluateWorkflow} from '@/services/workflowService';
import {runIsolated,getDatabase,getActivePolicy,withRequestDatabase} from '@/lib/server/db';
import {getRequestUser} from '@/lib/server/auth';
import {challengeCases,demoCompanyTaxCode} from '@/data/verification/challengeCases';
import {RefereeContextSchema} from '@/lib/refereeDataset';
import {evaluateRefereeCases} from '@/services/refereeEvaluationService';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){const mode=req.nextUrl.searchParams.get('mode') || 'judge';if(!(VERIFY_MODES as readonly string[]).includes(mode))return NextResponse.json({error:'Bộ kiểm thử không hợp lệ'},{status:400});
 // Bộ lớn (15/60 ca) tốn CPU: chỉ chạy khi có phiên (trang /verify tự mở phiên demo); bộ 4/5/9 ca luôn công khai.
 if(['regression_15','development_60'].includes(mode) && !(await withRequestDatabase(req,async()=>Boolean(getRequestUser(req)))))return NextResponse.json({error:'Mở trang /verify để chạy bộ lớn.'},{status:401});try{return NextResponse.json(await runVerification(mode),{headers:{'Cache-Control':'no-store'}});}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Không thể kiểm thử'},{status:500});}}
export async function POST(req:NextRequest){
 try{
  const body=await req.json();const invoice=body.sampleType==='CUSTOM'?body.customInvoice:body.sampleType==='ROUTINE'?challengeCases[0].invoice:challengeCases[3].invoice;
  // Hóa đơn lịch sử gõ tay được hiểu như hóa đơn chính: ô trống là chưa biết, "Tiền mặt"/"Chuyển khoản" được nhận.
  const rawHistory=body.context?.history;
  const history=Array.isArray(rawHistory)?rawHistory.map((h:unknown)=>h&&typeof h==='object'?Object.fromEntries(Object.entries(h as Record<string,unknown>).map(([k,v])=>[k,coerceFieldValue(k,v)]).filter(([,v])=>v!==undefined)):h):rawHistory;
  const context=RefereeContextSchema.optional().parse(body.context?{...body.context,history}:body.context);const started=performance.now();
  const policy=await runIsolated(async()=>{const p=getActivePolicy();p.config.companyTaxCode=demoCompanyTaxCode;return p;});
  const report=await evaluateRefereeCases([{id:'SANDBOX',name:'Dữ liệu mới',invoice,context,expectedStatus:'ROUTINE',expectedRequiresCFO:false,rationale:'Sandbox không có nhãn kỳ vọng.',provenance:'USER_INPUT_SANDBOX'}],policy);
  const r=report.results[0];if(r.actual==='ERROR')return NextResponse.json({success:false,error:r.error},{status:400});
  return NextResponse.json({success:true,sampleType:body.sampleType,invoice,decision:r.decision,workflow:{status:r.workflow,autoApproved:r.actual==='ROUTINE',internalVoucherCreated:r.voucher},questionCheck:r.questionCheck,executionTimeMs:Math.round(performance.now()-started),schemaValid:true,timestamp:new Date().toISOString()});
 }catch(error){return NextResponse.json({success:false,error:error instanceof Error?error.message:'Dữ liệu không hợp lệ'},{status:400});}
}
