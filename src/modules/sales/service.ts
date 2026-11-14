import { getDatabase } from '@/core/database/db';
import { generateUUID } from '@/shared/utils/uuid';
import { toPaisas, fromPaisas, arePaisasEqual } from '@/shared/utils/currency';
import { DoubleEntryEngine } from '@/core/accounting/engine';
import { CustomerService } from '@/modules/customers/service';
import { FeatureFlagService } from '@/core/settings/flags';
import { CreateJournalLineInput } from '@/core/accounting/types';
import { InventoryAuditService } from '@/modules/inventory/audit.service';
import { ModuleRegistry } from '@/core/registry/module-registry';
import { DEFAULT_COMPANY_ID } from '@/core/tenancy/constants';

export interface OrderLineInput {
  productId: string;
  cartonsCount?: number;
  boxesCount?: number;
  loosePiecesCount?: number;
  quantityBase?: number;
  unitPricePaisas?: number;
  discountPercent?: number;
  discountPaisas?: number;
  taxPercent?: number;
  taxPaisas?: number;
  schemeBonusBase?: number;
}

export interface CreateOrderInput {
  companyId?: string;
  customerId: string;
  routeId?: string;
  salesmanId?: string;
  supplyPersonId?: string;
  orderDate: string;
  deliveryDate?: string;
  targetDeliveryDate?: string;
  billDiscountPaisas?: number;
  cashReceivedPaisas?: number;
  notes?: string;
  items: OrderLineInput[];

  // Field Order Booking metadata
  sourceChannel?: 'OFFICE' | 'FIELD_BOOKER';
  createdByUserId?: string;
  createdByStaffId?: string;
  clientOrderUuid?: string;
  bookerCode?: string;
  syncStatus?: 'LOCAL_PENDING' | 'SYNCED' | 'FAILED';
  clientCreatedAt?: string;
}

export interface CreateDirectSaleInput {
  companyId?: string;
  customerId: string;
  routeId?: string;
  salesmanId?: string;
  supplyPersonId?: string;
  invoiceDate: string;
  dueDate?: string;
  billDiscountPaisas?: number;
  cashReceivedPaisas?: number;
  notes?: string;
  items: OrderLineInput[];
}

export class SalesService {
  /**
   * Safe Per-User Atomic Order Number Generation
   * Format: SO-{BOOKER_CODE}-{YYMMDD}-{SEQUENCE} (e.g. SO-EMP004-260928-0001)
   */
  public static allocateBookerOrderNumber(
    db: any, 
    bookerCode: string, 
    orderDate?: string,
    companyId: string = DEFAULT_COMPANY_ID
  ): { orderNumber: string; sequence: number } {
    const cleanCompanyId = companyId || DEFAULT_COMPANY_ID;
    const cleanCode = (bookerCode || 'BOOKER').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const dateStr = orderDate || new Date().toISOString().split('T')[0];
    const [year, month, day] = dateStr.split('-');
    const dateCode = `${year.slice(-2)}${month}${day}`;

    const upsertStmt = db.prepare(`
      INSERT INTO order_booker_sequences (company_id, booker_code, date_code, last_sequence, created_at, updated_at)
      VALUES (?, ?, ?, 1, datetime('now'), datetime('now'))
      ON CONFLICT(company_id, booker_code, date_code) DO UPDATE SET
        last_sequence = order_booker_sequences.last_sequence + 1,
        updated_at = datetime('now')
      RETURNING last_sequence;
    `);

    const result = upsertStmt.get(cleanCompanyId, cleanCode, dateCode) as { last_sequence: number };
    const sequence = result.last_sequence;
    const formattedSeq = String(sequence).padStart(4, '0');
    const orderNumber = `SO-${cleanCode}-${dateCode}-${formattedSeq}`;

    return { orderNumber, sequence };
  }

