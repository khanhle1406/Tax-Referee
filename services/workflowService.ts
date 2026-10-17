import crypto from 'node:crypto';
import { ActionOption, InvoiceInput, InvoiceInputSchema, RefereeDecision, RefereeDecisionSchema, RuleKind, SourceConfirmation, SourceConfirmationSchema } from '@/lib/schemas';
import { AppUser } from '@/lib/server/auth';
import { appendAuditEvent, appendImmutableAudit } from '@/lib/server/audit';
import { getActivePolicy, getDatabase, getMacroState, hashPayload, jsonNow, saveMacroState } from '@/lib/server/db';
import { generateCanonicalVoucher } from '@/lib/accounting/ledgerMapper';
import { queryJevReferee } from './jevService';
import { calculateKFactor,evaluateInvoiceLocally,sameDayPurchaseTotal } from './policyEngine';
import {coreDecisionFields,missingBusinessFacts,paymentThreshold,requiredDecisionFields} from '@/lib/refereeRequirements';
import {groupOf,hasNonAcceptableFinding,orderFindings,riskGroupsOf,taxonomyOf} from '@/lib/riskTaxonomy';
import {fieldAsk,type FieldAsk} from './questionBuilder';
import {buildHandoff,checkHandoff,describeRuleEvidence} from './handoffService';
import { fieldLabels } from '@/lib/workflowPresentation';
import { recordConfirmedSupplierAlias } from './taxLookupService';
import { DEFAULT_POST_AUDIT_RATE, postAuditStatus, recordPostAuditReview, samplePostAudit, stratifiedRate } from './postAuditService';
import { runningCommit } from '@/lib/server/buildInfo';
import { isAutomationPaused } from './automationControl';
import { POLICY_CONTRACT_VERSION } from '@/data/policyContract';
import { z } from 'zod';

export class WorkflowError extends Error { constructor(message: string, public status = 409) { super(message); } }
const STANDARD_VAT_RATES=[0,5,8,10];
/** Trường được so với chứng từ nguồn đã trích xuất; sửa khác nguồn mà chưa có KTT/CFO xác nhận thì không được tự duyệt. */
const SOURCE_DIFF_FIELDS=['invoiceNumber','invoiceDate','supplierTaxCode','buyerTaxCode','itemName','preTaxAmount','taxRate','taxAmount','totalAmount','paymentMethod','invoiceSeries','taxAuthorityCode','signingDate','isAdjustment','items'] as const;
const normText=(v:unknown)=>String(v ?? '').normalize('NFC').toLocaleLowerCase('vi-VN').replace(/\s+/g,' ').trim();
function differsFromSource(field:string,source:unknown,submitted:unknown):boolean {
  if(source===undefined || source===null || source==='')return false;
  if(field==='items'){
    const a=Array.isArray(source)?source as Array<{amount?:number}>:[],b=Array.isArray(submitted)?submitted as Array<{amount?:number}>:[];
    if(!a.length)return false;
    const sum=(xs:Array<{amount?:number}>)=>xs.reduce((s,x)=>s+(Number(x.amount)||0),0);
    return a.length!==b.length || Math.abs(sum(a)-sum(b))>1;
  }
  if(typeof source==='number')return typeof submitted!=='number' || Math.abs(source-submitted)>1;
  if(typeof source==='boolean')return submitted!==undefined && submitted!==source;
  if(field.endsWith('TaxCode'))return String(source).replace(/\D/g,'')!==String(submitted ?? '').replace(/\D/g,'');
  return normText(source)!==normText(submitted);
}
const NUMERIC_FIELDS=['preTaxAmount','taxAmount','totalAmount','taxRate'] as const;
const BOOLEAN_FIELDS=['hasBankSlip','hasItemManifest','isImageBlurry','isAdjustment','isStaffReimbursed'] as const;
/** Giám khảo có thể gõ số dạng chuỗi ("1.000.000", "1000000", "10%"): chuyển khi không mơ hồ, còn lại bỏ trống để hệ thống hỏi. */
export function coerceFieldValue(field:string,value:unknown):unknown {
  if(typeof value!=='string')return value;
  if(value.trim()==='')return undefined;
  if(field==='paymentMethod'){
    const t=value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toUpperCase();
    return t==='CASH'||t==='TIEN MAT'||t==='TM'?'CASH':t==='BANK_TRANSFER'||t==='CHUYEN KHOAN'||t==='CK'||t==='BANK TRANSFER'?'BANK_TRANSFER':undefined;
  }
  if(field==='sellerStatus'){
    const t=value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toUpperCase();
    return ['ACTIVE','SUSPENDED','CLOSED','UNKNOWN'].includes(t)?t:t==='DANG HOAT DONG'?'ACTIVE':t==='TAM NGUNG'||t==='TAM NGUNG HOAT DONG'?'SUSPENDED':t==='DA DONG MST'||t==='NGUNG HOAT DONG'?'CLOSED':undefined;
  }
  if((NUMERIC_FIELDS as readonly string[]).includes(field)){
    const text=value.replace(/₫|đ|vnd|%/gi,'').replace(/\s+/g,'').trim();
    if(/^-?\d+$/.test(text))return Number(text);
    if(/^-?\d{1,3}([.,]\d{3})+$/.test(text))return Number(text.replace(/[.,]/g,''));
    if(field==='taxRate' && /^\d+([.,]\d+)?$/.test(text))return Number(text.replace(',','.'));
    return undefined;
  }
  if((BOOLEAN_FIELDS as readonly string[]).includes(field)){
    const t=value.trim().toLocaleLowerCase('vi-VN');
    return ['true','có','co','yes','1'].includes(t)?true:['false','không','khong','no','0'].includes(t)?false:undefined;
  }
  return value.normalize('NFC');
}
export type WorkflowRecord = { id: string; status: string; revision: number; payload_json: string; source_review_json: string; content_hash: string; approved_deductible_tax: number; created_by_user_id: string | null; tax_hold: number; paused_from: string | null; evaluation_id?: string; decision_json?: string; evaluation_policy_json?: string; evaluation_attempt_id?: string; evaluation_deadline?: string };
export function readRecord(id: string): WorkflowRecord {
  const row = getDatabase().prepare(`SELECT i.*, e.id evaluation_id, e.decision_json FROM invoices i LEFT JOIN evaluations e ON e.id = (SELECT id FROM evaluations WHERE invoice_id = i.id ORDER BY rowid DESC LIMIT 1) WHERE i.id = ?`).get(id) as WorkflowRecord | undefined;
  if (!row) throw new WorkflowError('Không tìm thấy hồ sơ.', 404);
  return row;
}
export function assertCurrent(row: WorkflowRecord, evaluationId: unknown, revision: unknown) {
  if (row.evaluation_id !== evaluationId || row.revision !== revision) throw new WorkflowError('Hồ sơ hoặc evaluation đã thay đổi. Tải lại trước khi xử lý.');
}

/** Recover only expired attempts. The revision fence rejects any late result. */
export function recoverExpiredEvaluations(now = jsonNow()): number {
  const db=getDatabase();
  const rows=db.prepare("SELECT id FROM invoices WHERE status='EVALUATING' AND (evaluation_deadline IS NULL OR evaluation_deadline<=?)").all(now) as {id:string}[];
  if(!rows.length)return 0;
  return db.transaction(()=>{
    for(const {id} of rows){
      const row=readRecord(id),before=snapshot(row);
      db.prepare("UPDATE invoices SET status='ON_HOLD',approved_deductible_tax=0,revision=revision+1,evaluation_deadline=NULL,updated_at=? WHERE id=?").run(now,id);
      syncVoucher(readRecord(id));
      recordAction(row,null,'EVALUATION_RECOVERED','Lượt đánh giá hết hạn hoặc bị gián đoạn; giữ hồ sơ để chạy lại, chưa duyệt thuế.',before,{expiredAttemptId:row.evaluation_attempt_id});
    }
    recomputeMacro();
    return rows.length;
  })();
}

/**
 * Thao tác có thể hoàn tác. Ranh giới: hoàn tác là một chuyển trạng thái NGƯỢC, nên không được nới lỏng kiểm soát mà người khác
 * (hoặc luật) đã đặt — trả hồ sơ về "Đã duyệt", gỡ giữ thuế, tăng thuế duyệt chỉ được làm bởi chính người đã thao tác.
 * Lệnh giữ theo luật (cụm tiền mặt) và giữ thuế do hậu kiểm "không đồng ý" không hoàn tác được.
 */
