import { DatabaseSync } from 'node:sqlite';
import { getDatabase } from '@/core/database/db';
import { generateUUID } from '@/shared/utils/uuid';
import { toPaisas, fromPaisas } from '@/shared/utils/currency';
import { breakdownStock } from '@/shared/utils/uom';
import { DEFAULT_COMPANY_ID } from '@/core/tenancy/constants';
import {
  InventoryMovement,
  RecordMovementInput,
  RecordReversalInput,
  WarehouseTransferInput,
  MovementFilterOptions,
  ProductStockLedgerSummary,
  ProductStockLedgerRow,
  InventoryReconciliationReport,
  ReconciliationItem,
  AuditDashboardKPIs,
} from './audit.types';

export class InventoryAuditService {
  /**
   * Generates the next sequential gapless movement number (e.g. MOV-2026-000001)
   */
  private static getNextMovementNumber(db: DatabaseSync, companyId: string = DEFAULT_COMPANY_ID): string {
    const year = new Date().getFullYear();
    const prefix = `MOV-${year}-`;
    const cleanCompanyId = companyId || DEFAULT_COMPANY_ID;
    const row = db
      .prepare(
        `SELECT MAX(CAST(SUBSTR(movement_number, ${prefix.length + 1}) AS INTEGER)) as max_seq 
         FROM inventory_movements 
         WHERE company_id = ? AND movement_number LIKE ?`
      )
      .get(cleanCompanyId, `${prefix}%`) as { max_seq: number | null };

    const nextSeq = (row?.max_seq || 0) + 1;
    return `${prefix}${String(nextSeq).padStart(6, '0')}`;
  }

  /**
   * Generates the next sequential transfer number (e.g. TRF-2026-0001)
   */
  private static getNextTransferNumber(db: DatabaseSync, companyId: string = DEFAULT_COMPANY_ID): string {
    const year = new Date().getFullYear();
    const prefix = `TRF-${year}-`;
    const cleanCompanyId = companyId || DEFAULT_COMPANY_ID;
    const row = db
      .prepare(
        `SELECT MAX(CAST(SUBSTR(document_number, ${prefix.length + 1}) AS INTEGER)) as max_seq 
         FROM inventory_movements 
         WHERE company_id = ? AND document_number LIKE ?`
      )
      .get(cleanCompanyId, `${prefix}%`) as { max_seq: number | null };

    const nextSeq = (row?.max_seq || 0) + 1;
    return `${prefix}${String(nextSeq).padStart(4, '0')}`;
  }

  /**
   * Checks whether the given date falls on a closed business day
   */
  private static checkDayCloseStatus(db: DatabaseSync, dateStr: string, companyId: string = DEFAULT_COMPANY_ID): 'OPEN' | 'CLOSED' {
    const cleanDate = (dateStr || '').slice(0, 10);
    if (!cleanDate) return 'OPEN';

    const closed = db
      .prepare("SELECT id FROM daily_closings WHERE closing_date = ? AND status = 'CLOSED' AND company_id = ?")
      .get(cleanDate, companyId);
    return closed ? 'CLOSED' : 'OPEN';
  }

