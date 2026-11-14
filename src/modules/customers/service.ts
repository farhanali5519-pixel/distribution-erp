import { getDatabase } from '@/core/database/db';
import { generateUUID } from '@/shared/utils/uuid';
import { toPaisas, fromPaisas, formatPaisas } from '@/shared/utils/currency';
import { DoubleEntryEngine } from '@/core/accounting/engine';

export interface CustomerWithBalance {
  id: string;
  company_id?: string;
  name: string;
  shop_name: string | null;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  cnic_or_ntn: string | null;
  route_id: string | null;
  route_name: string | null;
  route_code: string | null;
  delivery_days?: string[];
  credit_limit_paisas: number;
  credit_limit: number;
  credit_days: number;
  live_balance_paisas: number;
  live_balance: number;
  is_active: number;
}

export interface CreateCustomerInput {
  name: string;
  shopName?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  cnicOrNtn?: string;
  routeId?: string;
  creditLimit?: number; // In PKR
  creditDays?: number;
}

import { DEFAULT_COMPANY_ID } from '@/core/tenancy/constants';

export class CustomerService {
  /**
   * Get all customers combined with their live sub-ledger balance and route
   */
  public static getCustomersWithBalances(companyId: string = DEFAULT_COMPANY_ID): CustomerWithBalance[] {
    const db = getDatabase();

    const rows = db.prepare(`
      SELECT 
        c.*,
        r.name as r_name,
        r.code as r_code,
        r.delivery_days as r_days
      FROM customers c
      LEFT JOIN routes r ON c.route_id = r.id AND r.company_id = c.company_id
      WHERE c.company_id = ?
      ORDER BY c.name ASC
    `).all(companyId) as any[];

    // Batch calculate live sub-ledger balances for all customers in ONE query
    const balancesMap = DoubleEntryEngine.getEntityBalances('CUSTOMER', companyId);

    return rows.map((c) => {
      const balanceInfo = balancesMap.get(c.id);
      const liveBalance = balanceInfo !== undefined ? balanceInfo.balance : (c.balance || 0);
      const liveBalancePaisas = balanceInfo !== undefined ? balanceInfo.balancePaisas : toPaisas(c.balance || 0);

      let deliveryDays: string[] = [];
      try {
        deliveryDays = JSON.parse(c.r_days || '[]');
      } catch {
        deliveryDays = [];
      }

      return {
        id: c.id,
        company_id: c.company_id,
        name: c.name,
        shop_name: c.shop_name,
        contact_person: c.contact_person,
        phone: c.phone,
        email: c.email,
        address: c.address,
        city: c.city,
        cnic_or_ntn: c.cnic_or_ntn,
        route_id: c.route_id,
        route_name: c.r_name || c.route_name || 'Unassigned',
        route_code: c.r_code || null,
        delivery_days: deliveryDays,
        credit_limit_paisas: c.credit_limit_paisas || toPaisas(c.credit_limit || 0),
        credit_limit: fromPaisas(c.credit_limit_paisas || toPaisas(c.credit_limit || 0)),
        credit_days: c.credit_days || 0,
        live_balance_paisas: liveBalancePaisas,
        live_balance: liveBalance,
        is_active: c.is_active,
      };
    });
  }

  /**
   * Universal DAL Async Customers with live balances
   */
  public static async getCustomersWithBalancesAsync(companyId: string = DEFAULT_COMPANY_ID): Promise<CustomerWithBalance[]> {
    const { DalService } = await import('@/core/database/dal-services');
    return await DalService.getCustomersWithBalances(companyId);
  }


