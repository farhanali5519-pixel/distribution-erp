/**
 * Business Reference Resolver Service
 *
 * Centralized, high-performance resolver that translates internal database UUIDs
 * (source_document_id, reversal_of_id, etc.) into human-readable business document references
 * (e.g., BILL-202610-0001, ORD-2026-51614, INV-2026-0001, PR-202610-0001, SR-202610-0001,
 * PV-202610-0001, EXP-202610-0001, ADJ-2026-3194, JE-202610-0003).
 *
 * Guarantees:
 * 1. ZERO raw UUID exposure in user-facing tables, modals, prints, and CSV exports.
 * 2. High performance via batch resolution (no N+1 database queries).
 * 3. Handles recursive reversal resolution (e.g. Reversal -> Original Journal -> Source Document).
 * 4. Fallback hierarchy: Source Document # -> Original Reversal Document # -> Extracted Narration # -> Journal Entry # -> Safe Short Reference.
 */

import { getDatabase } from '@/core/database/db';
import { DEFAULT_COMPANY_ID } from '@/core/tenancy/constants';
import type { IDatabaseClient, ITransactionClient } from '@/core/database/types';

export interface ReferenceResolveItem {
  id?: string;
  journalId?: string;
  entryNumber?: string;
  sourceModule?: string | null;
  sourceDocumentId?: string | null;
  reversalOfId?: string | null;
  description?: string | null;
  memo?: string | null;
  transactionType?: string | null;
}

export interface ResolvedReferenceOutput {
  businessReference: string;
  referenceDisplay: string;
  sourceDocumentId: string | null;
  entryNumber?: string;
}

import {
  isUuid,
  DOC_PATTERN_REGEX,
  formatBusinessReference,
} from '@/shared/utils/reference';

export { isUuid, DOC_PATTERN_REGEX, formatBusinessReference };