function undoCandidate(row:WorkflowRecord,user?:AppUser) {
  const events=getDatabase().prepare('SELECT id,event_type,payload_json,actor_id FROM audit_events WHERE entity_id=? ORDER BY rowid DESC').all(row.id) as {id:string;event_type:string;payload_json:string;actor_id:string|null}[];
  const reversed=new Set(events.filter(e=>e.event_type==='INVOICE_ACTION_REVERTED').map(e=>JSON.parse(e.payload_json).reversesEventId));
  const latest=events.find(e=>!reversed.has(e.id) && !['INVOICE_ACTION_REVERTED','EVALUATION_STARTED','EVALUATION_FAILED','EVALUATION_RECOVERED','INVOICE_EVALUATED','BANK_EVIDENCE_RECORDED','ROUTINE_HELD_AUTOMATION_PAUSED','LINKED_CASH_HOLD','ROUTINE_HELD_AUTHORITY_FLOOR'].includes(e.event_type) && JSON.parse(e.payload_json).before);
  if(!latest)return null;
  const payload=JSON.parse(latest.payload_json);
  if(!(payload.after.status===row.status && payload.revision===row.revision)) return null;
  const before=payload.before,after=payload.after;
  const loosens=before.status==='APPROVED' || Number(before.taxHold)<Number(after.taxHold) || Number(before.approvedTax)>Number(after.approvedTax);
  if(loosens){
    if(latest.event_type==='TAX_HOLD' && postAuditStatus(row.id)?.result==='DISAGREE') return null;
    if(!user || latest.actor_id!==user.id) return null;
  }
  return {id:latest.id,eventType:latest.event_type,payload};
}
/**
 * Người đã xác nhận người gửi lạ cho hóa đơn (CHANNEL_SENDER_ASSIGNED) là người đưa hóa đơn đó vào quy trình: không được tự trả lời,
 * tự duyệt hay tự chốt chính hóa đơn đó — giống người nhập (bất kiêm nhiệm).
 */
export function senderConfirmedBy(invoiceId: string | null | undefined): string | null {
  if (!invoiceId) return null;
  const row = getDatabase().prepare("SELECT actor_id FROM audit_events WHERE entity_id=? AND event_type='CHANNEL_SENDER_ASSIGNED' ORDER BY rowid DESC LIMIT 1").get(invoiceId) as { actor_id: string | null } | undefined;
  return row?.actor_id ?? null;
}