  /**
   * Atomically records a single stock movement into the immutable audit ledger.
   * If `updateProductStock !== false`, also updates `products.current_stock_base` in the SAME database transaction.
   */
  public static recordMovement(
    dbOrNull: DatabaseSync | null,
    input: RecordMovementInput
  ): InventoryMovement {
    const db = dbOrNull || getDatabase();
    const companyId = input.companyId || DEFAULT_COMPANY_ID;

    const product = db
      .prepare(
        `SELECT p.*, c.name as cat_name, b.name as b_name 
         FROM products p 
         LEFT JOIN categories c ON p.category_id = c.id AND c.company_id = p.company_id
         LEFT JOIN brands b ON p.brand_id = b.id AND b.company_id = p.company_id
         WHERE p.id = ? AND p.company_id = ?`
      )
      .get(input.productId, companyId) as any;

    if (!product) {
      throw new Error(`Product ${input.productId} not found for inventory audit recording.`);
    }

    const today = new Date().toISOString().split('T')[0];
    const movementDate = input.movementDate || today;
    const warehouse = input.warehouse || 'Main Warehouse';

    const qtyIn = Math.max(0, Math.floor(Number(input.quantityInBase) || 0));
    const qtyOut = Math.max(0, Math.floor(Number(input.quantityOutBase) || 0));
    const netQty = qtyIn - qtyOut;

    const bpc = Math.max(1, product.boxes_per_carton || 1);
    const ppb = Math.max(1, product.pieces_per_box || 1);
    const totalPiecesPerCarton = bpc * ppb;

    // Use passed cartons/boxes/pieces if provided, otherwise compute from net/positive qty
    const magnitude = Math.abs(netQty);
    let cartons = input.cartons ?? Math.floor(magnitude / totalPiecesPerCarton);
    let boxes = input.boxes ?? Math.floor((magnitude % totalPiecesPerCarton) / ppb);
    let pieces = input.pieces ?? ((magnitude % totalPiecesPerCarton) % ppb);

    // Baseline stocks
    const stockBefore = product.current_stock_base || 0;
    const stockAfter = stockBefore + netQty;

    // Costs
    const unitCostPaisas = input.unitCostPaisas ?? product.cost_price_paisas ?? 0;
    const unitCost = fromPaisas(unitCostPaisas);
    const totalCostPaisas = input.totalCostPaisas ?? (unitCostPaisas * magnitude);
    const totalCost = fromPaisas(totalCostPaisas);
    const sellingPrice = input.sellingPrice ?? product.selling_price ?? 0.0;

    const movementNumber = this.getNextMovementNumber(db, companyId);
    const movementId = generateUUID();
    const dayCloseStatus = this.checkDayCloseStatus(db, movementDate, companyId);

    // Insert immutable audit record
    db.prepare(`
      INSERT INTO inventory_movements (
        id, company_id, movement_number, movement_date, created_at,
        product_id, product_name, sku, barcode,
        category_id, category_name, brand_id, brand_name,
        warehouse, to_warehouse, movement_type, source_module, source_document_type,
        document_number, original_transaction_id, reference_number,
        quantity_in_base, quantity_out_base, net_quantity_base,
        cartons_count, boxes_count, pieces_count,
        stock_before_base, stock_after_base,
        unit_cost_paisas, unit_cost, total_cost_paisas, total_cost, selling_price,
        user_id, user_name, user_role, status,
        reversal_linked_movement_id, day_close_status, notes
      ) VALUES (
        ?, ?, ?, ?, datetime('now'),
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, 'POSTED',
        ?, ?, ?
      )
    `).run(
      movementId,
      companyId,
      movementNumber,
      movementDate,
      product.id,
      product.name,
      product.sku,
      product.barcode || null,
      product.category_id || null,
      product.cat_name || product.category || 'General',
      product.brand_id || null,
      product.b_name || product.brand_name || 'Generic / Unbranded',
      warehouse,
      input.toWarehouse || null,
      input.movementType,
      input.sourceModule || 'inventory',
      input.sourceDocumentType || input.movementType || 'MANUAL',
      input.documentNumber || null,
      input.originalTransactionId || null,
      input.referenceNumber || null,
      qtyIn,
      qtyOut,
      netQty,
      cartons,
      boxes,
      pieces,
      stockBefore,
      stockAfter,
      unitCostPaisas,
      unitCost,
      totalCostPaisas,
      totalCost,
      sellingPrice,
      input.userId || 'admin',
      input.userName || 'Administrator',
      input.userRole || 'ADMIN',
      input.reversalLinkedMovementId || null,
      dayCloseStatus,
      input.notes || null
    );

    // Update physical products stock if requested (default true)
    if (input.updateProductStock !== false && netQty !== 0) {
      db.prepare(`
        UPDATE products 
        SET current_stock_base = current_stock_base + ?,
            current_stock = current_stock + ?,
            updated_at = datetime('now')
        WHERE id = ? AND company_id = ?
      `).run(netQty, netQty, product.id, companyId);
    }

    return db.prepare('SELECT * FROM inventory_movements WHERE id = ? AND company_id = ?').get(movementId, companyId) as unknown as InventoryMovement;
  }

