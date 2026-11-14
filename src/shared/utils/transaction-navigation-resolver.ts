/**
 * Transaction Navigation Resolver
 *
 * Centralized resolution service that determines clickability, record type,
 * and navigation destination for any user-facing business reference or ledger voucher.
 *
 * Client & Server safe.
 */

import { isUuid } from './reference';

export type TransactionType =
  | 'purchase_bill'
  | 'sales_order'
  | 'sales_invoice'
  | 'payment_received'
  | 'payment_made'
  | 'sales_return'
  | 'purchase_return'
  | 'expense'
  | 'stock_adjustment'
  | 'journal_entry';

export interface ResolveTransactionInput {
  businessReference?: string | null;
  sourceModule?: string | null;
  sourceDocumentId?: string | null;
  journalEntryId?: string | null;
  entryNumber?: string | null;
  transactionType?: string | null;
  sourceDocumentType?: string | null;
}

export interface ResolvedTransactionTarget {
  isClickable: boolean;
  type?: TransactionType;
  id?: string | null;
  reference?: string;
  mode: 'modal' | 'page' | 'none';
  label: string;
  route?: string;
}

/**
 * Checks whether a displayed reference string is a dummy, empty, or non-clickable marker
 */
export function isNonClickableReference(val: string | null | undefined): boolean {
  if (!val) return true;
  const trimmed = val.trim();
  if (
    trimmed === '' ||
    trimmed === '—' ||
    trimmed === '-' ||
    trimmed === '--' ||
    trimmed === 'OPENING' ||
    trimmed.toUpperCase() === 'N/A' ||
    trimmed.toUpperCase() === 'NONE' ||
    trimmed.startsWith('REF-') // Technical fallback hash without real source
  ) {
    return true;
  }
  return false;
}

/**
 * Central Transaction Navigation Resolver
 */
