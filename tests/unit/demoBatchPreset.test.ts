/**
 * Lô dựng sẵn cho buổi trình bày local: đi đúng đường của màn hình Lô hóa đơn và luật chốt lô;
 * lô tuần 2 đã chốt, lô cuối tháng còn mở chờ Kế toán trưởng trả lời nhóm và chốt.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getDatabase, runIsolated } from '../../lib/server/db';
import { switchRole } from '../../lib/server/auth';
import { getBatch, listBatches } from '../../services/batchService';
import { seedDemoBatches } from '../../services/demo/demoBatchPreset';
import { configWarnings } from '../../lib/server/runtimeInfo';

test('lô dựng sẵn: lô tuần 2 đã chốt (5 hóa đơn vào sổ), lô cuối tháng 25 file (24 dòng, file trùng được gộp) còn mở, có nhóm câu hỏi và file lỗi; chạy lại không tạo thêm', async () => {
  await runIsolated(async () => {
    const ktt = switchRole('CHIEF_ACCOUNTANT')!.user;
    switchRole('ACCOUNTANT');
    const { batches } = await seedDemoBatches();
    assert.equal(batches.length, 2);
    const [week2, month] = batches.map(id => getBatch(id, ktt));
    assert.equal(week2.batch.status, 'SIGNED_OFF');
    assert.equal((getDatabase().prepare("SELECT COUNT(*) n FROM audit_events WHERE event_type='INVOICE_POSTED_BY_BATCH'").get() as { n: number }).n, 5);
    assert.equal(month.batch.status, 'OPEN');
    // 25 file: file trùng nội dung với hóa đơn đã có được gộp (không tạo dòng thứ hai), như khi tải trên màn hình Lô hóa đơn.
    assert.equal(month.items.length, 24, JSON.stringify(month.summary));
    assert.ok(month.summary.MACHINE_APPROVED >= 8, JSON.stringify(month.summary));
    assert.ok(month.summary.NEEDS_HUMAN >= 8, JSON.stringify(month.summary));
    assert.ok(month.summary.ERROR >= 1, 'file không phải hóa đơn hiện là lỗi');
    assert.ok(month.groups.some(g => g.invoiceIds.length >= 2), 'có nhóm câu hỏi giống nhau để trả lời một lần');
    // File trùng bị bỏ TRƯỚC khi máy kiểm: không có hóa đơn nào của lô mẫu nằm ngoài lô (không đếm lệch Tổng quan).
    assert.equal((getDatabase().prepare("SELECT COUNT(*) n FROM invoices WHERE id LIKE 'LO-T10-%' AND id NOT IN (SELECT invoice_id FROM batch_items WHERE invoice_id IS NOT NULL)").get() as { n: number }).n, 0);
    assert.deepEqual(month.groups.map(g => g.invoiceIds.length).sort(), [2, 3]);
    assert.deepEqual(await seedDemoBatches(), { batches: [] });
    assert.equal(listBatches().length, 2);
  });
});

test('cờ chỉ dành cho máy local (kênh thật trong phiên demo, lô dựng sẵn, LLM demo) bật trên production thì /api/health cảnh báo', () => {
  const keys = ['NODE_ENV', 'TAX_REFEREE_ALLOW_REAL_CHANNELS_IN_DEMO', 'TAX_REFEREE_DEMO_PRESET_BATCHES', 'DEV_LLM_ENABLED', 'TAX_REFEREE_ALLOW_INTERNAL_ROLE_LOGIN'] as const;
  const saved = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  const env = process.env as Record<string, string | undefined>;
  try {
    env.NODE_ENV = 'production'; env.TAX_REFEREE_ALLOW_REAL_CHANNELS_IN_DEMO = '1'; env.TAX_REFEREE_DEMO_PRESET_BATCHES = '1'; env.DEV_LLM_ENABLED = '1'; env.TAX_REFEREE_ALLOW_INTERNAL_ROLE_LOGIN = '1';
    assert.deepEqual(configWarnings(true, 'abc1234').sort(), ['demo_preset_batches', 'dev_llm_enabled', 'internal_role_login', 'real_channels_in_demo']);
    delete env.TAX_REFEREE_ALLOW_REAL_CHANNELS_IN_DEMO; delete env.TAX_REFEREE_DEMO_PRESET_BATCHES; delete env.DEV_LLM_ENABLED; delete env.TAX_REFEREE_ALLOW_INTERNAL_ROLE_LOGIN;
    assert.deepEqual(configWarnings(true, 'abc1234'), []);
  } finally { for (const k of keys) { if (saved[k] === undefined) delete env[k]; else env[k] = saved[k]; } }
});
