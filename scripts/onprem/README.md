# SaleFlow ERP — Commercial On-Premise Deployment Guide

## 1. System Requirements
- **Operating System:** Windows 10 / 11 / Server 2016+ (or Linux x64)
- **Runtime:** Node.js v20.x LTS or v24.x LTS (bundled or installed)
- **RAM:** Minimum 2 GB (4 GB recommended)
- **Disk:** 1 GB free space for application + database growth
- **Network:** Local Area Network (LAN) router/switch for multi-user access (No Internet connection required)

---

## 2. Quick Start / Installation Workflow
1. **Unpack Package:** Extract the application files into `C:\SaleFlow-ERP` (or desired directory).
2. **Build Production Assets (if not pre-packaged):**
   ```cmd
   npm run build
   ```
3. **Start the Server:**
   Double-click `start-onpremise.bat` in the root folder.
4. **Access ERP:**
   - **Local PC:** Open browser to `http://localhost:3000`
   - **LAN Users:** Open browser to `http://<SERVER-LOCAL-IP>:3000`

---

## 3. Operations & Management Scripts
- `start-onpremise.bat`: Launches the production server bound to `0.0.0.0:3000` for LAN access.
- `stop-onpremise.bat`: Gracefully terminates the running ERP process on port 3000.
- `restart-onpremise.bat`: Restarts the ERP server.
- `scripts/onprem/install-service.bat`: Configures a Windows Scheduled Task to auto-start the ERP server on Windows login.

---

## 4. Configuration (.env)
```ini
DEPLOYMENT_MODE=onpremise
DATABASE_DRIVER=sqlite
SQLITE_DATABASE_PATH=data/sales_distribution.db
HOST=0.0.0.0
PORT=3000
```

---

## 5. Data Preservation & Updates
- **Customer Data Location:**
  All live company records, ledger accounts, transactions, and settings reside in:
  `data/sales_distribution.db`
- **Backups Location:**
  `backups/`
- When updating application software files:
  1. Stop ERP (`stop-onpremise.bat`)
  2. Backup database (`scripts/backup-now.mjs` or `data/sales_distribution.db` copy)
  3. Replace application source files (excluding `data/` and `backups/`)
  4. Run `node scripts/onprem-update.mjs`
  5. Restart ERP (`start-onpremise.bat`)
