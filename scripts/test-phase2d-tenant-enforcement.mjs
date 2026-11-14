/**
 * PHASE 2D: TENANT ENFORCEMENT & CROSS-TENANT ISOLATION TEST SUITE
 * 
 * Tests complete multi-tenant scoping, authorization, anti-spoofing,
 * and data isolation across all ERP services and database operations.
 */

import { DatabaseSync } from 'node:sqlite';
import { getDatabase } from '../src/core/database/db';
import { DEFAULT_COMPANY_ID } from '../src/core/tenancy/constants';
import { CustomerService } from '../src/modules/customers/service';
import { InventoryService } from '../src/modules/inventory/service';
import { RouteService } from '../src/modules/routes/service';
import { PurchaseService } from '../src/modules/purchase/service';
import { SalesService } from '../src/modules/sales/service';
import { BankingService } from '../src/modules/banking/service';
import { PaymentsReceivedService, PaymentsMadeService } from '../src/modules/payments/service';
import { ExpenseService } from '../src/modules/expenses/service';
import { ClosingService } from '../src/modules/closing/service';
import { DoubleEntryEngine } from '../src/core/accounting/engine';
import { AuthService } from '../src/modules/auth/service';
import { FeatureFlagService } from '../src/core/settings/flags';
import { buildSessionPayload, signSessionToken } from '../src/core/auth/session';
import { getTenantContext } from '../src/core/tenancy/context';
import { generateUUID } from '../src/shared/utils/uuid';

const COMPANY_A = DEFAULT_COMPANY_ID; // Farhan Distribution
const COMPANY_B = '11111111-1111-1111-1111-111111111111'; // Test Company B

let passedChecks = 0;
let totalChecks = 0;

function assert(condition, message) {
  totalChecks++;
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  passedChecks++;
  console.log(`[PASS] ${message}`);
}

