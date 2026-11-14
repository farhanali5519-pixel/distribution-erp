# SaleFlow ERP — Permanent Codebase Architecture Map & Master Index

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
Whenever future development:
- Creates a new route
- Creates a new module or submodule
- Changes system architecture
- Moves, renames, or splits files
- Changes shared dependency ownership or critical shared components

Antigravity **MUST** update `docs/SALEFLOW_CODEBASE_MAP.md` and/or `docs/SALEFLOW_CHANGE_TARGET_INDEX.md` as part of that **SAME** task before completing. For normal UI adjustments where file ownership and paths do not change, do not modify these indexes unnecessarily.

---

## 1. CURRENT PRODUCTION & RUNTIME FACTS

| Parameter | Current Value / Architecture Fact |
|---|---|
| **Framework** | Next.js 16.3.8 (App Router), React 19, TypeScript 5.9 |
| **Node.js Target** | Node.js v22+ / v24+ (uses built-in `node:sqlite` via `DatabaseSync`) |
| **Active Production Target** | **Hostinger Business Web Hosting** (Node.js application container) |
| **Deployment Mode** | `DEPLOYMENT_MODE=hostinger` (also supports `onpremise` and `cloud`) |
| **Production Database** | **SQLite** (`DATABASE_DRIVER=sqlite`) |
| **Database File Path** | Resolved via `SALEFLOW_DATA_DIR` or `SQLITE_DATABASE_PATH` default: `data/sales_distribution.db` |
| **Hostinger Standalone Directory** | `.hostinger/` (compiled via `scripts/build-hostinger-bundle.mjs`) |
| **Hostinger Runtime Entry** | `.hostinger/server.js` |
| **Persistent Data Storage** | `SALEFLOW_DATA_DIR` (must point to persistent disk outside ephemeral deployment folders) |
| **Git Deployment Branch** | `hostinger/main` (track and push ONLY to `hostinger main`) |
| **Protected Git Remote** | `origin` (NEVER push to `origin` unless explicitly requested by the user) |
| **Secret Management** | All credentials in `.env` / server environment; NEVER hardcode or expose secrets |
| **Test Database Isolation** | Tests **MUST NEVER** use `data/sales_distribution.db`. Tests must use temporary isolated SQLite databases or mocks. |

---

## 2. PROJECT ARCHITECTURE

### 2.1 Next.js App Router Structure
SaleFlow is structured under `src/app/` leveraging the Next.js App Router:
- **`src/app/layout.tsx`**: Universal Root Layout. Injects global CSS (`globals.css`), initializes system modules via `initializeSystemModules()`, mounts `<DynamicFavicon />`, `<DynamicDocumentTitle />`, and inline theme script.
- **`src/app/(dashboard)/`**: Tenant ERP Protected Workspace. Uses route grouping `(dashboard)` so all business routes share `src/app/(dashboard)/layout.tsx`.
- **`src/app/superadmin/`**: Platform Vendor Super Admin Workspace. Managed by `src/app/superadmin/layout.tsx`.
- **`src/app/login/`**: Tenant sign-in page (`TenantLoginClient.tsx`).
- **`src/app/superadmin/login/`**: Super Admin sign-in & 2FA page (`SuperAdminLoginClient.tsx`).
- **`src/app/setup/`**: First-run administrator initialization wizard (`page.tsx`).
- **`src/app/api/`**: Next.js Route Handlers (`route.ts`) implementing REST APIs for both tenant ERP and platform superadmin.

### 2.2 Server vs. Client Components Boundary
- **Server Components (Default):**
  - All `layout.tsx` files (`src/app/layout.tsx`, `src/app/(dashboard)/layout.tsx`, `src/app/superadmin/layout.tsx`).
  - Route page entrypoints that fetch tenant context, company metadata, or initial branding on the server before streaming HTML.
  - Page wrappers that check authentication or redirect unauthenticated users.
- **Client Components (`'use client'`):**
  - Interactive UI forms, searchable selects, and modals (`SearchableSelect.tsx`, `NumericValue.tsx`, `PaginationControls.tsx`, `CreateLauncherModal.tsx`).
  - State managers: `AuthProvider` (`src/shared/context/auth-context.tsx`), `FeatureFlagsProvider` (`src/shared/context/feature-flags-context.tsx`).
  - Dynamic visual brand injectors: `DynamicDocumentTitle.tsx`, `DynamicFavicon.tsx`, `ThemeStyleInjector.tsx`, `ApplicationPreloader.tsx`, `BrandIdentity.tsx`.
  - Feature client shells: `TenantLoginClient.tsx`, `SuperAdminLoginClient.tsx`, `ChartOfAccountsClient.tsx`, `SalesAnalysisClient.tsx`, `StockAnalysisClient.tsx`.

### 2.3 Global Layout Hierarchy
```
src/app/layout.tsx (Root HTML, head, dynamic metadata, document title, global fonts)
│
├── src/app/login/page.tsx (Tenant Login)
├── src/app/setup/page.tsx (Initial Setup Wizard)
│
├── src/app/superadmin/layout.tsx (Super Admin Container, Deep Navy theme)
│   ├── SuperAdminSidebar.tsx
│   ├── SuperAdminHeader.tsx
│   └── src/app/superadmin/*/page.tsx (Companies, Users, Modules, Branding, Security, Audit, Licensing)
│
└── src/app/(dashboard)/layout.tsx (Tenant ERP Shell)
    ├── FeatureFlagsProvider + AuthProvider
    ├── ThemeStyleInjector + DynamicDocumentTitle + ApplicationPreloader
    ├── DashboardSidebar.tsx (Dynamic module/submodule navigation)
    ├── Header Topbar (Company name, breadcrumb, CreateLauncherModal, ThemeToggle)
    └── RouteAccessGuard.tsx (403 sub-module access control barrier)
        └── src/app/(dashboard)/*/page.tsx (Sales, Purchase, Inventory, Accounts, Payments, Reports, Setup)
```

### 2.4 Middleware Architecture (`src/middleware.ts`)
Edge middleware executes on every incoming HTTP request (except static assets `_next/*`, `favicon.ico`, static files):
1. **Apex Domain Handling (`salesflow.space`, `www.salesflow.space`):**
   - Redirects `www.salesflow.space` to `salesflow.space`.
   - Strictly reserves apex domain for SaleFlow Vendor Super Admin.
   - Root `/` redirects to `/superadmin` (if session cookie exists) or `/superadmin/login`.
   - Tenant ERP business routes are strictly prohibited on apex domain (redirects to superadmin).
2. **Tenant Subdomain Handling (`<tenant-slug>.salesflow.space`):**
   - Blocks `/superadmin` and `/api/superadmin` on tenant subdomains (returns 403 or redirects to `/`).
   - Authenticates tenant session via cookie `saleflow_session`. If missing and route is protected, redirects to `/login` (or returns 401 for `/api/*`).
   - Injects `x-tenant-slug` request header downstream for tenant context resolution.
3. **On-Premise / Localhost Mode:**
   - In single-tenant offline mode (`DEPLOYMENT_MODE=onpremise`), passes through without domain friction.

