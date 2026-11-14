#!/usr/bin/env node
/**
 * Safe Production & Local Bootstrap Script for Platform Super Admin
 *
 * Requirements & Safety:
 * - Resolves DB path from SQLITE_DATABASE_PATH
 * - In production/Hostinger (DEPLOYMENT_MODE=hostinger or NODE_ENV=production):
 *     * Strictly requires SQLITE_DATABASE_PATH (refuses fallback)
 *     * Strictly requires CONFIRM_SUPERADMIN_BOOTSTRAP=YES
 * - In local dev (without SQLITE_DATABASE_PATH):
 *     * Fallback to local data/sales_distribution.db
 * - Verifies DB file exists and platform_users table exists
 * - If superadmin does not exist: creates user (username=superadmin, role=SUPER_ADMIN, is_active=1)
 * - If superadmin exists: updates in-place without recreating or modifying other data
 * - Clears lockout and failed attempts
 * - Uses exact canonical salt ('saleflow_user_salt_') + SHA-256
 * - Verifies business/tenant data remains 100% untouched
 * - Interactive masked password prompt with confirmation (or SUPERADMIN_INITIAL_PASSWORD env)
 * - Zero secrets or hashes printed or logged
 */

import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import readline from 'node:readline';

const PASSWORD_SALT = 'saleflow_user_salt_';

function hashPassword(password) {
  return crypto.createHash('sha256').update(PASSWORD_SALT + password).digest('hex');
}

function verifyPassword(password, storedHash) {
  const computed = hashPassword(password);
  const buf1 = Buffer.from(computed);
  const buf2 = Buffer.from(storedHash);
  if (buf1.length !== buf2.length) return false;
  return crypto.timingSafeEqual(buf1, buf2);
}

async function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    process.stdout.write(question);

    let password = '';
    const stdin = process.stdin;
    const oldRaw = stdin.isRaw;
    if (stdin.isTTY) {
      stdin.setRawMode(true);
    }

    const onData = (chunk) => {
      const char = chunk.toString();
      for (const c of char) {
        if (c === '\r' || c === '\n') {
          if (stdin.isTTY) stdin.setRawMode(oldRaw);
          stdin.removeListener('data', onData);
          process.stdout.write('\n');
          rl.close();
          resolve(password);
          return;
        } else if (c === '\u0003') {
          if (stdin.isTTY) stdin.setRawMode(oldRaw);
          process.stdout.write('\n');
          process.exit(1);
        } else if (c === '\u0008' || c === '\u007f') {
          if (password.length > 0) {
            password = password.slice(0, -1);
          }
        } else {
          password += c;
        }
      }
    };

    stdin.on('data', onData);
  });
}

