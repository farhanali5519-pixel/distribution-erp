import { getDatabase } from '@/core/database/db';
import { generateUUID } from '@/shared/utils/uuid';
import { toPaisas, fromPaisas } from '@/shared/utils/currency';
import { DoubleEntryEngine } from '@/core/accounting/engine';
import { breakdownStock, toBasePieces, formatPackagingRatio, calculatePiecesPerCarton } from '@/shared/utils/uom';
import { DEFAULT_COMPANY_ID } from '@/core/tenancy/constants';
import { InventoryAuditService } from './audit.service';

export interface ProductWithStock {
  id: string;
  company_id?: string;
  sku: string;
  barcode: string | null;
  name: string;
  category_id: string | null;
  category_name: string;
  brand_id: string | null;
  brand_name: string;
  uom_base: string;
  uom_bulk: string;
  bulk_conversion_factor: number;
  boxes_per_carton: number;
  pieces_per_box: number;
  total_pieces_per_carton: number;
  packaging_ratio: string;
  base_rate_per_piece_paisas: number;
  base_rate_per_piece: number;
  item_type: 'STANDARD' | 'BATCH' | 'SERVICE';
  costing_method: 'FIFO' | 'AVCO';
  cost_price_paisas: number;
  trade_price_paisas: number;
  mrp_paisas: number;
  cost_price: number;
  trade_price: number;
  mrp: number;
  margin_percentage: number;
  current_stock_base: number;
  stock_cartons: number;
  stock_boxes: number;
  stock_pieces: number;
  formatted_stock: string;
  stock_summary: string;
  min_stock_alert: number;
  is_low_stock: boolean;
  is_active: number;
}

export interface CreateProductInput {
  sku: string;
  barcode?: string;
  name: string;
  categoryId?: string;
  brandId?: string;
  boxesPerCarton?: number;
  piecesPerBox?: number;
  uomBase?: string;
  uomBulk?: string;
  costPrice: number; // in PKR
  tradePrice: number; // in PKR (TP)
  mrp: number; // in PKR
  initialStockBase?: number;
  initialCartons?: number;
  initialBoxes?: number;
  initialPieces?: number;
  minStockAlert?: number;
}

export interface UpdateProductInput {
  sku?: string;
  barcode?: string;
  name?: string;
  categoryId?: string | null;
  brandId?: string | null;
  boxesPerCarton?: number;
  piecesPerBox?: number;
  costPrice?: number;
  tradePrice?: number;
  mrp?: number;
  minStockAlert?: number;
  isActive?: boolean | number;
}

export interface StockAdjustmentInput {
  productId: string;
  adjustmentType: 'INCREASE' | 'DECREASE';
  quantityBase?: number;
  cartons?: number;
  boxes?: number;
  pieces?: number;
  reason: string;
  postToGL?: boolean;
}

export class InventoryService {
  /**
   * Universal DAL Async Products list with stock breakdown and metrics
   */
  public static async getProductsAsync(
    optionsOrCompanyId?: string | { maskCost?: boolean; categoryId?: string; categoryIds?: string[]; brandId?: string; brandIds?: string[]; companyId?: string },
    client?: import('@/core/database/types').IDatabaseClient | import('@/core/database/types').ITransactionClient
  ): Promise<ProductWithStock[]> {
    const options = typeof optionsOrCompanyId === 'string'
      ? { companyId: optionsOrCompanyId }
      : (optionsOrCompanyId || {});
    const { DalService } = await import('@/core/database/dal-services');
    return (await DalService.getProductsDetailed(options, client)) as ProductWithStock[];
  }