export function approvalBlock(row: WorkflowRecord, user: AppUser): string | null {
  if (user.role === 'ACCOUNTANT') return 'Cần Kế toán trưởng hoặc CFO.';
  if (row.created_by_user_id === user.id) return 'Người nhập hồ sơ không được tự phê duyệt.';
  if (senderConfirmedBy(row.id) === user.id) return 'Người xác nhận người gửi của hóa đơn này không được tự phê duyệt (bất kiêm nhiệm).';
  if (row.status === 'PAUSED' || row.status === 'EVALUATING') return 'Hồ sơ đang dừng hoặc đang được đánh giá.';
  if (!row.decision_json) return 'Chưa có evaluation.';
  const d = RefereeDecisionSchema.parse(JSON.parse(row.decision_json));
  if (((d.status === 'ESCALATED' && d.requiresCFO) || ['FORWARDED','WAITING_CFO'].includes(row.status)) && user.role !== 'CFO') return 'Hồ sơ cần CFO.';
  const review = JSON.parse(row.source_review_json || '{}');
  if (review.needsReevaluation) return 'Bằng chứng đã thay đổi; cần đánh giá lại hồ sơ.';
  if (review.unresolvedFields?.length) return `Cần xác minh: ${review.unresolvedFields.join(', ')}.`;
  if (d.status === 'ESCALATED' && (!d.findings?.length || hasNonAcceptableFinding(d.findings))) return 'Cần bổ sung/sửa bằng chứng và đánh giá lại tất cả phát hiện trước khi duyệt.';
  if (row.tax_hold) return 'Đang tạm giữ thuế; cần giải phóng và đánh giá lại.';
  return null;
}
export function allowedActions(row: WorkflowRecord, user: AppUser) {
  const operator = user.role !== 'ACCOUNTANT';
  const blockedReason = approvalBlock(row, user);
  const undo=undoCandidate(row,user);
  return { approve: !blockedReason && ['WAITING_CHIEF_ACCOUNTANT','WAITING_CFO','FORWARDED'].includes(row.status),
    pause: operator && row.status !== 'PAUSED', resume: operator && row.status === 'PAUSED',
    undo: operator && Boolean(undo), undoTarget:operator && undo ? {eventId:undo.id,eventType:undo.eventType,targetStatus:undo.payload.before.status==='EVALUATING'?'ON_HOLD':undo.payload.before.status} : null,
    taxHold: operator, requestInformation: operator && !['PAUSED','EVALUATING','APPROVED','REJECTED'].includes(row.status),
    savePrecedent: user.role === 'CFO' && !blockedReason && JSON.parse(row.decision_json || '{}').findings?.some((f: {kind:string}) => f.kind === 'INTERNAL_POLICY'), blockedReason };
}
function snapshot(row: WorkflowRecord) {
  return { status: row.status, approvedTax: row.approved_deductible_tax, taxHold: row.tax_hold, pausedFrom: row.paused_from,
    voucher: getDatabase().prepare('SELECT * FROM internal_vouchers WHERE invoice_id = ?').get(row.id) || null };
}
export function recomputeMacro() {
  const db = getDatabase();
  const baseline = db.prepare('SELECT payload_json FROM macro_baseline WHERE id = 1').get() as {payload_json:string};
  const base = JSON.parse(baseline.payload_json);
  const sums = db.prepare(`SELECT COALESCE(SUM(json_extract(payload_json,'$.preTaxAmount')),0) purchases, COALESCE(SUM(approved_deductible_tax),0) tax FROM invoices WHERE status = 'APPROVED'`).get() as {purchases:number;tax:number};
  const next = { ...base, totalPurchases: base.totalPurchases + sums.purchases, totalDeductibleTax: base.totalDeductibleTax + sums.tax };
  const k = calculateKFactor(0, getActivePolicy().config.kFactorSafeMin, getActivePolicy().config.kFactorSafeMax, next);
  saveMacroState({...next, kFactor:k.kFactor, zone:k.zone});
}
export function recordAction(row: WorkflowRecord, user: AppUser | null, eventType: string, reason: string, before: ReturnType<typeof snapshot>, extra: Record<string,unknown> = {}) {
  const after = readRecord(row.id);
  const policy = after.evaluation_policy_json ? JSON.parse(after.evaluation_policy_json) : getActivePolicy();
  const payload = { evaluationId: after.evaluation_id, revision: after.revision, policyVersion:policy.version, policyHash:policy.contentHash || hashPayload(policy), actorRole:user?.role || 'SYSTEM_REFEREE', actorName:user?.displayName || 'Hệ thống',
    invoice: JSON.parse(after.payload_json), review:JSON.parse(after.source_review_json), decision:after.decision_json?JSON.parse(after.decision_json):null, before, after:snapshot(after),
    previousStatus:before.status, targetStatus:after.status, previousApprovedDeductibleTax:before.approvedTax, approvedDeductibleTax:after.approved_deductible_tax, reason,
    inputHash:after.content_hash, contractVersion:POLICY_CONTRACT_VERSION, commit:runningCommit() || null, ...extra };
  const event = appendAuditEvent({eventType,entityId:row.id,actorId:user?.id,payload});
  appendImmutableAudit({eventType,entityId:row.id,userId:user?.id || 'system',userRole:user?.role || 'SYSTEM_REFEREE',action:eventType,rationale:reason,payload:{...payload,auditEventId:event.id}});
  return event;
}
function syncVoucher(row: WorkflowRecord) {
  const db=getDatabase();
  if (row.status !== 'APPROVED' || row.tax_hold) { db.prepare('DELETE FROM internal_vouchers WHERE invoice_id = ?').run(row.id); return; }
  const invoice=InvoiceInputSchema.parse(JSON.parse(row.payload_json));
  const d=RefereeDecisionSchema.parse(JSON.parse(row.decision_json!));
  const voucher=generateCanonicalVoucher(invoice,d,row.revision,'CIRCULAR_99_200',row.approved_deductible_tax);
  const t=jsonNow();
  db.prepare(`INSERT INTO internal_vouchers (id, invoice_id, evaluation_id, regime, voucher_json, created_at, updated_at) VALUES (?,?,?,'CIRCULAR_99_200',?,?,?) ON CONFLICT(invoice_id) DO UPDATE SET id=excluded.id,evaluation_id=excluded.evaluation_id,voucher_json=excluded.voucher_json,updated_at=excluded.updated_at`).run(voucher.id,row.id,row.evaluation_id,JSON.stringify({...voucher,status:'READY_TO_POST'}),t,t);
}
export async function evaluateWorkflow(raw: unknown, user: AppUser | null, options: {forceLocalOnly?:boolean; confirmedFields?:string[]; evidence?:string; expectedRevision?:number; confirmations?:SourceConfirmation[]} = {}) {
  // Thuế suất ngoài 0/5/8/10% không bị lỗi 400: coi là dữ kiện chưa xác minh và hỏi lại bằng câu hỏi cụ thể.
  const loose=raw && typeof raw==='object' && !Array.isArray(raw) ? Object.fromEntries(Object.entries(raw as Record<string,unknown>).map(([key,value])=>[key,coerceFieldValue(key,value)])) : raw;
  const rawTaxRate=(loose as {taxRate?:unknown})?.taxRate;
  const nonStandardTaxRate=typeof rawTaxRate==='number' && !STANDARD_VAT_RATES.includes(rawTaxRate) ? rawTaxRate : undefined;
  const parseable=nonStandardTaxRate===undefined ? loose : {...(loose as object),taxRate:undefined};
  const partial=Object.fromEntries(Object.entries(InvoiceInputSchema.partial().parse(parseable)).filter(([,value])=>value!==undefined)) as Partial<InvoiceInput>;
  if((raw as any)?.sourceUncertainFields && (!Array.isArray((raw as any).sourceUncertainFields) || (raw as any).sourceUncertainFields.some((f:unknown)=>typeof f!=='string')))throw new WorkflowError('Danh sách trường nghi vấn sai cấu trúc.',400);
  const required=coreDecisionFields;
  const missing=required.filter(k=>partial[k] === undefined);
  const id=partial.id || crypto.randomUUID();
  const invoice=InvoiceInputSchema.parse({invoiceNumber:'Chưa xác minh',invoiceDate:'2026-01-01',supplierTaxCode:'0000000000',supplierName:'Chưa xác minh',itemName:'Chưa xác minh',preTaxAmount:0,taxRate:0,taxAmount:0,totalAmount:0,...partial,id});
  const db=getDatabase(); recoverExpiredEvaluations(); const policy=getActivePolicy();
  let existing: WorkflowRecord | null=null; try {existing=readRecord(id);} catch(e) {if (!(e instanceof WorkflowError && e.status===404)) throw e;}
  if (existing?.status==='PAUSED') throw new WorkflowError('Hồ sơ đang dừng; tiếp tục trước khi đánh giá.');
  if (existing?.status==='EVALUATING') throw new WorkflowError('Hồ sơ đang được xử lý.');
  const source=invoice.sourceArtifactId ? db.prepare('SELECT a.content_hash, a.invoice_id, r.payload_json review FROM document_artifacts a LEFT JOIN extraction_reviews r ON r.artifact_id=a.id WHERE a.id=?').get(invoice.sourceArtifactId) as {content_hash:string;invoice_id:string;review?:string}|undefined : undefined;
  let sharedDuplicateSource=false;
  if(source && ![id,`pending:${invoice.sourceArtifactId}`].includes(source.invoice_id)){
    const canonical=db.prepare('SELECT payload_json FROM invoices WHERE id=?').get(source.invoice_id) as {payload_json:string}|undefined;
    if(canonical){const original=JSON.parse(canonical.payload_json);sharedDuplicateSource=original.supplierTaxCode===invoice.supplierTaxCode && original.invoiceNumber===invoice.invoiceNumber && (original.invoiceSeries || '')===(invoice.invoiceSeries || '');}
  }
  if (invoice.sourceArtifactId && (!source || source.content_hash!==invoice.sourceHash || (!sharedDuplicateSource && ![id,`pending:${invoice.sourceArtifactId}`].includes(source.invoice_id)))) throw new WorkflowError('Chứng từ nguồn không thuộc hồ sơ này.');
  const extracted=source?.review ? JSON.parse(source.review) : {};
  const sourceInvoice=(extracted.cachedResult?.invoice || null) as Record<string,unknown>|null;
  const sourceConflicts:string[]=sourceInvoice ? SOURCE_DIFF_FIELDS.filter(field=>differsFromSource(field,sourceInvoice[field],(invoice as unknown as Record<string,unknown>)[field])) : [];
  const previousReview=existing ? JSON.parse(existing.source_review_json || '{}') : {};
  const oldInvoice=existing ? JSON.parse(existing.payload_json) : {};
  const prevDecision=existing?.decision_json ? JSON.parse(existing.decision_json) : null;
  // Bánh cóc thẩm quyền: ca đã từng cần CFO thì người khác CFO sửa dữ liệu (VD hạ 330 triệu xuống 198 triệu) không làm hạ thẩm quyền.
  // Mức sàn chỉ được gỡ khi chính CFO thao tác.
  const cfoFloor=previousReview.authorityFloor==='CFO' || (prevDecision?.status==='ESCALATED' && prevDecision.requiresCFO===true) || ['WAITING_CFO','FORWARDED'].includes(existing?.status ?? '');
  const floorHold=cfoFloor && user?.role!=='CFO';
  // Sửa dữ liệu sau khi hồ sơ đã bị chuyển tiếp: người nhập không được "rửa" ca (VD hạ số tiền để né CFO).
  // Trường đã có giá trị mà bị Kế toán viên đổi phải được KTT/CFO xác nhận như một mâu thuẫn với bản trước; bổ sung trường còn thiếu thì vẫn bình thường.
  const escalatedBefore=Boolean(existing?.decision_json) && JSON.parse(existing!.decision_json!).status==='ESCALATED';
  // Không chỉ số tiền: các dữ kiện kích hoạt phát hiện còn mở (trạng thái MST, bảng kê, hóa đơn điều chỉnh…) đã có giá trị mà bị đổi
  // sau khi chuyển tiếp cũng phải được người có thẩm quyền xác nhận — không "rửa" được ca bằng cách lật một dữ kiện.
  const guardedFields=[...new Set<string>([...SOURCE_DIFF_FIELDS,...((prevDecision?.findings || []) as Array<{ruleId:string;kind?:string}>).flatMap(f=>taxonomyOf(f.ruleId,f.kind as never).triggerFields).filter(field=>field in InvoiceInputSchema.shape && oldInvoice[field]!==undefined && oldInvoice[field]!==null)])];
  const postEscalationEdits:string[]=escalatedBefore && (!user || user.role==='ACCOUNTANT' || floorHold)
    ? guardedFields.filter(field=>!(previousReview.unresolvedFields || []).includes(field) && oldInvoice[field]!=='UNKNOWN' && differsFromSource(field,oldInvoice[field],(invoice as unknown as Record<string,unknown>)[field]))
    : [];
  const dailyTotal=sameDayPurchaseTotal(invoice);
  const requiredFields=requiredDecisionFields(invoice,policy.config,dailyTotal);
  // Flagged optional identifiers remain relevant even if their extracted value is absent.
  for(const field of ['buyerTaxCode','invoiceSeries','taxAuthorityCode','signingDate','items','isAdjustment'])if([...(extracted.uncertainFields||[]),...((raw as any)?.sourceUncertainFields||[])].includes(field))requiredFields.add(field);
  // Khác chứng từ gốc luôn chặn tự duyệt cho đến khi KTT/CFO xác nhận, kể cả trường không bắt buộc với quy tắc.
  for(const field of [...sourceConflicts,...postEscalationEdits])requiredFields.add(field);
  const unknownBusinessFields=missingBusinessFacts(invoice,policy.config,dailyTotal);
  const sourceFields=[...(extracted.uncertainFields || []),...((raw as any)?.sourceUncertainFields || []),...unknownBusinessFields,...sourceConflicts,...postEscalationEdits];
  const inferredFields=extracted.inferredFields || [];
  const priorConfirmations = (previousReview.confirmations || []) as Array<{field:string;value:unknown;evidence:string;confirmedBy:string;confirmedAt:string;artifactId?:string}>;
  const confirmations = priorConfirmations.filter(c => JSON.stringify(c.value) === JSON.stringify((invoice as any)[c.field]));
  const confirmed=(previousReview.confirmedFields || []).filter((field:string)=>JSON.stringify(oldInvoice[field])===JSON.stringify((invoice as any)[field]));
  const newConfirmations = z.array(SourceConfirmationSchema).max(100).parse(options.confirmations || []);
  const legacyFields = z.array(z.string().refine(field => field in InvoiceInputSchema.shape, 'Trường xác minh không hợp lệ')).max(100).parse(options.confirmedFields || []);
  if (newConfirmations.length || legacyFields.length) {
    if (!user || user.role==='ACCOUNTANT') throw new WorkflowError('KTT/CFO cần xác minh dữ liệu.',403);
    // Bất kiêm nhiệm: người nhập hồ sơ không tự xác minh dữ liệu (kể cả dữ liệu AI đọc) của chính mình.
    if (!existing || existing.created_by_user_id===user.id) throw new WorkflowError('Người nhập hồ sơ không tự xác minh dữ liệu của mình: hãy để Kế toán viên nhập, rồi KTT/CFO khác xác minh (trong demo, đổi vai ở góc trên).',403);
    if (legacyFields.length && (!options.evidence || options.evidence.trim().length<8)) throw new WorkflowError('KTT/CFO cần ghi bằng chứng xác minh dữ liệu.',403);
    for (const confirmation of [...newConfirmations, ...legacyFields.map(field => ({field,evidence:options.evidence!}))]) {
      const value = (invoice as any)[confirmation.field];
      if (missing.includes(confirmation.field as typeof missing[number]) || value === undefined || value === 'UNKNOWN')
        throw new WorkflowError(`Chưa có giá trị để xác minh ${fieldLabels[confirmation.field] || confirmation.field}.`,400);
      confirmed.push(confirmation.field);
      const existingConfirmation = confirmations.find(c => c.field===confirmation.field && JSON.stringify(c.value)===JSON.stringify(value) && c.evidence===confirmation.evidence);
      if (!existingConfirmation) {
        const index=confirmations.findIndex(c=>c.field===confirmation.field); if(index>=0)confirmations.splice(index,1);
        confirmations.push({field:confirmation.field,value,evidence:confirmation.evidence,confirmedBy:user.id,confirmedAt:jsonNow(),artifactId:invoice.sourceArtifactId});
      }
    }
  }
  const identityVerified = extracted.supplierIdentity?.status === 'VERIFIED'
    && extracted.supplierIdentity.supplierTaxCode === invoice.supplierTaxCode
    && extracted.supplierIdentity.legalName === invoice.supplierName;
  const allWarnings=[...new Set<string>([...missing,...sourceFields,...inferredFields,...(previousReview.unresolvedFields || [])])];
  const unresolved=allWarnings.filter(field=>requiredFields.has(field))
    .filter(f=>identityVerified && ['supplierName','supplierTaxCode'].includes(f)
      ? missing.includes(f as typeof missing[number])
      : !confirmed.includes(f) || missing.includes(f as typeof missing[number]));
  const recordedIdentity = extracted.supplierIdentity || previousReview.supplierIdentity;
  const supplierIdentity = recordedIdentity?.status === 'VERIFIED'
    && (recordedIdentity.supplierTaxCode !== invoice.supplierTaxCode || recordedIdentity.legalName !== invoice.supplierName)
    ? { ...recordedIdentity, status: 'CONFLICT', message: 'Thông tin nhà cung cấp đã thay đổi so với kết quả đối chiếu nguồn.' }
    : recordedIdentity;
  const review={rawInput:raw,sourceValues:extracted.invoice || previousReview.sourceValues || null,sourceConflicts,postEscalationEdits,supplierIdentity,inferredFields,unresolvedFields:unresolved,nonBlockingFields:allWarnings.filter(field=>!requiredFields.has(field)),confirmedFields:[...new Set(confirmed)],confirmations,evidence:options.evidence || previousReview.evidence || null,confirmedBy:newConfirmations.length || legacyFields.length ? user?.id : previousReview.confirmedBy,
    authorityFloor:floorHold || (previousReview.authorityFloor==='CFO' && user?.role!=='CFO') ? 'CFO' : undefined,
    // Danh tính agent AI đã đọc chứng từ (model, hash prompt, key bị loại) đi theo hồ sơ vào mọi sự kiện audit.
    llmProvenance:extracted.llmProvenance ?? previousReview.llmProvenance ?? null,visionDroppedKeys:extracted.droppedKeys ?? previousReview.visionDroppedKeys ?? []};
  const hash=hashPayload({invoice,review});
  const heldRoutine=existing?.status==='WAITING_CHIEF_ACCOUNTANT' && Boolean(existing.decision_json) && JSON.parse(existing.decision_json!).status==='ROUTINE';
  if(existing?.content_hash===hash && existing.evaluation_id && !heldRoutine && ['APPROVED','REJECTED','WAITING_CFO','WAITING_CHIEF_ACCOUNTANT','FORWARDED'].includes(existing.status)) return {decision:JSON.parse(existing.decision_json!),workflow:{status:existing.status,revision:existing.revision,evaluationId:existing.evaluation_id,duplicate:true},policy};
  if(existing && options.expectedRevision!==existing.revision) throw new WorkflowError('Cần phiên bản hồ sơ hiện hành để bổ sung dữ liệu.');
  const initialSnapshot=existing ? snapshot(existing) : {status:'RECEIVED',approvedTax:0,taxHold:0,pausedFrom:null,voucher:null};
  const revision=existing ? existing.revision+1 : 1; const t=jsonNow();
  const attemptId=crypto.randomUUID();
  const leaseMs=Math.max(60_000,Math.min(300_000,Number(process.env.EVALUATION_LEASE_MS) || 120_000));
  const deadline=new Date(Date.now()+leaseMs).toISOString();
  db.transaction(()=>{
    db.prepare(`INSERT INTO invoices (id,invoice_number,supplier_tax_code,invoice_date,payload_json,content_hash,status,approved_deductible_tax,created_by_user_id,created_at,updated_at,revision,source_review_json) VALUES (?,?,?,?,?,?,'EVALUATING',0,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET invoice_number=excluded.invoice_number,supplier_tax_code=excluded.supplier_tax_code,invoice_date=excluded.invoice_date,payload_json=excluded.payload_json,content_hash=excluded.content_hash,status='EVALUATING',approved_deductible_tax=0,updated_at=excluded.updated_at,revision=excluded.revision,source_review_json=excluded.source_review_json`).run(id,invoice.invoiceNumber,invoice.supplierTaxCode,invoice.invoiceDate,JSON.stringify(invoice),hash,user?.id || null,t,t,revision,JSON.stringify(review));
    db.prepare('UPDATE invoices SET evaluation_attempt_id=?,evaluation_deadline=?,evaluation_policy_json=? WHERE id=?').run(attemptId,deadline,JSON.stringify(policy),id);
    db.prepare('INSERT INTO invoice_revisions VALUES (?,?,?,?,?,?)').run(crypto.randomUUID(),id,revision,JSON.stringify(invoice),JSON.stringify(review),t);
    const confirmedSupplierName = confirmations.find(c => c.field === 'supplierName' && c.value === invoice.supplierName);
    const confirmedSupplierTaxCode = confirmations.find(c => c.field === 'supplierTaxCode' && c.value === invoice.supplierTaxCode);
    if (user && confirmedSupplierName && confirmedSupplierTaxCode) {
      recordConfirmedSupplierAlias({
        supplierName: invoice.supplierName,
        supplierTaxCode: invoice.supplierTaxCode,
        supplierAddress: invoice.supplierAddress,
        invoiceId: id,
        nameEvidence: confirmedSupplierName.evidence,
        taxCodeEvidence: confirmedSupplierTaxCode.evidence,
        verifiedBy: `${confirmedSupplierName.confirmedBy},${confirmedSupplierTaxCode.confirmedBy}`,
        confirmedAt: [confirmedSupplierName.confirmedAt, confirmedSupplierTaxCode.confirmedAt].sort().at(-1)
      });
    }
    if(source) db.prepare("UPDATE document_artifacts SET invoice_id=? WHERE id=? AND invoice_id LIKE 'pending:%'").run(id,invoice.sourceArtifactId);
    syncVoucher(readRecord(id)); recomputeMacro();
    recordAction(readRecord(id),user,'EVALUATION_STARTED','Tiếp nhận revision mới; khóa tự duyệt cho đến khi đánh giá xong.',initialSnapshot);
  })();
  try {
    const result=await queryJevReferee(unresolved.length ? {...invoice,isImageBlurry:true} : invoice,{forceLocalOnly:options.forceLocalOnly,useGenerativeQGen:process.env.QGEN_AI==='1' && !options.forceLocalOnly && !unresolved.length,customConfig:policy.config,policyVersion:policy.version,customSopVersion:policy.version,macroState:getMacroState()});
    let decision=result.decision;
    let fieldAsks:FieldAsk[]=[];
    if(unresolved.length && decision.status==='ESCALATED') {
      const names:Record<string,string>={invoiceNumber:'Số hóa đơn',invoiceDate:'Ngày lập',supplierTaxCode:'MST bên bán',supplierName:'Tên bên bán',itemName:'Nội dung hàng hóa',preTaxAmount:'Tiền trước thuế',taxRate:'Thuế suất',taxAmount:'Tiền thuế',totalAmount:'Tổng thanh toán',paymentMethod:'Thanh toán',hasBankSlip:'Chứng từ ngân hàng',hasItemManifest:'Bảng kê hàng hóa',sellerStatus:'Trạng thái bên bán'};
      const isMissing=(field:string)=>missing.includes(field as typeof missing[number]) || (field==='taxRate' && nonStandardTaxRate!==undefined);
      const details=unresolved.map(field=>`${fieldLabels[field] || names[field] || field}: ${isMissing(field)?'chưa có dữ liệu':sourceConflicts.includes(field)?'khác chứng từ gốc':'chưa xác minh'}`).join('; ');
      const threshold=paymentThreshold(invoice,policy.config);
      const missingSet=new Set<string>(missing);
      fieldAsks=unresolved.map(field=>fieldAsk(field,invoice,{missing:isMissing(field),nonCashThreshold:threshold,dailyTotal,rawTaxRate:field==='taxRate'?nonStandardTaxRate:undefined,sourceValue:sourceConflicts.includes(field)?sourceInvoice?.[field]:undefined,companyTaxCode:policy.config.companyTaxCode,missingFields:missingSet}));
      // Dữ kiện đã được hỏi trực tiếp thì không hỏi lại qua phát hiện "chưa rõ thông tin" dựa trên chính dữ kiện đó
      // (trả lời xong sẽ đánh giá lại toàn bộ quy tắc nên không mất cảnh báo).
      const engineFindings=decision.findings?.filter(f=>!['RULE_DATA_QUALITY','RULE_IMAGE_BLURRY'].includes(f.ruleId)
        && !(groupOf(f.ruleId,f.kind)==='UNCERTAIN_INFO' && taxonomyOf(f.ruleId,f.kind).triggerFields.some(field=>unresolved.includes(field)))) || [];
      const sourceOptions:[ActionOption,ActionOption]=[
        {id:'A',label:'Xác nhận các giá trị theo câu trả lời rồi đánh giá lại',actionDescription:'Ghi giá trị và nguồn cho từng trường; chạy lại mọi quy tắc.',resultingAction:'CONFIRM_CORRECTED_DATA'},
        {id:'B',label:'Chưa đủ chứng từ — yêu cầu bổ sung, chưa duyệt thuế',actionDescription:'Giữ hồ sơ chờ người nộp bổ sung; chưa duyệt thuế.',resultingAction:'REQUEST_INFORMATION'}];
      const sourceFinding={ruleId:'RULE_SOURCE_REVIEW',kind:'DATA_QUALITY' as const,severity:'HIGH' as const,riskGroup:'UNCERTAIN_INFO' as const,flaggedReason:`Cần xác nhận ${unresolved.length} dữ kiện trước khi kết luận (${details}).`,
        plainExplanation:'Một số dữ kiện cần cho quy tắc chưa có, chưa được xác minh hoặc khác chứng từ gốc. Hệ thống không đoán và chưa duyệt thuế cho đến khi người có thẩm quyền xác nhận.',legalBasis:'Quy trình kiểm soát dữ liệu đầu vào',sopClause:'Dữ liệu đầu vào',actionableQuestion:'Xác nhận từng dữ kiện bên dưới.',options:sourceOptions};
      // Không kết luận "vi phạm"/"vượt quyền" dựa trên dữ kiện chưa xác minh: nhóm chính tính theo bảng phân loại.
      const ordered=orderFindings([sourceFinding,...engineFindings],unresolved);
      const primary=ordered[0];
      const primaryOptions=(primary.options?.length===2?primary.options:sourceOptions) as [ActionOption,ActionOption];
      decision={...decision,riskGroup:groupOf(primary.ruleId,primary.kind),riskGroups:riskGroupsOf(ordered,unresolved),flaggedReason:ordered.map(f=>f.flaggedReason).join(' '),actionableQuestion:primary.actionableQuestion || sourceFinding.flaggedReason,
        options:primaryOptions,plainExplanation:primary.plainExplanation,sopClause:primary.sopClause || decision.sopClause,findings:ordered};
    }
    // Mức sàn thẩm quyền: câu hỏi chuyển tiếp gửi CFO (người nhận khớp checkHandoff).
    if(floorHold && decision.status==='ESCALATED' && !decision.requiresCFO) decision={...decision,requiresCFO:true};
    if(decision.status==='ESCALATED'){
      const groundedQuestion=!unresolved.length && decision.handoff?.questionSource==='AI_GROUNDED'?decision.actionableQuestion:undefined;
      decision={...decision,findings:decision.findings?.map(f=>describeRuleEvidence(f,invoice.invoiceDate))};
      const primary=decision.findings?.[0];
      decision=buildHandoff(invoice,{...decision,sopClause:primary?.sopClause || decision.sopClause},{policyHash:policy.contentHash || hashPayload(policy),unresolvedFields:unresolved,missingFields:[...missing],confirmations,fieldAsks});
      if(groundedQuestion){decision={...decision,actionableQuestion:groundedQuestion,handoff:{...decision.handoff!,question:groundedQuestion,questionSource:'AI_GROUNDED'}};}
      decision.handoff!.automatedCheck=checkHandoff(decision);
      if(!decision.handoff!.automatedCheck.valid)throw new WorkflowError('Cấu trúc chuyển tiếp không đủ dữ kiện; giữ hồ sơ để kiểm tra.',500);
    }
    RefereeDecisionSchema.parse(decision);
    const evaluationId=crypto.randomUUID();
    db.transaction(()=>{
      const current=readRecord(id);
      if(current.revision!==revision || current.status!=='EVALUATING' || current.evaluation_attempt_id!==attemptId) throw new WorkflowError('Hồ sơ đã dừng hoặc thay đổi; kết quả AI không được ghi nhận.');
      const before=snapshot(current);
      if(current.tax_hold) throw new WorkflowError('Cần giải phóng giữ thuế trước khi ghi kết quả.');
      // Công tắc dừng toàn hệ thống: ca thường quy không được tự duyệt, chờ Kế toán trưởng duyệt tay.
      const held=decision.status==='ROUTINE' && isAutomationPaused();
      const floorHeld=decision.status==='ROUTINE' && floorHold && !held;
      const autoApprove=decision.status==='ROUTINE' && !held && !floorHeld;
      const status=autoApprove ? 'APPROVED' : (decision.status==='ESCALATED' && decision.requiresCFO) || floorHeld ? 'WAITING_CFO' : 'WAITING_CHIEF_ACCOUNTANT';
      db.prepare('INSERT INTO evaluations (id,invoice_id,decision_json,policy_version,legal_version,created_at) VALUES (?,?,?,?,?,?)').run(evaluationId,id,JSON.stringify(decision),policy.version,decision.applicableRegulations?.join(',') || null,jsonNow());
      db.prepare('UPDATE invoices SET status=?,approved_deductible_tax=?,updated_at=?,evaluation_deadline=NULL WHERE id=?').run(status,autoApprove && decision.status==='ROUTINE' ? decision.approvedTaxAmount : 0,jsonNow(),id);
      const row=readRecord(id);syncVoucher(row);recomputeMacro();
      recordAction(row,null,autoApprove?'ROUTINE_AUTO_APPROVED':held?'ROUTINE_HELD_AUTOMATION_PAUSED':floorHeld?'ROUTINE_HELD_AUTHORITY_FLOOR':'INVOICE_EVALUATED',held?`Tự động hóa đang dừng toàn hệ thống: ca thường quy chờ Kế toán trưởng duyệt tay. ${decision.plainExplanation}`:floorHeld?`Hồ sơ từng cần CFO duyệt; dữ liệu được sửa bởi ${user?.role==='CHIEF_ACCOUNTANT'?'Kế toán trưởng':user?'Kế toán viên':'hệ thống'} nên thẩm quyền không hạ theo số tiền mới — chờ CFO duyệt. ${decision.plainExplanation}`:decision.plainExplanation,before,floorHeld?{triggeredBy:user?.id ?? null,triggeredByRole:user?.role ?? null,authorityFloor:'CFO'}:{});
      // Hậu kiểm ngẫu nhiên: một tỉ lệ ca tự duyệt được đưa vào danh sách để Kế toán trưởng xem lại (không làm chậm luồng duyệt).
      if(autoApprove){const strat=stratifiedRate(policy.config.postAuditRate ?? DEFAULT_POST_AUDIT_RATE,invoice.totalAmount,[paymentThreshold(invoice,policy.config),policy.config.sellerStatusMaterialityVnd ?? 20_000_000,policy.config.kttApprovalLimit]);samplePostAudit({id,content_hash:row.content_hash,evaluation_id:evaluationId},strat.rate,false,strat.nearThreshold);}
      // Cụm tiền mặt cùng ngày vượt ngưỡng: hóa đơn tiền mặt cùng bên bán đã tự duyệt trước đó cũng mất điều kiện khấu trừ → giữ thuế cả cụm.
      // Không phụ thuộc thứ tự đến: hóa đơn này trả chuyển khoản vẫn làm cụm (mỗi tờ dưới ngưỡng) vượt ngưỡng, nên các hóa đơn TIỀN MẶT
      // đã tự duyệt trong cụm phải giữ thuế (khoản 3 Điều 26 NĐ 181/2025).
      const cashThreshold=paymentThreshold(invoice,policy.config);
      const clusterOverThreshold=!invoice.isAdjustment && Math.abs(invoice.totalAmount)<cashThreshold && sameDayPurchaseTotal(invoice,undefined,cashThreshold)>=cashThreshold;
      if((clusterOverThreshold || (decision.status==='ESCALATED' && decision.findings?.some((f:{ruleId:string})=>f.ruleId==='STATUTORY_SAME_DAY_CASH_5M'))) && holdLinkedCashInvoices(row,invoice).length) recomputeMacro();
    })();
    const row=readRecord(id);
    return {...result,decision,workflow:{status:row.status,revision,evaluationId,autoApproved:row.status==='APPROVED',externalSync:'MANUAL',internalVoucherId:(db.prepare('SELECT id FROM internal_vouchers WHERE invoice_id=?').get(id) as {id:string}|undefined)?.id || null},policy};
  } catch(error) {
    db.transaction(()=>{const row=readRecord(id);if(row.status==='EVALUATING' && row.revision===revision){const before=snapshot(row);db.prepare("UPDATE invoices SET status='ON_HOLD', updated_at=? WHERE id=?").run(jsonNow(),id);recordAction(row,null,'EVALUATION_FAILED','Không có kết quả chắc chắn; giữ hồ sơ để thử lại.',before);}})();
    throw error;
  }
}
/** Bật lại tự động hóa: các ca thường quy bị giữ trong lúc dừng được hoàn tất theo SOP, mỗi ca một sự kiện audit. */
export function releaseHeldRoutineCases(user: AppUser): number {
  const db=getDatabase();
  const ids=(db.prepare("SELECT i.id FROM invoices i JOIN evaluations e ON e.id=(SELECT id FROM evaluations WHERE invoice_id=i.id ORDER BY rowid DESC LIMIT 1) WHERE i.status='WAITING_CHIEF_ACCOUNTANT' AND i.tax_hold=0 AND json_extract(e.decision_json,'$.status')='ROUTINE'").all() as {id:string}[]).map(r=>r.id);
  if(!ids.length)return 0;
  const policy=getActivePolicy();
  return db.transaction(()=>{
    let released=0;
    for(const id of ids){
      const row=readRecord(id),before=snapshot(row),d=RefereeDecisionSchema.parse(JSON.parse(row.decision_json!));
      if(d.status!=='ROUTINE')continue;
      // Bật lại nghĩa là KIỂM LẠI: nếu đội dừng tự động hóa vì policy sai rồi sửa policy, ca đang giữ phải chạy lại theo policy hiện hành
      // trước khi duyệt — không duyệt bằng quyết định cũ.
      const recheck=evaluateInvoiceLocally(InvoiceInputSchema.parse(JSON.parse(row.payload_json)),policy.config,policy.version);
      if(recheck.status!=='ROUTINE'){recordAction(row,user,'ROUTINE_RECHECK_FAILED_AFTER_RESUME',`Bật lại tự động hóa: kiểm lại theo policy ${policy.version} thì không còn là ca thường quy — giữ chờ Kế toán trưởng.`,before);continue;}
      released++;
      db.prepare("UPDATE invoices SET status='APPROVED',approved_deductible_tax=?,revision=revision+1,updated_at=? WHERE id=?").run(d.approvedTaxAmount,jsonNow(),id);
      syncVoucher(readRecord(id));
      recordAction(row,user,'ROUTINE_RELEASED_AFTER_RESUME',`Bật lại tự động hóa: kiểm lại theo policy ${policy.version} vẫn là ca thường quy — hoàn tất theo SOP.`,before);
    }
    recomputeMacro();
    return released;
  })();
}

