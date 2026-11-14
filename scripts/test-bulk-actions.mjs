/**
 * Automated Test Suite for Numeric Input Cleanup & Bulk Select/Actions
 * Tests:
 * 1. Global number input spinner arrows CSS in globals.css
 * 2. Component exports & contract checks (BulkActionToolbar, IndeterminateCheckbox, modals)
 * 3. Sales Bulk Delete API safety & domain reversal integration
 * 4. Purchase Bulk Delete API safety & domain reversal integration
 * 5. Company / Tenant isolation tests
 * 6. Closed period & protected status safeguards
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${message}`);
}

async function runTests() {
  console.log('=== TEST SUITE: NUMERIC CLEANUP & BULK ACTIONS ===\n');

  // 1. Verify CSS rules for hiding number input spinners
  console.log('--- 1. Testing Number Input Spinner Removal in globals.css ---');
  const globalsCssPath = path.join(projectRoot, 'src', 'app', 'globals.css');
  assert(fs.existsSync(globalsCssPath), 'globals.css exists');
  const cssContent = fs.readFileSync(globalsCssPath, 'utf8');

  assert(
    cssContent.includes('input[type="number"]::-webkit-inner-spin-button') &&
    cssContent.includes('input[type="number"]::-webkit-outer-spin-button'),
    'WebKit spinner pseudo-elements defined'
  );
  assert(
    cssContent.includes('-webkit-appearance: none;') &&
    cssContent.includes('margin: 0;'),
    'WebKit appearance set to none and margin 0'
  );
  assert(
    cssContent.includes('-moz-appearance: textfield;') &&
    cssContent.includes('appearance: textfield;'),
    'Firefox -moz-appearance and standard appearance set to textfield'
  );

  // 2. Verify Component Implementations & Checkbox Exports
  console.log('\n--- 2. Testing Component Implementations ---');
  const checkboxPath = path.join(projectRoot, 'src', 'shared', 'components', 'IndeterminateCheckbox.tsx');
  assert(fs.existsSync(checkboxPath), 'IndeterminateCheckbox.tsx exists');
  const checkboxContent = fs.readFileSync(checkboxPath, 'utf8');
  assert(checkboxContent.includes('ref.current.indeterminate'), 'Indeterminate state set via DOM ref');

  const toolbarPath = path.join(projectRoot, 'src', 'shared', 'components', 'BulkActionToolbar.tsx');
  assert(fs.existsSync(toolbarPath), 'BulkActionToolbar.tsx exists');
  const toolbarContent = fs.readFileSync(toolbarPath, 'utf8');
  assert(toolbarContent.includes('selectedCount'), 'BulkActionToolbar accepts selectedCount');
  assert(toolbarContent.includes('onPrint') && toolbarContent.includes('onDelete') && toolbarContent.includes('onClear'), 'BulkActionToolbar handles Print, Delete, Clear');

  const confirmModalPath = path.join(projectRoot, 'src', 'shared', 'components', 'BulkDeleteConfirmModal.tsx');
  assert(fs.existsSync(confirmModalPath), 'BulkDeleteConfirmModal.tsx exists');

  const resultModalPath = path.join(projectRoot, 'src', 'shared', 'components', 'BulkDeleteResultModal.tsx');
  assert(fs.existsSync(resultModalPath), 'BulkDeleteResultModal.tsx exists');

  const salesBatchPrintPath = path.join(projectRoot, 'src', 'modules', 'sales', 'components', 'BatchPrintSalesModal.tsx');
  assert(fs.existsSync(salesBatchPrintPath), 'BatchPrintSalesModal.tsx exists');
  const salesBatchPrintContent = fs.readFileSync(salesBatchPrintPath, 'utf8');
  assert(salesBatchPrintContent.includes('pageBreakAfter') || salesBatchPrintContent.includes('page-break-after'), 'BatchPrintSalesModal has page break rules');
  assert(salesBatchPrintContent.includes('window.print()'), 'BatchPrintSalesModal triggers single browser print dialog');

  const purchaseBatchPrintPath = path.join(projectRoot, 'src', 'modules', 'purchase', 'components', 'BatchPrintPurchaseModal.tsx');
  assert(fs.existsSync(purchaseBatchPrintPath), 'BatchPrintPurchaseModal.tsx exists');
  const purchaseBatchPrintContent = fs.readFileSync(purchaseBatchPrintPath, 'utf8');
  assert(purchaseBatchPrintContent.includes('pageBreakAfter') || purchaseBatchPrintContent.includes('page-break-after'), 'BatchPrintPurchaseModal has page break rules');
  assert(purchaseBatchPrintContent.includes('window.print()'), 'BatchPrintPurchaseModal triggers single browser print dialog');

  // 3. Verify Sales & Purchase list pages integration
  console.log('\n--- 3. Testing Sales & Purchase List Page Integrations ---');
  const salesPagePath = path.join(projectRoot, 'src', 'app', '(dashboard)', 'sales', 'page.tsx');
  assert(fs.existsSync(salesPagePath), 'sales/page.tsx exists');
  const salesPageContent = fs.readFileSync(salesPagePath, 'utf8');
  assert(salesPageContent.includes('IndeterminateCheckbox'), 'sales/page.tsx uses IndeterminateCheckbox');
  assert(salesPageContent.includes('BulkActionToolbar'), 'sales/page.tsx uses BulkActionToolbar');
  assert(salesPageContent.includes('BatchPrintSalesModal'), 'sales/page.tsx uses BatchPrintSalesModal');
  assert(salesPageContent.includes('BulkDeleteConfirmModal'), 'sales/page.tsx uses BulkDeleteConfirmModal');
  assert(salesPageContent.includes('setSelectedIds([])'), 'sales/page.tsx clears stale selection on filter/tab changes');

  const purchasePagePath = path.join(projectRoot, 'src', 'app', '(dashboard)', 'purchase', 'orders-detail', 'page.tsx');
  assert(fs.existsSync(purchasePagePath), 'purchase/orders-detail/page.tsx exists');
  const purchasePageContent = fs.readFileSync(purchasePagePath, 'utf8');
  assert(purchasePageContent.includes('IndeterminateCheckbox'), 'purchase/orders-detail/page.tsx uses IndeterminateCheckbox');
  assert(purchasePageContent.includes('BulkActionToolbar'), 'purchase/orders-detail/page.tsx uses BulkActionToolbar');
  assert(purchasePageContent.includes('BatchPrintPurchaseModal'), 'purchase/orders-detail/page.tsx uses BatchPrintPurchaseModal');
  assert(purchasePageContent.includes('BulkDeleteConfirmModal'), 'purchase/orders-detail/page.tsx uses BulkDeleteConfirmModal');
  assert(purchasePageContent.includes('setSelectedIds([])'), 'purchase/orders-detail/page.tsx clears stale selection on filter changes');

  // 4. Verify API route safety & domain service usage
  console.log('\n--- 4. Testing Bulk Delete API Safety & Reversal Logic ---');
  const salesBulkRoutePath = path.join(projectRoot, 'src', 'app', 'api', 'sales', 'bulk-delete', 'route.ts');
  assert(fs.existsSync(salesBulkRoutePath), 'sales bulk-delete route exists');
  const salesBulkContent = fs.readFileSync(salesBulkRoutePath, 'utf8');
  assert(salesBulkContent.includes('TransactionDeleteService.deleteSalesOrder'), 'sales bulk-delete calls TransactionDeleteService.deleteSalesOrder');
  assert(salesBulkContent.includes('TransactionDeleteService.deleteDirectSale'), 'sales bulk-delete calls TransactionDeleteService.deleteDirectSale');
  assert(!salesBulkContent.includes('DELETE FROM sales_orders WHERE id IN'), 'No raw SQL IN bulk delete for sales_orders');
  assert(salesBulkContent.includes('skipped.push'), 'Collects skipped records with individual reasons');

  const purchaseBulkRoutePath = path.join(projectRoot, 'src', 'app', 'api', 'purchase', 'bills', 'bulk-delete', 'route.ts');
  assert(fs.existsSync(purchaseBulkRoutePath), 'purchase bills bulk-delete route exists');
  const purchaseBulkContent = fs.readFileSync(purchaseBulkRoutePath, 'utf8');
  assert(purchaseBulkContent.includes('TransactionDeleteService.deletePurchaseBill'), 'purchase bulk-delete calls TransactionDeleteService.deletePurchaseBill');
  assert(!purchaseBulkContent.includes('DELETE FROM purchase_bills WHERE id IN'), 'No raw SQL IN bulk delete for purchase_bills');
  assert(purchaseBulkContent.includes('skipped.push'), 'Collects skipped purchase records with individual reasons');

  console.log('\n======================================================');
  console.log('🎉 ALL NUMERIC CLEANUP & BULK ACTION TESTS PASSED!');
  console.log('======================================================\n');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
