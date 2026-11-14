# SaleFlow ERP — Fast Change Target Index

> **FOR ALL FUTURE SALEFLOW DEVELOPMENT TASKS:**
> 
> 1. **Read `docs/SALEFLOW_CHANGE_TARGET_INDEX.md` first.**
> 2. **Identify the requested feature.**
> 3. **Open ONLY its Primary + necessary Dependency/Shared files.**
> 4. **Do NOT rescan the complete repository unless architecture has materially changed.**
> 5. **Search globally only if the index does not contain the required information.**
> 6. **Run focused regression tests based on the documented blast radius.**
> 7. **Run full build only before final commit when appropriate.**

---

### KEEP INDEX ACCURATE — MANDATORY AGENT RULE
Whenever a task adds a new route, creates a module, renames files, or changes dependencies, update this file and `docs/SALEFLOW_CODEBASE_MAP.md` as part of that same task.

---

## 1. SALES & DISTRIBUTION FEATURES

### FIELD ORDER BOOKING
- **Primary:** `src/app/(dashboard)/sales/field-order-booking/page.tsx`
- **Dependencies / APIs:** `src/app/api/sales/field-order-booking/route.ts`, `src/modules/sales/service.ts`, `src/shared/utils/uom.ts`
- **Shared Components:** `SearchableSelect.tsx`, `NumericValue.tsx`
- **Database Tables:** `sales_orders`, `sales_order_items`, `customers`, `products`
- **Module Entitlement:** `sales:field_order_booking`
- **Blast Radius / Test Scope:** Test field order booking mobile/tablet UI, customer balance check, 3-tier UOM calculations, and booking submission.
- **DO NOT TOUCH:** Unrelated Purchase, Banking, Accounting, or Super Admin pages.

---

### ORDER BOOKING (COUNTER)
- **Primary:** `src/app/(dashboard)/sales/order-booking/page.tsx`
- **Dependencies / APIs:** `src/app/api/sales/orders/route.ts`, `src/modules/sales/service.ts`, `src/shared/utils/uom.ts`, `src/modules/sales/components/PrintInvoiceModal.tsx`
- **Shared Components:** `SearchableSelect.tsx`, `NumericValue.tsx`
- **Database Tables:** `sales_orders`, `sales_order_items`, `customers`, `products`
- **Module Entitlement:** `sales:order_booking`
- **Blast Radius / Test Scope:** Test counter order submission, line item discount/scheme additions, instant thermal/A4 invoice printing.
- **DO NOT TOUCH:** Purchase bills, general ledger journals, or vendor returns.

---

### SALES ORDERS & COMMERCIAL BILLS (REGISTER)
- **Primary:** `src/app/(dashboard)/sales/page.tsx`
- **Dependencies / APIs:** `src/app/api/sales/route.ts`, `src/app/api/sales/orders/route.ts`, `src/app/api/sales/bulk-delete/route.ts`, `src/modules/sales/service.ts`, `src/modules/sales/components/PrintInvoiceModal.tsx`, `src/modules/sales/components/BatchPrintSalesModal.tsx`
- **Shared Components:** `ListPageContainer.tsx`, `PaginationControls.tsx`, `SearchableSelect.tsx`, `BulkActionToolbar.tsx`, `NumericValue.tsx`
- **Database Tables:** `sales_orders`, `sales_order_items`, `customers`, `routes`
- **Module Entitlement:** `sales:orders`
- **Blast Radius / Test Scope:** Sales list pagination, status filtering, invoice printing, voiding order with reverse inventory movement.
- **DO NOT TOUCH:** Expense vouchers, bank statement, or chart of accounts.

---

### DIRECT VAN SALE (SPOT CASH)
- **Primary:** `src/app/(dashboard)/sales/direct-sale/page.tsx`
- **Dependencies / APIs:** `src/app/api/sales/direct/route.ts`, `src/app/api/sales/direct/[id]/route.ts`, `src/modules/sales/service.ts`, `src/core/accounting/engine.ts`
- **Shared Components:** `SearchableSelect.tsx`, `NumericValue.tsx`, `PrintInvoiceModal.tsx`
- **Database Tables:** `sales_invoices`, `sales_invoice_items`, `inventory_movements`, `journal_entries`, `journal_lines`
- **Module Entitlement:** `sales:direct_sale`
- **Blast Radius / Test Scope:** Spot sale checkout, instant inventory deduction from vehicle, cash posting into GL.
- **DO NOT TOUCH:** Purchase returns, vendor bills, or Super Admin branding.

---

### CUSTOMER SALES RETURNS
- **Primary:** `src/app/(dashboard)/sales/returns/page.tsx`
- **Dependencies / APIs:** `src/app/api/returns/sales/route.ts`, `src/app/api/returns/customer-eligibility/route.ts`, `src/modules/returns/service.ts`
- **Shared Components:** `SearchableSelect.tsx`, `NumericValue.tsx`, `PaginationControls.tsx`
- **Database Tables:** `sales_returns`, `sales_return_items`, `inventory_movements`, `journal_entries`, `journal_lines`
- **Module Entitlement:** `sales:customer_returns`
- **Blast Radius / Test Scope:** Return credit note calculation, fresh vs damaged stock segregation in stock ledger, ledger credit posting.
- **DO NOT TOUCH:** Purchase bills or daily cash closing.