  /**
   * Get all products with 3-tier CTN / BOX / PCS stock breakdown, brand info, and pricing metrics
   */
  public static getProducts(options?: { maskCost?: boolean; categoryId?: string; categoryIds?: string[]; brandId?: string; brandIds?: string[]; companyId?: string }): ProductWithStock[] {
    const db = getDatabase();
    const maskCost = !!options?.maskCost;
    const companyId = options?.companyId || DEFAULT_COMPANY_ID;

    let query = `
      SELECT 
        p.*,
        c.name as cat_name,
        b.name as b_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id AND c.company_id = p.company_id
      LEFT JOIN brands b ON p.brand_id = b.id AND b.company_id = p.company_id
      WHERE p.company_id = ?
    `;
    const params: any[] = [companyId];

    if (options?.categoryIds && options.categoryIds.length > 0) {
      const placeholders = options.categoryIds.map(() => '?').join(', ');
      query += ` AND p.category_id IN (${placeholders})`;
      params.push(...options.categoryIds);
    } else if (options?.categoryId) {
      query += ` AND p.category_id = ?`;
      params.push(options.categoryId);
    }

    if (options?.brandIds && options.brandIds.length > 0) {
      const placeholders = options.brandIds.map(() => '?').join(', ');
      query += ` AND p.brand_id IN (${placeholders})`;
      params.push(...options.brandIds);
    } else if (options?.brandId) {
      query += ` AND p.brand_id = ?`;
      params.push(options.brandId);
    }

    query += ` ORDER BY p.name ASC`;

    const rows = db.prepare(query).all(...params) as any[];

    return rows.map((p) => {
      const boxesPerCarton = Math.max(1, p.boxes_per_carton || 1);
      const piecesPerBox = Math.max(1, p.pieces_per_box || (p.bulk_conversion_factor || 1));
      const totalPiecesPerCarton = Math.max(1, p.total_pieces_per_carton || (boxesPerCarton * piecesPerBox));

      const stockBase = Number(p.current_stock_base ?? p.current_stock) || 0;
      const breakdown = breakdownStock(stockBase, boxesPerCarton, piecesPerBox);

      const bulkName = p.uom_bulk || 'CARTON';
      const baseName = p.uom_base || 'PIECE';

      const costPaisas = p.cost_price_paisas || toPaisas(p.cost_price || 0);
      const tpPaisas = p.trade_price_paisas || toPaisas(p.selling_price || 0);
      const mrpPaisas = p.mrp_paisas || Math.round(tpPaisas * 1.12);

      const costDecimal = fromPaisas(costPaisas);
      const tpDecimal = fromPaisas(tpPaisas);
      const mrpDecimal = fromPaisas(mrpPaisas);

      const margin = tpDecimal > 0 ? ((tpDecimal - costDecimal) / tpDecimal) * 100 : 0;
      const isLowStock = p.min_stock_alert > 0 && stockBase <= p.min_stock_alert;

      // Canonical rule: cost_price_paisas = cost of ONE PCS, base_rate_per_piece_paisas = same PCS cost.
      // Do NOT divide by totalPiecesPerCarton when cost_price_paisas is already per-piece.
      const rawBaseRatePaisas = p.base_rate_per_piece_paisas || costPaisas;

      return {
        id: p.id,
        company_id: p.company_id,
        sku: p.sku,
        barcode: p.barcode,
        name: p.name,
        category_id: p.category_id,
        category_name: p.cat_name || p.category || 'General',
        brand_id: p.brand_id,
        brand_name: p.b_name || p.brand_name || 'Generic / Unbranded',
        uom_base: baseName,
        uom_bulk: bulkName,
        bulk_conversion_factor: totalPiecesPerCarton,
        boxes_per_carton: boxesPerCarton,
        pieces_per_box: piecesPerBox,
        total_pieces_per_carton: totalPiecesPerCarton,
        packaging_ratio: formatPackagingRatio(boxesPerCarton, piecesPerBox),
        base_rate_per_piece_paisas: maskCost ? 0 : rawBaseRatePaisas,
        base_rate_per_piece: maskCost ? 0 : fromPaisas(rawBaseRatePaisas),
        item_type: p.item_type || 'STANDARD',
        costing_method: p.costing_method || 'FIFO',
        cost_price_paisas: maskCost ? 0 : costPaisas,
        trade_price_paisas: tpPaisas,
        mrp_paisas: mrpPaisas,
        cost_price: maskCost ? 0 : costDecimal,
        trade_price: tpDecimal,
        mrp: mrpDecimal,
        margin_percentage: maskCost ? 0 : Math.round(margin * 10) / 10,
        current_stock_base: stockBase,
        stock_cartons: breakdown.cartons,
        stock_boxes: breakdown.boxes,
        stock_pieces: breakdown.pieces,
        formatted_stock: breakdown.formatted,
        stock_summary: breakdown.summary,
        min_stock_alert: p.min_stock_alert || 0,
        is_low_stock: isLowStock,
        is_active: p.is_active,
      };
    });
  }

  /**
   * Retrieve a single product by ID scoped to company
   */
  public static getProductById(id: string, companyId: string = DEFAULT_COMPANY_ID): ProductWithStock | null {
    const products = this.getProducts({ companyId });
    return products.find((p) => p.id === id) || null;
  }

