import crypto from 'node:crypto';
import { getDatabase, jsonNow } from '@/lib/server/db';
import { SystemNotification, SystemNotificationSchema } from '@/lib/schemas';

export function listNotifications(type?: string): SystemNotification[] {
  const db = getDatabase();
  const rows = (type
    ? db.prepare('SELECT * FROM system_notifications WHERE type = ? ORDER BY datetime(created_at) DESC').all(type)
    : db.prepare('SELECT * FROM system_notifications ORDER BY datetime(created_at) DESC').all()) as Array<Record<string, unknown>>;

  return rows.map((r) =>
    SystemNotificationSchema.parse({
      id: r.id,
      type: r.type,
      title: r.title,
      message: r.message,
      link: r.link,
      isRead: Boolean(r.is_read),
      metadata: JSON.parse(String(r.metadata_json || '{}')),
      createdAt: r.created_at
    })
  );
}

export function getUnreadNotificationCount(): number {
  const db = getDatabase();
  const row = db.prepare('SELECT COUNT(*) as count FROM system_notifications WHERE is_read = 0').get() as { count: number };
  return row?.count || 0;
}

export function markNotificationAsRead(id: string): void {
  const db = getDatabase();
  db.prepare('UPDATE system_notifications SET is_read = 1 WHERE id = ?').run(id);
}

export function markAllNotificationsAsRead(): void {
  const db = getDatabase();
  db.prepare('UPDATE system_notifications SET is_read = 1').run();
}

export function createNotification(data: {
  type: SystemNotification['type'];
  title: string;
  message: string;
  link?: string | null;
  metadata?: Record<string, unknown>;
}): SystemNotification {
  const db = getDatabase();
  const id = `notif-${crypto.randomUUID()}`;
  const now = jsonNow();
  const notif: SystemNotification = {
    id,
    type: data.type,
    title: data.title,
    message: data.message,
    link: data.link || null,
    isRead: false,
    metadata: data.metadata || {},
    createdAt: now
  };

  db.prepare(`
    INSERT INTO system_notifications (id, type, title, message, link, is_read, metadata_json, created_at)
    VALUES (@id, @type, @title, @message, @link, 0, @metadataJson, @createdAt)
  `).run({
    id: notif.id,
    type: notif.type,
    title: notif.title,
    message: notif.message,
    link: notif.link,
    metadataJson: JSON.stringify(notif.metadata),
    createdAt: notif.createdAt
  });

  return notif;
}