### 2.5 Authentication Architecture
SaleFlow features two isolated authentication subsystems:
- **Tenant ERP Users (`src/core/auth/session.ts` & `src/modules/auth/`):**
  - Table: `app_users`
  - Cookie: `saleflow_session` (HMAC signed session token)
  - Endpoints: `/api/auth/session`, `/api/auth/users`, `/api/auth/pin`, `/api/auth/verify-pin`
  - Roles: `ADMIN`, `SALESMAN`, `CASHIER`, `WAREHOUSE`, `ORDER_BOOKER`
  - Permissions: Granular JSON permission map checked via `hasPermission(permKey)` in `auth-context.tsx`.
- **Platform Super Administrators (`src/core/auth/superadmin-session.ts`, `superadmin.service.ts`):**
  - Table: `platform_users`
  - Cookie: `saleflow_superadmin_session` (HMAC signed session token)
  - Endpoints: `/api/superadmin/auth/login`, `/api/superadmin/auth/verify-2fa`, `/api/superadmin/auth/send-email-otp`, `/api/superadmin/auth/logout`, `/api/superadmin/auth/session`
  - Multi-Factor Authentication (2FA) (`src/core/auth/two-factor.service.ts`):
    - TOTP Authenticator apps (Google Authenticator, Microsoft Authenticator)
    - Email OTP with secure transient tokens (`platform_otp_tokens`)
    - Hashed backup recovery codes

### 2.6 Tenancy & Company Isolation Architecture
- **Tenant Context (`src/core/tenancy/context.ts` & `resolver.ts`):**
  - Extracts tenant slug from `x-tenant-slug` header, hostname subdomain, or `DEFAULT_COMPANY_ID` in onpremise mode.
  - Queries `companies` table for tenant validation: checks `status` (`ACTIVE`, `SUSPENDED`, `EXPIRED`, `NOT_FOUND`, `APEX_PLATFORM`).
  - Provides `getTenantContext()` returning `{ companyId, companyName, companySlug, plan, isAuthenticated, status }`.
- **Data Isolation Enforcement (`src/core/tenancy/enforcement.ts`):**
  - All tenant database queries must be scoped to `company_id`.
  - Helper functions `withTenantScope(sql, companyId)` and parameterized queries ensure zero cross-tenant data leakage.

### 2.7 Module Entitlement Architecture
- **Canonical Registry Source of Truth:** `src/core/registry/hierarchical-module-registry.ts`
- **Main Modules (8):** `sales`, `purchase`, `inventory`, `accounts`, `payments`, `reports`, `customers`, `settings`.
- **Submodules (28+):** Technical identifiers formatted as `parentId:childKey` (e.g., `sales:field_order_booking`, `purchase:new_bill`, `inventory:products`, `accounts:coa`).
- **Enforcement Layers:**
  1. **Sidebar Navigation Filter (`DashboardSidebar.tsx`):** Filters navigation groups and items using `isModuleEnabled(submodule.id)` and `isModuleEnabled(mainModule.id)`.
  2. **Route Access Guard (`RouteAccessGuard.tsx`):** Wraps all page content in `(dashboard)/layout.tsx`. If user visits a route for a disabled module/submodule, renders a clean 403 Access Denied lock card.
  3. **API Scope Enforcement:** Submodules define `apiScope` prefixes to block unauthorized API calls.
  4. **Plan Presets (`src/core/tenancy/plans.ts`):** Predefined module packages for `STARTER`, `STANDARD`, `COMMERCIAL`, `PROFESSIONAL`, and `ENTERPRISE`.

### 2.8 Branding & Theme Architecture
- **Central Theme Service:** `src/core/branding/theme.service.ts`
  - `getBrandingConfig(companyId)`: Resolves tenant override from `app_settings` (`branding_config`), falling back to global `SYSTEM` branding, falling back to `DEFAULT_SALEFLOW_BRANDING`.
  - `getResolvedBrandIdentity(companyId)`: Returns single-source-of-truth resolved URLs and colors.
  - `saveBrandingConfig(target, config)`: Saves to `app_settings` (for `SYSTEM` or specific tenant).
- **Persistent Asset Storage (`src/core/branding/storage.ts`):**
  - Stores assets in `path.join(getSaleFlowDataDir(), 'branding', safeTarget)`.
  - Uses `sharp` to auto-compress and optimize uploads:
    - **ERP Logo:** Max 1600x600 px, WebP quality 85, alpha preserved, target size < 500 KB.
    - **Sidebar Logo:** Max 512x512 px, WebP quality 85, square/horizontal fitted.
    - **Favicon:** Square 64x64 px PNG or preserved ICO.
  - Rejects SVGs for security (XSS prevention); enforces magic-byte header validation.
- **Dynamic Client Components:**
  - `BrandIdentity.tsx`: Prioritized fallback rendering (Custom Logo -> Default Logo -> Text Fallback).
  - `ApplicationPreloader.tsx`: Animated breathing preloader when enabled; strictly `null` (zero DOM/flash) when disabled.
  - `DynamicDocumentTitle.tsx`: Keeps browser tab title synced across SPA navigations as `<Page Name> | <Resolved ERP Display Name>`.
  - `DynamicFavicon.tsx`: Dynamically updates `<link rel="icon">`.
  - `ThemeStyleInjector.tsx`: Injects brand primary, secondary, accent colors, and font families as CSS variables.
- **Global Semantic UI Design System:**
  - `src/shared/components/Button.tsx`: Central polymorphic semantic `Button` and `IconButton` component supporting 8 variants (`primary`, `secondary`, `outline`, `ghost`, `success`, `danger`, `danger-outline`, `warning`, `info`) and 5 sizes (`xs`, `sm`, `md`, `lg`, `icon`).
  - `src/app/globals.css`: Central semantic token repository (`--color-primary`, `--color-surface`, `--color-border`, etc.) harmonized across Classic (`#16A46A`) and Modern (`#10B981`) themes in both light and dark modes.
  - Surface hierarchy: `.surface-card`, `.surface-panel`, `.surface-muted`.
  - Chip & banner standards: `.badge-*`, `.alert-*`, and unified `.table` row/header styling.

### 2.9 Database Layer Architecture
- **DAL Factory (`src/core/database/factory.ts`):**
  - Returns `IDatabaseClient` abstraction.
  - Supports `sqlite` (via synchronous `SqliteAdapter` wrapping `node:sqlite`) and `postgres` (via `PostgresAdapter` wrapping `pg`).
  - Read-replica routing support (`getDatabaseClient('read')` vs `getDatabaseClient('write')`).
- **Synchronous SQLite Handle (`src/core/database/db.ts`):**
  - Provides `getDatabase()` returning `DatabaseSync` for existing synchronous services.
  - Enables `PRAGMA foreign_keys = ON;`, `PRAGMA journal_mode = WAL;`, `PRAGMA synchronous = NORMAL;`.
  - Strictly blocked during Next.js build phase (`isBuildPhase()`).
