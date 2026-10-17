import { AsyncLocalStorage } from 'node:async_hooks';
import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_POLICY_CONFIG, MACRO_DEFAULTS } from '@/lib/constants';
import { executablePolicySummary, implementedPolicyRules } from '@/data/policyContract';
import { MacroState, MacroStateSchema, PolicyBundle, PolicyBundleSchema, SystemPolicyConfigSchema } from '@/lib/schemas';

const dataDirectory = process.env.TAX_REFEREE_DATA_DIR || path.join(process.cwd(), 'data', 'runtime');
const databasePath = process.env.TAX_REFEREE_DB_PATH || path.join(dataDirectory, 'tax-referee.sqlite');
/** Thư mục bền chứa database nội bộ (không nằm trong thư mục release) — nơi đặt file khóa audit tự sinh. */
export function persistentDataDirectory(): string { return databasePath === ':memory:' ? dataDirectory : path.dirname(path.resolve(databasePath)); }

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

  if (!applied.has(7)) {
    db.exec(`
      DELETE FROM system_notifications WHERE type = 'LEGAL_UPDATE';
      DELETE FROM legal_update_candidates;
    `);
    record.run(7, now());
  }

  if (!applied.has(8)) {
    if (!hasColumn(db, 'invoices', 'approved_deductible_tax')) {
      db.exec('ALTER TABLE invoices ADD COLUMN approved_deductible_tax REAL DEFAULT 0');
    }
    record.run(8, now());
  }

  if (!applied.has(9)) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS supplier_master (
        tax_code TEXT PRIMARY KEY,
        legal_name TEXT NOT NULL,
        trade_name TEXT,
        address TEXT,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        established_date TEXT,
        risk_level TEXT NOT NULL DEFAULT 'LOW',
        default_expense_account TEXT,
        last_verified_at TEXT NOT NULL,
        verification_source TEXT NOT NULL DEFAULT 'MANUAL',
        evidence_snapshot_path TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_supplier_status ON supplier_master(status);
      CREATE INDEX IF NOT EXISTS idx_supplier_risk ON supplier_master(risk_level);
    `);
    record.run(9, now());
  }

  if (!applied.has(10)) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS tct_invoices (
        id TEXT PRIMARY KEY,
        tax_period TEXT NOT NULL,
        invoice_series TEXT NOT NULL,
        invoice_template TEXT,
        invoice_number TEXT NOT NULL,
        invoice_date TEXT NOT NULL,
        supplier_tax_code TEXT NOT NULL,
        supplier_name TEXT NOT NULL,
        buyer_tax_code TEXT,
        pre_tax_amount REAL NOT NULL,
        tax_rate REAL NOT NULL,
        tax_amount REAL NOT NULL,
        total_amount REAL NOT NULL,
        tax_authority_code TEXT,
        tct_status TEXT NOT NULL DEFAULT 'NEW',
        imported_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_tct_lookup ON tct_invoices(supplier_tax_code, invoice_number);
      CREATE INDEX IF NOT EXISTS idx_tct_period ON tct_invoices(tax_period);

      CREATE TABLE IF NOT EXISTS bank_transactions (
        id TEXT PRIMARY KEY,
        bank_code TEXT NOT NULL,
        account_number TEXT NOT NULL,
        transaction_date TEXT NOT NULL,
        reference_no TEXT NOT NULL,
        debit_amount REAL NOT NULL,
        credit_amount REAL DEFAULT 0,
        beneficiary_name TEXT,
        beneficiary_account TEXT,
        beneficiary_tax_code TEXT,
        description TEXT NOT NULL,
        matched_invoice_id TEXT,
        match_score INTEGER DEFAULT 0,
        matched_at TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_bank_date ON bank_transactions(transaction_date);
      CREATE INDEX IF NOT EXISTS idx_bank_matched ON bank_transactions(matched_invoice_id);
    `);
    record.run(10, now());
  }

  if (!applied.has(11)) {
    if (!hasColumn(db, 'invoices', 'created_by_user_id')) {
      db.exec('ALTER TABLE invoices ADD COLUMN created_by_user_id TEXT');
    }
    db.exec(`
      CREATE TABLE IF NOT EXISTS immutable_audit_trail (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        user_role TEXT NOT NULL,
        action TEXT NOT NULL,
        rationale TEXT,
        previous_hash TEXT,
        entry_hash TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_immutable_audit_entity ON immutable_audit_trail(entity_id);
      CREATE INDEX IF NOT EXISTS idx_immutable_audit_created ON immutable_audit_trail(created_at);
      CREATE INDEX IF NOT EXISTS idx_immutable_audit_user ON immutable_audit_trail(user_id);
    `);
    record.run(11, now());
  }

  if (!applied.has(12)) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS internal_vouchers (
        id TEXT PRIMARY KEY,
        invoice_id TEXT NOT NULL UNIQUE,
        evaluation_id TEXT NOT NULL,
        regime TEXT NOT NULL,
        voucher_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_internal_vouchers_evaluation ON internal_vouchers(evaluation_id);
    `);
    record.run(12, now());
  }

  if (!applied.has(13)) {
    for (const [column, sql] of [
      ['revision', 'INTEGER NOT NULL DEFAULT 1'], ['paused_from', 'TEXT'],
      ['tax_hold', 'INTEGER NOT NULL DEFAULT 0'], ['source_review_json', "TEXT NOT NULL DEFAULT '{}'"],
    ]) if (!hasColumn(db, 'invoices', column)) db.exec(`ALTER TABLE invoices ADD COLUMN ${column} ${sql}`);
    db.exec(`
      CREATE TABLE IF NOT EXISTS invoice_revisions (id TEXT PRIMARY KEY, invoice_id TEXT NOT NULL, revision INTEGER NOT NULL, payload_json TEXT NOT NULL, review_json TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(invoice_id, revision));
      CREATE TABLE IF NOT EXISTS macro_baseline (id INTEGER PRIMARY KEY, payload_json TEXT NOT NULL);
      INSERT OR IGNORE INTO macro_baseline SELECT id,json_set(payload_json,'$.totalPurchases',json_extract(payload_json,'$.totalPurchases')-(SELECT COALESCE(SUM(json_extract(payload_json,'$.preTaxAmount')),0) FROM invoices WHERE status='APPROVED'),'$.totalDeductibleTax',json_extract(payload_json,'$.totalDeductibleTax')-(SELECT COALESCE(SUM(approved_deductible_tax),0) FROM invoices WHERE status='APPROVED')) FROM macro_state;
      CREATE TABLE IF NOT EXISTS precedent_scopes (precedent_id TEXT PRIMARY KEY, purpose TEXT NOT NULL, maximum_amount REAL NOT NULL, current_threshold REAL NOT NULL, version INTEGER NOT NULL DEFAULT 1, origin_event_id TEXT);
      CREATE TABLE IF NOT EXISTS precedent_feedback (id TEXT PRIMARY KEY, precedent_id TEXT NOT NULL, invoice_id TEXT NOT NULL, evaluation_id TEXT NOT NULL, amount REAL NOT NULL, should_escalate INTEGER NOT NULL, reason TEXT NOT NULL, actor_id TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(precedent_id, invoice_id, evaluation_id));
      CREATE TABLE IF NOT EXISTS threshold_versions (id TEXT PRIMARY KEY, precedent_id TEXT NOT NULL, version INTEGER NOT NULL, previous_threshold REAL NOT NULL, threshold REAL NOT NULL, sample_count INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS extraction_reviews (artifact_id TEXT PRIMARY KEY, payload_json TEXT NOT NULL);
    `);
    record.run(13, now());
  }

  if (!applied.has(14)) {
    for (const [column, sql] of [
      ['evaluation_attempt_id', 'TEXT'], ['evaluation_deadline', 'TEXT'], ['evaluation_policy_json', 'TEXT']
    ]) if (!hasColumn(db, 'invoices', column)) db.exec(`ALTER TABLE invoices ADD COLUMN ${column} ${sql}`);
    record.run(14, now());
  }

  if (!applied.has(15)) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS capture_sessions (
        id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL,
        owner_user_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('WAITING','UPLOADED','PROCESSING','READY','FAILED','EXPIRED','CANCELLED')),
        artifact_id TEXT,
        error_message TEXT,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        uploaded_at TEXT,
        completed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_capture_sessions_owner ON capture_sessions(owner_user_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_capture_sessions_expiry ON capture_sessions(expires_at);
    `);
    record.run(15, now());
  }

  if (!applied.has(16)) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS supplier_name_aliases (
        id TEXT PRIMARY KEY,
        alias_name TEXT NOT NULL,
        normalized_alias TEXT NOT NULL,
        supplier_tax_code TEXT NOT NULL,
        evidence_invoice_id TEXT,
        evidence TEXT NOT NULL,
        verified_by TEXT NOT NULL,
        confirmed_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(normalized_alias, supplier_tax_code)
      );
      CREATE INDEX IF NOT EXISTS idx_supplier_alias_name ON supplier_name_aliases(normalized_alias);
      CREATE INDEX IF NOT EXISTS idx_supplier_alias_tax_code ON supplier_name_aliases(supplier_tax_code);

      -- Older lookup rows did not retain upstream freshness metadata. Require
      -- a new current lookup unless an explicit verification snapshot exists.
      UPDATE supplier_master SET verification_source='MANUAL',
        notes=COALESCE(notes, 'Dữ liệu tra cứu cũ; cần xác minh lại với nguồn thuế')
      WHERE verification_source IN ('TCT_PORTAL','NATIONAL_BIZ_REGISTRY')
        AND evidence_snapshot_path IS NULL;
    `);
    record.run(16, now());
  }

  if (!applied.has(17)) {
    if (!hasColumn(db, 'supplier_master', 'international_name')) {
      db.exec('ALTER TABLE supplier_master ADD COLUMN international_name TEXT');
    }
    record.run(17, now());
  }

  if (!applied.has(18)) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS supplier_identity_records (
        tax_code TEXT PRIMARY KEY,
        normalized_name TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        verified_at TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_identity_name ON supplier_identity_records(normalized_name);
      CREATE TABLE IF NOT EXISTS supplier_identity_aliases (
        normalized_alias TEXT NOT NULL,
        tax_code TEXT NOT NULL REFERENCES supplier_identity_records(tax_code) ON DELETE CASCADE,
        address_key TEXT NOT NULL DEFAULT '',
        expires_at INTEGER NOT NULL,
        PRIMARY KEY(normalized_alias, tax_code, address_key)
      );
      CREATE INDEX IF NOT EXISTS idx_identity_alias ON supplier_identity_aliases(normalized_alias);
    `);
    record.run(18, now());
  }

  if (!applied.has(19)) {
    db.exec(`CREATE TABLE IF NOT EXISTS supplier_identity_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tax_code TEXT NOT NULL REFERENCES supplier_identity_records(tax_code),
      original_name TEXT,
      payload_json TEXT NOT NULL,
      verified_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_identity_history ON supplier_identity_history(tax_code, verified_at);`);
    record.run(19, now());
  }

  // 20: nhật ký kiểm toán chỉ ghi thêm (trigger chặn UPDATE/DELETE) + cột HMAC để chuỗi hash không thể bị tính lại
  // bởi người chỉ có quyền ghi file database (khóa nằm ngoài database, trong biến môi trường).
  if (!applied.has(20)) {
    if (!hasColumn(db, 'audit_events', 'event_mac')) db.exec('ALTER TABLE audit_events ADD COLUMN event_mac TEXT');
    for (const table of ['audit_events', 'immutable_audit_trail']) {
      db.exec(`CREATE TRIGGER IF NOT EXISTS ${table}_no_update BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT, 'Nhật ký kiểm toán chỉ được ghi thêm'); END;
        CREATE TRIGGER IF NOT EXISTS ${table}_no_delete BEFORE DELETE ON ${table} BEGIN SELECT RAISE(ABORT, 'Nhật ký kiểm toán chỉ được ghi thêm'); END;`);
    }
    record.run(20, now());
  }

  // 21: điểm mốc audit cũng chỉ ghi một lần (không thể chèn mốc giả để bỏ qua phần chuỗi đã ký).
  if (!applied.has(21)) {
    db.exec(`CREATE TRIGGER IF NOT EXISTS audit_chain_checkpoints_no_insert BEFORE INSERT ON audit_chain_checkpoints BEGIN SELECT RAISE(ABORT, 'Điểm mốc audit chỉ được tạo khi nâng cấp dữ liệu cũ'); END;
      CREATE TRIGGER IF NOT EXISTS audit_chain_checkpoints_no_update BEFORE UPDATE ON audit_chain_checkpoints BEGIN SELECT RAISE(ABORT, 'Điểm mốc audit chỉ được ghi một lần'); END;
      CREATE TRIGGER IF NOT EXISTS audit_chain_checkpoints_no_delete BEFORE DELETE ON audit_chain_checkpoints BEGIN SELECT RAISE(ABORT, 'Điểm mốc audit chỉ được ghi một lần'); END;`);
    record.run(21, now());
  }

  // 22: xử lý theo lô, kênh nhận hóa đơn (Gmail/Zalo), danh bạ người gửi và thông báo gửi đi — chỉ cộng thêm bảng.
  // Máy vẫn quyết định từng hóa đơn; "chốt lô" là bước người ký trước khi ghi sổ (batches.signed_off_*).
  if (!applied.has(22)) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS batches (
        id TEXT PRIMARY KEY, label TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'UPLOAD',
        status TEXT NOT NULL DEFAULT 'OPEN', created_by_user_id TEXT, created_at TEXT NOT NULL,
        signed_off_by_user_id TEXT, signed_off_at TEXT, signoff_note TEXT
      );
      CREATE TABLE IF NOT EXISTS batch_items (
        batch_id TEXT NOT NULL, position INTEGER NOT NULL, invoice_id TEXT, file_name TEXT, file_sha256 TEXT,
        source_ref TEXT, submitter_staff_id TEXT, error TEXT, created_at TEXT NOT NULL,
        PRIMARY KEY (batch_id, position)
      );
      CREATE INDEX IF NOT EXISTS idx_batch_items_invoice ON batch_items(invoice_id);
      CREATE TABLE IF NOT EXISTS staff_directory (
        id TEXT PRIMARY KEY, full_name TEXT NOT NULL, department TEXT, title TEXT, email TEXT, zalo_user_id TEXT,
        app_user_id TEXT, manager_staff_id TEXT, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_email ON staff_directory(lower(email)) WHERE email IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_zalo ON staff_directory(zalo_user_id) WHERE zalo_user_id IS NOT NULL;
      CREATE TABLE IF NOT EXISTS channel_messages (
        id TEXT PRIMARY KEY, channel TEXT NOT NULL, external_id TEXT NOT NULL, sender_address TEXT, sender_name TEXT,
        sender_staff_id TEXT, sender_verified INTEGER NOT NULL DEFAULT 0, subject TEXT, received_at TEXT NOT NULL,
        file_name TEXT, mime TEXT, size INTEGER, sha256 TEXT, storage_path TEXT, status TEXT NOT NULL DEFAULT 'NEW',
        batch_id TEXT, invoice_id TEXT, note TEXT, created_at TEXT NOT NULL, UNIQUE(channel, external_id)
      );
      CREATE TABLE IF NOT EXISTS outbound_notifications (
        id TEXT PRIMARY KEY, channel TEXT NOT NULL, recipient TEXT, invoice_id TEXT, batch_id TEXT, kind TEXT NOT NULL,
        body TEXT NOT NULL, status TEXT NOT NULL, error TEXT, created_at TEXT NOT NULL, sent_at TEXT
      );`);
    record.run(22, now());
  }

  // 23: ghi sổ theo TỪNG hóa đơn trong lô (posted_at) — hóa đơn còn chờ lúc chốt, nếu được duyệt sau, phải chốt bổ sung;
  // người lấy thư (để file từ người gửi lạ được xử lý dưới tên người nhập, không phải người xác nhận); một hóa đơn chỉ một lô.
  if (!applied.has(23)) {
    db.exec(`
      ALTER TABLE batch_items ADD COLUMN posted_at TEXT;
      ALTER TABLE batch_items ADD COLUMN posted_by_user_id TEXT;
      ALTER TABLE batch_items ADD COLUMN posted_content_hash TEXT;
      ALTER TABLE channel_messages ADD COLUMN pulled_by_user_id TEXT;
      UPDATE batch_items SET posted_at = (SELECT b.signed_off_at FROM batches b WHERE b.id = batch_items.batch_id),
        posted_by_user_id = (SELECT b.signed_off_by_user_id FROM batches b WHERE b.id = batch_items.batch_id),
        posted_content_hash = (SELECT i.content_hash FROM invoices i WHERE i.id = batch_items.invoice_id)
        WHERE invoice_id IS NOT NULL AND batch_id IN (SELECT id FROM batches WHERE status = 'SIGNED_OFF')
          AND invoice_id IN (SELECT entity_id FROM audit_events WHERE event_type = 'INVOICE_POSTED_BY_BATCH');
      CREATE UNIQUE INDEX IF NOT EXISTS ux_batch_items_invoice ON batch_items(invoice_id) WHERE invoice_id IS NOT NULL;`);
    record.run(23, now());
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
      approved_deductible_tax REAL DEFAULT 0,
      created_by_user_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS immutable_audit_trail (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_role TEXT NOT NULL,
      action TEXT NOT NULL,
      rationale TEXT,
      previous_hash TEXT,
      entry_hash TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_immutable_audit_entity ON immutable_audit_trail(entity_id);
    CREATE INDEX IF NOT EXISTS idx_immutable_audit_created ON immutable_audit_trail(created_at);
    CREATE INDEX IF NOT EXISTS idx_immutable_audit_user ON immutable_audit_trail(user_id);

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

    CREATE TABLE IF NOT EXISTS system_notifications (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      link TEXT,
      is_read INTEGER NOT NULL DEFAULT 0,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_precedents_supplier 
    ON corporate_precedents(supplier_tax_code, status);

    CREATE INDEX IF NOT EXISTS idx_invoices_dup_check 
    ON invoices(supplier_tax_code, invoice_number);

    CREATE INDEX IF NOT EXISTS idx_notifications_read
    ON system_notifications(is_read, created_at);
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

  const notifCount = db.prepare('SELECT COUNT(*) as count FROM system_notifications').get() as { count: number };
  if (notifCount.count === 0) {
    const insertNotif = db.prepare(`
      INSERT INTO system_notifications (id, type, title, message, link, is_read, metadata_json, created_at)
      VALUES (@id, @type, @title, @message, @link, @isRead, @metadataJson, @createdAt)
    `);
    const seedNotifications = [
      {
        id: 'notif-risk-k-factor',
        type: 'INVOICE_RISK',
        title: 'Giám sát Hệ số K: An toàn (ngưỡng nội bộ)',
        message: 'Tỷ lệ chi phí mua vào/doanh thu lũy kế đang ở mức an toàn (K = 1.20, Vùng Xanh).',
        link: 'reports',
        isRead: 1,
        metadataJson: JSON.stringify({ kFactor: 1.2, zone: 'SAFE_GREEN' }),
        createdAt: now()
      }
    ];
    seedNotifications.forEach((n) => insertNotif.run(n));
  }

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

  db.exec('INSERT OR IGNORE INTO macro_baseline SELECT id, payload_json FROM macro_state');

  const policy = db.prepare('SELECT version FROM policy_versions WHERE status = ? ORDER BY created_at DESC LIMIT 1').get('PUBLISHED') as { version?: string } | undefined;
  if (!policy?.version) {
    const config = SystemPolicyConfigSchema.parse(DEFAULT_POLICY_CONFIG);
    const defaultBundle: PolicyBundle = {
      version: 'TAX-SOP-2026-v2.5',
      policyNotes:'',
      status: 'PUBLISHED',
      createdAt: now(),
      effectiveFrom: '2025-07-01',
      sourceDocumentVersions: ['48/2024/QH15', '204/2025/QH15', 'TAX-SOP-2026-v2.5'],
      policyText: executablePolicySummary(config),
      rules: implementedPolicyRules(config),
      config,
      contentHash: hashContent({config, policyText: executablePolicySummary(config), rules: implementedPolicyRules(config)})
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
  const scoped = databaseContext.getStore();
  if (scoped) return scoped.db;
  return getInternalDatabase();
}

/** Database nội bộ (không phải phiên demo), kể cả khi đang chạy trong ngữ cảnh demo. Dùng cho bảng định tuyến dùng chung. */
export function getInternalDatabase(): Database.Database {
  if (!database) {
    fs.mkdirSync(dataDirectory, { recursive: true });
    if (databasePath !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(databasePath)), { recursive: true });
    database = new Database(databasePath);
    initializeDatabase(database);
  }
  return database;
}

/**
 * Phiên chụp bằng điện thoại thuộc demo nào: lưu ở database nội bộ để mã QR không phải chứa mã phiên demo
 * (mã phiên demo là bí mật tương đương cookie đăng nhập).
 */
export function recordCaptureRoute(captureId: string, demoId: string, expiresAt: string): void {
  const db = getInternalDatabase();
  db.exec('CREATE TABLE IF NOT EXISTS capture_routes (capture_id TEXT PRIMARY KEY, demo_id TEXT NOT NULL, expires_at TEXT NOT NULL)');
  db.prepare('DELETE FROM capture_routes WHERE expires_at <= ?').run(now());
  db.prepare('INSERT OR REPLACE INTO capture_routes (capture_id, demo_id, expires_at) VALUES (?, ?, ?)').run(captureId, demoId, expiresAt);
}
export function captureRouteDemoId(captureId: string): string | null {
  const db = getInternalDatabase();
  db.exec('CREATE TABLE IF NOT EXISTS capture_routes (capture_id TEXT PRIMARY KEY, demo_id TEXT NOT NULL, expires_at TEXT NOT NULL)');
  const row = db.prepare('SELECT demo_id FROM capture_routes WHERE capture_id = ? AND expires_at > ?').get(captureId, now()) as { demo_id: string } | undefined;
  return row?.demo_id ?? null;
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


const databaseContext = new AsyncLocalStorage<{ db: Database.Database; sandbox: boolean; id: string }>();
const demoDatabases = new Map<string, { db: Database.Database; touched: number; inflight: number }>();
export function isSandbox(): boolean { return databaseContext.getStore()?.sandbox === true; }
/** Dấu vân tay ngắn của DB đang dùng (phiên demo / DB thử cô lập / nội bộ) — chứng minh cách ly mà không lộ id hay đường dẫn. */
export function databaseFingerprint(): string { return crypto.createHash('sha256').update(databaseContext.getStore()?.id || 'internal').digest('hex').slice(0, 10); }
export function artifactRoot(): string { return path.join(dataDirectory, 'artifacts', databaseContext.getStore()?.id || 'internal'); }
export function withIsolatedDatabase<T>(fn: () => T): T {
  const db = new Database(':memory:');
  initializeDatabase(db);
  try { return databaseContext.run({ db, sandbox: true, id: crypto.randomUUID() }, fn); } finally { db.close(); }
}
export async function runIsolated<T>(fn: () => Promise<T>): Promise<T> {
  const db = new Database(':memory:'); initializeDatabase(db);
  try { return await databaseContext.run({ db, sandbox: true, id: crypto.randomUUID() }, fn); }
  finally { db.close(); }
}
export async function withDemoDatabase<T>(id: string, fn: () => Promise<T>): Promise<T> {
  let entry = demoDatabases.get(id);
  if (!entry) {
    const cutoff = Date.now() - 8 * 60 * 60 * 1000;
    for (const [key, old] of demoDatabases) if (old.touched < cutoff && old.inflight === 0) { old.db.close(); demoDatabases.delete(key); }
    // Không bao giờ từ chối giám khảo: khi đầy, đóng kết nối ít dùng nhất (file SQLite vẫn còn trên đĩa, mở lại được).
    const capacity = Math.max(10, Number(process.env.TAX_REFEREE_DEMO_CACHE || 200));
    while (demoDatabases.size >= capacity) {
      // Chỉ đóng kết nối không có yêu cầu đang chạy; nếu tất cả đang bận thì tạm vượt trần thay vì đóng nhầm.
      let oldestKey = '', oldestTouched = Infinity;
      for (const [key, old] of demoDatabases) if (old.inflight === 0 && old.touched < oldestTouched) { oldestKey = key; oldestTouched = old.touched; }
      if (!oldestKey) break;
      demoDatabases.get(oldestKey)?.db.close(); demoDatabases.delete(oldestKey);
    }
    const demoDirectory=path.join(dataDirectory,'demo');fs.mkdirSync(demoDirectory,{recursive:true});
    const db = new Database(path.join(demoDirectory,`${id}.sqlite`)); initializeDatabase(db);
    entry = { db, touched: Date.now(), inflight: 0 }; demoDatabases.set(id, entry);
  }
  entry.touched = Date.now();
  const current = entry;
  current.inflight++;
  try { return await databaseContext.run({ db: current.db, sandbox: true, id }, fn); }
  finally { current.inflight--; current.touched = Date.now(); }
}
/** Phiên demo đã được tạo qua /api/demo/session (đang mở hoặc còn file trên đĩa). */
export function demoExists(id: string): boolean {
  return /^[a-f0-9-]{36}$/.test(id) && (demoDatabases.has(id) || fs.existsSync(path.join(dataDirectory, 'demo', `${id}.sqlite`)));
}
export function demoCount(): number {
  const dir = path.join(dataDirectory, 'demo');
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.sqlite')).length : 0;
}
export async function withRequestDatabase<T>(request: { cookies?: { get(name: string): { value: string } | undefined } }, fn: () => Promise<T>): Promise<T> {
  const id = request.cookies?.get('tax_referee_demo')?.value;
  // Cookie tự đặt (UUID bất kỳ) không được tạo database mới: chỉ phiên do /api/demo/session tạo mới được mở.
  return id && demoExists(id) ? withDemoDatabase(id, fn) : fn();
}
