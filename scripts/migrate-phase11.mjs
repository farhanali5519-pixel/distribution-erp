import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';

const dbPath = path.join(process.cwd(), 'data', 'sales_distribution.db');
console.log(`Connecting to database at ${dbPath}...`);
const db = new DatabaseSync(dbPath);

console.log('Ensuring company_profile table exists...');
db.exec(`
  CREATE TABLE IF NOT EXISTS company_profile (
      id TEXT PRIMARY KEY,
      business_name TEXT NOT NULL DEFAULT 'SaleFlow Distribution',
      tagline TEXT DEFAULT 'Wholesale & FMCG Distribution',
      phone_primary TEXT DEFAULT '',
      phone_secondary TEXT DEFAULT '',
      email TEXT DEFAULT '',
      address TEXT DEFAULT '',
      city TEXT DEFAULT '',
      ntn_strn TEXT DEFAULT '',
      logo_url TEXT,
      currency_symbol TEXT DEFAULT 'PKR',
      thermal_footer_note TEXT DEFAULT 'Computer Generated Bill. Software Powered by SaleFlow.',
      invoice_terms TEXT DEFAULT '1. Goods once sold will only be returned according to company return policy within 7 days.
2. In case of any billing dispute, please report within 24 hours.',
      show_logo_on_prints INTEGER NOT NULL DEFAULT 1,
      show_ntn_on_invoices INTEGER NOT NULL DEFAULT 1,
      show_customer_previous_balance INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Seed default company profile if none exists
const profileCountRow = db.prepare('SELECT COUNT(*) as count FROM company_profile').get();
if (!profileCountRow || profileCountRow.count === 0) {
  console.log('Seeding default company profile...');
  db.prepare(`
    INSERT INTO company_profile (
      id, business_name, tagline, phone_primary, phone_secondary, email, address, city, ntn_strn,
      currency_symbol, thermal_footer_note, invoice_terms, show_logo_on_prints, show_ntn_on_invoices,
      show_customer_previous_balance, updated_at
    ) VALUES (
      'default-company-profile',
      'SaleFlow Distribution',
      'Wholesale & FMCG Distribution',
      '+92 300 1234567',
      '+92 321 7654321',
      'info@saleflow.pk',
      'Plot 45-B, Sector 12, Industrial Area',
      'Karachi',
      'NTN: 1234567-8 | STRN: 9876543210',
      'PKR',
      'Computer Generated Bill. Software Powered by SaleFlow.',
      '1. Goods once sold will only be returned according to company return policy within 7 days.
2. In case of any billing dispute, please report within 24 hours.',
      1, 1, 1, datetime('now')
    )
  `).run();
}

console.log('Ensuring feature flag settings.enable_custom_branding exists...');
db.prepare(`
  INSERT OR IGNORE INTO feature_flags (key, module_id, value, label, description, updated_at)
  VALUES (
    'settings.enable_custom_branding',
    'settings',
    'true',
    'Custom Business Branding & Prints',
    'Enables dynamic business logo, contact information, custom footer, and terms on print templates.',
    datetime('now')
  )
`).run();

console.log('Phase 11 migration completed successfully!');