export class BusinessReferenceResolver {
  /**
   * Synchronous Batch Resolver for SQLite / Local Services
   * Resolves an array of ledger/journal items to human-readable business document references.
   * Performs 1 query per active source module rather than 1 per row (avoids N+1 query penalty).
   */
  public static batchResolveSync<T extends ReferenceResolveItem>(
    items: T[],
    companyId: string = DEFAULT_COMPANY_ID,
    dbOverride?: any
  ): (T & ResolvedReferenceOutput)[] {
    if (!items || items.length === 0) return [];

    const db = dbOverride || getDatabase();
    const cleanCompanyId = companyId || DEFAULT_COMPANY_ID;

    // Map: sourceDocumentId (or composite key) -> resolved business reference
    const resolvedMap = new Map<string, string>();

    // 1. First Pass: Identify which sourceDocumentIds need DB lookup
    const purchaseIds = new Set<string>();
    const salesIds = new Set<string>();
    const paymentIds = new Set<string>();
    const returnIds = new Set<string>();
    const expenseIds = new Set<string>();
    const inventoryIds = new Set<string>();
    const bankingIds = new Set<string>();
    const reversalIds = new Set<string>();
    const fallbackLookupIds = new Set<string>();

    for (const it of items) {
      const docId = it.sourceDocumentId?.trim();
      const mod = (it.sourceModule || '').toLowerCase().trim();
      const revOf = it.reversalOfId?.trim();

      // Check if it's a reversal
      if (mod === 'reversal' || revOf) {
        if (docId && isUuid(docId)) reversalIds.add(docId);
        if (revOf && isUuid(revOf)) reversalIds.add(revOf);
        continue;
      }

      if (!docId) continue;

      // If already a non-UUID human readable reference, store directly
      if (!isUuid(docId)) {
        resolvedMap.set(docId, docId);
        continue;
      }

      // Group UUIDs by module for targeted batch queries
      if (mod === 'purchase') {
        purchaseIds.add(docId);
      } else if (mod === 'sales' || mod === 'direct_sales' || mod === 'direct_sale') {
        salesIds.add(docId);
      } else if (mod === 'payments' || mod === 'customer_payment' || mod === 'vendor_payment') {
        paymentIds.add(docId);
      } else if (mod === 'returns') {
        returnIds.add(docId);
      } else if (mod === 'expenses' || mod === 'expense') {
        expenseIds.add(docId);
      } else if (mod === 'inventory' || mod === 'stock_adjustment') {
        inventoryIds.add(docId);
      } else if (mod === 'banking') {
        bankingIds.add(docId);
      } else {
        fallbackLookupIds.add(docId);
      }
    }

    // 2. Resolve Reversals (Step A): Query original journal entries
    const reversalOriginalMap = new Map<string, { id: string; entry_number: string; source_module: string; source_document_id: string; description: string }>();
    if (reversalIds.size > 0) {
      const idsArr = Array.from(reversalIds);
      this.chunkQuerySync(idsArr, (chunk) => {
        const placeholders = chunk.map(() => '?').join(',');
        const rows = db.prepare(`
          SELECT id, entry_number, source_module, source_document_id, description
          FROM journal_entries
          WHERE id IN (${placeholders}) AND company_id = ?
        `).all(...chunk, cleanCompanyId) as any[];

        for (const r of rows) {
          reversalOriginalMap.set(r.id, r);
          // If the original journal entry has a source document, queue it for module resolution
          if (r.source_document_id && isUuid(r.source_document_id)) {
            const origMod = (r.source_module || '').toLowerCase();
            if (origMod === 'purchase') purchaseIds.add(r.source_document_id);
            else if (origMod === 'sales' || origMod === 'direct_sales') salesIds.add(r.source_document_id);
            else if (origMod === 'payments') paymentIds.add(r.source_document_id);
            else if (origMod === 'returns') returnIds.add(r.source_document_id);
            else if (origMod === 'expenses') expenseIds.add(r.source_document_id);
            else if (origMod === 'inventory') inventoryIds.add(r.source_document_id);
            else fallbackLookupIds.add(r.source_document_id);
          }
        }
      });
    }

    // 3. Batch Query: Purchase Bills (purchase_bills.bill_number)
    if (purchaseIds.size > 0) {
      this.chunkQuerySync(Array.from(purchaseIds), (chunk) => {
        const placeholders = chunk.map(() => '?').join(',');
        const rows = db.prepare(`
          SELECT id, bill_number FROM purchase_bills WHERE id IN (${placeholders}) AND company_id = ?
        `).all(...chunk, cleanCompanyId) as any[];
        for (const r of rows) {
          if (r.bill_number) resolvedMap.set(r.id, r.bill_number);
        }
      });
    }

    // 4. Batch Query: Sales Orders & Invoices (sales_orders.order_number, sales_invoices.invoice_number)
    if (salesIds.size > 0) {
      this.chunkQuerySync(Array.from(salesIds), (chunk) => {
        const placeholders = chunk.map(() => '?').join(',');
        const orderRows = db.prepare(`
          SELECT id, order_number FROM sales_orders WHERE id IN (${placeholders}) AND company_id = ?
        `).all(...chunk, cleanCompanyId) as any[];
        for (const r of orderRows) {
          if (r.order_number) resolvedMap.set(r.id, r.order_number);
        }

        const invRows = db.prepare(`
          SELECT id, invoice_number FROM sales_invoices WHERE id IN (${placeholders}) AND company_id = ?
        `).all(...chunk, cleanCompanyId) as any[];
        for (const r of invRows) {
          if (r.invoice_number && !resolvedMap.has(r.id)) resolvedMap.set(r.id, r.invoice_number);
        }
      });
    }

    // 5. Batch Query: Payments (customer_payments.payment_number, vendor_payments.payment_number)
    if (paymentIds.size > 0) {
      this.chunkQuerySync(Array.from(paymentIds), (chunk) => {
        const placeholders = chunk.map(() => '?').join(',');
        const cpRows = db.prepare(`
          SELECT id, payment_number FROM customer_payments WHERE id IN (${placeholders}) AND company_id = ?
        `).all(...chunk, cleanCompanyId) as any[];
        for (const r of cpRows) {
          if (r.payment_number) resolvedMap.set(r.id, r.payment_number);
        }

        const vpRows = db.prepare(`
          SELECT id, payment_number FROM vendor_payments WHERE id IN (${placeholders}) AND company_id = ?
        `).all(...chunk, cleanCompanyId) as any[];
        for (const r of vpRows) {
          if (r.payment_number && !resolvedMap.has(r.id)) resolvedMap.set(r.id, r.payment_number);
        }
      });
    }

    // 6. Batch Query: Returns (sales_returns.return_number, purchase_returns.return_number)
    if (returnIds.size > 0) {
      this.chunkQuerySync(Array.from(returnIds), (chunk) => {
        const placeholders = chunk.map(() => '?').join(',');
        const srRows = db.prepare(`
          SELECT id, return_number FROM sales_returns WHERE id IN (${placeholders}) AND company_id = ?
        `).all(...chunk, cleanCompanyId) as any[];
        for (const r of srRows) {
          if (r.return_number) resolvedMap.set(r.id, r.return_number);
        }

        const prRows = db.prepare(`
          SELECT id, return_number FROM purchase_returns WHERE id IN (${placeholders}) AND company_id = ?
        `).all(...chunk, cleanCompanyId) as any[];
        for (const r of prRows) {
          if (r.return_number && !resolvedMap.has(r.id)) resolvedMap.set(r.id, r.return_number);
        }
      });
    }

    // 7. Batch Query: Expenses (expenses.voucher_number)
    if (expenseIds.size > 0) {
      this.chunkQuerySync(Array.from(expenseIds), (chunk) => {
        const placeholders = chunk.map(() => '?').join(',');
        const expRows = db.prepare(`
          SELECT id, voucher_number FROM expenses WHERE id IN (${placeholders}) AND company_id = ?
        `).all(...chunk, cleanCompanyId) as any[];
        for (const r of expRows) {
          if (r.voucher_number) resolvedMap.set(r.id, r.voucher_number);
        }
      });
    }

    // 8. Batch Query: Inventory Adjustments & Movements (stock_adjustments, inventory_movements)
    if (inventoryIds.size > 0) {
      this.chunkQuerySync(Array.from(inventoryIds), (chunk) => {
        const placeholders = chunk.map(() => '?').join(',');
        const adjRows = db.prepare(`
          SELECT id, adjustment_number FROM stock_adjustments WHERE id IN (${placeholders}) AND company_id = ?
        `).all(...chunk, cleanCompanyId) as any[];
        for (const r of adjRows) {
          if (r.adjustment_number) resolvedMap.set(r.id, r.adjustment_number);
        }

        const movRows = db.prepare(`
          SELECT id, movement_number, document_number FROM inventory_movements WHERE id IN (${placeholders}) AND company_id = ?
        `).all(...chunk, cleanCompanyId) as any[];
        for (const r of movRows) {
          if (!resolvedMap.has(r.id)) {
            resolvedMap.set(r.id, r.document_number || r.movement_number);
          }
        }
      });
    }

    // 9. Batch Query: Bank Accounts (bank_accounts)
    if (bankingIds.size > 0) {
      this.chunkQuerySync(Array.from(bankingIds), (chunk) => {
        const placeholders = chunk.map(() => '?').join(',');
        const bankRows = db.prepare(`
          SELECT id, bank_name, account_number, account_title FROM bank_accounts WHERE id IN (${placeholders}) AND company_id = ?
        `).all(...chunk, cleanCompanyId) as any[];
        for (const r of bankRows) {
          const display = r.account_number ? `${r.bank_name || 'Bank'} (${r.account_number})` : r.bank_name || r.account_title;
          if (display) resolvedMap.set(r.id, display);
        }
      });
    }

    // 10. Second Pass: Link Reversals to their resolved original source documents
    for (const [revId, orig] of reversalOriginalMap.entries()) {
      if (orig.source_document_id && resolvedMap.has(orig.source_document_id)) {
        resolvedMap.set(revId, resolvedMap.get(orig.source_document_id)!);
      } else if (orig.entry_number) {
        resolvedMap.set(revId, orig.entry_number);
      }
    }

    // 11. Final Assembly: Map each input item to its canonical referenceDisplay
    return items.map((it) => {
      let finalRef: string | null = null;
      const docId = it.sourceDocumentId?.trim();
      const revOf = it.reversalOfId?.trim();
      const mod = (it.sourceModule || '').toLowerCase().trim();

      // Check resolved map by sourceDocumentId or reversalOfId
      if (docId && resolvedMap.has(docId)) {
        finalRef = resolvedMap.get(docId)!;
      } else if (revOf && resolvedMap.has(revOf)) {
        finalRef = resolvedMap.get(revOf)!;
      }

      // If still unresolved, check description for embedded document pattern
      if (!finalRef && it.description) {
        const match = it.description.match(DOC_PATTERN_REGEX);
        if (match && match[1]) {
          finalRef = match[1].toUpperCase();
        }
      }

      // If still unresolved, fallback to entryNumber
      if (!finalRef && it.entryNumber && !isUuid(it.entryNumber)) {
        finalRef = it.entryNumber;
      }

      // If docId is already non-UUID, use it
      if (!finalRef && docId && !isUuid(docId)) {
        finalRef = docId;
      }

      // Absolute last resort: never expose raw UUID
      if (!finalRef) {
        finalRef = formatBusinessReference(docId || revOf, it.entryNumber, it.description);
      }

      return {
        ...it,
        businessReference: finalRef,
        referenceDisplay: finalRef,
        sourceDocumentId: it.sourceDocumentId || null,
      };
    });
  }

  /**
   * Helper to partition large arrays into SQLite parameter-safe chunks (max 500 per query)
   */
  private static chunkQuerySync(ids: string[], execute: (chunk: string[]) => void, chunkSize: number = 500) {
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      if (chunk.length > 0) {
        execute(chunk);
      }
    }
  }
}
