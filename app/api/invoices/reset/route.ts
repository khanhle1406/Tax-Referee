import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import { requireRequestUser } from '@/lib/server/auth';
import { getDatabase, jsonNow } from '@/lib/server/db';
import { MACRO_DEFAULTS } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    requireRequestUser(request);
    const db = getDatabase();

    const artifacts = db.prepare('SELECT storage_path FROM document_artifacts').all() as Array<{ storage_path: string }>;

    const resetTx = db.transaction(() => {
      db.exec(`
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