  /**
   * Create a new product with 3-tier UOM and pricing tiers
   */
  public static createProduct(input: CreateProductInput, companyId: string = DEFAULT_COMPANY_ID): ProductWithStock {
    const db = getDatabase();
    const cleanCompanyId = companyId || DEFAULT_COMPANY_ID;
    const id = generateUUID();

    const costPaisas = toPaisas(input.costPrice);
    const tpPaisas = toPaisas(input.tradePrice);
    const mrpPaisas = toPaisas(input.mrp);

    const costDecimal = fromPaisas(costPaisas);
    const tpDecimal = fromPaisas(tpPaisas);
    const mrpDecimal = fromPaisas(mrpPaisas);

    const boxesPerCarton = Math.max(1, Math.floor(Number(input.boxesPerCarton) || 1));
    const piecesPerBox = Math.max(1, Math.floor(Number(input.piecesPerBox) || 1));
    const totalPiecesPerCarton = calculatePiecesPerCarton(boxesPerCarton, piecesPerBox);

    // Compute initial stock in base pieces
    let stockBase = 0;
    if (input.initialCartons !== undefined || input.initialBoxes !== undefined || input.initialPieces !== undefined) {
      stockBase = toBasePieces(
        input.initialCartons || 0,
        input.initialBoxes || 0,
        input.initialPieces || 0,
        boxesPerCarton,
        piecesPerBox
      );
    } else if (input.initialStockBase !== undefined) {
      stockBase = Math.max(0, Math.floor(Number(input.initialStockBase) || 0));
    }

    // Resolve category name (ensuring it belongs to this company)
    let catName = 'General';
    if (input.categoryId) {
      const cat = db.prepare('SELECT name FROM categories WHERE id = ? AND company_id = ?').get(input.categoryId, cleanCompanyId) as any;
      if (cat) catName = cat.name;
    }

    // Resolve brand name (ensuring it belongs to this company)
    let brandName = 'Generic / Unbranded';
    if (input.brandId) {
      const brand = db.prepare('SELECT name FROM brands WHERE id = ? AND company_id = ?').get(input.brandId, cleanCompanyId) as any;
      if (brand) brandName = brand.name;
    }

    // Verify SKU uniqueness within company
    const existingSku = db.prepare('SELECT id FROM products WHERE UPPER(sku) = UPPER(?) AND company_id = ?').get(input.sku.trim(), cleanCompanyId) as any;
    if (existingSku) {
      throw new Error(`Product with SKU "${input.sku}" already exists in this company.`);
    }

    db.prepare(`
      INSERT INTO products (
        id, company_id, sku, barcode, name, category_id, category, brand_id, brand_name,
        uom_base, uom_bulk, bulk_conversion_factor,
        boxes_per_carton, pieces_per_box, total_pieces_per_carton,
        base_rate_per_piece_paisas, cost_price_paisas, trade_price_paisas, mrp_paisas,
        cost_price, selling_price, current_stock_base, current_stock, min_stock_alert, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      id,
      cleanCompanyId,
      input.sku.trim().toUpperCase(),
      input.barcode ? input.barcode.trim() : null,
      input.name.trim(),
      input.categoryId || null,
      catName,
      input.brandId || null,
      brandName,
      input.uomBase || 'PIECE',
      input.uomBulk || 'CARTON',
      totalPiecesPerCarton,
      boxesPerCarton,
      piecesPerBox,
      totalPiecesPerCarton,
      costPaisas,
      costPaisas,
      tpPaisas,
      mrpPaisas,
      costDecimal,
      tpDecimal,
      0,
      0,
      input.minStockAlert || 0
    );

    // If initial stock was provided, create an opening stock entry & post to GL
    if (stockBase > 0) {
      const breakdown = breakdownStock(stockBase, boxesPerCarton, piecesPerBox);
      this.adjustStock({
        productId: id,
        adjustmentType: 'INCREASE',
        quantityBase: stockBase,
        reason: `Opening Inventory Balance (${breakdown.formatted})`,
        postToGL: true,
      }, cleanCompanyId);
    }

    return this.getProducts({ companyId: cleanCompanyId }).find((p) => p.id === id)!;
  }

  /**
   * Update an existing product
   */
  public static updateProduct(id: string, input: UpdateProductInput, companyId: string = DEFAULT_COMPANY_ID): ProductWithStock {
    const db = getDatabase();
    const cleanCompanyId = companyId || DEFAULT_COMPANY_ID;

    const existing = db.prepare('SELECT * FROM products WHERE id = ? AND company_id = ?').get(id, cleanCompanyId) as any;
    if (!existing) {
      throw new Error(`Product with ID ${id} not found.`);
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (input.sku !== undefined) {
      const cleanSku = input.sku.trim().toUpperCase();
      const duplicateSku = db.prepare('SELECT id FROM products WHERE UPPER(sku) = UPPER(?) AND id != ? AND company_id = ?').get(cleanSku, id, cleanCompanyId) as any;
      if (duplicateSku) {
        throw new Error(`Product with SKU "${cleanSku}" already exists in this company.`);
      }
      updates.push('sku = ?');
      params.push(cleanSku);
    }
    if (input.barcode !== undefined) {
      updates.push('barcode = ?');
      params.push(input.barcode ? input.barcode.trim() : null);
    }
    if (input.name !== undefined) {
      updates.push('name = ?');
      params.push(input.name.trim());
    }
    if (input.categoryId !== undefined) {
      updates.push('category_id = ?');
      params.push(input.categoryId || null);

      let catName = 'General';
      if (input.categoryId) {
        const cat = db.prepare('SELECT name FROM categories WHERE id = ? AND company_id = ?').get(input.categoryId, cleanCompanyId) as any;
        if (cat) catName = cat.name;
      }
      updates.push('category = ?');
      params.push(catName);
    }
    if (input.brandId !== undefined) {
      updates.push('brand_id = ?');
      params.push(input.brandId || null);

      let brandName = 'Generic / Unbranded';
      if (input.brandId) {
        const brand = db.prepare('SELECT name FROM brands WHERE id = ? AND company_id = ?').get(input.brandId, cleanCompanyId) as any;
        if (brand) brandName = brand.name;
      }
      updates.push('brand_name = ?');
      params.push(brandName);
    }

    // Packaging updates
    const boxesPerCarton = input.boxesPerCarton !== undefined 
      ? Math.max(1, Math.floor(Number(input.boxesPerCarton) || 1))
      : existing.boxes_per_carton;
    const piecesPerBox = input.piecesPerBox !== undefined 
      ? Math.max(1, Math.floor(Number(input.piecesPerBox) || 1))
      : existing.pieces_per_box;
    const totalPieces = calculatePiecesPerCarton(boxesPerCarton, piecesPerBox);

    if (input.boxesPerCarton !== undefined || input.piecesPerBox !== undefined) {
      updates.push('boxes_per_carton = ?', 'pieces_per_box = ?', 'total_pieces_per_carton = ?', 'bulk_conversion_factor = ?');
      params.push(boxesPerCarton, piecesPerBox, totalPieces, totalPieces);
    }

    // Pricing updates
    if (input.costPrice !== undefined) {
      const costPaisas = toPaisas(input.costPrice);
      updates.push('cost_price_paisas = ?', 'base_rate_per_piece_paisas = ?', 'cost_price = ?');
      params.push(costPaisas, costPaisas, fromPaisas(costPaisas));
    }
    if (input.tradePrice !== undefined) {
      const tpPaisas = toPaisas(input.tradePrice);
      updates.push('trade_price_paisas = ?', 'selling_price = ?');
      params.push(tpPaisas, fromPaisas(tpPaisas));
    }
    if (input.mrp !== undefined) {
      const mrpPaisas = toPaisas(input.mrp);
      updates.push('mrp_paisas = ?');
      params.push(mrpPaisas);
    }
    if (input.minStockAlert !== undefined) {
      updates.push('min_stock_alert = ?');
      params.push(Math.max(0, Math.floor(Number(input.minStockAlert) || 0)));
    }
    if (input.isActive !== undefined) {
      updates.push('is_active = ?');
      params.push(input.isActive ? 1 : 0);
    }

    updates.push("updated_at = datetime('now')");
    params.push(id, cleanCompanyId);

    db.prepare(`UPDATE products SET ${updates.join(', ')} WHERE id = ? AND company_id = ?`).run(...params);

    return this.getProducts({ companyId: cleanCompanyId }).find((p) => p.id === id)!;
  }

  /**
   * Delete a product safely or prevent deletion if transactions exist
   */
  public static deleteProduct(id: string, companyId: string = DEFAULT_COMPANY_ID): { success: boolean; message: string } {
    const db = getDatabase();
    const cleanCompanyId = companyId || DEFAULT_COMPANY_ID;

    const product = db.prepare('SELECT * FROM products WHERE id = ? AND company_id = ?').get(id, cleanCompanyId) as any;
    if (!product) {
      throw new Error(`Product with ID ${id} not found.`);
    }

    // Check transaction history across all modules within this company
    const soItems = db.prepare('SELECT COUNT(*) as count FROM sales_order_items WHERE product_id = ? AND company_id = ?').get(id, cleanCompanyId) as { count: number };
    const siItems = db.prepare('SELECT COUNT(*) as count FROM sales_invoice_items WHERE product_id = ? AND company_id = ?').get(id, cleanCompanyId) as { count: number };
    const pbItems = db.prepare('SELECT COUNT(*) as count FROM purchase_bill_items WHERE product_id = ? AND company_id = ?').get(id, cleanCompanyId) as { count: number };
    const srItems = db.prepare('SELECT COUNT(*) as count FROM sales_return_items WHERE product_id = ? AND company_id = ?').get(id, cleanCompanyId) as { count: number };
    const prItems = db.prepare('SELECT COUNT(*) as count FROM purchase_return_items WHERE product_id = ? AND company_id = ?').get(id, cleanCompanyId) as { count: number };
    const adjItems = db.prepare('SELECT COUNT(*) as count FROM stock_adjustments WHERE product_id = ? AND company_id = ?').get(id, cleanCompanyId) as { count: number };

    const totalTx = (soItems?.count || 0) + (siItems?.count || 0) + (pbItems?.count || 0) + 
                    (srItems?.count || 0) + (prItems?.count || 0) + (adjItems?.count || 0);

    if (totalTx > 0) {
      throw new Error(`Cannot delete "${product.name}". It is associated with ${totalTx} historical transactions. Deactivate the product instead.`);
    }

    db.prepare('DELETE FROM products WHERE id = ? AND company_id = ?').run(id, cleanCompanyId);
    return { success: true, message: `Product "${product.name}" deleted successfully.` };
  }

  /**
   * Adjust product stock with strict GL ledger reflection & 3-tier UOM support
   */
  public static adjustStock(input: StockAdjustmentInput, companyId: string = DEFAULT_COMPANY_ID): void {
    const db = getDatabase();
    const cleanCompanyId = companyId || DEFAULT_COMPANY_ID;

    const product = db.prepare('SELECT * FROM products WHERE id = ? AND company_id = ?').get(input.productId, cleanCompanyId) as any;
    if (!product) {
      throw new Error(`Product ${input.productId} not found.`);
    }

    const boxesPerCarton = Math.max(1, product.boxes_per_carton || 1);
    const piecesPerBox = Math.max(1, product.pieces_per_box || 1);

    // Resolve base quantity
    let qty = 0;
    if (input.cartons !== undefined || input.boxes !== undefined || input.pieces !== undefined) {
      qty = toBasePieces(input.cartons || 0, input.boxes || 0, input.pieces || 0, boxesPerCarton, piecesPerBox);
    } else if (input.quantityBase !== undefined) {
      qty = Math.abs(Number(input.quantityBase) || 0);
    }

    if (qty === 0) return;

    const breakdown = breakdownStock(qty, boxesPerCarton, piecesPerBox);
    const unitCostPaisas = product.cost_price_paisas || toPaisas(product.cost_price || 0);
    const totalCostPaisas = unitCostPaisas * qty;
    const totalCostDecimal = fromPaisas(totalCostPaisas);

    const adjustmentNumber = `ADJ-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;
    const adjustmentId = generateUUID();
    const today = new Date().toISOString().split('T')[0];

    let journalId: string | null = null;

    if (input.postToGL) {
      const invAccount = db.prepare("SELECT id FROM chart_of_accounts WHERE code = '1040' AND company_id = ?").get(cleanCompanyId) as { id: string } | undefined;
      const equityAccount = db.prepare("SELECT id FROM chart_of_accounts WHERE code = '3010' AND company_id = ?").get(cleanCompanyId) as { id: string } | undefined;
      const cogsAccount = db.prepare("SELECT id FROM chart_of_accounts WHERE code = '5010' AND company_id = ?").get(cleanCompanyId) as { id: string } | undefined;

      if (invAccount && (equityAccount || cogsAccount)) {
        let lines: any[] = [];
        if (input.adjustmentType === 'INCREASE') {
          // Dr Inventory Asset, Cr Opening Equity
          lines = [
            { accountId: invAccount.id, debit: totalCostDecimal, credit: 0, memo: `Stock In (${breakdown.formatted}): ${product.name}` },
            { accountId: equityAccount?.id || cogsAccount?.id, debit: 0, credit: totalCostDecimal, memo: input.reason },
          ];
        } else {
          // Dr Inventory Loss/COGS, Cr Inventory Asset
          lines = [
            { accountId: cogsAccount?.id || equityAccount?.id, debit: totalCostDecimal, credit: 0, memo: input.reason },
            { accountId: invAccount.id, debit: 0, credit: totalCostDecimal, memo: `Stock Out (${breakdown.formatted}): ${product.name}` },
          ];
        }

        const je = DoubleEntryEngine.postEntry({
          companyId: cleanCompanyId,
          entryDate: today,
          description: `Stock Adjustment ${adjustmentNumber} (${input.adjustmentType} ${breakdown.formatted}) - ${product.name}`,
          sourceModule: 'inventory',
          sourceDocumentId: adjustmentId,
          lines,
          createdBy: 'Inventory Engine',
        });
        journalId = je.id;
      }
    }

    // Update product stock on disk
    const stockDelta = input.adjustmentType === 'INCREASE' ? qty : -qty;
    db.prepare(`
      UPDATE products 
      SET current_stock_base = current_stock_base + ?, current_stock = current_stock + ?, updated_at = datetime('now')
      WHERE id = ? AND company_id = ?
    `).run(stockDelta, stockDelta, input.productId, cleanCompanyId);

    // Record adjustment entry
    db.prepare(`
      INSERT INTO stock_adjustments (
        id, company_id, adjustment_number, adjustment_date, product_id, quantity_base,
        adjustment_type, unit_cost_paisas, total_cost_paisas, reason, journal_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      adjustmentId,
      cleanCompanyId,
      adjustmentNumber,
      today,
      input.productId,
      qty,
      input.adjustmentType,
      unitCostPaisas,
      totalCostPaisas,
      `${input.reason} [${breakdown.formatted}]`,
      journalId
    );

    // Record to Central Immutable Inventory Audit Ledger
    InventoryAuditService.recordMovement(db, {
      companyId: cleanCompanyId,
      productId: input.productId,
      movementDate: today,
      warehouse: 'Main Warehouse',
      movementType: input.reason.toLowerCase().includes('opening') ? 'OPENING_STOCK' : 'STOCK_ADJUSTMENT',
      sourceModule: 'inventory',
      sourceDocumentType: input.reason.toLowerCase().includes('opening') ? 'PRODUCT_OPENING' : 'STOCK_ADJUSTMENT',
      documentNumber: adjustmentNumber,
      originalTransactionId: adjustmentId,
      quantityInBase: input.adjustmentType === 'INCREASE' ? qty : 0,
      quantityOutBase: input.adjustmentType === 'DECREASE' ? qty : 0,
      cartons: breakdown.cartons,
      boxes: breakdown.boxes,
      pieces: breakdown.pieces,
      unitCostPaisas,
      totalCostPaisas,
      notes: `${input.reason} [${breakdown.formatted}]`,
      updateProductStock: false,
    });
  }

  /**
   * Universal DAL Async Product Fetch By ID for PostgreSQL & SQLite
   */
  public static async getProductByIdAsync(
    id: string,
    companyId: string = DEFAULT_COMPANY_ID,
    client?: import('@/core/database/types').IDatabaseClient | import('@/core/database/types').ITransactionClient
  ): Promise<any> {
    const { DalService } = await import('@/core/database/dal-services');
    return DalService.getProductById(id, companyId, client);
  }

  /**
   * Universal DAL Async Product Creation for PostgreSQL & SQLite
   */
  public static async createProductAsync(
    input: any,
    companyId: string = DEFAULT_COMPANY_ID,
    client?: import('@/core/database/types').IDatabaseClient | import('@/core/database/types').ITransactionClient
  ): Promise<any> {
    const { DalService } = await import('@/core/database/dal-services');
    return DalService.createProduct(input, companyId, client);
  }
}
