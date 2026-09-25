import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { NextRequest } from 'next/server';
import { getDatabase, jsonNow } from './db';

export type AppRole = 'ACCOUNTANT' | 'CHIEF_ACCOUNTANT' | 'CFO';
export type AppUser = { id: string; email: string; displayName: string; role: AppRole };

const roleSeed: Array<{ role: AppRole; email: string; displayName: string; envKey: string; fallback: string }> = [
  { role: 'ACCOUNTANT', email: 'ke-toan@local', displayName: 'Kế toán viên', envKey: 'TAX_REFEREE_ACCOUNTANT_PASSWORD', fallback: 'accountant-local' },
  { role: 'CHIEF_ACCOUNTANT', email: 'ktt@local', displayName: 'Kế toán trưởng', envKey: 'TAX_REFEREE_KTT_PASSWORD', fallback: 'ktt-local' },
  { role: 'CFO', email: 'cfo@local', displayName: 'Giám đốc tài chính', envKey: 'TAX_REFEREE_CFO_PASSWORD', fallback: 'cfo-local' }
];

function ensureSeedUsers(): void {
  const db = getDatabase();
  const count = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  if (count.count > 0) return;
  const insert = db.prepare(`
    INSERT INTO users (id, email, display_name, role, password_hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const tx = db.transaction(() => {
    for (const seed of roleSeed) {
      const configuredPassword = process.env[seed.envKey];
      if (!configuredPassword && process.env.NODE_ENV === 'production') {
        throw new Error(`Thiếu secret ${seed.envKey} trong môi trường production`);
      }
      const password = configuredPassword || seed.fallback;
      insert.run(crypto.randomUUID(), seed.email, seed.displayName, seed.role, bcrypt.hashSync(password, 10), jsonNow());
    }
  });
  tx();
}

function toUser(row: Record<string, unknown>): AppUser {
  return { id: String(row.id), email: String(row.email), displayName: String(row.display_name), role: row.role as AppRole };
}

export function login(email: string, password: string): { token: string; user: AppUser } | null {
  ensureSeedUsers();
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM users WHERE email = ? AND active = 1').get(email.trim().toLowerCase()) as Record<string, unknown> | undefined;
  if (!row || !bcrypt.compareSync(password, String(row.password_hash))) return null;
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .run(token, row.id, new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(), jsonNow());
  return { token, user: toUser(row) };
}

export function getUserFromToken(token?: string): AppUser | null {
  if (!token) return null;
  const row = getDatabase().prepare(`
    SELECT u.id, u.email, u.display_name, u.role
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.id = ? AND s.expires_at > ? AND u.active = 1
  `).get(token, jsonNow()) as Record<string, unknown> | undefined;
  return row ? toUser(row) : null;
}

export function getRequestUser(request: NextRequest): AppUser | null {
  return getUserFromToken(request.cookies.get('tax_referee_session')?.value);
}

export function requireRequestUser(request: NextRequest): AppUser {
  const user = getRequestUser(request);
  if (!user) throw new Error('AUTH_REQUIRED');
  return user;
}

export function canAccessRole(user: AppUser, allowed: AppRole[]): boolean {
  return allowed.includes(user.role);
}

export function switchRole(targetRole: AppRole): { token: string; user: AppUser } | null {
  ensureSeedUsers();
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM users WHERE role = ? AND active = 1').get(targetRole) as Record<string, unknown> | undefined;
  if (!row) return null;
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .run(token, row.id, new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(), jsonNow());
  return { token, user: toUser(row) };
}

export function logout(token?: string): void {
  if (token) getDatabase().prepare('DELETE FROM sessions WHERE id = ?').run(token);
}
