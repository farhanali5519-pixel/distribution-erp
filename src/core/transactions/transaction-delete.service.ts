import { getDatabase } from '@/core/database/db';
import { getDatabaseClient } from '@/core/database/factory';
import { generateUUID } from '@/shared/utils/uuid';
import { AuthService } from '@/modules/auth/service';
import { InventoryAuditService } from '@/modules/inventory/audit.service';
import { getTenantContext } from '@/core/tenancy/context';
import { DEFAULT_COMPANY_ID } from '@/core/tenancy/constants';

export type TransactionType =
  | 'SALES_ORDER'
  | 'DIRECT_SALE'
  | 'SALES_RETURN'
  | 'CUSTOMER_PAYMENT'
  | 'PURCHASE_BILL'
  | 'PURCHASE_RETURN'
  | 'VENDOR_PAYMENT'
  | 'EXPENSE'
  | 'JOURNAL_ENTRY'
  | 'STOCK_ADJUSTMENT';

export interface DeleteTransactionContext {
  companyId?: string;
  userId?: string;
  userName?: string;
  userRole?: string;
  adminPin?: string;
  reason?: string;
}

export interface AuditLogEntry {
  id: string;
  company_id: string;
  user_id: string | null;
  user_name: string | null;
  user_role: string | null;
  action: string;
  transaction_type: string;
  transaction_id: string;
  transaction_number: string | null;
  transaction_date: string | null;
  reason: string;
  is_day_closed: number;
  details_json: string | null;
  created_at: string;
}

