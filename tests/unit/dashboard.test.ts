import assert from 'node:assert/strict';
import { test } from 'node:test';
import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import { DashboardSummary, DashboardSummarySchema } from '../../lib/dashboard';
import { getActivePolicy, getDatabase, jsonNow, runIsolated, withDemoDatabase } from '../../lib/server/db';
import { AppRole, switchRole } from '../../lib/server/auth';
import { appendAuditEvent } from '../../lib/server/audit';
import { readDashboardSummary } from '../../services/dashboardService';
import { applyWorkflowAction, evaluateWorkflow, readRecord, releaseHeldRoutineCases } from '../../services/workflowService';
import { setAutomationPaused } from '../../services/automationControl';
import { challengeCases, demoCompanyTaxCode } from '../../data/verification/challengeCases';
import { GET as dashboardGET } from '../../app/api/dashboard/route';

function seedInvoice(id: string, status: string, taxHold = 0): void {
  getDatabase().prepare(`INSERT INTO invoices
    (id,invoice_number,supplier_tax_code,invoice_date,payload_json,content_hash,status,approved_deductible_tax,tax_hold,created_at,updated_at)
    VALUES (?,?,?,'2026-10-17','{}',?,?,?, ?,?,?)`)
    .run(id, id, '0100000001', `synthetic-${id}`, status, status === 'APPROVED' ? 1000 : 0, taxHold, jsonNow(), jsonNow());
}

function configureWorkflow(): void {
  const policy = getActivePolicy();
  policy.config.companyTaxCode = demoCompanyTaxCode;
  policy.config.postAuditRate = 0;
  getDatabase().prepare('UPDATE policy_versions SET payload_json=? WHERE version=?').run(JSON.stringify(policy), policy.version);
}

async function addRoutine(id: string): Promise<void> {
  await evaluateWorkflow({...challengeCases[0].invoice, id, invoiceNumber: id}, switchRole('ACCOUNTANT')!.user, {forceLocalOnly: true});
}

function decide(id: string, role: 'CHIEF_ACCOUNTANT' | 'CFO', action: 'UNDO' | 'TAX_HOLD' | 'OVERRIDE'): void {
  const row = readRecord(id);
  applyWorkflowAction(id, switchRole(role)!.user, {
    action, reason: 'Kiểm thử nguồn phê duyệt hiện hành', revision: row.revision, evaluationId: row.evaluation_id,
    ...(action === 'OVERRIDE' ? {targetStatus: 'APPROVED'} : {})
  });
}

async function requestDashboard(role?: AppRole): Promise<Response> {
  const token = role ? switchRole(role)!.token : undefined;
  return dashboardGET(new NextRequest('http://localhost/api/dashboard', {
    headers: token ? {cookie: `tax_referee_session=${token}`} : {}
  }));
}

function assertApprovals(summary: DashboardSummary, automatic: number, human: number, unknown = 0): void {
  assert.equal(summary.approvals.automatic, automatic);
  assert.equal(summary.approvals.human, human);
  assert.equal(summary.approvals.unknown, unknown);
  assert.equal(summary.approvals.total, automatic + human + unknown);
}

test('tổng quan rỗng không bịa tỷ lệ tự động hóa hoặc số thuế', async () => {
  await runIsolated(async () => {
    const summary = readDashboardSummary();
    assert.equal(summary.scope, 'CURRENT_DATABASE');
    assert.equal(summary.totalInvoices, 0);
    assert.equal(summary.approvals.automationRate, null);
    assert.equal(summary.approvedDeductibleTax, 0);
    assert.equal(summary.pending.total, 0);
    assertApprovals(summary, 0, 0);
  });
});

