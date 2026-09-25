import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import { requireRequestUser } from '@/lib/server/auth';
import { getDatabase } from '@/lib/server/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    requireRequestUser(request);
    const { id } = await context.params;
    const artifact = getDatabase().prepare(`
      SELECT original_file_name, mime_type, storage_path, content_hash
      FROM document_artifacts
      WHERE id = ?
    `).get(id) as { original_file_name: string; mime_type: string; storage_path: string; content_hash: string } | undefined;
    if (!artifact || !fs.existsSync(artifact.storage_path)) {
      return NextResponse.json({ error: 'Không tìm thấy chứng từ gốc' }, { status: 404 });
    }

    const body = fs.readFileSync(artifact.storage_path);
    return new NextResponse(body as unknown as BodyInit, {
      headers: {
        'Content-Type': artifact.mime_type,
        'Content-Length': String(body.byteLength),
        'Content-Disposition': `inline; filename="${artifact.original_file_name.replace(/["\\\r\n]/g, '_')}"`,
        'X-Content-SHA256': artifact.content_hash,
        'Cache-Control': 'private, no-store'
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'AUTH_REQUIRED') return NextResponse.json({ error: 'Vui lòng đăng nhập' }, { status: 401 });
    return NextResponse.json({ error: 'Không thể tải chứng từ gốc' }, { status: 500 });
  }
}