  /**
   * Reverses audit movements for a deleted/reversed transaction.
   * 1. Marks original audit movement(s) as REVERSED.
   * 2. Preserves all original metadata (document number, cost, before/after, user, reason).
   * 3. Creates explicit counter-movements linking back to the original movement ID.
   * 4. Updates product physical stock atomically.
   */
  public static recordReversal(
    dbOrNull: DatabaseSync | null,
    input: RecordReversalInput
  ): InventoryMovement[] {
    const db = dbOrNull || getDatabase();
    const companyId = input.companyId;

    let targetMovements: (InventoryMovement & { company_id?: string })[] = [];

    if (input.movementId) {
      let query = 'SELECT * FROM inventory_movements WHERE id = ?';
      const params: any[] = [input.movementId];
      if (companyId) {
        query += ' AND company_id = ?';
        params.push(companyId);
      }
      const mov = db.prepare(query).get(...params) as unknown as (InventoryMovement & { company_id?: string });
      if (mov && mov.status === 'POSTED') {
        targetMovements.push(mov);
      }
    } else if (input.originalTransactionId) {
      let query = "SELECT * FROM inventory_movements WHERE original_transaction_id = ? AND status = 'POSTED'";
      const params: any[] = [input.originalTransactionId];
      if (companyId) {
        query += ' AND company_id = ?';
        params.push(companyId);
      }
      targetMovements = db
        .prepare(query)
        .all(...params) as unknown as (InventoryMovement & { company_id?: string })[];
    }

    if (targetMovements.length === 0) {
      return [];
    }

    const createdReversals: InventoryMovement[] = [];
    const today = new Date().toISOString().split('T')[0];

    for (const orig of targetMovements) {
      const rowCompanyId = orig.company_id || companyId || DEFAULT_COMPANY_ID;

      // 1. Mark original movement as REVERSED
      db.prepare(`
        UPDATE inventory_movements
        SET status = 'REVERSED',
            reversed_by_user_id = ?,
            reversed_by_user_name = ?,
            reversed_at = datetime('now'),
            reversal_reason = ?,
            admin_override_details = ?
        WHERE id = ? AND company_id = ?
      `).run(
        input.userId || 'admin',
        input.userName || 'Administrator',
        input.reason,
        input.adminOverrideDetails || null,
        orig.id,
        rowCompanyId
      );

      // 2. Determine counter-reversal movement details
      const isOriginallyIn = orig.quantity_in_base > 0;
      const reverseType = isOriginallyIn ? 'REVERSAL_OUT' : 'REVERSAL_IN';
      const reverseQtyIn = isOriginallyIn ? 0 : orig.quantity_out_base;
      const reverseQtyOut = isOriginallyIn ? orig.quantity_in_base : 0;
      const reverseNetQty = reverseQtyIn - reverseQtyOut;

      const product = db.prepare('SELECT * FROM products WHERE id = ? AND company_id = ?').get(orig.product_id, rowCompanyId) as any;
      const currentStockBefore = product ? product.current_stock_base : 0;
      const currentStockAfter = currentStockBefore + reverseNetQty;

      const reversalNumber = this.getNextMovementNumber(db, rowCompanyId);
      const reversalId = generateUUID();
      const dayCloseStatus = this.checkDayCloseStatus(db, today, rowCompanyId);

      // 3. Insert counter-reversal audit movement
      db.prepare(`
        INSERT INTO inventory_movements (
          id, company_id, movement_number, movement_date, created_at,
          product_id, product_name, sku, barcode,
          category_id, category_name, brand_id, brand_name,
          warehouse, to_warehouse, movement_type, source_module, source_document_type,
          document_number, original_transaction_id, reference_number,
          quantity_in_base, quantity_out_base, net_quantity_base,
          cartons_count, boxes_count, pieces_count,
          stock_before_base, stock_after_base,
          unit_cost_paisas, unit_cost, total_cost_paisas, total_cost, selling_price,
          user_id, user_name, user_role, status,
          reversed_by_user_id, reversed_by_user_name, reversed_at,
          reversal_reason, admin_override_details, reversal_linked_movement_id,
          day_close_status, notes
        ) VALUES (
          ?, ?, ?, ?, datetime('now'),
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, 'POSTED',
          ?, ?, datetime('now'),
          ?, ?, ?,
          ?, ?
        )
      `).run(
        reversalId,
        rowCompanyId,
        reversalNumber,
        today,
        orig.product_id,
        orig.product_name,
        orig.sku,
        orig.barcode,
        orig.category_id,
        orig.category_name,
        orig.brand_id,
        orig.brand_name,
        orig.warehouse,
        orig.to_warehouse,
        reverseType,
        orig.source_module,
        orig.source_document_type,
        orig.document_number,
        orig.original_transaction_id,
        orig.reference_number,
        reverseQtyIn,
        reverseQtyOut,
        reverseNetQty,
        orig.cartons_count,
        orig.boxes_count,
        orig.pieces_count,
        currentStockBefore,
        currentStockAfter,
        orig.unit_cost_paisas,
        orig.unit_cost,
        orig.total_cost_paisas,
        orig.total_cost,
        orig.selling_price,
        input.userId || 'admin',
        input.userName || 'Administrator',
        input.userRole || 'ADMIN',
        input.userId || 'admin',
        input.userName || 'Administrator',
        input.reason,
        input.adminOverrideDetails || null,
        orig.id, // Linked back to original movement
        dayCloseStatus,
        `Reversal of ${orig.movement_number} (${orig.document_number}): ${input.reason}`
      );

      // 4. Update physical product stock (if requested, default true)
      if (input.updateProductStock !== false && reverseNetQty !== 0 && product) {
        db.prepare(`
          UPDATE products 
          SET current_stock_base = current_stock_base + ?,
              current_stock = current_stock + ?,
              updated_at = datetime('now')
          WHERE id = ? AND company_id = ?
        `).run(reverseNetQty, reverseNetQty, orig.product_id, rowCompanyId);
      }

      const rev = db.prepare('SELECT * FROM inventory_movements WHERE id = ? AND company_id = ?').get(reversalId, rowCompanyId) as unknown as InventoryMovement;
      createdReversals.push(rev);
    }

    return createdReversals;
  }

