import { NextRequest, NextResponse } from 'next/server';
import { listCorporatePrecedents, createPrecedent, revokeCorporatePrecedent } from '@/services/precedentService';
import { getRequestUser } from '@/lib/server/auth';

export async function GET(request: NextRequest) {
  try {
    const user = getRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    }

    const precedents = listCorporatePrecedents();
    return NextResponse.json({ precedents });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Không thể lấy danh sách tiền lệ' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = getRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    }

    if (user.role !== 'CFO' && user.role !== 'CHIEF_ACCOUNTANT') {
      return NextResponse.json({ error: 'Chỉ CFO hoặc Kế toán trưởng mới có thẩm quyền tạo tiền lệ' }, { status: 403 });
    }

    const body = await request.json();
    const { supplierTaxCode, supplierName, riskPattern, sopClause, approvedOption, rationale, effectiveMonths } = body;

    if (!supplierTaxCode || !supplierName || !rationale) {
      return NextResponse.json({ error: 'Thiếu thông tin bắt buộc để tạo tiền lệ' }, { status: 400 });
    }

    const precedent = createPrecedent({
      supplierTaxCode,
      supplierName,
      riskPattern: riskPattern || 'OUT_OF_POLICY',
      sopClause: sopClause || 'Quy chế Tax-SOP-2026',
      approvedOption: approvedOption || 'ACCEPT_ADJUSTMENT',
      rationale,
      approvedBy: `${user.displayName} (${user.role})`,
      effectiveMonths: effectiveMonths || 6
    });

    return NextResponse.json({ success: true, precedent }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Không thể tạo tiền lệ' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = getRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    }

    if (user.role !== 'CFO' && user.role !== 'CHIEF_ACCOUNTANT') {
      return NextResponse.json({ error: 'Không có quyền thu hồi tiền lệ' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Thiếu ID tiền lệ' }, { status: 400 });
    }

    const ok = revokeCorporatePrecedent(id);
    return NextResponse.json({ success: ok });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Không thể thu hồi tiền lệ' },
      { status: 500 }
    );
  }
}
