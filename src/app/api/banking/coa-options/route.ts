import { NextResponse } from 'next/server';
import { getDatabaseClient } from '@/core/database/factory';
import { getTenantContext } from '@/core/tenancy/tenant-context';

export async function GET(req: Request) {
  try {
    const tenant = await getTenantContext(req);
    const companyId = tenant.companyId;
    const client = getDatabaseClient();

    // Get asset accounts in Chart of Accounts that can be linked
    const coaAccounts = await client.query<any>(`
        SELECT id, code, name, normal_balance, is_active, description 
        FROM chart_of_accounts 
        WHERE type = 'ASSET' AND is_active = 1 AND company_id = ?
        ORDER BY code ASC
      `, [companyId]);

    // Next suggested bank GL code in 102x series
    const bankCodes = await client.query<{ code: string }>(
      "SELECT code FROM chart_of_accounts WHERE code LIKE '102%' AND company_id = ? ORDER BY code DESC",
      [companyId]
    );

    let nextCode = '1021';
    if (bankCodes.length > 0) {
      const numbers = bankCodes
        .map((r) => parseInt(r.code, 10))
        .filter((n) => !isNaN(n));
      const max = Math.max(...numbers);
      nextCode = String(max + 1);
    }

    return NextResponse.json({
      success: true,
      coaAccounts,
      nextSuggestedCode: nextCode,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch COA options.' },
      { status: 500 }
    );
  }
}
