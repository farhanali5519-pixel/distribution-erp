# SaleFlow ERP — Software Update & Migration Guide

This guide explains how to safely update an existing customer installation to a newer release without losing your database, ledger accounts, inventory, or user logins.

---

## 1. Principles of On-Premise Updates

1. **Data Isolation:** All your live business data resides in `data/sales_distribution.db`. Updates replace application binaries and scripts, NEVER your database.
2. **Pre-Update Backup Guarantee:** The upgrade script automatically takes a complete backup of your database before applying schema migrations.
3. **Zero Configuration Loss:** Your `.env`, license activation, company profiles, and custom role permissions are preserved.

---

## 2. Standard Update Procedure

### Step 1: Stop the Running ERP
Double-click `stop-onpremise.bat` in the application folder to stop the server cleanly.

### Step 2: Extract New Software Files
Extract the new release files over your existing installation directory.
- Allow file replacement for application code (`src/`, `package.json`, etc.).
- **DO NOT delete or overwrite:**
  - `data/` folder
  - `backups/` folder
  - `.env` configuration file

### Step 3: Run the Automated Migration Script
Open Command Prompt in the application folder and run:
```cmd
npm ci --omit=dev
node scripts/onprem-update.mjs
```
The updater will:
1. Verify database integrity.
2. Take a pre-update backup (`backups/pre-update-backup-*.db`).
3. Apply any new database schema migrations safely inside a transaction.
4. Record the applied migration version.
5. Confirm success: `[UPDATE SUCCESS] Application and database successfully updated to latest version.`

### Step 4: Rebuild & Restart ERP
```cmd
npm run build
```
Then double-click `start-onpremise.bat`.

### Step 5: Verify Login & Balances
Login with your existing credentials and verify your dashboard KPIs, customer ledger balances, and product stock levels.
