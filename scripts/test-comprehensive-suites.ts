import './setup-env';
import { getActivePolicy, getDatabase, getMacroState } from '../lib/server/db';
import { InvoiceInputSchema, RefereeDecisionSchema } from '../lib/schemas';
import { evaluateInvoiceLocally } from '../services/policyEngine';
import { queryJevReferee } from '../services/jevService';

async function main() {
  const rows = getDatabase().prepare('SELECT id, payload_json FROM invoices ORDER BY datetime(updated_at) DESC').all() as Array<{ id: string; payload_json: string }>;
  if (rows.length === 0) throw new Error('Chưa có hóa đơn thật trong SQLite. Hãy upload hoặc chạy ingest-real-samples.ts trước.');

  const policy = getActivePolicy();
  const macroState = getMacroState();
  let localPassed = 0;
  let aiPassed = 0;

  for (const row of rows) {
    const invoice = InvoiceInputSchema.parse(JSON.parse(row.payload_json));
    const localDecision = evaluateInvoiceLocally(invoice, policy.config, policy.version, macroState);
    RefereeDecisionSchema.parse(localDecision);
    localPassed++;

    const aiResult = await queryJevReferee(invoice, { useGenerativeQGen: true, macroState, policyVersion: policy.version });
    RefereeDecisionSchema.parse(aiResult.decision);
    aiPassed++;

    console.log(`[PASS] ${row.id}: local=${localDecision.status}, engine=${aiResult.engineUsed}`);
  }

  console.log(`COMPREHENSIVE: local ${localPassed}/${rows.length}, engine ${aiPassed}/${rows.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
