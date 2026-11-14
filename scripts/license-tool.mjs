#!/usr/bin/env node
/**
 * SaleFlow Commercial Platform - Offline License Generator & Management Tool
 * 
 * SECURITY MANDATE:
 * This tool is for the SOFTWARE VENDOR / DISTRIBUTOR ONLY.
 * It holds the Ed25519 Private Key to issue cryptographically signed offline commercial licenses.
 * It is EXCLUDED from customer deployment packages and public releases.
 */

import crypto from 'node:crypto';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

// Master Vendor Ed25519 Public Key (used for verification)
const MASTER_VENDOR_PUBLIC_KEY = process.env.PLATFORM_LICENSE_PUBLIC_KEY || `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAdpnLyBO1nTfTFzM+h4HYFSVmeSkp/pmzD7MTW/c0eZc=
-----END PUBLIC KEY-----`;

function generateMachineFingerprint() {
  const interfaces = os.networkInterfaces();
  const macs = [];

  for (const name of Object.keys(interfaces)) {
    const ifaceList = interfaces[name];
    if (ifaceList) {
      for (const iface of ifaceList) {
        if (!iface.internal && iface.mac && iface.mac !== '00:00:00:00:00:00') {
          macs.push(iface.mac.toLowerCase());
        }
      }
    }
  }

  macs.sort();
  const rawFingerprint = `${os.hostname()}|${os.platform()}|${os.arch()}|${macs.join(',')}`;
  return crypto.createHash('sha256').update(rawFingerprint).digest('hex').slice(0, 32);
}

function issueLicense(params) {
  const privateKey = params.privateKey || process.env.PLATFORM_LICENSE_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error(
      'Private key required to issue licenses. Specify --key-file <path> or set PLATFORM_LICENSE_PRIVATE_KEY environment variable. Customer installations do NOT contain signing keys.'
    );
  }

  const payload = {
    licenseId: `LIC-${crypto.randomUUID().slice(0, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`,
    companyName: params.companyName.trim(),
    companySlug: params.companySlug?.trim(),
    type: params.type || 'PERPETUAL',
    issuedAt: new Date().toISOString(),
    expiresAt: params.type === 'PERPETUAL' ? null : (params.expiresAt || null),
    maxUsers: params.maxUsers || 10,
    maxWarehouses: params.maxWarehouses || 1,
    enabledModules: params.enabledModules || [
      'sales', 'inventory', 'customers', 'purchase', 'expenses', 'closing', 'reports', 'auth', 'settings'
    ],
    enabledFeatures: params.enabledFeatures || [],
    machineId: params.machineId?.trim() || '*',
    issuer: params.issuer || 'SaleFlow Commercial Platform',
  };

  const payloadJson = JSON.stringify(payload);
  const encodedPayload = Buffer.from(payloadJson, 'utf8').toString('base64url');
  const signature = crypto.sign(null, Buffer.from(encodedPayload, 'utf8'), privateKey).toString('base64url');
  const licenseKey = `${encodedPayload}.${signature}`;

  return { licenseKey, payload };
}