- **Double-Entry General Ledger Engine (`src/core/accounting/engine.ts`):**
  - Strict integer minor-unit arithmetic in **Paisas** (1 PKR = 100 Paisas) via `toPaisas()` / `fromPaisas()`.
  - Enforces `debitPaisas === creditPaisas`.
  - Immutable journal vouchers with reversal records (`is_reversed`, `reversal_of_id`).

### 2.10 Hostinger Production Architecture
- **Standalone Builder (`scripts/build-hostinger-bundle.mjs`):**
  - Compiles Next.js standalone output with `npx next build --webpack` in isolated environment.
  - Assembles standalone output, `.next/static`, and `public` into `.hostinger/`.
  - Excludes all databases, `.env`, logs, and temporary files from the bundle.
- **Runtime Entry:** `.hostinger/server.js` executed by Hostinger Node.js application manager.
- **Data Persistence:** Database and branding assets reside in `SALEFLOW_DATA_DIR` outside the deployed code directory so redeployments never wipe business data.

---

## 3. ROUTE → FILE & COMPONENT INDEX

### 3.1 Tenant ERP Routes

| Route | Page File | Related APIs | Shared Components | Services / Modules | Database Tables | Module Entitlement |
|---|---|---|---|---|---|---|
| **`/`** | `src/app/(dashboard)/page.tsx` | `/api/sales`, `/api/inventory`, `/api/closing/check` | `NumericValue`, `ThemeToggle` | `sales/service.ts`, `inventory/service.ts` | `sales_orders`, `products`, `daily_closings` | *Universal Dashboard* |
| **`/sales`** | `src/app/(dashboard)/sales/page.tsx` | `/api/sales`, `/api/sales/orders`, `/api/sales/bulk-delete` | `ListPageContainer`, `PaginationControls`, `SearchableSelect`, `BulkActionToolbar`, `PrintInvoiceModal` | `modules/sales/service.ts` | `sales_orders`, `sales_order_items`, `customers`, `routes` | `sales:orders` |
| **`/sales/order-booking`** | `src/app/(dashboard)/sales/order-booking/page.tsx` | `/api/sales/orders`, `/api/customers`, `/api/inventory` | `SearchableSelect`, `NumericValue`, `PrintInvoiceModal` | `modules/sales/service.ts`, `shared/utils/uom.ts` | `sales_orders`, `sales_order_items`, `products`, `customers` | `sales:order_booking` |
| **`/sales/field-order-booking`** | `src/app/(dashboard)/sales/field-order-booking/page.tsx` | `/api/sales/field-order-booking`, `/api/customers`, `/api/inventory` | `SearchableSelect`, `NumericValue` | `modules/sales/service.ts`, `shared/utils/uom.ts` | `sales_orders`, `sales_order_items`, `customers`, `products` | `sales:field_order_booking` |
| **`/sales/direct-sale`** | `src/app/(dashboard)/sales/direct-sale/page.tsx` | `/api/sales/direct`, `/api/customers`, `/api/inventory` | `SearchableSelect`, `NumericValue`, `PrintInvoiceModal` | `modules/sales/service.ts`, `inventory/service.ts` | `sales_invoices`, `sales_invoice_items`, `inventory_movements`, `journal_entries` | `sales:direct_sale` |
| **`/sales/returns`** | `src/app/(dashboard)/sales/returns/page.tsx` | `/api/returns/sales`, `/api/returns/customer-eligibility` | `SearchableSelect`, `NumericValue`, `PaginationControls` | `modules/returns/service.ts`, `core/accounting/engine.ts` | `sales_returns`, `sales_return_items`, `inventory_movements`, `journal_entries` | `sales:customer_returns` |
| **`/sales/collections`** | `src/app/(dashboard)/sales/collections/page.tsx` | `/api/sales/collections`, `/api/customers`, `/api/routes` | `SearchableSelect`, `NumericValue`, `PaginationControls` | `modules/sales/collections.service.ts` | `customer_payments`, `customers`, `routes`, `journal_entries` | `payments:collections` |
| **`/dispatch/load-sheet`** | `src/app/(dashboard)/dispatch/load-sheet/page.tsx` | `/api/dispatch/load-sheet`, `/api/routes`, `/api/staff` | `SearchableSelect`, `NumericValue` | `modules/sales/service.ts`, `shared/utils/uom.ts` | `sales_orders`, `sales_order_items`, `routes`, `staff_members` | `sales:load_sheet` |
| **`/purchase/new-bill`** | `src/app/(dashboard)/purchase/new-bill/page.tsx` | `/api/purchase/bills`, `/api/vendors`, `/api/inventory` | `SearchableSelect`, `NumericValue` | `modules/purchase/service.ts`, `inventory/service.ts` | `purchase_bills`, `purchase_bill_items`, `inventory_movements`, `journal_entries` | `purchase:new_bill` |
| **`/purchase/orders-detail`** | `src/app/(dashboard)/purchase/orders-detail/page.tsx` | `/api/purchase/bills`, `/api/purchase/bills/[id]/void`, `/api/purchase/bills/bulk-delete` | `ListPageContainer`, `PaginationControls`, `SearchableSelect`, `BatchPrintPurchaseModal` | `modules/purchase/service.ts` | `purchase_bills`, `purchase_bill_items`, `vendors` | `purchase:orders_detail` |
| **`/purchase/returns`** | `src/app/(dashboard)/purchase/returns/page.tsx` | `/api/returns/purchase` | `SearchableSelect`, `NumericValue`, `PaginationControls` | `modules/returns/service.ts` | `purchase_returns`, `purchase_return_items`, `inventory_movements`, `journal_entries` | `purchase:vendor_returns` |
| **`/purchase/vendors`** | `src/app/(dashboard)/purchase/vendors/page.tsx` | `/api/vendors` | `ListPageContainer`, `PaginationControls`, `NumericValue` | `modules/customers/service.ts` | `vendors` | `customers:vendors` |
| **`/inventory/products`** | `src/app/(dashboard)/inventory/products/page.tsx` | `/api/inventory`, `/api/inventory/categories`, `/api/inventory/brands` | `ListPageContainer`, `PaginationControls`, `SearchableSelect`, `NumericValue` | `modules/inventory/service.ts`, `shared/utils/uom.ts` | `products`, `categories`, `brands` | `inventory:products` |
| **`/inventory/audit-ledger`** | `src/app/(dashboard)/inventory/audit-ledger/page.tsx` | `/api/inventory/audit/movements`, `/api/inventory/audit/kpis` | `ListPageContainer`, `PaginationControls`, `SearchableSelect`, `NumericValue` | `modules/inventory/audit.service.ts` | `inventory_movements`, `products` | `inventory:audit_ledger` |
| **`/accounting/coa`** | `src/app/(dashboard)/accounting/coa/page.tsx` | `/api/accounting/coa`, `/api/accounting/coa/import` | `ChartOfAccountsClient`, `AccountModal`, `SubAccountModal`, `AccountLedgerModal` | `modules/accounts/index.ts`, `core/accounting/engine.ts` | `chart_of_accounts`, `journal_lines` | `accounts:coa` |
| **`/accounting/journal`** | `src/app/(dashboard)/accounting/journal/page.tsx` | `/api/accounting/journal`, `/api/accounting/journal/void` | `ListPageContainer`, `PaginationControls`, `SearchableSelect`, `NumericValue` | `core/accounting/engine.ts` | `journal_entries`, `journal_lines`, `chart_of_accounts` | `accounts:journal` |
| **`/accounting/trial-balance`** | `src/app/(dashboard)/accounting/trial-balance/page.tsx` | `/api/accounting/trial-balance` | `NumericValue` | `core/accounting/engine.ts` | `chart_of_accounts`, `journal_lines` | `accounts:trial_balance` |
| **`/accounting/banks`** | `src/app/(dashboard)/accounting/banks/page.tsx` | `/api/banking/accounts`, `/api/banking/coa-options` | `SearchableSelect`, `NumericValue`, `PaginationControls` | `modules/banking/service.ts` | `bank_accounts`, `chart_of_accounts` | `customers:banks` |
| **`/payments/received`** | `src/app/(dashboard)/payments/received/page.tsx` | `/api/payments/received`, `/api/payments/received/invoices` | `ListPageContainer`, `PaginationControls`, `SearchableSelect`, `NumericValue` | `modules/payments/service.ts`, `core/accounting/engine.ts` | `customer_payments`, `customer_payment_allocations`, `sales_orders`, `journal_entries` | `payments:received` |
| **`/payments/made`** | `src/app/(dashboard)/payments/made/page.tsx` | `/api/payments/made`, `/api/payments/made/bills` | `ListPageContainer`, `PaginationControls`, `SearchableSelect`, `NumericValue` | `modules/payments/service.ts`, `core/accounting/engine.ts` | `vendor_payments`, `vendor_payment_allocations`, `purchase_bills`, `journal_entries` | `payments:made` |
| **`/expenses`** | `src/app/(dashboard)/expenses/page.tsx` | `/api/expenses`, `/api/expenses/[id]/void` | `ListPageContainer`, `PaginationControls`, `SearchableSelect`, `NumericValue` | `modules/expenses/service.ts`, `core/accounting/engine.ts` | `expenses`, `chart_of_accounts`, `staff_members`, `journal_entries` | `payments:expenses` |
| **`/closing/daily-summary`** | `src/app/(dashboard)/closing/daily-summary/page.tsx` | `/api/closing/check`, `/api/closing/finalize`, `/api/closing/reconciliation` | `NumericValue` | `modules/closing/service.ts` | `daily_closings`, `sales_orders`, `customer_payments`, `expenses` | `payments:closing` |
| **`/customers`** | `src/app/(dashboard)/customers/page.tsx` | `/api/customers`, `/api/customers/credit-check` | `ListPageContainer`, `PaginationControls`, `SearchableSelect`, `NumericValue` | `modules/customers/service.ts` | `customers`, `routes` | `customers:customers` |
| **`/settings/routes`** | `src/app/(dashboard)/settings/routes/page.tsx` | `/api/routes` | `ListPageContainer`, `PaginationControls`, `SearchableSelect` | `modules/routes/service.ts` | `routes`, `staff_members` | `customers:routes` |
| **`/settings/staff`** | `src/app/(dashboard)/settings/staff/page.tsx` | `/api/staff` | `ListPageContainer`, `PaginationControls`, `SearchableSelect` | `modules/settings/company-service.ts` | `staff_members`, `routes` | `customers:staff` |
| **`/settings/company`** | `src/app/(dashboard)/settings/company/page.tsx` | `/api/settings/company` | `BrandIdentity` | `modules/settings/company-service.ts` | `company_profile` | `customers:company` |
| **`/reports/sales-analysis`** | `src/app/(dashboard)/reports/sales-analysis/page.tsx` | `/api/reports/sales-analysis` | `SalesAnalysisClient`, `SearchableSelect`, `NumericValue`, `DateRangeFilter` | `modules/reports/sales-analysis.service.ts` | `sales_orders`, `sales_order_items`, `customers`, `routes` | `reports:sales_analysis` |
| **`/reports/stock-analysis`** | `src/app/(dashboard)/reports/stock-analysis/page.tsx` | `/api/reports/stock-analysis` | `StockAnalysisClient`, `SearchableSelect`, `NumericValue` | `modules/reports/stock-analysis.service.ts` | `inventory_movements`, `products` | `reports:stock_analysis` |
| **`/reports/stock-valuation`** | `src/app/(dashboard)/reports/stock-valuation/page.tsx` | `/api/reports/stock-valuation` | `NumericValue`, `SearchableSelect` | `modules/reports/service.ts` | `products`, `categories`, `brands` | `reports:stock_valuation` |
| **`/reports/bank-statement`** | `src/app/(dashboard)/reports/bank-statement/page.tsx` | `/api/reports/bank-statement` | `SearchableSelect`, `NumericValue`, `DateRangeFilter` | `modules/reports/service.ts`, `modules/banking/service.ts` | `journal_lines`, `bank_accounts`, `journal_entries` | `reports:bank_statement` |
| **`/reports/ledgers`** | `src/app/(dashboard)/reports/ledgers/page.tsx` | `/api/reports/ledgers` | `SearchableSelect`, `NumericValue`, `DateRangeFilter` | `modules/reports/service.ts`, `core/accounting/engine.ts` | `journal_lines`, `customers`, `vendors` | `reports:ledgers` |
| **`/reports/profit-and-loss`** | `src/app/(dashboard)/reports/profit-and-loss/page.tsx` | `/api/reports/profit-and-loss` | `NumericValue`, `DateRangeFilter` | `modules/reports/service.ts`, `core/accounting/engine.ts` | `journal_lines`, `chart_of_accounts` | `reports:profit_loss` |
| **`/reports/salesman-performance`** | `src/app/(dashboard)/reports/salesman-performance/page.tsx` | `/api/reports/salesman-performance` | `SearchableSelect`, `NumericValue`, `DateRangeFilter` | `modules/reports/service.ts` | `sales_orders`, `customer_payments`, `staff_members` | `reports:salesman_performance` |
| **`/settings/users`** | `src/app/(dashboard)/settings/users/page.tsx` | `/api/auth/users`, `/api/auth/users/[id]/permissions` | `ManagePermissionsModal`, `SearchableSelect` | `modules/auth/service.ts`, `modules/auth/permissions-registry.ts` | `app_users`, `staff_members` | `settings:users` |
| **`/modules`** | `src/app/(dashboard)/modules/page.tsx` | `/api/modules` | `Badge`, `Card` | `core/registry/hierarchical-module-registry.ts` | `company_modules`, `system_modules` | `settings:modules` |
| **`/settings/features`** | `src/app/(dashboard)/settings/features/page.tsx` | `/api/settings/features` | `Toggle` | `core/settings/flags.ts` | `feature_flags` | `settings:features` |
| **`/settings/backup`** | `src/app/(dashboard)/settings/backup/page.tsx` | `/api/backup`, `/api/backup/download`, `/api/backup/list`, `/api/backup/restore` | `Card`, `Button` | `lib/backup/backup-service.ts` | *Database file snapshots* | `settings:backup` |
| **`/settings/system-info`** | `src/app/(dashboard)/settings/system-info/page.tsx` | `/api/system/info` | `Card`, `Badge` | `core/licensing/license.service.ts`, `core/config/env.ts` | `system_license` | `settings:system_info` |
| **`/login`** | `src/app/login/page.tsx` | `/api/auth/session` | `TenantLoginClient`, `BrandIdentity` | `core/auth/session.ts` | `app_users`, `companies` | *Public Route* |
| **`/setup`** | `src/app/setup/page.tsx` | `/api/setup` | `BrandIdentity` | `modules/init.ts` | `app_users`, `companies` | *First-Run Only* |

