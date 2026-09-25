import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_POLICY_CONFIG, MACRO_DEFAULTS } from '@/lib/constants';
import { MacroState, MacroStateSchema, PolicyBundle, PolicyBundleSchema, SystemPolicyConfigSchema } from '@/lib/schemas';

const dataDirectory = path.join(process.cwd(), 'data', 'runtime');
const databasePath = process.env.TAX_REFEREE_DB_PATH || path.join(dataDirectory, 'tax-referee.sqlite');

let database: Database.Database | null = null;

function now(): string {
  return new Date().toISOString();
}

function hashContent(value: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function hasColumn(db: Database.Database, table: string, column: string): boolean {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return columns.some((item) => item.name === column);
}

function applyMigrations(db: Database.Database): void {
  const applied = new Set(
    (db.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as Array<{ version: number }>)
      .map((row) => row.version)
  );
  const record = db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)');

  if (!applied.has(1)) {
    record.run(1, now());
  }

  if (!applied.has(2)) {
    if (!hasColumn(db, 'human_resolutions', 'evaluation_id')) {
      db.exec('ALTER TABLE human_resolutions ADD COLUMN evaluation_id TEXT');
    }
    db.exec('CREATE INDEX IF NOT EXISTS idx_resolutions_invoice_created ON human_resolutions(invoice_id, created_at)');
    record.run(2, now());
  }

  if (!applied.has(3)) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS document_artifacts (
        id TEXT PRIMARY KEY,
        invoice_id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        original_file_name TEXT NOT NULL,
        source_type TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        storage_path TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        byte_size INTEGER NOT NULL,
        signature_status TEXT NOT NULL DEFAULT 'UNKNOWN',
        uploaded_by TEXT,
        created_at TEXT NOT NULL,
        UNIQUE(invoice_id, revision),
        UNIQUE(content_hash)
      );
      CREATE INDEX IF NOT EXISTS idx_artifacts_invoice ON document_artifacts(invoice_id, revision);
    `);
    record.run(3, now());
  }

  if (!applied.has(4)) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS dossier_snapshots (
        id TEXT PRIMARY KEY,
        invoice_id TEXT NOT NULL,
        evaluation_id TEXT,
        version INTEGER NOT NULL,
        payload_json TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        created_by TEXT,
        created_at TEXT NOT NULL,
        UNIQUE(invoice_id, version)
      );
      CREATE INDEX IF NOT EXISTS idx_dossiers_invoice ON dossier_snapshots(invoice_id, version);
    `);
    record.run(4, now());
  }

  if (!applied.has(5)) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS audit_chain_checkpoints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cutoff_rowid INTEGER NOT NULL,
        anchor_hash TEXT,
        reason TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
    const lastAudit = db.prepare('SELECT rowid, event_hash FROM audit_events ORDER BY rowid DESC LIMIT 1').get() as { rowid?: number; event_hash?: string } | undefined;
    if (lastAudit?.rowid) {
      db.prepare('INSERT INTO audit_chain_checkpoints (cutoff_rowid, anchor_hash, reason, created_at) VALUES (?, ?, ?, ?)')
      .run(lastAudit.rowid, lastAudit.event_hash || null, 'Legacy audit chain checkpoint; historical events require separate review', now());
    }
    record.run(5, now());
  }

  if (!applied.has(6)) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS invoice_duplicate_reviews (
        id TEXT PRIMARY KEY,
        invoice_id TEXT NOT NULL UNIQUE,
        canonical_invoice_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('OPEN', 'CONFIRMED_DUPLICATE', 'CONFIRMED_VALID')),
        reviewed_by TEXT,
        reason TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        reviewed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_duplicate_reviews_canonical ON invoice_duplicate_reviews(canonical_invoice_id, status);
    `);
    record.run(6, now());
  }
}

function initializeDatabase(db: Database.Database): void {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('ACCOUNTANT', 'CHIEF_ACCOUNTANT', 'CFO')),
      password_hash TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      invoice_number TEXT NOT NULL,
      supplier_tax_code TEXT NOT NULL,
      invoice_date TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'RECEIVED',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS policy_versions (
      version TEXT PRIMARY KEY,
      status TEXT NOT NULL CHECK (status IN ('DRAFT', 'PUBLISHED', 'ROLLED_BACK')),
      effective_from TEXT NOT NULL,
      effective_to TEXT,
      payload_json TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      created_by TEXT,
      approved_by TEXT,
      created_at TEXT NOT NULL,
      published_at TEXT
    );

    CREATE TABLE IF NOT EXISTS legal_sources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      base_url TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_checked_at TEXT,
      last_error TEXT
    );

    CREATE TABLE IF NOT EXISTS legal_documents (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL REFERENCES legal_sources(id),
      document_code TEXT NOT NULL,
      title TEXT NOT NULL,
      source_url TEXT,
      latest_version_id TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(source_id, document_code)
    );

    CREATE TABLE IF NOT EXISTS legal_document_versions (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES legal_documents(id),
      published_date TEXT,
      effective_from TEXT,
      effective_to TEXT,
      content TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      fetched_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS legal_update_candidates (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL REFERENCES legal_sources(id),
      document_code TEXT NOT NULL,
      title TEXT NOT NULL,
      published_date TEXT,
      effective_from TEXT,
      effective_to TEXT,
      status TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      diff TEXT NOT NULL DEFAULT '',
      affected_rule_ids_json TEXT NOT NULL DEFAULT '[]',
      source_url TEXT,
      content_hash TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS policy_approvals (
      id TEXT PRIMARY KEY,
      policy_version TEXT NOT NULL REFERENCES policy_versions(version),
      actor_id TEXT,
      action TEXT NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS evaluations (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL,
      decision_json TEXT NOT NULL,
      policy_version TEXT NOT NULL,
      legal_version TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS human_resolutions (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      option_id TEXT NOT NULL,
      resulting_action TEXT NOT NULL,
      reason TEXT NOT NULL,
      accepted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      actor_id TEXT,
      payload_json TEXT NOT NULL,
      previous_hash TEXT,
      event_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS macro_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS legal_sync_runs (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      sources_checked INTEGER NOT NULL DEFAULT 0,
      documents_found INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      created_at TEXT NOT NULL,
      finished_at TEXT
    );

    CREATE TABLE IF NOT EXISTS corporate_precedents (
      id TEXT PRIMARY KEY,
      supplier_tax_code TEXT NOT NULL,
      supplier_name TEXT NOT NULL,
      risk_pattern TEXT NOT NULL,
      sop_clause TEXT NOT NULL,
      approved_option TEXT NOT NULL,
      rationale TEXT NOT NULL,
      approved_by TEXT NOT NULL,
      effective_from TEXT NOT NULL,
      effective_to TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_precedents_supplier 
    ON corporate_precedents(supplier_tax_code, status);

    CREATE INDEX IF NOT EXISTS idx_invoices_dup_check 
    ON invoices(supplier_tax_code, invoice_number);
  `);

  applyMigrations(db);

  const seedSource = db.prepare(`
    INSERT OR IGNORE INTO legal_sources (id, name, base_url, enabled)
    VALUES (@id, @name, @baseUrl, 1)
  `);
  [
    ['vbpl-chinh-phu', 'Cơ sở dữ liệu văn bản pháp luật Chính phủ', 'https://vanban.chinhphu.vn'],
    ['mof', 'Cổng thông tin Bộ Tài chính', 'https://mof.gov.vn'],
    ['tax-gov', 'Cổng thông tin Thuế', 'https://www.gdt.gov.vn']
  ].forEach(([id, name, baseUrl]) => seedSource.run({ id, name, baseUrl }));

  const macro = db.prepare('SELECT id FROM macro_state WHERE id = 1').get();
  if (!macro) {
    const initialState: MacroState = {
      totalSales: MACRO_DEFAULTS.TOTAL_SALES,
      openingInventory: MACRO_DEFAULTS.OPENING_INVENTORY,
      totalPurchases: MACRO_DEFAULTS.INITIAL_PURCHASES,
      kFactor: 1.2,
      zone: 'SAFE_GREEN',
      totalDeductibleTax: 760_000_000
    };
    db.prepare('INSERT INTO macro_state (id, payload_json, updated_at) VALUES (1, ?, ?)')
      .run(JSON.stringify(initialState), now());
  }

  const policy = db.prepare('SELECT version FROM policy_versions WHERE status = ? ORDER BY created_at DESC LIMIT 1').get('PUBLISHED') as { version?: string } | undefined;
  if (!policy?.version) {
    const config = SystemPolicyConfigSchema.parse(DEFAULT_POLICY_CONFIG);
    const defaultBundle: PolicyBundle = {
      version: 'TAX-SOP-2026-v2.5',
      status: 'PUBLISHED',
      createdAt: now(),
      effectiveFrom: '2025-07-01',
      sourceDocumentVersions: ['48/2024/QH15', '204/2025/QH15', 'TAX-SOP-2026-v2.5'],
      policyText: '',
      rules: [],
      config,
      contentHash: hashContent(config)
    };
    db.prepare(`
      INSERT INTO policy_versions (version, status, effective_from, payload_json, content_hash, created_at, published_at)
      VALUES (@version, 'PUBLISHED', @effectiveFrom, @payload, @contentHash, @createdAt, @publishedAt)
    `).run({
      version: defaultBundle.version,
      effectiveFrom: defaultBundle.effectiveFrom,
      payload: JSON.stringify(defaultBundle),
      contentHash: defaultBundle.contentHash,
      createdAt: defaultBundle.createdAt,
      publishedAt: defaultBundle.createdAt
    });
  }
}

