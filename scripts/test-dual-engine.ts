import './setup-env';
import { getDatabase } from '../lib/server/db';
import { InvoiceInputSchema, RefereeDecisionSchema } from '../lib/schemas';
import { queryJevReferee } from '../services/jevService';

async function main() {
  const rows = getDatabase().prepare('SELECT id, payload_json FROM invoices ORDER BY datetime(updated_at) DESC').all() as Array<{ id: string; payload_json: string }>;
  if (rows.length === 0) throw new Error('Chưa có hóa đơn thật trong SQLite. Hãy upload hoặc chạy ingest-real-samples.ts trước.');

  let passed = 0;
  for (const row of rows) {
    try {
      const invoice = InvoiceInputSchema.parse(JSON.parse(row.payload_json));
      const result = await queryJevReferee(invoice, { useGenerativeQGen: true });
      RefereeDecisionSchema.parse(result.decision);
      passed++;
      console.log(`[PASS] ${row.id}: ${result.engineUsed} - ${result.decision.status}`);
    } catch (error) {
      console.error(`[FAIL] ${row.id}:`, error instanceof Error ? error.message : error);
    }
  }

  console.log(`DUAL ENGINE: ${passed}/${rows.length} hóa đơn thật vượt schema`);
  if (passed !== rows.length) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
