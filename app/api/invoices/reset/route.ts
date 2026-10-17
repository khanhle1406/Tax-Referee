import { withRequestDatabase, isSandbox } from '@/lib/server/db';
import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import { requireRequestUser } from '@/lib/server/auth';
import { getDatabase, jsonNow } from '@/lib/server/db';
import { MACRO_DEFAULTS } from '@/lib/constants';
import { appendAuditEvent } from '@/lib/server/audit';
import { automationState } from '@/services/automationControl';

export const dynamic = 'force-dynamic';

async function handlePOST(request: NextRequest) {
  try {
    const user = requireRequestUser(request);
    // Chỉ sandbox demo, trừ khi máy này bật rõ công tắc (chỉ đặt trong .env.local của máy demo, không bao giờ trên production).
    const workspaceResetEnabled = process.env.TAX_REFEREE_ALLOW_WORKSPACE_RESET === '1';
    if (!isSandbox() && !workspaceResetEnabled) return NextResponse.json({ error: 'Reset chỉ dành cho sandbox demo.' }, { status: 403 });
    const db = getDatabase();

    const artifacts = db.prepare('SELECT storage_path FROM document_artifacts').all() as Array<{ storage_path: string }>;
    const invoiceCount = (db.prepare('SELECT COUNT(*) n FROM invoices').get() as { n: number }).n;

    const resetTx = db.transaction(() => {
      db.exec(`
        DELETE FROM internal_vouchers;
        DELETE FROM batch_items;
        DELETE FROM batches;
        DELETE FROM channel_messages;
        DELETE FROM outbound_notifications;
        DELETE FROM invoice_revisions;
        DELETE FROM dossier_snapshots;
        DELETE FROM human_resolutions;
        DELETE FROM evaluations;
        DELETE FROM invoice_duplicate_reviews;
        DELETE FROM document_artifacts;
        DELETE FROM invoices;
      `);
      db.prepare('UPDATE macro_state SET payload_json = ?, updated_at = ? WHERE id = 1').run(
        JSON.stringify({
          totalSales: MACRO_DEFAULTS.TOTAL_SALES,
          openingInventory: MACRO_DEFAULTS.OPENING_INVENTORY,
          totalPurchases: MACRO_DEFAULTS.INITIAL_PURCHASES,
          kFactor: 1.2,
          zone: 'SAFE_GREEN',
          totalDeductibleTax: 760_000_000
        }),
        jsonNow()
      );
    });

    resetTx();
    // Demo sạch thì tự động hóa chạy lại bình thường (công tắc dừng không còn treo từ phiên trước).
    const wasPaused = automationState().paused;
    db.exec("DELETE FROM system_controls WHERE key='AUTO_APPROVE'");
    // Nhật ký audit được giữ nguyên; bản thân thao tác reset cũng là một sự kiện có người thực hiện.
    appendAuditEvent({ eventType: 'SANDBOX_RESET', entityId: 'sandbox', actorId: user.id, payload: { role: user.role, deletedInvoices: invoiceCount, deletedArtifacts: artifacts.length, mode: isSandbox() ? 'sandbox' : 'workspace', automationReset: wasPaused ? 'PAUSED→RUNNING' : 'RUNNING' } });

    for (const artifact of artifacts) {
      if (fs.existsSync(artifact.storage_path)) {
        try {
          fs.unlinkSync(artifact.storage_path);
        } catch {
          // ignore
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Đã xóa toàn bộ hóa đơn, reset hệ thống về trạng thái sạch ban đầu.'
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Không thể reset hệ thống' },
      { status: 500 }
    );
  }
}

export async function POST(...args: Parameters<typeof handlePOST>) { return withRequestDatabase(args[0], () => handlePOST(...args)); }
