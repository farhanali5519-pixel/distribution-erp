import { getDatabase } from '@/core/database/db';
import { generateUUID } from '@/shared/utils/uuid';
import { toPaisas, fromPaisas } from '@/shared/utils/currency';
import { DoubleEntryEngine } from '@/core/accounting/engine';
import { DEFAULT_COMPANY_ID } from '@/core/tenancy/constants';

export interface RecordPaymentInput {
  companyId?: string;
  customerId: string;
  amount: number; // in PKR
  paymentDate?: string;
  paymentMethod: 'CASH' | 'BANK_TRANSFER' | 'CHEQUE';
  bankAccountId?: string;
  accountId?: string;
  routeId?: string;
  salesmanId?: string;
  referenceNote?: string;
}

export class CollectionsService {
  /**
   * Record customer route cash/bank collection with immediate GL posting
   */
  public static recordPayment(input: RecordPaymentInput, companyIdOverride?: string) {
    const db = getDatabase();
    const companyId = input.companyId || companyIdOverride || DEFAULT_COMPANY_ID;
    const id = generateUUID();
    const paymentNumber = `PAY-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`;
    const paymentDate = input.paymentDate || new Date().toISOString().split('T')[0];

    const amountPaisas = toPaisas(input.amount);
    if (amountPaisas <= 0) {
      throw new Error('Payment amount must be greater than zero.');
    }

    const customer = db.prepare('SELECT name, route_id FROM customers WHERE id = ? AND company_id = ?').get(input.customerId, companyId) as any;
    if (!customer) {
      throw new Error(`Customer ${input.customerId} not found in this company.`);
    }

    if (input.routeId) {
      const routeRow = db.prepare('SELECT id FROM routes WHERE id = ? AND company_id = ?').get(input.routeId, companyId);
      if (!routeRow) throw new Error('Selected route does not belong to this company.');
    }
    if (input.salesmanId) {
      const salesmanRow = db.prepare('SELECT id FROM staff_members WHERE id = ? AND company_id = ?').get(input.salesmanId, companyId);
      if (!salesmanRow) throw new Error('Selected salesman does not belong to this company.');
    }

    // Lookup GL accounts
    const cashAccount = db.prepare("SELECT id FROM chart_of_accounts WHERE code = '1010' AND company_id = ?").get(companyId) as { id: string } | undefined;
    const arAccount = db.prepare("SELECT id FROM chart_of_accounts WHERE code = '1030' AND company_id = ?").get(companyId) as { id: string } | undefined;

    let targetAccountId = input.accountId;
    let targetBankAccountId = input.bankAccountId || null;

    if (targetBankAccountId) {
      const bank = db.prepare('SELECT id, bank_name, account_number, account_id, is_active FROM bank_accounts WHERE id = ? AND company_id = ?').get(targetBankAccountId, companyId) as any;
      if (bank) {
        targetAccountId = bank.account_id;
      } else {
        throw new Error('Selected bank account does not belong to this company.');
      }
    }

    if (!targetAccountId) {
      if (input.paymentMethod === 'CASH') {
        targetAccountId = cashAccount?.id;
      } else {
        // Find first active bank account
        const firstBank = db.prepare('SELECT id, account_id FROM bank_accounts WHERE is_active = 1 AND company_id = ? LIMIT 1').get(companyId) as any;
        if (firstBank) {
          targetAccountId = firstBank.account_id;
          targetBankAccountId = firstBank.id;
        } else {
          const fallbackBank = db.prepare("SELECT id FROM chart_of_accounts WHERE code = '1020' AND company_id = ?").get(companyId) as { id: string } | undefined;
          targetAccountId = fallbackBank?.id || cashAccount?.id;
        }
      }
    }

    if (!arAccount || !targetAccountId) {
      throw new Error('Receivable or Cash/Bank account missing in Chart of Accounts for this company.');
    }

    // 1. Post General Ledger Entry
    const je = DoubleEntryEngine.postEntry({
      companyId,
      entryDate: paymentDate,
      description: `Customer Route Collection ${paymentNumber} - ${customer.name} (${input.paymentMethod})`,
      sourceModule: 'sales',
      sourceDocumentId: id,
      lines: [
        {
          accountId: targetAccountId,
          debit: input.amount,
          credit: 0,
          memo: `Collection received via ${input.paymentMethod} from ${customer.name}`,
        },
        {
          accountId: arAccount.id,
          debit: 0,
          credit: input.amount,
          entityId: input.customerId,
          entityType: 'CUSTOMER',
          memo: `Payment applied to ${customer.name} ledger (${paymentNumber})`,
        },
      ],
      createdBy: 'Route Collections Module',
    });

    // 2. Persist Payment Record
    db.prepare(`
      INSERT INTO customer_payments (
        id, company_id, payment_number, payment_date, customer_id, route_id, salesman_id,
        payment_method, amount_paisas, amount, reference_note, journal_id, account_id, bank_account_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      companyId,
      paymentNumber,
      paymentDate,
      input.customerId,
      input.routeId || customer.route_id || null,
      input.salesmanId || null,
      input.paymentMethod,
      amountPaisas,
      input.amount,
      input.referenceNote || null,
      je.id,
      targetAccountId,
      targetBankAccountId
    );

    return db.prepare(`
      SELECT 
        p.*,
        c.name as customer_name,
        c.shop_name,
        r.name as route_name,
        s.name as salesman_name
      FROM customer_payments p
      LEFT JOIN customers c ON p.customer_id = c.id AND c.company_id = p.company_id
      LEFT JOIN routes r ON p.route_id = r.id AND r.company_id = p.company_id
      LEFT JOIN staff_members s ON p.salesman_id = s.id AND s.company_id = p.company_id
      WHERE p.id = ? AND p.company_id = ?
    `).get(id, companyId);
  }

  /**
   * Get all customer route payments
   */
  public static getPayments(customerId?: string, companyIdOverride?: string) {
    const db = getDatabase();
    const companyId = companyIdOverride || DEFAULT_COMPANY_ID;
    let query = `
      SELECT 
        p.*,
        c.name as customer_name,
        c.shop_name,
        r.name as route_name,
        s.name as salesman_name
      FROM customer_payments p
      LEFT JOIN customers c ON p.customer_id = c.id AND c.company_id = p.company_id
      LEFT JOIN routes r ON p.route_id = r.id AND r.company_id = p.company_id
      LEFT JOIN staff_members s ON p.salesman_id = s.id AND s.company_id = p.company_id
      WHERE p.company_id = ?
    `;
    const params: any[] = [companyId];

    if (customerId) {
      query += ' AND p.customer_id = ?';
      params.push(customerId);
    }

    query += ' ORDER BY p.created_at DESC';
    return db.prepare(query).all(...params);
  }
}