  /**
   * Get single customer by ID scoped to company (fast direct single-row query)
   */
  public static getCustomerById(id: string, companyId: string = DEFAULT_COMPANY_ID): CustomerWithBalance | null {
    const db = getDatabase();
    const c = db.prepare(`
      SELECT 
        c.*,
        r.name as r_name,
        r.code as r_code,
        r.delivery_days as r_days
      FROM customers c
      LEFT JOIN routes r ON c.route_id = r.id AND r.company_id = c.company_id
      WHERE c.id = ? AND c.company_id = ?
    `).get(id, companyId) as any;

    if (!c) return null;

    const balancesMap = DoubleEntryEngine.getEntityBalances('CUSTOMER', companyId, [id]);
    const balanceInfo = balancesMap.get(c.id);
    const liveBalance = balanceInfo !== undefined ? balanceInfo.balance : (c.balance || 0);
    const liveBalancePaisas = balanceInfo !== undefined ? balanceInfo.balancePaisas : toPaisas(c.balance || 0);

    let deliveryDays: string[] = [];
    try {
      deliveryDays = JSON.parse(c.r_days || '[]');
    } catch {
      deliveryDays = [];
    }

    return {
      id: c.id,
      company_id: c.company_id,
      name: c.name,
      shop_name: c.shop_name,
      contact_person: c.contact_person,
      phone: c.phone,
      email: c.email,
      address: c.address,
      city: c.city,
      cnic_or_ntn: c.cnic_or_ntn,
      route_id: c.route_id,
      route_name: c.r_name || c.route_name || 'Unassigned',
      route_code: c.r_code || null,
      delivery_days: deliveryDays,
      credit_limit_paisas: c.credit_limit_paisas || toPaisas(c.credit_limit || 0),
      credit_limit: fromPaisas(c.credit_limit_paisas || toPaisas(c.credit_limit || 0)),
      credit_days: c.credit_days || 0,
      live_balance_paisas: liveBalancePaisas,
      live_balance: liveBalance,
      is_active: c.is_active,
    };
  }

  /**
   * Evaluate customer credit availability prior to order/invoice creation
   */
  public static checkCreditAvailable(
    customerId: string,
    newOrderAmountPaisas: number,
    companyId: string = DEFAULT_COMPANY_ID
  ): {
    allowed: boolean;
    currentBalancePaisas: number;
    creditLimitPaisas: number;
    remainingCreditPaisas: number;
    message: string;
  } {
    const db = getDatabase();
    const customer = db.prepare('SELECT id, name, credit_limit_paisas, credit_limit FROM customers WHERE id = ? AND company_id = ?').get(customerId, companyId) as any;

    if (!customer) {
      return {
        allowed: false,
        currentBalancePaisas: 0,
        creditLimitPaisas: 0,
        remainingCreditPaisas: 0,
        message: 'Customer not found.',
      };
    }

    const creditLimitPaisas = customer.credit_limit_paisas || toPaisas(customer.credit_limit || 0);

    // Live sub-ledger balance
    const statement = DoubleEntryEngine.getSubLedger('CUSTOMER', customerId, companyId);
    const currentBalance = statement.length > 0 ? statement[statement.length - 1].runningBalance : 0;
    const currentBalancePaisas = toPaisas(currentBalance);

    const projectedBalancePaisas = currentBalancePaisas + newOrderAmountPaisas;
    const remainingCreditPaisas = creditLimitPaisas - currentBalancePaisas;

    // If credit limit is 0, credit is not granted (Cash on delivery only)
    if (creditLimitPaisas > 0 && projectedBalancePaisas > creditLimitPaisas) {
      return {
        allowed: false,
        currentBalancePaisas,
        creditLimitPaisas,
        remainingCreditPaisas,
        message: `Credit Limit Breached! Customer "${customer.name}" has an outstanding balance of ${formatPaisas(currentBalancePaisas)} against limit ${formatPaisas(creditLimitPaisas)}. Remaining available: ${formatPaisas(remainingCreditPaisas)}.`,
      };
    }

    return {
      allowed: true,
      currentBalancePaisas,
      creditLimitPaisas,
      remainingCreditPaisas,
      message: `Credit check approved. Available remaining credit: ${formatPaisas(remainingCreditPaisas)}.`,
    };
  }