---

### 3.2 Super Admin Platform Routes

| Route | Page File | Related APIs | Shared Components | Services / Modules | Database Tables | Role Required |
|---|---|---|---|---|---|---|
| **`/superadmin`** | `src/app/superadmin/page.tsx` | `/api/superadmin/dashboard/stats` | `SuperAdminDashboardClient`, `SuperAdminHeader`, `SuperAdminSidebar` | `core/auth/superadmin.service.ts` | `companies`, `platform_users`, `audit_logs` | `SUPER_ADMIN` |
| **`/superadmin/companies`** | `src/app/superadmin/companies/page.tsx` | `/api/superadmin/companies` | `PaginationControls`, `SearchableSelect` | `core/tenancy/company-provisioning.service.ts` | `companies`, `company_modules` | `SUPER_ADMIN` |
| **`/superadmin/companies/[id]`** | `src/app/superadmin/companies/[id]/page.tsx` | `/api/superadmin/companies/[id]/*` | `CompanyDetailClient`, `BrandIdentity` | `core/tenancy/company-provisioning.service.ts` | `companies`, `company_modules`, `app_users` | `SUPER_ADMIN` |
| **`/superadmin/users`** | `src/app/superadmin/users/page.tsx` | `/api/superadmin/users` | `PaginationControls` | `core/auth/superadmin.service.ts` | `platform_users` | `SUPER_ADMIN` |
| **`/superadmin/modules`** | `src/app/superadmin/modules/page.tsx` | `/api/superadmin/companies/[id]/modules` | `Card`, `Switch` | `core/registry/hierarchical-module-registry.ts` | `company_modules`, `system_modules` | `SUPER_ADMIN` |
| **`/superadmin/branding`** | `src/app/superadmin/branding/page.tsx` | `/api/superadmin/branding`, `/api/superadmin/branding/upload` | `BrandIdentity`, `ApplicationPreloader`, `ThemeStyleInjector` | `core/branding/theme.service.ts`, `core/branding/storage.ts` | `app_settings` (`branding_config`) | `SUPER_ADMIN` |
| **`/superadmin/security`** | `src/app/superadmin/security/page.tsx` | `/api/superadmin/security/policy`, `totp/setup`, `recovery-codes` | `Card`, `Button` | `core/auth/two-factor.service.ts` | `platform_users` | `SUPER_ADMIN` |
| **`/superadmin/audit`** | `src/app/superadmin/audit/page.tsx` | `/api/superadmin/audit` | `PaginationControls`, `DateRangeFilter` | `core/audit/superadmin-audit.service.ts` | `audit_logs` | `SUPER_ADMIN` |
| **`/superadmin/licensing`** | `src/app/superadmin/licensing/page.tsx` | `/api/superadmin/companies/[id]/license` | `Card`, `Badge` | `core/licensing/license.service.ts` | `system_license` | `SUPER_ADMIN` |
| **`/superadmin/settings`** | `src/app/superadmin/settings/page.tsx` | `/api/superadmin/settings` | `Card`, `Input` | `core/settings/company-settings.ts` | `app_settings` | `SUPER_ADMIN` |
| **`/superadmin/login`** | `src/app/superadmin/login/page.tsx` | `/api/superadmin/auth/login`, `verify-2fa`, `send-email-otp` | `SuperAdminLoginClient`, `BrandIdentity` | `core/auth/superadmin.service.ts`, `two-factor.service.ts` | `platform_users`, `platform_otp_tokens` | *Public Route* |