  /**
   * Records a warehouse or godown stock transfer between two locations
   */
  public static recordTransfer(
    input: WarehouseTransferInput
  ): { outMovement: InventoryMovement; inMovement: InventoryMovement } {
    const db = getDatabase();
    const companyId = input.companyId || DEFAULT_COMPANY_ID;

    if (!input.fromWarehouse || !input.toWarehouse) {
      throw new Error('Both source and destination warehouses are required.');
    }
    if (input.fromWarehouse.trim().toLowerCase() === input.toWarehouse.trim().toLowerCase()) {
      throw new Error('Source and destination warehouses cannot be the same.');
    }

    const product = db.prepare('SELECT * FROM products WHERE id = ? AND company_id = ?').get(input.productId, companyId) as any;
    if (!product) {
      throw new Error(`Product ${input.productId} not found.`);
    }

    const bpc = Math.max(1, product.boxes_per_carton || 1);
    const ppb = Math.max(1, product.pieces_per_box || 1);
    const totalPiecesPerCarton = bpc * ppb;

    let qtyBase = 0;
    if (input.cartons !== undefined || input.boxes !== undefined || input.pieces !== undefined) {
      qtyBase = ((input.cartons || 0) * totalPiecesPerCarton) + ((input.boxes || 0) * ppb) + (input.pieces || 0);
    } else if (input.quantityBase !== undefined) {
      qtyBase = Math.abs(Number(input.quantityBase) || 0);
    }

    if (qtyBase <= 0) {
      throw new Error('Transfer quantity must be greater than zero.');
    }

    const today = new Date().toISOString().split('T')[0];
    const transferDate = input.transferDate || today;
    const transferNumber = this.getNextTransferNumber(db, companyId);
    const breakdown = breakdownStock(qtyBase, bpc, ppb);

    db.exec('BEGIN IMMEDIATE TRANSACTION;');
    try {
      // 1. Record Outbound Movement from Source Warehouse (Does not reduce company total stock, so updateProductStock: false)
      const outMov = this.recordMovement(db, {
        companyId,
        productId: input.productId,
        movementDate: transferDate,
        warehouse: input.fromWarehouse,
        toWarehouse: input.toWarehouse,
        movementType: 'TRANSFER_OUT',
        sourceModule: 'inventory',
        sourceDocumentType: 'WAREHOUSE_TRANSFER',
        documentNumber: transferNumber,
        referenceNumber: input.referenceNumber,
        quantityInBase: 0,
        quantityOutBase: qtyBase,
        cartons: breakdown.cartons,
        boxes: breakdown.boxes,
        pieces: breakdown.pieces,
        unitCostPaisas: product.cost_price_paisas,
        totalCostPaisas: (product.cost_price_paisas || 0) * qtyBase,
        userId: input.userId,
        userName: input.userName,
        userRole: input.userRole,
        notes: input.notes || `Stock transfer to ${input.toWarehouse} [${breakdown.formatted}]`,
        updateProductStock: false,
      });

      // 2. Record Inbound Movement into Destination Warehouse
      const inMov = this.recordMovement(db, {
        companyId,
        productId: input.productId,
        movementDate: transferDate,
        warehouse: input.toWarehouse,
        toWarehouse: input.fromWarehouse,
        movementType: 'TRANSFER_IN',
        sourceModule: 'inventory',
        sourceDocumentType: 'WAREHOUSE_TRANSFER',
        documentNumber: transferNumber,
        referenceNumber: input.referenceNumber,
        quantityInBase: qtyBase,
        quantityOutBase: 0,
        cartons: breakdown.cartons,
        boxes: breakdown.boxes,
        pieces: breakdown.pieces,
        unitCostPaisas: product.cost_price_paisas,
        totalCostPaisas: (product.cost_price_paisas || 0) * qtyBase,
        userId: input.userId,
        userName: input.userName,
        userRole: input.userRole,
        notes: input.notes || `Stock transfer received from ${input.fromWarehouse} [${breakdown.formatted}]`,
        reversalLinkedMovementId: outMov.id,
        updateProductStock: false,
      });

      db.exec('COMMIT;');
      return { outMovement: outMov, inMovement: inMov };
    } catch (e) {
      db.exec('ROLLBACK;');
      throw e;
    }
  }

