import { getDatabase } from '@/core/database/db';
import { generateUUID } from '@/shared/utils/uuid';
import { toPaisas, fromPaisas } from '@/shared/utils/currency';
import { DoubleEntryEngine } from '@/core/accounting/engine';
import { CreateJournalLineInput } from '@/core/accounting/types';
import { InventoryAuditService } from '@/modules/inventory/audit.service';
import { DEFAULT_COMPANY_ID } from '@/core/tenancy/constants';
import { AccountResolver } from '@/core/accounting/account-resolver';

export interface PurchaseBillItemInput {
  productId: string;
  itemReference?: string;
  batchNumber?: string;
  expiryDate?: string;
  cartonsQty?: number;
  boxesQty?: number;
  loosePiecesQty?: number;
  ratePerPiecePaisas?: number;
  ratePerPiece?: number;
  taxPercent?: number;
  taxPaisas?: number;
  discountPercent?: number;
  discountPaisas?: number;
}

export interface CreatePurchaseBillInput {
  companyId?: string;
  vendorId: string;
  billDate: string;
  dueDate?: string;
  warehouse?: string;
  broker?: string;
  vendorInvoiceNumber: string;
  referenceNumber?: string;
  freightTreatment: 'LANDED_COST' | 'DIRECT_EXPENSE' | 'NONE';
  freightAmountPaisas?: number;
  freightAmount?: number;
  notes?: string;
  status?: 'POSTED' | 'DRAFT';
  items: PurchaseBillItemInput[];
}

export interface PurchaseBillSummary {
  id: string;
  bill_number: string;
  vendor_id: string;
  vendor_name: string;
  company_name?: string;
  bill_date: string;
  due_date?: string;
  warehouse: string;
  broker?: string;
  vendor_invoice_number: string;
  reference_number?: string;
  freight_treatment: string;
  freight_amount: number;
  freight_amount_paisas: number;
  subtotal: number;
  tax: number;
  discount: number;
  net_amount: number;
  net_amount_paisas: number;
  status: 'DRAFT' | 'POSTED' | 'VOID';
  journal_id?: string;
  notes?: string;
  created_at: string;
}