---

## 4. BRANDING ARCHITECTURE MAP

SaleFlow features an enterprise visual identity system with instant client synchronization and server-side image optimization.

```
Super Admin: /superadmin/branding
   │
   ├── Default ERP Display Name (e.g. "SaleFlow ERP" or custom tenant name)
   ├── Main ERP Logo (WebP auto-optimized <= 1600x600 px)
   ├── Sidebar Logo (Optional separate mark, WebP <= 512x512 px)
   ├── Favicon (Square PNG 64x64 or ICO)
   ├── Animated Preloader (Toggle ON / OFF)
   ├── Font Family (Approved typography: Inter, Roboto, Outfit, etc.)
   ├── Numeric Font & Digits (Tabular lining nums standard)
   ├── Color Tokens (Primary, Secondary, Accent, Backgrounds)
   └── Application UI Theme (Classic SaleFlow vs Modern Blue-Green switch)
   │
   ▼
Stored in app_settings (WHERE company_id = 'SYSTEM' or tenantId, key = 'branding_config')
   │
   ▼
Persistent Image Storage: SALEFLOW_DATA_DIR/branding/<safeTarget>/
   │
   ├── Served by: /api/branding/assets/[type]?targetId=...&v=...
   │
   ▼
Injected Runtime Components:
   ├── DynamicDocumentTitle.tsx -> document.title = "<Page> | <Resolved Display Name>"
   ├── DynamicFavicon.tsx -> <link rel="icon" href="/api/branding/assets/favicon?v=...">
   ├── ThemeStyleInjector.tsx -> CSS variables (--primary, --accent, --font-family) & data-ui-theme
   ├── ApplicationPreloader.tsx -> True OFF state (null) or breathing logo animation
   └── BrandIdentity.tsx -> Sidebar / Header / Login logo and text fallback cascade
```

