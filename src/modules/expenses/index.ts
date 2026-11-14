import { AppModule } from '../../core/registry/module.interface';
import { appEventBus } from '../../core/events/event-bus';
import { ExpenseRecordedEvent } from '../../core/events/events';
import { DoubleEntryEngine } from '../../core/accounting/engine';

export * from './service';

export const expensesModule: AppModule = {
  id: 'expenses',
  name: 'Expense Management',
  description: 'Distribution van fuel, vehicle maintenance, staff tea, rent, and utility vouchers.',
  version: '1.2.0',
  icon: 'Receipt',
  dependencies: [],
  navItems: [
    { title: 'Daily Expenses', href: '/expenses', icon: 'Receipt' },
  ],
};

export function registerExpenseEventListeners(): void {
  appEventBus.subscribe('EXPENSE_RECORDED', async (event: ExpenseRecordedEvent) => {
    // Post strict double-entry GL entry: Dr Expense, Cr Cash/Bank
    DoubleEntryEngine.postEntry({
      entryDate: event.date,
      description: `Expense Voucher ${event.voucherNumber} - ${event.description}`,
      sourceModule: 'expenses',
      sourceDocumentId: event.expenseId,
      lines: [
        {
          accountId: event.expenseAccountId,
          debit: event.amount,
          credit: 0,
          memo: event.description,
        },
        {
          accountId: event.paymentAccountId,
          debit: 0,
          credit: event.amount,
          memo: `Payment for ${event.voucherNumber}`,
        },
      ],
      createdBy: 'Expenses Module',
    });
  });
}