const AnswerInputSchema=z.object({answers:z.record(z.enum(['A','B'])),values:z.record(z.unknown()).optional(),reason:z.string().trim().min(8,'Ghi lý do/bằng chứng ít nhất 8 ký tự.'),revision:z.number().int(),evaluationId:z.string().min(1)});
/**
 * Áp dụng câu trả lời "1A, 2B" cho câu hỏi chuyển tiếp có cấu trúc (handoff.questionSpec): mỗi đáp án mang hệ quả
 * (gán/xác nhận giá trị, chấp nhận phát hiện, yêu cầu bổ sung, từ chối). Có REJECT → từ chối; có yêu cầu bổ sung → giữ hồ sơ;
 * còn lại: cập nhật dữ kiện, đánh giá lại toàn bộ quy tắc, rồi duyệt nếu mọi phát hiện còn mở đều đã được chấp nhận trong câu trả lời.
 */
export async function answerHandoff(id: string, user: AppUser, raw: unknown) {
  if(user.role==='ACCOUNTANT') throw new WorkflowError('Cần Kế toán trưởng hoặc CFO trả lời câu hỏi chuyển tiếp.',403);
  const input=AnswerInputSchema.parse(raw);
  const row=readRecord(id); assertCurrent(row,input.evaluationId,input.revision);
  if(!['WAITING_CHIEF_ACCOUNTANT','WAITING_CFO','FORWARDED'].includes(row.status)) throw new WorkflowError('Hồ sơ không còn chờ trả lời.');
  const decision=RefereeDecisionSchema.parse(JSON.parse(row.decision_json!));
  if(decision.status!=='ESCALATED') throw new WorkflowError('Hồ sơ không có câu hỏi chuyển tiếp.');
  if((decision.requiresCFO || row.status==='FORWARDED') && user.role!=='CFO') throw new WorkflowError('Hồ sơ cần CFO trả lời.',403);
  if(row.created_by_user_id===user.id) throw new WorkflowError('Người nhập hồ sơ không được tự trả lời và duyệt.',403);
  if(senderConfirmedBy(id)===user.id) throw new WorkflowError('Người xác nhận người gửi của hóa đơn này không được tự trả lời và duyệt (bất kiêm nhiệm).',403);
  const items=decision.handoff?.questionSpec?.items || [];
  if(!items.length || items.some(item=>!item.effects)) throw new WorkflowError('Câu hỏi này chưa hỗ trợ trả lời trực tiếp; dùng phương án A/B.',409);
  const chosen=items.map(item=>{
    const answer=input.answers[String(item.n)];
    if(!answer) throw new WorkflowError(`Chưa trả lời ý ${item.n}.`,400);
    const index=answer==='A'?0:1;
    return {n:item.n,answer,label:item.answers[index],effect:item.effects![index]};
  });
  const reply=chosen.map(c=>`${c.n}${c.answer}`).join(', ');
  const evidence=(c:typeof chosen[number])=>`Trả lời câu hỏi chuyển tiếp ý ${c.n}: ${c.label}. ${input.reason}`.slice(0,1000);
  // Kiểm tra toàn bộ câu trả lời trước khi thao tác: câu trả lời thiếu giá trị không được để lại dấu "đã trả lời" trong nhật ký.
  const updates:Record<string,unknown>={};const confirmations=new Map<string,SourceConfirmation>();
  const confirm=(field:string,c:typeof chosen[number])=>{if(field in InvoiceInputSchema.shape)confirmations.set(field,{field,evidence:evidence(c)});};
  for(const c of chosen){
    const e=c.effect;
    if(e.kind==='SET_FIELDS'){Object.assign(updates,e.values);for(const field of [...Object.keys(e.values),...(e.confirm||[])])confirm(field,c);}
    else if(e.kind==='CONFIRM_FIELDS'){for(const field of e.fields)confirm(field,c);}
    else if(e.kind==='NEED_VALUE'){
      const value=coerceFieldValue(e.field,input.values?.[e.field]);
      if(value===undefined || value===null || value==='') throw new WorkflowError(`Ý ${c.n}: cần nhập ${fieldLabels[e.field] || e.field}.`,400);
      updates[e.field]=value;confirm(e.field,c);
    }
  }
  const accepted=chosen.flatMap(c=>c.effect.kind==='RESOLVE'?[c.effect.ruleId]:[]);
  const finish=(result:{status?:string;revision?:number},outcome:string,consequence?:string[])=>{
    appendAuditEvent({eventType:'HANDOFF_ANSWERED',entityId:id,actorId:user.id,payload:{actorRole:user.role,actorName:user.displayName,revision:row.revision,evaluationId:row.evaluation_id,policyVersion:getActivePolicy().version,reply,answers:chosen,reason:input.reason,outcome,resultingStatus:result.status,consequence}});
    return {...result,reply,outcome};
  };
  const current={revision:row.revision,evaluationId:row.evaluation_id};
  const reject=chosen.find(c=>c.effect.kind==='REJECT');
  if(reject) return finish(applyWorkflowAction(id,user,{action:'OVERRIDE',targetStatus:'REJECTED',reason:`Trả lời ${reply} — ${reject.label}. ${input.reason}`,...current}),'REJECTED');
  const request=chosen.find(c=>c.effect.kind==='REQUEST_INFO');
  if(request) return finish(applyWorkflowAction(id,user,{action:'OVERRIDE',targetStatus:'ON_HOLD',reason:`Trả lời ${reply} — ${request.label}. ${input.reason}`,...current}),'ON_HOLD');
  if(Object.keys(updates).length || confirmations.size){
    const result=await evaluateWorkflow({...JSON.parse(row.payload_json),...updates},user,{forceLocalOnly:true,expectedRevision:row.revision,confirmations:[...confirmations.values()]});
    const next=readRecord(id);
    const open=(result.decision.status==='ESCALATED' ? result.decision.findings || [] : []) as Array<{ruleId:string;kind:RuleKind;severity:string;description?:string}>;
    if(open.length && accepted.length && open.every(f=>accepted.includes(f.ruleId)))
      return finish(applyWorkflowAction(id,user,{action:'OVERRIDE',targetStatus:'APPROVED',reason:`Trả lời ${reply}. ${input.reason}`,revision:next.revision,evaluationId:next.evaluation_id,resolvedFindingIds:accepted}),'APPROVED');
    // Đáp án đã nêu hệ quả (VD "Tiền mặt → không được khấu trừ"): phát hiện do chính dữ kiện vừa trả lời gây ra thì kết thúc theo hệ quả đó,
    // không hỏi lại. Vi phạm điều kiện khấu trừ → từ chối khấu trừ; thiếu chứng từ/bên bán tạm ngừng → treo hồ sơ chờ bổ sung.
    const changed=new Set(Object.keys(updates));
    const consequence=open.filter(f=>!accepted.includes(f.ruleId) && taxonomyOf(f.ruleId,f.kind).triggerFields.some(field=>changed.has(field)));
    if(consequence.length && hasNonAcceptableFinding(consequence)){
      const violation=consequence.some(f=>groupOf(f.ruleId,f.kind)==='OUT_OF_POLICY');
      const ruleIds=consequence.map(f=>f.ruleId);
      return finish(applyWorkflowAction(id,user,{action:'OVERRIDE',targetStatus:violation?'REJECTED':'ON_HOLD',reason:`Trả lời ${reply} → ${violation?'không đủ điều kiện khấu trừ':'chưa khấu trừ, chờ bổ sung'} (${ruleIds.join(', ')}). ${input.reason}`,revision:next.revision,evaluationId:next.evaluation_id}),violation?'REJECTED':'ON_HOLD',ruleIds);
    }
    return finish({status:next.status,revision:next.revision},result.decision.status==='ROUTINE'?'RE_EVALUATED_ROUTINE':'RE_EVALUATED_ESCALATED');
  }
  if(accepted.length) return finish(applyWorkflowAction(id,user,{action:'OVERRIDE',targetStatus:'APPROVED',reason:`Trả lời ${reply}. ${input.reason}`,...current,resolvedFindingIds:accepted}),'APPROVED');
  throw new WorkflowError('Câu trả lời không tạo thay đổi nào.',400);
}

