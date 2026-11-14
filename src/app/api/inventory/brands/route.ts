import { NextRequest, NextResponse } from 'next/server';
import { getDatabaseClient } from '@/core/database/factory';
import { generateUUID } from '@/shared/utils/uuid';
import { getCurrentCompanyId } from '@/core/tenancy/context';

export async function GET(req: NextRequest) {
  try {
    const companyId = await getCurrentCompanyId(req);
    const client = getDatabaseClient();
    const brands = await client.query<any>(`
      SELECT 
        b.*,
        (SELECT COUNT(*) FROM products p WHERE p.brand_id = b.id AND p.company_id = b.company_id) as product_count
      FROM brands b
      WHERE b.company_id = ?
      ORDER BY b.name ASC
    `, [companyId]);

    return NextResponse.json({ success: true, brands });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to fetch brands' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const companyId = await getCurrentCompanyId(req);
    const body = await req.json();
    const { name, description } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Company / Brand name is required' }, { status: 400 });
    }

    const trimmedName = name.trim();
    const client = getDatabaseClient();

    // Check duplicate within company
    const existing = await client.queryOne<any>('SELECT id FROM brands WHERE LOWER(name) = LOWER(?) AND company_id = ?', [trimmedName, companyId]);
    if (existing) {
      return NextResponse.json({ error: 'A company/brand with this name already exists' }, { status: 409 });
    }

    const id = generateUUID();
    await client.execute(`
      INSERT INTO brands (id, company_id, name, description, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, [id, companyId, trimmedName, description?.trim() || null]);

    const brand = await client.queryOne<any>(`
      SELECT 
        b.*, 
        0 as product_count 
      FROM brands b 
      WHERE b.id = ? AND b.company_id = ?
    `, [id, companyId]);

    return NextResponse.json({ success: true, brand }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to create brand' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const companyId = await getCurrentCompanyId(req);
    const body = await req.json();
    const { id, name, description, is_active } = body;

    if (!id) {
      return NextResponse.json({ error: 'Brand ID is required' }, { status: 400 });
    }
    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Company / Brand name is required' }, { status: 400 });
    }

    const trimmedName = name.trim();
    const client = getDatabaseClient();

    const existing = await client.queryOne<any>('SELECT id FROM brands WHERE id = ? AND company_id = ?', [id, companyId]);
    if (!existing) {
      return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
    }

    // Check duplicate name on another brand within company
    const duplicate = await client.queryOne<any>('SELECT id FROM brands WHERE LOWER(name) = LOWER(?) AND id != ? AND company_id = ?', [trimmedName, id, companyId]);
    if (duplicate) {
      return NextResponse.json({ error: 'Another company/brand with this name already exists' }, { status: 409 });
    }

    const activeStatus = is_active !== undefined ? (is_active ? 1 : 0) : 1;

    await client.execute(`
      UPDATE brands
      SET name = ?, description = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND company_id = ?
    `, [trimmedName, description?.trim() || null, activeStatus, id, companyId]);

    // Also update denormalized brand_name column in products within same company
    await client.execute(`UPDATE products SET brand_name = ? WHERE brand_id = ? AND company_id = ?`, [trimmedName, id, companyId]);

    const updated = await client.queryOne<any>(`
      SELECT 
        b.*,
        (SELECT COUNT(*) FROM products p WHERE p.brand_id = b.id AND p.company_id = b.company_id) as product_count
      FROM brands b
      WHERE b.id = ? AND b.company_id = ?
    `, [id, companyId]);

    return NextResponse.json({ success: true, brand: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to update brand' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const companyId = await getCurrentCompanyId(req);
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const reassignToId = searchParams.get('reassignToId');

    if (!id) {
      return NextResponse.json({ error: 'Brand ID is required' }, { status: 400 });
    }

    const client = getDatabaseClient();

    const brand = await client.queryOne<any>('SELECT * FROM brands WHERE id = ? AND company_id = ?', [id, companyId]);
    if (!brand) {
      return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
    }

    // Check linked products count within same company
    const productCountRow = await client.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM products WHERE brand_id = ? AND company_id = ?', [id, companyId]);
    const count = Number(productCountRow?.count) || 0;

    if (count > 0) {
      if (!reassignToId) {
        return NextResponse.json({
          error: `Cannot delete "${brand.name}". There are ${count} products assigned to this company/brand. Please reassign them first.`,
          productCount: count,
          requiresReassignment: true
        }, { status: 400 });
      }

      if (reassignToId === id) {
        return NextResponse.json({ error: 'Target company/brand for reassignment must be different' }, { status: 400 });
      }

      const targetBrand = await client.queryOne<any>('SELECT * FROM brands WHERE id = ? AND company_id = ?', [reassignToId, companyId]);
      if (!targetBrand) {
        return NextResponse.json({ error: 'Target company/brand for reassignment does not exist' }, { status: 400 });
      }

      // Reassign products safely within same company
      await client.execute(`
        UPDATE products 
        SET brand_id = ?, brand_name = ?, updated_at = CURRENT_TIMESTAMP
        WHERE brand_id = ? AND company_id = ?
      `, [targetBrand.id, targetBrand.name, id, companyId]);
    }

    // Safe to delete
    await client.execute('DELETE FROM brands WHERE id = ? AND company_id = ?', [id, companyId]);

    return NextResponse.json({ 
      success: true, 
      message: `Company/Brand "${brand.name}" deleted successfully.${count > 0 ? ` Reassigned ${count} products.` : ''}` 
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to delete brand' }, { status: 500 });
  }
}

