import { NextRequest, NextResponse } from 'next/server';
import { getDatabaseClient } from '@/core/database/factory';
import { getTenantContext } from '@/core/tenancy/context';

export async function GET(req: NextRequest) {
  try {
    const tenant = await getTenantContext(req);
    const client = getDatabaseClient();
    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)));
    const txType = url.searchParams.get('type');

    let whereClause = 'WHERE company_id = ?';
    const params: any[] = [tenant.companyId];

    if (txType) {
      whereClause += ' AND transaction_type = ?';
      params.push(txType);
    }

    const countRow = await client.queryOne<{ count: number }>(`SELECT COUNT(*) as count FROM audit_logs ${whereClause}`, params);
    const total = Number(countRow?.count) || 0;
    const totalPages = Math.ceil(total / limit) || 1;

    const query = `
      SELECT * FROM audit_logs 
      ${whereClause} 
      ORDER BY created_at DESC 
      LIMIT ? OFFSET ?
    `;
    const logs = await client.query(query, [...params, limit, (page - 1) * limit]);

    return NextResponse.json({
      success: true,
      logs,
      pagination: {
        total,
        page,
        limit,
        totalPages,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch audit logs.' },
      { status: 500 }
    );
  }
}