export function getDatabase(): Database.Database {
  if (!database) {
    fs.mkdirSync(dataDirectory, { recursive: true });
    database = new Database(databasePath);
    initializeDatabase(database);
  }
  return database;
}

export function getActivePolicy(): PolicyBundle {
  const row = getDatabase().prepare(`
    SELECT payload_json FROM policy_versions
    WHERE status = 'PUBLISHED'
    ORDER BY datetime(published_at) DESC
    LIMIT 1
  `).get() as { payload_json?: string } | undefined;
  if (!row?.payload_json) throw new Error('Chưa có policy đang hoạt động');
  return PolicyBundleSchema.parse(JSON.parse(row.payload_json));
}

export function saveMacroState(state: MacroState): void {
  const valid = MacroStateSchema.parse(state);
  getDatabase().prepare('UPDATE macro_state SET payload_json = ?, updated_at = ? WHERE id = 1')
    .run(JSON.stringify(valid), now());
}

export function getMacroState(): MacroState {
  const row = getDatabase().prepare('SELECT payload_json FROM macro_state WHERE id = 1').get() as { payload_json: string };
  return MacroStateSchema.parse(JSON.parse(row.payload_json));
}

export function hashPayload(payload: unknown): string {
  return hashContent(payload);
}

export function jsonNow(): string {
  return now();
}
