import './setup-env';
import fs from 'node:fs';
import { getDatabase, jsonNow } from '../lib/server/db';
import { MACRO_DEFAULTS } from '../lib/constants';

const db = getDatabase();
const artifacts = db.prepare('SELECT storage_path FROM document_artifacts').all() as Array<{ storage_path: string }>;
const reset = db.transaction(() => {
  db.exec(`
    DELETE FROM dossier_snapshots;
    DELETE FROM human_resolutions;
    DELETE FROM evaluations;
    DELETE FROM invoice_duplicate_reviews;
    DELETE FROM document_artifacts;
    DELETE FROM invoices;
  `);
  db.prepare('UPDATE macro_state SET payload_json = ?, updated_at = ? WHERE id = 1').run(JSON.stringify({
    totalSales: MACRO_DEFAULTS.TOTAL_SALES,
    openingInventory: MACRO_DEFAULTS.OPENING_INVENTORY,
    totalPurchases: MACRO_DEFAULTS.INITIAL_PURCHASES,
    kFactor: 1.2,
    zone: 'SAFE_GREEN',
    totalDeductibleTax: 760_000_000
  }), jsonNow());
});
reset();
for (const artifact of artifacts) {
  if (fs.existsSync(artifact.storage_path)) fs.unlinkSync(artifact.storage_path);
}
console.log(`Demo data reset: ${artifacts.length} artifact files removed; audit history preserved.`);