---

### ROUTE LOAD SHEET (DISPATCH)
- **Primary:** `src/app/(dashboard)/dispatch/load-sheet/page.tsx`
- **Dependencies / APIs:** `src/app/api/dispatch/load-sheet/route.ts`, `src/modules/sales/service.ts`, `src/shared/utils/uom.ts`
- **Shared Components:** `SearchableSelect.tsx`, `NumericValue.tsx`
- **Database Tables:** `sales_orders`, `sales_order_items`, `routes`, `staff_members`
- **Module Entitlement:** `sales:load_sheet`
- **Blast Radius / Test Scope:** Route filtering, order selection, carton tally rollup, driver gate pass printing.
- **DO NOT TOUCH:** Expense vouchers or bank accounts.

---

### ROUTE COLLECTIONS
- **Primary:** `src/app/(dashboard)/sales/collections/page.tsx`
- **Dependencies / APIs:** `src/app/api/sales/collections/route.ts`, `src/modules/sales/collections.service.ts`
- **Shared Components:** `SearchableSelect.tsx`, `NumericValue.tsx`, `PaginationControls.tsx`
- **Database Tables:** `customer_payments`, `customers`, `routes`, `journal_entries`
- **Module Entitlement:** `payments:collections`
- **Blast Radius / Test Scope:** Recovery vouchers by route/salesman, customer khata reduction.
- **DO NOT TOUCH:** Purchase orders or product master.

---

## 2. PURCHASE & VENDOR FEATURES

### NEW PURCHASE BILL (INWARD GOODS)
- **Primary:** `src/app/(dashboard)/purchase/new-bill/page.tsx`
- **Dependencies / APIs:** `src/app/api/purchase/bills/route.ts`, `src/modules/purchase/service.ts`, `src/core/accounting/engine.ts`, `src/shared/utils/uom.ts`
- **Shared Components:** `SearchableSelect.tsx`, `NumericValue.tsx`
- **Database Tables:** `purchase_bills`, `purchase_bill_items`, `inventory_movements`, `journal_entries`, `journal_lines`, `vendors`
- **Module Entitlement:** `purchase:new_bill`
- **Blast Radius / Test Scope:** Landed freight calculation, 3-tier UOM stock intake, vendor liability (AP) credit posting.
- **DO NOT TOUCH:** Sales orders, field order booking, or customer collections.

---

### PURCHASE BILLS DETAIL (REGISTER & AUDIT)
- **Primary:** `src/app/(dashboard)/purchase/orders-detail/page.tsx`
- **Dependencies / APIs:** `src/app/api/purchase/bills/route.ts`, `src/app/api/purchase/bills/[id]/void/route.ts`, `src/app/api/purchase/bills/bulk-delete/route.ts`, `src/modules/purchase/service.ts`
- **Shared Components:** `ListPageContainer.tsx`, `PaginationControls.tsx`, `SearchableSelect.tsx`, `BatchPrintPurchaseModal.tsx`, `NumericValue.tsx`
- **Database Tables:** `purchase_bills`, `purchase_bill_items`, `vendors`
- **Module Entitlement:** `purchase:orders_detail`
- **Blast Radius / Test Scope:** Purchase bill register filtering, voiding purchase bill (reversing stock & AP liability).
- **DO NOT TOUCH:** Sales analysis or customer outlets.

---

### VENDOR PURCHASE RETURNS
- **Primary:** `src/app/(dashboard)/purchase/returns/page.tsx`
- **Dependencies / APIs:** `src/app/api/returns/purchase/route.ts`, `src/modules/returns/service.ts`, `src/core/accounting/engine.ts`
- **Shared Components:** `SearchableSelect.tsx`, `NumericValue.tsx`, `PaginationControls.tsx`
- **Database Tables:** `purchase_returns`, `purchase_return_items`, `inventory_movements`, `journal_entries`
- **Module Entitlement:** `purchase:vendor_returns`
- **Blast Radius / Test Scope:** Supplier debit notes, stock reduction from warehouse, vendor ledger debit posting.
- **DO NOT TOUCH:** Direct van sales or staff routes.

---

### VENDOR / SUPPLIER MASTER
- **Primary:** `src/app/(dashboard)/purchase/vendors/page.tsx`
- **Dependencies / APIs:** `src/app/api/vendors/route.ts`, `src/app/api/vendors/[id]/route.ts`, `src/modules/customers/service.ts`
- **Shared Components:** `ListPageContainer.tsx`, `PaginationControls.tsx`, `NumericValue.tsx`
- **Database Tables:** `vendors`
- **Module Entitlement:** `customers:vendors`
- **Blast Radius / Test Scope:** Vendor profile CRUD, payment terms, opening balance.
- **DO NOT TOUCH:** Expense vouchers or Super Admin security.

---

## 3. INVENTORY & STOCK FEATURES

