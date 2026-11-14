import { NextRequest, NextResponse } from 'next/server';
import { getDatabaseClient } from '@/core/database/factory';
import { generateUUID } from '@/shared/utils/uuid';
import { getCurrentCompanyId } from '@/core/tenancy/context';

export async function GET(req: NextRequest) {
  try {
    const companyId = await getCurrentCompanyId(req);
    const client = getDatabaseClient();
    const categories = await client.query<any>(`
      SELECT 
        c.*,
        (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.company_id = c.company_id) as product_count
      FROM categories c
      WHERE c.company_id = ?
      ORDER BY c.name ASC
    `, [companyId]);

    return NextResponse.json({ success: true, categories });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to fetch categories' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const companyId = await getCurrentCompanyId(req);
    const body = await req.json();
    const { name, description } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Category name is required' }, { status: 400 });
    }

    const trimmedName = name.trim();
    const client = getDatabaseClient();

    // Check duplicate within company
    const existing = await client.queryOne<any>('SELECT id FROM categories WHERE LOWER(name) = LOWER(?) AND company_id = ?', [trimmedName, companyId]);
    if (existing) {
      return NextResponse.json({ error: 'A category with this name already exists' }, { status: 409 });
    }

    const id = generateUUID();
    await client.execute(`
      INSERT INTO categories (id, company_id, name, description, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, [id, companyId, trimmedName, description?.trim() || null]);

    const category = await client.queryOne<any>(`
      SELECT 
        c.*, 
        0 as product_count 
      FROM categories c 
      WHERE c.id = ? AND c.company_id = ?
    `, [id, companyId]);

    return NextResponse.json({ success: true, category }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to create category' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const companyId = await getCurrentCompanyId(req);
    const body = await req.json();
    const { id, name, description, is_active } = body;

    if (!id) {
      return NextResponse.json({ error: 'Category ID is required' }, { status: 400 });
    }
    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Category name is required' }, { status: 400 });
    }

    const trimmedName = name.trim();
    const client = getDatabaseClient();

    const existing = await client.queryOne<any>('SELECT id FROM categories WHERE id = ? AND company_id = ?', [id, companyId]);
    if (!existing) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 });
    }

    // Check duplicate name on another category within company
    const duplicate = await client.queryOne<any>('SELECT id FROM categories WHERE LOWER(name) = LOWER(?) AND id != ? AND company_id = ?', [trimmedName, id, companyId]);
    if (duplicate) {
      return NextResponse.json({ error: 'Another category with this name already exists' }, { status: 409 });
    }

    const activeStatus = is_active !== undefined ? (is_active ? 1 : 0) : 1;

    await client.execute(`
      UPDATE categories
      SET name = ?, description = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND company_id = ?
    `, [trimmedName, description?.trim() || null, activeStatus, id, companyId]);

    // Also update denormalized category column in products within same company
    await client.execute(`UPDATE products SET category = ? WHERE category_id = ? AND company_id = ?`, [trimmedName, id, companyId]);

    const updated = await client.queryOne<any>(`
      SELECT 
        c.*,
        (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.company_id = c.company_id) as product_count
      FROM categories c
      WHERE c.id = ? AND c.company_id = ?
    `, [id, companyId]);

    return NextResponse.json({ success: true, category: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to update category' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const companyId = await getCurrentCompanyId(req);
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const reassignToId = searchParams.get('reassignToId');

    if (!id) {
      return NextResponse.json({ error: 'Category ID is required' }, { status: 400 });
    }

    const client = getDatabaseClient();

    const category = await client.queryOne<any>('SELECT * FROM categories WHERE id = ? AND company_id = ?', [id, companyId]);
    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 });
    }

    // Check linked products count within same company
    const productCountRow = await client.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM products WHERE category_id = ? AND company_id = ?', [id, companyId]);
    const count = Number(productCountRow?.count) || 0;

    if (count > 0) {
      if (!reassignToId) {
        return NextResponse.json({
          error: `Cannot delete "${category.name}". There are ${count} products assigned to this category. Please reassign them to another category first.`,
          productCount: count,
          requiresReassignment: true
        }, { status: 400 });
      }

      if (reassignToId === id) {
        return NextResponse.json({ error: 'Target category for reassignment must be different' }, { status: 400 });
      }

      const targetCategory = await client.queryOne<any>('SELECT * FROM categories WHERE id = ? AND company_id = ?', [reassignToId, companyId]);
      if (!targetCategory) {
        return NextResponse.json({ error: 'Target category for reassignment does not exist' }, { status: 400 });
      }

      // Reassign products safely within same company
      await client.execute(`
        UPDATE products 
        SET category_id = ?, category = ?, updated_at = CURRENT_TIMESTAMP
        WHERE category_id = ? AND company_id = ?
      `, [targetCategory.id, targetCategory.name, id, companyId]);
    }

    // Safe to delete
    await client.execute('DELETE FROM categories WHERE id = ? AND company_id = ?', [id, companyId]);

    return NextResponse.json({ 
      success: true, 
      message: `Category "${category.name}" deleted successfully.${count > 0 ? ` Reassigned ${count} products.` : ''}` 
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to delete category' }, { status: 500 });
  }
}

