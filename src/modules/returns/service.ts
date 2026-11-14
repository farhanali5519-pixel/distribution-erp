import { getDatabase } from '@/core/database/db';
import { DEFAULT_COMPANY_ID } from '@/core/tenancy/constants';
import { generateUUID } from '@/shared/utils/uuid';
import { toPaisas, fromPaisas, arePaisasEqual } from '@/shared/utils/currency';
import { DoubleEntryEngine } from '@/core/accounting/engine';
import { CreateJournalLineInput } from '@/core/accounting/types';
import { FeatureFlagService } from '@/core/settings/flags';
import { InventoryAuditService } from '@/modules/inventory/audit.service';
import {
  CustomerEligibilityResult,
  CreateSalesReturnInput,
  SalesReturnSummary,
  SalesReturnItemDetail,
  CreatePurchaseReturnInput,
  PurchaseReturnSummary,
  PurchaseReturnItemDetail,
} from './types';

export class ReturnsService {
  /**
   * Generates sequential sales return credit note number (SR-YYYYMM-XXXX)
   */
  public static generateSalesReturnNumber(companyId: string = DEFAULT_COMPANY_ID): string {
    const db = getDatabase();
    const today = new Date();
    const yyyymm = today.toISOString().slice(0, 7).replace('-', '');
    const prefix = `SR-${yyyymm}-`;

    const last = db.prepare(`
      SELECT return_number FROM sales_returns 
      WHERE company_id = ? AND return_number LIKE ? 
      ORDER BY return_number DESC LIMIT 1
    `).get(companyId, `${prefix}%`) as { return_number: string } | undefined;

    let seq = 1;
    if (last) {
      const parts = last.return_number.split('-');
      const lastSeq = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastSeq)) seq = lastSeq + 1;
    }

    return `${prefix}${seq.toString().padStart(4, '0')}`;
  }

  /**
   * Generates sequential purchase return debit note number (PR-YYYYMM-XXXX)
   */
  public static generatePurchaseReturnNumber(companyId: string = DEFAULT_COMPANY_ID): string {
    const db = getDatabase();
    const today = new Date();
    const yyyymm = today.toISOString().slice(0, 7).replace('-', '');
    const prefix = `PR-${yyyymm}-`;

    const last = db.prepare(`
      SELECT return_number FROM purchase_returns 
      WHERE company_id = ? AND return_number LIKE ? 
      ORDER BY return_number DESC LIMIT 1
    `).get(companyId, `${prefix}%`) as { return_number: string } | undefined;

    let seq = 1;
    if (last) {
      const parts = last.return_number.split('-');
      const lastSeq = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastSeq)) seq = lastSeq + 1;
    }

    return `${prefix}${seq.toString().padStart(4, '0')}`;
  }

  /**
   * Check customer purchase history audit and calculate max returnable base pieces
   */
  public static checkCustomerEligibility(customerId: string, productId: string, companyId: string = DEFAULT_COMPANY_ID): CustomerEligibilityResult {
    const db = getDatabase();

    const product = db.prepare(`
      SELECT id, name, sku, boxes_per_carton, pieces_per_box, total_pieces_per_carton, bulk_conversion_factor, trade_price_paisas, cost_price_paisas
      FROM products WHERE id = ? AND company_id = ?
    `).get(productId, companyId) as any;

    if (!product) {
      throw new Error(`Product with ID "${productId}" not found in this company.`);
    }

    const boxesPerCarton = Math.max(1, product.boxes_per_carton || 1);
    const piecesPerBox = Math.max(1, product.pieces_per_box || 1);
    const totalPiecesPerCarton = Math.max(1, product.total_pieces_per_carton || product.bulk_conversion_factor || (boxesPerCarton * piecesPerBox));

    // 1. Calculate cumulative base pieces ever billed & delivered to this customer in this company
    const orderDeliveredRow = db.prepare(`
      SELECT COALESCE(SUM(soi.quantity_base), 0) as delivered_qty
      FROM sales_order_items soi
      JOIN sales_orders so ON soi.order_id = so.id AND so.company_id = soi.company_id
      WHERE so.customer_id = ? AND soi.product_id = ? AND so.company_id = ? AND so.status NOT IN ('VOID', 'CANCELLED')
    `).get(customerId, productId, companyId) as { delivered_qty: number };

    // Also check direct invoices if any
    let invoiceDeliveredQty = 0;
    try {
      const invRow = db.prepare(`
        SELECT COALESCE(SUM(sii.quantity), 0) as delivered_qty
        FROM sales_invoice_items sii
        JOIN sales_invoices si ON sii.invoice_id = si.id AND si.company_id = sii.company_id
        WHERE si.customer_id = ? AND sii.product_id = ? AND si.company_id = ? AND si.order_id IS NULL AND si.status NOT IN ('VOID', 'CANCELLED')
      `).get(customerId, productId, companyId) as { delivered_qty: number } | undefined;
      if (invRow) invoiceDeliveredQty = invRow.delivered_qty;
    } catch {
      // sales_invoices table or order_id might not exist in all environments
    }

    const totalDeliveredBase = (orderDeliveredRow?.delivered_qty || 0) + invoiceDeliveredQty;

    // 2. Calculate cumulative base pieces already returned by this customer in this company
    const returnRow = db.prepare(`
      SELECT COALESCE(SUM(sri.total_base_qty), 0) as returned_qty
      FROM sales_return_items sri
      JOIN sales_returns sr ON sri.return_id = sr.id AND sr.company_id = sri.company_id
      WHERE sr.customer_id = ? AND sri.product_id = ? AND sr.company_id = ? AND sr.status = 'POSTED'
    `).get(customerId, productId, companyId) as { returned_qty: number };

    const alreadyReturnedBase = returnRow?.returned_qty || 0;
    const maxReturnableBase = Math.max(0, totalDeliveredBase - alreadyReturnedBase);
    const isEligible = totalDeliveredBase > 0;

    const tradePricePaisas = product.trade_price_paisas || 0;
    const tradePrice = fromPaisas(tradePricePaisas);

    return {
      customerId,
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      boxesPerCarton,
      piecesPerBox,
      totalPiecesPerCarton,
      tradePricePaisas,
      tradePrice,
      totalDeliveredBase,
      alreadyReturnedBase,
      maxReturnableBase,
      isEligible,
    };
  }

  /**
   * Get all products previously delivered to a customer with their live returnable limits
   */
  public static getCustomerEligibleProducts(customerId: string, companyId: string = DEFAULT_COMPANY_ID): CustomerEligibilityResult[] {
    const db = getDatabase();

    const deliveredProductIds = db.prepare(`
      SELECT DISTINCT soi.product_id
      FROM sales_order_items soi
      JOIN sales_orders so ON soi.order_id = so.id AND so.company_id = soi.company_id
      WHERE so.customer_id = ? AND so.company_id = ? AND so.status NOT IN ('VOID', 'CANCELLED')
    `).all(customerId, companyId) as { product_id: string }[];

    return deliveredProductIds.map(p => this.checkCustomerEligibility(customerId, p.product_id, companyId));
  }

  /**
   * Helper to retrieve or lazily create Phase 7 GL accounts
   */
  private static ensureAccount(code: string, name: string, type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE', normalBalance: 'DEBIT' | 'CREDIT', description: string, companyId: string = DEFAULT_COMPANY_ID): string {
    const db = getDatabase();
    let acc = db.prepare('SELECT id FROM chart_of_accounts WHERE code = ? AND company_id = ?').get(code, companyId) as { id: string } | undefined;
    if (!acc) {
      const newId = generateUUID();
      db.prepare(`
        INSERT INTO chart_of_accounts (id, company_id, code, name, type, normal_balance, is_active, is_system, description, currency)
        VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?, 'PKR')
      `).run(newId, companyId, code, name, type, normalBalance, description);
      return newId;
    }
    return acc.id;
  }

  /**
   * Create and instantly post a customer sales return credit note
   */
  public static createSalesReturn(input: CreateSalesReturnInput, companyIdOverride?: string): {
    returnId: string;
    returnNumber: string;
    journalEntryId: string;
    totalRefundPaisas: number;
    totalRefund: number;
  } {
    const companyId = input.companyId || companyIdOverride || DEFAULT_COMPANY_ID;

    if (!FeatureFlagService.isEnabled('returns.enable_sales_returns', true, companyId)) {
      throw new Error('Sales Returns module is disabled in feature settings.');
    }

    const strictValidation = FeatureFlagService.isEnabled('returns.strict_sales_history_validation', true, companyId);
    const quarantineDamaged = FeatureFlagService.isEnabled('returns.separate_damage_quarantine', true, companyId);

    const db = getDatabase();
    if (!input.customerId) throw new Error('Customer is required for sales return.');
    if (!input.items || input.items.length === 0) throw new Error('At least one item is required on the sales return.');

    const customer = db.prepare('SELECT id, name, shop_name FROM customers WHERE id = ? AND company_id = ?').get(input.customerId, companyId) as any;
    if (!customer) throw new Error(`Customer ${input.customerId} not found in this company.`);

    const returnId = generateUUID();
    const returnNumber = this.generateSalesReturnNumber(companyId);
    const returnDate = input.returnDate || new Date().toISOString().split('T')[0];

    let totalRefundPaisas = 0;
    let totalFreshCostPaisas = 0;
    let totalDamagedCostPaisas = 0;

    const preparedItems: any[] = [];
    const freshStockRestores: { productId: string; qty: number }[] = [];
    const damagedStockQuarantines: { productId: string; qty: number }[] = [];

    for (const item of input.items) {
      const prod = db.prepare(`
        SELECT id, name, sku, boxes_per_carton, pieces_per_box, total_pieces_per_carton, bulk_conversion_factor, trade_price_paisas, cost_price_paisas, current_stock_base, damaged_stock_base
        FROM products WHERE id = ? AND company_id = ?
      `).get(item.productId, companyId) as any;

      if (!prod) throw new Error(`Product ${item.productId} not found in this company.`);

      const boxesPerCarton = Math.max(1, prod.boxes_per_carton || 1);
      const piecesPerBox = Math.max(1, prod.pieces_per_box || 1);
      const totalPiecesPerCarton = Math.max(1, prod.total_pieces_per_carton || prod.bulk_conversion_factor || (boxesPerCarton * piecesPerBox));

      const ctn = Math.max(0, Number(item.cartonsQty) || 0);
      const box = Math.max(0, Number(item.boxesQty) || 0);
      const pcs = Math.max(0, Number(item.piecesQty) || 0);

      const calculatedBase = (ctn * totalPiecesPerCarton) + (box * piecesPerBox) + pcs;
      const totalBaseQty = (item.totalBaseQty !== undefined && item.totalBaseQty > 0) ? item.totalBaseQty : calculatedBase;

      if (totalBaseQty <= 0) {
        throw new Error(`Return quantity for ${prod.name} must be greater than 0 pieces.`);
      }

      // Strict Sales History Audit
      if (strictValidation) {
        const audit = this.checkCustomerEligibility(input.customerId, prod.id, companyId);
        if (!audit.isEligible || audit.totalDeliveredBase === 0) {
          throw new Error(`Return Rejected: Customer "${customer.name}" has never purchased or been delivered product "${prod.name}".`);
        }
        if (totalBaseQty > audit.maxReturnableBase) {
          throw new Error(`Return Rejected: Quantity (${totalBaseQty} Pcs) for "${prod.name}" exceeds maximum returnable limit (${audit.maxReturnableBase} Pcs). Already returned: ${audit.alreadyReturnedBase} Pcs, Net Delivered: ${audit.totalDeliveredBase} Pcs.`);
        }
      }

      // Unit rate per piece in paisas
      let unitRatePaisas = 0;
      if (item.unitRatePaisas !== undefined && item.unitRatePaisas > 0) {
        unitRatePaisas = item.unitRatePaisas;
      } else if (item.unitRate !== undefined && item.unitRate > 0) {
        unitRatePaisas = toPaisas(item.unitRate);
      } else {
        unitRatePaisas = Math.round((prod.trade_price_paisas || 0) / totalPiecesPerCarton);
      }

      const lineTotalPaisas = totalBaseQty * unitRatePaisas;
      const costPerPiecePaisas = Math.round((prod.cost_price_paisas || 0) / totalPiecesPerCarton);
      const itemCostPaisas = totalBaseQty * costPerPiecePaisas;

      totalRefundPaisas += lineTotalPaisas;

      const condition = item.condition || 'FRESH';

      if (condition === 'FRESH') {
        totalFreshCostPaisas += itemCostPaisas;
        freshStockRestores.push({ productId: prod.id, qty: totalBaseQty });
      } else {
        totalDamagedCostPaisas += itemCostPaisas;
        if (quarantineDamaged) {
          damagedStockQuarantines.push({ productId: prod.id, qty: totalBaseQty });
        } else {
          freshStockRestores.push({ productId: prod.id, qty: totalBaseQty });
        }
      }

      preparedItems.push({
        id: generateUUID(),
        returnId,
        productId: prod.id,
        condition,
        cartonsQty: ctn,
        boxesQty: box,
        piecesQty: pcs,
        totalBaseQty,
        unitRatePaisas,
        lineTotalPaisas,
        unitRate: fromPaisas(unitRatePaisas),
        lineTotal: fromPaisas(lineTotalPaisas),
      });
    }

    if (preparedItems.length === 0) {
      throw new Error('Sales return must have at least one valid item line.');
    }

    // 1. Post Compound Double-Entry General Ledger Voucher
    const retAccount4030Id = this.ensureAccount(
      '4030',
      'Sales Returns & Allowances',
      'REVENUE',
      'DEBIT',
      'Contra-revenue account for customer returned goods',
      companyId
    );
    const arAccount1030Id = this.ensureAccount(
      '1030',
      'Accounts Receivable (Trade Debtors)',
      'ASSET',
      'DEBIT',
      'Control account for customer receivables',
      companyId
    );
    const cashAccount1010Id = this.ensureAccount(
      '1010',
      'Cash in Hand (Main Drawer)',
      'ASSET',
      'DEBIT',
      'Physical cash in business drawer',
      companyId
    );
    const invAccount1040Id = this.ensureAccount(
      '1040',
      'Merchandise Inventory',
      'ASSET',
      'DEBIT',
      'Warehouse physical inventory asset',
      companyId
    );
    const cogsAccount5010Id = this.ensureAccount(
      '5010',
      'Cost of Goods Sold (COGS)',
      'EXPENSE',
      'DEBIT',
      'Direct cost of merchandise sold',
      companyId
    );
    const damageAccount5070Id = this.ensureAccount(
      '5070',
      'Damaged Goods & Expiry Loss',
      'EXPENSE',
      'DEBIT',
      'Quarantine inventory losses on expired or damaged merchandise',
      companyId
    );

    const journalLines: CreateJournalLineInput[] = [];

    // Line 1: Dr. 4030 Sales Returns & Allowances (Revenue Contra)
    journalLines.push({
      accountId: retAccount4030Id,
      debit: fromPaisas(totalRefundPaisas),
      credit: 0,
      memo: `Sales Return Credit Note #${returnNumber} - ${customer.name}`,
    });

    // Line 2: Settlement line (Cr. 1030 AR subledger OR Cr. 1010 Cash)
    if (input.settlementType === 'CREDIT_TO_LEDGER') {
      journalLines.push({
        accountId: arAccount1030Id,
        debit: 0,
        credit: fromPaisas(totalRefundPaisas),
        entityId: customer.id,
        entityType: 'CUSTOMER',
        memo: `Credit Note #${returnNumber} credited to customer ledger`,
      });
    } else {
      journalLines.push({
        accountId: cashAccount1010Id,
        debit: 0,
        credit: fromPaisas(totalRefundPaisas),
        memo: `Cash refund on spot for Credit Note #${returnNumber} - ${customer.name}`,
      });
    }

    // Line 3 & 4: Fresh Goods Inventory Reversal (Dr. 1040 Inventory / Cr. 5010 COGS)
    if (totalFreshCostPaisas > 0) {
      journalLines.push({
        accountId: invAccount1040Id,
        debit: fromPaisas(totalFreshCostPaisas),
        credit: 0,
        memo: `Restock sellable inventory for #${returnNumber}`,
      });
      journalLines.push({
        accountId: cogsAccount5010Id,
        debit: 0,
        credit: fromPaisas(totalFreshCostPaisas),
        memo: `Relieve COGS for fresh return #${returnNumber}`,
      });
    }

    // Line 5 & 6: Damaged/Expired Goods Quarantine (Dr. 5070 Damaged Loss / Cr. 5010 COGS)
    if (totalDamagedCostPaisas > 0) {
      journalLines.push({
        accountId: damageAccount5070Id,
        debit: fromPaisas(totalDamagedCostPaisas),
        credit: 0,
        memo: `Quarantine damaged/expired loss for #${returnNumber}`,
      });
      journalLines.push({
        accountId: cogsAccount5010Id,
        debit: 0,
        credit: fromPaisas(totalDamagedCostPaisas),
        memo: `COGS adjustment for damaged return #${returnNumber}`,
      });
    }

    const journalEntry = DoubleEntryEngine.postEntry({
      companyId,
      entryDate: returnDate,
      description: `Sales Return Credit Note ${returnNumber} - ${customer.name}`,
      sourceModule: 'returns',
      sourceDocumentId: returnId,
      lines: journalLines,
      createdBy: 'Returns Module',
    });

    // 2. Physical Stock Updates
    // A. Fresh Goods Restock active sellable inventory
    const updateFreshStockStmt = db.prepare(`
      UPDATE products 
      SET current_stock_base = current_stock_base + ?,
          current_stock = current_stock + ?,
          updated_at = datetime('now')
      WHERE id = ? AND company_id = ?
    `);
    for (const fs of freshStockRestores) {
      updateFreshStockStmt.run(fs.qty, fs.qty, fs.productId, companyId);

      InventoryAuditService.recordMovement(db, {
        companyId,
        productId: fs.productId,
        movementDate: returnDate,
        warehouse: 'Main Warehouse',
        movementType: 'SALE_RETURN',
        sourceModule: 'returns',
        sourceDocumentType: 'SALES_RETURN',
        documentNumber: returnNumber,
        originalTransactionId: returnId,
        quantityInBase: fs.qty,
        quantityOutBase: 0,
        notes: `Sales Return (Fresh Restock) ${returnNumber} - ${customer.name}`,
        updateProductStock: false,
      });
    }

    // B. Damaged Goods Quarantine stock (isolated from sellable stock)
    const updateDamagedStockStmt = db.prepare(`
      UPDATE products 
      SET damaged_stock_base = damaged_stock_base + ?,
          updated_at = datetime('now')
      WHERE id = ? AND company_id = ?
    `);
    for (const ds of damagedStockQuarantines) {
      updateDamagedStockStmt.run(ds.qty, ds.productId, companyId);

      InventoryAuditService.recordMovement(db, {
        companyId,
        productId: ds.productId,
        movementDate: returnDate,
        warehouse: 'Quarantine / Damaged',
        movementType: 'DAMAGE_WRITEOFF',
        sourceModule: 'returns',
        sourceDocumentType: 'SALES_RETURN',
        documentNumber: returnNumber,
        originalTransactionId: returnId,
        quantityInBase: ds.qty,
        quantityOutBase: 0,
        notes: `Sales Return (Damaged Quarantine) ${returnNumber} - ${customer.name}`,
        updateProductStock: false,
      });
    }

    // Resolve Salesperson and Supply Person (auto-inherited from invoice if not explicitly provided)
    let finalSalesmanId = input.salesmanId || null;
    let finalSupplyPersonId = input.supplyPersonId || null;
    let finalInvoiceId = input.invoiceId || null;

    if (finalInvoiceId) {
      const inv = db.prepare('SELECT salesman_id, supply_person_id FROM sales_invoices WHERE id = ? AND company_id = ?').get(finalInvoiceId, companyId) as any;
      if (inv) {
        if (!finalSalesmanId) finalSalesmanId = inv.salesman_id || null;
        if (!finalSupplyPersonId) finalSupplyPersonId = inv.supply_person_id || null;
      }
    }

    // 3. Insert Sales Return Record
    db.prepare(`
      INSERT INTO sales_returns (
        id, company_id, return_number, customer_id, invoice_id, return_date, salesman_id, supply_person_id,
        settlement_type, subtotal_paisas, total_refund_paisas, subtotal, total_refund,
        journal_entry_id, notes, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'POSTED')
    `).run(
      returnId,
      companyId,
      returnNumber,
      input.customerId,
      finalInvoiceId,
      returnDate,
      finalSalesmanId,
      finalSupplyPersonId,
      input.settlementType,
      totalRefundPaisas,
      totalRefundPaisas,
      fromPaisas(totalRefundPaisas),
      fromPaisas(totalRefundPaisas),
      journalEntry.id,
      input.notes || null
    );

    // 4. Insert Sales Return Item Records
    const insertItemStmt = db.prepare(`
      INSERT INTO sales_return_items (
        id, company_id, return_id, product_id, condition, cartons_qty, boxes_qty, pieces_qty,
        total_base_qty, unit_rate_paisas, line_total_paisas, unit_rate, line_total
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const item of preparedItems) {
      insertItemStmt.run(
        item.id,
        companyId,
        returnId,
        item.productId,
        item.condition,
        item.cartonsQty,
        item.boxesQty,
        item.piecesQty,
        item.totalBaseQty,
        item.unitRatePaisas,
        item.lineTotalPaisas,
        item.unitRate,
        item.lineTotal
      );
    }

    return {
      returnId,
      returnNumber,
      journalEntryId: journalEntry.id,
      totalRefundPaisas,
      totalRefund: fromPaisas(totalRefundPaisas),
    };
  }


  /**
   * Create and post a supplier purchase return debit note
   */
  public static createPurchaseReturn(input: CreatePurchaseReturnInput, companyIdOverride?: string): {
    returnId: string;
    returnNumber: string;
    journalEntryId: string;
    totalAmountPaisas: number;
    totalAmount: number;
  } {
    const companyId = input.companyId || companyIdOverride || DEFAULT_COMPANY_ID;

    if (!FeatureFlagService.isEnabled('returns.enable_purchase_returns', true, companyId)) {
      throw new Error('Purchase Returns module is disabled in feature settings.');
    }

    const db = getDatabase();
    if (!input.vendorId) throw new Error('Vendor is required for purchase return.');
    if (!input.items || input.items.length === 0) throw new Error('At least one item is required on the purchase return.');

    const vendor = db.prepare('SELECT id, name, company_name FROM vendors WHERE id = ? AND company_id = ?').get(input.vendorId, companyId) as any;
    if (!vendor) throw new Error(`Vendor ${input.vendorId} not found in this company.`);

    const returnId = generateUUID();
    const returnNumber = this.generatePurchaseReturnNumber(companyId);
    const returnDate = input.returnDate || new Date().toISOString().split('T')[0];

    let totalAmountPaisas = 0;
    const preparedItems: any[] = [];
    const stockDeductions: { productId: string; qty: number }[] = [];

    for (const item of input.items) {
      const prod = db.prepare(`
        SELECT id, name, sku, boxes_per_carton, pieces_per_box, total_pieces_per_carton, base_rate_per_piece_paisas, cost_price_paisas, current_stock_base, item_type
        FROM products WHERE id = ? AND company_id = ?
      `).get(item.productId, companyId) as any;

      if (!prod) throw new Error(`Product ${item.productId} not found in this company.`);

      const boxesPerCarton = Math.max(1, prod.boxes_per_carton || 1);
      const piecesPerBox = Math.max(1, prod.pieces_per_box || 1);
      const totalPiecesPerCarton = Math.max(1, prod.total_pieces_per_carton || (boxesPerCarton * piecesPerBox));

      const ctn = Math.max(0, Number(item.cartonsQty) || 0);
      const box = Math.max(0, Number(item.boxesQty) || 0);
      const pcs = Math.max(0, Number(item.piecesQty) || 0);

      const calculatedBase = (ctn * totalPiecesPerCarton) + (box * piecesPerBox) + pcs;
      const totalBaseQty = (item.totalBaseQty !== undefined && item.totalBaseQty > 0) ? item.totalBaseQty : calculatedBase;

      if (totalBaseQty <= 0) {
        throw new Error(`Return quantity for ${prod.name} must be greater than 0 pieces.`);
      }

      let ratePerPiecePaisas = 0;
      if (item.ratePerPiecePaisas !== undefined && item.ratePerPiecePaisas > 0) {
        ratePerPiecePaisas = item.ratePerPiecePaisas;
      } else if (item.ratePerPiece !== undefined && item.ratePerPiece > 0) {
        ratePerPiecePaisas = toPaisas(item.ratePerPiece);
      } else {
        ratePerPiecePaisas = prod.base_rate_per_piece_paisas || Math.round((prod.cost_price_paisas || 0) / totalPiecesPerCarton);
      }

      const lineTotalPaisas = totalBaseQty * ratePerPiecePaisas;
      totalAmountPaisas += lineTotalPaisas;

      if (prod.item_type !== 'SERVICE') {
        stockDeductions.push({ productId: prod.id, qty: totalBaseQty });
      }

      preparedItems.push({
        id: generateUUID(),
        returnId,
        productId: prod.id,
        cartonsQty: ctn,
        boxesQty: box,
        piecesQty: pcs,
        totalBaseQty,
        ratePerPiecePaisas,
        lineTotalPaisas,
        ratePerPiece: fromPaisas(ratePerPiecePaisas),
        lineTotal: fromPaisas(lineTotalPaisas),
      });
    }

    if (preparedItems.length === 0) {
      throw new Error('Purchase return must contain at least one valid item line.');
    }

    // 1. Post Compound Double-Entry General Ledger Voucher
    // Dr. 2010 Accounts Payable (Vendor subledger) / Cr. 1040 Merchandise Inventory
    const apAccount2010Id = this.ensureAccount(
      '2010',
      'Accounts Payable (Trade Creditors)',
      'LIABILITY',
      'CREDIT',
      'Control account for vendor payables',
      companyId
    );
    const invAccount1040Id = this.ensureAccount(
      '1040',
      'Merchandise Inventory',
      'ASSET',
      'DEBIT',
      'Warehouse physical inventory asset',
      companyId
    );

    const journalLines: CreateJournalLineInput[] = [
      {
        accountId: apAccount2010Id,
        debit: fromPaisas(totalAmountPaisas),
        credit: 0,
        entityId: vendor.id,
        entityType: 'VENDOR',
        memo: `Debit Note #${returnNumber} - ${vendor.name}`,
      },
      {
        accountId: invAccount1040Id,
        debit: 0,
        credit: fromPaisas(totalAmountPaisas),
        memo: `Relieve inventory on Purchase Return #${returnNumber} to ${vendor.name}`,
      },
    ];

    const journalEntry = DoubleEntryEngine.postEntry({
      companyId,
      entryDate: returnDate,
      description: `Purchase Return Debit Note ${returnNumber} - ${vendor.name}`,
      sourceModule: 'returns',
      sourceDocumentId: returnId,
      lines: journalLines,
      createdBy: 'Returns Module',
    });

    // 2. Physical Stock Relief (Deduct from inventory)
    const updateStockStmt = db.prepare(`
      UPDATE products 
      SET current_stock_base = current_stock_base - ?,
          current_stock = current_stock - ?,
          updated_at = datetime('now')
      WHERE id = ? AND company_id = ?
    `);
    for (const sd of stockDeductions) {
      updateStockStmt.run(sd.qty, sd.qty, sd.productId, companyId);

      InventoryAuditService.recordMovement(db, {
        companyId,
        productId: sd.productId,
        movementDate: returnDate,
        warehouse: 'Main Warehouse',
        movementType: 'PURCHASE_RETURN',
        sourceModule: 'returns',
        sourceDocumentType: 'PURCHASE_RETURN',
        documentNumber: returnNumber,
        originalTransactionId: returnId,
        quantityInBase: 0,
        quantityOutBase: sd.qty,
        notes: `Purchase Return Debit Note ${returnNumber} - ${vendor.name}`,
        updateProductStock: false,
      });
    }

    // 3. Insert Purchase Return Record
    db.prepare(`
      INSERT INTO purchase_returns (
        id, company_id, return_number, vendor_id, return_date, vendor_invoice_number,
        total_amount_paisas, total_amount, journal_entry_id, notes, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'POSTED')
    `).run(
      returnId,
      companyId,
      returnNumber,
      input.vendorId,
      returnDate,
      input.vendorInvoiceNumber || null,
      totalAmountPaisas,
      fromPaisas(totalAmountPaisas),
      journalEntry.id,
      input.notes || null
    );

    // 4. Insert Purchase Return Items
    const insertItemStmt = db.prepare(`
      INSERT INTO purchase_return_items (
        id, company_id, return_id, product_id, cartons_qty, boxes_qty, pieces_qty,
        total_base_qty, rate_per_piece_paisas, line_total_paisas, rate_per_piece, line_total
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const item of preparedItems) {
      insertItemStmt.run(
        item.id,
        companyId,
        returnId,
        item.productId,
        item.cartonsQty,
        item.boxesQty,
        item.piecesQty,
        item.totalBaseQty,
        item.ratePerPiecePaisas,
        item.lineTotalPaisas,
        item.ratePerPiece,
        item.lineTotal
      );
    }

    return {
      returnId,
      returnNumber,
      journalEntryId: journalEntry.id,
      totalAmountPaisas,
      totalAmount: fromPaisas(totalAmountPaisas),
    };
  }

  /**
   * List all posted sales returns
   */
  public static getSalesReturns(companyIdOverride?: string): SalesReturnSummary[] {
    const db = getDatabase();
    const companyId = companyIdOverride || DEFAULT_COMPANY_ID;
    const rows = db.prepare(`
      SELECT 
        sr.*,
        c.name as customer_name,
        c.shop_name,
        s.name as salesman_name,
        p.name as supply_person_name
      FROM sales_returns sr
      JOIN customers c ON sr.customer_id = c.id AND c.company_id = sr.company_id
      LEFT JOIN staff_members s ON sr.salesman_id = s.id AND s.company_id = sr.company_id
      LEFT JOIN staff_members p ON sr.supply_person_id = p.id AND p.company_id = sr.company_id
      WHERE sr.company_id = ?
      ORDER BY sr.return_date DESC, sr.created_at DESC
    `).all(companyId) as any[];

    return rows.map(r => ({
      id: r.id,
      return_number: r.return_number,
      customer_id: r.customer_id,
      customer_name: r.customer_name,
      shop_name: r.shop_name,
      invoice_id: r.invoice_id,
      return_date: r.return_date,
      salesman_id: r.salesman_id,
      salesman_name: r.salesman_name,
      supply_person_id: r.supply_person_id,
      supply_person_name: r.supply_person_name,
      settlement_type: r.settlement_type,
      subtotal_paisas: r.subtotal_paisas,
      total_refund_paisas: r.total_refund_paisas,
      subtotal: r.subtotal,
      total_refund: r.total_refund,
      journal_entry_id: r.journal_entry_id,
      notes: r.notes,
      status: r.status,
      created_at: r.created_at,
    }));
  }

  /**
   * Get single sales return with full item details
   */
  public static getSalesReturnById(id: string, companyIdOverride?: string): SalesReturnSummary | null {
    const db = getDatabase();
    const companyId = companyIdOverride || DEFAULT_COMPANY_ID;
    const row = db.prepare(`
      SELECT 
        sr.*,
        c.name as customer_name,
        c.shop_name,
        s.name as salesman_name,
        p.name as supply_person_name
      FROM sales_returns sr
      JOIN customers c ON sr.customer_id = c.id AND c.company_id = sr.company_id
      LEFT JOIN staff_members s ON sr.salesman_id = s.id AND s.company_id = sr.company_id
      LEFT JOIN staff_members p ON sr.supply_person_id = p.id AND p.company_id = sr.company_id
      WHERE (sr.id = ? OR sr.return_number = ?) AND sr.company_id = ?
    `).get(id, id, companyId) as any;

    if (!row) return null;

    const items = db.prepare(`
      SELECT 
        sri.*,
        p.name as product_name,
        p.sku
      FROM sales_return_items sri
      JOIN products p ON sri.product_id = p.id AND p.company_id = ?
      WHERE sri.return_id = ? AND sri.company_id = ?
      ORDER BY sri.created_at ASC
    `).all(companyId, row.id, companyId) as any[];

    return {
      id: row.id,
      return_number: row.return_number,
      customer_id: row.customer_id,
      customer_name: row.customer_name,
      shop_name: row.shop_name,
      return_date: row.return_date,
      salesman_id: row.salesman_id,
      salesman_name: row.salesman_name,
      settlement_type: row.settlement_type,
      subtotal_paisas: row.subtotal_paisas,
      total_refund_paisas: row.total_refund_paisas,
      subtotal: row.subtotal,
      total_refund: row.total_refund,
      journal_entry_id: row.journal_entry_id,
      notes: row.notes,
      status: row.status,
      created_at: row.created_at,
      items: items.map(it => ({
        id: it.id,
        return_id: it.return_id,
        product_id: it.product_id,
        product_name: it.product_name,
        sku: it.sku,
        condition: it.condition,
        cartons_qty: it.cartons_qty,
        boxes_qty: it.boxes_qty,
        pieces_qty: it.pieces_qty,
        total_base_qty: it.total_base_qty,
        unit_rate_paisas: it.unit_rate_paisas,
        line_total_paisas: it.line_total_paisas,
        unit_rate: it.unit_rate,
        line_total: it.line_total,
      })),
    };
  }

  /**
   * List all posted purchase returns
   */
  public static getPurchaseReturns(companyIdOverride?: string): PurchaseReturnSummary[] {
    const db = getDatabase();
    const companyId = companyIdOverride || DEFAULT_COMPANY_ID;
    const rows = db.prepare(`
      SELECT 
        pr.*,
        v.name as vendor_name,
        v.company_name
      FROM purchase_returns pr
      JOIN vendors v ON pr.vendor_id = v.id AND v.company_id = pr.company_id
      WHERE pr.company_id = ?
      ORDER BY pr.return_date DESC, pr.created_at DESC
    `).all(companyId) as any[];

    return rows.map(r => ({
      id: r.id,
      return_number: r.return_number,
      vendor_id: r.vendor_id,
      vendor_name: r.company_name ? `${r.vendor_name} (${r.company_name})` : r.vendor_name,
      return_date: r.return_date,
      vendor_invoice_number: r.vendor_invoice_number,
      total_amount_paisas: r.total_amount_paisas,
      total_amount: r.total_amount,
      journal_entry_id: r.journal_entry_id,
      notes: r.notes,
      status: r.status,
      created_at: r.created_at,
    }));
  }

  /**
   * Get single purchase return with full item details
   */
  public static getPurchaseReturnById(id: string, companyIdOverride?: string): PurchaseReturnSummary | null {
    const db = getDatabase();
    const companyId = companyIdOverride || DEFAULT_COMPANY_ID;
    const row = db.prepare(`
      SELECT 
        pr.*,
        v.name as vendor_name,
        v.company_name
      FROM purchase_returns pr
      JOIN vendors v ON pr.vendor_id = v.id AND v.company_id = pr.company_id
      WHERE (pr.id = ? OR pr.return_number = ?) AND pr.company_id = ?
    `).get(id, id, companyId) as any;

    if (!row) return null;

    const items = db.prepare(`
      SELECT 
        pri.*,
        p.name as product_name,
        p.sku
      FROM purchase_return_items pri
      JOIN products p ON pri.product_id = p.id AND p.company_id = ?
      WHERE pri.return_id = ? AND pri.company_id = ?
      ORDER BY pri.created_at ASC
    `).all(companyId, row.id, companyId) as any[];

    return {
      id: row.id,
      return_number: row.return_number,
      vendor_id: row.vendor_id,
      vendor_name: row.company_name ? `${row.vendor_name} (${row.company_name})` : row.vendor_name,
      return_date: row.return_date,
      vendor_invoice_number: row.vendor_invoice_number,
      total_amount_paisas: row.total_amount_paisas,
      total_amount: row.total_amount,
      journal_entry_id: row.journal_entry_id,
      notes: row.notes,
      status: row.status,
      created_at: row.created_at,
      items: items.map(it => ({
        id: it.id,
        return_id: it.return_id,
        product_id: it.product_id,
        product_name: it.product_name,
        sku: it.sku,
        cartons_qty: it.cartons_qty,
        boxes_qty: it.boxes_qty,
        pieces_qty: it.pieces_qty,
        total_base_qty: it.total_base_qty,
        rate_per_piece_paisas: it.rate_per_piece_paisas,
        line_total_paisas: it.line_total_paisas,
        rate_per_piece: it.rate_per_piece,
        line_total: it.line_total,
      })),
    };
  }
}