### PRODUCTS & PRICING MASTER
- **Primary:** `src/app/(dashboard)/inventory/products/page.tsx`
- **Dependencies / APIs:** `src/app/api/inventory/route.ts`, `src/app/api/inventory/categories/route.ts`, `src/app/api/inventory/brands/route.ts`, `src/modules/inventory/service.ts`, `src/shared/utils/uom.ts`
- **Shared Components:** `ListPageContainer.tsx`, `PaginationControls.tsx`, `SearchableSelect.tsx`, `NumericValue.tsx`
- **Database Tables:** `products`, `categories`, `brands`
- **Module Entitlement:** `inventory:products`
- **Blast Radius / Test Scope:** Product creation/editing, packaging ratios (CTN -> BOX -> PCS), trade price (TP), MRP, cost price, barcode scanning.
- **DO NOT TOUCH:** Bank statement or daily cash closing.

---

### INVENTORY AUDIT & STOCK LEDGER
- **Primary:** `src/app/(dashboard)/inventory/audit-ledger/page.tsx`
- **Dependencies / APIs:** `src/app/api/inventory/audit/movements/route.ts`, `src/app/api/inventory/audit/kpis/route.ts`, `src/modules/inventory/audit.service.ts`
- **Shared Components:** `ListPageContainer.tsx`, `PaginationControls.tsx`, `SearchableSelect.tsx`, `NumericValue.tsx`
- **Database Tables:** `inventory_movements`, `products`
- **Module Entitlement:** `inventory:audit_ledger`
- **Blast Radius / Test Scope:** Chronological stock audit trail, running piece balance verification, movement type filters.
- **DO NOT TOUCH:** Chart of accounts modal or staff management.

---

### STOCK VALUATION REPORT
- **Primary:** `src/app/(dashboard)/reports/stock-valuation/page.tsx`
- **Dependencies / APIs:** `src/app/api/reports/stock-valuation/route.ts`, `src/modules/reports/service.ts`
- **Shared Components:** `NumericValue.tsx`, `SearchableSelect.tsx`
- **Database Tables:** `products`, `categories`, `brands`
- **Module Entitlement:** `reports:stock_valuation`
- **Blast Radius / Test Scope:** Warehouse valuation calculations (Cost vs Trade Price value), category aggregations.
- **DO NOT TOUCH:** Order booking form or Super Admin licensing.

---

## 4. CUSTOMER & ROUTE FEATURES

### CUSTOMERS & RETAIL OUTLETS
- **Primary:** `src/app/(dashboard)/customers/page.tsx`
- **Dependencies / APIs:** `src/app/api/customers/route.ts`, `src/app/api/customers/[id]/route.ts`, `src/app/api/customers/credit-check/route.ts`, `src/modules/customers/service.ts`
- **Shared Components:** `ListPageContainer.tsx`, `PaginationControls.tsx`, `SearchableSelect.tsx`, `NumericValue.tsx`
- **Database Tables:** `customers`, `routes`
- **Module Entitlement:** `customers:customers`
- **Blast Radius / Test Scope:** Customer registration, credit limit & credit days configuration, route assignment, balance tracking.
- **DO NOT TOUCH:** Purchase bills or stock ledger.

---

### ROUTE & TERRITORY MASTER
- **Primary:** `src/app/(dashboard)/settings/routes/page.tsx`
- **Dependencies / APIs:** `src/app/api/routes/route.ts`, `src/app/api/routes/[id]/route.ts`, `src/modules/routes/service.ts`
- **Shared Components:** `ListPageContainer.tsx`, `PaginationControls.tsx`, `SearchableSelect.tsx`
- **Database Tables:** `routes`, `staff_members`
- **Module Entitlement:** `customers:routes`
- **Blast Radius / Test Scope:** Territory setup, delivery day schedules (JSON weekdays), assigned salesman/supplyperson.
- **DO NOT TOUCH:** Product pricing or journal entries.

---

### SALES & DELIVERY TEAM (STAFF)
- **Primary:** `src/app/(dashboard)/settings/staff/page.tsx`
- **Dependencies / APIs:** `src/app/api/staff/route.ts`, `src/app/api/staff/[id]/route.ts`, `src/modules/settings/company-service.ts`
- **Shared Components:** `ListPageContainer.tsx`, `PaginationControls.tsx`, `SearchableSelect.tsx`
- **Database Tables:** `staff_members`, `routes`
- **Module Entitlement:** `customers:staff`
- **Blast Radius / Test Scope:** Staff roles (`SALESMAN`, `SUPPLY_PERSON`, `DRIVER`, `MANAGER`), route linkages.
- **DO NOT TOUCH:** Purchase returns or chart of accounts.

---

## 5. PAYMENTS & CASH MANAGEMENT FEATURES

### PAYMENTS RECEIVED (CUSTOMER RECEIPTS)
- **Primary:** `src/app/(dashboard)/payments/received/page.tsx`
- **Dependencies / APIs:** `src/app/api/payments/received/route.ts`, `src/app/api/payments/received/invoices/route.ts`, `src/modules/payments/service.ts`, `src/core/accounting/engine.ts`
- **Shared Components:** `ListPageContainer.tsx`, `PaginationControls.tsx`, `SearchableSelect.tsx`, `NumericValue.tsx`
- **Database Tables:** `customer_payments`, `customer_payment_allocations`, `sales_orders`, `journal_entries`
- **Module Entitlement:** `payments:received`
- **Blast Radius / Test Scope:** Payment receipt entry, allocation against sales orders, customer balance deduction, bank/cash debit posting.
- **DO NOT TOUCH:** Vendor returns or product master.

---

