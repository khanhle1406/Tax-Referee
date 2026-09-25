import './setup-env';
import fs from 'node:fs';
import path from 'node:path';
import { InvoiceInputSchema } from '../lib/schemas';
import { getActivePolicy, getDatabase, getMacroState } from '../lib/server/db';
import { evaluateInvoiceLocally } from '../services/policyEngine';

type ManifestCase = {
  sourceFile: string;
  sourceType: string;
  expectedStatus: 'ROUTINE' | 'ESCALATED';
  expectedRiskGroup?: string;
  expectedRequiresCFO?: boolean;
};

type Manifest = { manifestVersion: string; policyVersion: string; cases: ManifestCase[] };
const manifest = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'data/verification/manifest.json'), 'utf8')) as Manifest;
const policy = getActivePolicy();
if (policy.version !== manifest.policyVersion) throw new Error(`Policy drift: manifest=${manifest.policyVersion}, active=${policy.version}`);

const rows = getDatabase().prepare(`
  SELECT a.original_file_name AS originalFileName, a.source_type AS sourceType, i.payload_json AS payloadJson
  FROM document_artifacts a
  JOIN invoices i ON i.id = a.invoice_id
  WHERE a.revision = (SELECT MAX(a2.revision) FROM document_artifacts a2 WHERE a2.invoice_id = a.invoice_id)
`).all() as Array<{ originalFileName: string; sourceType: string; payloadJson: string }>;
const byFile = new Map(rows.map((row) => [row.originalFileName, row]));
const missing: string[] = [];
let passed = 0;
for (const expected of manifest.cases) {
  const row = byFile.get(expected.sourceFile);
  if (!row) {
    missing.push(expected.sourceFile);
    continue;
  }
  const invoice = InvoiceInputSchema.parse(JSON.parse(row.payloadJson));
  const decision = evaluateInvoiceLocally(invoice, policy.config, policy.version, getMacroState());
  const ok = row.sourceType === expected.sourceType
    && decision.status === expected.expectedStatus
    && (expected.expectedRiskGroup === undefined || (decision.status === 'ESCALATED' && decision.riskGroup === expected.expectedRiskGroup))
    && (expected.expectedRequiresCFO === undefined || decision.requiresCFO === expected.expectedRequiresCFO);
  if (!ok) {
    console.error(`[FAIL] ${expected.sourceFile}: actual=${decision.status}/${decision.status === 'ESCALATED' ? decision.riskGroup : 'ROUTINE'}/${decision.requiresCFO}`);
    continue;
  }
  passed++;
  console.log(`[PASS] ${expected.sourceFile}: ${decision.status}/${decision.status === 'ESCALATED' ? decision.riskGroup : 'ROUTINE'}`);
}
if (missing.length > 0) {
  console.error(`Thiếu artifact đã upload: ${missing.join(', ')}`);
  process.exit(2);
}
console.log(`REGRESSION MANIFEST ${manifest.manifestVersion}: ${passed}/${manifest.cases.length}`);
if (passed !== manifest.cases.length) process.exit(1);
