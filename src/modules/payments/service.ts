import { getDatabase } from '@/core/database/db';
import { DEFAULT_COMPANY_ID } from '@/core/tenancy/constants';
import { generateUUID } from '@/shared/utils/uuid';
import { toPaisas, fromPaisas } from '@/shared/utils/currency';
import { DoubleEntryEngine } from '@/core/accounting/engine';

// ==========================================================
// TYPES & INTERFACES
// ==========================================================

export interface InvoiceAllocationInput {
  invoiceId: string;
  invoiceType: 'ORDER' | 'INVOICE';
  allocatedAmount: number; // in PKR
}

export interface RecordCustomerPaymentInput {
  companyId?: string;
  paymentDate?: string;
  customerId: string;
  accountId: string;
  paymentMethod: 'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'ONLINE';
  amount: number; // in PKR
  referenceNote?: string;
  referenceNo?: string;
  notes?: string;
  createdBy?: string;
  allocations?: InvoiceAllocationInput[];
}

export interface BillAllocationInput {
  billId: string;
  allocatedAmount: number; // in PKR
}

export interface RecordVendorPaymentInput {
  companyId?: string;
  paymentDate?: string;
  vendorId: string;
  accountId: string;
  paymentMethod: 'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'ONLINE';
  amount: number; // in PKR
  referenceNote?: string;
  referenceNo?: string;
  notes?: string;
  createdBy?: string;
  allocations?: BillAllocationInput[];
}

// ==========================================================
// 1. PAYMENTS RECEIVED SERVICE (Customer Collections)
// ==========================================================

export class PaymentsReceivedService {
  /**
   * Get customer outstanding sales invoices and orders eligible for allocation
   */
  public static getCustomerOutstandingInvoices(customerId: string, companyId: string = DEFAULT_COMPANY_ID) {
    const db = getDatabase();

    // 1. Fetch from sales_orders
    const orders = db.prepare(`
      SELECT 
        id,
        order_number as invoice_number,
        order_date as invoice_date,
        'ORDER' as invoice_type,
        grand_total as total_amount,
        grand_total_paisas,
        (grand_total - remaining_balance) as already_paid,
        remaining_balance as outstanding_balance,
        remaining_balance_paisas,
        payment_status
      FROM sales_orders
      WHERE customer_id = ? 
        AND company_id = ?
        AND status = 'POSTED'
        AND remaining_balance > 0.001
      ORDER BY order_date ASC, created_at ASC
    `).all(customerId, companyId) as any[];

    // 2. Fetch from direct sales_invoices
    const invoices = db.prepare(`
      SELECT 
        id,
        invoice_number,
        invoice_date,
        'INVOICE' as invoice_type,
        grand_total as total_amount,
        grand_total_paisas,
        (grand_total - remaining_balance) as already_paid,
        remaining_balance as outstanding_balance,
        remaining_balance_paisas,
        payment_status
      FROM sales_invoices
      WHERE customer_id = ? 
        AND company_id = ?
        AND remaining_balance > 0.001
      ORDER BY invoice_date ASC, created_at ASC
    `).all(customerId, companyId) as any[];

    // Combine and sort by date ascending (FIFO allocation preference)
    const combined = [...orders, ...invoices].sort((a, b) => 
      new Date(a.invoice_date).getTime() - new Date(b.invoice_date).getTime()
    );

    return combined;
  }