### PAYMENTS MADE (VENDOR PAYOUTS)
- **Primary:** `src/app/(dashboard)/payments/made/page.tsx`
- **Dependencies / APIs:** `src/app/api/payments/made/route.ts`, `src/app/api/payments/made/bills/route.ts`, `src/modules/payments/service.ts`, `src/core/accounting/engine.ts`
- **Shared Components:** `ListPageContainer.tsx`, `PaginationControls.tsx`, `SearchableSelect.tsx`, `NumericValue.tsx`
- **Database Tables:** `vendor_payments`, `vendor_payment_allocations`, `purchase_bills`, `journal_entries`
- **Module Entitlement:** `payments:made`
- **Blast Radius / Test Scope:** Supplier payment voucher, allocation against purchase bills, AP balance debit posting.
- **DO NOT TOUCH:** Sales load sheet or field order booking.

---

### DAILY EXPENSES
- **Primary:** `src/app/(dashboard)/expenses/page.tsx`
- **Dependencies / APIs:** `src/app/api/expenses/route.ts`, `src/app/api/expenses/[id]/void/route.ts`, `src/modules/expenses/service.ts`, `src/core/accounting/engine.ts`
- **Shared Components:** `ListPageContainer.tsx`, `PaginationControls.tsx`, `SearchableSelect.tsx`, `NumericValue.tsx`
- **Database Tables:** `expenses`, `chart_of_accounts`, `staff_members`, `journal_entries`
- **Module Entitlement:** `payments:expenses`
- **Blast Radius / Test Scope:** Operating expense entry (fuel, tea, freight, vehicle maintenance), expense voiding with reversing journal.
- **DO NOT TOUCH:** Product catalog or vendor returns.

---

### DAILY CASH CLOSING (ROZNAMCHA)
- **Primary:** `src/app/(dashboard)/closing/daily-summary/page.tsx`
- **Dependencies / APIs:** `src/app/api/closing/check/route.ts`, `src/app/api/closing/finalize/route.ts`, `src/app/api/closing/reconciliation/route.ts`, `src/modules/closing/service.ts`
- **Shared Components:** `NumericValue.tsx`
- **Database Tables:** `daily_closings`, `sales_orders`, `customer_payments`, `expenses`
- **Module Entitlement:** `payments:closing`
- **Blast Radius / Test Scope:** Daily expected cash tally (opening + spot cash + recovery - expense - deposits), physical currency denomination counting, shortage/excess variance calculation, day-end lock.
- **DO NOT TOUCH:** Product pricing or customer routes.

---

### BANK ACCOUNTS MASTER
- **Primary:** `src/app/(dashboard)/accounting/banks/page.tsx` (and mirrors `payments/banks`, `settings/banks`)
- **Dependencies / APIs:** `src/app/api/banking/accounts/route.ts`, `src/app/api/banking/coa-options/route.ts`, `src/modules/banking/service.ts`
- **Shared Components:** `SearchableSelect.tsx`, `NumericValue.tsx`, `PaginationControls.tsx`
- **Database Tables:** `bank_accounts`, `chart_of_accounts`
- **Module Entitlement:** `customers:banks`
- **Blast Radius / Test Scope:** Bank account CRUD, IBAN validation, linking bank to Chart of Accounts asset head.
- **DO NOT TOUCH:** Sales orders or load sheets.

---

## 6. GENERAL LEDGER & ACCOUNTING FEATURES

### CHART OF ACCOUNTS (COA)
- **Primary:** `src/app/(dashboard)/accounting/coa/page.tsx`
- **Dependencies / APIs:** `src/app/api/accounting/coa/route.ts`, `src/app/api/accounting/coa/[id]/ledger/route.ts`, `src/app/api/accounting/coa/import/route.ts`, `src/app/api/accounting/coa/template/route.ts`, `src/core/accounting/engine.ts`, `src/core/accounting/business-reference-resolver.ts`, `src/shared/utils/reference.ts`, `src/core/accounting/default-coa.ts`, `src/core/accounting/account-resolver.ts`, `scripts/ensure-default-coa.mjs`
- **Shared Components:** `ChartOfAccountsClient.tsx`, `AccountModal.tsx`, `SubAccountModal.tsx`, `AccountLedgerModal.tsx`, `ImportAccountsModal.tsx`
- **Database Tables:** `chart_of_accounts`, `journal_lines`, `journal_entries`
- **Module Entitlement:** `accounts:coa`
- **Blast Radius / Test Scope:** 5-digit account hierarchy, account type (Asset, Liability, Equity, Revenue, Expense), ledger drilling, Reference column zero-UUID business resolution (`BILL-...`, `ORD-...`, `ADJ-...`, `SR-...`, `PR-...`).
- **DO NOT TOUCH:** Field order booking or route load sheets.

---

### GENERAL LEDGER & JOURNALS
- **Primary:** `src/app/(dashboard)/accounting/journal/page.tsx`
- **Dependencies / APIs:** `src/app/api/accounting/journal/route.ts`, `src/app/api/accounting/journal/void/route.ts`, `src/core/accounting/engine.ts`
- **Shared Components:** `ListPageContainer.tsx`, `PaginationControls.tsx`, `SearchableSelect.tsx`, `NumericValue.tsx`
- **Database Tables:** `journal_entries`, `journal_lines`, `chart_of_accounts`
- **Module Entitlement:** `accounts:journal`
- **Blast Radius / Test Scope:** Manual journal vouchers, balanced debit/credit posting in integer Paisas, audit reversing journal entries.
- **DO NOT TOUCH:** Product packaging ratios or van dispatch.

