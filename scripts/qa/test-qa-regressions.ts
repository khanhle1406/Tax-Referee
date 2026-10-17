import { parseXml, sanitizeInvoice } from '../../lib/documentParser';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { NextRequest } from 'next/server';
import { runIsolated, getDatabase, getActivePolicy, withDemoDatabase } from '../../lib/server/db';
import { switchRole, getUserFromToken } from '../../lib/server/auth';
import { evaluateWorkflow, readRecord, approvalBlock, applyWorkflowAction } from '../../services/workflowService';
import { verifyAuditChain } from '../../lib/server/audit';
import { challengeCases } from '../../data/verification/challengeCases';
import { GET as bankGet, POST as bankPost } from '../../app/api/banking/sync/route';
import { GET as tctGet, POST as tctPost } from '../../app/api/reconciliation/tct/route';
import { GET as supplierGet, POST as supplierPost } from '../../app/api/suppliers/route';
import { GET as ledgerGet, POST as ledgerPost } from '../../app/api/ledger/sync/route';
import { GET as ledgerExport } from '../../app/api/ledger/export/route';
import { POST as parseDocument } from '../../app/api/documents/parse/route';
import { parseInvoiceFromRawText } from '../../lib/rawTextParser';
import { parseBankStatement } from '../../lib/banking/bankStatementParser';
import { parseTctExport } from '../../lib/reconciliation/tctParser';
import { visionRequestOptions, expandVisionFields } from '../../services/qwenService';
import { optimizeImageBuffer } from '../../lib/server/pdfToImage';
import { GEMINI_API_CONFIG, SHOPAIKEY_GEMINI_API_CONFIG, OPENROUTER_API_CONFIG } from '../../lib/constants';
import { mockLlmCompletion } from '../../tests/helpers/llm';

