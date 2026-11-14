# SaleFlow ERP — Commercial Release Package Structure (Section 16)

This document defines the production release packaging specification for commercial on-premise distribution to customers.

---

## 1. Release Package Layout

```text
SaleFlow-ERP-v1.1.0-OnPremise/
├── .env.example                     # Sample template for configuration
├── .env                             # Pre-configured onpremise defaults
├── package.json                     # Production dependencies and startup scripts
├── start-onpremise.bat              # One-click launcher for Windows
├── stop-onpremise.bat               # One-click graceful shutdown
├── restart-onpremise.bat            # One-click restart utility
├── data/                            # [PERSISTENT CUSTOMER FOLDER]
│   └── sales_distribution.db        # SQLite customer database (created on first run)
├── backups/                         # [PERSISTENT CUSTOMER FOLDER]
│   └── (automated & manual backups) # Checksum-verified snapshots
├── logs/                            # [PERSISTENT CUSTOMER FOLDER]
│   └── saleflow-audit.log           # Runtime event & error logs
├── config/                          # [PERSISTENT CUSTOMER FOLDER]
│   └── (license configuration)
├── docs/                            # Customer documentation
│   ├── INSTALLATION.md
│   ├── START-STOP.md
│   ├── BACKUP-RESTORE.md
│   ├── UPDATE-GUIDE.md
│   ├── LAN-ACCESS.md
│   ├── LICENSE-ACTIVATION.md
│   └── TROUBLESHOOTING.md
├── scripts/
│   ├── onprem/                      # Windows service installation scripts
│   │   ├── install-service.bat
│   │   └── README.md
│   ├── backup-now.mjs               # Offline backup tool
│   └── onprem-update.mjs            # Offline database migration runner
└── src/                             # Compiled Next.js application & services
```

---

## 2. Excluded Development & Vendor-Only Artifacts

The customer-distributed release package strictly **excludes** the following developer and vendor files:

1. **Private Signing Keys:**
   - Excludes: `scripts/license-tool.mjs` (private key operations)
   - Excludes: `PLATFORM_LICENSE_PRIVATE_KEY` (never packaged in customer releases)
2. **Synthetic / Scale Test Databases:**
   - Excludes: `data/test_*.db`, `data/scale_*.db`, `saleflow_test_*`
3. **Developer Test & Migration Scripts:**
   - Excludes: `scripts/test-*.mjs`, `scripts/generate-scale-test-data.mjs`
4. **Developer Scratch & Temporary Files:**
   - Excludes: `scratch/`, `.gemini/`, `.git/`, `.turbo/`
5. **Docker Cloud Containers:**
   - Excludes cloud deployment manifests not applicable to on-premise SQLite execution.

---

## 3. Persistent Customer Directories (Update Rules)

Software updates (`scripts/onprem-update.mjs`) strictly observe the **Update Invariance Rule**:
- `data/` is NEVER overwritten, cleared, or deleted.
- `backups/` is NEVER touched or overwritten.
- `logs/` is preserved for historical auditing.
- `.env` preserves customer specific ports, company settings, and local IP bindings.