---

### TRIAL BALANCE
- **Primary:** `src/app/(dashboard)/accounting/trial-balance/page.tsx`
- **Dependencies / APIs:** `src/app/api/accounting/trial-balance/route.ts`, `src/core/accounting/engine.ts`
- **Shared Components:** `NumericValue.tsx`
- **Database Tables:** `chart_of_accounts`, `journal_lines`
- **Module Entitlement:** `accounts:trial_balance`
- **Blast Radius / Test Scope:** Balanced ledger verification across all active heads down to the Paisa.
- **DO NOT TOUCH:** Order booking form.

---

### PROFIT & LOSS STATEMENT (P&L)
- **Primary:** `src/app/(dashboard)/reports/profit-and-loss/page.tsx`
- **Dependencies / APIs:** `src/app/api/reports/profit-and-loss/route.ts`, `src/modules/reports/service.ts`, `src/core/accounting/engine.ts`
- **Shared Components:** `NumericValue.tsx`, `DateRangeFilter.tsx`
- **Database Tables:** `journal_lines`, `chart_of_accounts`
- **Module Entitlement:** `reports:profit_loss`
- **Blast Radius / Test Scope:** Revenue, Cost of Goods Sold (COGS), operating expenses, net profit/loss calculation.
- **DO NOT TOUCH:** Customer routes or staff management.

---

## 7. BUSINESS INTELLIGENCE & REPORTS

### SALES ANALYSIS REPORT
- **Primary:** `src/app/(dashboard)/reports/sales-analysis/page.tsx`
- **Dependencies / APIs:** `src/app/api/reports/sales-analysis/route.ts`, `src/modules/reports/sales-analysis.service.ts`
- **Shared Components:** `SalesAnalysisClient.tsx`, `SearchableSelect.tsx`, `NumericValue.tsx`, `DateRangeFilter.tsx`
- **Database Tables:** `sales_orders`, `sales_order_items`, `customers`, `routes`, `staff_members`
- **Module Entitlement:** `reports:sales_analysis`
- **Blast Radius / Test Scope:** Multi-dimensional revenue aggregation by route, customer, salesman, category, brand.
- **DO NOT TOUCH:** Purchase bills or Super Admin users.

---

### STOCK & BOOKING ANALYSIS REPORT
- **Primary:** `src/app/(dashboard)/reports/stock-analysis/page.tsx`
- **Dependencies / APIs:** `src/app/api/reports/stock-analysis/route.ts`, `src/modules/reports/stock-analysis.service.ts`
- **Shared Components:** `StockAnalysisClient.tsx`, `SearchableSelect.tsx`, `NumericValue.tsx`
- **Database Tables:** `inventory_movements`, `products`
- **Module Entitlement:** `reports:stock_analysis`
- **Blast Radius / Test Scope:** Fast vs slow-moving stock identification, reorder level warnings.
- **DO NOT TOUCH:** Vendor bills or bank reconciliation.

---

### PARTY LEDGERS (KHATA)
- **Primary:** `src/app/(dashboard)/reports/ledgers/page.tsx`
- **Dependencies / APIs:** `src/app/api/reports/ledgers/route.ts`, `src/modules/reports/service.ts`
- **Shared Components:** `SearchableSelect.tsx`, `NumericValue.tsx`, `DateRangeFilter.tsx`
- **Database Tables:** `journal_lines`, `customers`, `vendors`
- **Module Entitlement:** `reports:ledgers`
- **Blast Radius / Test Scope:** Running debtor/creditor balance ledger with chronological debits and credits.
- **DO NOT TOUCH:** Direct van sale or company profile.

---

### BANK STATEMENT REPORT
- **Primary:** `src/app/(dashboard)/reports/bank-statement/page.tsx`
- **Dependencies / APIs:** `src/app/api/reports/bank-statement/route.ts`, `src/app/api/banking/statement/route.ts`
- **Shared Components:** `SearchableSelect.tsx`, `NumericValue.tsx`, `DateRangeFilter.tsx`
- **Database Tables:** `journal_lines`, `bank_accounts`, `journal_entries`
- **Module Entitlement:** `reports:bank_statement`
- **Blast Radius / Test Scope:** Bank account transaction logs, deposits, withdrawals, running bank balance.
- **DO NOT TOUCH:** Field order booking or stock valuation.

---

## 8. BRANDING, THEME & IDENTITY FEATURES

### SYSTEM BRANDING & IDENTITY
- **Primary:** `src/app/superadmin/branding/page.tsx`, `src/core/branding/theme.service.ts`, `src/core/branding/storage.ts`
- **Dependencies / APIs:** `src/app/api/superadmin/branding/route.ts`, `src/app/api/superadmin/branding/upload/route.ts`, `src/app/api/branding/assets/[type]/route.ts`
- **Shared Components:** `BrandIdentity.tsx`, `ApplicationPreloader.tsx`, `DynamicDocumentTitle.tsx`, `DynamicFavicon.tsx`, `ThemeStyleInjector.tsx`
- **Database Tables:** `app_settings` (`branding_config`)
- **Blast Radius / Test Scope:**
  - Default ERP Display Name (document title, alt text, preloader, fallback text)
  - Main ERP Logo (WebP auto-compression <= 1600x600 px)
  - Sidebar Logo (separate optional mark <= 512x512 px)
  - Favicon (64x64 PNG or ICO)
  - Preloader ON/OFF (strict `null` / zero DOM when OFF; breathing animation when ON)
  - Text & numeric font families