function verifyLicense(licenseKey, checkMachineId = true, publicKey = MASTER_VENDOR_PUBLIC_KEY) {
  if (!licenseKey || typeof licenseKey !== 'string') {
    return { status: 'INVALID', isValid: false, message: 'No license key provided.' };
  }

  const parts = licenseKey.trim().split('.');
  if (parts.length !== 2) {
    return { status: 'INVALID', isValid: false, message: 'Malformed license key format.' };
  }

  const [encodedPayload, providedSignature] = parts;

  try {
    const payloadBuf = Buffer.from(encodedPayload, 'utf8');
    const sigBuf = Buffer.from(providedSignature, 'base64url');
    const isVerified = crypto.verify(null, payloadBuf, publicKey, sigBuf);

    if (!isVerified) {
      return {
        status: 'INVALID',
        isValid: false,
        message: 'Cryptographic digital signature mismatch. License is unauthorized or has been tampered with.',
      };
    }
  } catch (e) {
    return { status: 'INVALID', isValid: false, message: `Signature check error: ${e.message}` };
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch {
    return { status: 'INVALID', isValid: false, message: 'Failed to decode license payload.' };
  }

  const currentMachineId = generateMachineFingerprint();
  let machineIdMatches = true;
  if (checkMachineId && payload.machineId && payload.machineId !== '*') {
    if (payload.machineId.toLowerCase() !== currentMachineId.toLowerCase()) {
      machineIdMatches = false;
      return {
        status: 'INVALID',
        isValid: false,
        message: `Hardware binding mismatch. Expected: ${payload.machineId}, Current: ${currentMachineId}`,
        payload,
        machineIdMatches: false,
      };
    }
  }

  if (payload.type === 'PERPETUAL' || !payload.expiresAt) {
    return {
      status: 'VALID',
      isValid: true,
      message: 'Perpetual commercial license is active.',
      payload,
      daysRemaining: null,
      isGracePeriod: false,
      machineIdMatches,
    };
  }

  const now = Date.now();
  const expiryTime = new Date(payload.expiresAt).getTime();
  const diffMs = expiryTime - now;
  const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (daysRemaining >= 0) {
    return {
      status: 'VALID',
      isValid: true,
      message: `License is active (${daysRemaining} days remaining).`,
      payload,
      daysRemaining,
      isGracePeriod: false,
      machineIdMatches,
    };
  }

  if (Math.abs(daysRemaining) <= 14) {
    const graceDaysLeft = 14 - Math.abs(daysRemaining);
    return {
      status: 'GRACE_PERIOD',
      isValid: true,
      message: `Subscription expired on ${payload.expiresAt}. In grace period (${graceDaysLeft} days remaining).`,
      payload,
      daysRemaining: 0,
      graceDaysRemaining: graceDaysLeft,
      isGracePeriod: true,
      machineIdMatches,
    };
  }

  return {
    status: 'EXPIRED',
    isValid: false,
    message: `Commercial license expired on ${payload.expiresAt}.`,
    payload,
    daysRemaining: 0,
    graceDaysRemaining: 0,
    isGracePeriod: false,
    machineIdMatches,
  };
}

// CLI Argument Parsing
const args = process.argv.slice(2);
const command = args[0];

function printHelp() {
  console.log(`
SaleFlow Offline License Management Tool (Ed25519)
==================================================
Usage:
  node scripts/license-tool.mjs <command> [options]

Commands:
  issue           Issue a signed commercial license
  verify          Verify a signed license key
  fingerprint     Display local machine hardware fingerprint
  generate-keys   Generate a new Ed25519 keypair

Options for 'issue':
  --company <name>       Customer company name (required)
  --type <type>          PERPETUAL | SUBSCRIPTION | TRIAL (default: PERPETUAL)
  --expires <date>       Expiry date YYYY-MM-DD (required for SUBSCRIPTION)
  --max-users <num>      Max concurrent users (default: 10)
  --machine-id <id>      Hardware fingerprint (default: * for unrestricted)
  --modules <m1,m2>      Comma-separated list of enabled modules

Options for 'verify':
  --key <licenseKey>     License key string to verify
  --ignore-machine       Skip machine fingerprint verification

Examples:
  node scripts/license-tool.mjs fingerprint
  node scripts/license-tool.mjs issue --company "Farhan Traders" --type PERPETUAL --max-users 15
  node scripts/license-tool.mjs issue --company "Test Mart" --type SUBSCRIPTION --expires 2026-12-31
  node scripts/license-tool.mjs verify --key "<key>"
`);
}

function parseArg(flag) {
  const idx = args.indexOf(flag);
  if (idx !== -1 && idx + 1 < args.length) {
    return args[idx + 1];
  }
  return null;
}

if (!command || command === '--help' || command === '-h') {
  printHelp();
  process.exit(0);
}

if (command === 'fingerprint') {
  const fp = generateMachineFingerprint();
  console.log(`Machine Fingerprint: ${fp}`);
  process.exit(0);
}

if (command === 'generate-keys') {
  const pair = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  console.log('--- PUBLIC KEY (Distribute with Customer App) ---');
  console.log(pair.publicKey);
  console.log('--- PRIVATE KEY (KEEP SECURE - NEVER DISTRIBUTE TO CUSTOMERS) ---');
  console.log(pair.privateKey);
  process.exit(0);
}

if (command === 'issue') {
  const companyName = parseArg('--company');
  if (!companyName) {
    console.error('Error: --company is required.');
    process.exit(1);
  }

  const type = (parseArg('--type') || 'PERPETUAL').toUpperCase();
  const expiresAt = parseArg('--expires');
  const maxUsers = parseInt(parseArg('--max-users') || '10', 10);
  const machineId = parseArg('--machine-id') || '*';
  const modulesArg = parseArg('--modules');
  const enabledModules = modulesArg ? modulesArg.split(',').map((s) => s.trim()) : undefined;

  const keyFile = parseArg('--key-file');
  let privateKey = null;
  if (keyFile) {
    if (!fs.existsSync(keyFile)) {
      console.error(`Error: Key file not found: ${keyFile}`);
      process.exit(1);
    }
    privateKey = fs.readFileSync(keyFile, 'utf8');
  } else if (process.env.PLATFORM_LICENSE_PRIVATE_KEY) {
    privateKey = process.env.PLATFORM_LICENSE_PRIVATE_KEY;
  } else {
    console.error('Error: Ed25519 Private Key is required to issue licenses.');
    console.error('Specify --key-file <path> or set PLATFORM_LICENSE_PRIVATE_KEY environment variable.');
    console.error('Customer installations contain ONLY public verification keys.');
    process.exit(1);
  }

  const result = issueLicense({
    companyName,
    type,
    expiresAt,
    maxUsers,
    machineId,
    enabledModules,
    privateKey,
  });

  console.log('\n===============================================================');
  console.log('✅ COMMERCIAL LICENSE ISSUED SUCCESSFULLY (Ed25519 Signed)');
  console.log('===============================================================');
  console.log(`Company:       ${result.payload.companyName}`);
  console.log(`License ID:    ${result.payload.licenseId}`);
  console.log(`Type:          ${result.payload.type}`);
  console.log(`Expires:       ${result.payload.expiresAt || 'NEVER (Perpetual)'}`);
  console.log(`Max Users:     ${result.payload.maxUsers}`);
  console.log(`Machine ID:    ${result.payload.machineId}`);
  console.log(`Modules (${result.payload.enabledModules.length}): ${result.payload.enabledModules.join(', ')}`);
  console.log('\n--- LICENSE KEY ---');
  console.log(result.licenseKey);
  console.log('-------------------\n');
  process.exit(0);
}

if (command === 'verify') {
  const key = parseArg('--key') || args[1];
  if (!key) {
    console.error('Error: --key <licenseKey> is required.');
    process.exit(1);
  }

  const checkMachine = !args.includes('--ignore-machine');
  const result = verifyLicense(key, checkMachine);

  console.log('\n--- VERIFICATION RESULT ---');
  console.log(`Status:        ${result.status}`);
  console.log(`Is Valid:      ${result.isValid ? 'YES' : 'NO'}`);
  console.log(`Message:       ${result.message}`);
  if (result.payload) {
    console.log(`Company:       ${result.payload.companyName}`);
    console.log(`Type:          ${result.payload.type}`);
    console.log(`Expires At:    ${result.payload.expiresAt || 'Never'}`);
    console.log(`Max Users:     ${result.payload.maxUsers}`);
    console.log(`Machine ID:    ${result.payload.machineId} (Matches: ${result.machineIdMatches})`);
  }
  console.log('---------------------------\n');
  process.exit(result.isValid ? 0 : 1);
}

console.error(`Unknown command: ${command}`);
printHelp();
process.exit(1);