  /**
   * Onboard new customer
   */
  public static createCustomer(input: CreateCustomerInput, companyId: string = DEFAULT_COMPANY_ID): CustomerWithBalance {
    const db = getDatabase();
    const id = generateUUID();

    const creditLimitPaisas = toPaisas(input.creditLimit || 0);
    const creditLimitDecimal = fromPaisas(creditLimitPaisas);

    // Resolve route name if routeId is provided
    let routeName: string | null = null;
    let routeCode: string | null = null;
    let deliveryDays: string[] = [];
    if (input.routeId) {
      const route = db.prepare('SELECT name, code, delivery_days FROM routes WHERE id = ? AND company_id = ?').get(input.routeId, companyId) as any;
      if (!route) {
        throw new Error('Selected route does not exist or does not belong to this company.');
      }
      routeName = route.name;
      routeCode = route.code;
      try { deliveryDays = JSON.parse(route.delivery_days || '[]'); } catch { /* ignore */ }
    }

    db.prepare(`
      INSERT INTO customers (
        id, company_id, name, shop_name, contact_person, phone, email, address, city, cnic_or_ntn,
        route_id, route_name, credit_limit_paisas, credit_limit, credit_days, balance, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0.00, 1)
    `).run(
      id,
      companyId,
      input.name,
      input.shopName || null,
      input.contactPerson || null,
      input.phone || null,
      input.email || null,
      input.address || null,
      input.city || 'Lahore',
      input.cnicOrNtn || null,
      input.routeId || null,
      routeName,
      creditLimitPaisas,
      creditLimitDecimal,
      input.creditDays || 0
    );

    return {
      id,
      company_id: companyId,
      name: input.name,
      shop_name: input.shopName || null,
      contact_person: input.contactPerson || null,
      phone: input.phone || null,
      email: input.email || null,
      address: input.address || null,
      city: input.city || 'Lahore',
      cnic_or_ntn: input.cnicOrNtn || null,
      route_id: input.routeId || null,
      route_name: routeName || 'Unassigned',
      route_code: routeCode,
      delivery_days: deliveryDays,
      credit_limit_paisas: creditLimitPaisas,
      credit_limit: creditLimitDecimal,
      credit_days: input.creditDays || 0,
      live_balance_paisas: 0,
      live_balance: 0,
      is_active: 1,
    };
  }

  /**
   * Check if a customer has any linked transactions or dependencies
   */
  public static checkDependencies(customerId: string, companyId: string = DEFAULT_COMPANY_ID) {
    const { TransactionDeleteService } = require('@/core/transactions/transaction-delete.service');
    return TransactionDeleteService.checkCustomerDependencies(customerId, companyId);
  }

  /**
   * Safely delete a customer only if zero dependencies exist
   */
  public static deleteCustomer(customerId: string, companyId: string = DEFAULT_COMPANY_ID): { success: boolean; message: string } {
    const { TransactionDeleteService } = require('@/core/transactions/transaction-delete.service');
    return TransactionDeleteService.deleteCustomer(customerId, companyId);
  }

  /**
   * Universal DAL Async Customer Fetch for PostgreSQL & SQLite
   */
  public static async getCustomersAsync(
    companyId: string = DEFAULT_COMPANY_ID,
    client?: import('@/core/database/types').IDatabaseClient | import('@/core/database/types').ITransactionClient
  ): Promise<any[]> {
    const { DalService } = await import('@/core/database/dal-services');
    return DalService.getCustomers(companyId, client);
  }

  /**
   * Universal DAL Async Customer Fetch By ID for PostgreSQL & SQLite
   */
  public static async getCustomerByIdAsync(
    id: string,
    companyId: string = DEFAULT_COMPANY_ID,
    client?: import('@/core/database/types').IDatabaseClient | import('@/core/database/types').ITransactionClient
  ): Promise<any> {
    const { DalService } = await import('@/core/database/dal-services');
    return DalService.getCustomerById(id, companyId, client);
  }

  /**
   * Universal DAL Async Customer Creation for PostgreSQL & SQLite
   */
  public static async createCustomerAsync(
    input: CreateCustomerInput,
    companyId: string = DEFAULT_COMPANY_ID,
    client?: import('@/core/database/types').IDatabaseClient | import('@/core/database/types').ITransactionClient
  ): Promise<any> {
    const { DalService } = await import('@/core/database/dal-services');
    return DalService.createCustomer({
      name: input.name,
      shopName: input.shopName,
      contactPerson: input.contactPerson,
      phone: input.phone,
      address: input.address,
      city: input.city,
      cnicOrNtn: input.cnicOrNtn,
      routeId: input.routeId,
      creditLimitPaisas: toPaisas(input.creditLimit || 0),
      creditDays: input.creditDays,
    }, companyId, client);
  }
}