/** Giữ thuế các hóa đơn tiền mặt cùng bên bán, cùng ngày đã tự duyệt khi cả cụm vượt ngưỡng thanh toán không dùng tiền mặt. */
function holdLinkedCashInvoices(current: WorkflowRecord, invoice: InvoiceInput): string[] {
  const db=getDatabase();
  const rows=db.prepare("SELECT id FROM invoices WHERE supplier_tax_code=? AND invoice_date=? AND id!=? AND status='APPROVED' AND tax_hold=0").all(invoice.supplierTaxCode,invoice.invoiceDate,current.id) as {id:string}[];
  const held:string[]=[];
  for(const {id} of rows){
    const linked=readRecord(id); const payload=JSON.parse(linked.payload_json) as InvoiceInput;
    if(payload.paymentMethod!=='CASH' || payload.isAdjustment) continue;
    const before=snapshot(linked);
    db.prepare("UPDATE invoices SET tax_hold=1,status='ON_HOLD',approved_deductible_tax=0,revision=revision+1,updated_at=? WHERE id=?").run(jsonNow(),id);
    syncVoucher(readRecord(id));
    recordAction(linked,null,'LINKED_CASH_HOLD',`Cộng các hóa đơn tiền mặt cùng bên bán ngày ${invoice.invoiceDate} (gồm hóa đơn ${invoice.invoiceNumber}) vượt ngưỡng thanh toán không dùng tiền mặt: giữ thuế hóa đơn này để Kế toán trưởng xem lại cả cụm.`,before,{linkedInvoiceId:current.id});
    held.push(id);
  }
  return held;
}

