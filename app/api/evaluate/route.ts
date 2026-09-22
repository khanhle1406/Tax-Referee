import { NextRequest, NextResponse } from 'next/server';
import { InvoiceInputSchema } from '@/lib/schemas';
import { queryJevReferee } from '@/services/jevService';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Tiếp nhận linh hoạt: body có thể là chính InvoiceInput hoặc là { invoice, ...options }
    const rawInvoice = body.invoice || body;
    const parseResult = InvoiceInputSchema.safeParse(rawInvoice);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Dữ liệu hóa đơn không đúng chuẩn schema', details: parseResult.error.format() },
        { status: 400 }
      );
    }

    const invoice = parseResult.data;
    const options = {
      forceLocalOnly: body.forceLocalOnly ?? false,
      useGenerativeQGen: body.useGenerativeQGen ?? true,
      customSopVersion: body.customSopVersion
    };

    const result = await queryJevReferee(invoice, options);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Error in /api/evaluate:', error);
    return NextResponse.json(
      { error: 'Lỗi trong quá trình đối soát hóa đơn', message: error.message },
      { status: 500 }
    );
  }
}
