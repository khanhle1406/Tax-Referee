import { NextRequest, NextResponse } from 'next/server';
import { processIncomingLegalUpdate } from '@/services/legalUpdateService';

export const dynamic = 'force-dynamic';

const EXPECTED_SECRET = process.env.LEGAL_WEBHOOK_SECRET || 'tax-referee-webhook-secret-2026';

/**
 * Webhook tiếp nhận thông báo văn bản pháp luật thuế mới theo thời gian thực (Push Event).
 * Dành cho các đối tác LegalTech (Thư Viện Pháp Luật, LuatVietnam) hoặc hệ sinh thái nội bộ.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const secretHeader = req.headers.get('x-webhook-secret') || '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : '';

    if (secretHeader !== EXPECTED_SECRET && bearer !== EXPECTED_SECRET) {
      return NextResponse.json(
        { error: 'Xác thực Webhook không hợp lệ (Unauthorized)' },
        { status: 401 }
      );
    }

    const body = await req.json();
    if (!body || !body.code || !body.title || !body.content) {
      return NextResponse.json(
        { error: 'Payload không hợp lệ: thiếu code, title hoặc content' },
        { status: 400 }
      );
    }

    const sourceName = req.headers.get('x-source-name') || 'Đối tác LegalTech B2B (Webhook)';
    const result = await processIncomingLegalUpdate(body, sourceName);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...result
    });
  } catch (err) {
    console.error('Lỗi tiếp nhận Webhook pháp lý:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Lỗi xử lý Webhook nội bộ' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ONLINE',
    service: 'Tax Referee Real-Time Legal Webhook Receiver',
    version: '1.0.0',
    documentation: 'Gửi POST với header Authorization: Bearer <secret> hoặc x-webhook-secret: <secret>'
  });
}