### 4.1 Exact Files Controlling Branding:
- **Application UI Theme (Switchable):** `src/core/branding/theme.ts` (`UiTheme`, `APPROVED_UI_THEMES`), `src/core/branding/theme.service.ts`, `src/app/superadmin/branding/page.tsx`, `src/app/globals.css` (`[data-ui-theme="modern"]`), `src/core/branding/ThemeStyleInjector.tsx`, `src/app/layout.tsx`. Supports live preview and instant switching between Classic SaleFlow and Modern Blue-Green without redeploy.
- **Default ERP Display Name:** `src/core/branding/theme.service.ts` (`displayName`), `src/app/superadmin/branding/page.tsx`, `src/core/branding/DynamicDocumentTitle.tsx`.
- **Main Logo Upload & Processing:** `src/core/branding/storage.ts` (`validateImageMagicBytes`, `processAndOptimizeAsset`), `src/app/api/superadmin/branding/upload/route.ts`.
- **Sidebar Logo (Optional Separate Mark):** `src/core/branding/storage.ts` (`ALLOWED_SIDEBAR_LOGO_EXTENSIONS`, `MAX_SIDEBAR_LOGO_WIDTH`), `src/core/branding/BrandIdentity.tsx` (`isSidebar`).
- **Favicon Upload & Serving:** `src/core/branding/storage.ts` (`FAVICON_TARGET_SIZE`), `src/core/branding/DynamicFavicon.tsx`, `src/app/api/branding/assets/[type]/route.ts`.
- **Preloader ON/OFF Control:** `src/core/branding/ApplicationPreloader.tsx` (rule: when `preloaderEnabled === false`, renders `null` synchronously on SSR & client).
- **Text & Numeric Fonts:** `src/core/branding/theme.ts` (`APPROVED_FONTS`, `APPROVED_NUMERIC_FONTS`, `getFontFamilyCss`), `src/shared/components/NumericValue.tsx`, `src/shared/utils/formatting.ts`.
- **Colors & Theme Tokens:** `src/core/branding/theme.ts` (`DEFAULT_SALEFLOW_BRANDING`), `src/core/branding/ThemeStyleInjector.tsx`.
- **BrandIdentity Component:** `src/core/branding/BrandIdentity.tsx` (implements candidate waterfall: uploaded logo -> company logo -> text fallback; never displays broken image icon).
- **Page Titles & Metadata:** `src/core/branding/route-titles.ts`, `src/app/layout.tsx` (`generateMetadata`), `src/app/(dashboard)/layout.tsx` (`generateMetadata`).
- **Tenant Branding Inheritance:** `src/core/branding/theme.service.ts` (`getBrandingConfig`). If a tenant does not upload a custom logo/favicon, it inherits the global `SYSTEM` branding seamlessly. Tenants inherit the global UI shell theme setting.

---

## 5. MODULE ENTITLEMENT & SECURITY MAP

### 5.1 Single Source of Truth Registry
- **File:** `src/core/registry/hierarchical-module-registry.ts`
- Exports `HIERARCHICAL_MODULES`: Main modules with their granular child submodules.
- Helper functions:
  - `findSubmoduleByRoute(pathname)`: Two-pass deterministic route resolution (exact match first, longest prefix second).
  - `findSubmoduleById(id)`: Looks up canonical `parentId:childKey` (e.g. `sales:field_order_booking`) or legacy ID (`field_order_booking`).
  - `getAllSubmoduleIds()` / `getAllMainModuleIds()`: System enumeration.

### 5.2 Canonical Entitlement ID Directory

| Main Module ID | Main Module Label | Submodule Canonical ID | Submodule Label | Routes Governed | Primary API Scope |
|---|---|---|---|---|---|
| `sales` | Sales & Distribution | `sales:field_order_booking` | Field Order Booking | `/sales/field-order-booking` | `/api/sales/field-order-booking` |
| `sales` | Sales & Distribution | `sales:order_booking` | Order Booking | `/sales/order-booking` | `/api/sales/order-booking` |
| `sales` | Sales & Distribution | `sales:orders` | Orders & Commercial Bills | `/sales` | `/api/sales/orders`, `/api/sales` |
| `sales` | Sales & Distribution | `sales:direct_sale` | Direct Van Sale | `/sales/direct-sale` | `/api/sales/direct` |
| `sales` | Sales & Distribution | `sales:customer_returns` | Customer Sales Returns | `/sales/returns`, `/returns/sales`, `/returns` | `/api/returns/sales` |
| `sales` | Sales & Distribution | `sales:load_sheet` | Route Load Sheet | `/dispatch/load-sheet`, `/dispatch` | `/api/dispatch` |
| `purchase` | Purchase & Vendor Bills | `purchase:new_bill` | New Purchase Bill | `/purchase/new-bill` | `/api/purchase/bills` |
| `purchase` | Purchase & Vendor Bills | `purchase:orders_detail` | Purchase Bills Detail | `/purchase/orders-detail`, `/purchase` | `/api/purchase/bills` |
| `purchase` | Purchase & Vendor Bills | `purchase:vendor_returns` | Vendor Purchase Returns | `/purchase/returns`, `/returns/purchase` | `/api/returns/purchase` |
| `inventory` | Stock & Inventory Master | `inventory:products` | Products & Pricing Master | `/inventory/products`, `/inventory` | `/api/inventory` |
| `inventory` | Stock & Inventory Master | `inventory:audit_ledger` | Inventory Audit & Stock Ledger | `/inventory/audit-ledger` | `/api/inventory/audit` |
| `accounts` | General Ledger / Accounts | `accounts:coa` | Chart of Accounts | `/accounting/coa` | `/api/accounting/coa` |
| `accounts` | General Ledger / Accounts | `accounts:journal` | General Ledger & Journals | `/accounting/journal` | `/api/accounting/journal` |
| `accounts` | General Ledger / Accounts | `accounts:trial_balance` | Trial Balance | `/accounting/trial-balance` | `/api/accounting/trial-balance` |
| `payments` | Payments & Cash Management | `payments:received` | Payment Received | `/payments/received` | `/api/payments/received` |
| `payments` | Payments & Cash Management | `payments:made` | Payment Made | `/payments/made` | `/api/payments/made` |
| `payments` | Payments & Cash Management | `payments:collections` | Route Collections | `/sales/collections` | `/api/sales/collections` |
| `payments` | Payments & Cash Management | `payments:expenses` | Daily Expenses | `/expenses` | `/api/expenses` |
| `payments` | Payments & Cash Management | `payments:closing` | Daily Cash Closing | `/closing/daily-summary`, `/closing` | `/api/closing` |
| `reports` | Reports & Business Intelligence | `reports:sales_analysis` | Sales Analysis Report | `/reports/sales-analysis` | `/api/reports/sales-analysis` |
| `reports` | Reports & Business Intelligence | `reports:stock_analysis` | Stock & Booking Analysis | `/reports/stock-analysis` | `/api/reports/stock-analysis` |
| `reports` | Reports & Business Intelligence | `reports:bank_statement` | Bank Statement | `/reports/bank-statement` | `/api/reports/bank-statement`, `/api/banking/statement` |
| `reports` | Reports & Business Intelligence | `reports:ledgers` | Party Ledgers (Khata) | `/reports/ledgers` | `/api/reports/ledgers` |
| `reports` | Reports & Business Intelligence | `reports:profit_loss` | Profit & Loss Statement | `/reports/profit-and-loss` | `/api/reports/profit-and-loss` |
| `reports` | Reports & Business Intelligence | `reports:stock_valuation` | Stock Valuation Report | `/reports/stock-valuation` | `/api/reports/stock-valuation` |
| `reports` | Reports & Business Intelligence | `reports:salesman_performance` | Salesman Recovery Performance | `/reports/salesman-performance` | `/api/reports/salesman-performance` |
| `customers` | Customer & Route Management | `customers:banks` | Bank Accounts Master | `/accounting/banks`, `/settings/banks`, `/payments/banks` | `/api/accounting/banks` |
| `customers` | Customer & Route Management | `customers:routes` | Route & Territory Master | `/settings/routes`, `/routes` | `/api/routes` |
| `customers` | Customer & Route Management | `customers:customers` | Customers & Retail Outlets | `/customers` | `/api/customers` |
| `customers` | Customer & Route Management | `customers:vendors` | Vendor / Supplier Master | `/purchase/vendors` | `/api/purchase/vendors` |
| `customers` | Customer & Route Management | `customers:staff` | Sales & Delivery Team | `/settings/staff` | `/api/staff` |
| `customers` | Customer & Route Management | `customers:company` | Company Profile & Print Setup | `/settings/company` | `/api/settings/company` |
| `settings` | System Settings & Administration | `settings:users` | User Management & Security | `/settings/users` | `/api/users`, `/api/settings/users` |
| `settings` | System Settings & Administration | `settings:modules` | Module Registry | `/modules` | `/api/modules` |
| `settings` | System Settings & Administration | `settings:features` | Feature Flags | `/settings/features` | `/api/features` |
| `settings` | System Settings & Administration | `settings:backup` | Database Backup & Recovery | `/settings/backup` | `/api/backup` |
| `settings` | System Settings & Administration | `settings:system_info` | System & Commercial Licensing | `/settings/system-info` | `/api/system-info` |