  /**
   * Operative Commercial Sale Order (Instant Stock Relief & Compound Double-Entry GL Posting)
   * The Sale Order is the final commercial bill and physical delivery bill.
   */
  public static createOrder(input: CreateOrderInput, companyIdOverride?: string) {
    const companyId = input.companyId || companyIdOverride || DEFAULT_COMPANY_ID;

    if (!FeatureFlagService.isEnabled('sales.enable_order_booking', true, companyId)) {
      throw new Error('Order Booking workflow is disabled in feature settings.');
    }

    if (input.sourceChannel === 'FIELD_BOOKER' && !ModuleRegistry.isModuleEnabled('field_order_booking', companyId)) {
      throw new Error('Field Order Booking module is currently disabled.');
    }

    const db = getDatabase();

    // Idempotency check: if client_order_uuid already exists, return the existing order
    if (input.clientOrderUuid) {
      const existing = db.prepare('SELECT id FROM sales_orders WHERE client_order_uuid = ? AND company_id = ?').get(input.clientOrderUuid, companyId) as { id: string } | undefined;
      if (existing) {
        return this.getOrderById(existing.id, companyId);
      }
    }

    // Verify customer exists and belongs to company
    const customer = db.prepare('SELECT id, name FROM customers WHERE id = ? AND company_id = ?').get(input.customerId, companyId) as any;
    if (!customer) {
      throw new Error('Customer not found or does not belong to this company.');
    }

    // Resolve user <-> staff linkage
    let userStaffId = input.createdByStaffId || null;
    let bookerCode = input.bookerCode || null;

    if (input.createdByUserId) {
      const userRow = db.prepare('SELECT staff_id, role, username FROM app_users WHERE id = ? AND company_id = ?').get(input.createdByUserId, companyId) as any;
      if (userRow) {
        if (!userStaffId && userRow.staff_id) {
          userStaffId = userRow.staff_id;
        }
        if (!bookerCode && userRow.username) {
          bookerCode = userRow.username;
        }
      }
    }

    if (userStaffId) {
      const staffRow = db.prepare('SELECT employee_code, name, route_id FROM staff_members WHERE id = ? AND company_id = ?').get(userStaffId, companyId) as any;
      if (staffRow) {
        if (staffRow.employee_code) {
          bookerCode = staffRow.employee_code;
        }
        if (!input.salesmanId) {
          input.salesmanId = userStaffId;
        }
        if (!input.routeId && staffRow.route_id) {
          input.routeId = staffRow.route_id;
        }
      }
    }

    if (input.routeId) {
      const routeRow = db.prepare('SELECT id FROM routes WHERE id = ? AND company_id = ?').get(input.routeId, companyId);
      if (!routeRow) throw new Error('Selected route does not belong to this company.');
    }
    if (input.salesmanId) {
      const salesmanRow = db.prepare('SELECT id FROM staff_members WHERE id = ? AND company_id = ?').get(input.salesmanId, companyId);
      if (!salesmanRow) throw new Error('Selected salesman does not belong to this company.');
    }
    if (input.supplyPersonId) {
      const supplyRow = db.prepare('SELECT id FROM staff_members WHERE id = ? AND company_id = ?').get(input.supplyPersonId, companyId);
      if (!supplyRow) throw new Error('Selected supply person does not belong to this company.');
    }

    const orderId = generateUUID();
    const orderDate = input.orderDate || new Date().toISOString().split('T')[0];

    let orderNumber: string;
    let bookerSequence: number | null = null;

    if (input.sourceChannel === 'FIELD_BOOKER') {
      const allocated = this.allocateBookerOrderNumber(db, bookerCode || 'OB001', orderDate, companyId);
      orderNumber = allocated.orderNumber;
      bookerSequence = allocated.sequence;
    } else {
      orderNumber = `ORD-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`;
    }

    const enableLineDisc = FeatureFlagService.isEnabled('sales.enable_line_discount', true, companyId);
    const enableBillDisc = FeatureFlagService.isEnabled('sales.enable_bill_discount', true, companyId);
    const enableScheme = FeatureFlagService.isEnabled('sales.enable_scheme_bonus', true, companyId);
    const enableSalesman = FeatureFlagService.isEnabled('sales.enable_salesman_tracking', true, companyId);
    const enableSupply = FeatureFlagService.isEnabled('sales.enable_supply_person_tracking', true, companyId);
    const enableSpotCash = FeatureFlagService.isEnabled('sales.enable_spot_cash_collection', true, companyId);
    const enableCreditLock = FeatureFlagService.isEnabled('sales.enable_credit_limit_lock', true, companyId);

    const salesmanId = enableSalesman ? (input.salesmanId || null) : null;
    const supplyPersonId = enableSupply ? (input.supplyPersonId || null) : null;

    let subtotalPaisas = 0;
    let totalLineDiscountPaisas = 0;
    let totalTaxPaisas = 0;
    let totalSchemeItems = 0;
    let totalCogsPaisas = 0;
    let totalSchemeExpensePaisas = 0;

    const preparedItems: any[] = [];
    const stockUpdates: { productId: string; totalDeductBase: number }[] = [];

    for (const item of input.items) {
      const prod = db.prepare('SELECT id, name, uom_base, uom_bulk, bulk_conversion_factor, boxes_per_carton, pieces_per_box, total_pieces_per_carton, cost_price_paisas, trade_price_paisas, current_stock_base, item_type FROM products WHERE id = ? AND company_id = ?').get(item.productId, companyId) as any;
      if (!prod) throw new Error(`Product ${item.productId} not found in this company.`);

      const isService = prod.item_type === 'SERVICE';
      const boxesPerCarton = Math.max(1, prod.boxes_per_carton || 1);
      const piecesPerBox = Math.max(1, prod.pieces_per_box || 1);
      const ppc = Math.max(1, prod.total_pieces_per_carton || (boxesPerCarton * piecesPerBox));

      const cartons = Math.max(0, Number(item.cartonsCount) || 0);
      const boxes = Math.max(0, Number(item.boxesCount) || 0);
      const loosePieces = Math.max(0, Number(item.loosePiecesCount) || 0);

      const qtyBase = item.quantityBase !== undefined && item.quantityBase > 0
        ? item.quantityBase
        : (cartons * ppc) + (boxes * piecesPerBox) + loosePieces;

      if (qtyBase <= 0) continue;

      const schemeBonus = enableScheme ? Math.max(0, Number(item.schemeBonusBase) || 0) : 0;
      const totalPhysicalBase = qtyBase + schemeBonus;

      const unitPricePaisas = item.unitPricePaisas !== undefined && item.unitPricePaisas > 0
        ? item.unitPricePaisas
        : prod.trade_price_paisas;

      const unitCostPaisas = prod.cost_price_paisas || 0;
      // SaleFlow rule: TP is strictly PER BASE PIECE. Never divide TP by ppc.
      const grossLinePaisas = Math.round(unitPricePaisas * qtyBase);

      let lineDiscPaisas = 0;
      let discPercent = 0;
      if (enableLineDisc) {
        if (item.discountPercent !== undefined && item.discountPercent > 0) {
          discPercent = Math.min(100, item.discountPercent);
          lineDiscPaisas = Math.round(grossLinePaisas * (discPercent / 100));
        } else if (item.discountPaisas !== undefined && item.discountPaisas > 0) {
          lineDiscPaisas = Math.min(grossLinePaisas, item.discountPaisas);
          discPercent = grossLinePaisas > 0 ? (lineDiscPaisas / grossLinePaisas) * 100 : 0;
        }
      }

      // Calculation order: Gross - Discount = Net Before Tax + Tax = Net Line Total
      const netBeforeTaxPaisas = Math.max(0, grossLinePaisas - lineDiscPaisas);

      let lineTaxPaisas = 0;
      let taxPercent = 0;
      if (item.taxPercent !== undefined && item.taxPercent > 0) {
        taxPercent = item.taxPercent;
        lineTaxPaisas = Math.round((netBeforeTaxPaisas * taxPercent) / 100);
      } else if (item.taxPaisas !== undefined && item.taxPaisas > 0) {
        lineTaxPaisas = item.taxPaisas;
        taxPercent = netBeforeTaxPaisas > 0 ? (lineTaxPaisas / netBeforeTaxPaisas) * 100 : 0;
      }

      const netLinePaisas = netBeforeTaxPaisas + lineTaxPaisas;
      const lineCostPaisas = Math.round((unitCostPaisas / ppc) * qtyBase);
      const bonusCostPaisas = Math.round((unitCostPaisas / ppc) * schemeBonus);

      subtotalPaisas += grossLinePaisas;
      totalLineDiscountPaisas += lineDiscPaisas;
      totalTaxPaisas += lineTaxPaisas;
      if (schemeBonus > 0) totalSchemeItems += schemeBonus;

      if (!isService) {
        totalCogsPaisas += lineCostPaisas;
        totalSchemeExpensePaisas += bonusCostPaisas;
        stockUpdates.push({ productId: prod.id, totalDeductBase: totalPhysicalBase });
      }

      const ctnCount = Math.floor(qtyBase / ppc);
      const boxCount = Math.floor((qtyBase % ppc) / piecesPerBox);
      const pcsCount = (qtyBase % ppc) % piecesPerBox;

      preparedItems.push({
        id: generateUUID(),
        orderId,
        productId: prod.id,
        quantityBase: qtyBase,
        cartonsCount: ctnCount,
        boxesCount: boxCount,
        loosePiecesCount: pcsCount,
        unitPricePaisas,
        unitCostPaisas,
        totalCostPaisas: lineCostPaisas,
        discountPercent: Math.round(discPercent * 10) / 10,
        discountPaisas: lineDiscPaisas,
        taxPercent: Math.round(taxPercent * 100) / 100,
        taxPaisas: lineTaxPaisas,
        schemeBonusBase: schemeBonus,
        lineTotalPaisas: netLinePaisas,
        quantity: qtyBase,
        unitPrice: fromPaisas(unitPricePaisas),
        unitCost: fromPaisas(unitCostPaisas),
        tax: fromPaisas(lineTaxPaisas),
        totalPrice: fromPaisas(netLinePaisas),
        totalCost: fromPaisas(lineCostPaisas),
      });
    }

    if (preparedItems.length === 0) {
      throw new Error('An order must contain at least one valid product line.');
    }

    const billDiscountPaisas = enableBillDisc ? Math.max(0, Number(input.billDiscountPaisas) || 0) : 0;
    const netBeforeBillDiscPaisas = Math.max(0, subtotalPaisas - totalLineDiscountPaisas - billDiscountPaisas);
    const grandTotalPaisas = netBeforeBillDiscPaisas + totalTaxPaisas;

    // Spot Cash calculation
    let cashReceivedPaisas = enableSpotCash ? Math.max(0, Number(input.cashReceivedPaisas) || 0) : 0;
    if (cashReceivedPaisas > grandTotalPaisas) {
      cashReceivedPaisas = grandTotalPaisas;
    }
    const remainingBalancePaisas = grandTotalPaisas - cashReceivedPaisas;

    // Credit limit check on remaining credit amount
    if (enableCreditLock && remainingBalancePaisas > 0) {
      const creditCheck = CustomerService.checkCreditAvailable(input.customerId, remainingBalancePaisas, companyId);
      if (!creditCheck.allowed) {
        throw new Error(creditCheck.message);
      }
    }

    const paymentStatus = remainingBalancePaisas === 0 ? 'PAID' : cashReceivedPaisas > 0 ? 'PARTIAL' : 'UNPAID';

    // Wrap all writes inside atomic savepoint
    db.exec('SAVEPOINT create_order_sp;');

    try {
      // 1. Atomically Decrement Physical Stock on Disk (Bypasses Service Items)
      for (const su of stockUpdates) {
        db.prepare(`
          UPDATE products 
          SET current_stock_base = current_stock_base - ?,
              current_stock = current_stock - ?,
              updated_at = datetime('now')
          WHERE id = ? AND company_id = ?
        `).run(su.totalDeductBase, su.totalDeductBase, su.productId, companyId);
      }

      // 2. Generate Compound Double-Entry General Ledger Voucher
      const customerName = customer ? customer.name : 'Valued Retailer';

      const cashAccount = db.prepare("SELECT id FROM chart_of_accounts WHERE code = '1010' AND company_id = ?").get(companyId) as { id: string } | undefined;
      const arAccount = db.prepare("SELECT id FROM chart_of_accounts WHERE code = '1030' AND company_id = ?").get(companyId) as { id: string } | undefined;
      const invAccount = db.prepare("SELECT id FROM chart_of_accounts WHERE code = '1040' AND company_id = ?").get(companyId) as { id: string } | undefined;
      const salesAccount = db.prepare("SELECT id FROM chart_of_accounts WHERE code = '4010' AND company_id = ?").get(companyId) as { id: string } | undefined;
      const taxAccount = db.prepare("SELECT id FROM chart_of_accounts WHERE code = '2020' AND company_id = ?").get(companyId) as { id: string } | undefined;
      const cogsAccount = db.prepare("SELECT id FROM chart_of_accounts WHERE code = '5010' AND company_id = ?").get(companyId) as { id: string } | undefined;
      let schemeAccount = db.prepare("SELECT id FROM chart_of_accounts WHERE code = '5060' AND company_id = ?").get(companyId) as { id: string } | undefined;
      if (!schemeAccount) {
        schemeAccount = db.prepare("SELECT id FROM chart_of_accounts WHERE code = '5020' AND company_id = ?").get(companyId) as { id: string } | undefined;
      }

      let journalEntryId: string | null = null;

      if (arAccount && salesAccount) {
        const glLines: CreateJournalLineInput[] = [];

        // Leg 1: Spot Cash + Receivable = Sales Revenue + Sales Tax Liability
        if (cashReceivedPaisas > 0 && cashAccount) {
          glLines.push({
            accountId: cashAccount.id,
            debit: fromPaisas(cashReceivedPaisas),
            credit: 0,
            memo: `Spot cash collection for Sale Bill ${orderNumber}`,
          });
        }

        if (remainingBalancePaisas > 0) {
          glLines.push({
            accountId: arAccount.id,
            debit: fromPaisas(remainingBalancePaisas),
            credit: 0,
            entityId: input.customerId,
            entityType: 'CUSTOMER',
            memo: `Net receivable from ${customerName} for Sale Bill ${orderNumber}`,
          });
        }

        // Output Sales Tax credit to Liability account 2020
        if (totalTaxPaisas > 0 && taxAccount) {
          glLines.push({
            accountId: taxAccount.id,
            debit: 0,
            credit: fromPaisas(totalTaxPaisas),
            memo: `Sales tax (GST/Output tax) payable for Sale Bill ${orderNumber}`,
          });
        }

        const netSalesRevenuePaisas = grandTotalPaisas - totalTaxPaisas;
        if (netSalesRevenuePaisas > 0 && salesAccount) {
          glLines.push({
            accountId: salesAccount.id,
            debit: 0,
            credit: fromPaisas(netSalesRevenuePaisas),
            memo: `Wholesale distribution sales revenue for Sale Bill ${orderNumber}`,
          });
        }

        // Leg 2: Perpetual Inventory Relief for Billed Goods
        if (totalCogsPaisas > 0 && cogsAccount && invAccount) {
          glLines.push(
            {
              accountId: cogsAccount.id,
              debit: fromPaisas(totalCogsPaisas),
              credit: 0,
              memo: `COGS for Sale Bill ${orderNumber}`,
            },
            {
              accountId: invAccount.id,
              debit: 0,
              credit: fromPaisas(totalCogsPaisas),
              memo: `Inventory relief for Sale Bill ${orderNumber}`,
            }
          );
        }

        // Leg 3: Trade Scheme / Free Bonus Unit Expense Relief
        if (totalSchemeExpensePaisas > 0 && schemeAccount && invAccount) {
          glLines.push(
            {
              accountId: schemeAccount.id,
              debit: fromPaisas(totalSchemeExpensePaisas),
              credit: 0,
              memo: `Trade promotion scheme bonus units for Sale Bill ${orderNumber}`,
            },
            {
              accountId: invAccount.id,
              debit: 0,
              credit: fromPaisas(totalSchemeExpensePaisas),
              memo: `Free sample inventory relief for Sale Bill ${orderNumber}`,
            }
          );
        }

        const je = DoubleEntryEngine.postEntry({
          companyId,
          entryDate: orderDate,
          description: `Sale Bill ${orderNumber} - ${customerName} (Net: ${fromPaisas(grandTotalPaisas)})`,
          sourceModule: 'sales',
          sourceDocumentId: orderId,
          lines: glLines,
          createdBy: input.sourceChannel === 'FIELD_BOOKER' ? `Order Booker (${bookerCode || 'Field'})` : 'Sales Distribution Engine',
        });
        journalEntryId = je.id;
      }

      // 3. Persist Order Header with status = 'POSTED', linked GL voucher, and metadata
      db.prepare(`
        INSERT INTO sales_orders (
          id, company_id, order_number, customer_id, route_id, salesman_id, supply_person_id,
          order_date, delivery_date, status,
          subtotal_paisas, line_discount_paisas, bill_discount_paisas, tax_amount_paisas, grand_total_paisas,
          cost_of_goods_sold_paisas, scheme_expense_paisas, cash_received_paisas, remaining_balance_paisas,
          scheme_items_count, subtotal, discount, tax, grand_total,
          cost_of_goods_sold, cash_received, remaining_balance, payment_status,
          journal_entry_id, notes,
          source_channel, created_by_user_id, created_by_staff_id, client_order_uuid,
          booker_order_sequence, sync_status, client_created_at, server_received_at, target_delivery_date
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?,
          ?, ?, 'POSTED',
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?
        )
      `).run(
        orderId,
        companyId,
        orderNumber,
        input.customerId,
        input.routeId || null,
        salesmanId,
        supplyPersonId,
        orderDate,
        input.deliveryDate || null,
        subtotalPaisas,
        totalLineDiscountPaisas,
        billDiscountPaisas,
        totalTaxPaisas,
        grandTotalPaisas,
        totalCogsPaisas,
        totalSchemeExpensePaisas,
        cashReceivedPaisas,
        remainingBalancePaisas,
        totalSchemeItems,
        fromPaisas(subtotalPaisas),
        fromPaisas(totalLineDiscountPaisas + billDiscountPaisas),
        fromPaisas(totalTaxPaisas),
        fromPaisas(grandTotalPaisas),
        fromPaisas(totalCogsPaisas),
        fromPaisas(cashReceivedPaisas),
        fromPaisas(remainingBalancePaisas),
        paymentStatus,
        journalEntryId,
        input.notes || null,
        input.sourceChannel || 'OFFICE',
        input.createdByUserId || null,
        userStaffId || null,
        input.clientOrderUuid || null,
        bookerSequence,
        input.syncStatus || 'SYNCED',
        input.clientCreatedAt || new Date().toISOString(),
        new Date().toISOString(),
        input.targetDeliveryDate || input.deliveryDate || null
      );

      // 4. Persist Order Items
      const insertItem = db.prepare(`
        INSERT INTO sales_order_items (
          id, company_id, order_id, product_id, quantity_base, cartons_count, boxes_count, loose_pieces_count,
          unit_price_paisas, unit_cost_paisas, total_cost_paisas,
          discount_percent, discount_paisas, tax_percent, tax_paisas, scheme_bonus_base, line_total_paisas,
          unit_price, unit_cost, total_cost, tax, line_total
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const it of preparedItems) {
        insertItem.run(
          it.id, companyId, it.orderId, it.productId, it.quantityBase, it.cartonsCount, it.boxesCount || 0, it.loosePiecesCount,
          it.unitPricePaisas, it.unitCostPaisas, it.totalCostPaisas,
          it.discountPercent, it.discountPaisas, it.taxPercent, it.taxPaisas, it.schemeBonusBase, it.lineTotalPaisas,
          it.unitPrice, it.unitCost, it.totalCost, it.tax, it.totalPrice
        );

        if (it.itemType !== 'SERVICE') {
          const totalDeduct = (it.quantityBase || 0) + (it.schemeBonusBase || 0);
          InventoryAuditService.recordMovement(db, {
            companyId,
            productId: it.productId,
            movementDate: orderDate,
            warehouse: 'Main Warehouse',
            movementType: 'SALE_ORDER',
            sourceModule: 'sales',
            sourceDocumentType: 'SALES_ORDER',
            documentNumber: orderNumber,
            originalTransactionId: orderId,
            referenceNumber: input.notes || null,
            quantityInBase: 0,
            quantityOutBase: totalDeduct,
            cartons: it.cartonsCount,
            boxes: it.boxesCount,
            pieces: it.loosePiecesCount,
            unitCostPaisas: it.unitCostPaisas,
            totalCostPaisas: it.totalCostPaisas,
            sellingPrice: it.unitPrice,
            notes: it.schemeBonusBase > 0
              ? `Sale Order ${orderNumber} (incl. ${it.schemeBonusBase} free bonus pcs) - ${customerName}`
              : `Sale Order ${orderNumber} - ${customerName}`,
            updateProductStock: false,
          });
        }
      }

      // 5. Record Audit Trail
      db.prepare(`
        INSERT INTO audit_logs (
          id, company_id, user_id, user_name, user_role, action, transaction_type,
          transaction_id, transaction_number, transaction_date, reason,
          is_day_closed, details_json, created_at
        ) VALUES (?, ?, ?, ?, ?, 'CREATE', 'SALES_ORDER', ?, ?, ?, ?, 0, ?, datetime('now'))
      `).run(
        generateUUID(),
        companyId,
        input.createdByUserId || 'field_user',
        bookerCode || 'Order Booker',
        input.sourceChannel === 'FIELD_BOOKER' ? 'ORDER_BOOKER' : 'USER',
        orderId,
        orderNumber,
        orderDate,
        `Created Sales Order via ${input.sourceChannel || 'OFFICE'}`,
        JSON.stringify({
          source_channel: input.sourceChannel || 'OFFICE',
          created_by_user_id: input.createdByUserId || null,
          created_by_staff_id: userStaffId || null,
          client_order_uuid: input.clientOrderUuid || null,
          route_id: input.routeId || null,
          customer_id: input.customerId,
          grand_total_paisas: grandTotalPaisas,
        })
      );

      db.exec('RELEASE create_order_sp;');
    } catch (err: any) {
      db.exec('ROLLBACK TO create_order_sp;');
      // Handle idempotency race condition on unique client_order_uuid index
      if (input.clientOrderUuid && err.message?.includes('UNIQUE') && (err.message?.includes('client_order_uuid') || err.message?.includes('idx_sales_orders_client_uuid'))) {
        const existing = db.prepare('SELECT id FROM sales_orders WHERE client_order_uuid = ? AND company_id = ?').get(input.clientOrderUuid, companyId) as { id: string } | undefined;
        if (existing) {
          return this.getOrderById(existing.id, companyId);
        }
      }
      throw err;
    }

    return this.getOrderById(orderId, companyId);
  }

  /**
   * Direct / Spot / Van Sale (Real-time stock decrement, spot cash recovery, and perpetual dual-leg GL posting)
   */
  public static createDirectSale(input: CreateDirectSaleInput, companyIdOverride?: string) {
    const companyId = input.companyId || companyIdOverride || DEFAULT_COMPANY_ID;

    if (!FeatureFlagService.isEnabled('sales.enable_direct_sale', true, companyId)) {
      throw new Error('Direct & Van Sale workflow is disabled in feature settings.');
    }

    const db = getDatabase();

    const customer = db.prepare('SELECT id, name FROM customers WHERE id = ? AND company_id = ?').get(input.customerId, companyId) as any;
    if (!customer) {
      throw new Error('Customer not found or does not belong to this company.');
    }

    if (input.routeId) {
      const routeRow = db.prepare('SELECT id FROM routes WHERE id = ? AND company_id = ?').get(input.routeId, companyId);
      if (!routeRow) throw new Error('Selected route does not belong to this company.');
    }
    if (input.salesmanId) {
      const salesmanRow = db.prepare('SELECT id FROM staff_members WHERE id = ? AND company_id = ?').get(input.salesmanId, companyId);
      if (!salesmanRow) throw new Error('Selected salesman does not belong to this company.');
    }
    if (input.supplyPersonId) {
      const supplyRow = db.prepare('SELECT id FROM staff_members WHERE id = ? AND company_id = ?').get(input.supplyPersonId, companyId);
      if (!supplyRow) throw new Error('Selected supply person does not belong to this company.');
    }

    const invoiceId = generateUUID();
    const invoiceNumber = `INV-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`;

    const enableLineDisc = FeatureFlagService.isEnabled('sales.enable_line_discount', true, companyId);
    const enableBillDisc = FeatureFlagService.isEnabled('sales.enable_bill_discount', true, companyId);
    const enableScheme = FeatureFlagService.isEnabled('sales.enable_scheme_bonus', true, companyId);
    const enableSalesman = FeatureFlagService.isEnabled('sales.enable_salesman_tracking', true, companyId);
    const enableSupply = FeatureFlagService.isEnabled('sales.enable_supply_person_tracking', true, companyId);
    const enableSpotCash = FeatureFlagService.isEnabled('sales.enable_spot_cash_collection', true, companyId);
    const enableCreditLock = FeatureFlagService.isEnabled('sales.enable_credit_limit_lock', true, companyId);

    const salesmanId = enableSalesman ? (input.salesmanId || null) : null;
    const supplyPersonId = enableSupply ? (input.supplyPersonId || null) : null;

    let subtotalPaisas = 0;
    let totalLineDiscountPaisas = 0;
    let totalCogsPaisas = 0;
    let totalSchemeExpensePaisas = 0;

    const preparedItems: any[] = [];
    const stockUpdates: { productId: string; totalDeductBase: number }[] = [];

    for (const item of input.items) {
      const prod = db.prepare('SELECT id, name, uom_base, uom_bulk, bulk_conversion_factor, boxes_per_carton, pieces_per_box, total_pieces_per_carton, cost_price_paisas, trade_price_paisas, current_stock_base FROM products WHERE id = ? AND company_id = ?').get(item.productId, companyId) as any;
      if (!prod) throw new Error(`Product ${item.productId} not found in this company.`);

      const boxesPerCarton = Math.max(1, prod.boxes_per_carton || 1);
      const piecesPerBox = Math.max(1, prod.pieces_per_box || 1);
      const ppc = Math.max(1, prod.total_pieces_per_carton || (boxesPerCarton * piecesPerBox));

      const cartons = Math.max(0, Number(item.cartonsCount) || 0);
      const boxes = Math.max(0, Number(item.boxesCount) || 0);
      const loosePieces = Math.max(0, Number(item.loosePiecesCount) || 0);

      const qtyBase = item.quantityBase !== undefined && item.quantityBase > 0
        ? item.quantityBase
        : (cartons * ppc) + (boxes * piecesPerBox) + loosePieces;

      if (qtyBase <= 0) continue;

      const schemeBonus = enableScheme ? Math.max(0, Number(item.schemeBonusBase) || 0) : 0;
      const totalPhysicalBase = qtyBase + schemeBonus;

      const unitPricePaisas = item.unitPricePaisas !== undefined && item.unitPricePaisas > 0
        ? item.unitPricePaisas
        : prod.trade_price_paisas;

      const unitCostPaisas = prod.cost_price_paisas || 0;
      // SaleFlow rule: TP is strictly PER BASE PIECE. Never divide TP by ppc.
      const grossLinePaisas = Math.round(unitPricePaisas * qtyBase);

      let lineDiscPaisas = 0;
      let discPercent = 0;
      if (enableLineDisc) {
        if (item.discountPercent !== undefined && item.discountPercent > 0) {
          discPercent = Math.min(100, item.discountPercent);
          lineDiscPaisas = Math.round(grossLinePaisas * (discPercent / 100));
        } else if (item.discountPaisas !== undefined && item.discountPaisas > 0) {
          lineDiscPaisas = Math.min(grossLinePaisas, item.discountPaisas);
          discPercent = grossLinePaisas > 0 ? (lineDiscPaisas / grossLinePaisas) * 100 : 0;
        }
      }

      const netLinePaisas = grossLinePaisas - lineDiscPaisas;
      const lineCostPaisas = Math.round((unitCostPaisas / ppc) * qtyBase);
      const bonusCostPaisas = Math.round((unitCostPaisas / ppc) * schemeBonus);

      subtotalPaisas += grossLinePaisas;
      totalLineDiscountPaisas += lineDiscPaisas;
      totalCogsPaisas += lineCostPaisas;
      totalSchemeExpensePaisas += bonusCostPaisas;

      const ctnCount = Math.floor(qtyBase / ppc);
      const boxCount = Math.floor((qtyBase % ppc) / piecesPerBox);
      const pcsCount = (qtyBase % ppc) % piecesPerBox;

      preparedItems.push({
        id: generateUUID(),
        invoiceId,
        productId: prod.id,
        quantityBase: qtyBase,
        cartonsCount: ctnCount,
        boxesCount: boxCount,
        loosePiecesCount: pcsCount,
        unitPricePaisas,
        unitCostPaisas,
        totalCostPaisas: lineCostPaisas,
        discountPercent: Math.round(discPercent * 10) / 10,
        discountPaisas: lineDiscPaisas,
        schemeBonusBase: schemeBonus,
        lineTotalPaisas: netLinePaisas,
        quantity: qtyBase,
        unitPrice: fromPaisas(unitPricePaisas),
        unitCost: fromPaisas(unitCostPaisas),
        totalPrice: fromPaisas(netLinePaisas),
        totalCost: fromPaisas(lineCostPaisas),
      });

      stockUpdates.push({ productId: prod.id, totalDeductBase: totalPhysicalBase });
    }

    if (preparedItems.length === 0) {
      throw new Error('Invoice must contain at least one valid product line.');
    }

    const billDiscountPaisas = enableBillDisc ? Math.max(0, Number(input.billDiscountPaisas) || 0) : 0;
    const grandTotalPaisas = Math.max(0, subtotalPaisas - totalLineDiscountPaisas - billDiscountPaisas);

    // Spot Cash calculation
    let cashReceivedPaisas = enableSpotCash ? Math.max(0, Number(input.cashReceivedPaisas) || 0) : 0;
    if (cashReceivedPaisas > grandTotalPaisas) {
      cashReceivedPaisas = grandTotalPaisas;
    }
    const remainingBalancePaisas = grandTotalPaisas - cashReceivedPaisas;

    // Credit limit check on remaining credit amount
    if (enableCreditLock && remainingBalancePaisas > 0) {
      const creditCheck = CustomerService.checkCreditAvailable(input.customerId, remainingBalancePaisas, companyId);
      if (!creditCheck.allowed) {
        throw new Error(creditCheck.message);
      }
    }

    const paymentStatus = remainingBalancePaisas === 0 ? 'PAID' : cashReceivedPaisas > 0 ? 'PARTIAL' : 'UNPAID';
    const invoiceDate = input.invoiceDate || new Date().toISOString().split('T')[0];

    // 1. Decrement physical stock on disk
    for (const su of stockUpdates) {
      db.prepare(`
        UPDATE products 
        SET current_stock_base = current_stock_base - ?,
            current_stock = current_stock - ?,
            updated_at = datetime('now')
        WHERE id = ? AND company_id = ?
      `).run(su.totalDeductBase, su.totalDeductBase, su.productId, companyId);
    }

    // 2. Persist Sales Invoice
    db.prepare(`
      INSERT INTO sales_invoices (
        id, company_id, invoice_number, customer_id, route_id, salesman_id, supply_person_id,
        invoice_date, due_date,
        subtotal_paisas, line_discount_paisas, bill_discount_paisas, grand_total_paisas,
        cost_of_goods_sold_paisas, scheme_expense_paisas, cash_received_paisas, remaining_balance_paisas,
        subtotal, discount, tax, grand_total, cost_of_goods_sold, amount_paid,
        payment_status, status, invoice_type, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0.0, ?, ?, ?, ?, 'POSTED', 'DIRECT_SALE', ?)
    `).run(
      invoiceId,
      companyId,
      invoiceNumber,
      input.customerId,
      input.routeId || null,
      salesmanId,
      supplyPersonId,
      invoiceDate,
      input.dueDate || null,
      subtotalPaisas,
      totalLineDiscountPaisas,
      billDiscountPaisas,
      grandTotalPaisas,
      totalCogsPaisas,
      totalSchemeExpensePaisas,
      cashReceivedPaisas,
      remainingBalancePaisas,
      fromPaisas(subtotalPaisas),
      fromPaisas(totalLineDiscountPaisas + billDiscountPaisas),
      fromPaisas(grandTotalPaisas),
      fromPaisas(totalCogsPaisas),
      fromPaisas(cashReceivedPaisas),
      paymentStatus,
      input.notes || null
    );

    // 3. Persist Invoice Items
    const customerName = customer ? customer.name : 'Valued Retailer';

    const insertItem = db.prepare(`
      INSERT INTO sales_invoice_items (
        id, company_id, invoice_id, product_id, quantity_base, cartons_count, boxes_count, loose_pieces_count,
        unit_price_paisas, unit_cost_paisas, total_cost_paisas,
        discount_percent, discount_paisas, scheme_bonus_base, line_total_paisas,
        quantity, unit_price, unit_cost, total_price, total_cost
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const it of preparedItems) {
      insertItem.run(
        it.id, companyId, it.invoiceId, it.productId, it.quantityBase, it.cartonsCount, it.boxesCount || 0, it.loosePiecesCount,
        it.unitPricePaisas, it.unitCostPaisas, it.totalCostPaisas,
        it.discountPercent, it.discountPaisas, it.schemeBonusBase, it.lineTotalPaisas,
        it.quantity, it.unitPrice, it.unitCost, it.totalPrice, it.totalCost
      );

      if (it.itemType !== 'SERVICE') {
        const totalDeduct = (it.quantityBase || 0) + (it.schemeBonusBase || 0);
        InventoryAuditService.recordMovement(db, {
          companyId,
          productId: it.productId,
          movementDate: invoiceDate,
          warehouse: 'Main Warehouse',
          movementType: 'DIRECT_SALE',
          sourceModule: 'sales',
          sourceDocumentType: 'SALES_INVOICE',
          documentNumber: invoiceNumber,
          originalTransactionId: invoiceId,
          referenceNumber: input.notes || null,
          quantityInBase: 0,
          quantityOutBase: totalDeduct,
          cartons: it.cartonsCount,
          boxes: it.boxesCount,
          pieces: it.loosePiecesCount,
          unitCostPaisas: it.unitCostPaisas,
          totalCostPaisas: it.totalCostPaisas,
          sellingPrice: it.unitPrice,
          notes: it.schemeBonusBase > 0
            ? `Direct Sale ${invoiceNumber} (incl. ${it.schemeBonusBase} free bonus pcs) - ${customerName}`
            : `Direct Sale ${invoiceNumber} - ${customerName}`,
          updateProductStock: false,
        });
      }
    }

    // 4. Generate Compound Double-Entry General Ledger Voucher

    const cashAccount = db.prepare("SELECT id FROM chart_of_accounts WHERE code = '1010' AND company_id = ?").get(companyId) as { id: string } | undefined;
    const arAccount = db.prepare("SELECT id FROM chart_of_accounts WHERE code = '1030' AND company_id = ?").get(companyId) as { id: string } | undefined;
    const invAccount = db.prepare("SELECT id FROM chart_of_accounts WHERE code = '1040' AND company_id = ?").get(companyId) as { id: string } | undefined;
    const salesAccount = db.prepare("SELECT id FROM chart_of_accounts WHERE code = '4010' AND company_id = ?").get(companyId) as { id: string } | undefined;
    const cogsAccount = db.prepare("SELECT id FROM chart_of_accounts WHERE code = '5010' AND company_id = ?").get(companyId) as { id: string } | undefined;
    let schemeAccount = db.prepare("SELECT id FROM chart_of_accounts WHERE code = '5060' AND company_id = ?").get(companyId) as { id: string } | undefined;
    if (!schemeAccount) {
      schemeAccount = db.prepare("SELECT id FROM chart_of_accounts WHERE code = '5020' AND company_id = ?").get(companyId) as { id: string } | undefined;
    }

    if (arAccount && salesAccount) {
      const glLines: CreateJournalLineInput[] = [];

      // Leg 1: Spot Cash + Receivable = Sales Revenue
      if (cashReceivedPaisas > 0 && cashAccount) {
        glLines.push({
          accountId: cashAccount.id,
          debit: fromPaisas(cashReceivedPaisas),
          credit: 0,
          memo: `Spot cash recovery for ${invoiceNumber}`,
        });
      }

      if (remainingBalancePaisas > 0) {
        glLines.push({
          accountId: arAccount.id,
          debit: fromPaisas(remainingBalancePaisas),
          credit: 0,
          entityId: input.customerId,
          entityType: 'CUSTOMER',
          memo: `Net receivable from ${customerName} for ${invoiceNumber}`,
        });
      }

      glLines.push({
        accountId: salesAccount.id,
        debit: 0,
        credit: fromPaisas(grandTotalPaisas),
        memo: `Wholesale distribution sales revenue for ${invoiceNumber}`,
      });

      // Leg 2: Perpetual Inventory Relief for Billed Goods
      if (totalCogsPaisas > 0 && cogsAccount && invAccount) {
        glLines.push(
          {
            accountId: cogsAccount.id,
            debit: fromPaisas(totalCogsPaisas),
            credit: 0,
            memo: `COGS for ${invoiceNumber}`,
          },
          {
            accountId: invAccount.id,
            debit: 0,
            credit: fromPaisas(totalCogsPaisas),
            memo: `Inventory relief for ${invoiceNumber}`,
          }
        );
      }

      // Leg 3: Trade Scheme / Free Bonus Unit Expense Relief
      if (totalSchemeExpensePaisas > 0 && schemeAccount && invAccount) {
        glLines.push(
          {
            accountId: schemeAccount.id,
            debit: fromPaisas(totalSchemeExpensePaisas),
            credit: 0,
            memo: `Trade promotion/free sample scheme bonus units for ${invoiceNumber}`,
          },
          {
            accountId: invAccount.id,
            debit: 0,
            credit: fromPaisas(totalSchemeExpensePaisas),
            memo: `Free sample inventory relief for ${invoiceNumber}`,
          }
        );
      }

      DoubleEntryEngine.postEntry({
        companyId,
        entryDate: invoiceDate,
        description: `Direct Sale ${invoiceNumber} - ${customerName} (Cash: ${fromPaisas(cashReceivedPaisas)}, Credit: ${fromPaisas(remainingBalancePaisas)})`,
        sourceModule: 'sales',
        sourceDocumentId: invoiceId,
        lines: glLines,
        createdBy: 'Sales Distribution Engine',
      });
    }

    return this.getInvoiceById(invoiceId, companyId);
  }

  /**
   * Convert / Post an existing Sales Order into a Commercial Bill / Invoice
   * Copies Salesperson and Supply Person permanently from the Order to Invoice.
   */
  public static convertOrderToInvoice(orderId: string, companyIdOverride?: string) {
    const db = getDatabase();
    const companyId = companyIdOverride || DEFAULT_COMPANY_ID;
    const order = this.getOrderById(orderId, companyId);
    if (!order) {
      throw new Error(`Order ${orderId} not found in this company.`);
    }

    // Check if invoice already created for this order
    const existingInv = db.prepare('SELECT id, invoice_number FROM sales_invoices WHERE order_id = ? AND company_id = ?').get(orderId, companyId) as any;
    if (existingInv) {
      return this.getInvoiceById(existingInv.id, companyId);
    }

    const invoiceId = generateUUID();
    const countRow = db.prepare('SELECT COUNT(*) as count FROM sales_invoices WHERE company_id = ?').get(companyId) as { count: number };
    const nextSeq = (countRow?.count || 0) + 1;
    const invoiceNumber = `INV-${new Date().getFullYear()}-${String(nextSeq).padStart(4, '0')}`;
    const invoiceDate = new Date().toISOString().split('T')[0];

    db.exec('BEGIN TRANSACTION;');
    try {
      db.prepare(`
        INSERT INTO sales_invoices (
          id, company_id, invoice_number, customer_id, route_id, salesman_id, supply_person_id,
          order_id, invoice_date, due_date,
          subtotal_paisas, line_discount_paisas, bill_discount_paisas, grand_total_paisas,
          cost_of_goods_sold_paisas, scheme_expense_paisas, cash_received_paisas, remaining_balance_paisas,
          subtotal, discount, tax, grand_total, cost_of_goods_sold, amount_paid,
          payment_status, status, invoice_type, notes,
          source_channel, created_by_user_id, created_by_staff_id, client_order_uuid
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0.0, ?, ?, ?, ?, 'POSTED', 'ORDER_DELIVERY', ?, ?, ?, ?, ?)
      `).run(
        invoiceId,
        companyId,
        invoiceNumber,
        order.customer_id,
        order.route_id || null,
        order.salesman_id || null,
        order.supply_person_id || null,
        order.id,
        invoiceDate,
        order.delivery_date || null,
        order.subtotal_paisas || toPaisas(order.subtotal),
        order.line_discount_paisas || 0,
        order.bill_discount_paisas || 0,
        order.grand_total_paisas || toPaisas(order.grand_total),
        order.cost_of_goods_sold_paisas || toPaisas(order.cost_of_goods_sold || 0),
        order.scheme_expense_paisas || 0,
        order.cash_received_paisas || toPaisas(order.cash_received || 0),
        order.remaining_balance_paisas || toPaisas(order.remaining_balance || 0),
        order.subtotal,
        order.discount || 0,
        order.grand_total,
        order.cost_of_goods_sold || 0,
        order.cash_received || 0,
        order.payment_status || 'UNPAID',
        order.notes || null,
        order.source_channel || 'OFFICE',
        order.created_by_user_id || null,
        order.created_by_staff_id || null,
        order.client_order_uuid || null
      );

      const insertItem = db.prepare(`
        INSERT INTO sales_invoice_items (
          id, company_id, invoice_id, product_id, quantity_base, cartons_count, loose_pieces_count,
          unit_price_paisas, unit_cost_paisas, total_cost_paisas,
          discount_percent, discount_paisas, scheme_bonus_base, line_total_paisas,
          quantity, unit_price, unit_cost, total_price, total_cost
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const item of (order.items || [])) {
        insertItem.run(
          generateUUID(),
          companyId,
          invoiceId,
          item.product_id,
          item.quantity_base,
          item.cartons_count || 0,
          item.loose_pieces_count || 0,
          item.unit_price_paisas || toPaisas(item.unit_price),
          item.unit_cost_paisas || toPaisas(item.unit_cost),
          item.total_cost_paisas || toPaisas(item.total_cost),
          item.discount_percent || 0,
          item.discount_paisas || toPaisas(item.discount),
          item.scheme_bonus_base || 0,
          item.line_total_paisas || toPaisas(item.line_total),
          item.quantity_base,
          item.unit_price,
          item.unit_cost,
          item.line_total,
          item.total_cost
        );
      }

      db.exec('COMMIT;');
    } catch (e) {
      db.exec('ROLLBACK;');
      throw e;
    }

    return this.getInvoiceById(invoiceId, companyId);
  }

  /**
   * Query single order with item details, live customer balance, and GL voucher lines
   */
  public static getOrderById(orderId: string, companyIdOverride?: string) {
    const db = getDatabase();
    const companyId = companyIdOverride || DEFAULT_COMPANY_ID;
    const order = db.prepare(`
      SELECT 
        o.*,
        c.name as customer_name,
        c.shop_name,
        c.phone as customer_phone,
        c.address as customer_address,
        c.city as customer_city,
        c.cnic_or_ntn,
        r.name as route_name,
        r.code as route_code,
        s.name as salesman_name,
        p.name as supply_person_name,
        s.employee_code as salesman_code,
        p.employee_code as supply_person_code,
        bk.name as booker_staff_name,
        bk.employee_code as booker_employee_code,
        bu.username as booker_user_name,
        bu.full_name as booker_user_full_name
      FROM sales_orders o
      LEFT JOIN customers c ON o.customer_id = c.id AND c.company_id = o.company_id
      LEFT JOIN routes r ON o.route_id = r.id AND r.company_id = o.company_id
      LEFT JOIN staff_members s ON o.salesman_id = s.id AND s.company_id = o.company_id
      LEFT JOIN staff_members p ON o.supply_person_id = p.id AND p.company_id = o.company_id
      LEFT JOIN staff_members bk ON o.created_by_staff_id = bk.id AND bk.company_id = o.company_id
      LEFT JOIN app_users bu ON o.created_by_user_id = bu.id AND bu.company_id = o.company_id
      WHERE o.id = ? AND o.company_id = ?
    `).get(orderId, companyId) as any;

    if (!order) return null;

    const items = db.prepare(`
      SELECT 
        i.*,
        p.name as product_name,
        p.sku,
        p.uom_base,
        p.uom_bulk,
        p.bulk_conversion_factor,
        p.boxes_per_carton,
        p.pieces_per_box,
        p.total_pieces_per_carton,
        p.item_type
      FROM sales_order_items i
      JOIN products p ON i.product_id = p.id AND p.company_id = ?
      WHERE i.order_id = ? AND i.company_id = ?
    `).all(companyId, orderId, companyId) as any[];

    // Calculate customer current ledger balance for receipt
    let customerLedgerBalance = 0;
    try {
      const statement = DoubleEntryEngine.getSubLedger('CUSTOMER', order.customer_id, companyId);
      customerLedgerBalance = statement.length > 0 ? statement[statement.length - 1].runningBalance : 0;
    } catch {
      customerLedgerBalance = 0;
    }

    // Fetch linked General Ledger Voucher lines if posted
    let journalLines: any[] = [];
    if (order.journal_entry_id) {
      journalLines = db.prepare(`
        SELECT jl.*, ca.code as account_code, ca.name as account_name
        FROM journal_lines jl
        JOIN chart_of_accounts ca ON jl.account_id = ca.id AND ca.company_id = ?
        WHERE jl.journal_id = ? AND jl.company_id = ?
        ORDER BY jl.debit DESC, jl.credit DESC
      `).all(companyId, order.journal_entry_id, companyId) as any[];
    }

    return {
      ...order,
      subtotal: fromPaisas(order.subtotal_paisas),
      line_discount: fromPaisas(order.line_discount_paisas),
      bill_discount: fromPaisas(order.bill_discount_paisas),
      tax: fromPaisas(order.tax_amount_paisas || 0),
      grand_total: fromPaisas(order.grand_total_paisas),
      cash_received: fromPaisas(order.cash_received_paisas || 0),
      remaining_balance: fromPaisas(order.remaining_balance_paisas || 0),
      cost_of_goods_sold: fromPaisas(order.cost_of_goods_sold_paisas || 0),
      customer_ledger_balance: customerLedgerBalance,
      journal_lines: journalLines,
      items: items.map((it) => ({
        ...it,
        unit_price: fromPaisas(it.unit_price_paisas),
        unit_cost: fromPaisas(it.unit_cost_paisas || 0),
        discount_amount: fromPaisas(it.discount_paisas),
        tax: fromPaisas(it.tax_paisas || 0),
        tax_percent: it.tax_percent || 0,
        line_total: fromPaisas(it.line_total_paisas),
      })),
    };
  }

  /**
   * Cancel and Void a posted Sale Order
   * Reverses the GL journal entry via DoubleEntryEngine.voidEntry() and replenishes physical inventory
   */
  public static cancelOrder(orderId: string, reason?: string, companyIdOverride?: string) {
    const db = getDatabase();
    const companyId = companyIdOverride || DEFAULT_COMPANY_ID;
    const order = db.prepare('SELECT * FROM sales_orders WHERE id = ? AND company_id = ?').get(orderId, companyId) as any;
    if (!order) throw new Error(`Sale order ${orderId} not found in this company.`);
    if (order.status === 'CANCELLED' || order.status === 'VOID') {
      throw new Error(`Order ${order.order_number} is already cancelled.`);
    }

    // 1. If order has a posted GL journal entry, void it atomically via DoubleEntryEngine
    if (order.journal_entry_id) {
      try {
        DoubleEntryEngine.voidEntry(order.journal_entry_id, reason || `Cancelled Sale Order ${order.order_number}`, companyId);
      } catch (err: any) {
        console.warn(`Could not void GL entry for ${order.order_number}:`, err.message);
      }
    }

    // 2. Replenish inventory for physical items (non-service)
    const items = db.prepare(`
      SELECT soi.*, p.item_type
      FROM sales_order_items soi
      JOIN products p ON soi.product_id = p.id AND p.company_id = ?
      WHERE soi.order_id = ? AND soi.company_id = ?
    `).all(companyId, orderId, companyId) as any[];

    for (const it of items) {
      if (it.item_type !== 'SERVICE') {
        const totalBase = (it.quantity_base || 0) + (it.scheme_bonus_base || 0);
        if (totalBase > 0) {
          db.prepare(`
            UPDATE products
            SET current_stock_base = current_stock_base + ?,
                current_stock = current_stock + ?,
                updated_at = datetime('now')
            WHERE id = ? AND company_id = ?
          `).run(totalBase, totalBase, it.product_id, companyId);
        }
      }
    }

    // Record audit reversal
    InventoryAuditService.recordReversal(db, {
      companyId,
      originalTransactionId: orderId,
      reason: 'Order cancelled',
      updateProductStock: false,
    });

    // 3. Mark status as CANCELLED
    db.prepare(`
      UPDATE sales_orders
      SET status = 'CANCELLED',
          updated_at = datetime('now')
      WHERE id = ? AND company_id = ?
    `).run(orderId, companyId);

    return this.getOrderById(orderId, companyId);
  }

  /**
   * Query all sale orders with optional filters
   */
  public static getOrders(filters?: {
    companyId?: string;
    status?: string;
    routeId?: string;
    date?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
    sourceChannel?: string;
    bookerId?: string;
    salesmanId?: string;
    customerId?: string;
    userRole?: string;
    userId?: string;
    page?: number;
    limit?: number;
  }, companyIdOverride?: string) {
    const db = getDatabase();
    const companyId = filters?.companyId || companyIdOverride || DEFAULT_COMPANY_ID;
    let whereClause = 'WHERE o.company_id = ?';
    const params: any[] = [companyId];

    // Role-based visibility: Order booker can view their own orders by default
    if (filters?.userRole === 'ORDER_BOOKER' && filters.userId) {
      whereClause += ` AND (o.created_by_user_id = ? OR o.created_by_staff_id = (SELECT staff_id FROM app_users WHERE id = ? AND company_id = ?))`;
      params.push(filters.userId, filters.userId, companyId);
    }

    if (filters?.sourceChannel) {
      whereClause += ' AND o.source_channel = ?';
      params.push(filters.sourceChannel);
    }
    if (filters?.bookerId) {
      whereClause += ' AND (o.created_by_staff_id = ? OR o.created_by_user_id = ?)';
      params.push(filters.bookerId, filters.bookerId);
    }
    if (filters?.salesmanId) {
      whereClause += ' AND o.salesman_id = ?';
      params.push(filters.salesmanId);
    }
    if (filters?.customerId) {
      whereClause += ' AND o.customer_id = ?';
      params.push(filters.customerId);
    }
    if (filters?.status) {
      whereClause += ' AND o.status = ?';
      params.push(filters.status);
    }
    if (filters?.routeId) {
      whereClause += ' AND o.route_id = ?';
      params.push(filters.routeId);
    }
    if (filters?.date) {
      whereClause += ' AND o.order_date = ?';
      params.push(filters.date);
    }
    if (filters?.startDate && filters?.endDate) {
      whereClause += ' AND o.order_date >= ? AND o.order_date <= ?';
      params.push(filters.startDate, filters.endDate);
    } else if (filters?.startDate) {
      whereClause += ' AND o.order_date >= ?';
      params.push(filters.startDate);
    } else if (filters?.endDate) {
      whereClause += ' AND o.order_date <= ?';
      params.push(filters.endDate);
    }
    if (filters?.search) {
      whereClause += ' AND (o.order_number LIKE ? OR c.name LIKE ? OR c.shop_name LIKE ?)';
      const q = `%${filters.search}%`;
      params.push(q, q, q);
    }

    // Pagination calculations
    const page = filters?.page && filters.page > 0 ? filters.page : 1;
    const limit = filters?.limit && filters.limit > 0 ? Math.min(filters.limit, 200) : undefined;
    const offset = limit ? (page - 1) * limit : 0;

    let totalCount = 0;
    if (limit) {
      const countRow = db.prepare(`
        SELECT COUNT(*) as total 
        FROM sales_orders o 
        LEFT JOIN customers c ON o.customer_id = c.id AND c.company_id = o.company_id
        ${whereClause}
      `).get(...params) as { total: number };
      totalCount = countRow?.total || 0;
    }

    const queryParams = [...params];
    let paginationSuffix = '';
    if (limit) {
      paginationSuffix = ' LIMIT ? OFFSET ?';
      queryParams.push(limit, offset);
    }

    // Optimized: Main query without per-row subqueries
    const rows = db.prepare(`
      SELECT 
        o.*,
        c.name as customer_name,
        c.shop_name,
        r.name as route_name,
        s.name as salesman_name,
        p.name as supply_person_name,
        s.employee_code as salesman_code,
        p.employee_code as supply_person_code,
        bk.name as booker_staff_name,
        bk.employee_code as booker_employee_code,
        bu.username as booker_user_name,
        bu.full_name as booker_user_full_name
      FROM sales_orders o
      LEFT JOIN customers c ON o.customer_id = c.id AND c.company_id = o.company_id
      LEFT JOIN routes r ON o.route_id = r.id AND r.company_id = o.company_id
      LEFT JOIN staff_members s ON o.salesman_id = s.id AND s.company_id = o.company_id
      LEFT JOIN staff_members p ON o.supply_person_id = p.id AND p.company_id = o.company_id
      LEFT JOIN staff_members bk ON o.created_by_staff_id = bk.id AND bk.company_id = o.company_id
      LEFT JOIN app_users bu ON o.created_by_user_id = bu.id AND bu.company_id = o.company_id
      ${whereClause}
      ORDER BY o.created_at DESC
      ${paginationSuffix}
    `).all(...queryParams) as any[];

    // Fast batch aggregation of item counts for fetched orders only
    const orderIds = rows.map((r) => r.id);
    const aggMap = new Map<string, { itemCount: number; totalPieces: number }>();
    if (orderIds.length > 0) {
      const placeholders = orderIds.map(() => '?').join(',');
      const itemAggs = db.prepare(`
        SELECT 
          order_id,
          COUNT(*) as item_count,
          COALESCE(SUM(quantity_base + scheme_bonus_base), 0) as total_pieces
        FROM sales_order_items
        WHERE company_id = ? AND order_id IN (${placeholders})
        GROUP BY order_id
      `).all(companyId, ...orderIds) as any[];

      for (const agg of itemAggs) {
        aggMap.set(agg.order_id, {
          itemCount: Number(agg.item_count) || 0,
          totalPieces: Number(agg.total_pieces) || 0,
        });
      }
    }

    const mapped = rows.map((r) => {
      const agg = aggMap.get(r.id);
      return {
        ...r,
        item_count: agg?.itemCount || 0,
        total_pieces: agg?.totalPieces || 0,
        subtotal: fromPaisas(r.subtotal_paisas),
        line_discount: fromPaisas(r.line_discount_paisas),
        bill_discount: fromPaisas(r.bill_discount_paisas),
        grand_total: fromPaisas(r.grand_total_paisas),
        cash_received: fromPaisas(r.cash_received_paisas || 0),
        remaining_balance: fromPaisas(r.remaining_balance_paisas || 0),
        cost_of_goods_sold: fromPaisas(r.cost_of_goods_sold_paisas || 0),
      };
    });

    if (filters?.page || filters?.limit) {
      return Object.assign(mapped, {
        pagination: {
          total: totalCount || mapped.length,
          page,
          limit: limit || mapped.length,
          totalPages: limit ? Math.ceil(totalCount / limit) : 1,
        },
      });
    }

    return mapped;
  }

  /**
   * Route Load Sheet & Dispatch Aggregation (/dispatch/load-sheet)
   * Consolidates all posted sale orders for the specified date and route into vehicle loading quantities.
   */
  public static getRouteLoadSheet(params: { date?: string; routeId?: string; supplyPersonId?: string; companyId?: string }, companyIdOverride?: string) {
    const db = getDatabase();
    const companyId = params.companyId || companyIdOverride || DEFAULT_COMPANY_ID;
    const targetDate = params.date || new Date().toISOString().split('T')[0];

    let whereClause = "WHERE o.company_id = ? AND o.status = 'POSTED' AND o.order_date = ?";
    const queryParams: any[] = [companyId, targetDate];

    if (params.routeId) {
      whereClause += " AND o.route_id = ?";
      queryParams.push(params.routeId);
    }
    if (params.supplyPersonId) {
      whereClause += " AND o.supply_person_id = ?";
      queryParams.push(params.supplyPersonId);
    }

    // Query consolidated orders
    const orders = db.prepare(`
      SELECT 
        o.*,
        c.name as customer_name,
        c.shop_name,
        c.phone as customer_phone,
        c.address as customer_address,
        r.name as route_name,
        r.code as route_code,
        s.name as salesman_name,
        p.name as supply_person_name,
        (SELECT COUNT(*) FROM sales_order_items WHERE order_id = o.id AND company_id = o.company_id) as item_count,
        (SELECT SUM(quantity_base + scheme_bonus_base) FROM sales_order_items WHERE order_id = o.id AND company_id = o.company_id) as total_pieces
      FROM sales_orders o
      LEFT JOIN customers c ON o.customer_id = c.id AND c.company_id = o.company_id
      LEFT JOIN routes r ON o.route_id = r.id AND r.company_id = o.company_id
      LEFT JOIN staff_members s ON o.salesman_id = s.id AND s.company_id = o.company_id
      LEFT JOIN staff_members p ON o.supply_person_id = p.id AND p.company_id = o.company_id
      ${whereClause}
      ORDER BY o.created_at ASC
    `).all(...queryParams) as any[];

    // Query consolidated items for loading gate pass
    const consolidatedItems = db.prepare(`
      SELECT 
        p.id as product_id,
        p.name as product_name,
        p.sku,
        p.uom_base,
        p.uom_bulk,
        p.bulk_conversion_factor,
        p.boxes_per_carton,
        p.pieces_per_box,
        p.total_pieces_per_carton,
        p.item_type,
        p.current_stock_base,
        SUM(soi.quantity_base) as billed_pieces,
        SUM(soi.scheme_bonus_base) as bonus_pieces,
        SUM(soi.quantity_base + soi.scheme_bonus_base) as total_pieces_to_load
      FROM sales_order_items soi
      JOIN sales_orders o ON soi.order_id = o.id AND o.company_id = soi.company_id
      JOIN products p ON soi.product_id = p.id AND p.company_id = soi.company_id
      ${whereClause}
      GROUP BY p.id
      ORDER BY p.name ASC
    `).all(...queryParams) as any[];

    let totalGrossRevenuePaisas = 0;
    let totalPiecesToLoad = 0;
    let totalCartons = 0;
    let totalBoxes = 0;
    let totalLoosePieces = 0;

    const formattedItems = consolidatedItems.map((ci) => {
      const conv = ci.total_pieces_per_carton || ci.bulk_conversion_factor || 1;
      const pcsPerBox = ci.pieces_per_box || 1;
      const totalPcs = Number(ci.total_pieces_to_load) || 0;

      const cartons = Math.floor(totalPcs / conv);
      const remAfterCartons = totalPcs % conv;
      const boxes = Math.floor(remAfterCartons / pcsPerBox);
      const loosePieces = remAfterCartons % pcsPerBox;

      totalPiecesToLoad += totalPcs;
      totalCartons += cartons;
      totalBoxes += boxes;
      totalLoosePieces += loosePieces;

      return {
        ...ci,
        cartons_to_load: cartons,
        boxes_to_load: boxes,
        loose_pieces_to_load: loosePieces,
        total_pieces: totalPcs,
        available_stock: ci.current_stock_base,
      };
    });

    for (const ord of orders) {
      totalGrossRevenuePaisas += (ord.grand_total_paisas || 0);
    }

    let routeName = 'All Routes';
    if (params.routeId) {
      const r = db.prepare('SELECT name FROM routes WHERE id = ? AND company_id = ?').get(params.routeId, companyId) as any;
      if (r) routeName = r.name;
    }

    let supplyPersonName = 'Unassigned / All Drivers';
    if (params.supplyPersonId) {
      const sp = db.prepare('SELECT name FROM staff_members WHERE id = ? AND company_id = ?').get(params.supplyPersonId, companyId) as any;
      if (sp) supplyPersonName = sp.name;
    }

    return {
      date: targetDate,
      route_id: params.routeId || null,
      route_name: routeName,
      supply_person_id: params.supplyPersonId || null,
      supply_person_name: supplyPersonName,
      total_orders: orders.length,
      total_pieces_to_load: totalPiecesToLoad,
      total_cartons: totalCartons,
      total_boxes: totalBoxes,
      total_loose_pieces: totalLoosePieces,
      total_revenue: fromPaisas(totalGrossRevenuePaisas),
      items: formattedItems,
      orders: orders.map((o) => ({
        ...o,
        subtotal: fromPaisas(o.subtotal_paisas),
        grand_total: fromPaisas(o.grand_total_paisas),
        cash_received: fromPaisas(o.cash_received_paisas || 0),
        remaining_balance: fromPaisas(o.remaining_balance_paisas || 0),
      })),
    };
  }

  /**
   * Query all sales invoices
   */
  public static getInvoices(companyIdOverride?: string) {
    const db = getDatabase();
    const companyId = companyIdOverride || DEFAULT_COMPANY_ID;
    const rows = db.prepare(`
      SELECT 
        i.*,
        c.name as customer_name,
        c.shop_name,
        r.name as route_name,
        s.name as salesman_name,
        p.name as supply_person_name,
        s.employee_code as salesman_code,
        p.employee_code as supply_person_code,
        (SELECT COUNT(*) FROM sales_invoice_items WHERE invoice_id = i.id AND company_id = i.company_id) as item_count
      FROM sales_invoices i
      LEFT JOIN customers c ON i.customer_id = c.id AND c.company_id = i.company_id
      LEFT JOIN routes r ON i.route_id = r.id AND r.company_id = i.company_id
      LEFT JOIN staff_members s ON i.salesman_id = s.id AND s.company_id = i.company_id
      LEFT JOIN staff_members p ON i.supply_person_id = p.id AND p.company_id = i.company_id
      WHERE i.company_id = ?
      ORDER BY i.created_at DESC
    `).all(companyId) as any[];

    return rows.map((r) => ({
      ...r,
      subtotal: fromPaisas(r.subtotal_paisas || toPaisas(r.subtotal)),
      grand_total: fromPaisas(r.grand_total_paisas || toPaisas(r.grand_total)),
      cash_received: fromPaisas(r.cash_received_paisas || toPaisas(r.amount_paid)),
      remaining_balance: fromPaisas(r.remaining_balance_paisas || toPaisas(r.grand_total - r.amount_paid)),
    }));
  }

  public static getInvoiceById(invoiceId: string, companyIdOverride?: string) {
    const db = getDatabase();
    const companyId = companyIdOverride || DEFAULT_COMPANY_ID;
    const invoice = db.prepare(`
      SELECT 
        i.*,
        c.name as customer_name,
        c.shop_name,
        c.phone as customer_phone,
        c.address as customer_address,
        c.city as customer_city,
        c.cnic_or_ntn,
        r.name as route_name,
        r.code as route_code,
        s.name as salesman_name,
        p.name as supply_person_name,
        s.employee_code as salesman_code,
        p.employee_code as supply_person_code
      FROM sales_invoices i
      LEFT JOIN customers c ON i.customer_id = c.id AND c.company_id = i.company_id
      LEFT JOIN routes r ON i.route_id = r.id AND r.company_id = i.company_id
      LEFT JOIN staff_members s ON i.salesman_id = s.id AND s.company_id = i.company_id
      LEFT JOIN staff_members p ON i.supply_person_id = p.id AND p.company_id = i.company_id
      WHERE i.id = ? AND i.company_id = ?
    `).get(invoiceId, companyId) as any;

    if (!invoice) return null;

    const items = db.prepare(`
      SELECT 
        item.*,
        p.name as product_name,
        p.sku,
        p.uom_base,
        p.uom_bulk,
        p.bulk_conversion_factor
      FROM sales_invoice_items item
      JOIN products p ON item.product_id = p.id AND p.company_id = ?
      WHERE item.invoice_id = ? AND item.company_id = ?
    `).all(companyId, invoiceId, companyId) as any[];

    return {
      ...invoice,
      subtotal: fromPaisas(invoice.subtotal_paisas || toPaisas(invoice.subtotal)),
      grand_total: fromPaisas(invoice.grand_total_paisas || toPaisas(invoice.grand_total)),
      cash_received: fromPaisas(invoice.cash_received_paisas || toPaisas(invoice.amount_paid)),
      remaining_balance: fromPaisas(invoice.remaining_balance_paisas || toPaisas(invoice.grand_total - invoice.amount_paid)),
      items: items.map((it) => ({
        ...it,
        unit_price: fromPaisas(it.unit_price_paisas || toPaisas(it.unit_price)),
        discount_amount: fromPaisas(it.discount_paisas || 0),
        tax: fromPaisas(it.tax_paisas || 0),
        tax_percent: it.tax_percent || 0,
        line_total: fromPaisas(it.line_total_paisas || toPaisas(it.line_total)),
      })),
    };
  }

  /**
   * Universal DAL Async Order Creation for PostgreSQL & SQLite
   */
  public static async createOrderAsync(
    input: any,
    companyId: string = DEFAULT_COMPANY_ID,
    client?: import('@/core/database/types').IDatabaseClient | import('@/core/database/types').ITransactionClient
  ): Promise<any> {
    const { DalService } = await import('@/core/database/dal-services');
    return DalService.createSalesOrder(input, companyId, client);
  }

  /**
   * Universal DAL Async Order Fetch for PostgreSQL & SQLite
   */
  public static async getOrderByIdAsync(
    id: string,
    companyId: string = DEFAULT_COMPANY_ID,
    client?: import('@/core/database/types').IDatabaseClient | import('@/core/database/types').ITransactionClient
  ): Promise<any> {
    const { DalService } = await import('@/core/database/dal-services');
    return DalService.getOrderById(id, companyId, client);
  }

  /**
   * Universal DAL Async Orders List for PostgreSQL & SQLite
   */
  public static async getOrdersAsync(
    companyId: string = DEFAULT_COMPANY_ID,
    client?: import('@/core/database/types').IDatabaseClient | import('@/core/database/types').ITransactionClient
  ): Promise<any[]> {
    const { DalService } = await import('@/core/database/dal-services');
    return DalService.getOrders(companyId, client);
  }

  /**
   * Universal DAL Async Invoices List for PostgreSQL & SQLite
   */
  public static async getInvoicesAsync(
    companyId: string = DEFAULT_COMPANY_ID,
    client?: import('@/core/database/types').IDatabaseClient | import('@/core/database/types').ITransactionClient
  ): Promise<any[]> {
    const { DalService } = await import('@/core/database/dal-services');
    return DalService.getInvoicesDetailed(companyId, client);
  }

  /**
   * Universal DAL Async Invoice Details for PostgreSQL & SQLite
   */
  public static async getInvoiceByIdAsync(
    invoiceId: string,
    companyId: string = DEFAULT_COMPANY_ID,
    client?: import('@/core/database/types').IDatabaseClient | import('@/core/database/types').ITransactionClient
  ): Promise<any> {
    const { DalService } = await import('@/core/database/dal-services');
    return DalService.getInvoiceByIdDetailed(invoiceId, companyId, client);
  }
}