const PostAuditInputSchema=z.object({result:z.enum(['CONFIRMED','DISAGREE']),reason:z.string().trim().min(8,'Ghi lý do ít nhất 8 ký tự.')});
/** Hậu kiểm một ca tự duyệt: KTT/CFO (không phải người nhập) đồng ý hoặc không đồng ý; không đồng ý thì giữ thuế để xem lại. */
export function reviewPostAudit(id: string, user: AppUser, raw: unknown) {
  if(user.role==='ACCOUNTANT') throw new WorkflowError('Cần Kế toán trưởng hoặc CFO hậu kiểm.',403);
  const input=PostAuditInputSchema.parse(raw);
  const row=readRecord(id);
  const current=postAuditStatus(id);
  if(!current) throw new WorkflowError('Hồ sơ không thuộc mẫu hậu kiểm.',404);
  if(current.status!=='PENDING') throw new WorkflowError('Hồ sơ đã được hậu kiểm.',409);
  if(row.created_by_user_id===user.id) throw new WorkflowError('Người nhập hồ sơ không được tự hậu kiểm.',403);
  recordPostAuditReview(id,user,input.result,input.reason);
  if(input.result==='DISAGREE' && row.status==='APPROVED')
    return {...applyWorkflowAction(id,user,{action:'TAX_HOLD',reason:`Hậu kiểm không đồng ý với quyết định tự duyệt: ${input.reason}`,revision:row.revision,evaluationId:row.evaluation_id}),result:input.result};
  return {ok:true,status:row.status,result:input.result};
}

