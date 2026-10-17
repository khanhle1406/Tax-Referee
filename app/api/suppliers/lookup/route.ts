import { withRequestDatabase } from '@/lib/server/db';
import { getRequestUser } from '@/lib/server/auth';
import { allowRate } from '@/lib/server/rateLimit';
import { lookupOfficialSupplierIdentity } from '@/services/officialSupplierLookupService';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function handleGET(req: NextRequest) {
  // Tra cứu có thể gọi dịch vụ AI tính phí: chỉ người đã vào workspace/demo, tối đa 60 lần/giờ mỗi tài khoản.
  const user = getRequestUser(req);
  if (!user) return NextResponse.json({ error: 'Vui lòng đăng nhập để tra cứu nhà cung cấp.' }, { status: 401 });
  if (process.env.NODE_ENV !== 'test' && !allowRate(`supplier-lookup:${user.id}`, Number(process.env.TAX_REFEREE_LOOKUP_PER_HOUR || 60), 60 * 60 * 1000))
    return NextResponse.json({ error: 'Đã tra cứu quá nhiều lần, thử lại sau.' }, { status: 429 });
  try {
    const { searchParams } = new URL(req.url);
    const taxCode = (searchParams.get('taxCode') || '').trim();
    const name = (searchParams.get('name') || '').trim();
    const address = (searchParams.get('address') || '').trim();
    if (!taxCode && !name) {
      return NextResponse.json({ error: 'Vui lòng cung cấp tên nhà cung cấp hoặc MST.' }, { status: 400 });
    }

    const identity = await lookupOfficialSupplierIdentity({ supplierName: name, supplierTaxCode: taxCode, address });
    if (identity.status === 'VERIFIED' || identity.status === 'DEMO_MATCH') {
      return NextResponse.json({
        found: true,
        lookupStatus: identity.status,
        supplierIdentity: identity,
        data: {
          taxCode: identity.supplierTaxCode,
          legalName: identity.legalName,
          supplierName: identity.legalName,
          isVerified: identity.status === 'VERIFIED',
          isDemo: identity.status === 'DEMO_MATCH',
          sources: identity.sources
        }
      }, { headers: { 'Cache-Control': 'no-store' } });
    }

    return NextResponse.json({
      found: false,
      lookupStatus: identity.status,
      supplierIdentity: identity,
      message: identity.message || 'Chưa xác minh được nhà cung cấp từ nguồn chính thống.'
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({
      found: false,
      lookupStatus: 'SOURCE_UNAVAILABLE',
      message: error instanceof Error ? error.message : 'Không thể tra cứu nhà cung cấp.'
    }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  }
}

export async function GET(...args: Parameters<typeof handleGET>) {
  return withRequestDatabase(args[0], () => handleGET(...args));
}