  /**
   * Record Customer Payment with invoice allocation & strict double-entry GL posting
   */
  public static recordPayment(input: RecordCustomerPaymentInput, companyId?: string) {
    const db = getDatabase();
    const targetCompanyId = input.companyId || companyId || DEFAULT_COMPANY_ID;
    const id = generateUUID();
    const paymentDate = input.paymentDate || new Date().toISOString().split('T')[0];

    const amountPaisas = toPaisas(input.amount);
    if (amountPaisas <= 0) {
      throw new Error('Payment amount must be greater than zero.');
    }

    // 1. Validate Customer
    const customer = db.prepare('SELECT id, name, shop_name FROM customers WHERE id = ? AND company_id = ?').get(input.customerId, targetCompanyId) as any;
    if (!customer) {
      throw new Error(`Customer ${input.customerId} not found.`);
    }

    // 2. Validate Receiving Cash/Bank Account
    const account = db.prepare('SELECT id, code, name, type, is_active FROM chart_of_accounts WHERE id = ? AND company_id = ?').get(input.accountId, targetCompanyId) as any;
    if (!account) {
      throw new Error('Selected receiving Cash/Bank account does not exist.');
    }
    if (account.is_active !== 1) {
      throw new Error(`Account ${account.code} (${account.name}) is inactive.`);
    }

    // 3. Find Customer Accounts Receivable Account (1030)
    const arAccount = db.prepare("SELECT id, code, name FROM chart_of_accounts WHERE code = '1030' AND company_id = ?").get(targetCompanyId) as any;
    if (!arAccount) {
      throw new Error('Accounts Receivable (1030) control account missing in Chart of Accounts.');
    }

    // 4. Validate Allocations & Check for Over-Allocation
    const allocations = input.allocations || [];
    let totalAllocatedPaisas = 0;

    const validatedAllocations: {
      invoiceId: string;
      invoiceType: 'ORDER' | 'INVOICE';
      allocatedAmountPaisas: number;
      allocatedAmount: number;
      currentOutstandingPaisas: number;
    }[] = [];

    for (const alloc of allocations) {
      const allocPaisas = toPaisas(alloc.allocatedAmount);
      if (allocPaisas <= 0) continue;

      let invoice: any = null;
      if (alloc.invoiceType === 'ORDER') {
        invoice = db.prepare('SELECT id, order_number, remaining_balance_paisas, remaining_balance FROM sales_orders WHERE id = ? AND customer_id = ? AND company_id = ?').get(alloc.invoiceId, input.customerId, targetCompanyId);
      } else {
        invoice = db.prepare('SELECT id, invoice_number, remaining_balance_paisas, remaining_balance FROM sales_invoices WHERE id = ? AND customer_id = ? AND company_id = ?').get(alloc.invoiceId, input.customerId, targetCompanyId);
      }

      if (!invoice) {
        throw new Error(`Invoice/Order ${alloc.invoiceId} not found for customer ${customer.name}.`);
      }

      const outstandingPaisas = invoice.remaining_balance_paisas || toPaisas(invoice.remaining_balance || 0);

      // Prevent over-allocation beyond invoice outstanding balance
      if (allocPaisas > outstandingPaisas) {
        const invNum = invoice.order_number || invoice.invoice_number;
        throw new Error(
          `Over-allocation error! Cannot allocate ${fromPaisas(allocPaisas)} to Invoice ${invNum}. Outstanding balance is only ${fromPaisas(outstandingPaisas)}.`
        );
      }

      totalAllocatedPaisas += allocPaisas;
      validatedAllocations.push({
        invoiceId: alloc.invoiceId,
        invoiceType: alloc.invoiceType,
        allocatedAmountPaisas: allocPaisas,
        allocatedAmount: fromPaisas(allocPaisas),
        currentOutstandingPaisas: outstandingPaisas,
      });
    }

    // Prevent total allocated from exceeding total payment amount
    if (totalAllocatedPaisas > amountPaisas) {
      throw new Error(
        `Total allocated amount (${fromPaisas(totalAllocatedPaisas)}) cannot exceed total payment amount (${fromPaisas(amountPaisas)}).`
      );
    }

    const unallocatedPaisas = amountPaisas - totalAllocatedPaisas;
    const unallocatedAmount = fromPaisas(unallocatedPaisas);

    // 5. Generate Receipt Number: PR-YYYYMM-XXXX
    const countRow = db.prepare('SELECT COUNT(*) as count FROM customer_payments WHERE company_id = ?').get(targetCompanyId) as { count: number };
    const seq = (countRow?.count || 0) + 1;
    const yearMonth = paymentDate.replace(/-/g, '').slice(0, 6);
    const paymentNumber = `PR-${yearMonth}-${String(seq).padStart(4, '0')}`;

    // 6. Post General Ledger Entry
    // Dr. Selected Cash/Bank Account
    // Cr. Customer Accounts Receivable (1030) with Entity Attribution
    const memo = unallocatedPaisas > 0 && validatedAllocations.length > 0
      ? `Payment received from ${customer.name} (Allocated: ${fromPaisas(totalAllocatedPaisas)}, On Account: ${unallocatedAmount})`
      : validatedAllocations.length > 0
      ? `Payment received against ${validatedAllocations.length} invoice(s) from ${customer.name}`
      : `Payment received On Account from ${customer.name}`;

    const je = DoubleEntryEngine.postEntry({
      companyId: targetCompanyId,
      entryDate: paymentDate,
      description: `Customer Receipt ${paymentNumber} - ${customer.name} (${input.paymentMethod})`,
      sourceModule: 'payments',
      sourceDocumentId: id,
      lines: [
        {
          accountId: account.id,
          debit: input.amount,
          credit: 0,
          memo: `${input.paymentMethod}: Receipt ${paymentNumber} deposited to ${account.name}`,
        },
        {
          accountId: arAccount.id,
          debit: 0,
          credit: input.amount,
          entityId: input.customerId,
          entityType: 'CUSTOMER',
          memo: memo,
        },
      ],
      createdBy: 'Payment Received Module',
    });

    // Resolve bank_account_id if account is linked to a bank account
    const bankRow = db.prepare('SELECT id FROM bank_accounts WHERE account_id = ? AND company_id = ? LIMIT 1').get(account.id, targetCompanyId) as { id: string } | undefined;
    const bankAccountId = bankRow?.id || null;

    // 7. Persist Payment Record
    db.prepare(`
      INSERT INTO customer_payments (
        id, company_id, payment_number, payment_date, customer_id, account_id, bank_account_id,
        payment_method, amount_paisas, amount,
        unallocated_amount_paisas, unallocated_amount,
        reference_note, notes, status, journal_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'POSTED', ?, datetime('now'), datetime('now'))
    `).run(
      id,
      targetCompanyId,
      paymentNumber,
      paymentDate,
      input.customerId,
      account.id,
      bankAccountId,
      input.paymentMethod,
      amountPaisas,
      input.amount,
      unallocatedPaisas,
      unallocatedAmount,
      input.referenceNo || input.referenceNote || null,
      input.notes || null,
      je.id
    );

    // 8. Persist Allocations & Update Invoices
    const insertAlloc = db.prepare(`
      INSERT INTO customer_payment_allocations (
        id, company_id, payment_id, invoice_id, invoice_type, allocated_amount_paisas, allocated_amount, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    const updateOrder = db.prepare(`
      UPDATE sales_orders
      SET remaining_balance_paisas = remaining_balance_paisas - ?,
          remaining_balance = remaining_balance - ?,
          payment_status = CASE 
            WHEN (remaining_balance_paisas - ?) <= 0 THEN 'PAID'
            ELSE 'PARTIAL'
          END,
          updated_at = datetime('now')
      WHERE id = ? AND company_id = ?
    `);

    const updateInvoice = db.prepare(`
      UPDATE sales_invoices
      SET remaining_balance_paisas = remaining_balance_paisas - ?,
          remaining_balance = remaining_balance - ?,
          payment_status = CASE 
            WHEN (remaining_balance_paisas - ?) <= 0 THEN 'PAID'
            ELSE 'PARTIAL'
          END
      WHERE id = ? AND company_id = ?
    `);

    for (const alloc of validatedAllocations) {
      const allocId = generateUUID();
      insertAlloc.run(
        allocId,
        targetCompanyId,
        id,
        alloc.invoiceId,
        alloc.invoiceType,
        alloc.allocatedAmountPaisas,
        alloc.allocatedAmount
      );

      if (alloc.invoiceType === 'ORDER') {
        updateOrder.run(
          alloc.allocatedAmountPaisas,
          alloc.allocatedAmount,
          alloc.allocatedAmountPaisas,
          alloc.invoiceId,
          targetCompanyId
        );
      } else {
        updateInvoice.run(
          alloc.allocatedAmountPaisas,
          alloc.allocatedAmount,
          alloc.allocatedAmountPaisas,
          alloc.invoiceId,
          targetCompanyId
        );
      }
    }

    return this.getPaymentById(id, targetCompanyId);
  }

  /**
   * Universal DAL Async Payments Received list
   */
  public static async getPaymentsAsync(
    filters?: {
      search?: string;
      customerId?: string;
      accountId?: string;
      paymentMethod?: string;
      status?: string;
      from?: string;
      to?: string;
    },
    companyId: string = DEFAULT_COMPANY_ID
  ): Promise<any[]> {
    const { DalService } = await import('@/core/database/dal-services');
    return await DalService.getPaymentsReceived(filters, companyId);
  }

  /**
   * Get payments with flexible filtering
   */
  public static getPayments(
    filters?: {
      search?: string;
      customerId?: string;
      accountId?: string;
      paymentMethod?: string;
      status?: string;
      from?: string;
      to?: string;
    },
    companyId: string = DEFAULT_COMPANY_ID
  ) {
    const db = getDatabase();

    let query = `
      SELECT 
        p.*,
        c.name as customer_name,
        c.shop_name,
        c.phone as customer_phone,
        coa.code as account_code,
        coa.name as account_name,
        (SELECT COUNT(*) FROM customer_payment_allocations a WHERE a.payment_id = p.id AND a.company_id = p.company_id) as allocations_count,
        (SELECT COALESCE(SUM(a.allocated_amount), 0) FROM customer_payment_allocations a WHERE a.payment_id = p.id AND a.company_id = p.company_id) as allocated_total
      FROM customer_payments p
      JOIN customers c ON p.customer_id = c.id AND c.company_id = p.company_id
      LEFT JOIN chart_of_accounts coa ON p.account_id = coa.id AND coa.company_id = p.company_id
      WHERE p.company_id = ?
    `;
    const params: any[] = [companyId];

    if (filters?.search) {
      query += ` AND (p.payment_number LIKE ? OR c.name LIKE ? OR c.shop_name LIKE ? OR p.reference_note LIKE ?)`;
      const term = `%${filters.search}%`;
      params.push(term, term, term, term);
    }

    if (filters?.customerId) {
      query += ` AND p.customer_id = ?`;
      params.push(filters.customerId);
    }

    if (filters?.accountId) {
      query += ` AND p.account_id = ?`;
      params.push(filters.accountId);
    }

    if (filters?.paymentMethod && filters.paymentMethod !== 'ALL') {
      query += ` AND p.payment_method = ?`;
      params.push(filters.paymentMethod);
    }

    if (filters?.status && filters.status !== 'ALL') {
      query += ` AND p.status = ?`;
      params.push(filters.status);
    }

    if (filters?.from) {
      query += ` AND p.payment_date >= ?`;
      params.push(filters.from);
    }

    if (filters?.to) {
      query += ` AND p.payment_date <= ?`;
      params.push(filters.to);
    }

    query += ` ORDER BY p.payment_date DESC, p.created_at DESC`;

    return db.prepare(query).all(...params) as any[];
  }

  /**
   * Get single customer payment by ID with allocations & linked GL lines
   */
  public static getPaymentById(id: string, companyId: string = DEFAULT_COMPANY_ID) {
    const db = getDatabase();

    const payment = db.prepare(`
      SELECT 
        p.*,
        c.name as customer_name,
        c.shop_name,
        c.phone as customer_phone,
        c.address as customer_address,
        coa.code as account_code,
        coa.name as account_name
      FROM customer_payments p
      JOIN customers c ON p.customer_id = c.id AND c.company_id = p.company_id
      LEFT JOIN chart_of_accounts coa ON p.account_id = coa.id AND coa.company_id = p.company_id
      WHERE p.id = ? AND p.company_id = ?
    `).get(id, companyId) as any;

    if (!payment) return null;

    // Fetch allocations with invoice numbers
    const rawAllocations = db.prepare(`
      SELECT a.*
      FROM customer_payment_allocations a
      WHERE a.payment_id = ? AND a.company_id = ?
      ORDER BY a.created_at ASC
    `).all(id, companyId) as any[];

    const allocations = rawAllocations.map((a) => {
      let inv: any = null;
      if (a.invoice_type === 'ORDER') {
        inv = db.prepare('SELECT order_number as invoice_number, order_date as invoice_date, grand_total as total_amount FROM sales_orders WHERE id = ? AND company_id = ?').get(a.invoice_id, companyId);
      } else {
        inv = db.prepare('SELECT invoice_number, invoice_date, grand_total as total_amount FROM sales_invoices WHERE id = ? AND company_id = ?').get(a.invoice_id, companyId);
      }

      return {
        ...a,
        invoice_number: inv?.invoice_number || 'Unknown Doc',
        invoice_date: inv?.invoice_date || '',
        total_amount: inv?.total_amount || 0,
      };
    });

    // Fetch linked GL journal lines
    let journalLines: any[] = [];
    if (payment.journal_id) {
      journalLines = db.prepare(`
        SELECT jl.*, coa.code as account_code, coa.name as account_name
        FROM journal_lines jl
        JOIN chart_of_accounts coa ON jl.account_id = coa.id AND coa.company_id = jl.company_id
        WHERE jl.journal_id = ? AND jl.company_id = ?
        ORDER BY jl.debit_paisas DESC, jl.credit_paisas DESC
      `).all(payment.journal_id, companyId);
    }

    return {
      ...payment,
      allocations,
      journalLines,
    };
  }

  /**
   * Void Customer Payment: reverses GL entry and restores invoice remaining balances
   */
  public static voidPayment(id: string, reason: string = 'User void request', companyId: string = DEFAULT_COMPANY_ID) {
    const db = getDatabase();

    const payment = db.prepare('SELECT * FROM customer_payments WHERE id = ? AND company_id = ?').get(id, companyId) as any;
    if (!payment) {
      throw new Error(`Payment receipt ${id} not found.`);
    }

    if (payment.status === 'VOID') {
      throw new Error(`Payment receipt ${payment.payment_number} is already voided.`);
    }

    // 0. Guard against locked/closed accounting period
    const paymentDateStr = payment.payment_date ? payment.payment_date.slice(0, 10) : '';
    const closedPeriod = db.prepare(
      "SELECT * FROM daily_closings WHERE closing_date = ? AND status = 'CLOSED' AND company_id = ?"
    ).get(paymentDateStr, companyId) as any;
    if (closedPeriod) {
      throw new Error(
        `Cannot void payment receipt ${payment.payment_number}: The accounting period for date ${paymentDateStr} is closed and locked (finalized by ${closedPeriod.closed_by || 'Admin Cashier'}). Re-open the daily closing first to make changes.`
      );
    }

    // 1. Post reversal journal entry
    if (payment.journal_id) {
      DoubleEntryEngine.voidEntry(payment.journal_id, `Reversal of Payment Receipt ${payment.payment_number}: ${reason}`, companyId);
    }

    // 2. Rollback invoice allocations
    const allocations = db.prepare('SELECT * FROM customer_payment_allocations WHERE payment_id = ? AND company_id = ?').all(id, companyId) as any[];

    const revertOrder = db.prepare(`
      UPDATE sales_orders
      SET remaining_balance_paisas = remaining_balance_paisas + ?,
          remaining_balance = remaining_balance + ?,
          payment_status = CASE 
            WHEN (remaining_balance_paisas + ?) >= grand_total_paisas THEN 'UNPAID'
            ELSE 'PARTIAL'
          END,
          updated_at = datetime('now')
      WHERE id = ? AND company_id = ?
    `);

    const revertInvoice = db.prepare(`
      UPDATE sales_invoices
      SET remaining_balance_paisas = remaining_balance_paisas + ?,
          remaining_balance = remaining_balance + ?,
          payment_status = CASE 
            WHEN (remaining_balance_paisas + ?) >= grand_total_paisas THEN 'UNPAID'
            ELSE 'PARTIAL'
          END
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

    // 3. Mark payment as VOID
    db.prepare(`
      UPDATE customer_payments
      SET status = 'VOID',
          updated_at = datetime('now')
      WHERE id = ? AND company_id = ?
    `).run(id, companyId);

    return { success: true, paymentNumber: payment.payment_number };
  }

  /**
   * Delete & Reverse Customer Payment:
   * 1. Validates that the payment is not in a locked/closed accounting period.
   * 2. Reverses invoice allocations (restoring order/invoice remaining balance and payment status).
   * 3. Reverses GL entries (Cash/Bank debit and Customer AR credit) and removes linked journal entries without leaving orphans.
   * 4. Safely removes allocation records and payment record.
   */
  public static deletePayment(id: string, companyId: string = DEFAULT_COMPANY_ID): { success: boolean; paymentNumber: string; message: string } {
    const db = getDatabase();

    const payment = db.prepare('SELECT * FROM customer_payments WHERE id = ? AND company_id = ?').get(id, companyId) as any;
    if (!payment) {
      throw new Error(`Payment receipt ${id} not found.`);
    }

    // 1. Guard against locked/closed accounting period
    const paymentDateStr = payment.payment_date ? payment.payment_date.slice(0, 10) : '';
    const closedPeriod = db.prepare(
      "SELECT * FROM daily_closings WHERE closing_date = ? AND status = 'CLOSED' AND company_id = ?"
    ).get(paymentDateStr, companyId) as any;

    if (closedPeriod) {
      throw new Error(
        `Cannot delete & reverse payment receipt ${payment.payment_number}: The accounting period for date ${paymentDateStr} is closed and locked (finalized by ${closedPeriod.closed_by || 'Admin Cashier'}). Re-open the daily closing first to make changes.`
      );
    }

    db.exec('BEGIN IMMEDIATE TRANSACTION;');

    try {
      // 2. Rollback invoice allocations if the payment is currently POSTED
      // (If already VOID, balances were previously restored upon voiding)
      if (payment.status === 'POSTED') {
        const allocations = db
          .prepare('SELECT * FROM customer_payment_allocations WHERE payment_id = ? AND company_id = ?')
          .all(id, companyId) as any[];

        const revertOrder = db.prepare(`
          UPDATE sales_orders
          SET remaining_balance_paisas = MIN(grand_total_paisas, remaining_balance_paisas + ?),
              remaining_balance = MIN(grand_total, remaining_balance + ?),
              payment_status = CASE 
                WHEN (remaining_balance_paisas + ?) >= grand_total_paisas THEN 'UNPAID'
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
                WHEN (remaining_balance_paisas + ?) >= grand_total_paisas THEN 'UNPAID'
                ELSE 'PARTIAL'
              END
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

      // 3. Find all linked journal entries (original and any reversal vouchers)
      const journalIds = new Set<string>();
      if (payment.journal_id) {
        journalIds.add(payment.journal_id);
      }
      const sourceJournals = db.prepare(
        "SELECT id FROM journal_entries WHERE (source_document_id = ? OR (source_module = 'payments' AND source_document_id = ?)) AND company_id = ?"
      ).all(id, id, companyId) as { id: string }[];
      for (const sj of sourceJournals) {
        journalIds.add(sj.id);
      }
      if (payment.journal_id) {
        const reversalJournals = db.prepare(
          'SELECT id FROM journal_entries WHERE reversal_of_id = ? AND company_id = ?'
        ).all(payment.journal_id, companyId) as { id: string }[];
        for (const rj of reversalJournals) {
          journalIds.add(rj.id);
        }
      }

      // 4. Detach journal reference from payment before deleting
      db.prepare('UPDATE customer_payments SET journal_id = NULL WHERE id = ? AND company_id = ?').run(id, companyId);

      // 5. Delete allocation records
      db.prepare('DELETE FROM customer_payment_allocations WHERE payment_id = ? AND company_id = ?').run(id, companyId);

      // 6. Delete payment record
      db.prepare('DELETE FROM customer_payments WHERE id = ? AND company_id = ?').run(id, companyId);

      // 7. Safely remove linked journal lines and entries without leaving orphans
      for (const jid of journalIds) {
        db.prepare('UPDATE journal_entries SET reversal_of_id = NULL WHERE id = ? AND company_id = ?').run(jid, companyId);
        db.prepare('DELETE FROM journal_lines WHERE journal_id = ? AND company_id = ?').run(jid, companyId);
        db.prepare('DELETE FROM journal_entries WHERE id = ? AND company_id = ?').run(jid, companyId);
      }

      db.exec('COMMIT;');

      return {
        success: true,
        paymentNumber: payment.payment_number,
        message: `Payment receipt ${payment.payment_number} successfully deleted and reversed.`,
      };
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
  }
}

// ==========================================================
// 2. PAYMENTS MADE SERVICE (Vendor / Supplier Payments)
// ==========================================================

export class PaymentsMadeService {
  /**
   * Get vendor outstanding purchase bills eligible for payment allocation
   */
  public static getVendorOutstandingBills(vendorId: string, companyId: string = DEFAULT_COMPANY_ID) {
    const db = getDatabase();

    const bills = db.prepare(`
      SELECT 
        id,
        bill_number,
        vendor_invoice_number,
        bill_date,
        due_date,
        net_amount as total_amount,
        net_amount_paisas,
        paid_amount as already_paid,
        paid_amount_paisas,
        remaining_balance as outstanding_balance,
        remaining_balance_paisas,
        payment_status
      FROM purchase_bills
      WHERE vendor_id = ? 
        AND company_id = ?
        AND status = 'POSTED'
        AND remaining_balance > 0.001
      ORDER BY bill_date ASC, created_at ASC
    `).all(vendorId, companyId) as any[];

    return bills;
  }

  /**
   * Record Vendor Payment with purchase bill allocation & strict double-entry GL posting
   */
  public static recordPayment(input: RecordVendorPaymentInput, companyId?: string) {
    const db = getDatabase();
    const targetCompanyId = input.companyId || companyId || DEFAULT_COMPANY_ID;
    const id = generateUUID();
    const paymentDate = input.paymentDate || new Date().toISOString().split('T')[0];

    const amountPaisas = toPaisas(input.amount);
    if (amountPaisas <= 0) {
      throw new Error('Payment amount must be greater than zero.');
    }

    // 1. Validate Vendor
    const vendor = db.prepare('SELECT id, name, company_name FROM vendors WHERE id = ? AND company_id = ?').get(input.vendorId, targetCompanyId) as any;
    if (!vendor) {
      throw new Error(`Vendor ${input.vendorId} not found.`);
    }

    // 2. Validate Paying Cash/Bank Account
    const account = db.prepare('SELECT id, code, name, type, is_active FROM chart_of_accounts WHERE id = ? AND company_id = ?').get(input.accountId, targetCompanyId) as any;
    if (!account) {
      throw new Error('Selected paying Cash/Bank account does not exist.');
    }
    if (account.is_active !== 1) {
      throw new Error(`Account ${account.code} (${account.name}) is inactive.`);
    }

    // 3. Find Accounts Payable Control Account (2010)
    const apAccount = db.prepare("SELECT id, code, name FROM chart_of_accounts WHERE code = '2010' AND company_id = ?").get(targetCompanyId) as any;
    if (!apAccount) {
      throw new Error('Accounts Payable (2010) control account missing in Chart of Accounts.');
    }

    // 4. Validate Allocations & Check for Over-Allocation
    const allocations = input.allocations || [];
    let totalAllocatedPaisas = 0;

    const validatedAllocations: {
      billId: string;
      allocatedAmountPaisas: number;
      allocatedAmount: number;
      currentOutstandingPaisas: number;
    }[] = [];

    for (const alloc of allocations) {
      const allocPaisas = toPaisas(alloc.allocatedAmount);
      if (allocPaisas <= 0) continue;

      const bill = db.prepare(`
        SELECT id, bill_number, remaining_balance_paisas, remaining_balance 
        FROM purchase_bills 
        WHERE id = ? AND vendor_id = ? AND company_id = ?
      `).get(alloc.billId, input.vendorId, targetCompanyId) as any;

      if (!bill) {
        throw new Error(`Purchase bill ${alloc.billId} not found for vendor ${vendor.name}.`);
      }

      const outstandingPaisas = bill.remaining_balance_paisas || toPaisas(bill.remaining_balance || 0);

      // Prevent over-allocation beyond bill outstanding balance
      if (allocPaisas > outstandingPaisas) {
        throw new Error(
          `Over-allocation error! Cannot allocate ${fromPaisas(allocPaisas)} to Bill ${bill.bill_number}. Outstanding balance is only ${fromPaisas(outstandingPaisas)}.`
        );
      }

      totalAllocatedPaisas += allocPaisas;
      validatedAllocations.push({
        billId: alloc.billId,
        allocatedAmountPaisas: allocPaisas,
        allocatedAmount: fromPaisas(allocPaisas),
        currentOutstandingPaisas: outstandingPaisas,
      });
    }

    // Prevent total allocated from exceeding total payment amount
    if (totalAllocatedPaisas > amountPaisas) {
      throw new Error(
        `Total allocated amount (${fromPaisas(totalAllocatedPaisas)}) cannot exceed total payment amount (${fromPaisas(amountPaisas)}).`
      );
    }

    const unallocatedPaisas = amountPaisas - totalAllocatedPaisas;
    const unallocatedAmount = fromPaisas(unallocatedPaisas);

    // 5. Generate Voucher Number: PV-YYYYMM-XXXX
    const countRow = db.prepare('SELECT COUNT(*) as count FROM vendor_payments WHERE company_id = ?').get(targetCompanyId) as { count: number };
    const seq = (countRow?.count || 0) + 1;
    const yearMonth = paymentDate.replace(/-/g, '').slice(0, 6);
    const paymentNumber = `PV-${yearMonth}-${String(seq).padStart(4, '0')}`;

    // 6. Post General Ledger Entry
    // Dr. Vendor Accounts Payable (2010) with Entity Attribution
    // Cr. Selected Cash/Bank Account
    const memo = unallocatedPaisas > 0 && validatedAllocations.length > 0
      ? `Payment made to ${vendor.name} (Allocated: ${fromPaisas(totalAllocatedPaisas)}, On Account: ${unallocatedAmount})`
      : validatedAllocations.length > 0
      ? `Payment made against ${validatedAllocations.length} bill(s) to ${vendor.name}`
      : `Payment made On Account to ${vendor.name}`;

    const je = DoubleEntryEngine.postEntry({
      companyId: targetCompanyId,
      entryDate: paymentDate,
      description: `Payment Voucher ${paymentNumber} - ${vendor.name} (${input.paymentMethod})`,
      sourceModule: 'payments',
      sourceDocumentId: id,
      lines: [
        {
          accountId: apAccount.id,
          debit: input.amount,
          credit: 0,
          entityId: input.vendorId,
          entityType: 'VENDOR',
          memo: memo,
        },
        {
          accountId: account.id,
          debit: 0,
          credit: input.amount,
          memo: `${input.paymentMethod}: Disbursed via ${account.name} for ${paymentNumber}`,
        },
      ],
      createdBy: 'Payment Made Module',
    });

    // Resolve bank_account_id if account is linked to a bank account
    const bankRow = db.prepare('SELECT id FROM bank_accounts WHERE account_id = ? AND company_id = ? LIMIT 1').get(account.id, targetCompanyId) as { id: string } | undefined;
    const bankAccountId = bankRow?.id || null;

    // 7. Persist Payment Record
    db.prepare(`
      INSERT INTO vendor_payments (
        id, company_id, payment_number, payment_date, vendor_id, account_id, bank_account_id,
        payment_method, amount_paisas, amount,
        unallocated_amount_paisas, unallocated_amount,
        reference_note, notes, status, journal_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'POSTED', ?, datetime('now'), datetime('now'))
    `).run(
      id,
      targetCompanyId,
      paymentNumber,
      paymentDate,
      input.vendorId,
      account.id,
      bankAccountId,
      input.paymentMethod,
      amountPaisas,
      input.amount,
      unallocatedPaisas,
      unallocatedAmount,
      input.referenceNo || input.referenceNote || null,
      input.notes || null,
      je.id
    );

    // 8. Persist Allocations & Update Purchase Bills
    const insertAlloc = db.prepare(`
      INSERT INTO vendor_payment_allocations (
        id, company_id, payment_id, bill_id, allocated_amount_paisas, allocated_amount, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    const updateBill = db.prepare(`
      UPDATE purchase_bills
      SET paid_amount_paisas = paid_amount_paisas + ?,
          paid_amount = paid_amount + ?,
          remaining_balance_paisas = remaining_balance_paisas - ?,
          remaining_balance = remaining_balance - ?,
          payment_status = CASE 
            WHEN (remaining_balance_paisas - ?) <= 0 THEN 'PAID'
            ELSE 'PARTIAL'
          END,
          updated_at = datetime('now')
      WHERE id = ? AND company_id = ?
    `);

    for (const alloc of validatedAllocations) {
      const allocId = generateUUID();
      insertAlloc.run(
        allocId,
        targetCompanyId,
        id,
        alloc.billId,
        alloc.allocatedAmountPaisas,
        alloc.allocatedAmount
      );

      updateBill.run(
        alloc.allocatedAmountPaisas,
        alloc.allocatedAmount,
        alloc.allocatedAmountPaisas,
        alloc.allocatedAmount,
        alloc.allocatedAmountPaisas,
        alloc.billId,
        targetCompanyId
      );
    }

    return this.getPaymentById(id, targetCompanyId);
  }

  /**
   * Get payments made with flexible filtering
   */
  public static getPayments(
    filters?: {
      search?: string;
      vendorId?: string;
      accountId?: string;
      paymentMethod?: string;
      status?: string;
      from?: string;
      to?: string;
    },
    companyId: string = DEFAULT_COMPANY_ID
  ) {
    const db = getDatabase();

    let query = `
      SELECT 
        vp.*,
        vp.payment_number as voucher_number,
        v.name as vendor_name,
        v.company_name,
        v.phone as vendor_phone,
        coa.code as account_code,
        coa.name as account_name,
        (SELECT COUNT(*) FROM vendor_payment_allocations a WHERE a.payment_id = vp.id AND a.company_id = vp.company_id) as allocations_count,
        (SELECT COALESCE(SUM(a.allocated_amount), 0) FROM vendor_payment_allocations a WHERE a.payment_id = vp.id AND a.company_id = vp.company_id) as allocated_total
      FROM vendor_payments vp
      JOIN vendors v ON vp.vendor_id = v.id AND v.company_id = vp.company_id
      LEFT JOIN chart_of_accounts coa ON vp.account_id = coa.id AND coa.company_id = vp.company_id
      WHERE vp.company_id = ?
    `;
    const params: any[] = [companyId];

    if (filters?.search) {
      query += ` AND (vp.payment_number LIKE ? OR v.name LIKE ? OR v.company_name LIKE ? OR vp.reference_note LIKE ?)`;
      const term = `%${filters.search}%`;
      params.push(term, term, term, term);
    }

    if (filters?.vendorId) {
      query += ` AND vp.vendor_id = ?`;
      params.push(filters.vendorId);
    }

    if (filters?.accountId) {
      query += ` AND vp.account_id = ?`;
      params.push(filters.accountId);
    }

    if (filters?.paymentMethod && filters.paymentMethod !== 'ALL') {
      query += ` AND vp.payment_method = ?`;
      params.push(filters.paymentMethod);
    }

    if (filters?.status && filters.status !== 'ALL') {
      query += ` AND vp.status = ?`;
      params.push(filters.status);
    }

    if (filters?.from) {
      query += ` AND vp.payment_date >= ?`;
      params.push(filters.from);
    }

    if (filters?.to) {
      query += ` AND vp.payment_date <= ?`;
      params.push(filters.to);
    }

    query += ` ORDER BY vp.payment_date DESC, vp.created_at DESC`;

    return db.prepare(query).all(...params) as any[];
  }

  /**
   * Get single vendor payment by ID with allocations & linked GL lines
   */
  public static getPaymentById(id: string, companyId: string = DEFAULT_COMPANY_ID) {
    const db = getDatabase();

    const payment = db.prepare(`
      SELECT 
        vp.*,
        vp.payment_number as voucher_number,
        v.name as vendor_name,
        v.company_name,
        v.phone as vendor_phone,
        v.address as vendor_address,
        coa.code as account_code,
        coa.name as account_name
      FROM vendor_payments vp
      JOIN vendors v ON vp.vendor_id = v.id AND v.company_id = vp.company_id
      LEFT JOIN chart_of_accounts coa ON vp.account_id = coa.id AND coa.company_id = vp.company_id
      WHERE vp.id = ? AND vp.company_id = ?
    `).get(id, companyId) as any;

    if (!payment) return null;

    // Fetch allocations with bill numbers
    const rawAllocations = db.prepare(`
      SELECT 
        a.*,
        pb.bill_number,
        pb.vendor_invoice_number,
        pb.bill_date,
        pb.net_amount as total_amount
      FROM vendor_payment_allocations a
      JOIN purchase_bills pb ON a.bill_id = pb.id AND pb.company_id = a.company_id
      WHERE a.payment_id = ? AND a.company_id = ?
      ORDER BY a.created_at ASC
    `).all(id, companyId) as any[];

    // Fetch linked GL journal lines
    let journalLines: any[] = [];
    if (payment.journal_id) {
      journalLines = db.prepare(`
        SELECT jl.*, coa.code as account_code, coa.name as account_name
        FROM journal_lines jl
        JOIN chart_of_accounts coa ON jl.account_id = coa.id AND coa.company_id = jl.company_id
        WHERE jl.journal_id = ? AND jl.company_id = ?
        ORDER BY jl.debit_paisas DESC, jl.credit_paisas DESC
      `).all(payment.journal_id, companyId);
    }

    return {
      ...payment,
      allocations: rawAllocations,
      journalLines,
    };
  }

  /**
   * Void Vendor Payment: reverses GL entry and restores bill remaining balances
   */
  public static voidPayment(id: string, reason: string = 'User void request', companyId: string = DEFAULT_COMPANY_ID) {
    const db = getDatabase();

    const payment = db.prepare('SELECT * FROM vendor_payments WHERE id = ? AND company_id = ?').get(id, companyId) as any;
    if (!payment) {
      throw new Error(`Payment voucher ${id} not found.`);
    }

    if (payment.status === 'VOID') {
      throw new Error(`Payment voucher ${payment.payment_number} is already voided.`);
    }

    // 0. Guard against locked/closed accounting period
    const paymentDateStr = payment.payment_date ? payment.payment_date.slice(0, 10) : '';
    const closedPeriod = db.prepare(
      "SELECT * FROM daily_closings WHERE closing_date = ? AND status = 'CLOSED' AND company_id = ?"
    ).get(paymentDateStr, companyId) as any;
    if (closedPeriod) {
      throw new Error(
        `Cannot void payment voucher ${payment.payment_number}: The accounting period for date ${paymentDateStr} is closed and locked (finalized by ${closedPeriod.closed_by || 'Admin Cashier'}). Re-open the daily closing first to make changes.`
      );
    }

    // 1. Post reversal journal entry
    if (payment.journal_id) {
      DoubleEntryEngine.voidEntry(payment.journal_id, `Reversal of Payment Voucher ${payment.payment_number}: ${reason}`, companyId);
    }

    // 2. Rollback bill allocations
    const allocations = db.prepare('SELECT * FROM vendor_payment_allocations WHERE payment_id = ? AND company_id = ?').all(id, companyId) as any[];

    const revertBill = db.prepare(`
      UPDATE purchase_bills
      SET paid_amount_paisas = paid_amount_paisas - ?,
          paid_amount = paid_amount - ?,
          remaining_balance_paisas = remaining_balance_paisas + ?,
          remaining_balance = remaining_balance + ?,
          payment_status = CASE 
            WHEN (paid_amount_paisas - ?) <= 0 THEN 'UNPAID'
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

    // 3. Mark payment as VOID
    db.prepare(`
      UPDATE vendor_payments
      SET status = 'VOID',
          updated_at = datetime('now')
      WHERE id = ? AND company_id = ?
    `).run(id, companyId);

    return { success: true, paymentNumber: payment.payment_number };
  }

  /**
   * Delete & Reverse Vendor Payment:
   * 1. Validates that the payment voucher is not in a locked/closed accounting period.
   * 2. Reverses purchase bill allocations (restoring bill remaining balance, paid amount, and payment status).
   * 3. Reverses GL entries (Vendor AP debit and Cash/Bank credit) and removes linked journal entries without leaving orphans.
   * 4. Safely removes allocation records and payment record.
   */
  public static deletePayment(id: string, companyId: string = DEFAULT_COMPANY_ID): { success: boolean; paymentNumber: string; message: string } {
    const db = getDatabase();

    const payment = db.prepare('SELECT * FROM vendor_payments WHERE id = ? AND company_id = ?').get(id, companyId) as any;
    if (!payment) {
      throw new Error(`Payment voucher ${id} not found.`);
    }

    // 1. Guard against locked/closed accounting period
    const paymentDateStr = payment.payment_date ? payment.payment_date.slice(0, 10) : '';
    const closedPeriod = db.prepare(
      "SELECT * FROM daily_closings WHERE closing_date = ? AND status = 'CLOSED' AND company_id = ?"
    ).get(paymentDateStr, companyId) as any;

    if (closedPeriod) {
      throw new Error(
        `Cannot delete & reverse payment voucher ${payment.payment_number}: The accounting period for date ${paymentDateStr} is closed and locked (finalized by ${closedPeriod.closed_by || 'Admin Cashier'}). Re-open the daily closing first to make changes.`
      );
    }

    db.exec('BEGIN IMMEDIATE TRANSACTION;');

    try {
      // 2. Rollback bill allocations if currently POSTED
      // (If already VOID, balances were previously restored upon voiding)
      if (payment.status === 'POSTED') {
        const allocations = db
          .prepare('SELECT * FROM vendor_payment_allocations WHERE payment_id = ? AND company_id = ?')
          .all(id, companyId) as any[];

        const revertBill = db.prepare(`
          UPDATE purchase_bills
          SET paid_amount_paisas = MAX(0, paid_amount_paisas - ?),
              paid_amount = MAX(0, paid_amount - ?),
              remaining_balance_paisas = MIN(net_amount_paisas, remaining_balance_paisas + ?),
              remaining_balance = MIN(net_amount, remaining_balance + ?),
              payment_status = CASE 
                WHEN (paid_amount_paisas - ?) <= 0 THEN 'UNPAID'
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

      // 3. Find all linked journal entries (original and any reversal vouchers)
      const journalIds = new Set<string>();
      if (payment.journal_id) {
        journalIds.add(payment.journal_id);
      }
      const sourceJournals = db.prepare(
        "SELECT id FROM journal_entries WHERE (source_document_id = ? OR (source_module = 'payments' AND source_document_id = ?)) AND company_id = ?"
      ).all(id, id, companyId) as { id: string }[];
      for (const sj of sourceJournals) {
        journalIds.add(sj.id);
      }
      if (payment.journal_id) {
        const reversalJournals = db.prepare(
          'SELECT id FROM journal_entries WHERE reversal_of_id = ? AND company_id = ?'
        ).all(payment.journal_id, companyId) as { id: string }[];
        for (const rj of reversalJournals) {
          journalIds.add(rj.id);
        }
      }

      // 4. Detach journal reference from payment before deleting
      db.prepare('UPDATE vendor_payments SET journal_id = NULL WHERE id = ? AND company_id = ?').run(id, companyId);

      // 5. Delete allocation records
      db.prepare('DELETE FROM vendor_payment_allocations WHERE payment_id = ? AND company_id = ?').run(id, companyId);

      // 6. Delete payment record
      db.prepare('DELETE FROM vendor_payments WHERE id = ? AND company_id = ?').run(id, companyId);

      // 7. Safely remove linked journal lines and entries without leaving orphans
      for (const jid of journalIds) {
        db.prepare('UPDATE journal_entries SET reversal_of_id = NULL WHERE id = ? AND company_id = ?').run(jid, companyId);
        db.prepare('DELETE FROM journal_lines WHERE journal_id = ? AND company_id = ?').run(jid, companyId);
        db.prepare('DELETE FROM journal_entries WHERE id = ? AND company_id = ?').run(jid, companyId);
      }

      db.exec('COMMIT;');

      return {
        success: true,
        paymentNumber: payment.payment_number,
        message: `Payment voucher ${payment.payment_number} successfully deleted and reversed.`,
      };
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
  }
}
