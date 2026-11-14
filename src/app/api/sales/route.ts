import { NextRequest, NextResponse } from 'next/server';
import { getDatabaseClient } from '@/core/database/factory';
import { generateUUID } from '@/shared/utils/uuid';
import { roundCurrency } from '@/shared/utils/currency';
import { ModuleRegistry } from '@/core/registry/module-registry';
import { appEventBus } from '@/core/events/event-bus';
import { initializeSystemModules } from '@/modules/init';
import { SalesService } from '@/modules/sales/service';
import { getCurrentCompanyId } from '@/core/tenancy/context';
import { requireModuleEnabled } from '@/core/tenancy/enforcement';

export async function GET(req: NextRequest) {
  try {
    const companyId = await getCurrentCompanyId(req);
    requireModuleEnabled(companyId, 'sales');
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (id) {
      const invoice = await SalesService.getInvoiceByIdAsync(id, companyId);
      if (!invoice) {
        return NextResponse.json({ success: false, message: 'Invoice not found' }, { status: 404 });
      }
      return NextResponse.json({ success: true, invoice });
    }

    const invoices = await SalesService.getInvoicesAsync(companyId);
    return NextResponse.json({ success: true, invoices });
  } catch (error: any) {
    const status = error.status || (error.name?.includes('Disabled') ? 403 : 500);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch invoices' },
      { status }
    );
  }
}

export async function POST(req: NextRequest) {
  initializeSystemModules();

  try {
    const companyId = await getCurrentCompanyId(req);
    requireModuleEnabled(companyId, 'sales');

    const body = await req.json();
    const { customerId, items, notes, salesmanId, supplyPersonId, routeId } = body;

    if (!customerId || !items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Customer ID and at least one item are required.' },
        { status: 400 }
      );
    }

    const client = getDatabaseClient();

    // Verify customer
    const customer = await client.queryOne<{ id: string; name: string }>(
      'SELECT id, name FROM customers WHERE id = ? AND company_id = ?',
      [customerId, companyId]
    );
    if (!customer) {
      return NextResponse.json({ success: false, message: 'Customer not found in this company.' }, { status: 404 });
    }

    // Verify route / staff if supplied
    if (routeId) {
      const routeRow = await client.queryOne('SELECT id FROM routes WHERE id = ? AND company_id = ?', [routeId, companyId]);
      if (!routeRow) return NextResponse.json({ success: false, message: 'Route does not belong to this company.' }, { status: 400 });
    }
    if (salesmanId) {
      const staffRow = await client.queryOne('SELECT id FROM staff_members WHERE id = ? AND company_id = ?', [salesmanId, companyId]);
      if (!staffRow) return NextResponse.json({ success: false, message: 'Salesman does not belong to this company.' }, { status: 400 });
    }
    if (supplyPersonId) {
      const staffRow = await client.queryOne('SELECT id FROM staff_members WHERE id = ? AND company_id = ?', [supplyPersonId, companyId]);
      if (!staffRow) return NextResponse.json({ success: false, message: 'Supply person does not belong to this company.' }, { status: 400 });
    }

    let subtotal = 0;
    let totalCostOfGoodsSold = 0;
    const validatedItems: { 
      productId: string; 
      quantity: number; 
      unitPrice: number; 
      unitCost: number; 
      totalPrice: number; 
      totalCost: number 
    }[] = [];

    for (const item of items) {
      const product = await client.queryOne<any>(
        'SELECT id, name, cost_price, selling_price, current_stock FROM products WHERE id = ? AND company_id = ?',
        [item.productId, companyId]
      );
      if (!product) {
        return NextResponse.json({ success: false, message: `Product ${item.productId} not found in this company.` }, { status: 404 });
      }

      const qty = Number(item.quantity) || 1;
      const price = Number(item.unitPrice) || product.selling_price;
      const cost = Number(product.cost_price) || 0;
      const lineTotal = roundCurrency(qty * price);
      const lineCost = roundCurrency(qty * cost);

      subtotal = roundCurrency(subtotal + lineTotal);
      totalCostOfGoodsSold = roundCurrency(totalCostOfGoodsSold + lineCost);

      validatedItems.push({
        productId: product.id,
        quantity: qty,
        unitPrice: price,
        unitCost: cost,
        totalPrice: lineTotal,
        totalCost: lineCost,
      });
    }

    const countRow = await client.queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM sales_invoices WHERE company_id = ?',
      [companyId]
    );
    const nextSeq = (Number(countRow?.count) || 0) + 1;
    const invoiceNumber = `INV-${new Date().getFullYear()}-${String(nextSeq).padStart(4, '0')}`;
    const invoiceId = generateUUID();
    const invoiceDate = new Date().toISOString().split('T')[0];

    // Begin atomic database transaction for invoice, items, and stock adjustment
    await client.transaction(async (tx) => {
      await tx.execute(`
        INSERT INTO sales_invoices (
          id, company_id, invoice_number, customer_id, route_id, salesman_id, supply_person_id,
          invoice_date, subtotal, tax, grand_total, 
          cost_of_goods_sold, payment_status, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0.00, ?, ?, 'UNPAID', ?)
      `, [
        invoiceId,
        companyId,
        invoiceNumber,
        customerId,
        routeId || null,
        salesmanId || null,
        supplyPersonId || null,
        invoiceDate,
        subtotal,
        subtotal,
        totalCostOfGoodsSold,
        notes || null
      ]);

      for (const item of validatedItems) {
        await tx.execute(`
          INSERT INTO sales_invoice_items (
            id, company_id, invoice_id, product_id, quantity, unit_price, unit_cost, total_price, total_cost
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          generateUUID(), 
          companyId,
          invoiceId, 
          item.productId, 
          item.quantity, 
          item.unitPrice, 
          item.unitCost, 
          item.totalPrice, 
          item.totalCost
        ]);

        // Perpetual stock decrement
        await tx.execute(
          'UPDATE products SET current_stock = current_stock - ? WHERE id = ? AND company_id = ?',
          [item.quantity, item.productId, companyId]
        );
      }

      // Update customer balance in customer sub-ledger master
      await tx.execute(
        'UPDATE customers SET balance = balance + ? WHERE id = ? AND company_id = ?',
        [subtotal, customerId, companyId]
      );
    });

    // Emit accounting domain event for automatic perpetual inventory double-entry GL posting
    await appEventBus.publish({
      type: 'SALES_INVOICE_POSTED',
      payload: {
        companyId,
        invoiceId,
        invoiceNumber,
        customerId,
        customerName: customer.name,
        invoiceDate,
        subtotal,
        tax: 0,
        discount: 0,
        grandTotal: subtotal,
        costOfGoodsSold: totalCostOfGoodsSold,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Invoice ${invoiceNumber} created! Dual-leg perpetual inventory entry posted to General Ledger.`,
      invoiceId,
      invoiceNumber,
    });
  } catch (error: any) {
    const status = error.status || (error.name?.includes('Disabled') ? 403 : 500);
    return NextResponse.json({ success: false, message: error.message }, { status });
  }
}

