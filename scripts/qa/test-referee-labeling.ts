import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {challengeCases} from '../../data/verification/challengeCases';
function main():void{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'referee-label-workflow-'));
 const draft=path.join(directory,'draft.json'),locked=path.join(directory,'locked.json');
 const labeledAt=new Date().toISOString();
 const cases=Array.from({length:20},(_,i)=>({id:`QA-LABEL-${i}`,name:'Mock labeling workflow only',invoice:{...challengeCases[0].invoice,id:`QA-INVOICE-${i}`,invoiceNumber:`QA-INVOICE-${i}`,supplierName:`Nhà cung cấp mô phỏng nhãn ${i}`},expectedStatus:'ROUTINE',expectedRequiresCFO:false,rationale:'Khoản thường quy theo SOP chỉ dùng để kiểm tra công cụ nhãn.',labeledBy:'QA_SIMULATED_NOT_HUMAN',labeledAt,provenance:'SYNTHETIC_LABEL_WORKFLOW_TEST: not independent accuracy evidence'}));
 fs.writeFileSync(draft,JSON.stringify({status:'AWAITING_HUMAN_LABELS',companyTaxCode:'0102030405',cases}));
 const scripts:Record<string,string>={'labels:lock':'lock-referee-labels.ts','evaluate:independent':'evaluate-independent.ts','score:referee-questions':'score-referee-questions.ts'};
 const tsxCli=path.join(process.cwd(),'node_modules','tsx','dist','cli.mjs');
 const run=(name:string,args:string[]):string=>execFileSync(process.execPath,[tsxCli,path.join('scripts','qa',scripts[name]),...args],{encoding:'utf8',env:{...process.env,DEV_LLM_API_KEY:'',TAX_REFEREE_DB_PATH:':memory:'},stdio:['ignore','pipe','pipe']});
 assert.match(run('labels:lock',[draft,locked]),/Đã khóa 20 nhãn/);assert.ok(fs.existsSync(locked+'.sha256'));
 assert.throws(()=>run('labels:lock',[draft,locked]));
 const report=path.join(directory,'evaluation.json');run('evaluate:independent',[locked,'--out',report]);
 assert.ok(fs.existsSync(path.join(directory,'evaluation.csv')));assert.ok(fs.existsSync(path.join(directory,'evaluation-question-scoring.csv')));
 const saved=fs.readFileSync(locked,'utf8');fs.appendFileSync(locked,' ');assert.throws(()=>run('evaluate:independent',[locked]));fs.writeFileSync(locked,saved);
 const copy=path.join(directory,'copied-development.json');const copied=cases.map((c,i)=>({...c,invoice:{...challengeCases[0].invoice,id:`COPY-${i}`,invoiceNumber:`COPY-${i}`}}));fs.writeFileSync(copy,JSON.stringify({companyTaxCode:'0102030405',cases:copied}));const sealed=path.join(directory,'copied-locked.json');run('labels:lock',[copy,sealed]);assert.throws(()=>run('evaluate:independent',[sealed]));
 const questionReport=path.join(directory,'mock-question-report.json'),questionScores=path.join(directory,'mock-question-scores.json');
 fs.writeFileSync(questionReport,JSON.stringify({runId:'QA_SIMULATED_RUN',results:[{id:'QA-QUESTION',actual:'ESCALATED'}]}));
 const score={caseId:'QA-QUESTION',score:6,reviewerId:'QA_SIMULATED_NOT_HUMAN',scoredAt:new Date().toISOString(),notes:'Synthetic score validates the tool only; not a human assessment.'};
 const scoreInput=(runId:string,scores:object[]):void=>{fs.writeFileSync(questionScores,JSON.stringify({runId,scores}));};
 scoreInput('QA_SIMULATED_RUN',[score]);assert.match(run('score:referee-questions',[questionReport,questionScores]),/"meanScore": 6/);
 for(const invalid of [{runId:'WRONG',scores:[score]},{runId:'QA_SIMULATED_RUN',scores:[score,score]},{runId:'QA_SIMULATED_RUN',scores:[{...score,caseId:'UNKNOWN'}]},{runId:'QA_SIMULATED_RUN',scores:[]}]){
  scoreInput(invalid.runId,invalid.scores);assert.throws(()=>run('score:referee-questions',[questionReport,questionScores]));
 }
 console.log('PASS label workflow: seal creation, overwrite prevention, JSON/CSV export, tamper/fixture leakage rejection; question scoring rejects wrong run, duplicate, unknown and incomplete grades. All labels/scores simulated for tool checks; no accuracy claim.');
}
try{main();}catch(error){console.error(error);process.exitCode=1;}