- **DO NOT TOUCH:** Unrelated business logic (Sales, Purchase, GL engine).

---

## 9. SUPER ADMIN & PLATFORM FEATURES

### SUPER ADMIN DASHBOARD
- **Primary:** `src/app/superadmin/page.tsx`, `src/app/superadmin/SuperAdminDashboardClient.tsx`
- **Dependencies / APIs:** `src/app/api/superadmin/dashboard/stats/route.ts`, `src/core/auth/superadmin.service.ts`
- **Shared Components:** `SuperAdminSidebar.tsx`, `SuperAdminHeader.tsx`, `BrandIdentity.tsx`
- **Database Tables:** `companies`, `platform_users`, `audit_logs`
- **Blast Radius / Test Scope:** Tenant count KPIs, active subscriptions, system metrics.
- **DO NOT TOUCH:** Tenant ERP modules.

---

### CUSTOMER MANAGEMENT (TENANT COMPANIES)
- **Primary:** `src/app/superadmin/companies/page.tsx`, `src/app/superadmin/companies/[id]/page.tsx`, `src/app/superadmin/companies/[id]/CompanyDetailClient.tsx`
- **Dependencies / APIs:** `src/app/api/superadmin/companies/route.ts`, `src/app/api/superadmin/companies/[id]/*`, `src/core/tenancy/company-provisioning.service.ts`, `src/core/accounting/default-coa.ts`
- **Shared Components:** `PaginationControls.tsx`, `SearchableSelect.tsx`, `BrandIdentity.tsx`
- **Database Tables:** `companies`, `company_modules`, `app_users`
- **Blast Radius / Test Scope:** Provisioning new company, plan upgrades (`STARTER`, `STANDARD`, `COMMERCIAL`, `PROFESSIONAL`, `ENTERPRISE`), suspension/activation, resetting company admin password.
- **DO NOT TOUCH:** Tenant operational forms.

---

### MODULE MANAGEMENT & ENTITLEMENTS
- **Primary:** `src/app/superadmin/modules/page.tsx`, `src/core/registry/hierarchical-module-registry.ts`
- **Dependencies / APIs:** `src/app/api/superadmin/companies/[id]/modules/route.ts`, `src/app/api/modules/route.ts`
- **Shared Components:** `Card`, `Switch`
- **Database Tables:** `company_modules`, `system_modules`
- **Blast Radius / Test Scope:** Toggling main modules and submodules per company, testing 403 route blocking via `RouteAccessGuard.tsx` and sidebar navigation item hiding.
- **DO NOT TOUCH:** Financial formulas or minor-unit Paisa math.

---

### SUPER ADMIN SECURITY & 2FA
- **Primary:** `src/app/superadmin/security/page.tsx`, `src/core/auth/two-factor.service.ts`
- **Dependencies / APIs:** `src/app/api/superadmin/security/policy/route.ts`, `totp/setup/route.ts`, `recovery-codes/route.ts`
- **Database Tables:** `platform_users`, `platform_otp_tokens`
- **Blast Radius / Test Scope:** TOTP authenticator setup, email OTP delivery, backup recovery code generation.
- **DO NOT TOUCH:** Tenant app_users table.

---

### SUPER ADMIN LOGIN & SESSION
- **Primary:** `src/app/superadmin/login/page.tsx`, `src/app/superadmin/login/SuperAdminLoginClient.tsx`, `src/core/auth/superadmin-session.ts`
- **Dependencies / APIs:** `src/app/api/superadmin/auth/login/route.ts`, `verify-2fa/route.ts`, `send-email-otp/route.ts`, `logout/route.ts`
- **Shared Components:** `BrandIdentity.tsx`, `ApplicationPreloader.tsx`
- **Database Tables:** `platform_users`, `platform_otp_tokens`
- **Cookie:** `saleflow_superadmin_session`
- **Blast Radius / Test Scope:** 2-step authentication, TOTP verification, email OTP verification, cookie assignment.
- **DO NOT TOUCH:** Tenant login.

---

### TENANT LOGIN & SESSION
- **Primary:** `src/app/login/page.tsx`, `src/app/login/TenantLoginClient.tsx`, `src/core/auth/session.ts`
- **Dependencies / APIs:** `src/app/api/auth/session/route.ts`
- **Shared Components:** `BrandIdentity.tsx`, `TenantLogoutButton.tsx`
- **Database Tables:** `app_users`, `companies`
- **Cookie:** `saleflow_session`
- **Blast Radius / Test Scope:** Tenant sign-in, subdomain resolution, password verification, cookie issuance.
- **DO NOT TOUCH:** Super Admin login.

---