export function resolveTransactionTarget(input: ResolveTransactionInput): ResolvedTransactionTarget {
  const ref = input.businessReference?.trim() || '';
  const entryNum = input.entryNumber?.trim() || '';
  const mod = (input.sourceModule || '').toLowerCase().trim();
  const txType = (input.transactionType || '').toLowerCase().trim();
  const docType = (input.sourceDocumentType || '').toUpperCase().trim();
  const docId = input.sourceDocumentId && isUuid(input.sourceDocumentId) ? input.sourceDocumentId.trim() : null;
  const jeId = input.journalEntryId && isUuid(input.journalEntryId) ? input.journalEntryId.trim() : null;

  // 1. If explicit non-clickable indicator
  if (isNonClickableReference(ref) && isNonClickableReference(entryNum) && !docId && !jeId) {
    return {
      isClickable: false,
      mode: 'none',
      label: 'Non-clickable reference',
    };
  }

  // 2. Identify transaction type by prefix, module, and document type

  // 2A. Purchase Bill
  if (
    ref.startsWith('BILL-') ||
    docType === 'PURCHASE_BILL' ||
    (mod === 'purchase' && !txType.includes('return') && !docType.includes('RETURN')) ||
    txType === 'purchase bill'
  ) {
    return {
      isClickable: true,
      type: 'purchase_bill',
      id: docId,
      reference: ref.startsWith('BILL-') ? ref : undefined,
      mode: 'modal',
      label: 'Purchase Bill',
      route: docId ? `/purchase/orders-detail?billId=${docId}` : '/purchase/orders-detail',
    };
  }

  // 2B. Sales Order
  if (
    ref.startsWith('ORD-') ||
    docType === 'SALES_ORDER' ||
    txType === 'sale order' ||
    (mod === 'sales' && (txType.includes('order') || ref.startsWith('ORD-')))
  ) {
    return {
      isClickable: true,
      type: 'sales_order',
      id: docId,
      reference: ref.startsWith('ORD-') ? ref : undefined,
      mode: 'modal',
      label: 'Sale Order',
      route: docId ? `/sales?orderId=${docId}` : '/sales',
    };
  }

  // 2C. Sales Invoice / Commercial Bill / Direct Van Sale
  if (
    ref.startsWith('INV-') ||
    docType === 'SALES_INVOICE' ||
    mod === 'direct_sale' ||
    mod === 'direct_sales' ||
    txType === 'direct van sale' ||
    txType === 'spot cash' ||
    (mod === 'sales' && !txType.includes('return') && !ref.startsWith('ORD-'))
  ) {
    return {
      isClickable: true,
      type: 'sales_invoice',
      id: docId,
      reference: ref.startsWith('INV-') ? ref : undefined,
      mode: 'modal',
      label: 'Sales Invoice',
      route: docId ? `/sales?invoiceId=${docId}` : '/sales',
    };
  }

  // 2D. Payment Received (Customer Receipt / Collection / Recovery)
  if (
    ref.startsWith('PR-') ||
    ref.startsWith('PAY-') ||
    ref.startsWith('CR-') ||
    txType === 'payment received' ||
    txType === 'cash recovery' ||
    txType === 'customer receipt' ||
    (mod === 'payments' && (txType.includes('received') || txType.includes('recovery') || txType.includes('customer')))
  ) {
    return {
      isClickable: true,
      type: 'payment_received',
      id: docId,
      reference: ref.startsWith('PR-') || ref.startsWith('PAY-') || ref.startsWith('CR-') ? ref : undefined,
      mode: 'modal',
      label: 'Payment Received',
      route: docId ? `/payments/received?id=${docId}` : '/payments/received',
    };
  }

  // 2E. Payment Made (Vendor Payment / Voucher)
  if (
    ref.startsWith('PV-') ||
    txType === 'payment made' ||
    txType === 'vendor payment' ||
    (mod === 'payments' && (txType.includes('made') || txType.includes('vendor') || ref.startsWith('PV-')))
  ) {
    return {
      isClickable: true,
      type: 'payment_made',
      id: docId,
      reference: ref.startsWith('PV-') ? ref : undefined,
      mode: 'modal',
      label: 'Vendor Payment',
      route: docId ? `/payments/made?id=${docId}` : '/payments/made',
    };
  }

  // 2F. Sales Return (Credit Note)
  if (
    ref.startsWith('SR-') ||
    docType === 'SALES_RETURN' ||
    txType === 'sales return' ||
    (mod === 'returns' && (txType.includes('sales') || ref.startsWith('SR-')))
  ) {
    return {
      isClickable: true,
      type: 'sales_return',
      id: docId,
      reference: ref.startsWith('SR-') ? ref : undefined,
      mode: 'modal',
      label: 'Sales Return (Credit Note)',
      route: docId ? `/sales/returns?returnId=${docId}` : '/sales/returns',
    };
  }

  // 2G. Purchase Return (Debit Note)
  if (
    ref.startsWith('PRN-') ||
    docType === 'PURCHASE_RETURN' ||
    txType === 'purchase return' ||
    (mod === 'returns' && (txType.includes('purchase') || ref.startsWith('PRN-')))
  ) {
    return {
      isClickable: true,
      type: 'purchase_return',
      id: docId,
      reference: ref.startsWith('PRN-') ? ref : undefined,
      mode: 'modal',
      label: 'Purchase Return (Debit Note)',
      route: docId ? `/purchase/returns?returnId=${docId}` : '/purchase/returns',
    };
  }

  // 2H. Daily Expenses
  if (
    ref.startsWith('EXP-') ||
    mod === 'expenses' ||
    mod === 'expense' ||
    txType === 'expense voucher' ||
    txType === 'expense_payment'
  ) {
    return {
      isClickable: true,
      type: 'expense',
      id: docId,
      reference: ref.startsWith('EXP-') ? ref : undefined,
      mode: 'modal',
      label: 'Expense Voucher',
      route: docId ? `/expenses?expenseId=${docId}` : '/expenses',
    };
  }

  // 2I. Stock Adjustment
  if (
    ref.startsWith('ADJ-') ||
    docType === 'STOCK_ADJUSTMENT' ||
    mod === 'stock_adjustment' ||
    txType.includes('adjustment')
  ) {
    return {
      isClickable: true,
      type: 'stock_adjustment',
      id: docId,
      reference: ref.startsWith('ADJ-') ? ref : undefined,
      mode: 'modal',
      label: 'Stock Adjustment',
      route: docId ? `/inventory/audit-ledger?adjId=${docId}` : '/inventory/audit-ledger',
    };
  }

  // 2J. Journal Entry / Voucher (JE-..., JV-...)
  if (
    ref.startsWith('JE-') ||
    ref.startsWith('JV-') ||
    entryNum.startsWith('JE-') ||
    entryNum.startsWith('JV-') ||
    mod === 'journal' ||
    mod === 'manual' ||
    mod === 'reversal' ||
    txType === 'journal reversal' ||
    txType === 'general ledger entry' ||
    jeId
  ) {
    return {
      isClickable: true,
      type: 'journal_entry',
      id: jeId || docId,
      reference: (ref.startsWith('JE-') || ref.startsWith('JV-')) ? ref : (entryNum.startsWith('JE-') ? entryNum : undefined),
      mode: 'modal',
      label: 'Journal Entry',
      route: jeId || docId ? `/accounting/journal?entry=${jeId || docId}` : '/accounting/journal',
    };
  }

  // 3. Fallback: if we have a valid sourceDocumentId or journalEntryId, it is clickable
  if (docId || jeId) {
    return {
      isClickable: true,
      type: 'journal_entry',
      id: jeId || docId,
      reference: ref || entryNum || undefined,
      mode: 'modal',
      label: 'Transaction Document',
      route: `/accounting/journal?entry=${jeId || docId}`,
    };
  }

  // 4. Fallback for recognized document pattern in reference string
  if (ref && /^[A-Z]{2,4}-\d{4}/i.test(ref)) {
    return {
      isClickable: true,
      reference: ref,
      mode: 'modal',
      label: 'Transaction Document',
    };
  }

  return {
    isClickable: false,
    mode: 'none',
    label: 'Unrecognized reference',
  };
}