  /**
   * Generates a complete chronological Stock Ledger for a specific product.
   * Calculates dynamic running balance row-by-row.
   */
  public static getProductLedger(
    productId: string,
    options?: {
      companyId?: string;
      warehouse?: string;
      fromDate?: string;
      toDate?: string;
      status?: string;
    }
  ): ProductStockLedgerSummary {
    const db = getDatabase();
    const companyId = options?.companyId || DEFAULT_COMPANY_ID;

    const product = db
      .prepare(
        `SELECT p.*, c.name as cat_name, b.name as b_name 
         FROM products p 
         LEFT JOIN categories c ON p.category_id = c.id AND c.company_id = p.company_id
         LEFT JOIN brands b ON p.brand_id = b.id AND b.company_id = p.company_id
         WHERE p.id = ? AND p.company_id = ?`
      )
      .get(productId, companyId) as any;

    if (!product) {
      throw new Error(`Product ${productId} not found.`);
    }

    const bpc = Math.max(1, product.boxes_per_carton || 1);
    const ppb = Math.max(1, product.pieces_per_box || 1);

    // Fetch all movements for this product up to toDate
    let query = `
      SELECT * 
      FROM inventory_movements 
      WHERE product_id = ? AND company_id = ?
    `;
    const params: any[] = [productId, companyId];

    if (options?.warehouse && options.warehouse !== 'ALL') {
      query += ` AND warehouse = ?`;
      params.push(options.warehouse);
    }

    if (options?.toDate) {
      query += ` AND movement_date <= ?`;
      params.push(options.toDate);
    }

    // Chronological ordering
    query += ` ORDER BY movement_date ASC, movement_number ASC, rowid ASC`;

    const allMovements = db.prepare(query).all(...params) as unknown as InventoryMovement[];

    let runningBalance = 0;
    let openingBalance = 0;
    let totalIn = 0;
    let totalOut = 0;

    const fromDate = options?.fromDate;
    const rows: ProductStockLedgerRow[] = [];

    for (const m of allMovements) {
      const net = m.net_quantity_base;
      runningBalance += net;

      // If before fromDate, accumulate to opening balance
      if (fromDate && m.movement_date < fromDate) {
        openingBalance = runningBalance;
        continue;
      }

      // Filter by status if specified
      if (options?.status && options.status !== 'ALL' && m.status !== options.status) {
        continue;
      }

      totalIn += m.quantity_in_base;
      totalOut += m.quantity_out_base;

      const breakdown = breakdownStock(Math.abs(net), bpc, ppb);

      rows.push({
        id: m.id,
        movementNumber: m.movement_number,
        date: m.movement_date,
        createdAt: m.created_at,
        documentNumber: m.document_number,
        sourceDocumentType: m.source_document_type,
        originalTransactionId: m.original_transaction_id,
        type: m.movement_type,
        warehouse: m.warehouse,
        quantityIn: m.quantity_in_base,
        quantityOut: m.quantity_out_base,
        netChange: net,
        balance: runningBalance,
        cartons: m.cartons_count,
        boxes: m.boxes_count,
        pieces: m.pieces_count,
        formattedBreakdown: breakdown.formatted,
        unitCost: m.unit_cost,
        totalValue: m.total_cost,
        user: m.user_name || 'System',
        status: m.status,
        notes: m.notes || '',
        reversalReason: m.reversal_reason,
        reversedBy: m.reversed_by_user_name,
        reversedAt: m.reversed_at,
        reversalLinkedMovementId: m.reversal_linked_movement_id,
      });
    }

    const closingBalance = runningBalance;
    const unitCost = product.cost_price || 0.0;
    const closingStockValue = Number((closingBalance * unitCost).toFixed(2));

    return {
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      category: product.cat_name || product.category || 'General',
      brand: product.b_name || product.brand_name || 'Generic / Unbranded',
      currentStock: product.current_stock_base,
      costPrice: product.cost_price,
      tradePrice: product.selling_price || product.trade_price,
      warehouse: options?.warehouse || 'Consolidated (All Warehouses)',
      openingBalance,
      totalIn,
      totalOut,
      closingBalance,
      closingStockValue,
      rows,
    };
  }

