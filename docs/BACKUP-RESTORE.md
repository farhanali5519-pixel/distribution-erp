# SaleFlow ERP — Backup & Disaster Recovery Guide

Your business transactions, stock quantities, and accounts are critical assets. SaleFlow ERP includes automated and manual backup mechanisms with tamper-proof cryptographic checksums.

---

## 1. Where Is Your Data Stored?

- **Active Database File:** `data/sales_distribution.db`
- **Write-Ahead Log (WAL):** `data/sales_distribution.db-wal`
- **Backups Folder:** `backups/`

---

## 2. Automated Daily Backups

SaleFlow ERP runs automated scheduled backups:
- Backups are stored in `backups/sales_distribution_backup_YYYY-MM-DD_HH-mm-ss.db`.
- Each backup creates a companion `.sha256` checksum file to guarantee that the backup was not altered or corrupted.
- Automated cleanup retains recent snapshots according to your retention policy.

---

## 3. Creating an Immediate Manual Backup

### Option A: From Web Interface
1. Login as an Administrator.
2. Go to **Settings -> Backup & Restore**.
3. Click **"Create Backup Now"**.
4. The system flushes all active database buffers, validates SQLite integrity (`PRAGMA integrity_check`), generates a SHA-256 hash, and displays the download link.

### Option B: From Command Prompt / Script
Run the offline backup tool at any time (even while the server is active):
```cmd
node scripts/backup-now.mjs
```

---

## 4. Disaster Recovery & Restoring a Backup

SaleFlow ERP enforces a safety-first restore protocol:
1. **Admin PIN Required:** You must provide your authorized Admin PIN to initiate a restore.
2. **Pre-Restore Safety Fallback:** Before replacing the database, the system automatically takes an emergency snapshot of your existing database (`pre-restore-fallback-*.sqlite`). If a restore is aborted, your current data remains untouched.
3. **Integrity Validation:** Corrupted files, incomplete downloads, or foreign database formats are strictly rejected prior to applying.

### Step-by-Step Web Restore
1. Navigate to **Settings -> Backup & Restore**.
2. Under "Available Backups", locate the backup date you wish to restore.
3. Click **"Restore"** next to the backup entry.
4. Enter your **Admin PIN** and confirm the disaster warning.
5. The system restores the database and reloads the application.

---

## 5. Offsite / USB Drive Backup Recommendation

> [!TIP]
> We strongly recommend copying the contents of the `backups/` folder to an external USB flash drive or secure local network drive at the end of every business week to safeguard against physical PC failure.
