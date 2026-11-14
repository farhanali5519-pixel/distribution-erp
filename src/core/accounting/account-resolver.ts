import { DatabaseSync } from 'node:sqlite';
import { getDatabase } from '@/core/database/db';
import { DEFAULT_COMPANY_ID } from '@/core/tenancy/constants';
import { DoubleEntryEngineError } from './engine';
import { AccountType, NormalBalance } from './types';

export interface ResolvedAccount {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  normal_balance: NormalBalance;
  is_active: number;
}

export interface ResolveAccountOptions {
  required?: boolean;
  purpose?: string;
  db?: DatabaseSync;
}

/**
 * Fail-Safe Account Resolution Layer
 * Resolves canonical system accounts safely across multi-tenant companies.
 * Returns clean, descriptive errors when a required account is missing.
 */
export class AccountResolver {
  /**
   * Resolves an account by one or more code aliases for a specific company.
   * If an array of codes is provided, they are evaluated in priority order.
   */
  public static resolveAccount(
    companyId: string = DEFAULT_COMPANY_ID,
    canonicalCodes: string | string[],
    options: ResolveAccountOptions = {}
  ): ResolvedAccount {
    const db = options.db || getDatabase();
    const cleanCompanyId = companyId?.trim() || DEFAULT_COMPANY_ID;
    const codes = Array.isArray(canonicalCodes) ? canonicalCodes : [canonicalCodes];
    const isRequired = options.required !== false;

    const stmt = db.prepare(`
      SELECT id, code, name, type, normal_balance, is_active
      FROM chart_of_accounts
      WHERE company_id = ? AND code = ?
      LIMIT 1
    `);

    for (const code of codes) {
      const row = stmt.get(cleanCompanyId, code) as ResolvedAccount | undefined;
      if (row && row.is_active === 1) {
        return row;
      }
    }

    if (isRequired) {
      const codeList = codes.join(' or ');
      const purposeText = options.purpose ? ` (${options.purpose})` : '';
      throw new DoubleEntryEngineError(
        `Required Chart of Accounts account ${codeList}${purposeText} missing or inactive for company ${cleanCompanyId}.`
      );
    }

    // Return empty dummy placeholder if optional (not required)
    return null as any;
  }

  /**
   * Safely tries to resolve an account without throwing if missing.
   */
  public static tryResolveAccount(
    companyId: string = DEFAULT_COMPANY_ID,
    canonicalCodes: string | string[],
    options: Omit<ResolveAccountOptions, 'required'> = {}
  ): ResolvedAccount | null {
    try {
      return this.resolveAccount(companyId, canonicalCodes, { ...options, required: false });
    } catch {
      return null;
    }
  }

  // =========================================================================
  // Core Operational Canonical Resolvers
  // =========================================================================

  /**
   * 1040 Merchandise Inventory Asset
   */
  public static getInventoryAccount(companyId?: string, options?: ResolveAccountOptions): ResolvedAccount {
    return this.resolveAccount(companyId, '1040', {
      purpose: 'Merchandise Inventory',
      ...options,
    });
  }

  /**
   * 2010 Accounts Payable Liability
   */
  public static getAccountsPayableAccount(companyId?: string, options?: ResolveAccountOptions): ResolvedAccount {
    return this.resolveAccount(companyId, '2010', {
      purpose: 'Accounts Payable',
      ...options,
    });
  }

  /**
   * 1030 Accounts Receivable Asset
   */
  public static getAccountsReceivableAccount(companyId?: string, options?: ResolveAccountOptions): ResolvedAccount {
    return this.resolveAccount(companyId, '1030', {
      purpose: 'Accounts Receivable',
      ...options,
    });
  }

  /**
   * 4010 Wholesale Sales Revenue (fallback to 4000 Sales Revenue)
   */
  public static getSalesRevenueAccount(companyId?: string, options?: ResolveAccountOptions): ResolvedAccount {
    return this.resolveAccount(companyId, ['4010', '4000'], {
      purpose: 'Sales Revenue',
      ...options,
    });
  }

  /**
   * 4030 Sales Returns & Allowances Contra-Revenue
   */
  public static getSalesReturnAccount(companyId?: string, options?: ResolveAccountOptions): ResolvedAccount {
    return this.resolveAccount(companyId, '4030', {
      purpose: 'Sales Returns & Allowances',
      ...options,
    });
  }

  /**
   * 5010 Cost of Goods Sold (fallback to 5000 Cost of Sales)
   */
  public static getCogsAccount(companyId?: string, options?: ResolveAccountOptions): ResolvedAccount {
    return this.resolveAccount(companyId, ['5010', '5000'], {
      purpose: 'Cost of Goods Sold (COGS)',
      ...options,
    });
  }

  /**
   * 1010 Cash in Hand (fallback to 1000 Cash & Cash Equivalents)
   */
  public static getCashAccount(companyId?: string, options?: ResolveAccountOptions): ResolvedAccount {
    return this.resolveAccount(companyId, ['1010', '1000'], {
      purpose: 'Cash in Hand',
      ...options,
    });
  }

  /**
   * 1020 Main Bank Account
   */
  public static getMainBankAccount(companyId?: string, options?: ResolveAccountOptions): ResolvedAccount {
    return this.resolveAccount(companyId, '1020', {
      purpose: 'Main Bank Account',
      ...options,
    });
  }

  /**
   * 5040 Inward Freight Expense (fallback to 6040 Carriage Expense)
   */
  public static getInwardFreightAccount(companyId?: string, options?: ResolveAccountOptions): ResolvedAccount {
    return this.resolveAccount(companyId, ['5040', '6040'], {
      purpose: 'Inward Freight Expense',
      ...options,
    });
  }

  /**
   * 2020 Sales Tax / Output Tax Payable (fallback to 2030)
   */
  public static getSalesTaxAccount(companyId?: string, options?: ResolveAccountOptions): ResolvedAccount {
    return this.resolveAccount(companyId, ['2020', '2030'], {
      purpose: 'Sales Tax / Output Tax Payable',
      ...options,
    });
  }

  /**
   * 5060 Sales Promotion & Scheme Expense (fallback to 5020)
   */
  public static getPromotionSchemeAccount(companyId?: string, options?: ResolveAccountOptions): ResolvedAccount {
    return this.resolveAccount(companyId, ['5060', '5020'], {
      purpose: 'Sales Promotion & Scheme Expense',
      ...options,
    });
  }

  /**
   * 5070 Damaged Goods & Expiry Loss
   */
  public static getDamagedGoodsLossAccount(companyId?: string, options?: ResolveAccountOptions): ResolvedAccount {
    return this.resolveAccount(companyId, '5070', {
      purpose: 'Damaged Goods & Expiry Loss',
      ...options,
    });
  }
}