  /**
   * Search and filter movements across the entire system
   */
  public static getMovements(
    filter: MovementFilterOptions
  ): { movements: InventoryMovement[]; total: number } {
    const db = getDatabase();
    const companyId = filter.companyId || DEFAULT_COMPANY_ID;

    let whereClause = 'WHERE company_id = ?';
    const params: any[] = [companyId];

    if (filter.fromDate) {
      whereClause += ' AND movement_date >= ?';
      params.push(filter.fromDate);
    }
    if (filter.toDate) {
      whereClause += ' AND movement_date <= ?';
      params.push(filter.toDate);
    }
    if (filter.productId && filter.productId !== 'ALL') {
      whereClause += ' AND product_id = ?';
      params.push(filter.productId);
    }
    if (filter.sku) {
      whereClause += ' AND sku LIKE ?';
      params.push(`%${filter.sku.trim()}%`);
    }
    if (filter.categoryId && filter.categoryId !== 'ALL') {
      whereClause += ' AND category_id = ?';
      params.push(filter.categoryId);
    }
    if (filter.warehouse && filter.warehouse !== 'ALL') {
      whereClause += ' AND warehouse = ?';
      params.push(filter.warehouse);
    }
    if (filter.movementType && filter.movementType !== 'ALL') {
      whereClause += ' AND movement_type = ?';
      params.push(filter.movementType);
    }
    if (filter.sourceModule && filter.sourceModule !== 'ALL') {
      whereClause += ' AND source_module = ?';
      params.push(filter.sourceModule);
    }
    if (filter.documentNumber) {
      whereClause += ' AND (document_number LIKE ? OR movement_number LIKE ?)';
      params.push(`%${filter.documentNumber.trim()}%`, `%${filter.documentNumber.trim()}%`);
    }
    if (filter.user) {
      whereClause += ' AND user_name LIKE ?';
      params.push(`%${filter.user.trim()}%`);
    }
    if (filter.status && filter.status !== 'ALL') {
      whereClause += ' AND status = ?';
      params.push(filter.status);
    }

    // High level transaction category filter
    if (filter.transactionCategory && filter.transactionCategory !== 'ALL') {
      switch (filter.transactionCategory) {
        case 'SALES':
          whereClause += " AND (movement_type IN ('SALE_ORDER', 'DIRECT_SALE') OR (movement_type IN ('REVERSAL_IN', 'REVERSAL_OUT') AND source_module = 'sales'))";
          break;
        case 'PURCHASE':
          whereClause += " AND (movement_type = 'PURCHASE' OR (movement_type IN ('REVERSAL_IN', 'REVERSAL_OUT') AND source_module = 'purchase'))";
          break;
        case 'RETURN':
          whereClause += " AND (movement_type IN ('SALE_RETURN', 'PURCHASE_RETURN') OR (movement_type IN ('REVERSAL_IN', 'REVERSAL_OUT') AND source_module = 'returns'))";
          break;
        case 'ADJUSTMENT':
          whereClause += " AND (movement_type IN ('STOCK_ADJUSTMENT', 'OPENING_STOCK') OR (movement_type IN ('REVERSAL_IN', 'REVERSAL_OUT') AND source_module = 'inventory'))";
          break;
        case 'TRANSFER':
          whereClause += " AND movement_type IN ('TRANSFER_IN', 'TRANSFER_OUT')";
          break;
      }
    }

    const countRow = db
      .prepare(`SELECT count(*) as count FROM inventory_movements ${whereClause}`)
      .get(...params) as { count: number };
    const total = countRow?.count || 0;

    let query = `
      SELECT * FROM inventory_movements 
      ${whereClause} 
      ORDER BY movement_date DESC, movement_number DESC, created_at DESC, id DESC 
    `;

    if (filter.limit !== undefined) {
      query += ' LIMIT ?';
      params.push(Math.max(1, filter.limit));
      if (filter.offset !== undefined) {
        query += ' OFFSET ?';
        params.push(Math.max(0, filter.offset));
      }
    }

    const movements = db.prepare(query).all(...params) as unknown as InventoryMovement[];
    return { movements, total };
  }

