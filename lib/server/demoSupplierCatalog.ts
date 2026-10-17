import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { isDemoSession, persistentDataDirectory } from './db';
import { normalizeTaxCodeFormat } from '@/lib/taxCode';
import type { SupplierIdentity } from '@/lib/schemas';

export const DemoSupplierSchema = z.object({
  id: z.string().min(1), name: z.string().min(1), taxCode: z.string().min(1),
  aliases: z.array(z.string().min(1)), files: z.array(z.string().min(1)).min(1),
  sourceKind: z.enum(['XML_FIXTURE', 'PDF_SAMPLE', 'RECEIPT', 'WEB_CONTEXT']),
  note: z.string().min(1), sources: z.array(z.object({title: z.string().min(1), url: z.string().url()})).min(1)
});
export type DemoSupplier = z.infer<typeof DemoSupplierSchema>;
export function demoSupplierCatalogPath(): string { return path.join(persistentDataDirectory(), 'demo-supplier-catalog.sqlite'); }
function nameKey(name: string): string {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Explicitly prepared demo data is separate from official evidence and tenant records. */
export function writeDemoSupplierCatalog(entries: DemoSupplier[], target = demoSupplierCatalogPath()): number {
  const parsed = z.array(DemoSupplierSchema).min(1).parse(entries);
  fs.mkdirSync(path.dirname(target), {recursive: true});
  const db = new Database(target);
  try {
    db.pragma('journal_mode = WAL');
    db.exec('CREATE TABLE IF NOT EXISTS demo_suppliers (id TEXT PRIMARY KEY, payload_json TEXT NOT NULL)');
    const upsert = db.prepare('INSERT INTO demo_suppliers VALUES (?,?) ON CONFLICT(id) DO UPDATE SET payload_json=excluded.payload_json');
    db.transaction(() => {
      for (const entry of parsed) upsert.run(entry.id, JSON.stringify(entry));
      // This database is solely the prepared catalog, not tenant invoices or official evidence.
      // Synchronize the manifest so removed fixtures cannot still autocomplete fictitious suppliers.
      db.prepare(`DELETE FROM demo_suppliers WHERE id NOT IN (${parsed.map(() => '?').join(',')})`).run(...parsed.map(entry => entry.id));
    })();
    return parsed.length;
  } finally { db.close(); }
}

export function lookupDemoSupplier(input: {supplierName?: string; supplierTaxCode?: string}): SupplierIdentity | null {
  if (!isDemoSession() || !fs.existsSync(demoSupplierCatalogPath())) return null;
  const db = new Database(demoSupplierCatalogPath(), {readonly: true});
  let entries: DemoSupplier[];
  try {
    entries = (db.prepare('SELECT payload_json FROM demo_suppliers').all() as Array<{payload_json: string}>)
      .map(row => DemoSupplierSchema.parse(JSON.parse(row.payload_json)));
  } finally { db.close(); }
  const name = nameKey(input.supplierName || '');
  const rawCode = input.supplierTaxCode?.trim();
  const code = rawCode ? normalizeTaxCodeFormat(rawCode) : null;
  const named = entries.filter(entry => [entry.name, ...entry.aliases].some(alias => name && nameKey(alias) === name));
  const candidates = rawCode ? entries.filter(entry => code && normalizeTaxCodeFormat(entry.taxCode) === code) : named;
  if (candidates.length > 1 || (!rawCode && named.length > 1)) return {
    status: 'AMBIGUOUS', lookupMethod: 'DEMO_CATALOG', sources: [], message: 'Danh mục demo có nhiều đơn vị cùng tên; chưa tự gán MST.'
  };
  const entry = candidates[0];
  if (!entry) {
    if (rawCode && named.length) return {status: 'CONFLICT', lookupMethod: 'DEMO_CATALOG', sources: named[0].sources, message: 'MST đọc được khác danh mục demo; giữ nguyên để đối chiếu.'};
    return null;
  }
  if (name && !named.some(match => match.id === entry.id)) return {
    status: 'CONFLICT', lookupMethod: 'DEMO_CATALOG', sources: entry.sources, message: 'Tên và MST chưa khớp danh mục demo; giữ nguyên chứng từ.'
  };
  return {
    status: 'DEMO_MATCH', lookupMethod: 'DEMO_CATALOG', legalName: entry.name, supplierTaxCode: entry.taxCode,
    sources: entry.sources, message: `Danh mục demo · ${entry.note}`
  };
}