const WORKFLOW_ACTIONS=['PAUSE','RESUME','TAX_HOLD','RELEASE_TAX_HOLD','UNDO','RESOLVE','OVERRIDE'] as const;
export function applyWorkflowAction(id: string, user: AppUser, input: {action:string;reason:string;evaluationId?:string|null;revision:number;optionId?:string;targetStatus?:string;resolvedFindingIds?:string[]}) {
  if(user.role==='ACCOUNTANT') throw new WorkflowError('Cần Kế toán trưởng hoặc CFO.',403);
  if(input.reason.trim().length<8) throw new WorkflowError('Ghi lý do ít nhất 8 ký tự.',400);
  // Tên sự kiện audit không do client đặt: chỉ nhận các thao tác đã biết (không giả được "Tự xử lý thường quy" hay "Hoàn tác").
  if(!WORKFLOW_ACTIONS.includes(input.action as typeof WORKFLOW_ACTIONS[number])) throw new WorkflowError('Thao tác không hợp lệ.',400);
  const db=getDatabase();
  return db.transaction(()=>{
    const row=readRecord(id); assertCurrent(row,input.evaluationId,input.revision);const before=snapshot(row);
    let eventType=input.action;
    if(input.action==='PAUSE') {
      if(row.status==='PAUSED') throw new WorkflowError('Hồ sơ đã dừng.');
      db.prepare("UPDATE invoices SET paused_from=status,status='PAUSED',approved_deductible_tax=0 WHERE id=?").run(id);
    } else if(input.action==='RESUME') {
      if(row.status!=='PAUSED') throw new WorkflowError('Hồ sơ chưa dừng.');
      // Resume never revives a discarded/in-flight AI result or stale approval; a case that was only waiting for an answer goes back to waiting.
      const restore=['WAITING_CHIEF_ACCOUNTANT','WAITING_CFO','FORWARDED'].includes(row.paused_from || '') && row.decision_json ? row.paused_from : 'ON_HOLD';
      db.prepare("UPDATE invoices SET status=?,paused_from=NULL,approved_deductible_tax=0 WHERE id=?").run(restore,id);
    } else if(input.action==='TAX_HOLD') {
      db.prepare("UPDATE invoices SET tax_hold=1,status='ON_HOLD',approved_deductible_tax=0 WHERE id=?").run(id);
    } else if(input.action==='RELEASE_TAX_HOLD') {
      const lastHold=db.prepare("SELECT payload_json FROM audit_events WHERE entity_id=? AND event_type='TAX_HOLD' ORDER BY rowid DESC LIMIT 1").get(id) as {payload_json:string}|undefined;
      if(lastHold && JSON.parse(lastHold.payload_json).actorRole==='CFO' && user.role!=='CFO') throw new WorkflowError('Lệnh giữ thuế do CFO đặt; chỉ CFO được gỡ.',403);
      db.prepare("UPDATE invoices SET tax_hold=0,status='ON_HOLD',approved_deductible_tax=0 WHERE id=?").run(id);
    } else if(input.action==='UNDO') {
      const latest=undoCandidate(row,user);
      if(!latest) throw new WorkflowError('Không có thao tác an toàn để hoàn tác.');
      const payload=latest.payload;
      const saved=payload.before;
      db.prepare('UPDATE invoices SET status=?,approved_deductible_tax=?,tax_hold=?,paused_from=? WHERE id=?').run(saved.status==='EVALUATING'?'ON_HOLD':saved.status,saved.approvedTax,saved.taxHold,saved.pausedFrom,id);
      db.prepare("UPDATE corporate_precedents SET status='REVOKED' WHERE id IN (SELECT precedent_id FROM precedent_scopes WHERE origin_event_id=?)").run(latest.id);
      db.prepare('UPDATE invoices SET revision=revision+1,updated_at=? WHERE id=?').run(jsonNow(),id);
      syncVoucher(readRecord(id));recomputeMacro();
      const event=recordAction(row,user,'INVOICE_ACTION_REVERTED',input.reason,before,{reversesEventId:latest.id});
      return {ok:true,status:readRecord(id).status,revision:readRecord(id).revision,auditEventId:event.id};
    } else {
      if(['APPROVED','REJECTED','PAUSED','EVALUATING'].includes(row.status)) throw new WorkflowError('Hồ sơ không còn chờ xử lý.');
      let target=input.targetStatus;
      if(input.action==='RESOLVE') {
        const d=RefereeDecisionSchema.parse(JSON.parse(row.decision_json!));
        if(d.status!=='ESCALATED') throw new WorkflowError('Hồ sơ không phải ngoại lệ.');
        if((d.requiresCFO || row.status==='FORWARDED') && user.role!=='CFO') throw new WorkflowError('Cần CFO.',403);
        const option=d.options.find(o=>o.id===input.optionId);if(!option) throw new WorkflowError('Phương án không hợp lệ.',400);
        target=['ACCEPT_WITH_DOCS','ACCEPT_ADJUSTMENT','ACCEPT_WITH_DEFENSE_DOSSIER'].includes(option.resultingAction)?'APPROVED':option.resultingAction==='FORWARD_TO_CFO'?'FORWARDED':option.resultingAction==='REJECT_TAX_DEDUCTION'?'REJECTED':'ON_HOLD';
        db.prepare('INSERT INTO human_resolutions (id,invoice_id,evaluation_id,actor_id,actor_role,option_id,resulting_action,reason,accepted,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),id,row.evaluation_id,user.id,user.role,option.id,option.resultingAction,input.reason,target==='APPROVED'?1:0,jsonNow());
        eventType='HUMAN_RESOLUTION_RECORDED';
      }
      if(!target || !['APPROVED','ON_HOLD','REJECTED','FORWARDED'].includes(target)) throw new WorkflowError('Trạng thái không hợp lệ.',400);
      // Ca cần CFO: Kế toán trưởng chỉ được giữ hồ sơ/chuyển CFO, không được tự duyệt hay từ chối thay CFO.
      if(input.action==='OVERRIDE' && ['APPROVED','REJECTED'].includes(target) && user.role!=='CFO' && row.decision_json){
        const d=JSON.parse(row.decision_json);
        if((d.status==='ESCALATED' && d.requiresCFO) || ['FORWARDED','WAITING_CFO'].includes(row.status)) throw new WorkflowError('Hồ sơ cần CFO quyết định.',403);
      }
      // Chỉ duyệt khi hồ sơ đang chờ quyết định của lượt đánh giá hiện hành: không duyệt một revision chưa từng được engine đánh giá.
      if(target==='APPROVED' && !['WAITING_CHIEF_ACCOUNTANT','WAITING_CFO','FORWARDED'].includes(row.status)) throw new WorkflowError('Chỉ duyệt hồ sơ đang chờ quyết định của lượt đánh giá hiện hành; hãy đánh giá lại hồ sơ.',409);
      if(target==='APPROVED') {const block=approvalBlock(row,user);if(block) throw new WorkflowError(block,403);const d=JSON.parse(row.decision_json!);if(d.status==='ESCALATED' && d.findings?.some((f:{ruleId:string})=>!input.resolvedFindingIds?.includes(f.ruleId)))throw new WorkflowError('Cần xác nhận giải quyết từng phát hiện còn mở trước khi duyệt.',400);}
      const invoice=JSON.parse(row.payload_json);
      db.prepare('UPDATE invoices SET status=?,approved_deductible_tax=? WHERE id=?').run(target,target==='APPROVED'?invoice.taxAmount:0,id);
    }
    db.prepare('UPDATE invoices SET revision=revision+1,updated_at=? WHERE id=?').run(jsonNow(),id);
    syncVoucher(readRecord(id));recomputeMacro();
    const event=recordAction(row,user,eventType,input.reason,before);
    return {ok:true,status:readRecord(id).status,revision:readRecord(id).revision,auditEventId:event.id,macroState:getMacroState()};
  })();
}

/** Attach bank evidence without reviving an old evaluation or an in-flight AI result. */
export function recordBankEvidence(id: string, transactionId: string, user: AppUser) {
  const db = getDatabase();
  return db.transaction(() => {
    const row = readRecord(id);
    const invoice = InvoiceInputSchema.parse(JSON.parse(row.payload_json));
    if (invoice.hasBankSlip === true && invoice.bankReference === transactionId) return false;
    const before = snapshot(row);
    const next = { ...invoice, hasBankSlip: true, bankReference: transactionId };
    const review = { ...JSON.parse(row.source_review_json || '{}'), needsReevaluation: true,
      bankEvidence: { transactionId, actorId: user.id, recordedAt: jsonNow() } };
    const revision = row.revision + 1;
    db.prepare(`UPDATE invoices SET payload_json=?,source_review_json=?,content_hash=?,revision=?,
      status=?,approved_deductible_tax=0,updated_at=? WHERE id=?`).run(JSON.stringify(next),JSON.stringify(review),
        hashPayload({invoice:next,review}),revision,row.status==='PAUSED'?'PAUSED':'ON_HOLD',jsonNow(),id);
    db.prepare('INSERT INTO invoice_revisions VALUES (?,?,?,?,?,?)').run(crypto.randomUUID(),id,revision,JSON.stringify(next),JSON.stringify(review),jsonNow());
    syncVoucher(readRecord(id)); recomputeMacro();
    recordAction(row,user,'BANK_EVIDENCE_RECORDED','Bổ sung bằng chứng ngân hàng; cần đánh giá lại toàn bộ hồ sơ.',before,{transactionId});
    return true;
  })();
}