---

## 6. DATABASE ARCHITECTURE MAP

### 6.1 Database Engine & Initialization
- **Driver Factory:** `src/core/database/factory.ts`
- **SQLite Adapter:** `src/core/database/adapters/sqlite.adapter.ts`
- **Postgres Adapter:** `src/core/database/adapters/postgres.adapter.ts`
- **Synchronous SQLite Accessor:** `src/core/database/db.ts` (`getDatabase()`)
- **Schema & Migrations:** `src/core/database/schema.ts` (`CREATE_TABLES_SQL`, `applyRefactorMigrations`) and `src/core/database/migration-runner.ts`.
- **Hostinger Production Path Handling:** Configured via `SALEFLOW_DATA_DIR` in `src/core/config/env.ts`. SQLite database file is located at `path.join(getSaleFlowDataDir(), 'sales_distribution.db')`.
- **Test Database Isolation Rule:** Test scripts **MUST** define `SQLITE_DATABASE_PATH` to a temporary file (e.g. `data/test_isolated.db` or in `os.tmpdir()`). **NEVER** run automated tests against the primary database.

### 6.2 Key Database Tables & Service Ownership

| Table Name | Description & Purpose | Primary Services / Modules | Primary API Routes |
|---|---|---|---|
| `companies` | Multi-tenant tenant accounts, status, plan, subscription dates | `core/tenancy/company-provisioning.service.ts` | `/api/superadmin/companies` |
| `company_modules` | Per-tenant module and submodule enablement records | `core/registry/module-registry.ts` | `/api/superadmin/companies/[id]/modules` |
| `platform_users` | Vendor Super Admin platform users, 2FA credentials | `core/auth/superadmin.service.ts`, `two-factor.service.ts` | `/api/superadmin/users`, `/api/superadmin/auth/*` |
| `platform_otp_tokens` | Transient 6-digit email OTPs for Super Admin login | `core/auth/two-factor.service.ts` | `/api/superadmin/auth/send-email-otp` |
| `app_users` | Tenant ERP operator accounts, passwords, RBAC permissions | `modules/auth/service.ts` | `/api/auth/users`, `/api/auth/session` |
| `chart_of_accounts` | 5-digit double-entry Chart of Accounts (Asset, Liability, Equity, Revenue, Expense) | `core/accounting/engine.ts`, `modules/accounts/` | `/api/accounting/coa` |
| `journal_entries` | Immutable general ledger journal entry header records | `core/accounting/engine.ts` | `/api/accounting/journal` |
| `journal_lines` | Debit and Credit posting lines with minor-unit Paisa precision | `core/accounting/engine.ts` | `/api/accounting/journal`, `/api/reports/ledgers` |
| `customers` | Retail outlets, credit limits, credit days, route assignment | `modules/customers/service.ts` | `/api/customers` |
| `routes` | Geographic sales routes, delivery days, assigned salesmen | `modules/routes/service.ts` | `/api/routes` |
| `staff_members` | Order bookers, van drivers, delivery officers | `modules/settings/company-service.ts` | `/api/staff` |
| `vendors` | Product manufacturers, mills, supplier profiles | `modules/customers/service.ts` | `/api/vendors` |
| `categories` | Product classification categories | `modules/inventory/service.ts` | `/api/inventory/categories` |
| `brands` | Product brand manufacturers | `modules/inventory/service.ts` | `/api/inventory/brands` |
| `products` | Master product catalog, barcodes, 3-tier UOM packaging ratios, prices | `modules/inventory/service.ts` | `/api/inventory` |
| `inventory_movements` | Immutable stock audit ledger (purchase, sale, return, adjustment, transfer) | `modules/inventory/audit.service.ts` | `/api/inventory/audit/movements` |
| `stock_adjustments` | Physical count reconciliations, write-offs, opening stock | `modules/inventory/service.ts` | `/api/inventory/adjust` |
| `sales_orders` | Commercial sales bills, field bookings, order statuses | `modules/sales/service.ts` | `/api/sales/orders`, `/api/sales` |
| `sales_order_items` | Line items for sales orders (quantities, bonus schemes, discounts, tax) | `modules/sales/service.ts` | `/api/sales/orders` |
| `sales_invoices` | Direct van spot cash sale invoices | `modules/sales/service.ts` | `/api/sales/direct` |
| `sales_invoice_items` | Line items for direct sales | `modules/sales/service.ts` | `/api/sales/direct` |
| `sales_returns` | Customer sales return credit notes | `modules/returns/service.ts` | `/api/returns/sales` |
| `sales_return_items` | Line items for sales returns (fresh vs damaged stock) | `modules/returns/service.ts` | `/api/returns/sales` |
| `purchase_bills` | Inward vendor purchase bills, landed freight allocations | `modules/purchase/service.ts` | `/api/purchase/bills` |
| `purchase_bill_items` | Line items for purchase bills (cartons, boxes, total pieces, landed cost) | `modules/purchase/service.ts` | `/api/purchase/bills` |
| `purchase_returns` | Vendor purchase return debit notes | `modules/returns/service.ts` | `/api/returns/purchase` |
| `purchase_return_items`| Line items for vendor returns | `modules/returns/service.ts` | `/api/returns/purchase` |
| `customer_payments` | Payments received from customers (cash, cheques, online transfer) | `modules/payments/service.ts` | `/api/payments/received` |
| `customer_payment_allocations` | Allocation of customer payments against specific sales orders/invoices | `modules/payments/service.ts` | `/api/payments/received` |
| `vendor_payments` | Payments made to suppliers and vendors | `modules/payments/service.ts` | `/api/payments/made` |
| `vendor_payment_allocations` | Allocation of vendor payments against specific purchase bills | `modules/payments/service.ts` | `/api/payments/made` |
| `expenses` | Daily operational expense vouchers (fuel, tea, freight, vehicle maintenance) | `modules/expenses/service.ts` | `/api/expenses` |
| `daily_closings` | Daily cash closing records, denomination counts, variance tracking | `modules/closing/service.ts` | `/api/closing/finalize` |
| `bank_accounts` | Company bank accounts, IBANs, branch details linked to GL | `modules/banking/service.ts` | `/api/banking/accounts` |
| `audit_logs` | System transaction deletion and reversal audit trail | `core/audit/audit-log.service.ts` | `/api/audit-logs` |
| `feature_flags` | Operational feature flags per company | `core/settings/flags.ts` | `/api/settings/features` |
| `app_settings` | Key-value settings storage (branding config, company settings) | `core/branding/theme.service.ts` | `/api/superadmin/branding` |
| `company_profile` | Company profile, NTN/STRN, print template configuration | `modules/settings/company-service.ts` | `/api/settings/company` |
| `system_license` | Cryptographic license keys and commercial entitlement payloads | `core/licensing/license.service.ts` | `/api/system/info` |