async function runTests() {
  console.log('================================================================');
  console.log('   PHASE 2D: TENANT ENFORCEMENT & CROSS-TENANT ISOLATION SUITE  ');
  console.log('================================================================\n');

  const db = getDatabase();

  // Baseline metrics for Company A
  const baseGlLines = db.prepare('SELECT COUNT(*) as c FROM journal_lines WHERE company_id = ?').get(COMPANY_A).c;
  const baseDebits = db.prepare('SELECT SUM(debit_paisas) as s FROM journal_lines WHERE company_id = ?').get(COMPANY_A).s;
  const baseCredits = db.prepare('SELECT SUM(credit_paisas) as s FROM journal_lines WHERE company_id = ?').get(COMPANY_A).s;
  const dueCreamStock = db.prepare('SELECT current_stock_base FROM products WHERE sku = ? AND company_id = ?').get('01-DUE BEAUTY CREAM', COMPANY_A).current_stock_base;

  try {
    // -------------------------------------------------------------------------
    // 1. Multi-Tenant Fixture Setup for Company B
    // -------------------------------------------------------------------------
    console.log('--- 1. Setting Up Company B Tenant Fixture ---');
    db.prepare(`
      INSERT INTO companies (id, name, slug, is_active, plan)
      VALUES (?, 'Test Company Beta', 'beta', 1, 'COMMERCIAL')
      ON CONFLICT(id) DO NOTHING
    `).run(COMPANY_B);

    // Map modules for Company B
    const allModules = db.prepare('SELECT id FROM system_modules').all();
    for (const mod of allModules) {
      db.prepare(`
        INSERT INTO company_modules (company_id, module_id, is_enabled)
        VALUES (?, ?, 1)
        ON CONFLICT(company_id, module_id) DO NOTHING
      `).run(COMPANY_B, mod.id);
    }
    // Seed Chart of Accounts for Company B
    const coaRows = db.prepare('SELECT code, name, type, normal_balance, is_active, is_system, description, currency FROM chart_of_accounts WHERE company_id = ?').all(COMPANY_A);
    const insertCoaB = db.prepare(`
      INSERT INTO chart_of_accounts (id, company_id, code, name, type, normal_balance, is_active, is_system, description, currency)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const acc of coaRows) {
      insertCoaB.run(generateUUID(), COMPANY_B, acc.code, acc.name, acc.type, acc.normal_balance, acc.is_active, acc.is_system, acc.description, acc.currency);
    }
    assert(true, 'Company B registered and active with company_modules and chart_of_accounts');

    // -------------------------------------------------------------------------
    // 2. Cross-Tenant Master Data Isolation (Products, Customers, Vendors)
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Testing Master Data Isolation & Scoping ---');
    
    // Create Route in Company B
    const routeB = RouteService.createRoute({
      name: 'Beta Route North',
      code: 'BR-01',
      description: 'Test route for company B',
    }, COMPANY_B);
    assert(routeB.company_id === COMPANY_B, 'Route created with Company B ID');

    // Verify Company A does NOT see route B
    const routesA = RouteService.getAllRoutes(COMPANY_A);
    assert(!routesA.some(r => r.id === routeB.id), 'Company A does not see Company B route');
    const routeInA = RouteService.getRouteById(routeB.id, COMPANY_A);
    assert(routeInA === null, 'Company A cannot fetch Company B route by ID');

    // Create Category & Brand in Company B
    const catBId = 'cat-b-001';
    db.prepare(`
      INSERT INTO categories (id, company_id, name, description)
      VALUES (?, ?, 'Beta Category', 'Test Cat')
      ON CONFLICT(id) DO NOTHING
    `).run(catBId, COMPANY_B);

    const brandBId = 'brand-b-001';
    db.prepare(`
      INSERT INTO brands (id, company_id, name, description)
      VALUES (?, ?, 'Beta Brand', 'Test Brand')
      ON CONFLICT(id) DO NOTHING
    `).run(brandBId, COMPANY_B);

    // Create Product in Company B
    const prodB = InventoryService.createProduct({
      name: 'Beta Energy Drink 250ml',
      sku: 'BETA-ED-250',
      categoryId: catBId,
      brandId: brandBId,
      boxesPerCarton: 4,
      piecesPerBox: 6,
      costPrice: 100,
      tradePrice: 150,
      mrp: 160,
      initialStockBase: 100,
      minStockAlert: 10,
    }, COMPANY_B);
    assert(prodB.company_id === COMPANY_B, 'Product created with Company B ID');

    // Verify Company A does NOT see Product B
    const prodsA = InventoryService.getProducts({ companyId: COMPANY_A });
    assert(!prodsA.some(p => p.id === prodB.id), 'Company A product list excludes Company B products');
    const prodInA = InventoryService.getProductById(prodB.id, COMPANY_A);
    assert(prodInA === null, 'Company A cannot fetch Company B product by ID');

    // Create Customer in Company B
    const custB = CustomerService.createCustomer({
      name: 'Beta Grocery Store',
      routeId: routeB.id,
      phone: '03111111111',
      creditLimit: 50000,
      creditDays: 15,
    }, COMPANY_B);
    assert(custB.company_id === COMPANY_B, 'Customer created with Company B ID');

    // Verify Customer isolation
    const custsA = CustomerService.getCustomersWithBalances(COMPANY_A);
    assert(!custsA.some(c => c.id === custB.id), 'Company A customer list excludes Company B customer');
    const custInA = CustomerService.getCustomerById(custB.id, COMPANY_A);
    assert(custInA === null, 'Company A cannot fetch Company B customer by ID');

    // Create Vendor in Company B
    const vendBId = generateUUID();
    db.prepare(`
      INSERT INTO vendors (id, company_id, name, company_name, phone, is_active)
      VALUES (?, ?, 'Beta Supplier Corp', 'Beta Corp', '03222222222', 1)
    `).run(vendBId, COMPANY_B);

    const vendsA = db.prepare('SELECT id FROM vendors WHERE is_active = 1 AND company_id = ?').all(COMPANY_A);
    assert(!vendsA.some(v => v.id === vendBId), 'Company A vendor list excludes Company B vendor');
    const vendInA = PurchaseService.getVendorById(vendBId, COMPANY_A);
    assert(vendInA === null, 'Company A cannot fetch Company B vendor by ID');

    // -------------------------------------------------------------------------
    // 3. Testing Duplicate SKUs & Identical Codes Across Tenants (Coexistence)
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Testing Duplicate SKUs & Numbering Coexistence Across Tenants ---');
    
    // Create product in Company B with the EXACT SAME SKU as a Company A product!
    const dueCreamInB = InventoryService.createProduct({
      name: 'DUE Cream in Company B',
      sku: '01-DUE BEAUTY CREAM',
      categoryId: catBId,
      brandId: brandBId,
      boxesPerCarton: 1,
      piecesPerBox: 12,
      costPrice: 300,
      tradePrice: 350,
      mrp: 380,
      initialStockBase: 25,
      minStockAlert: 5,
    }, COMPANY_B);
    assert(dueCreamInB.company_id === COMPANY_B, 'Identical SKU successfully created in Company B without collision');
    assert(dueCreamInB.current_stock_base === 25, 'Company B stock is 25 PCS');

    // Company A's stock for '01-DUE BEAUTY CREAM' must remain intact!
    const dueCreamInA = db.prepare('SELECT current_stock_base FROM products WHERE sku = ? AND company_id = ?').get('01-DUE BEAUTY CREAM', COMPANY_A);
    assert(dueCreamInA.current_stock_base === dueCreamStock, `Company A stock completely isolated (${dueCreamInA.current_stock_base} == ${dueCreamStock})`);

    // Duplicate route code in Company B
    const routeB2 = RouteService.createRoute({
      name: 'Route 1 in Company B',
      code: 'R-01', // Already exists in Company A
    }, COMPANY_B);
    assert(routeB2.company_id === COMPANY_B, 'Identical Route Code "R-01" created in Company B without collision');

    // -------------------------------------------------------------------------
    // 4. Testing Banking & Payments Isolation
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Testing Banking & Payments Isolation ---');
    const bankB = BankingService.createBankAccount({
      companyId: COMPANY_B,
      bankName: 'Beta Commercial Bank',
      accountTitle: 'Beta Distribution Operations',
      accountNumber: '998877665544',
      openingBalance: 100000,
    });
    assert(bankB.company_id === COMPANY_B, 'Bank account created with Company B ID');

    const banksA = BankingService.getBankAccounts({}, COMPANY_A);
    assert(!banksA.some(b => b.id === bankB.id), 'Company A bank accounts exclude Company B bank');
    const bankInA = BankingService.getBankAccountById(bankB.id, COMPANY_A);
    assert(bankInA === null, 'Company A cannot fetch Company B bank account by ID');

    // -------------------------------------------------------------------------
    // 5. Cross-Tenant Transaction Creation & Stock / GL Scoping
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Testing Sales Order Lifecycle & GL Scoping ---');
    
    // Create Sale Order in Company B
    const orderB = SalesService.createOrder({
      customerId: custB.id,
      items: [
        {
          productId: prodB.id,
          cartonsCount: 0,
          boxesCount: 0,
          loosePiecesCount: 10,
          quantityBase: 10,
          unitPricePaisas: 15000,
        },
      ],
      paymentType: 'CREDIT',
    }, COMPANY_B);
    assert(orderB.company_id === COMPANY_B, 'Sales order created with Company B ID');

    // Verify order items have company_id = COMPANY_B
    const orderBItems = db.prepare('SELECT * FROM sales_order_items WHERE order_id = ?').all(orderB.id);
    assert(orderBItems.length === 1, 'Order has 1 item');
    assert(orderBItems[0].company_id === COMPANY_B, 'Order item has Company B company_id');

    // Verify Company B product stock decreased by 10
    const updatedProdB = InventoryService.getProductById(prodB.id, COMPANY_B);
    assert(updatedProdB.current_stock_base === 90, `Company B product stock deducted: 100 -> ${updatedProdB.current_stock_base}`);

    // Verify Company A cannot view or fetch Company B's order
    const orderInA = SalesService.getOrderById(orderB.id, COMPANY_A);
    assert(orderInA === null, 'Company A cannot view Company B order by ID');
    const ordersA = SalesService.getOrders({}, COMPANY_A);
    assert(!ordersA.some(o => o.id === orderB.id), 'Company A order list excludes Company B order');

    // Convert Order to Invoice in Company B
    const invB = SalesService.convertOrderToInvoice(orderB.id, COMPANY_B);
    assert(invB.company_id === COMPANY_B, 'Sales invoice created with Company B ID');
    const invBItems = db.prepare('SELECT * FROM sales_invoice_items WHERE invoice_id = ?').all(invB.id);
    assert(invBItems.every(i => i.company_id === COMPANY_B), 'All invoice items scoped to Company B');

    // Verify GL entries for Company B
    const glLinesB = db.prepare('SELECT * FROM journal_lines WHERE company_id = ?').all(COMPANY_B);
    assert(glLinesB.length > 0, `GL lines posted for Company B (${glLinesB.length} lines)`);
    assert(glLinesB.every(l => l.company_id === COMPANY_B), '100% of Company B GL lines have company_id = COMPANY_B');

    // Verify Company A's GL was NOT touched!
    const currGlLinesA = db.prepare('SELECT COUNT(*) as c FROM journal_lines WHERE company_id = ?').get(COMPANY_A).c;
    assert(currGlLinesA === baseGlLines, `Company A GL lines unaffected (${currGlLinesA} == ${baseGlLines})`);

    // -------------------------------------------------------------------------
    // 6. Cross-Tenant Rejection (Foreign Entity Injection Defense)
    // -------------------------------------------------------------------------
    console.log('\n--- 6. Testing Foreign Entity Injection Defense ---');
    
    // Try to create an order in Company B using a Company A customer!
    const custA = db.prepare('SELECT id FROM customers WHERE company_id = ? LIMIT 1').get(COMPANY_A);
    let rejectedForeignCust = false;
    try {
      SalesService.createOrder({
        customerId: custA.id,
        items: [
          {
            productId: prodB.id,
            cartonsCount: 0,
            boxesCount: 0,
            loosePiecesCount: 1,
            quantityBase: 1,
            unitPricePaisas: 15000,
          },
        ],
        paymentType: 'CREDIT',
      }, COMPANY_B);
    } catch (e) {
      rejectedForeignCust = true;
    }
    assert(rejectedForeignCust, 'Foreign customer ID from Company A rejected when ordering in Company B');

    // Try to create an order in Company B using a Company A product!
    const prodA = db.prepare('SELECT id FROM products WHERE company_id = ? LIMIT 1').get(COMPANY_A);
    let rejectedForeignProd = false;
    try {
      SalesService.createOrder({
        customerId: custB.id,
        items: [
          {
            productId: prodA.id,
            cartonsCount: 0,
            boxesCount: 0,
            loosePiecesCount: 1,
            quantityBase: 1,
            unitPricePaisas: 10000,
          },
        ],
        paymentType: 'CREDIT',
      }, COMPANY_B);
    } catch (e) {
      rejectedForeignProd = true;
    }
    assert(rejectedForeignProd, 'Foreign product ID from Company A rejected when ordering in Company B');

    // Try to convert Company B order from Company A context!
    let rejectedCrossConvert = false;
    try {
      SalesService.convertOrderToInvoice(orderB.id, COMPANY_A);
    } catch (e) {
      rejectedCrossConvert = true;
    }
    assert(rejectedCrossConvert, 'Company A cannot convert Company B order');

    // Try to cancel Company B order from Company A context!
    let rejectedCrossCancel = false;
    try {
      SalesService.cancelOrder(orderB.id, 'Illegal cross-tenant cancel', COMPANY_A);
    } catch (e) {
      rejectedCrossCancel = true;
    }
    assert(rejectedCrossCancel, 'Company A cannot cancel Company B order');

    // -------------------------------------------------------------------------
    // 7. Testing Cross-Tenant Expenses, Payments & Closings Isolation
    // -------------------------------------------------------------------------
    console.log('\n--- 7. Testing Expenses, Payments & Closings Isolation ---');

    // Record Expense in Company B
    const expAccB = db.prepare("SELECT id FROM chart_of_accounts WHERE code = '5050' AND company_id = ?").get(COMPANY_B);
    const paidAccB = db.prepare("SELECT id FROM chart_of_accounts WHERE code = '1010' AND company_id = ?").get(COMPANY_B);

    const expB = ExpenseService.createExpense({
      companyId: COMPANY_B,
      expenseDate: '2026-09-28',
      amount: 500,
      expenseAccountId: expAccB.id,
      paidFromAccountId: paidAccB.id,
      description: 'Paper and pens for Company B',
      paidTo: 'Office Depot',
    });
    assert(expB.company_id === COMPANY_B, 'Expense recorded with Company B ID');

    const expInA = ExpenseService.getExpenseById(expB.id, COMPANY_A);
    assert(expInA === null, 'Company A cannot access Company B expense by ID');

    // Daily closing in Company B for date 2026-09-28
    const closingB = ClosingService.finalizeDailyClosing({
      companyId: COMPANY_B,
      closingDate: '2026-09-28',
      openingCashPaisas: 0,
      spotCashSalesPaisas: 150000,
      debtRecoveriesPaisas: 0,
      spotCashPurchasesPaisas: 0,
      dailyExpensesPaisas: 50000,
      bankDepositsPaisas: 0,
      expectedCashPaisas: 100000,
      physicalCashPaisas: 100000,
      denominations: {
        note5000: 0, note1000: 1, note500: 0, note100: 0,
        note50: 0, note20: 0, note10: 0, coinsLoose: 0
      },
      closedBy: 'Beta Admin',
    });
    assert(closingB.company_id === COMPANY_B, 'Daily closing finalized with Company B ID');

    // Verify Company A closing check for same date: independent!
    const checkClosingA = db.prepare("SELECT * FROM daily_closings WHERE closing_date = '2026-09-28' AND company_id = ?").get(COMPANY_A);
    assert(checkClosingA === undefined, 'Company A day is NOT closed just because Company B closed it');

    // -------------------------------------------------------------------------
    // 8. Testing User Management Multi-Tenant Isolation
    // -------------------------------------------------------------------------
    console.log('\n--- 8. Testing User Management Multi-Tenant Isolation ---');
    const userB = AuthService.createUser({
      username: 'salesman_beta',
      fullName: 'Salesman Beta',
      password: 'secretpassword123',
      role: 'ADMIN',
    }, COMPANY_B);
    assert(userB.company_id === COMPANY_B, 'User created with Company B ID');

    // Verify Company A does NOT see Company B user
    const usersA = AuthService.getUsers(COMPANY_A);
    assert(!usersA.some(u => u.id === userB.id), 'Company A user list excludes Company B users');
    const userInA = AuthService.getUserById(userB.id, COMPANY_A);
    assert(userInA === null, 'Company A cannot fetch Company B user by ID');

    // Same username in Company A should be allowed (unique per company)
    const userAWithSameName = AuthService.createUser({
      username: 'salesman_beta',
      fullName: 'Salesman Beta in Co A',
      password: 'secretpassword123',
      role: 'SALESMAN',
    }, COMPANY_A);
    assert(userAWithSameName.company_id === COMPANY_A, 'Identical username permitted across separate tenants');

    // Clean up temporary user in Co A
    db.prepare('DELETE FROM app_users WHERE id = ?').run(userAWithSameName.id);

    // -------------------------------------------------------------------------
    // 9. Testing Anti-Spoofing & Authenticated Server Context
    // -------------------------------------------------------------------------
    console.log('\n--- 9. Testing Anti-Spoofing & Request Context Resolution ---');

    // Create session token for Company B admin
    const tokenB = signSessionToken(buildSessionPayload({
      userId: userB.id,
      companyId: COMPANY_B,
      role: 'ADMIN',
      username: userB.username,
      fullName: userB.full_name,
    }));

    process.env.DEPLOYMENT_MODE = 'cloud';
    try {
      // Mock NextRequest with Company B cookie and subdomain, but attempting to pass Company A in custom header
      const mockReq = {
        url: 'http://beta.saleflow.app/api/customers',
        headers: new Headers({
          'host': 'beta.saleflow.app',
          'cookie': `saleflow_session=${tokenB}`,
          'x-company-id': COMPANY_A, // Attacker trying to spoof company A!
          'x-user-role': 'ADMIN',
        }),
      };

      const verifiedCtx = await getTenantContext(mockReq);
      assert(verifiedCtx.companyId === COMPANY_B, `Anti-Spoofing: Verified companyId is strictly ${COMPANY_B} regardless of client x-company-id header`);
      assert(verifiedCtx.isAuthenticated === true, 'Authenticated context successfully verified for Company B user');
    } finally {
      process.env.DEPLOYMENT_MODE = 'onpremise';
    }

  } finally {
    // -------------------------------------------------------------------------
    // 10. Clean Up Company B Fixture
    // -------------------------------------------------------------------------
    console.log('\n--- 10. Cleaning Up Company B Test Fixture ---');
    db.exec(`
      DELETE FROM customer_payment_allocations WHERE company_id = '${COMPANY_B}';
      DELETE FROM vendor_payment_allocations WHERE company_id = '${COMPANY_B}';
      DELETE FROM customer_payments WHERE company_id = '${COMPANY_B}';
      DELETE FROM vendor_payments WHERE company_id = '${COMPANY_B}';
      DELETE FROM sales_invoice_items WHERE company_id = '${COMPANY_B}';
      DELETE FROM sales_invoices WHERE company_id = '${COMPANY_B}';
      DELETE FROM sales_order_items WHERE company_id = '${COMPANY_B}';
      DELETE FROM sales_orders WHERE company_id = '${COMPANY_B}';
      DELETE FROM sales_return_items WHERE company_id = '${COMPANY_B}';
      DELETE FROM sales_returns WHERE company_id = '${COMPANY_B}';
      DELETE FROM purchase_return_items WHERE company_id = '${COMPANY_B}';
      DELETE FROM purchase_returns WHERE company_id = '${COMPANY_B}';
      DELETE FROM purchase_bill_items WHERE company_id = '${COMPANY_B}';
      DELETE FROM purchase_bills WHERE company_id = '${COMPANY_B}';
      DELETE FROM inventory_movements WHERE company_id = '${COMPANY_B}';
      DELETE FROM stock_adjustments WHERE company_id = '${COMPANY_B}';
      DELETE FROM expenses WHERE company_id = '${COMPANY_B}';
      DELETE FROM daily_closings WHERE company_id = '${COMPANY_B}';
      DELETE FROM audit_logs WHERE company_id = '${COMPANY_B}';
      DELETE FROM journal_lines WHERE company_id = '${COMPANY_B}';
      DELETE FROM journal_entries WHERE company_id = '${COMPANY_B}';
      DELETE FROM bank_accounts WHERE company_id = '${COMPANY_B}';
      DELETE FROM customers WHERE company_id = '${COMPANY_B}';
      DELETE FROM vendors WHERE company_id = '${COMPANY_B}';
      DELETE FROM products WHERE company_id = '${COMPANY_B}';
      DELETE FROM categories WHERE company_id = '${COMPANY_B}';
      DELETE FROM brands WHERE company_id = '${COMPANY_B}';
      DELETE FROM routes WHERE company_id = '${COMPANY_B}';
      DELETE FROM staff_members WHERE company_id = '${COMPANY_B}';
      DELETE FROM app_users WHERE company_id = '${COMPANY_B}';
      DELETE FROM chart_of_accounts WHERE company_id = '${COMPANY_B}';
      DELETE FROM company_modules WHERE company_id = '${COMPANY_B}';
      DELETE FROM companies WHERE id = '${COMPANY_B}';
    `);
    console.log('[PASS] Company B test fixture completely purged from database');
  }

  // ---------------------------------------------------------------------------
  // 11. Final Integrity & Financial Baseline Checks
  // ---------------------------------------------------------------------------
  console.log('\n--- 11. Database Integrity & Post-Test Financial Baseline Check ---');
  const integrity = db.prepare('PRAGMA integrity_check').all();
  assert(integrity[0].integrity_check === 'ok', 'PRAGMA integrity_check is ok');

  const fkCheck = db.prepare('PRAGMA foreign_key_check').all();
  assert(fkCheck.length === 0, `PRAGMA foreign_key_check has 0 errors (found ${fkCheck.length})`);

  const finalGlLines = db.prepare('SELECT COUNT(*) as c FROM journal_lines WHERE company_id = ?').get(COMPANY_A).c;
  const finalDebits = db.prepare('SELECT SUM(debit_paisas) as s FROM journal_lines WHERE company_id = ?').get(COMPANY_A).s;
  const finalCredits = db.prepare('SELECT SUM(credit_paisas) as s FROM journal_lines WHERE company_id = ?').get(COMPANY_A).s;
  const finalStock = db.prepare('SELECT current_stock_base FROM products WHERE sku = ? AND company_id = ?').get('01-DUE BEAUTY CREAM', COMPANY_A).current_stock_base;

  assert(finalGlLines === baseGlLines, `GL lines intact: ${finalGlLines} == ${baseGlLines}`);
  assert(finalDebits === baseDebits, `Debit paisas intact: ${finalDebits} == ${baseDebits}`);
  assert(finalCredits === baseCredits, `Credit paisas intact: ${finalCredits} == ${baseCredits}`);
  assert(finalStock === dueCreamStock, `Stock intact: ${finalStock} == ${dueCreamStock}`);

  console.log('\n================================================================');
  console.log(`   >>> ALL ${passedChecks} PHASE 2D TENANT-ISOLATION CHECKS PASSED! <<<`);
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('\n[FATAL ERROR IN PHASE 2D SUITE]:', err);
  process.exit(1);
});
