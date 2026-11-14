# SaleFlow ERP — Installation Guide (On-Premise)

Welcome to **SaleFlow ERP & Distribution Management System**. This guide provides straightforward step-by-step instructions to install and configure the system on a local Windows PC or server for your business.

---

## 1. System Requirements

| Component | Minimum Specification | Recommended Specification |
| :--- | :--- | :--- |
| **Operating System** | Windows 10 (64-bit) / Server 2016+ | Windows 11 / Windows Server 2022 |
| **Processor** | Intel Core i3 (4 cores) / AMD Ryzen 3 | Intel Core i5 (6 cores) or higher |
| **Memory (RAM)** | 4 GB | 8 GB or higher |
| **Disk Space** | 2 GB free SSD space | 10 GB free NVMe/SSD space |
| **Network** | Ethernet router / switch for office LAN | Gigabit Switch for multi-user LAN |
| **Internet** | **None required** (100% offline operational) | Optional (for initial software download) |

---

## 2. Prerequisites

1. **Node.js (LTS Version):**
   - Download and install Node.js v20.x or v22.x LTS from [nodejs.org](https://nodejs.org).
   - Ensure the checkbox "Automatically install the necessary tools" is checked or standard installation completes.
2. **Web Browser:**
   - Google Chrome, Microsoft Edge, or Mozilla Firefox (latest versions recommended).

---

## 3. Fresh Installation Steps

### Step 1: Unpack Application Folder
Extract the commercial release archive into a permanent directory on your primary PC/Server (e.g. `C:\SaleFlow-ERP`).

> **Important:** Do NOT place the folder in temporary directories (`Downloads`, `Temp`, or OneDrive folders that could sync/lock database files).

### Step 2: Environment Configuration (.env)
A pre-configured `.env` file is included in the root directory:
```ini
DEPLOYMENT_MODE=onpremise
DATABASE_DRIVER=sqlite
SQLITE_DATABASE_PATH=data/sales_distribution.db
HOST=0.0.0.0
PORT=3000
```
- `HOST=0.0.0.0` allows other computers on your office Wi-Fi or LAN cable network to connect.
- `PORT=3000` is the default port.

### Step 3: Install Production Dependencies (First-Time Only)
Open a Command Prompt in the application folder and run:
```cmd
npm ci --omit=dev
npm run build
```

### Step 4: First Startup & Initialization
Double-click `start-onpremise.bat` in the application root directory.
- The server will automatically initialize the database schema, default chart of accounts, and security settings.
- A black console window will open displaying:
  ```text
  [SaleFlow ERP] Initializing On-Premise Environment...
  [SaleFlow ERP] Production Server started on http://0.0.0.0:3000
  ```

### Step 5: Access the ERP & Initial Setup
1. Open your browser and navigate to:
   ```text
   http://localhost:3000
   ```
2. **Default Administrative Login:**
   - **Username:** `admin`
   - **Password:** `admin123` (or the initial password provided with your license)
   - **Admin PIN:** `1234`
3. **Change Default Credentials:**
   - Go to **Settings -> Company Profile** to update your business name, address, and phone number.
   - Go to **Settings -> Users** to change the administrator password and PIN immediately.
4. **Activate License:**
   - Follow the steps in [LICENSE-ACTIVATION.md](file:///c:/Users/PC/OneDrive/Desktop/Farhan%20Project%20for%20SALE%20Distribution/docs/LICENSE-ACTIVATION.md).