export class PurchaseService {
  /**
   * Generates next sequential purchase bill number
   */
  public static generateBillNumber(companyId: string = DEFAULT_COMPANY_ID): string {
    const db = getDatabase();
    const cleanCompanyId = companyId || DEFAULT_COMPANY_ID;
    const today = new Date();
    const yyyymm = today.toISOString().slice(0, 7).replace('-', '');
    const prefix = `BILL-${yyyymm}-`;

    const lastBill = db.prepare(`
      SELECT bill_number FROM purchase_bills 
      WHERE company_id = ? AND bill_number LIKE ? 
      ORDER BY bill_number DESC LIMIT 1
    `).get(cleanCompanyId, `${prefix}%`) as { bill_number: string } | undefined;

    let seq = 1;
    if (lastBill) {
      const parts = lastBill.bill_number.split('-');
      const lastSeq = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastSeq)) seq = lastSeq + 1;
    }

    return `${prefix}${seq.toString().padStart(4, '0')}`;
  }

  /**
   * Create and optionally post a new purchase bill
   */
  public static createPurchaseBill(input: CreatePurchaseBillInput, companyIdOverride?: string): {
    billId: string;
    billNumber: string;
    journalId?: string;
    netAmountPaisas: number;
  } {
    const db = getDatabase();
    const companyId = input.companyId || companyIdOverride || DEFAULT_COMPANY_ID;

    if (!input.vendorId) throw new Error('Vendor is required for purchase bill');
    if (!input.vendorInvoiceNumber) throw new Error("Vendor's invoice number is required");
    if (!input.items || input.items.length === 0) throw new Error('At least one item is required on the bill');

    const vendor = db.prepare('SELECT id, name, company_name FROM vendors WHERE id = ? AND company_id = ?').get(input.vendorId, companyId) as any;
    if (!vendor) throw new Error('Vendor not found in this company');

    const billId = generateUUID();
    const billNumber = this.generateBillNumber(companyId);
    const status = input.status || 'POSTED';
    const freightTreatment = input.freightTreatment || 'LANDED_COST';
    const freightPaisas = input.freightAmountPaisas ?? (input.freightAmount ? toPaisas(input.freightAmount) : 0);

    let subtotalPaisas = 0;
    let totalTaxPaisas = 0;
    let totalDiscPaisas = 0;

    const processedItems: any[] = [];

    for (const item of input.items) {
      const prod = db.prepare(`
        SELECT id, name, sku, item_type, boxes_per_carton, pieces_per_box, total_pieces_per_carton, base_rate_per_piece_paisas, current_stock_base 
        FROM products WHERE id = ? AND company_id = ?
      `).get(item.productId, companyId) as any;

      if (!prod) throw new Error(`Product ${item.productId} not found in this company`);

      const ctn = Math.max(0, item.cartonsQty || 0);
      const box = Math.max(0, item.boxesQty || 0);
      const pcs = Math.max(0, item.loosePiecesQty || 0);

      const boxesPerCarton = Math.max(1, prod.boxes_per_carton || 1);
      const piecesPerBox = Math.max(1, prod.pieces_per_box || 1);

      let totalPieces = 0;
      if (prod.item_type === 'SERVICE') {
        totalPieces = pcs > 0 ? pcs : 1;
      } else {
        totalPieces = (ctn * boxesPerCarton * piecesPerBox) + (box * piecesPerBox) + pcs;
        if (totalPieces <= 0) {
          throw new Error(`Total pieces for ${prod.name} must be greater than 0.`);
        }
      }

      const ratePerPiecePaisas = item.ratePerPiecePaisas ?? (item.ratePerPiece ? toPaisas(item.ratePerPiece) : prod.base_rate_per_piece_paisas);
      const grossAmountPaisas = totalPieces * ratePerPiecePaisas;

      const discPct = item.discountPercent || 0;
      const discPaisas = item.discountPaisas ?? Math.round((grossAmountPaisas * discPct) / 100);
      const afterDisc = Math.max(0, grossAmountPaisas - discPaisas);

      const taxPct = item.taxPercent || 0;
      const taxPaisas = item.taxPaisas ?? Math.round((afterDisc * taxPct) / 100);
      const lineTotalPaisas = afterDisc + taxPaisas;

      subtotalPaisas += grossAmountPaisas;
      totalDiscPaisas += discPaisas;
      totalTaxPaisas += taxPaisas;

      processedItems.push({
        id: generateUUID(),
        billId,
        productId: prod.id,
        itemType: prod.item_type,
        itemReference: item.itemReference || null,
        batchNumber: item.batchNumber || null,
        expiryDate: item.expiryDate || null,
        cartonsQty: ctn,
        boxesQty: box,
        loosePiecesQty: pcs,
        totalPieces,
        ratePerPiecePaisas,
        grossAmountPaisas,
        taxPercent: taxPct,
        taxPaisas,
        discountPercent: discPct,
        discountPaisas: discPaisas,
        lineTotalPaisas,
      });
    }

    const itemsNetPaisas = subtotalPaisas - totalDiscPaisas + totalTaxPaisas;
    const netAmountPaisas = itemsNetPaisas + (freightTreatment !== 'NONE' ? freightPaisas : 0);

    let journalId: string | undefined = undefined;

    // Financial Posting if POSTED
    if (status === 'POSTED') {
      const acc1040 = AccountResolver.getInventoryAccount(companyId, { db });
      const acc2010 = AccountResolver.getAccountsPayableAccount(companyId, { db });
      const acc5040 = AccountResolver.resolveAccount(companyId, ['5040', '6040'], {
        purpose: 'Inward Freight Expense',
        required: freightTreatment === 'DIRECT_EXPENSE' && freightPaisas > 0,
        db,
      });

      const journalLines: CreateJournalLineInput[] = [];

      if (freightTreatment === 'LANDED_COST') {
        // Capitalize freight into Inventory asset
        const capitalizedInventoryPaisas = itemsNetPaisas + freightPaisas;
        journalLines.push({
          accountId: acc1040.id,
          debit: fromPaisas(capitalizedInventoryPaisas),
          credit: 0,
          memo: `Merchandise purchase (incl. Landed Freight ${fromPaisas(freightPaisas)}) - ${billNumber}`,
        });
      } else if (freightTreatment === 'DIRECT_EXPENSE') {
        // Separate direct expense
        journalLines.push({
          accountId: acc1040.id,
          debit: fromPaisas(itemsNetPaisas),
          credit: 0,
          memo: `Merchandise purchase - ${billNumber}`,
        });
        if (freightPaisas > 0 && acc5040) {
          journalLines.push({
            accountId: acc5040.id,
            debit: fromPaisas(freightPaisas),
            credit: 0,
            memo: `Inward freight & carriage - ${billNumber}`,
          });
        }
      } else {
        // None
        journalLines.push({
          accountId: acc1040.id,
          debit: fromPaisas(itemsNetPaisas),
          credit: 0,
          memo: `Merchandise purchase - ${billNumber}`,
        });
      }

      // Accounts Payable Credit with Sub-Ledger link
      journalLines.push({
        accountId: acc2010.id,
        debit: 0,
        credit: fromPaisas(netAmountPaisas),
        entityId: vendor.id,
        entityType: 'VENDOR',
        memo: `Purchase bill ${billNumber} (Inv #${input.vendorInvoiceNumber}) from ${vendor.name}`,
      });

      const entry = DoubleEntryEngine.postEntry({
        companyId,
        entryDate: input.billDate,
        description: `Purchase Bill ${billNumber} - ${vendor.name} (Ref: ${input.vendorInvoiceNumber})`,
        sourceModule: 'purchase',
        sourceDocumentId: billId,
        lines: journalLines,
        createdBy: 'Purchase Module',
      });
      journalId = entry.id;

      // Update physical inventory for non-service products
      const updateStockStmt = db.prepare(`
        UPDATE products 
        SET current_stock_base = current_stock_base + ?,
            current_stock = current_stock + ?
        WHERE id = ? AND company_id = ?
      `);

      for (const pi of processedItems) {
        if (pi.itemType !== 'SERVICE') {
          updateStockStmt.run(pi.totalPieces, pi.totalPieces, pi.productId, companyId);

          InventoryAuditService.recordMovement(db, {
            companyId,
            productId: pi.productId,
            movementDate: input.billDate,
            warehouse: input.warehouse || 'Main Warehouse',
            movementType: 'PURCHASE',
            sourceModule: 'purchase',
            sourceDocumentType: 'PURCHASE_BILL',
            documentNumber: billNumber,
            originalTransactionId: billId,
            referenceNumber: input.vendorInvoiceNumber || input.referenceNumber || null,
            quantityInBase: pi.totalPieces,
            quantityOutBase: 0,
            cartons: pi.cartonsQty,
            boxes: pi.boxesQty,
            pieces: pi.loosePiecesQty,
            unitCostPaisas: pi.ratePerPiecePaisas,
            totalCostPaisas: pi.grossAmountPaisas,
            notes: `Purchase Bill ${billNumber} from ${vendor.name}`,
            updateProductStock: false,
          });
        }
      }
    }

    // Insert purchase bill
    db.prepare(`
      INSERT INTO purchase_bills (
        id, company_id, bill_number, vendor_id, bill_date, due_date, warehouse, broker,
        vendor_invoice_number, reference_number, freight_treatment, freight_amount_paisas, freight_amount,
        subtotal_paisas, tax_amount_paisas, discount_amount_paisas, net_amount_paisas,
        subtotal, tax, discount, net_amount,
        paid_amount_paisas, paid_amount, remaining_balance_paisas, remaining_balance, payment_status,
        status, journal_id, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      billId,
      companyId,
      billNumber,
      input.vendorId,
      input.billDate,
      input.dueDate || null,
      input.warehouse || 'Main Warehouse',
      input.broker || null,
      input.vendorInvoiceNumber,
      input.referenceNumber || null,
      freightTreatment,
      freightPaisas,
      fromPaisas(freightPaisas),
      subtotalPaisas,
      totalTaxPaisas,
      totalDiscPaisas,
      netAmountPaisas,
      fromPaisas(subtotalPaisas),
      fromPaisas(totalTaxPaisas),
      fromPaisas(totalDiscPaisas),
      fromPaisas(netAmountPaisas),
      0,
      0.00,
      netAmountPaisas,
      fromPaisas(netAmountPaisas),
      'UNPAID',
      status,
      journalId || null,
      input.notes || null
    );

    // Insert items
    const insertItem = db.prepare(`
      INSERT INTO purchase_bill_items (
        id, company_id, bill_id, product_id, item_reference, batch_number, expiry_date,
        cartons_qty, boxes_qty, loose_pieces_qty, total_pieces,
        rate_per_piece_paisas, gross_amount_paisas, tax_percent, tax_paisas,
        discount_percent, discount_paisas, line_total_paisas,
        rate_per_piece, line_total
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const pi of processedItems) {
      insertItem.run(
        pi.id,
        companyId,
        pi.billId,
        pi.productId,
        pi.itemReference,
        pi.batchNumber,
        pi.expiryDate,
        pi.cartonsQty,
        pi.boxesQty,
        pi.loosePiecesQty,
        pi.totalPieces,
        pi.ratePerPiecePaisas,
        pi.grossAmountPaisas,
        pi.taxPercent,
        pi.taxPaisas,
        pi.discountPercent,
        pi.discountPaisas,
        pi.lineTotalPaisas,
        fromPaisas(pi.ratePerPiecePaisas),
        fromPaisas(pi.lineTotalPaisas)
      );
    }

    return {
      billId,
      billNumber,
      journalId,
      netAmountPaisas,
    };
  }

  /**
   * Universal DAL Async Purchase Bills with vendor details
   */
  public static async getPurchaseBillsAsync(
    filters?: {
      companyId?: string;
      search?: string;
      vendorId?: string;
      status?: string | string[];
      from?: string;
      to?: string;
      page?: number;
      limit?: number;
    },
    companyIdOverride?: string
  ): Promise<PurchaseBillSummary[]> {
    const { DalService } = await import('@/core/database/dal-services');
    return (await DalService.getPurchaseBills(filters, companyIdOverride)) as unknown as PurchaseBillSummary[];
  }

  /**
   * Get filtered purchase bills
   */
  public static getPurchaseBills(filters?: {
    companyId?: string;
    search?: string;
    vendorId?: string;
    status?: string | string[];
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }, companyIdOverride?: string): PurchaseBillSummary[] {
    const db = getDatabase();
    const companyId = filters?.companyId || companyIdOverride || DEFAULT_COMPANY_ID;

    let baseQuery = `
      FROM purchase_bills pb
      JOIN vendors v ON pb.vendor_id = v.id AND v.company_id = pb.company_id
      WHERE pb.company_id = ?
    `;
    const params: any[] = [companyId];

    if (filters?.search) {
      baseQuery += ` AND (pb.bill_number LIKE ? OR pb.vendor_invoice_number LIKE ? OR pb.reference_number LIKE ? OR pb.broker LIKE ? OR v.name LIKE ?)`;
      const term = `%${filters.search}%`;
      params.push(term, term, term, term, term);
    }

    if (filters?.vendorId) {
      baseQuery += ` AND pb.vendor_id = ?`;
      params.push(filters.vendorId);
    }

    if (filters?.status) {
      const statuses = (Array.isArray(filters.status) ? filters.status : filters.status.split(','))
        .map((s) => s.trim())
        .filter(Boolean);
      if (statuses.length === 1) {
        baseQuery += ` AND pb.status = ?`;
        params.push(statuses[0]);
      } else if (statuses.length > 1) {
        baseQuery += ` AND pb.status IN (${statuses.map(() => '?').join(', ')})`;
        params.push(...statuses);
      }
    }

    if (filters?.from) {
      baseQuery += ` AND pb.bill_date >= ?`;
      params.push(filters.from);
    }

    if (filters?.to) {
      baseQuery += ` AND pb.bill_date <= ?`;
      params.push(filters.to);
    }

    let total: number | undefined;
    const isPaginated = filters?.page !== undefined || filters?.limit !== undefined;
    const page = Math.max(1, filters?.page || 1);
    const limit = Math.min(200, Math.max(1, filters?.limit || 50));

    if (isPaginated) {
      const countRow = db.prepare(`SELECT COUNT(*) as count ${baseQuery}`).get(...params) as { count: number };
      total = countRow?.count || 0;
    }

    let query = `
      SELECT 
        pb.*,
        v.name as vendor_name,
        v.company_name
      ${baseQuery}
      ORDER BY pb.bill_date DESC, pb.created_at DESC
    `;

    const queryParams = [...params];
    if (isPaginated) {
      query += ` LIMIT ? OFFSET ?`;
      queryParams.push(limit, (page - 1) * limit);
    }

    const rows = db.prepare(query).all(...queryParams) as unknown as PurchaseBillSummary[];

    if (isPaginated && total !== undefined) {
      const totalPages = Math.ceil(total / limit) || 1;
      return Object.assign(rows, {
        pagination: {
          total,
          page,
          limit,
          totalPages,
        },
      });
    }

    return rows;
  }

  /**
   * Get single bill by ID with full line items and linked GL lines
   */
  public static getPurchaseBillById(id: string, companyIdOverride?: string): any {
    const db = getDatabase();
    const companyId = companyIdOverride || DEFAULT_COMPANY_ID;

    const bill = db.prepare(`
      SELECT pb.*, v.name as vendor_name, v.company_name, v.phone as vendor_phone, v.address as vendor_address, v.cnic_or_ntn
      FROM purchase_bills pb
      JOIN vendors v ON pb.vendor_id = v.id AND v.company_id = pb.company_id
      WHERE pb.id = ? AND pb.company_id = ?
    `).get(id, companyId) as any;

    if (!bill) return null;

    const items = db.prepare(`
      SELECT 
        pbi.*,
        p.name as product_name,
        p.sku as product_sku,
        p.item_type,
        p.uom_base,
        p.uom_bulk,
        p.boxes_per_carton,
        p.pieces_per_box,
        p.total_pieces_per_carton
      FROM purchase_bill_items pbi
      JOIN products p ON pbi.product_id = p.id AND p.company_id = ?
      WHERE pbi.bill_id = ? AND pbi.company_id = ?
      ORDER BY pbi.rowid ASC
    `).all(companyId, id, companyId);

    let journalLines: any[] = [];
    if (bill.journal_id) {
      journalLines = db.prepare(`
        SELECT jl.*, coa.code as account_code, coa.name as account_name
        FROM journal_lines jl
        JOIN chart_of_accounts coa ON jl.account_id = coa.id AND coa.company_id = ?
        WHERE jl.journal_id = ? AND jl.company_id = ?
        ORDER BY jl.debit_paisas DESC, jl.credit_paisas DESC
      `).all(companyId, bill.journal_id, companyId);
    }

    return {
      ...bill,
      items,
      journalLines,
    };
  }

  /**
   * Void purchase bill: reverses GL entry and rolls back inventory for non-service products
   */
  public static voidPurchaseBill(id: string, reason: string = 'User requested void', companyIdOverride?: string): { success: boolean; billNumber: string } {
    const db = getDatabase();
    const companyId = companyIdOverride || DEFAULT_COMPANY_ID;

    const bill = db.prepare('SELECT * FROM purchase_bills WHERE id = ? AND company_id = ?').get(id, companyId) as any;
    if (!bill) throw new Error(`Purchase bill ${id} not found in this company`);
    if (bill.status === 'VOID') throw new Error('Purchase bill is already voided');

    const items = db.prepare(`
      SELECT pbi.*, p.item_type 
      FROM purchase_bill_items pbi
      JOIN products p ON pbi.product_id = p.id AND p.company_id = ?
      WHERE pbi.bill_id = ? AND pbi.company_id = ?
    `).all(companyId, id, companyId) as any[];

    // 1. If bill was POSTED and has a journal entry, reverse it
    if (bill.status === 'POSTED' && bill.journal_id) {
      DoubleEntryEngine.voidEntry(bill.journal_id, `Voiding purchase bill ${bill.bill_number}: ${reason}`, companyId);

      // 2. Roll back physical inventory increments and record audit reversal
      const reversals = InventoryAuditService.recordReversal(db, {
        companyId,
        originalTransactionId: id,
        reason: `Purchase bill voided: ${reason}`,
      });

      if (reversals.length === 0) {
        const rollbackStock = db.prepare(`
          UPDATE products 
          SET current_stock_base = current_stock_base - ?,
              current_stock = current_stock - ?
          WHERE id = ? AND company_id = ?
        `);

        for (const it of items) {
          if (it.item_type !== 'SERVICE') {
            rollbackStock.run(it.total_pieces, it.total_pieces, it.product_id, companyId);
          }
        }
      }
    }

    // 3. Mark bill status as VOID
    db.prepare(`
      UPDATE purchase_bills 
      SET status = 'VOID', updated_at = datetime('now')
      WHERE id = ? AND company_id = ?
    `).run(id, companyId);

    return { success: true, billNumber: bill.bill_number };
  }

  /**
   * Edit purchase bill via atomic reversal and re-post
   */
  public static updatePurchaseBill(id: string, input: CreatePurchaseBillInput, companyIdOverride?: string): { billId: string; billNumber: string } {
    const db = getDatabase();
    const companyId = input.companyId || companyIdOverride || DEFAULT_COMPANY_ID;

    const bill = db.prepare('SELECT * FROM purchase_bills WHERE id = ? AND company_id = ?').get(id, companyId) as any;
    if (!bill) throw new Error(`Purchase bill ${id} not found in this company`);
    if (bill.status === 'VOID') throw new Error('Cannot edit a voided purchase bill');

    // 1. Revert previous GL and stock if was posted
    if (bill.status === 'POSTED' && bill.journal_id) {
      DoubleEntryEngine.voidEntry(bill.journal_id, `Reversal for editing purchase bill ${bill.bill_number}`, companyId);

      const prevItems = db.prepare(`
        SELECT pbi.*, p.item_type 
        FROM purchase_bill_items pbi
        JOIN products p ON pbi.product_id = p.id AND p.company_id = ?
        WHERE pbi.bill_id = ? AND pbi.company_id = ?
      `).all(companyId, id, companyId) as any[];

      const rollbackStock = db.prepare(`
        UPDATE products 
        SET current_stock_base = current_stock_base - ?,
            current_stock = current_stock - ?
        WHERE id = ? AND company_id = ?
      `);

      for (const it of prevItems) {
        if (it.item_type !== 'SERVICE') {
          rollbackStock.run(it.total_pieces, it.total_pieces, it.product_id, companyId);
        }
      }
    }

    // 2. Delete old bill items
    db.prepare('DELETE FROM purchase_bill_items WHERE bill_id = ? AND company_id = ?').run(id, companyId);

    // 3. Re-calculate with new input
    const vendor = db.prepare('SELECT id, name FROM vendors WHERE id = ? AND company_id = ?').get(input.vendorId, companyId) as any;
    if (!vendor) throw new Error('Vendor not found in this company');

    const freightTreatment = input.freightTreatment || 'LANDED_COST';
    const freightPaisas = input.freightAmountPaisas ?? (input.freightAmount ? toPaisas(input.freightAmount) : 0);

    let subtotalPaisas = 0;
    let totalTaxPaisas = 0;
    let totalDiscPaisas = 0;

    const processedItems: any[] = [];

    for (const item of input.items) {
      const prod = db.prepare(`
        SELECT id, name, sku, item_type, boxes_per_carton, pieces_per_box, total_pieces_per_carton, base_rate_per_piece_paisas, current_stock_base 
        FROM products WHERE id = ? AND company_id = ?
      `).get(item.productId, companyId) as any;

      if (!prod) throw new Error(`Product ${item.productId} not found in this company`);

      const ctn = Math.max(0, item.cartonsQty || 0);
      const box = Math.max(0, item.boxesQty || 0);
      const pcs = Math.max(0, item.loosePiecesQty || 0);

      const boxesPerCarton = Math.max(1, prod.boxes_per_carton || 1);
      const piecesPerBox = Math.max(1, prod.pieces_per_box || 1);

      let totalPieces = 0;
      if (prod.item_type === 'SERVICE') {
        totalPieces = pcs > 0 ? pcs : 1;
      } else {
        totalPieces = (ctn * boxesPerCarton * piecesPerBox) + (box * piecesPerBox) + pcs;
      }

      const ratePerPiecePaisas = item.ratePerPiecePaisas ?? (item.ratePerPiece ? toPaisas(item.ratePerPiece) : prod.base_rate_per_piece_paisas);
      const grossAmountPaisas = totalPieces * ratePerPiecePaisas;

      const discPct = item.discountPercent || 0;
      const discPaisas = item.discountPaisas ?? Math.round((grossAmountPaisas * discPct) / 100);
      const afterDisc = Math.max(0, grossAmountPaisas - discPaisas);

      const taxPct = item.taxPercent || 0;
      const taxPaisas = item.taxPaisas ?? Math.round((afterDisc * taxPct) / 100);
      const lineTotalPaisas = afterDisc + taxPaisas;

      subtotalPaisas += grossAmountPaisas;
      totalDiscPaisas += discPaisas;
      totalTaxPaisas += taxPaisas;

      processedItems.push({
        id: generateUUID(),
        billId: id,
        productId: prod.id,
        itemType: prod.item_type,
        itemReference: item.itemReference || null,
        batchNumber: item.batchNumber || null,
        expiryDate: item.expiryDate || null,
        cartonsQty: ctn,
        boxesQty: box,
        loosePiecesQty: pcs,
        totalPieces,
        ratePerPiecePaisas,
        grossAmountPaisas,
        taxPercent: taxPct,
        taxPaisas,
        discountPercent: discPct,
        discountPaisas: discPaisas,
        lineTotalPaisas,
      });
    }

    const itemsNetPaisas = subtotalPaisas - totalDiscPaisas + totalTaxPaisas;
    const netAmountPaisas = itemsNetPaisas + (freightTreatment !== 'NONE' ? freightPaisas : 0);

    let newJournalId: string | undefined = undefined;

    if ((input.status || 'POSTED') === 'POSTED') {
      const acc1040 = AccountResolver.getInventoryAccount(companyId, { db });
      const acc2010 = AccountResolver.getAccountsPayableAccount(companyId, { db });
      const acc5040 = AccountResolver.resolveAccount(companyId, ['5040', '6040'], {
        purpose: 'Inward Freight Expense',
        required: freightTreatment === 'DIRECT_EXPENSE' && freightPaisas > 0,
        db,
      });

      const journalLines: CreateJournalLineInput[] = [];

      if (freightTreatment === 'LANDED_COST') {
        journalLines.push({
          accountId: acc1040.id,
          debit: fromPaisas(itemsNetPaisas + freightPaisas),
          credit: 0,
          memo: `Merchandise purchase (incl. Landed Freight) - ${bill.bill_number}`,
        });
      } else if (freightTreatment === 'DIRECT_EXPENSE') {
        journalLines.push({
          accountId: acc1040.id,
          debit: fromPaisas(itemsNetPaisas),
          credit: 0,
          memo: `Merchandise purchase - ${bill.bill_number}`,
        });
        if (freightPaisas > 0 && acc5040) {
          journalLines.push({
            accountId: acc5040.id,
            debit: fromPaisas(freightPaisas),
            credit: 0,
            memo: `Inward freight - ${bill.bill_number}`,
          });
        }
      } else {
        journalLines.push({
          accountId: acc1040.id,
          debit: fromPaisas(itemsNetPaisas),
          credit: 0,
          memo: `Merchandise purchase - ${bill.bill_number}`,
        });
      }

      journalLines.push({
        accountId: acc2010.id,
        debit: 0,
        credit: fromPaisas(netAmountPaisas),
        entityId: vendor.id,
        entityType: 'VENDOR',
        memo: `Purchase bill ${bill.bill_number} (Inv #${input.vendorInvoiceNumber}) from ${vendor.name}`,
      });

      const entry = DoubleEntryEngine.postEntry({
        companyId,
        entryDate: input.billDate,
        description: `Amended Purchase Bill ${bill.bill_number} - ${vendor.name}`,
        sourceModule: 'purchase',
        sourceDocumentId: id,
        lines: journalLines,
        createdBy: 'Purchase Module',
      });
      newJournalId = entry.id;

      // Increment stock for non-service
      const addStock = db.prepare(`
        UPDATE products 
        SET current_stock_base = current_stock_base + ?,
            current_stock = current_stock + ?
        WHERE id = ? AND company_id = ?
      `);

      for (const pi of processedItems) {
        if (pi.itemType !== 'SERVICE') {
          addStock.run(pi.totalPieces, pi.totalPieces, pi.productId, companyId);
        }
      }
    }

    const paidPaisas = bill.paid_amount_paisas || 0;
    const remainingPaisas = Math.max(0, netAmountPaisas - paidPaisas);
    const paymentStatus = remainingPaisas === 0 ? 'PAID' : (paidPaisas > 0 ? 'PARTIAL' : 'UNPAID');

    // Update bill
    db.prepare(`
      UPDATE purchase_bills SET
        vendor_id = ?, bill_date = ?, due_date = ?, warehouse = ?, broker = ?,
        vendor_invoice_number = ?, reference_number = ?, freight_treatment = ?,
        freight_amount_paisas = ?, freight_amount = ?, subtotal_paisas = ?,
        tax_amount_paisas = ?, discount_amount_paisas = ?, net_amount_paisas = ?,
        subtotal = ?, tax = ?, discount = ?, net_amount = ?,
        remaining_balance_paisas = ?, remaining_balance = ?, payment_status = ?,
        status = ?, journal_id = ?, notes = ?, updated_at = datetime('now')
      WHERE id = ? AND company_id = ?
    `).run(
      input.vendorId,
      input.billDate,
      input.dueDate || null,
      input.warehouse || 'Main Warehouse',
      input.broker || null,
      input.vendorInvoiceNumber,
      input.referenceNumber || null,
      freightTreatment,
      freightPaisas,
      fromPaisas(freightPaisas),
      subtotalPaisas,
      totalTaxPaisas,
      totalDiscPaisas,
      netAmountPaisas,
      fromPaisas(subtotalPaisas),
      fromPaisas(totalTaxPaisas),
      fromPaisas(totalDiscPaisas),
      fromPaisas(netAmountPaisas),
      remainingPaisas,
      fromPaisas(remainingPaisas),
      paymentStatus,
      input.status || 'POSTED',
      newJournalId || null,
      input.notes || null,
      id,
      companyId
    );

    // Insert new items
    const insertItem = db.prepare(`
      INSERT INTO purchase_bill_items (
        id, company_id, bill_id, product_id, item_reference, batch_number, expiry_date,
        cartons_qty, boxes_qty, loose_pieces_qty, total_pieces,
        rate_per_piece_paisas, gross_amount_paisas, tax_percent, tax_paisas,
        discount_percent, discount_paisas, line_total_paisas,
        rate_per_piece, line_total
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const pi of processedItems) {
      insertItem.run(
        pi.id,
        companyId,
        pi.billId,
        pi.productId,
        pi.itemReference,
        pi.batchNumber,
        pi.expiryDate,
        pi.cartonsQty,
        pi.boxesQty,
        pi.loosePiecesQty,
        pi.totalPieces,
        pi.ratePerPiecePaisas,
        pi.grossAmountPaisas,
        pi.taxPercent,
        pi.taxPaisas,
        pi.discountPercent,
        pi.discountPaisas,
        pi.lineTotalPaisas,
        fromPaisas(pi.ratePerPiecePaisas),
        fromPaisas(pi.lineTotalPaisas)
      );
    }

    return { billId: id, billNumber: bill.bill_number };
  }

  /**
   * Delete & Reverse a purchase bill (draft or posted)
   */
  public static deleteBill(id: string, context?: any): { success: boolean; message?: string } {
    const { TransactionDeleteService } = require('@/core/transactions/transaction-delete.service');
    return TransactionDeleteService.deletePurchaseBill(id, context);
  }

  /**
   * Check if a vendor has any linked transactions or dependencies
   */
  public static checkVendorDependencies(vendorId: string, companyId?: string) {
    const { TransactionDeleteService } = require('@/core/transactions/transaction-delete.service');
    return TransactionDeleteService.checkVendorDependencies(vendorId, companyId);
  }

  public static async checkVendorDependenciesAsync(vendorId: string, companyId?: string) {
    const { TransactionDeleteService } = require('@/core/transactions/transaction-delete.service');
    return TransactionDeleteService.checkVendorDependenciesAsync(vendorId, companyId);
  }

  /**
   * Safely delete a vendor only if zero dependencies exist
   */
  public static deleteVendor(vendorId: string, companyId?: string): { success: boolean; message: string } {
    const { TransactionDeleteService } = require('@/core/transactions/transaction-delete.service');
    return TransactionDeleteService.deleteVendor(vendorId, companyId);
  }

  public static async deleteVendorAsync(vendorId: string, companyId?: string): Promise<{ success: boolean; message: string }> {
    const { TransactionDeleteService } = require('@/core/transactions/transaction-delete.service');
    return TransactionDeleteService.deleteVendorAsync(vendorId, companyId);
  }

  /**
   * Retrieve a vendor by ID scoped to company
   */
  public static getVendorById(id: string, companyId: string = DEFAULT_COMPANY_ID): any | null {
    const db = getDatabase();
    const vendor = db.prepare('SELECT * FROM vendors WHERE id = ? AND company_id = ?').get(id, companyId) as any;
    if (!vendor) return null;
    const subledger = DoubleEntryEngine.getSubLedger('VENDOR', vendor.id, companyId);
    const currentBalance = subledger.length > 0 ? subledger[subledger.length - 1].runningBalance : 0;
    return {
      ...vendor,
      current_balance: currentBalance,
    };
  }
}