function formatDependencyList(parts: string[]): string {
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

export class TransactionDeleteService {
  /**
   * Check if a transaction date falls on a closed day and whether the user is authorized as an Admin.
   * If the day is CLOSED:
   *   - Non-admin throws: "This transaction belongs to a closed day and can only be deleted by an Administrator."
   *   - Admin without reason throws: "A deletion reason is required for administrative override on a closed day."
   */
  public static checkDayCloseAuthorization(
    dateStr: string,
    context?: DeleteTransactionContext
  ): { isClosedDay: boolean; closedBy?: string } {
    const db = getDatabase();
    const cleanDate = (dateStr || '').slice(0, 10);
    if (!cleanDate) return { isClosedDay: false };

    const companyId = context?.companyId || DEFAULT_COMPANY_ID;

    const closedRow = db.prepare(
      "SELECT * FROM daily_closings WHERE closing_date = ? AND status = 'CLOSED' AND company_id = ?"
    ).get(cleanDate, companyId) as any;

    if (!closedRow) {
      return { isClosedDay: false };
    }

    // Day is closed! Check admin override
    const isAdmin =
      context?.userRole === 'ADMIN' ||
      (context?.adminPin ? AuthService.verifyAdminPin(context.adminPin, companyId) : false);

    if (!isAdmin) {
      throw new Error("This transaction belongs to a closed day and can only be deleted by an Administrator.");
    }

    if (!context?.reason || !context.reason.trim()) {
      throw new Error("A deletion reason is required for administrative override on a closed day.");
    }

    return {
      isClosedDay: true,
      closedBy: closedRow.closed_by || 'Admin Cashier',
    };
  }

  /**
   * Helper to extract deletion context from Request headers or JSON body.
   * STRICT: companyId, userId, userRole, userName strictly come from server tenant context.
   */
  public static async extractContext(req: Request): Promise<DeleteTransactionContext> {
    const tenant = await getTenantContext(req);
    let adminPin = req.headers.get('x-admin-pin') || undefined;
    let reason = req.headers.get('x-delete-reason') || undefined;

    try {
      const clone = req.clone();
      const body = await clone.json();
      if (body.adminPin) adminPin = body.adminPin;
      if (body.reason) reason = body.reason;
    } catch {
      // Body optional
    }

    return {
      companyId: tenant.companyId,
      userId: tenant.userId,
      userName: tenant.fullName || tenant.username,
      userRole: tenant.role,
      adminPin,
      reason,
    };
  }

  /**
   * Log deletion event to audit_logs
   */
  public static logAudit(data: {
    companyId?: string;
    userId?: string;
    userName?: string;
    userRole?: string;
    action: string;
    transactionType: TransactionType;
    transactionId: string;
    transactionNumber: string;
    transactionDate: string;
    reason: string;
    isDayClosed: boolean;
    details?: any;
  }) {
    const db = getDatabase();
    const id = generateUUID();
    const companyId = data.companyId || DEFAULT_COMPANY_ID;
    db.prepare(`
      INSERT INTO audit_logs (
        id, company_id, user_id, user_name, user_role, action, transaction_type,
        transaction_id, transaction_number, transaction_date, reason,
        is_day_closed, details_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      id,
      companyId,
      data.userId || 'admin',
      data.userName || (data.userRole === 'ADMIN' ? 'Administrator' : 'Authorized User'),
      data.userRole || 'ADMIN',
      data.action,
      data.transactionType,
      data.transactionId,
      data.transactionNumber || '',
      data.transactionDate || '',
      data.reason || (data.isDayClosed ? 'Admin Override Delete & Reverse' : 'Delete & Reverse'),
      data.isDayClosed ? 1 : 0,
      JSON.stringify(data.details || {})
    );
  }

  // =========================================================================
  // 1. SALES ORDERS / COMMERCIAL BILLS
  // =========================================================================
  public static deleteSalesOrder(id: string, context?: DeleteTransactionContext) {
    const db = getDatabase();
    const companyId = context?.companyId || DEFAULT_COMPANY_ID;
    const order = db.prepare('SELECT * FROM sales_orders WHERE id = ? AND company_id = ?').get(id, companyId) as any;
    if (!order) {
      throw new Error(`Sale order ${id} not found.`);
    }

    const { isClosedDay } = this.checkDayCloseAuthorization(order.order_date, context);

    db.exec('BEGIN IMMEDIATE TRANSACTION;');
    try {
      // 1. Revert customer payment allocations on this order
      const allocations = db
        .prepare("SELECT * FROM customer_payment_allocations WHERE invoice_id = ? AND invoice_type = 'ORDER' AND company_id = ?")
        .all(id, companyId) as any[];

      for (const alloc of allocations) {
        db.prepare(`
          UPDATE customer_payments
          SET unallocated_amount_paisas = unallocated_amount_paisas + ?,
              unallocated_amount = unallocated_amount + ?,
              updated_at = datetime('now')
          WHERE id = ? AND company_id = ?
        `).run(alloc.allocated_amount_paisas, alloc.allocated_amount, alloc.payment_id, companyId);
      }
      db.prepare("DELETE FROM customer_payment_allocations WHERE invoice_id = ? AND invoice_type = 'ORDER' AND company_id = ?").run(id, companyId);

      // 2. Replenish inventory for non-service items if order was active/posted & record audit reversal
      if (order.status !== 'CANCELLED' && order.status !== 'VOID') {
        const reversals = InventoryAuditService.recordReversal(db, {
          companyId,
          originalTransactionId: id,
          userId: context?.userId,
          userName: context?.userName,
          userRole: context?.userRole,
          reason: context?.reason || 'Sales order deleted & reversed',
          adminOverrideDetails: isClosedDay ? `Closed Day Override by ${context?.userName || 'Admin'}` : undefined,
        });

        if (reversals.length === 0) {
          const items = db.prepare(`
            SELECT soi.*, p.item_type
            FROM sales_order_items soi
            JOIN products p ON soi.product_id = p.id AND p.company_id = soi.company_id
            WHERE soi.order_id = ? AND soi.company_id = ?
          `).all(id, companyId) as any[];

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
        }
      }

      // 3. Delete order items
      db.prepare('DELETE FROM sales_order_items WHERE order_id = ? AND company_id = ?').run(id, companyId);

      // 4. Delete order header
      db.prepare('DELETE FROM sales_orders WHERE id = ? AND company_id = ?').run(id, companyId);

      // 5. Delete linked journal entries and lines
      const journalIds: string[] = [];
      if (order.journal_entry_id) {
        journalIds.push(order.journal_entry_id);
      }
      const matchingJournals = db
        .prepare("SELECT id FROM journal_entries WHERE source_module = 'sales' AND source_document_id = ? AND company_id = ?")
        .all(id, companyId) as any[];
      for (const mj of matchingJournals) {
        if (!journalIds.includes(mj.id)) journalIds.push(mj.id);
      }

      for (const jid of journalIds) {
        db.prepare('DELETE FROM journal_lines WHERE journal_id = ? AND company_id = ?').run(jid, companyId);
        db.prepare('DELETE FROM journal_entries WHERE id = ? AND company_id = ?').run(jid, companyId);
      }

      // 6. Log audit
      this.logAudit({
        companyId,
        userId: context?.userId,
        userName: context?.userName,
        userRole: context?.userRole,
        action: 'DELETE_AND_REVERSE',
        transactionType: 'SALES_ORDER',
        transactionId: id,
        transactionNumber: order.order_number,
        transactionDate: order.order_date,
        reason: context?.reason || 'Sale order deleted & reversed',
        isDayClosed: isClosedDay,
        details: { grand_total: order.grand_total, customer_id: order.customer_id },
      });

      db.exec('COMMIT;');
      return { success: true, message: `Sale Order ${order.order_number} successfully deleted and reversed.` };
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
  }

  // =========================================================================
  // 2. DIRECT SALES (sales_invoices)
  // =========================================================================
  public static deleteDirectSale(id: string, context?: DeleteTransactionContext) {
    const db = getDatabase();
    const companyId = context?.companyId || DEFAULT_COMPANY_ID;
    const invoice = db.prepare('SELECT * FROM sales_invoices WHERE id = ? AND company_id = ?').get(id, companyId) as any;
    if (!invoice) {
      throw new Error(`Direct sale invoice ${id} not found.`);
    }

    const { isClosedDay } = this.checkDayCloseAuthorization(invoice.invoice_date, context);

    db.exec('BEGIN IMMEDIATE TRANSACTION;');
    try {
      // 1. Revert customer payment allocations on this invoice
      const allocations = db
        .prepare("SELECT * FROM customer_payment_allocations WHERE invoice_id = ? AND invoice_type = 'INVOICE' AND company_id = ?")
        .all(id, companyId) as any[];

      for (const alloc of allocations) {
        db.prepare(`
          UPDATE customer_payments
          SET unallocated_amount_paisas = unallocated_amount_paisas + ?,
              unallocated_amount = unallocated_amount + ?,
              updated_at = datetime('now')
          WHERE id = ? AND company_id = ?
        `).run(alloc.allocated_amount_paisas, alloc.allocated_amount, alloc.payment_id, companyId);
      }
      db.prepare("DELETE FROM customer_payment_allocations WHERE invoice_id = ? AND invoice_type = 'INVOICE' AND company_id = ?").run(id, companyId);

      // 2. Replenish inventory for non-service items if invoice was posted & record audit reversal
      if (invoice.status !== 'CANCELLED' && invoice.status !== 'VOID') {
        const reversals = InventoryAuditService.recordReversal(db, {
          companyId,
          originalTransactionId: id,
          userId: context?.userId,
          userName: context?.userName,
          userRole: context?.userRole,
          reason: context?.reason || 'Direct sale invoice deleted & reversed',
          adminOverrideDetails: isClosedDay ? `Closed Day Override by ${context?.userName || 'Admin'}` : undefined,
        });

        if (reversals.length === 0) {
          const items = db.prepare(`
            SELECT sii.*, p.item_type
            FROM sales_invoice_items sii
            JOIN products p ON sii.product_id = p.id AND p.company_id = sii.company_id
            WHERE sii.invoice_id = ? AND sii.company_id = ?
          `).all(id, companyId) as any[];

          for (const it of items) {
            if (it.item_type !== 'SERVICE') {
              const totalBase = (it.quantity_base || 0) + (it.scheme_bonus_base || 0) || (it.quantity || 0);
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
        }
      }

      // 3. Delete invoice items
      db.prepare('DELETE FROM sales_invoice_items WHERE invoice_id = ? AND company_id = ?').run(id, companyId);

      // 4. Delete invoice header
      db.prepare('DELETE FROM sales_invoices WHERE id = ? AND company_id = ?').run(id, companyId);

      // 5. Delete linked journal entries and lines
      const matchingJournals = db
        .prepare("SELECT id FROM journal_entries WHERE (source_module = 'sales' OR source_module = 'direct_sales') AND source_document_id = ? AND company_id = ?")
        .all(id, companyId) as any[];

      for (const mj of matchingJournals) {
        db.prepare('DELETE FROM journal_lines WHERE journal_id = ? AND company_id = ?').run(mj.id, companyId);
        db.prepare('DELETE FROM journal_entries WHERE id = ? AND company_id = ?').run(mj.id, companyId);
      }

      // 6. Log audit
      this.logAudit({
        companyId,
        userId: context?.userId,
        userName: context?.userName,
        userRole: context?.userRole,
        action: 'DELETE_AND_REVERSE',
        transactionType: 'DIRECT_SALE',
        transactionId: id,
        transactionNumber: invoice.invoice_number,
        transactionDate: invoice.invoice_date,
        reason: context?.reason || 'Direct sale invoice deleted & reversed',
        isDayClosed: isClosedDay,
        details: { grand_total: invoice.grand_total, customer_id: invoice.customer_id },
      });

      db.exec('COMMIT;');
      return { success: true, message: `Direct Sale ${invoice.invoice_number} successfully deleted and reversed.` };
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
  }

  // =========================================================================
  // 3. SALES RETURNS (sales_returns)
  // =========================================================================
  public static deleteSalesReturn(id: string, context?: DeleteTransactionContext) {
    const db = getDatabase();
    const companyId = context?.companyId || DEFAULT_COMPANY_ID;
    const returnRow = db.prepare('SELECT * FROM sales_returns WHERE id = ? AND company_id = ?').get(id, companyId) as any;
    if (!returnRow) {
      throw new Error(`Sales return credit note ${id} not found.`);
    }

    const { isClosedDay } = this.checkDayCloseAuthorization(returnRow.return_date, context);

    db.exec('BEGIN IMMEDIATE TRANSACTION;');
    try {
      // 1. Reverse stock that was returned into inventory & record audit reversal
      if (returnRow.status === 'POSTED') {
        const reversals = InventoryAuditService.recordReversal(db, {
          companyId,
          originalTransactionId: id,
          userId: context?.userId,
          userName: context?.userName,
          userRole: context?.userRole,
          reason: context?.reason || 'Sales return deleted & reversed',
          adminOverrideDetails: isClosedDay ? `Closed Day Override by ${context?.userName || 'Admin'}` : undefined,
        });

        if (reversals.length === 0) {
          const items = db.prepare('SELECT * FROM sales_return_items WHERE return_id = ? AND company_id = ?').all(id, companyId) as any[];
          for (const it of items) {
            const qty = it.total_base_qty || 0;
            if (qty > 0) {
              if (it.condition === 'FRESH') {
                db.prepare(`
                  UPDATE products
                  SET current_stock_base = MAX(0, current_stock_base - ?),
                      current_stock = MAX(0, current_stock - ?),
                      updated_at = datetime('now')
                  WHERE id = ? AND company_id = ?
                `).run(qty, qty, it.product_id, companyId);
              } else {
                db.prepare(`
                  UPDATE products
                  SET damaged_stock_base = MAX(0, damaged_stock_base - ?),
                      updated_at = datetime('now')
                  WHERE id = ? AND company_id = ?
                `).run(qty, it.product_id, companyId);
              }
            }
          }
        }
      }

      // 2. Delete items
      db.prepare('DELETE FROM sales_return_items WHERE return_id = ? AND company_id = ?').run(id, companyId);

      // 3. Delete header (must be before journal entry deletion due to FK RESTRICT)
      db.prepare('DELETE FROM sales_returns WHERE id = ? AND company_id = ?').run(id, companyId);

      // 4. Delete linked journal entry and lines
      if (returnRow.journal_entry_id) {
        db.prepare('DELETE FROM journal_lines WHERE journal_id = ? AND company_id = ?').run(returnRow.journal_entry_id, companyId);
        db.prepare('DELETE FROM journal_entries WHERE id = ? AND company_id = ?').run(returnRow.journal_entry_id, companyId);
      }
      const otherJournals = db
        .prepare("SELECT id FROM journal_entries WHERE source_module = 'returns' AND source_document_id = ? AND company_id = ?")
        .all(id, companyId) as any[];
      for (const oj of otherJournals) {
        db.prepare('DELETE FROM journal_lines WHERE journal_id = ? AND company_id = ?').run(oj.id, companyId);
        db.prepare('DELETE FROM journal_entries WHERE id = ? AND company_id = ?').run(oj.id, companyId);
      }

      // 5. Log audit
      this.logAudit({
        companyId,
        userId: context?.userId,
        userName: context?.userName,
        userRole: context?.userRole,
        action: 'DELETE_AND_REVERSE',
        transactionType: 'SALES_RETURN',
        transactionId: id,
        transactionNumber: returnRow.return_number,
        transactionDate: returnRow.return_date,
        reason: context?.reason || 'Sales return credit note deleted & reversed',
        isDayClosed: isClosedDay,
        details: { total_refund: returnRow.total_refund, customer_id: returnRow.customer_id },
      });

      db.exec('COMMIT;');
      return { success: true, message: `Sales Return ${returnRow.return_number} successfully deleted and reversed.` };
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
  }

  // =========================================================================
  // 4. CUSTOMER PAYMENTS / PAYMENT RECEIVED (customer_payments)
  // =========================================================================
  public static deleteCustomerPayment(id: string, context?: DeleteTransactionContext) {
    const db = getDatabase();
    const companyId = context?.companyId || DEFAULT_COMPANY_ID;
    const payment = db.prepare('SELECT * FROM customer_payments WHERE id = ? AND company_id = ?').get(id, companyId) as any;
    if (!payment) {
      throw new Error(`Payment receipt ${id} not found.`);
    }

    const { isClosedDay } = this.checkDayCloseAuthorization(payment.payment_date, context);

    db.exec('BEGIN IMMEDIATE TRANSACTION;');
    try {
      // 1. Rollback invoice allocations if the payment is POSTED
      if (payment.status === 'POSTED') {
        const allocations = db
          .prepare('SELECT * FROM customer_payment_allocations WHERE payment_id = ? AND company_id = ?')
          .all(id, companyId) as any[];

        const revertOrder = db.prepare(`
          UPDATE sales_orders
          SET remaining_balance_paisas = MIN(grand_total_paisas, remaining_balance_paisas + ?),
              remaining_balance = MIN(grand_total, remaining_balance + ?),
              payment_status = CASE 
                WHEN remaining_balance_paisas + ? >= grand_total_paisas THEN 'UNPAID'
                ELSE 'PARTIAL'
              END,
              updated_at = datetime('now')
          WHERE id = ? AND company_id = ?
        `);

        const revertInvoice = db.prepare(`
          UPDATE sales_invoices
          SET remaining_balance_paisas = MIN(grand_total_paisas, remaining_balance_paisas + ?),
              remaining_balance = MIN(grand_total, remaining_balance + ?),
              payment_status = CASE 
                WHEN remaining_balance_paisas + ? >= grand_total_paisas THEN 'UNPAID'
                ELSE 'PARTIAL'
              END,
              updated_at = datetime('now')
          WHERE id = ? AND company_id = ?
        `);

        for (const alloc of allocations) {
          if (alloc.invoice_type === 'ORDER') {
            revertOrder.run(
              alloc.allocated_amount_paisas,
              alloc.allocated_amount,
              alloc.allocated_amount_paisas,
              alloc.invoice_id,
              companyId
            );
          } else {
            revertInvoice.run(
              alloc.allocated_amount_paisas,
              alloc.allocated_amount,
              alloc.allocated_amount_paisas,
              alloc.invoice_id,
              companyId
            );
          }
        }
      }

      // 2. Delete allocations
      db.prepare('DELETE FROM customer_payment_allocations WHERE payment_id = ? AND company_id = ?').run(id, companyId);

      // 3. Delete header
      db.prepare('DELETE FROM customer_payments WHERE id = ? AND company_id = ?').run(id, companyId);

      // 4. Delete linked journal entry and lines
      if (payment.journal_id) {
        db.prepare('DELETE FROM journal_lines WHERE journal_id = ? AND company_id = ?').run(payment.journal_id, companyId);
        db.prepare('DELETE FROM journal_entries WHERE id = ? AND company_id = ?').run(payment.journal_id, companyId);
      }
      const otherJournals = db
        .prepare("SELECT id FROM journal_entries WHERE source_module = 'payments' AND source_document_id = ? AND company_id = ?")
        .all(id, companyId) as any[];
      for (const oj of otherJournals) {
        db.prepare('DELETE FROM journal_lines WHERE journal_id = ? AND company_id = ?').run(oj.id, companyId);
        db.prepare('DELETE FROM journal_entries WHERE id = ? AND company_id = ?').run(oj.id, companyId);
      }

      // 5. Log audit
      this.logAudit({
        companyId,
        userId: context?.userId,
        userName: context?.userName,
        userRole: context?.userRole,
        action: 'DELETE_AND_REVERSE',
        transactionType: 'CUSTOMER_PAYMENT',
        transactionId: id,
        transactionNumber: payment.payment_number,
        transactionDate: payment.payment_date,
        reason: context?.reason || 'Payment receipt deleted & reversed',
        isDayClosed: isClosedDay,
        details: { amount: payment.amount, customer_id: payment.customer_id },
      });

      db.exec('COMMIT;');
      return { success: true, message: `Payment receipt ${payment.payment_number} successfully deleted and reversed.` };
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
  }

  // =========================================================================
  // 5. PURCHASE BILLS / VENDOR INVOICES (purchase_bills)
  // =========================================================================
  public static deletePurchaseBill(id: string, context?: DeleteTransactionContext) {
    const db = getDatabase();
    const companyId = context?.companyId || DEFAULT_COMPANY_ID;
    const bill = db.prepare('SELECT * FROM purchase_bills WHERE id = ? AND company_id = ?').get(id, companyId) as any;
    if (!bill) {
      throw new Error(`Purchase bill ${id} not found.`);
    }

    const { isClosedDay } = this.checkDayCloseAuthorization(bill.bill_date, context);

    db.exec('BEGIN IMMEDIATE TRANSACTION;');
    try {
      // 1. Revert vendor payment allocations on this bill
      const allocations = db
        .prepare('SELECT * FROM vendor_payment_allocations WHERE bill_id = ? AND company_id = ?')
        .all(id, companyId) as any[];

      for (const alloc of allocations) {
        db.prepare(`
          UPDATE vendor_payments
          SET unallocated_amount_paisas = unallocated_amount_paisas + ?,
              unallocated_amount = unallocated_amount + ?,
              updated_at = datetime('now')
          WHERE id = ? AND company_id = ?
        `).run(alloc.allocated_amount_paisas, alloc.allocated_amount, alloc.payment_id, companyId);
      }
      db.prepare('DELETE FROM vendor_payment_allocations WHERE bill_id = ? AND company_id = ?').run(id, companyId);

      // 2. Deduct physical stock added by this bill (if posted) & record audit reversal
      if (bill.status === 'POSTED') {
        const reversals = InventoryAuditService.recordReversal(db, {
          companyId,
          originalTransactionId: id,
          userId: context?.userId,
          userName: context?.userName,
          userRole: context?.userRole,
          reason: context?.reason || 'Purchase bill deleted & reversed',
          adminOverrideDetails: isClosedDay ? `Closed Day Override by ${context?.userName || 'Admin'}` : undefined,
        });

        if (reversals.length === 0) {
          const items = db.prepare(`
            SELECT pbi.*, p.item_type
            FROM purchase_bill_items pbi
            JOIN products p ON pbi.product_id = p.id AND p.company_id = pbi.company_id
            WHERE pbi.bill_id = ? AND pbi.company_id = ?
          `).all(id, companyId) as any[];

          for (const it of items) {
            if (it.item_type !== 'SERVICE') {
              const qty = it.total_pieces || 0;
              if (qty > 0) {
                db.prepare(`
                  UPDATE products
                  SET current_stock_base = MAX(0, current_stock_base - ?),
                      current_stock = MAX(0, current_stock - ?),
                      updated_at = datetime('now')
                  WHERE id = ? AND company_id = ?
                `).run(qty, qty, it.product_id, companyId);
              }
            }
          }
        }
      }

      // 3. Delete bill items
      db.prepare('DELETE FROM purchase_bill_items WHERE bill_id = ? AND company_id = ?').run(id, companyId);

      // 4. Delete bill header
      db.prepare('DELETE FROM purchase_bills WHERE id = ? AND company_id = ?').run(id, companyId);

      // 5. Delete linked journal entry and lines
      if (bill.journal_id) {
        db.prepare('DELETE FROM journal_lines WHERE journal_id = ? AND company_id = ?').run(bill.journal_id, companyId);
        db.prepare('DELETE FROM journal_entries WHERE id = ? AND company_id = ?').run(bill.journal_id, companyId);
      }
      const otherJournals = db
        .prepare("SELECT id FROM journal_entries WHERE source_module = 'purchase' AND source_document_id = ? AND company_id = ?")
        .all(id, companyId) as any[];
      for (const oj of otherJournals) {
        db.prepare('DELETE FROM journal_lines WHERE journal_id = ? AND company_id = ?').run(oj.id, companyId);
        db.prepare('DELETE FROM journal_entries WHERE id = ? AND company_id = ?').run(oj.id, companyId);
      }

      // 6. Log audit
      this.logAudit({
        companyId,
        userId: context?.userId,
        userName: context?.userName,
        userRole: context?.userRole,
        action: 'DELETE_AND_REVERSE',
        transactionType: 'PURCHASE_BILL',
        transactionId: id,
        transactionNumber: bill.bill_number,
        transactionDate: bill.bill_date,
        reason: context?.reason || 'Purchase bill deleted & reversed',
        isDayClosed: isClosedDay,
        details: { net_amount: bill.net_amount, vendor_id: bill.vendor_id },
      });

      db.exec('COMMIT;');
      return { success: true, message: `Purchase Bill ${bill.bill_number} successfully deleted and reversed.` };
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
  }

  // =========================================================================
  // 6. PURCHASE RETURNS (purchase_returns)
  // =========================================================================
  public static deletePurchaseReturn(id: string, context?: DeleteTransactionContext) {
    const db = getDatabase();
    const companyId = context?.companyId || DEFAULT_COMPANY_ID;
    const returnRow = db.prepare('SELECT * FROM purchase_returns WHERE id = ? AND company_id = ?').get(id, companyId) as any;
    if (!returnRow) {
      throw new Error(`Purchase return debit note ${id} not found.`);
    }

    const { isClosedDay } = this.checkDayCloseAuthorization(returnRow.return_date, context);

    db.exec('BEGIN IMMEDIATE TRANSACTION;');
    try {
      // 1. Replenish physical stock that was relieved by this purchase return & record audit reversal
      if (returnRow.status === 'POSTED') {
        const reversals = InventoryAuditService.recordReversal(db, {
          companyId,
          originalTransactionId: id,
          userId: context?.userId,
          userName: context?.userName,
          userRole: context?.userRole,
          reason: context?.reason || 'Purchase return deleted & reversed',
          adminOverrideDetails: isClosedDay ? `Closed Day Override by ${context?.userName || 'Admin'}` : undefined,
        });

        if (reversals.length === 0) {
          const items = db.prepare(`
            SELECT pri.*, p.boxes_per_carton, p.pieces_per_box, p.total_pieces_per_carton, p.bulk_conversion_factor
            FROM purchase_return_items pri
            JOIN products p ON pri.product_id = p.id AND p.company_id = pri.company_id
            WHERE pri.return_id = ? AND pri.company_id = ?
          `).all(id, companyId) as any[];

          for (const it of items) {
            const boxesPerCarton = Math.max(1, it.boxes_per_carton || 1);
            const piecesPerBox = Math.max(1, it.pieces_per_box || 1);
            const totalPiecesPerCarton = Math.max(1, it.total_pieces_per_carton || it.bulk_conversion_factor || (boxesPerCarton * piecesPerBox));
            const ctn = Math.max(0, Number(it.cartons_qty) || 0);
            const box = Math.max(0, Number(it.boxes_qty) || 0);
            const pcs = Math.max(0, Number(it.pieces_qty) || 0);
            const totalBase = (ctn * totalPiecesPerCarton) + (box * piecesPerBox) + pcs;

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
      }

      // 2. Delete return items
      db.prepare('DELETE FROM purchase_return_items WHERE return_id = ? AND company_id = ?').run(id, companyId);

      // 3. Delete return header (must be before journal deletion due to FK RESTRICT)
      db.prepare('DELETE FROM purchase_returns WHERE id = ? AND company_id = ?').run(id, companyId);

      // 4. Delete linked journal entry and lines
      if (returnRow.journal_entry_id) {
        db.prepare('DELETE FROM journal_lines WHERE journal_id = ? AND company_id = ?').run(returnRow.journal_entry_id, companyId);
        db.prepare('DELETE FROM journal_entries WHERE id = ? AND company_id = ?').run(returnRow.journal_entry_id, companyId);
      }
      const otherJournals = db
        .prepare("SELECT id FROM journal_entries WHERE source_module = 'returns' AND source_document_id = ? AND company_id = ?")
        .all(id, companyId) as any[];
      for (const oj of otherJournals) {
        db.prepare('DELETE FROM journal_lines WHERE journal_id = ? AND company_id = ?').run(oj.id, companyId);
        db.prepare('DELETE FROM journal_entries WHERE id = ? AND company_id = ?').run(oj.id, companyId);
      }

      // 5. Log audit
      this.logAudit({
        companyId,
        userId: context?.userId,
        userName: context?.userName,
        userRole: context?.userRole,
        action: 'DELETE_AND_REVERSE',
        transactionType: 'PURCHASE_RETURN',
        transactionId: id,
        transactionNumber: returnRow.return_number,
        transactionDate: returnRow.return_date,
        reason: context?.reason || 'Purchase return debit note deleted & reversed',
        isDayClosed: isClosedDay,
        details: { total_amount: returnRow.total_amount, vendor_id: returnRow.vendor_id },
      });

      db.exec('COMMIT;');
      return { success: true, message: `Purchase Return ${returnRow.return_number} successfully deleted and reversed.` };
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
  }

  // =========================================================================
  // 7. VENDOR PAYMENTS / PAYMENT MADE (vendor_payments)
  // =========================================================================
  public static deleteVendorPayment(id: string, context?: DeleteTransactionContext) {
    const db = getDatabase();
    const companyId = context?.companyId || DEFAULT_COMPANY_ID;
    const payment = db.prepare('SELECT * FROM vendor_payments WHERE id = ? AND company_id = ?').get(id, companyId) as any;
    if (!payment) {
      throw new Error(`Vendor payment voucher ${id} not found.`);
    }

    const { isClosedDay } = this.checkDayCloseAuthorization(payment.payment_date, context);

    db.exec('BEGIN IMMEDIATE TRANSACTION;');
    try {
      // 1. Rollback bill allocations if the payment is POSTED
      if (payment.status === 'POSTED') {
        const allocations = db
          .prepare('SELECT * FROM vendor_payment_allocations WHERE payment_id = ? AND company_id = ?')
          .all(id, companyId) as any[];

        const revertBill = db.prepare(`
          UPDATE purchase_bills
          SET remaining_balance_paisas = MIN(net_amount_paisas, remaining_balance_paisas + ?),
              remaining_balance = MIN(net_amount, remaining_balance + ?),
              paid_amount_paisas = MAX(0, paid_amount_paisas - ?),
              paid_amount = MAX(0.0, paid_amount - ?),
              payment_status = CASE 
                WHEN remaining_balance_paisas + ? >= net_amount_paisas THEN 'UNPAID'
                ELSE 'PARTIAL'
              END,
              updated_at = datetime('now')
          WHERE id = ? AND company_id = ?
        `);

        for (const alloc of allocations) {
          revertBill.run(
            alloc.allocated_amount_paisas,
            alloc.allocated_amount,
            alloc.allocated_amount_paisas,
            alloc.allocated_amount,
            alloc.allocated_amount_paisas,
            alloc.bill_id,
            companyId
          );
        }
      }

      // 2. Delete allocations
      db.prepare('DELETE FROM vendor_payment_allocations WHERE payment_id = ? AND company_id = ?').run(id, companyId);

      // 3. Delete header
      db.prepare('DELETE FROM vendor_payments WHERE id = ? AND company_id = ?').run(id, companyId);

      // 4. Delete linked journal entry and lines
      if (payment.journal_id) {
        db.prepare('DELETE FROM journal_lines WHERE journal_id = ? AND company_id = ?').run(payment.journal_id, companyId);
        db.prepare('DELETE FROM journal_entries WHERE id = ? AND company_id = ?').run(payment.journal_id, companyId);
      }
      const otherJournals = db
        .prepare("SELECT id FROM journal_entries WHERE source_module = 'vendor_payment' AND source_document_id = ? AND company_id = ?")
        .all(id, companyId) as any[];
      for (const oj of otherJournals) {
        db.prepare('DELETE FROM journal_lines WHERE journal_id = ? AND company_id = ?').run(oj.id, companyId);
        db.prepare('DELETE FROM journal_entries WHERE id = ? AND company_id = ?').run(oj.id, companyId);
      }

      // 5. Log audit
      this.logAudit({
        companyId,
        userId: context?.userId,
        userName: context?.userName,
        userRole: context?.userRole,
        action: 'DELETE_AND_REVERSE',
        transactionType: 'VENDOR_PAYMENT',
        transactionId: id,
        transactionNumber: payment.payment_number,
        transactionDate: payment.payment_date,
        reason: context?.reason || 'Vendor payment voucher deleted & reversed',
        isDayClosed: isClosedDay,
        details: { amount: payment.amount, vendor_id: payment.vendor_id },
      });

      db.exec('COMMIT;');
      return { success: true, message: `Vendor payment voucher ${payment.payment_number} successfully deleted and reversed.` };
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
  }

  // =========================================================================
  // 8. EXPENSES (expenses)
  // =========================================================================
  public static deleteExpense(id: string, context?: DeleteTransactionContext) {
    const db = getDatabase();
    const companyId = context?.companyId || DEFAULT_COMPANY_ID;
    const expense = db.prepare('SELECT * FROM expenses WHERE id = ? AND company_id = ?').get(id, companyId) as any;
    if (!expense) {
      throw new Error(`Expense voucher ${id} not found.`);
    }

    const { isClosedDay } = this.checkDayCloseAuthorization(expense.expense_date, context);

    db.exec('BEGIN IMMEDIATE TRANSACTION;');
    try {
      // 1. Delete expense header
      db.prepare('DELETE FROM expenses WHERE id = ? AND company_id = ?').run(id, companyId);

      // 2. Delete linked journal entries and lines
      if (expense.journal_entry_id) {
        db.prepare('DELETE FROM journal_lines WHERE journal_id = ? AND company_id = ?').run(expense.journal_entry_id, companyId);
        db.prepare('DELETE FROM journal_entries WHERE id = ? AND company_id = ?').run(expense.journal_entry_id, companyId);
      }
      const otherJournals = db
        .prepare("SELECT id FROM journal_entries WHERE source_module = 'expenses' AND source_document_id = ? AND company_id = ?")
        .all(id, companyId) as any[];
      for (const oj of otherJournals) {
        db.prepare('DELETE FROM journal_lines WHERE journal_id = ? AND company_id = ?').run(oj.id, companyId);
        db.prepare('DELETE FROM journal_entries WHERE id = ? AND company_id = ?').run(oj.id, companyId);
      }

      // 3. Log audit
      this.logAudit({
        companyId,
        userId: context?.userId,
        userName: context?.userName,
        userRole: context?.userRole,
        action: 'DELETE_AND_REVERSE',
        transactionType: 'EXPENSE',
        transactionId: id,
        transactionNumber: expense.voucher_number,
        transactionDate: expense.expense_date,
        reason: context?.reason || 'Expense voucher deleted & reversed',
        isDayClosed: isClosedDay,
        details: { amount: expense.amount, description: expense.description },
      });

      db.exec('COMMIT;');
      return { success: true, message: `Expense voucher ${expense.voucher_number} successfully deleted and reversed.` };
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
  }

  // =========================================================================
  // 9. JOURNAL ENTRIES / VOUCHERS (journal_entries)
  // =========================================================================
  public static deleteJournalEntry(id: string, context?: DeleteTransactionContext) {
    const db = getDatabase();
    const companyId = context?.companyId || DEFAULT_COMPANY_ID;
    const entry = db.prepare('SELECT * FROM journal_entries WHERE id = ? AND company_id = ?').get(id, companyId) as any;
    if (!entry) {
      throw new Error(`Journal entry ${id} not found.`);
    }

    const { isClosedDay } = this.checkDayCloseAuthorization(entry.entry_date, context);

    db.exec('BEGIN IMMEDIATE TRANSACTION;');
    try {
      // Delete lines first due to FK RESTRICT
      db.prepare('DELETE FROM journal_lines WHERE journal_id = ? AND company_id = ?').run(id, companyId);
      db.prepare('DELETE FROM journal_entries WHERE id = ? AND company_id = ?').run(id, companyId);

      // Log audit
      this.logAudit({
        companyId,
        userId: context?.userId,
        userName: context?.userName,
        userRole: context?.userRole,
        action: 'DELETE_AND_REVERSE',
        transactionType: 'JOURNAL_ENTRY',
        transactionId: id,
        transactionNumber: entry.entry_number,
        transactionDate: entry.entry_date,
        reason: context?.reason || 'Journal voucher deleted & reversed',
        isDayClosed: isClosedDay,
        details: { total_amount: entry.total_amount, source_module: entry.source_module },
      });

      db.exec('COMMIT;');
      return { success: true, message: `Journal Entry ${entry.entry_number} successfully deleted and reversed.` };
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
  }

  // =========================================================================
  // 10. STOCK ADJUSTMENTS (stock_adjustments)
  // =========================================================================
  public static deleteStockAdjustment(id: string, context?: DeleteTransactionContext) {
    const db = getDatabase();
    const companyId = context?.companyId || DEFAULT_COMPANY_ID;
    const adj = db.prepare('SELECT * FROM stock_adjustments WHERE id = ? AND company_id = ?').get(id, companyId) as any;
    if (!adj) {
      throw new Error(`Stock adjustment entry ${id} not found.`);
    }

    const { isClosedDay } = this.checkDayCloseAuthorization(adj.adjustment_date, context);

    db.exec('BEGIN IMMEDIATE TRANSACTION;');
    try {
      // Reverse stock on product and audit movements
      const reversals = InventoryAuditService.recordReversal(db, {
        companyId,
        originalTransactionId: id,
        userId: context?.userId,
        userName: context?.userName,
        userRole: context?.userRole,
        reason: context?.reason || 'Stock adjustment deleted & reversed',
        adminOverrideDetails: isClosedDay ? `Closed Day Override by ${context?.userName || 'Admin'}` : undefined,
      });

      if (reversals.length === 0) {
        const qty = adj.quantity_base || 0;
        if (qty > 0) {
          if (adj.adjustment_type === 'INCREASE') {
            db.prepare(`
              UPDATE products
              SET current_stock_base = MAX(0, current_stock_base - ?),
                  current_stock = MAX(0, current_stock - ?),
                  updated_at = datetime('now')
              WHERE id = ? AND company_id = ?
            `).run(qty, qty, adj.product_id, companyId);
          } else {
            db.prepare(`
              UPDATE products
              SET current_stock_base = current_stock_base + ?,
                  current_stock = current_stock + ?,
                  updated_at = datetime('now')
              WHERE id = ? AND company_id = ?
            `).run(qty, qty, adj.product_id, companyId);
          }
        }
      }

      // Delete header
      db.prepare('DELETE FROM stock_adjustments WHERE id = ? AND company_id = ?').run(id, companyId);

      // Delete journal if any
      if (adj.journal_id) {
        db.prepare('DELETE FROM journal_lines WHERE journal_id = ? AND company_id = ?').run(adj.journal_id, companyId);
        db.prepare('DELETE FROM journal_entries WHERE id = ? AND company_id = ?').run(adj.journal_id, companyId);
      }

      // Log audit
      this.logAudit({
        companyId,
        userId: context?.userId,
        userName: context?.userName,
        userRole: context?.userRole,
        action: 'DELETE_AND_REVERSE',
        transactionType: 'STOCK_ADJUSTMENT',
        transactionId: id,
        transactionNumber: adj.adjustment_number,
        transactionDate: adj.adjustment_date,
        reason: context?.reason || 'Stock adjustment deleted & reversed',
        isDayClosed: isClosedDay,
        details: { product_id: adj.product_id, qty: adj.quantity_base || 0, type: adj.adjustment_type },
      });

      db.exec('COMMIT;');
      return { success: true, message: `Stock Adjustment ${adj.adjustment_number} successfully deleted and reversed.` };
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
  }

  // =========================================================================
  // CUSTOMER SAFE DELETION
  // =========================================================================
  public static checkCustomerDependencies(customerId: string, companyId: string = DEFAULT_COMPANY_ID): {
    canDelete: boolean;
    message?: string;
    counts: {
      salesOrders: number;
      directSales: number;
      salesReturns: number;
      payments: number;
      journalEntries: number;
    };
  } {
    const db = getDatabase();
    const cleanCompanyId = companyId || DEFAULT_COMPANY_ID;

    const soCount = (
      db.prepare('SELECT COUNT(*) as c FROM sales_orders WHERE customer_id = ? AND company_id = ?').get(customerId, cleanCompanyId) as any
    )?.c || 0;

    const dsCount = (
      db.prepare('SELECT COUNT(*) as c FROM sales_invoices WHERE customer_id = ? AND company_id = ?').get(customerId, cleanCompanyId) as any
    )?.c || 0;

    const srCount = (
      db.prepare('SELECT COUNT(*) as c FROM sales_returns WHERE customer_id = ? AND company_id = ?').get(customerId, cleanCompanyId) as any
    )?.c || 0;

    const payCount = (
      db.prepare('SELECT COUNT(*) as c FROM customer_payments WHERE customer_id = ? AND company_id = ?').get(customerId, cleanCompanyId) as any
    )?.c || 0;

    // Distinct journal entries linked to customer not already accounted for by operational modules within this company
    const jeCount = (
      db.prepare(`
        SELECT COUNT(DISTINCT jl.journal_id) as c
        FROM journal_lines jl
        JOIN journal_entries je ON jl.journal_id = je.id AND je.company_id = jl.company_id
        WHERE jl.entity_type = 'CUSTOMER' AND jl.entity_id = ? AND jl.company_id = ?
          AND (je.source_module NOT IN ('sales', 'returns', 'payments') OR je.source_document_id IS NULL)
      `).get(customerId, cleanCompanyId) as any
    )?.c || 0;

    const counts = {
      salesOrders: soCount,
      directSales: dsCount,
      salesReturns: srCount,
      payments: payCount,
      journalEntries: jeCount,
    };

    const parts: string[] = [];
    if (soCount > 0) parts.push(`${soCount} Sales Order${soCount > 1 ? 's' : ''}`);
    if (dsCount > 0) parts.push(`${dsCount} Direct Sale${dsCount > 1 ? 's' : ''}`);
    if (payCount > 0) parts.push(`${payCount} Payment${payCount > 1 ? 's' : ''}`);
    if (srCount > 0) parts.push(`${srCount} Sales Return${srCount > 1 ? 's' : ''}`);
    if (jeCount > 0) parts.push(`${jeCount} Journal Entr${jeCount > 1 ? 'ies' : 'y'}`);

    if (parts.length > 0) {
      const breakdown = formatDependencyList(parts);
      return {
        canDelete: false,
        message: `Cannot delete this customer. ${breakdown} are linked to this customer. Delete/reverse those transactions first.`,
        counts,
      };
    }

    return { canDelete: true, counts };
  }

  public static deleteCustomer(customerId: string, companyId: string = DEFAULT_COMPANY_ID): { success: boolean; message: string } {
    const db = getDatabase();
    const cleanCompanyId = companyId || DEFAULT_COMPANY_ID;
    const customer = db.prepare('SELECT * FROM customers WHERE id = ? AND company_id = ?').get(customerId, cleanCompanyId) as any;
    if (!customer) {
      throw new Error(`Customer ${customerId} not found.`);
    }

    const depCheck = this.checkCustomerDependencies(customerId, cleanCompanyId);
    if (!depCheck.canDelete) {
      throw new Error(depCheck.message);
    }

    db.prepare('DELETE FROM customers WHERE id = ? AND company_id = ?').run(customerId, cleanCompanyId);
    return { success: true, message: `Customer "${customer.name}" deleted successfully.` };
  }

  // =========================================================================
  // VENDOR SAFE DELETION
  // =========================================================================
  public static checkVendorDependencies(vendorId: string, companyId: string = DEFAULT_COMPANY_ID): {
    canDelete: boolean;
    message?: string;
    counts: {
      purchaseBills: number;
      purchaseReturns: number;
      payments: number;
      journalEntries: number;
    };
  } {
    const db = getDatabase();
    const cleanCompanyId = companyId || DEFAULT_COMPANY_ID;

    const pbCount = (
      db.prepare('SELECT COUNT(*) as c FROM purchase_bills WHERE vendor_id = ? AND company_id = ?').get(vendorId, cleanCompanyId) as any
    )?.c || 0;

    const prCount = (
      db.prepare('SELECT COUNT(*) as c FROM purchase_returns WHERE vendor_id = ? AND company_id = ?').get(vendorId, cleanCompanyId) as any
    )?.c || 0;

    const payCount = (
      db.prepare('SELECT COUNT(*) as c FROM vendor_payments WHERE vendor_id = ? AND company_id = ?').get(vendorId, cleanCompanyId) as any
    )?.c || 0;

    // Distinct journal entries linked to vendor not accounted for by operational modules
    const jeCount = (
      db.prepare(`
        SELECT COUNT(DISTINCT jl.journal_id) as c
        FROM journal_lines jl
        JOIN journal_entries je ON jl.journal_id = je.id AND je.company_id = jl.company_id
        WHERE jl.entity_type = 'VENDOR' AND jl.entity_id = ? AND jl.company_id = ?
          AND (je.source_module NOT IN ('purchase', 'returns', 'vendor_payment') OR je.source_document_id IS NULL)
      `).get(vendorId, cleanCompanyId) as any
    )?.c || 0;

    const counts = {
      purchaseBills: pbCount,
      purchaseReturns: prCount,
      payments: payCount,
      journalEntries: jeCount,
    };

    const parts: string[] = [];
    if (pbCount > 0) parts.push(`${pbCount} Purchase Bill${pbCount > 1 ? 's' : ''}`);
    if (payCount > 0) parts.push(`${payCount} Payment${payCount > 1 ? 's' : ''}`);
    if (prCount > 0) parts.push(`${prCount} Purchase Return${prCount > 1 ? 's' : ''}`);
    if (jeCount > 0) parts.push(`${jeCount} Journal Entr${jeCount > 1 ? 'ies' : 'y'}`);

    if (parts.length > 0) {
      const breakdown = formatDependencyList(parts);
      return {
        canDelete: false,
        message: `Cannot delete this vendor. ${breakdown} are linked to this vendor. Delete/reverse those transactions first.`,
        counts,
      };
    }

    return { canDelete: true, counts };
  }

  public static deleteVendor(vendorId: string, companyId: string = DEFAULT_COMPANY_ID): { success: boolean; message: string } {
    const db = getDatabase();
    const cleanCompanyId = companyId || DEFAULT_COMPANY_ID;
    const vendor = db.prepare('SELECT * FROM vendors WHERE id = ? AND company_id = ?').get(vendorId, cleanCompanyId) as any;
    if (!vendor) {
      throw new Error(`Vendor ${vendorId} not found.`);
    }

    const depCheck = this.checkVendorDependencies(vendorId, cleanCompanyId);
    if (!depCheck.canDelete) {
      throw new Error(depCheck.message);
    }

    db.prepare('DELETE FROM vendors WHERE id = ? AND company_id = ?').run(vendorId, cleanCompanyId);
    return { success: true, message: `Vendor "${vendor.name}" deleted successfully.` };
  }

  public static async checkVendorDependenciesAsync(vendorId: string, companyId: string = DEFAULT_COMPANY_ID): Promise<{
    canDelete: boolean;
    message?: string;
    counts: {
      purchaseBills: number;
      purchaseReturns: number;
      payments: number;
      journalEntries: number;
    };
  }> {
    const client = getDatabaseClient();
    const cleanCompanyId = companyId || DEFAULT_COMPANY_ID;

    const pbRow = await client.queryOne<{ c: number }>('SELECT COUNT(*) as c FROM purchase_bills WHERE vendor_id = ? AND company_id = ?', [vendorId, cleanCompanyId]);
    const pbCount = Number(pbRow?.c || 0);

    const prRow = await client.queryOne<{ c: number }>('SELECT COUNT(*) as c FROM purchase_returns WHERE vendor_id = ? AND company_id = ?', [vendorId, cleanCompanyId]);
    const prCount = Number(prRow?.c || 0);

    const payRow = await client.queryOne<{ c: number }>('SELECT COUNT(*) as c FROM vendor_payments WHERE vendor_id = ? AND company_id = ?', [vendorId, cleanCompanyId]);
    const payCount = Number(payRow?.c || 0);

    const jeRow = await client.queryOne<{ c: number }>(`
      SELECT COUNT(DISTINCT jl.journal_id) as c
      FROM journal_lines jl
      JOIN journal_entries je ON jl.journal_id = je.id AND je.company_id = jl.company_id
      WHERE jl.entity_type = 'VENDOR' AND jl.entity_id = ? AND jl.company_id = ?
        AND (je.source_module NOT IN ('purchase', 'returns', 'vendor_payment') OR je.source_document_id IS NULL)
    `, [vendorId, cleanCompanyId]);
    const jeCount = Number(jeRow?.c || 0);

    const counts = {
      purchaseBills: pbCount,
      purchaseReturns: prCount,
      payments: payCount,
      journalEntries: jeCount,
    };

    const parts: string[] = [];
    if (pbCount > 0) parts.push(`${pbCount} Purchase Bill${pbCount > 1 ? 's' : ''}`);
    if (payCount > 0) parts.push(`${payCount} Payment${payCount > 1 ? 's' : ''}`);
    if (prCount > 0) parts.push(`${prCount} Purchase Return${prCount > 1 ? 's' : ''}`);
    if (jeCount > 0) parts.push(`${jeCount} Journal Entr${jeCount > 1 ? 'ies' : 'y'}`);

    if (parts.length > 0) {
      const breakdown = formatDependencyList(parts);
      return {
        canDelete: false,
        message: `Cannot delete this vendor. ${breakdown} are linked to this vendor. Delete/reverse those transactions first.`,
        counts,
      };
    }

    return { canDelete: true, counts };
  }

  public static async deleteVendorAsync(vendorId: string, companyId: string = DEFAULT_COMPANY_ID): Promise<{ success: boolean; message: string }> {
    const client = getDatabaseClient();
    const cleanCompanyId = companyId || DEFAULT_COMPANY_ID;
    const vendor = await client.queryOne<{ name: string }>('SELECT * FROM vendors WHERE id = ? AND company_id = ?', [vendorId, cleanCompanyId]);
    if (!vendor) {
      throw new Error(`Vendor ${vendorId} not found.`);
    }

    const depCheck = await this.checkVendorDependenciesAsync(vendorId, cleanCompanyId);
    if (!depCheck.canDelete) {
      throw new Error(depCheck.message);
    }

    await client.execute('DELETE FROM vendors WHERE id = ? AND company_id = ?', [vendorId, cleanCompanyId]);
    return { success: true, message: `Vendor "${vendor.name}" deleted successfully.` };
  }
}