let checks=0;
function pass(name:string) { checks++; console.log('PASS '+name); }
function req(path:string,token='',body?:unknown,method=body===undefined?'GET':'POST') {
 return new NextRequest('http://localhost'+path,{method,headers:{cookie:token?`tax_referee_session=${token}`:'','content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
}
async function main() {
 SHOPAIKEY_GEMINI_API_CONFIG.API_KEY='qa-mocked-only';
 assert.equal(process.env.TAX_REFEREE_DB_PATH,':memory:');
 await runIsolated(async()=>{
  const db=getDatabase();const cfoSession=switchRole('CFO')!;const importerSession=switchRole('ACCOUNTANT')!;
  const cfo=getUserFromToken(cfoSession.token)!;const importer=getUserFromToken(importerSession.token)!;
  const p=getActivePolicy();p.config.companyTaxCode='0100109106';db.prepare('UPDATE policy_versions SET payload_json=? WHERE version=?').run(JSON.stringify(p),p.version);
  const base={...challengeCases[0].invoice,id:'BANK-QA',invoiceNumber:'BANK-QA',buyerTaxCode:'0100109106',supplierTaxCode:'0100000001',invoiceDate:'2026-10-10',hasBankSlip:false};
  for(const [path,handler,body] of [
   ['/api/banking/sync',bankGet,undefined],['/api/banking/sync',bankPost,{content:'[]'}],
   ['/api/reconciliation/tct',tctGet,undefined],['/api/reconciliation/tct',tctPost,{content:'[]'}],
   ['/api/suppliers',supplierGet,undefined],['/api/suppliers',supplierPost,{taxCode:'0100000001',legalName:'QA'}],
   ['/api/ledger/sync',ledgerGet,undefined],['/api/ledger/export',ledgerExport,undefined]
  ] as const) {assert.equal((await handler(req(path,'',body))).status,401);pass('401 '+path+' '+(body?'POST':'GET'));}
  assert.equal((await supplierPost(req('/api/suppliers',importerSession.token,{taxCode:'0100000001',legalName:'QA'}))).status,403);pass('Accountant cannot write supplier master');
  await evaluateWorkflow(base,importer,{forceLocalOnly:true});
  const statement=[{referenceNo:'BANK-REF-QA',transactionDate:base.invoiceDate,debitAmount:base.totalAmount,beneficiaryTaxCode:base.supplierTaxCode,description:'Thanh toan BANK-QA MST 0100000001'}];
  const importBank=()=>bankPost(req('/api/banking/sync',cfoSession.token,{content:JSON.stringify(statement)}));
  assert.equal((await importBank()).status,200);const row=readRecord(base.id);const payload=JSON.parse(row.payload_json);
  assert.equal(payload.hasBankSlip,true);assert.equal(row.revision,2);assert.equal(row.status,'ON_HOLD');assert.equal(row.approved_deductible_tax,0);
  assert.equal((db.prepare('SELECT COUNT(*) n FROM internal_vouchers WHERE invoice_id=?').get(base.id) as any).n,0);
  assert.match(approvalBlock(row,cfo)!,/đánh giá lại/);assert.equal(JSON.parse(row.source_review_json).needsReevaluation,true);pass('Bank evidence boolean/revision/tax/voucher/approval guard');
  assert.equal((await importBank()).status,200);assert.equal(readRecord(base.id).revision,2);pass('Bank repeat idempotent');
  assert.equal((await tctGet(req('/api/reconciliation/tct',cfoSession.token))).status,200);assert.equal(verifyAuditChain().valid,true);pass('Bank match leaves valid invoice schema and audit chain');
  const data=await (await bankGet(req('/api/banking/sync',cfoSession.token))).json();assert.equal(data.summary.total,1);assert.equal(data.summary.matchedCount,1);pass('Bank summary contract');
  await withDemoDatabase('00000000-0000-4000-8000-000000000123',async()=>{
   const other=switchRole('CHIEF_ACCOUNTANT')!;
   const request=new NextRequest('http://localhost/api/banking/sync',{headers:{cookie:`tax_referee_demo=00000000-0000-4000-8000-000000000123; tax_referee_session=${other.token}`}});
   assert.equal((await (await bankGet(request)).json()).transactions.length,0);
  });pass('Bank GET does not cross sandbox');
  const before=(db.prepare('SELECT COUNT(*) n FROM bank_transactions').get() as any).n;
  db.prepare('UPDATE invoices SET payload_json=? WHERE id=?').run(JSON.stringify({...payload,hasBankSlip:1}),base.id);
  const log=console.error;console.error=()=>{};
  try {
   const errorBank=await bankPost(req('/api/banking/sync',cfoSession.token,{content:JSON.stringify([{...statement[0],referenceNo:'FAILED-IMPORT'}])}));assert.ok([400,500].includes(errorBank.status));
   assert.equal((db.prepare('SELECT COUNT(*) n FROM bank_transactions').get() as any).n,before);pass('Failed bank import rolls back new rows');
   const errorTct=await tctPost(req('/api/reconciliation/tct',cfoSession.token,{content:JSON.stringify([{invoiceSeries:'1C26TQA',invoiceNumber:'1',invoiceDate:base.invoiceDate,supplierTaxCode:base.supplierTaxCode,preTaxAmount:base.preTaxAmount,taxRate:base.taxRate,taxAmount:base.taxAmount,totalAmount:base.totalAmount}])}));assert.ok([400,500].includes(errorTct.status));assert.equal((db.prepare('SELECT COUNT(*) n FROM tct_invoices').get() as any).n,0);pass('Failed TCT import rolls back new rows');
  }finally{console.error=log;db.prepare('UPDATE invoices SET payload_json=? WHERE id=?').run(JSON.stringify(payload),base.id);}
  for(const [path,handler] of [['/api/banking/sync',bankPost],['/api/reconciliation/tct',tctPost],['/api/suppliers',supplierPost],['/api/ledger/sync',ledgerPost]] as const){
   const malformed=new NextRequest('http://localhost'+path,{method:'POST',headers:{cookie:`tax_referee_session=${cfoSession.token}`,'content-type':'application/json'},body:'{'});assert.equal((await handler(malformed)).status,400);pass('400 malformed JSON '+path);
  }
  assert.equal((await ledgerPost(req('/api/ledger/sync',cfoSession.token,{targetSystem:'INVALID'}))).status,400);pass('Invalid ERP adapter denied');
  const closed=await evaluateWorkflow({...base,id:'CLOSED-QA',invoiceNumber:'CLOSED-QA',hasBankSlip:true,sellerStatus:'CLOSED'},importer,{forceLocalOnly:true});assert.equal(closed.decision.status,'ESCALATED');assert.equal(readRecord('CLOSED-QA').approved_deductible_tax,0);pass('CLOSED missing closure date never approved');
  const text=fs.readFileSync('docs/qa-2026-10-10/fixtures/raw-text.txt','utf8');const extracted=parseInvoiceFromRawText(text);assert.equal(extracted.invoice.supplierTaxCode,'0100000001');assert.equal(extracted.invoice.buyerTaxCode,'0100109106');pass('Parser separates seller and buyer tax codes');
  for(const input of ['[{}]','[{"invoiceSeries":"1C26TQA","invoiceNumber":"1"}]','{']) assert.throws(()=>parseTctExport(input));
  assert.equal((await tctPost(req('/api/reconciliation/tct',cfoSession.token,{content:'[{}]'}))).status,400);pass('TCT missing identities/amounts rejected without defaults');
  const uiSample={invoices:[{series:'1C26TBB',number:'0000001',date:'2026-10-02',sellerTaxCode:'0100109106',sellerName:'QA',preTaxAmount:1000000,taxRate:0,taxAmount:0,totalAmount:1000000,status:'CANCELLED'}]};
  const tct=await tctPost(req('/api/reconciliation/tct',cfoSession.token,{content:JSON.stringify(uiSample)}));assert.equal(tct.status,200);const tr=await tct.json();assert.ok(tr.report);assert.equal(tr.report.items[0].tctInvoice.taxRate,0);assert.equal(tr.report.items[0].tctInvoice.tctStatus,'CANCELLED');pass('TCT UI aliases and VAT0 preserved');
  async function upload(name:string,bytes:Uint8Array,mime:string,token=cfoSession.token) {
   const form=new FormData();form.set('file',new File([new Uint8Array(bytes)],name,{type:mime}));return parseDocument(new NextRequest('http://localhost/api/documents/parse',{method:'POST',headers:{cookie:`tax_referee_session=${token}`},body:form}));
  }
  const sampleSource=fs.readFileSync('components/banking/BankStatementView.tsx','utf8');
  const sampleCsv=sampleSource.match(/const sampleCsv = `([\s\S]*?)`;/)![1];
  const parsedBank=parseBankStatement(sampleCsv,'VIETCOMBANK');assert.deepEqual(parsedBank.map(t=>t.debitAmount),[11000000,5500000,3300000]);assert.equal(parsedBank[0].referenceNo,'QA-VCB-001');assert.equal(parsedBank[0].beneficiaryAccount,'1029384756');assert.equal(parsedBank[0].beneficiaryTaxCode,'0100109106');assert.match(parsedBank[0].description,/Viettel/);pass('UI bank sample columns preserve amounts, references, accounts and tax codes');
  const artifactCount=(db.prepare('SELECT COUNT(*) n FROM document_artifacts').get() as any).n;
  for(const xml of ['', '<HDon><broken>','<!DOCTYPE x [<!ENTITY a SYSTEM "file:///etc/passwd">]><x>&a;</x>']) assert.equal((await upload('broken.xml',Buffer.from(xml),'application/xml')).status,400);
  assert.equal((db.prepare('SELECT COUNT(*) n FROM document_artifacts').get() as any).n,artifactCount);pass('Malformed/empty/DTD XML rejected before storing');
  const validXmlResponse = await upload('invoice.xml',fs.readFileSync('docs/qa-2026-10-10/fixtures/invoice.xml'),'application/xml');
  assert.equal(validXmlResponse.status,200);
  const validXmlPayload = await validXmlResponse.json();
  assert.equal(validXmlPayload.fieldEvidence.invoiceNumber.source,'XML');
  assert.equal(validXmlPayload.fieldEvidence.invoiceNumber.status,'VERIFIED');
  pass('Valid XML stays supported with field provenance');
  const namespaced = parseXml('<inv:Invoice xmlns:inv="urn:invoice"><inv:Seller><inv:TaxID>0100100100</inv:TaxID><inv:Name>Nhà cung cấp XML</inv:Name></inv:Seller><inv:Buyer><inv:TaxID>0100109106</inv:TaxID></inv:Buyer><inv:InvoiceNo>NS-001</inv:InvoiceNo><inv:InvoiceDate>2026-10-10</inv:InvoiceDate><inv:Subtotal>100000</inv:Subtotal><inv:TaxAmount>10000</inv:TaxAmount><inv:TotalAmount>110000</inv:TotalAmount><inv:VATRate>10</inv:VATRate></inv:Invoice>');
  assert.equal(namespaced.rawInvoice.supplierTaxCode,'0100100100');
  assert.equal(namespaced.rawInvoice.buyerTaxCode,'0100109106');
  assert.equal(namespaced.rawInvoice.totalAmount,110000);
  pass('Namespace-aware XML fallback preserves seller/buyer and totals');
  const fetchOriginal=globalThis.fetch;
  globalThis.fetch=async(input,init)=>{
   const visionUrl=new URL(String(input));assert.equal(visionUrl.toString(),SHOPAIKEY_GEMINI_API_CONFIG.ENDPOINT);assert.equal(visionUrl.searchParams.get('key'),null);
   const requestBody=JSON.parse(String(init?.body));
   assert.equal(requestBody.stream,false);
   assert.ok(requestBody.messages?.[0]?.content?.some((part:any)=>part.image_url));
   return mockLlmCompletion({documentType:'INVOICE',invoice:{preTaxAmount:0,taxAmount:0,totalAmount:0,taxRate:0,isImageBlurry:false}});
  };
  try { const result=await upload('blurred.jpg',fs.readFileSync('docs/qa-2026-10-10/fixtures/blurred.jpg'),'image/jpeg');assert.equal(result.status,200);const parsed=await result.json();assert.equal(parsed.needsReview,true);assert.ok(parsed.uncertainFields.includes('totalAmount'));assert.ok(parsed.confidence.totalAmount<0.85);pass('Gemini Vision balanced zeros require source review with low confidence'); } finally {globalThis.fetch=fetchOriginal;}
  const nexOptions=visionRequestOptions('nex-agi/nex-n2.5-mini') as any;assert.equal(nexOptions.response_format,undefined);assert.deepEqual(nexOptions.provider.only,['nex-agi']);assert.equal(nexOptions.reasoning.enabled,false);
  const googleOptions=visionRequestOptions('google/gemini-2.5-flash-lite') as any;assert.deepEqual(googleOptions.provider.only,['google-ai-studio']);assert.equal(googleOptions.provider.allow_fallbacks,false);pass('Vision profiles disable reasoning and respect provider capabilities');
  for(const id of ['HD198735','HD-00001','HB_001']) assert.equal(sanitizeInvoice({invoiceNumber:id}).invoice.invoiceNumber,id);assert.equal(sanitizeInvoice({invoiceNumber:'HĐ: 00180477'}).invoice.invoiceNumber,'00180477');pass('Document normalization preserves invoice identifier prefixes and zeros');
  const wire=expandVisionFields({n:'HD-00001',s:'0100000001',b:'0100109106',p:0,r:0,a:0,blur:true,unknown:'ignored',v:null});assert.equal(wire.invoiceNumber,'HD-00001');assert.equal(wire.preTaxAmount,0);assert.equal(wire.buyerTaxCode,'0100109106');assert.equal(wire.isImageBlurry,true);assert.ok(!('supplierName' in wire));assert.throws(()=>expandVisionFields([]));pass('Compact Vision preserves source values, missing fields and zero');
  const cached=await (await upload('blurred.jpg',fs.readFileSync('docs/qa-2026-10-10/fixtures/blurred.jpg'),'image/jpeg')).json();assert.equal(cached.performance.cacheHit,true);assert.equal(cached.needsReview,true);assert.ok(cached.uncertainFields.includes('totalAmount'));pass('Scoped persisted cache preserves Vision uncertainty');
  let providerCalls=0;globalThis.fetch=async(input)=>{providerCalls++;return mockLlmCompletion({documentType:'INVOICE',invoice:{isImageBlurry:true}});};
  try {await withDemoDatabase('00000000-0000-4000-8000-000000000124',async()=>{
    const fresh=switchRole('CFO')!;const result=await (await upload('blurred.jpg',fs.readFileSync('docs/qa-2026-10-10/fixtures/blurred.jpg'),'image/jpeg',fresh.token)).json();assert.equal(result.performance.cacheHit,false);assert.equal(providerCalls,1);
  });pass('Another session never receives extraction cache or artifact');}finally{globalThis.fetch=fetchOriginal;}
  const small=fs.readFileSync('docs/qa-2026-10-10/fixtures/clear.png');const optimized=await optimizeImageBuffer(small,'image/png');assert.equal(optimized.mimeType,'image/png');assert.deepEqual(optimized.buffer,small);pass('Image optimizer preserves small source legibility');
  globalThis.fetch=async()=>mockLlmCompletion({documentType:'INVOICE',invoice:{invoiceNumber:'TRUNCATED'}},'length');
  const previousConsole=console.error;console.error=()=>{};
  try {assert.equal((await upload('clear.jpg',fs.readFileSync('docs/qa-2026-10-10/fixtures/clear.jpg'),'image/jpeg')).status,502);pass('Truncated Vision response cannot be accepted as complete extraction');} finally {globalThis.fetch=fetchOriginal;console.error=previousConsole;}
  assert.equal(OPENROUTER_API_CONFIG.MODEL,GEMINI_API_CONFIG.MODEL);pass('Vision config uses the current provider/model fallback');
  // In-flight AI evaluation cannot commit after bank evidence revision changed.
  const inflight={...base,id:'BANK-INFLIGHT',invoiceNumber:'BANK-INFLIGHT',supplierTaxCode:'0100000002',preTaxAmount:250000000,taxAmount:25000000,totalAmount:275000000,hasBankSlip:true};
  let reached!:()=>void; let release!:(response:Response)=>void;
  const requestStarted=new Promise<void>(resolve=>{reached=resolve;});
  globalThis.fetch=async()=>{reached();return new Promise<Response>(resolve=>{release=resolve;});};
  // Diễn đạt câu hỏi bằng AI tắt mặc định; bật riêng để tái hiện lượt đánh giá đang chờ nhà cung cấp AI.
  process.env.QGEN_AI='1';
  try {
    const pending=evaluateWorkflow(inflight,importer,{forceLocalOnly:false});pending.catch(()=>{});
    await requestStarted;
    const incoming=await bankPost(req('/api/banking/sync',cfoSession.token,{content:JSON.stringify([{...statement[0],referenceNo:'INFLIGHT-REF',debitAmount:inflight.totalAmount,beneficiaryTaxCode:inflight.supplierTaxCode,description:'BANK-INFLIGHT MST 0100000002'}])}));assert.equal(incoming.status,200);
    release(new Response(JSON.stringify({choices:[{message:{content:'{}'}}]}),{status:200}));
    await assert.rejects(pending,/thay đổi/);assert.equal(readRecord(inflight.id).status,'ON_HOLD');pass('Bank evidence invalidates late evaluation');
  }finally{globalThis.fetch=fetchOriginal;delete process.env.QGEN_AI;}

 });console.log(`${checks} QA regression checks passed; no provider requests.`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
