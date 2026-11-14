import { AppModule } from '../../core/registry/module.interface';
import { appEventBus } from '../../core/events/event-bus';
import { SalesInvoicePostedEvent } from '../../core/events/events';
import { DoubleEntryEngine } from '../../core/accounting/engine';
import { getDatabase } from '../../core/database/db';
import { CreateJournalLineInput } from '../../core/accounting/types';
import { DEFAULT_COMPANY_ID } from '../../core/tenancy/constants';

export const salesModule: AppModule = {
  id: 'sales',
  name: 'Sales & Distribution',
  description: 'Order booking, van distribution, delivery invoicing, sub-ledger customer tracking, and perpetual inventory.',
  version: '1.1.0',
  icon: 'TrendingUp',
  dependencies: ['customers', 'inventory'],
  navItems: [
    { title: 'Order Booking', href: '/sales/order-booking', icon: 'ClipboardList' },
    { title: 'Route Load Sheet', href: '/dispatch/load-sheet', icon: 'Truck' },
    { title: 'Orders & Commercial Bills', href: '/sales', icon: 'FileText' },
    { title: 'Direct Van Sale', href: '/sales/direct-sale', icon: 'TrendingUp' },
    { title: 'Route Collections', href: '/sales/collections', icon: 'CreditCard' },
  ],
};

/**
 * Perpetual Inventory (Dual-Leg) Accounting Event Handler
 * Leg 1 (Revenue & Sub-Ledger AR): Dr. Accounts Receivable (entity_id = customer_id) / Cr. Sales Revenue
 * Leg 2 (Perpetual Inventory Cost): Dr. Cost of Goods Sold / Cr. Merchandise Inventory
 */
export function registerSalesEventListeners(): void {
  appEventBus.subscribe('SALES_INVOICE_POSTED', async (event: SalesInvoicePostedEvent) => {
    const db = getDatabase();
    const companyId = event.companyId || DEFAULT_COMPANY_ID;

    // Look up core GL accounts by standard code for this company
    const arAccount = db.prepare("SELECT id FROM chart_of_accounts WHERE code = '1030' AND company_id = ?").get(companyId) as { id: string } | undefined;
    const salesAccount = db.prepare("SELECT id FROM chart_of_accounts WHERE code = '4010' AND company_id = ?").get(companyId) as { id: string } | undefined;
    const taxAccount = db.prepare("SELECT id FROM chart_of_accounts WHERE code = '2020' AND company_id = ?").get(companyId) as { id: string } | undefined;
    const cogsAccount = db.prepare("SELECT id FROM chart_of_accounts WHERE code = '5010' AND company_id = ?").get(companyId) as { id: string } | undefined;
    const invAccount = db.prepare("SELECT id FROM chart_of_accounts WHERE code = '1040' AND company_id = ?").get(companyId) as { id: string } | undefined;

    if (!arAccount || !salesAccount) {
      throw new Error(`Core accounting accounts (1030 AR or 4010 Sales) not found in Chart of Accounts for company ${companyId}.`);
    }

    const lines: CreateJournalLineInput[] = [
      // ==========================================
      // LEG 1: REVENUE & SUB-LEDGER RECEIVABLE
      // ==========================================
      {
        accountId: arAccount.id,
        debit: event.grandTotal,
        credit: 0,
        entityId: event.customerId,       // Sub-ledger customer attribution
        entityType: 'CUSTOMER',
        memo: `Receivable from ${event.customerName} for ${event.invoiceNumber}`,
      },
      {
        accountId: salesAccount.id,
        debit: 0,
        credit: event.subtotal,
        memo: `Wholesale sales revenue for ${event.invoiceNumber}`,
      },
    ];

    if (event.tax > 0 && taxAccount) {
      lines.push({
        accountId: taxAccount.id,
        debit: 0,
        credit: event.tax,
        memo: `Output sales tax for ${event.invoiceNumber}`,
      });
    }

    // ==========================================
    // LEG 2: PERPETUAL INVENTORY ASSET RELIEF & COGS
    // ==========================================
    if (event.costOfGoodsSold > 0 && cogsAccount && invAccount) {
      lines.push(
        {
          accountId: cogsAccount.id,
          debit: event.costOfGoodsSold,
          credit: 0,
          memo: `Cost of goods sold (COGS) for ${event.invoiceNumber}`,
        },
        {
          accountId: invAccount.id,
          debit: 0,
          credit: event.costOfGoodsSold,
          memo: `Inventory stock asset relief at cost for ${event.invoiceNumber}`,
        }
      );
    }

    // Post strict compound double-entry GL entry
    DoubleEntryEngine.postEntry({
      companyId,
      entryDate: event.invoiceDate,
      description: `Sales Invoice ${event.invoiceNumber} - ${event.customerName} (Dual-Leg Perpetual Entry)`,
      sourceModule: 'sales',
      sourceDocumentId: event.invoiceId,
      lines,
      createdBy: 'Sales Module (Perpetual Inventory Engine)',
    });
  });
}