---

## 7. CRITICAL SHARED FILES & BLAST RADIUS MAP

Changes to these core files impact multiple modules. Before modifying any of these files, review their documented blast radius and execute targeted regression tests.

### 7.1 CRITICAL SHARED FILES DIRECTORY

#### 1. `src/shared/components/DashboardSidebar.tsx`
- **Used by:** `src/app/(dashboard)/layout.tsx` (all 35+ tenant ERP pages).
- **Impact:** Navigation links, sidebar collapse/expand, mobile drawer, module visibility filtering, active route styling, user profile popup.
- **Blast Radius to Test:**
  - Desktop sidebar expansion & collapsing
  - Mobile hamburger drawer toggle
  - Submodule visibility when toggling modules in Super Admin
  - Active route highlighting across nested routes (e.g. `/sales` vs `/sales/field-order-booking`)

#### 2. `src/shared/components/SearchableSelect.tsx`
- **Used by:** Virtually all data entry forms and filter bars (Order Booking, Field Order Booking, Purchase Bills, Direct Sale, Returns, Payments, Expenses, Reports, Customers, Routes, Staff).
- **Impact:** Single & multi-select dropdowns, keyboard navigation (Tab, Enter, arrows), search filtering, portal placement, clear buttons.
- **Blast Radius to Test:**
  - Single-selection in Field Order Booking or Order Booking
  - Multi-select filtering in Sales Analysis or Stock Analysis Reports
  - Tab navigation between inputs (`onTabNext`, `requireSelectionBeforeTab`)
  - Dropdown position and portal stacking inside modals

#### 3. `src/shared/components/PaginationControls.tsx`
- **Used by:** Every list page (`/sales`, `/purchase/orders-detail`, `/inventory/products`, `/customers`, `/purchase/vendors`, `/reports/ledgers`, etc.).
- **Impact:** Record pagination, page size switching (`50`, `100`, `150`, `200`, `All`), localStorage persistence (`saleflow_page_size`).
- **Blast Radius to Test:**
  - Page navigation (Next, Prev, First, Last)
  - Page size change and record count tally display
  - Empty results state (`totalRecords = 0`)

#### 4. `src/shared/components/NumericValue.tsx` & `src/shared/utils/formatting.ts`
- **Used by:** Every financial, price, quantity, and balance display across the entire ERP.
- **Impact:** Permanent Global Numeric Standard (Inter font, `tabular-nums`, commas, 2 decimals for currency, 1 decimal for %, clean numbers without visible currency prefix).
- **Blast Radius to Test:**
  - Currency formatting on Sales Bills, Purchase Bills, and Invoices
  - Table column right-alignment (`.num-financial`, `text-right tabular-nums`)
  - KPI summary cards on Dashboard and Reports

#### 5. `src/core/branding/theme.service.ts` & `src/core/branding/storage.ts`
- **Used by:** Super Admin Branding, RootLayout, DashboardLayout, SuperAdminLayout, Login, Preloader, DocumentTitle.
- **Impact:** Default ERP display name, main logo, sidebar logo, favicon, preloader ON/OFF, color CSS variables, document title.
- **Blast Radius to Test:**
  - Save Global Theme in `/superadmin/branding`
  - Browser tab document title updates
  - Main logo and sidebar logo rendering in ERP sidebar and Super Admin sidebar
  - Preloader behavior (must be completely absent when toggled OFF)

#### 6. `src/core/registry/hierarchical-module-registry.ts`
- **Used by:** `RouteAccessGuard.tsx`, `DashboardSidebar.tsx`, `superadmin/modules/page.tsx`, `api/superadmin/companies/[id]/modules/route.ts`.
- **Impact:** System-wide module and submodule access rules, URL routing protection, plan presets.
- **Blast Radius to Test:**
  - Direct URL access to a disabled submodule (must render 403 Access Denied lock card)
  - Sidebar navigation item visibility matching active company plan
  - Super Admin company module entitlement editor

#### 7. `src/shared/components/RouteAccessGuard.tsx`
- **Used by:** `src/app/(dashboard)/layout.tsx` (wraps all inner page content).
- **Impact:** Intercepts route navigation and checks whether the active company has the submodule enabled.
- **Blast Radius to Test:**
  - Access to enabled routes (must render page content seamlessly)
  - Direct access to disabled routes (must display clean 403 lock card)
  - Role-based permissions within active modules

#### 8. `src/core/database/factory.ts` & `src/core/database/db.ts`
- **Used by:** All backend APIs, services, and DAL layers.
- **Impact:** SQLite/Postgres database connections, transaction commits, WAL mode, path resolution.
- **Blast Radius to Test:**
  - SQLite persistent path resolution via `SALEFLOW_DATA_DIR`
  - Build-phase protection (no DB operations during `next build`)
  - Database operations in transaction services

#### 9. `src/core/accounting/engine.ts` & `src/shared/utils/currency.ts`
- **Used by:** Sales, Purchase, Returns, Payments, Expenses, Daily Closing, Bank Transactions, Reports.
- **Impact:** Double-entry journal vouchers, minor-unit (Paisa) math, Chart of Accounts balances.
- **Blast Radius to Test:**
  - Posting a Sales Order or Direct Sale (must generate balanced debit/credit voucher)
  - Voiding an invoice or expense (must generate reversing journal entry)
  - Trial Balance report (total debits must equal total credits down to the Paisa)

#### 10. `src/middleware.ts`
- **Used by:** Every incoming HTTP request across the entire web application.
- **Impact:** Subdomain extraction, apex platform routing, tenant authentication redirect, cookie checking.
- **Blast Radius to Test:**
  - Apex domain navigation (`salesflow.space` -> `/superadmin/login`)
  - Tenant subdomain navigation (`tenant.salesflow.space` -> `/login` or `/sales`)
  - Localhost/onpremise mode bypass

---

## 8. FILE OWNERSHIP SPECIFICATION

Every development task in SaleFlow must respect the following file ownership tiers:

1. **PRIMARY FILES:** The exact page and service files that directly implement the feature. These are the **ONLY** files that should be modified during standard feature work.
2. **DEPENDENCY FILES:** Specific API routes, utilities, or modals that directly support the feature.
3. **SHARED FILES:** Core layout, navigation, and UI primitives (`DashboardSidebar`, `SearchableSelect`, `theme.service.ts`, etc.). **DO NOT MODIFY** unless the task explicitly requires a system-wide upgrade.
4. **TEST FILES:** Dedicated regression test scripts in `scripts/`. Must use isolated test databases.

---

*(End of SaleFlow Codebase Map — Keep this file updated whenever architecture changes)*