  /**
   * Generates Inventory Reconciliation comparing System Current Stock against Ledger Calculated Stock
   */
  public static getReconciliationReport(companyId: string = DEFAULT_COMPANY_ID): InventoryReconciliationReport {
    const db = getDatabase();

    const products = db.prepare(`
      SELECT p.*, c.name as cat_name 
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id AND c.company_id = p.company_id
      WHERE p.company_id = ?
      ORDER BY p.name ASC
    `).all(companyId) as any[];

    // Batch query 1: aggregate movements per product
    const ledgerRows = db.prepare(`
      SELECT 
        product_id,
        COALESCE(SUM(net_quantity_base), 0) as calc_stock,
        MAX(movement_date) as last_date,
        COUNT(*) as mov_count
      FROM inventory_movements 
      WHERE company_id = ?
      GROUP BY product_id
    `).all(companyId) as Array<{ product_id: string; calc_stock: number; last_date: string | null; mov_count: number }>;

    const ledgerMap = new Map<string, { calc_stock: number; last_date: string | null; mov_count: number }>();
    for (const lr of ledgerRows) {
      ledgerMap.set(lr.product_id, lr);
    }

    // Batch query 2: latest document number per product
    const latestDocs = db.prepare(`
      SELECT m1.product_id, m1.document_number
      FROM inventory_movements m1
      JOIN (
        SELECT product_id, MAX(created_at) as max_created
        FROM inventory_movements
        WHERE company_id = ?
        GROUP BY product_id
      ) m2 ON m1.product_id = m2.product_id AND m1.created_at = m2.max_created
      WHERE m1.company_id = ?
    `).all(companyId, companyId) as Array<{ product_id: string; document_number: string }>;

    const latestDocMap = new Map<string, string>();
    for (const ld of latestDocs) {
      if (!latestDocMap.has(ld.product_id)) {
        latestDocMap.set(ld.product_id, ld.document_number);
      }
    }

    const today = new Date().toISOString().split('T')[0];
    const items: ReconciliationItem[] = [];

    let totalVariancePieces = 0;
    let totalVarianceValue = 0;
    let matchedCount = 0;
    let varianceCount = 0;

    for (const p of products) {
      const systemStock = p.current_stock_base || 0;
      const ledgerRow = ledgerMap.get(p.id) || { calc_stock: 0, last_date: null, mov_count: 0 };
      const ledgerStock = ledgerRow.calc_stock;
      const difference = systemStock - ledgerStock;
      const hasVariance = difference !== 0;
      const lastDocNumber = latestDocMap.get(p.id) || null;

      let possibleSource = 'Ledger and system stock are perfectly in sync.';
      if (hasVariance) {
        varianceCount++;
        totalVariancePieces += Math.abs(difference);
        totalVarianceValue += Math.abs(difference) * (p.cost_price || 0);

        if (ledgerRow.mov_count === 0) {
          possibleSource = 'Product has initial stock without an opening ledger entry.';
        } else if (difference > 0) {
          possibleSource = `System stock has ${difference} pieces more than recorded audit ledger. Potential direct database update or unrecorded receipt.`;
        } else {
          possibleSource = `System stock is ${Math.abs(difference)} pieces less than audit ledger. Unrecorded stock decrement or bypass of audit trail.`;
        }
      } else {
        matchedCount++;
      }

      items.push({
        productId: p.id,
        productName: p.name,
        sku: p.sku,
        category: p.cat_name || p.category || 'General',
        warehouse: 'Main Warehouse',
        systemCurrentStock: systemStock,
        ledgerCalculatedStock: ledgerStock,
        difference,
        hasVariance,
        lastMovementDate: ledgerRow?.last_date || null,
        lastDocumentNumber: lastDocNumber,
        possibleSource,
      });
    }

    return {
      asOfDate: today,
      totalProductsChecked: products.length,
      matchedCount,
      varianceCount,
      totalVariancePieces,
      totalVarianceValue: Number(totalVarianceValue.toFixed(2)),
      items,
    };
  }

