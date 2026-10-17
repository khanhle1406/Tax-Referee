import assert from 'node:assert/strict';
import {runIsolated,getDatabase,getActivePolicy} from '../../lib/server/db';
import {evaluateWorkflow,readRecord,recoverExpiredEvaluations,allowedActions} from '../../services/workflowService';
import {createPolicyDraft,validatePolicyBundle,publishPolicy} from '../../services/policyService';
import {challengeCases,demoCompanyTaxCode} from '../../data/verification/challengeCases';
import {caseDeadline} from '../../lib/workflowPresentation';
import {isGroundedQuestion} from '../../services/questionGuard';
import {evaluateInvoiceLocally} from '../../services/policyEngine';
import {createPrecedent} from '../../services/precedentService';
import {submitFeedback} from '../../services/feedbackService';
import {runVerification} from '../../services/verificationService';
import {listAuditEventsForEntity} from '../../lib/server/audit';
import {assertArtifactCapacity} from '../../lib/server/artifactQuota';
import {extractInvoiceWithHybridPipeline} from '../../services/aiCoordinator';
import {SHOPAIKEY_GEMINI_API_CONFIG} from '../../lib/constants';
import {mockLlmCompletion} from '../../tests/helpers/llm';

const cfo={id:'cfo-test',role:'CFO' as const,email:'cfo@test',displayName:'CFO kiểm thử'};
const importer={...cfo,id:'importer-test',role:'ACCOUNTANT' as const};
let passed=0;
function check(name:string,fn:()=>void){fn();console.log(`PASS ${name}`);passed++;}
async function main(){await runIsolated(async()=>{
 const db=getDatabase(),policy=getActivePolicy();policy.config.companyTaxCode=demoCompanyTaxCode;
 db.prepare('UPDATE policy_versions SET payload_json=? WHERE version=?').run(JSON.stringify(policy),policy.version);
 const base=challengeCases[0].invoice;
 const unknownSmall={...base,id:'UNKNOWN-SMALL',invoiceNumber:'UNKNOWN-SMALL',paymentMethod:undefined,hasBankSlip:undefined,hasItemManifest:undefined,sellerStatus:'UNKNOWN' as const};
 const small=await evaluateWorkflow(unknownSmall,importer,{forceLocalOnly:true});
 check('Khoản nhỏ không bị chuyển tiếp thừa vì dữ kiện không ảnh hưởng kết quả',()=>{assert.equal(small.decision.status,'ROUTINE');assert.deepEqual(JSON.parse(readRecord(unknownSmall.id).source_review_json).unresolvedFields,[]);});
 const unknown={...base,id:'UNKNOWN-BUSINESS',invoiceNumber:'UNKNOWN-BUSINESS',preTaxAmount:20_000_000,taxAmount:2_000_000,totalAmount:22_000_000,paymentMethod:undefined,hasBankSlip:undefined,hasItemManifest:undefined,sellerStatus:'UNKNOWN' as const};
 const large=await evaluateWorkflow(unknown,importer,{forceLocalOnly:true});
 check('Từ ngưỡng: phương thức thanh toán và trạng thái MST phải xác minh, hỏi bằng câu đóng có số tiền',()=>{const fields=JSON.parse(readRecord(unknown.id).source_review_json).unresolvedFields;for(const key of ['paymentMethod','sellerStatus'])assert.ok(fields.includes(key));for(const key of ['hasBankSlip','hasItemManifest'])assert.ok(!fields.includes(key));assert.equal(large.decision.riskGroup,'UNCERTAIN_INFO');assert.match(large.decision.actionableQuestion,/22\.000\.000₫/);assert.match(large.decision.actionableQuestion,/Tiền mặt → không được khấu trừ 2\.000\.000₫/);});
 check('Quota chặn chứng từ quá 15MB trước khi lưu',()=>assert.throws(()=>assertArtifactCapacity(16*1024*1024),/giới hạn/));
 const uncertain={...base,id:'PARTIAL',invoiceNumber:'PARTIAL',sourceUncertainFields:['supplierTaxCode','totalAmount']};
 await evaluateWorkflow(uncertain,importer,{forceLocalOnly:true});
 const partial=await evaluateWorkflow(uncertain,cfo,{forceLocalOnly:true,expectedRevision:1,confirmations:[{field:'supplierTaxCode',evidence:'Đối chiếu XML ký số bản gốc'}]});
 check('Xác minh từng trường giữ trường chưa xác minh',()=>{assert.equal(partial.decision.status,'ESCALATED');const r=JSON.parse(readRecord('PARTIAL').source_review_json);assert.deepEqual(r.unresolvedFields,['totalAmount']);assert.equal(r.confirmations[0].value,base.supplierTaxCode);assert.equal(r.confirmations[0].confirmedBy,cfo.id);});
 await assert.rejects(evaluateWorkflow(uncertain,cfo,{forceLocalOnly:true,expectedRevision:2,confirmations:[{field:'totalAmount',evidence:'ngắn'}]}));
 check('Bằng chứng quá ngắn không thay revision',()=>assert.equal(readRecord('PARTIAL').revision,2));
 const fixed=await evaluateWorkflow(uncertain,cfo,{forceLocalOnly:true,expectedRevision:2,confirmations:[{field:'totalAmount',evidence:'Đối chiếu tổng thanh toán trên XML'}]});
 check('Đủ xác minh mới tự hoàn tất',()=>assert.equal(fixed.workflow.status,'APPROVED'));
 await evaluateWorkflow({...uncertain,supplierTaxCode:'0200200200'},cfo,{forceLocalOnly:true,expectedRevision:3});
 check('Đổi giá trị vô hiệu xác nhận và giữ bản gốc trong audit',()=>{assert.ok(JSON.parse(readRecord('PARTIAL').source_review_json).unresolvedFields.includes('supplierTaxCode'));const events=listAuditEventsForEntity('PARTIAL') as any[];assert.ok(events.some(e=>e.presentation?.actorName===cfo.displayName));});
 const inflight={...base,id:'EXPIRED',invoiceNumber:'EXPIRED'};
 const promise=evaluateWorkflow(inflight,importer,{forceLocalOnly:true});
 db.prepare("UPDATE invoices SET evaluation_deadline='2000-01-01T00:00:00.000Z' WHERE id=?").run(inflight.id);
 assert.equal(recoverExpiredEvaluations(),1);await assert.rejects(promise,/thay đổi/);
 check('Lease hết hạn loại kết quả trễ và voucher',()=>{assert.equal(readRecord(inflight.id).status,'ON_HOLD');assert.equal(readRecord(inflight.id).approved_deductible_tax,0);assert.equal(db.prepare('SELECT id FROM internal_vouchers WHERE invoice_id=?').get(inflight.id),undefined);assert.equal(allowedActions(readRecord(inflight.id),cfo).undo,false);});
 const rerun=await evaluateWorkflow(inflight,importer,{forceLocalOnly:true,expectedRevision:2});
 check('Hồ sơ được chạy lại sau khôi phục',()=>assert.equal(rerun.workflow.status,'APPROVED'));
 check('Hoàn tác tự xử lý mô tả đúng trạng thái chờ đánh giá lại',()=>assert.equal(allowedActions(readRecord(inflight.id),cfo).undoTarget?.targetStatus,'ON_HOLD'));
 const draft=createPolicyDraft({config:policy.config,version:'SAFETY-VALID'});
 check('Policy có SOP, rules và gate khi chưa có dữ liệu vận hành',()=>{assert.ok(draft.policyText.length>100);assert.ok(draft.rules.length>10);assert.equal(validatePolicyBundle(draft).valid,true);});
 const changedLimit=createPolicyDraft({config:{...policy.config,kttApprovalLimit:500_000_000},version:'SAFETY-CHANGED-LIMIT'});
 check('Trần quyền mới được kiểm tra theo biên tương ứng',()=>assert.equal(validatePolicyBundle(changedLimit).valid,true));
 const unsafe=createPolicyDraft({config:{...policy.config,nonCashThreshold:20_000_000},version:'SAFETY-UNSAFE'});
 check('Schema đúng nhưng sai phân luồng phải bị chặn publish',()=>{assert.equal(validatePolicyBundle(unsafe).valid,false);assert.throws(()=>publishPolicy(unsafe.version),/chưa đạt/);assert.equal(getActivePolicy().version,policy.version);});
 const inv=challengeCases[3].invoice,d=evaluateInvoiceLocally(inv,policy.config);
 if(d.status!=='ESCALATED')throw new Error('Fixture không chuyển tiếp');
 check('QGen chặn bịa số tiền và đổi người nhận',()=>{assert.equal(isGroundedQuestion(inv,d,{actionableQuestion:`CFO hóa đơn ${inv.invoiceNumber} chắc chắn hợp lệ 999999999999`,plainExplanation:'Không cần bằng chứng'}),false);});
 check('SLA không quay về 24 giờ khi quá hạn',()=>{const x=caseDeadline('2026-10-01T00:00:00.000Z',new Date('2026-10-03T00:00:00.000Z').getTime());assert.equal(x?.overdue,true);});
 const precedent=createPrecedent({supplierTaxCode:base.supplierTaxCode,supplierName:base.supplierName,riskPattern:'INTERNAL_POLICY_GUEST_ENTERTAINMENT',sopClause:'Quy chế tiếp khách',approvedOption:'ACCEPT_ADJUSTMENT',rationale:'CFO cho phép tiếp khách hợp lệ',approvedBy:'CFO',purpose:'tiếp khách',maximumAmount:4_000_000,currentThreshold:0});
 const fbInv={...base,id:'FB-RETRY',invoiceNumber:'FB-RETRY',invoiceDate:new Date().toISOString().slice(0,10),itemName:'Chi tiếp khách rượu bia'};
 const r=await evaluateWorkflow(fbInv,importer,{forceLocalOnly:true});
 const input={precedentId:precedent.id,invoiceId:fbInv.id,evaluationId:r.workflow.evaluationId,shouldEscalate:false,reason:'Đối chiếu mục đích chi với CFO'};
 submitFeedback(input,cfo);const repeat=submitFeedback(input,cfo);
 check('Retry hậu kiểm không tạo thêm mẫu học',()=>{assert.equal(repeat.duplicate,true);assert.equal((db.prepare('SELECT COUNT(*) n FROM precedent_feedback').get() as any).n,1);assert.throws(()=>submitFeedback({...input,shouldEscalate:true},cfo),/nhãn hậu kiểm khác/);});
 await assert.rejects(runVerification('invalid-mode'),/không hợp lệ/);
 check('Verify trả run ID và policy hash',()=>assert.equal(typeof draft.contentHash,'string'));
 });const report=await runVerification();assert.ok(report.summary.runId);assert.ok(report.summary.policyHash);
 const savedFetch=globalThis.fetch,savedKey=SHOPAIKEY_GEMINI_API_CONFIG.API_KEY;
 const savedEngine=process.env.DOCUMENT_IMAGE_ENGINE,savedUrl=process.env.LOCAL_OCR_URL;
 try{
  SHOPAIKEY_GEMINI_API_CONFIG.API_KEY='qa-mocked-only';
  process.env.DOCUMENT_IMAGE_ENGINE='local-ocr';process.env.LOCAL_OCR_URL='http://worker.test';
  let calls=0;
  globalThis.fetch=async(input,init)=>{
   calls++;
   const url=new URL(String(input));
   assert.equal(url.toString(),SHOPAIKEY_GEMINI_API_CONFIG.ENDPOINT);
   assert.equal(url.searchParams.get('key'),null);
   assert.equal(new Headers(init?.headers).get('authorization'),'Bearer qa-mocked-only');
   const body=JSON.parse(String(init?.body));
   assert.equal(body.model,SHOPAIKEY_GEMINI_API_CONFIG.MODEL);assert.equal(body.stream,false);
   assert.ok(body.messages?.[0]?.content?.some((part:any)=>part.image_url?.url==='data:image/png;base64,AA=='));
   return mockLlmCompletion({documentType:'INVOICE',invoice:{invoiceNumber:'HD12345',supplierTaxCode:'0100109106',totalAmount:11500}});
  };
  const extraction=await extractInvoiceWithHybridPipeline({fileBase64:'AA==',mimeType:'image/png'});
  check('Ảnh được gửi trực tiếp tới Gemini Vision mà không gọi worker OCR',()=>{assert.equal(calls,1);assert.equal(extraction.engineUsed,'GEMINI_AI');assert.equal(extraction.documentType,'INVOICE');assert.equal(extraction.data.invoiceNumber,'HD12345');});
  globalThis.fetch=async()=>mockLlmCompletion({documentType:'NOT_INVOICE',invoice:{}});
  const notInvoice=await extractInvoiceWithHybridPipeline({fileBase64:'AA==',mimeType:'image/png'});
  check('Gemini trả trạng thái ảnh không phải hóa đơn để UI báo bằng toaster',()=>{assert.equal(notInvoice.documentType,'NOT_INVOICE');assert.deepEqual(notInvoice.data,{});});
  globalThis.fetch=async(input,init)=>{
   const body=JSON.parse(String(init?.body));
   assert.ok(body.messages?.[0]?.content?.some((part:any)=>part.image_url?.url==='data:application/pdf;base64,JVBERi0='));
   return mockLlmCompletion({documentType:'INVOICE',invoice:{invoiceNumber:'PDF-001'}});
  };
  const scannedPdf=await extractInvoiceWithHybridPipeline({fileBase64:'JVBERi0=',mimeType:'application/pdf',fileName:'scan.pdf'});
  check('PDF scan được gửi trực tiếp cho Gemini Vision, không chuyển qua OCR',()=>{assert.equal(scannedPdf.documentType,'INVOICE');assert.equal(scannedPdf.data.invoiceNumber,'PDF-001');});
 }finally{
  globalThis.fetch=savedFetch;SHOPAIKEY_GEMINI_API_CONFIG.API_KEY=savedKey;
  for(const [key,value] of [['DOCUMENT_IMAGE_ENGINE',savedEngine],['LOCAL_OCR_URL',savedUrl]]){if(value===undefined)delete process.env[key!];else process.env[key!]=value;}
 }
 console.log(`${passed} kiểm tra cải tiến đạt.`);}
main().catch(e=>{console.error(e);process.exitCode=1;});
