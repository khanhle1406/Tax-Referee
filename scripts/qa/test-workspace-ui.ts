import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { runIsolated, getDatabase, getActivePolicy } from '../../lib/server/db';
import { switchRole } from '../../lib/server/auth';
import { readInboxItems } from '../../services/inboxReadService';
import { evaluateWorkflow } from '../../services/workflowService';
import { challengeCases, demoCompanyTaxCode } from '../../data/verification/challengeCases';
import { GET as readInvoice } from '../../app/api/invoices/[id]/route';
import { containImage } from '../../lib/imageViewport';
import { readInboxFilters, writeInboxFilters, invoiceIdForPath, invoiceReturnPath, readInvoiceTab, viewForPath } from '../../lib/workspaceNavigation';

async function main():Promise<void> {
  assert.deepEqual(containImage({width:1000,height:2400},{width:600,height:500}),{width:1000*500/2400,height:500});
  assert.deepEqual(containImage({width:200,height:100},{width:600,height:500}),{width:200,height:100});
  assert.deepEqual(containImage({width:2400,height:1000},{width:500,height:600}),{width:500,height:1000*500/2400});
  console.log('PASS portrait/landscape containment and no upscaling');
  const filters={searchTerm:'0000123',riskGroup:'UNCERTAIN_INFO',amountRange:'5M_TO_20M',approvalStatus:'PENDING'} as const;
  assert.deepEqual(readInboxFilters(writeInboxFilters(filters)),filters);
  assert.equal(readInboxFilters(new URLSearchParams('risk=INVALID&amount=INVALID&status=INVALID')).riskGroup,'ALL');
  assert.equal(invoiceIdForPath('/workspace/invoices/INV%20001'),'INV 001');
  assert.equal(invoiceIdForPath('/workspace/invoices/%xx'),null);
  assert.equal(invoiceReturnPath(new URLSearchParams('from=https://outside.test&search=0000123')),'/workspace/inbox?search=0000123');
  assert.equal(readInvoiceTab(new URLSearchParams('tab=invalid')),'review');
  assert.equal(viewForPath('/workspace/approvals'),'approval');
  assert.equal(viewForPath('/workspace/dashboard'),'dashboard');
  assert.equal(viewForPath('/workspace/batches'),'batches');
  assert.equal(viewForPath('/workspace/channels'),'channels');
  assert.equal(viewForPath('/workspace/history'),'history');
  console.log('PASS typed route/query round trip, invalid input and safe return navigation');
  await runIsolated(async()=>{
    const db=getDatabase();const policy=getActivePolicy();policy.config.companyTaxCode=demoCompanyTaxCode;
    db.prepare('UPDATE policy_versions SET payload_json=? WHERE version=?').run(JSON.stringify(policy),policy.version);
    const chief=switchRole('CHIEF_ACCOUNTANT');const accountant=switchRole('ACCOUNTANT');assert.ok(chief&&accountant);
    const invoice={...challengeCases[0].invoice,id:'UI-OUTSIDE',invoiceNumber:'0000123'};
    await evaluateWorkflow(invoice,accountant.user,{forceLocalOnly:true});
    const clone=db.prepare(`INSERT INTO invoices (id,invoice_number,supplier_tax_code,invoice_date,payload_json,content_hash,status,approved_deductible_tax,created_by_user_id,created_at,updated_at,revision,source_review_json)
      SELECT ?,?,supplier_tax_code,invoice_date,json_set(payload_json,'$.id',?,'$.invoiceNumber',?),content_hash,status,approved_deductible_tax,created_by_user_id,created_at,?,revision,source_review_json FROM invoices WHERE id='UI-OUTSIDE'`);
    for(let i=0;i<201;i++){const id='UI-NEW-'+i;clone.run(id,id,id,id,'2099-01-01T00:00:00.000Z');}
    db.prepare("UPDATE invoices SET updated_at='2000-01-01T00:00:00.000Z' WHERE id='UI-OUTSIDE'").run();
    const list=readInboxItems(chief.user);assert.equal(list.length,200);assert.ok(!list.some(item=>item.id==='UI-OUTSIDE'));
    const direct=readInboxItems(chief.user,'UI-OUTSIDE')[0];assert.equal(direct.invoiceNumber,'0000123');assert.equal(direct.invoice.supplierTaxCode,invoice.supplierTaxCode);assert.equal(direct.status,'APPROVED');
    const request=new NextRequest('http://localhost/api/invoices/UI-OUTSIDE',{headers:{cookie:'tax_referee_session='+chief.token}});
    const response=await readInvoice(request,{params:Promise.resolve({id:'UI-OUTSIDE'})});assert.equal(response.status,200);assert.equal((await response.json()).item.id,'UI-OUTSIDE');
    const missing=await readInvoice(request,{params:Promise.resolve({id:'MISSING'})});assert.equal(missing.status,404);
    const unauthorized=await readInvoice(new NextRequest('http://localhost/api/invoices/UI-OUTSIDE'),{params:Promise.resolve({id:'UI-OUTSIDE'})});assert.equal(unauthorized.status,401);
    const accountantResult=readInboxItems(accountant.user,'UI-OUTSIDE')[0];assert.equal(accountantResult.allowedActions?.approve,false);
    await runIsolated(async()=>{assert.equal(readInboxItems(chief.user,'UI-OUTSIDE').length,0);});
    console.log('PASS direct detail beyond 200-row list, string IDs/MST, rights, 401/404 and database isolation');
  });
}
main().catch(error=>{console.error(error);process.exitCode=1;});