  /**
   * Retrieves high-level KPI cards for the Inventory Audit Dashboard
   */
  public static getDashboardKPIs(companyId: string = DEFAULT_COMPANY_ID): AuditDashboardKPIs {
    const db = getDatabase();
    const today = new Date().toISOString().split('T')[0];

    // Total products & total stock value
    const prodRow = db.prepare(`
      SELECT 
        COUNT(*) as total_prods,
        COALESCE(SUM(current_stock_base * (cost_price_paisas / 100.0)), 0) as total_val,
        SUM(CASE WHEN current_stock_base < 0 THEN 1 ELSE 0 END) as negative_prods
      FROM products
      WHERE company_id = ?
    `).get(companyId) as { total_prods: number; total_val: number; negative_prods: number };

    // Stock in / out today
    const todayRow = db.prepare(`
      SELECT 
        COALESCE(SUM(quantity_in_base), 0) as in_today,
        COALESCE(SUM(quantity_out_base), 0) as out_today
      FROM inventory_movements
      WHERE movement_date = ? AND company_id = ?
    `).get(today, companyId) as { in_today: number; out_today: number };

    // Total adjustments
    const adjRow = db.prepare(`
      SELECT COUNT(*) as adj_count 
      FROM inventory_movements 
      WHERE movement_type IN ('STOCK_ADJUSTMENT', 'OPENING_STOCK', 'DAMAGE_WRITEOFF') AND company_id = ?
    `).get(companyId) as { adj_count: number };

    // Total reversals / deletions
    const revRow = db.prepare(`
      SELECT COUNT(*) as rev_count 
      FROM inventory_movements 
      WHERE (movement_type IN ('REVERSAL_IN', 'REVERSAL_OUT') OR status = 'REVERSED') AND company_id = ?
    `).get(companyId) as { rev_count: number };

    // Reconciliation variance count
    const recon = this.getReconciliationReport(companyId);

    return {
      totalProducts: prodRow?.total_prods || 0,
      totalStockValue: Number((prodRow?.total_val || 0).toFixed(2)),
      stockInToday: todayRow?.in_today || 0,
      stockOutToday: todayRow?.out_today || 0,
      totalAdjustments: adjRow?.adj_count || 0,
      totalReversals: revRow?.rev_count || 0,
      productsWithVariance: recon.varianceCount,
      negativeStockCount: prodRow?.negative_prods || 0,
    };
  }

  /**
   * Retrieves warehouse-wise stock summaries
   */
  public static getWarehouseSummaries(companyId: string = DEFAULT_COMPANY_ID): Array<{
    warehouse: string;
    totalProducts: number;
    totalPieces: number;
    totalValue: number;
  }> {
    const db = getDatabase();

    const rows = db.prepare(`
      SELECT 
        warehouse,
        COUNT(DISTINCT product_id) as total_prods,
        COALESCE(SUM(net_quantity_base), 0) as total_pieces,
        COALESCE(SUM(net_quantity_base * unit_cost), 0) as total_val
      FROM inventory_movements
      WHERE company_id = ?
      GROUP BY warehouse
      ORDER BY warehouse ASC
    `).all(companyId) as any[];

    return rows.map((r) => ({
      warehouse: r.warehouse || 'Main Warehouse',
      totalProducts: Number(r.total_prods) || 0,
      totalPieces: Number(r.total_pieces) || 0,
      totalValue: Number(Number(r.total_val || 0).toFixed(2)),
    }));
  }
}