test('tổng quan đếm toàn DB trên 200 hồ sơ, chia đủ trạng thái và thuế hiện hành', async () => {
  await runIsolated(async () => {
    getDatabase().transaction(() => {
      for (let index = 0; index < 205; index++) seedInvoice(`APP-${index}`, 'APPROVED');
      seedInvoice('KTT', 'WAITING_CHIEF_ACCOUNTANT');
      seedInvoice('CFO', 'WAITING_CFO');
      seedInvoice('FORWARD', 'FORWARDED');
      seedInvoice('HOLD', 'ON_HOLD', 1);
      seedInvoice('PAUSE', 'PAUSED');
      seedInvoice('RUNNING', 'EVALUATING');
      seedInvoice('NEW', 'RECEIVED');
      seedInvoice('REJECT', 'REJECTED');
    })();
    const summary = readDashboardSummary();
    assert.equal(summary.totalInvoices, 213);
    assertApprovals(summary, 0, 0, 205);
    assert.equal(summary.approvedDeductibleTax, 205000);
    assert.equal(summary.rejected, 1);
    assert.equal(summary.taxHeld, 1);
    assert.deepEqual(summary.pending, {total: 7, chiefAccountant: 1, cfo: 2, onHold: 1, evaluating: 1, received: 1, paused: 1});
    assert.equal(Object.values(summary.statusCounts).reduce((sum, value) => sum + value, 0), 213);
  });
});

test('ROUTINE duyệt tay phân biệt KTT/CFO, hoàn tác/duyệt lại và đánh giá revision mới', async () => {
  await runIsolated(async () => {
    configureWorkflow();
    await addRoutine('AUTO');
    const chief = switchRole('CHIEF_ACCOUNTANT')!.user;
    setAutomationPaused(true, chief, 'Dừng để kiểm thử duyệt tay');
    await addRoutine('MANUAL-CHIEF');
    await addRoutine('MANUAL-CFO');
    decide('MANUAL-CHIEF', 'CHIEF_ACCOUNTANT', 'OVERRIDE');
    decide('MANUAL-CFO', 'CFO', 'OVERRIDE');
    const manual = readRecord('MANUAL-CHIEF');
    assert.equal(JSON.parse(manual.decision_json!).status, 'ROUTINE');
    let summary = readDashboardSummary();
    assertApprovals(summary, 1, 2);
    assert.deepEqual(summary.approvals.byRole, {CHIEF_ACCOUNTANT: 1, CFO: 1});
    assert.equal(summary.approvals.automationRate, 1 / 3);
    decide('MANUAL-CHIEF', 'CHIEF_ACCOUNTANT', 'UNDO');
    summary = readDashboardSummary();
    assertApprovals(summary, 1, 1);
    assert.equal(summary.pending.chiefAccountant, 1);
    decide('MANUAL-CHIEF', 'CFO', 'OVERRIDE');
    summary = readDashboardSummary();
    assertApprovals(summary, 1, 2);
    assert.deepEqual(summary.approvals.byRole, {CHIEF_ACCOUNTANT: 0, CFO: 2});
    setAutomationPaused(false, chief, 'Bật lại để đánh giá revision mới');
    const previous = readRecord('MANUAL-CHIEF');
    await evaluateWorkflow({...challengeCases[0].invoice, id: previous.id, invoiceNumber: previous.id,
      preTaxAmount: 2000000, taxAmount: 200000, totalAmount: 2200000}, switchRole('CFO')!.user,
    {forceLocalOnly: true, expectedRevision: previous.revision});
    summary = readDashboardSummary();
    assertApprovals(summary, 2, 1);
    assert.equal(summary.totalInvoices, 3, 'đánh giá lại không đếm thêm hóa đơn hoặc giữ nguồn phê duyệt cũ');
  });
});