### APPLICATION UI THEMES & SYSTEM BRANDING
- **Primary:** `src/app/superadmin/branding/page.tsx`, `src/core/branding/theme.ts`, `src/core/branding/theme.service.ts`
- **Dependencies / APIs:** `src/app/api/superadmin/branding/route.ts`, `src/app/api/superadmin/branding/upload/route.ts`, `src/core/branding/ThemeStyleInjector.tsx`, `src/app/globals.css`
- **Shared Components:** `BrandIdentity.tsx`, `ApplicationPreloader.tsx`, `ThemeStyleInjector.tsx`
- **Database Tables:** `app_settings` (`company_id = 'SYSTEM'`, `key = 'branding_config'`)
- **Theme Scopes:** `data-ui-theme="classic"`, `data-ui-theme="modern"`
- **Blast Radius / Test Scope:** Switch between Classic SaleFlow and Modern Blue-Green, live preview in branding customizer, instant rollback, tenant shell inheritance, HTML `data-ui-theme` attribute injection.
- **DO NOT TOUCH:** Financial formulas, accounting engine, or tenant transaction data.

---

## 10. CRITICAL SHARED UI COMPONENTS & DESIGN SYSTEM

### `Button.tsx` (`Button`, `IconButton`)
- **Path:** `src/shared/components/Button.tsx`
- **Purpose:** Central semantic button component for ALL Tenant ERP and Super Admin pages. Eliminates arbitrary hard-coded black, yellow, blue, and purple buttons.
- **Variants:** `primary` (SaleFlow emerald/teal positive actions), `secondary` (slate neutral actions), `outline` (neutral bordered utilities/filters), `ghost` (transparent low-emphasis), `success` (positive confirmation), `danger` (destructive actions like void/delete), `danger-outline`, `warning` (cautionary warnings), `info` (informational).
- **Sizes:** `xs` (28px tables/badges), `sm` (32px toolbars/modals), `md` (36-38px default), `lg` (42px prominent), `icon` (standardized square icon-only button).
- **Blast Radius / Rules:** Reusable everywhere. Always provide `aria-label` or `title` on `IconButton`. Preserves loading width via `loading` or `isLoading`. Automatically renders as Next.js `Link` when `href` is provided.

---

### Global Semantic UI Tokens (`globals.css`)
- **Path:** `src/app/globals.css`
- **Tokens:** `--color-primary`, `--color-primary-hover`, `--color-primary-active`, `--color-primary-foreground`, `--color-primary-soft`, `--color-secondary`, `--color-secondary-foreground`, `--color-success`, `--color-danger`, `--color-warning`, `--color-info`, `--color-surface`, `--color-surface-muted`, `--color-app-bg`, `--color-border`, `--color-border-strong`, `--color-text`, `--color-text-muted`, `--focus-ring`.
- **Supported Themes:** Fully unified across `data-ui-theme="classic"` (Classic SaleFlow) and `data-ui-theme="modern"` (Modern Blue-Green), with full support for light and dark modes (`data-theme="light"` / `data-theme="dark"`).
- **Legacy Compatibility:** Legacy `--primary` is re-routed directly to `--color-primary`, ensuring legacy `.btn-primary` or `bg-[var(--primary)]` renders in theme emerald/teal instead of harsh black.

---

### Standard Surfaces & Component Classes
- **Path:** `src/app/globals.css`
- **Cards & Surfaces:** `.surface-card` (standard card container with border, subtle shadow, and theme background), `.surface-panel` (elevated modal/popover), `.surface-muted` (subtle secondary panel).
- **Badges:** `.badge-success`, `.badge-warning`, `.badge-danger`, `.badge-info`, `.badge-neutral` (soft semantic status chips).
- **Alerts:** `.alert-success`, `.alert-danger`, `.alert-warning`, `.alert-info` (feedback banners with semantic soft backgrounds).
- **Tables:** Standard `.table` headers (`bg-[var(--color-surface-muted)]`), borders (`border-[var(--color-border)]`), and row hovers (`hover:bg-[var(--color-surface-muted)]`).
- **Tabs:** Standard `.tab-group` and `.tab-btn` with `.tab-btn-active` displaying theme primary text and bottom indicator.

---

### `SearchableSelect.tsx`
- **Path:** `src/shared/components/SearchableSelect.tsx`
- **Blast Radius:** Used across 20+ forms. If changed, test single-select mode (Order Booking), multi-select mode (Reports), keyboard tab advance (`onTabNext`), and portal overlay positioning.

---

### `PaginationControls.tsx`
- **Path:** `src/shared/components/PaginationControls.tsx`
- **Blast Radius:** Used across 15+ list pages. If changed, test page switching, page size dropdown (`50`, `100`, `150`, `200`, `All`), and localStorage retention (`saleflow_page_size`).

---

### `NumericValue.tsx` & `formatting.ts`
- **Path:** `src/shared/components/NumericValue.tsx`, `src/shared/utils/formatting.ts`, `src/shared/utils/currency.ts`
- **Blast Radius:** Used in every card, table, report, and invoice. If changed, verify `tabular-nums`, thousand commas, 2 decimals for currency, right-alignment, and clean display without visible currency prefix.

---

### `DashboardSidebar.tsx`
- **Path:** `src/shared/components/DashboardSidebar.tsx`
- **Blast Radius:** Main navigation shell for all tenant ERP pages. If changed, test desktop collapse/expand, mobile drawer, submodule visibility filtering, and active route highlight.

