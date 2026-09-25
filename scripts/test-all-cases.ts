import './setup-env';
import { getActivePolicy, getDatabase, getMacroState } from '../lib/server/db';
import { InvoiceInputSchema, RefereeDecisionSchema } from '../lib/schemas';
import { evaluateInvoiceLocally } from '../services/policyEngine';

const rows = getDatabase().prepare('SELECT id, payload_json FROM invoices ORDER BY datetime(updated_at) DESC').all() as Array<{ id: string; payload_json: string }>;
if (rows.length === 0) throw new Error('Chưa có hóa đơn thật trong SQLite. Hãy upload hoặc chạy ingest-real-samples.ts trước.');

const policy = getActivePolicy();
const macroState = getMacroState();
let passed = 0;

for (const row of rows) {
  try {
    const invoice = InvoiceInputSchema.parse(JSON.parse(row.payload_json));
    const decision = evaluateInvoiceLocally(invoice, policy.config, policy.version, macroState);
    RefereeDecisionSchema.parse(decision);
    passed++;
    console.log(`[PASS] ${row.id}: ${invoice.invoiceNumber} - ${decision.status}`);
  } catch (error) {
    console.error(`[FAIL] ${row.id}:`, error instanceof Error ? error.message : error);
  }
}

console.log(`KẾT QUẢ: ${passed}/${rows.length} hóa đơn thật hợp lệ theo policy ${policy.version}`);
if (passed !== rows.length) process.exit(1);
