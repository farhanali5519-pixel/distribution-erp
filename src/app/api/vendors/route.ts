import { NextRequest, NextResponse } from 'next/server';
import { getDatabaseClient } from '@/core/database/factory';
import { generateUUID } from '../../../shared/utils/uuid';
import { DoubleEntryEngine } from '../../../core/accounting/engine';
import { getCurrentCompanyId } from '@/core/tenancy/context';

export async function GET(request: NextRequest) {
  try {
    const companyId = await getCurrentCompanyId(request);
    const client = getDatabaseClient();
    const vendors = await client.query<any>(`
      SELECT * FROM vendors WHERE is_active = 1 AND company_id = ? ORDER BY name ASC
    `, [companyId]);

    // Calculate real-time AP balance for each vendor in ONE batch query
    const balancesMap = await DoubleEntryEngine.getEntityBalancesAsync('VENDOR', companyId);

    const enrichedVendors = vendors.map((v) => {
      const bal = balancesMap.get(v.id);
      const currentBalance = bal ? bal.balance : 0;

      return {
        ...v,
        current_balance: currentBalance, // Positive means we owe the vendor (AP Credit balance)
      };
    });

    return NextResponse.json({ success: true, vendors: enrichedVendors });
  } catch (error: any) {
    console.error('Error fetching vendors:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const companyId = await getCurrentCompanyId(request);
    const body = await request.json();
    const client = getDatabaseClient();

    if (!body.name) {
      return NextResponse.json({ success: false, error: 'Vendor name is required' }, { status: 400 });
    }

    const id = generateUUID();
    await client.execute(`
      INSERT INTO vendors (
        id, company_id, name, company_name, contact_person, phone, email, address, city, cnic_or_ntn, payment_terms_days, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `, [
      id,
      companyId,
      body.name,
      body.company_name || null,
      body.contact_person || null,
      body.phone || null,
      body.email || null,
      body.address || null,
      body.city || null,
      body.cnic_or_ntn || null,
      body.payment_terms_days || 30
    ]);

    const vendor = await client.queryOne('SELECT * FROM vendors WHERE id = ? AND company_id = ?', [id, companyId]);
    return NextResponse.json({ success: true, vendor });
  } catch (error: any) {
    console.error('Error creating vendor:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