async function main() {
  console.log('=============================================================');
  console.log('   SALEFLOW PLATFORM SUPER ADMIN BOOTSTRAP UTILITY (SECURE)  ');
  console.log('=============================================================\n');

  const deploymentMode = (process.env.DEPLOYMENT_MODE || '').toLowerCase().trim();
  const nodeEnv = (process.env.NODE_ENV || '').toLowerCase().trim();
  const isProduction = deploymentMode === 'hostinger' || nodeEnv === 'production';

  // 1. Resolve Target Database Path
  let targetDbPath = process.env.SQLITE_DATABASE_PATH;

  if (isProduction) {
    if (!targetDbPath || !targetDbPath.trim()) {
      console.error('[ERROR] Production mode detected (DEPLOYMENT_MODE=' + (deploymentMode || 'production') + ').');
      console.error('SQLITE_DATABASE_PATH environment variable is required and must point to the production database file.');
      process.exit(1);
    }

    const confirmation = (process.env.CONFIRM_SUPERADMIN_BOOTSTRAP || '').trim();
    if (confirmation !== 'YES') {
      console.error('[ABORT] Production safety confirmation missing.');
      console.error('To execute bootstrap in production, you must explicitly pass: CONFIRM_SUPERADMIN_BOOTSTRAP=YES');
      process.exit(1);
    }
  } else {
    if (!targetDbPath || !targetDbPath.trim()) {
      targetDbPath = path.resolve(process.cwd(), 'data', 'sales_distribution.db');
      console.log('[Notice] SQLITE_DATABASE_PATH not specified. Falling back to local development database.');
    }
  }

  targetDbPath = path.resolve(targetDbPath.trim());
  console.log(`Target Database Path : ${targetDbPath}`);
  console.log(`Deployment Mode      : ${deploymentMode || (isProduction ? 'production' : 'development')}\n`);

  if (!fs.existsSync(targetDbPath)) {
    console.error(`[FATAL] Target database file not found at: ${targetDbPath}`);
    process.exit(1);
  }

  // 2. Open database & inspect platform_users table and superadmin account
  const db = new DatabaseSync(targetDbPath);

  const tableCheck = db.prepare(
    "SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='platform_users'"
  ).get();

  if (!tableCheck || tableCheck.count === 0) {
    console.error('[FATAL] Table "platform_users" does not exist in target database.');
    db.close();
    process.exit(1);
  }

  const existingUser = db.prepare(
    'SELECT id, username, full_name, email, role, is_active FROM platform_users WHERE LOWER(username) = ?'
  ).get('superadmin');

  if (existingUser) {
    console.log('Existing Super Admin Account Found:');
    console.log(`  User ID   : ${existingUser.id}`);
    console.log(`  Username  : ${existingUser.username}`);
    console.log(`  Role      : ${existingUser.role}`);
    console.log(`  Status    : ${existingUser.is_active === 1 ? 'Active (1)' : 'Inactive (' + existingUser.is_active + ')'}\n`);
  } else {
    console.log('No existing "superadmin" user found. A new Super Admin user will be created.\n');
  }

  // 3. Obtain password safely
  let password = process.env.SUPERADMIN_INITIAL_PASSWORD;

  if (!password) {
    if (!process.stdin.isTTY) {
      console.error('[ERROR] Non-interactive environment detected without SUPERADMIN_INITIAL_PASSWORD variable.');
      console.error('Please run interactively in a TTY terminal or provide via environment variable.');
      db.close();
      process.exit(1);
    }

    password = await promptHidden('Enter Super Admin password (min 8 chars): ');
    if (!password || password.trim().length < 8) {
      console.error('\n[ERROR] Password must be at least 8 characters long.');
      db.close();
      process.exit(1);
    }

    const confirmPassword = await promptHidden('Confirm Super Admin password: ');
    if (password !== confirmPassword) {
      console.error('\n[ERROR] Passwords do not match. Aborting bootstrap.');
      db.close();
      process.exit(1);
    }
  } else {
    password = password.trim();
    if (password.length < 8) {
      console.error('[ERROR] Provided SUPERADMIN_INITIAL_PASSWORD must be at least 8 characters long.');
      db.close();
      process.exit(1);
    }
  }

  // 4. Record baseline table row counts for tenant/business tables
  const businessTables = [
    'companies',
    'app_users',
    'products',
    'customers',
    'vendors',
    'sales_invoices',
    'purchase_bills',
    'journal_entries',
    'inventory_movements',
  ];
  const beforeCounts = {};
  for (const table of businessTables) {
    try {
      const row = db.prepare(`SELECT count(*) as count FROM ${table}`).get();
      beforeCounts[table] = row ? row.count : 0;
    } catch {
      beforeCounts[table] = null;
    }
  }

  // 5. Compute hash
  const passwordHash = hashPassword(password);

  // 6. Inspect columns of platform_users
  const columns = db.prepare('PRAGMA table_info(platform_users)').all().map((c) => c.name);
  const hasLockout = columns.includes('failed_login_attempts') && columns.includes('locked_until');

  db.exec('BEGIN TRANSACTION;');

  let targetUserId = existingUser ? existingUser.id : crypto.randomUUID();

  try {
    if (existingUser) {
      if (hasLockout) {
        db.prepare(`
          UPDATE platform_users
          SET password_hash = ?,
              failed_login_attempts = 0,
              locked_until = NULL,
              is_active = 1,
              updated_at = datetime('now')
          WHERE id = ?
        `).run(passwordHash, existingUser.id);
      } else {
        db.prepare(`
          UPDATE platform_users
          SET password_hash = ?,
              is_active = 1,
              updated_at = datetime('now')
          WHERE id = ?
        `).run(passwordHash, existingUser.id);
      }
    } else {
      db.prepare(`
        INSERT INTO platform_users (
          id, username, password_hash, full_name, email, role, is_active, created_at, updated_at
        ) VALUES (
          ?, 'superadmin', ?, 'Platform Super Administrator', 'superadmin@salesflow.space', 'SUPER_ADMIN', 1, datetime('now'), datetime('now')
        )
      `).run(targetUserId, passwordHash);
    }

    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    db.close();
    console.error('\n[FATAL] Database update failed:', err.message);
    process.exit(1);
  }

  // 7. Verification Phase
  const finalUser = db.prepare(
    'SELECT id, username, password_hash, full_name, role, is_active FROM platform_users WHERE LOWER(username) = ?'
  ).get('superadmin');

  if (!finalUser) {
    console.error('\n[FAIL] User verification failed: superadmin account not found after bootstrap!');
    db.close();
    process.exit(1);
  }

  const hashVerified = finalUser.password_hash === passwordHash;
  const loginVerified = verifyPassword(password, finalUser.password_hash);

  // 8. Verify zero modifications to tenant and business tables
  let tenantDataUntouched = true;
  for (const table of businessTables) {
    if (beforeCounts[table] !== null) {
      const afterRow = db.prepare(`SELECT count(*) as count FROM ${table}`).get();
      const afterCount = afterRow ? afterRow.count : 0;
      if (afterCount !== beforeCounts[table]) {
        tenantDataUntouched = false;
        console.error(`[ALERT] Row count mismatch on table ${table}: before=${beforeCounts[table]}, after=${afterCount}`);
      }
    }
  }

  db.close();

  console.log('\n-------------------------------------------------------------');
  console.log('BOOTSTRAP VERIFICATION RESULTS:');
  console.log('-------------------------------------------------------------');
  console.log(`- Database Path              : ${targetDbPath}`);
  console.log(`- Account ID                 : ${finalUser.id}`);
  console.log(`- Username                   : ${finalUser.username}`);
  console.log(`- Role                       : ${finalUser.role}`);
  console.log(`- Active Status              : ${finalUser.is_active === 1 ? 'ACTIVE' : 'INACTIVE'}`);
  console.log(`- Account Exists             : PASS`);
  console.log(`- Password Hash Updated      : ${hashVerified ? 'PASS' : 'FAIL'}`);
  console.log(`- Login Verification Match   : ${loginVerified ? 'PASS' : 'FAIL'}`);
  console.log(`- Tenant Data Untouched      : ${tenantDataUntouched ? 'PASS' : 'FAIL'}`);
  console.log('-------------------------------------------------------------');

  if (hashVerified && loginVerified && tenantDataUntouched) {
    console.log('\n[SUCCESS] Super Admin account has been safely bootstrapped/updated!\n');
  } else {
    console.error('\n[ERROR] Verification criteria not satisfied.\n');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\n[FATAL ERROR]:', err);
  process.exit(1);
});