---

### Business Reference Resolver & Zero-UUID Display Reference Standard
- **Core Server Service:** `src/core/accounting/business-reference-resolver.ts` (`BusinessReferenceResolver.batchResolveSync()`)
- **Shared Client/Server Util:** `src/shared/utils/reference.ts` (`formatBusinessReference()`, `isUuid()`, `DOC_PATTERN_REGEX`)
- **Strict Architecture Rule:**
  1. **Primary & Foreign Keys:** Database UUIDs (`id`, `source_document_id`, `reversal_of_id`) remain purely internal for relational integrity, foreign keys, and audit links.
  2. **Zero-UUID Exposure Rule:** Internal database UUIDs must NEVER be exposed as user-facing references on tables, modals, printable statements, or CSV exports.
  3. **Canonical Human-Readable References:**
     - Purchase: `BILL-YYYYMM-XXXX` (e.g., `BILL-202610-0001`)
     - Sales: `ORD-YYYY-XXXXX` / `INV-YYYY-XXXX` (e.g., `ORD-2026-51614`)
     - Payments: `PAY-YYYYMM-XXXX` / `PV-YYYYMM-XXXX` / `CR-YYYYMM-XXXX`
     - Returns: `SR-YYYYMM-XXXX` (Credit Note) / `PR-YYYYMM-XXXX` (Debit Note)
     - Inventory: `ADJ-YYYY-XXXX` / `MOV-YYYYMM-XXXX`
     - Expenses: `EXP-YYYYMM-XXXX`
     - Reversals: Original business document number (e.g., `BILL-202610-0001`), with original document retained in narration.
     - Manual Journals: Accounting entry identifier `JE-YYYYMM-XXXX`.
  4. **Fallback Hierarchy:**
     - `1.` Actual source document / business number
     - `2.` Extracted canonical document pattern from narration/description
     - `3.` Journal entry number if no business document exists
     - `4.` Safe short technical reference only as absolute last resort (`REF-XXXXXXXX` or `—`)
  5. **Performance / N+1 Prevention:** All resolution is performed server-side in batch groups chunked by module (1 query per source module), resolving thousands of rows in single-digit milliseconds.

---

### Clickable Business Reference & Transaction Navigation System
- **Central Resolver:** `src/shared/utils/transaction-navigation-resolver.ts` (`resolveTransactionTarget()`, `isNonClickableReference()`)
- **Shared Reference Components:** `src/shared/components/BusinessReferenceLink.tsx` (`<BusinessReferenceLink />`, `<DescriptionWithReference />`)
- **Modal & Context Provider:** `src/shared/components/UniversalTransactionModal.tsx`, `src/shared/context/transaction-viewer-context.tsx` (`TransactionViewerProvider`, `useTransactionViewer()`)
- **Lookup Endpoint:** `src/app/api/transactions/lookup/route.ts` (`GET /api/transactions/lookup?ref=...`)
- **Architecture & Rules for Future Development:**
  1. **Dual System Division of Responsibilities:**
     - `BusinessReferenceResolver`: Handles DISPLAY identity (UUID -> human-readable reference `ORD-`, `BILL-`, `JE-`, etc.).
     - `TransactionNavigationResolver`: Handles CLICK destination (reference / ID -> transaction modal / drill-down).
  2. **Internal ID Priority:**
     - When rendering clickable links on ledgers, always provide internal IDs (`sourceDocumentId`, `journalEntryId`) when available alongside `businessReference` so navigation is deterministic and bypasses text search.
  3. **Universal Component Usage:**
     - In ledger tables and voucher columns: Use `<BusinessReferenceLink businessReference={ref} sourceDocumentId={docId} journalEntryId={journalId} sourceModule={module} />`.
     - In narrative/description columns: Use `<DescriptionWithReference text={description} sourceModule={module} sourceDocumentId={docId} />` to make ONLY recognized document codes clickable while preserving surrounding text.
  4. **Supported Source Transactions:**
     - `BILL-...` -> Purchase Bill detail & GL breakdown modal
     - `ORD-...` / `INV-...` -> Sales Order / Van Invoice detail & GL breakdown modal
     - `PR-...` / `PAY-...` / `PV-...` -> Payment Received / Payment Made transaction detail modal
     - `SR-...` -> Sale Return (Credit Note) detail modal
     - `PRN-...` / Debit Note -> Purchase Return detail modal
     - `EXP-...` -> Operating Expense voucher & GL breakdown modal
     - `ADJ-...` -> Stock Adjustment audit modal
     - `JE-...` / `JV-...` -> Double-entry Journal Voucher detail modal
  5. **Context Preservation:**
     - Universal modal renders on top of active ledger / statement views without resetting page state, search queries, pagination, or date filters.
  6. **Print & CSV Safety:**
     - In CSV exports: Business references remain clean, unadorned text without HTML markup or links.
     - On print sheets: `<BusinessReferenceLink>` renders clean, non-underlined plain text without action icons (`print:text-inherit print:no-underline`).
  7. **Security & Isolation:**
     - All transaction detail fetches strictly enforce tenant company ID isolation and user permissions.

---

*(End of Fast Change Target Index — Always check this file first before touching any code)*


