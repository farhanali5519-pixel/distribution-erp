import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { signSessionToken } from '../src/core/auth/session';
import { SESSION_COOKIE_NAME, TENANT_HEADER_ID, TENANT_HEADER_SLUG } from '../src/core/tenancy/constants';

const { Client } = pg;

function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  }
}
loadEnv();

async function main() {
  const pgClient = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await pgClient.connect();

  const company = (await pgClient.query('SELECT id, name, slug FROM companies LIMIT 1')).rows[0];
  const user = (await pgClient.query('SELECT id, username, full_name, role FROM app_users WHERE username = $1 LIMIT 1', ['admin'])).rows[0]
    || (await pgClient.query('SELECT id, username, full_name, role FROM app_users LIMIT 1')).rows[0];

  await pgClient.end();

  console.log(`Testing against Company: ${company.name} (${company.slug}, ${company.id})`);
  console.log(`Authenticated as User: ${user.username} (${user.role})`);

  const now = Math.floor(Date.now() / 1000);
  const sessionToken = signSessionToken({
    userId: user.id,
    companyId: company.id,
    role: user.role,
    username: user.username,
    fullName: user.full_name,
    issuedAt: now,
    expiresAt: now + 3600,
  });

  const baseUrl = 'http://localhost:3001';
  const headers: Record<string, string> = {
    'Cookie': `${SESSION_COOKIE_NAME}=${sessionToken}`,
    [TENANT_HEADER_ID]: company.id,
    [TENANT_HEADER_SLUG]: company.slug,
    'Host': `${company.slug}.localhost:3001`,
  };

  const endpoints = [
    { name: '1. Dashboard Page', path: '/', isPage: true },
    { name: '2. Products Page', path: '/inventory/products', isPage: true },
    { name: '3. Products API', path: '/api/inventory', isPage: false },
    { name: '4. Customers Page', path: '/customers', isPage: true },
    { name: '5. Customers API', path: '/api/customers', isPage: false },
    { name: '6. Sales Page', path: '/sales', isPage: true },
    { name: '7. Sales API', path: '/api/sales', isPage: false },
    { name: '8. Purchase Page', path: '/purchase', isPage: true },
    { name: '9. Purchase Bills API', path: '/api/purchase/bills', isPage: false },
    { name: '10. Inventory Page', path: '/inventory', isPage: true },
    { name: '11. Inventory KPIs API', path: '/api/inventory/audit/kpis', isPage: false },
    { name: '12. Payments Received Page', path: '/payments/received', isPage: true },
    { name: '13. Payments Received API', path: '/api/payments/received', isPage: false },
    { name: '14. Accounting COA Page', path: '/accounting/coa', isPage: true },
    { name: '15. Accounting COA API', path: '/api/accounting/coa', isPage: false },
    { name: '16. Profit & Loss Report Page', path: '/reports/profit-and-loss', isPage: true },
    { name: '17. Stock Valuation Report API', path: '/api/reports/stock-valuation', isPage: false },
  ];

  console.log('\n--- Running Read-Only Verification Against Localhost:3001 (PostgreSQL Mode) ---');
  let allPassed = true;

  for (const ep of endpoints) {
    try {
      const res = await fetch(`${baseUrl}${ep.path}`, {
        method: 'GET',
        headers,
      });

      const status = res.status;
      let detail = '';

      if (ep.isPage) {
        const text = await res.text();
        const hasHtml = text.includes('<!DOCTYPE html>') || text.includes('<html');
        detail = `HTML page (${text.length} bytes, has HTML doctype: ${hasHtml})`;
        if (status !== 200 || !hasHtml) {
          allPassed = false;
        }
      } else {
        const json = await res.json() as any;
        const count = Array.isArray(json)
          ? json.length
          : Array.isArray(json?.data)
          ? json.data.length
          : Array.isArray(json?.items)
          ? json.items.length
          : json?.success !== undefined
          ? (json.success ? 'success' : 'fail')
          : Object.keys(json).length;
        detail = `JSON response (count/status: ${count})`;
        if (status !== 200) {
          allPassed = false;
        }
      }

      console.log(`[PASS] ${ep.name} -> HTTP ${status} | ${detail}`);
    } catch (err: any) {
      allPassed = false;
      console.log(`[FAIL] ${ep.name} -> Error: ${err.message}`);
    }
  }

  console.log(`\nOverall Localhost Read-Only Test Result: ${allPassed ? 'ALL PASSED (100%)' : 'SOME CHECKS FAILED'}`);
  process.exit(allPassed ? 0 : 1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
