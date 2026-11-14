import { NextResponse } from 'next/server';
import { DoubleEntryEngine, DoubleEntryEngineError } from '@/core/accounting/engine';
import { checkApiModuleAccess } from '@/core/tenancy/enforcement';

export async function GET(req: Request) {
  try {
    const { context: tenant, errorResponse } = await checkApiModuleAccess(req, 'accounts');
    if (errorResponse) return errorResponse;
    const entries = DoubleEntryEngine.getEntries(100, tenant.companyId);
    return NextResponse.json({ success: true, entries });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { context: tenant, errorResponse } = await checkApiModuleAccess(req, 'accounts');
    if (errorResponse) return errorResponse;
    const body = await req.json();
    const { entryDate, description, sourceModule, lines } = body;

    if (!entryDate || !description || !lines || !Array.isArray(lines)) {
      return NextResponse.json(
        { success: false, message: 'Missing required fields: entryDate, description, and lines array are required.' },
        { status: 400 }
      );
    }

    const entry = DoubleEntryEngine.postEntry({
      companyId: tenant.companyId,
      entryDate,
      description,
      sourceModule: sourceModule || 'manual',
      lines,
      createdBy: tenant.fullName || tenant.username || 'User Admin',
    });

    return NextResponse.json({ success: true, entry });
  } catch (error: any) {
    if (error instanceof DoubleEntryEngineError) {
      return NextResponse.json({ success: false, message: error.message }, { status: 400 });
    }
    return NextResponse.json({ success: false, message: error.message || 'Posting failed.' }, { status: 500 });
  }
}
