export interface SalesInvoicePostedEvent {
  companyId?: string;
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  invoiceDate: string;
  subtotal: number;
  tax: number;
  discount: number;
  grandTotal: number;
  costOfGoodsSold: number;
}

export interface ExpenseRecordedEvent {
  companyId?: string;
  expenseId: string;
  voucherNumber: string;
  expenseAccountId: string;
  paymentAccountId: string; // Cash or Bank
  amount: number;
  date: string;
  description: string;
}

export type DomainEvent =
  | { type: 'SALES_INVOICE_POSTED'; payload: SalesInvoicePostedEvent }
  | { type: 'EXPENSE_RECORDED'; payload: ExpenseRecordedEvent };