test('giữ thuế loại hồ sơ tự duyệt khỏi tổng; hoàn tác giữ thuế khôi phục đúng nguồn tự động', async () => {
  await runIsolated(async () => {
    configureWorkflow();
    await addRoutine('AUTO-HOLD');
    const tax = readDashboardSummary().approvedDeductibleTax;
    assert.ok(tax > 0);
    decide('AUTO-HOLD', 'CFO', 'TAX_HOLD');
    assertApprovals(readDashboardSummary(), 0, 0);
    assert.equal(readDashboardSummary().approvedDeductibleTax, 0);
    assert.equal(readDashboardSummary().taxHeld, 1);
    decide('AUTO-HOLD', 'CFO', 'UNDO');
    const summary = readDashboardSummary();
    assertApprovals(summary, 1, 0);
    assert.equal(summary.approvedDeductibleTax, tax);
    assert.equal(summary.taxHeld, 0);
  });
});

test('bật lại hệ thống hoàn tất thường quy là nguồn tự động dù sự kiện có người bấm', async () => {
  await runIsolated(async () => {
    configureWorkflow();
    const chief = switchRole('CHIEF_ACCOUNTANT')!.user;
    setAutomationPaused(true, chief, 'Dừng trước ca kiểm thử');
    await addRoutine('AUTO-RESUMED');
    setAutomationPaused(false, chief, 'Bật lại sau khi kiểm thử');
    assert.equal(releaseHeldRoutineCases(chief), 1);
    assertApprovals(readDashboardSummary(), 1, 0);
  });
});

test('nguồn lịch sử thiếu hoặc audit revision cũ không được suy đoán là tự động', async () => {
  await runIsolated(async () => {
    seedInvoice('LEGACY', 'APPROVED');
    seedInvoice('STALE-AUDIT', 'APPROVED');
    appendAuditEvent({eventType: 'ROUTINE_AUTO_APPROVED', entityId: 'STALE-AUDIT', payload: {
      revision: 0, actorRole: 'SYSTEM_REFEREE', before: {status: 'EVALUATING'}, after: {status: 'APPROVED'}
    }});
    assertApprovals(readDashboardSummary(), 0, 0, 2);
  });
});

test('API từ chối chưa đăng nhập/KTV, chỉ KTT và CFO được xem dữ liệu no-store', async () => {
  await runIsolated(async () => {
    seedInvoice('AUTHORIZED', 'RECEIVED');
    assert.equal((await requestDashboard()).status, 401);
    assert.equal((await requestDashboard('ACCOUNTANT')).status, 403);
    for (const role of ['CHIEF_ACCOUNTANT', 'CFO'] as const) {
      const response = await requestDashboard(role);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
      assert.equal(DashboardSummarySchema.parse(await response.json()).totalInvoices, 1);
    }
  });
});

test('thống kê tách biệt runner, từng phiên demo và session xác thực đúng DB', async () => {
  await runIsolated(async () => {
    seedInvoice('OUTER', 'APPROVED');
    await runIsolated(async () => { assert.equal(readDashboardSummary().totalInvoices, 0); });
    assert.equal(readDashboardSummary().totalInvoices, 1);
  });
  const demoA = crypto.randomUUID(), demoB = crypto.randomUUID();
  let sessionA = '';
  await withDemoDatabase(demoA, async () => {
    seedInvoice('DEMO-A', 'APPROVED');
    sessionA = switchRole('CFO')!.token;
  });
  await withDemoDatabase(demoB, async () => {
    seedInvoice('DEMO-B1', 'RECEIVED');
    seedInvoice('DEMO-B2', 'REJECTED');
  });
  const responseA = await dashboardGET(new NextRequest('http://localhost/api/dashboard', {
    headers: {cookie: `tax_referee_demo=${demoA}; tax_referee_session=${sessionA}`}
  }));
  assert.equal(responseA.status, 200);
  const summaryA = DashboardSummarySchema.parse(await responseA.json());
  assert.equal(summaryA.totalInvoices, 1);
  assert.equal(summaryA.rejected, 0);
  const crossed = await dashboardGET(new NextRequest('http://localhost/api/dashboard', {
    headers: {cookie: `tax_referee_demo=${demoB}; tax_referee_session=${sessionA}`}
  }));
  assert.equal(crossed.status, 401);
});
