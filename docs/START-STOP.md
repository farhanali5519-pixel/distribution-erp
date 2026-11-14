# SaleFlow ERP — Start, Stop & Automatic Startup Guide

This document describes how to start, stop, restart, and automatically run SaleFlow ERP on your main PC or server.

---

## 1. Quick Operations (Batch Scripts)

In the root folder of SaleFlow ERP, you have three convenient one-click scripts:

### A. Starting the Server (`start-onpremise.bat`)
- **Action:** Double-click `start-onpremise.bat`.
- **What it does:**
  - Verifies data folder permissions.
  - Launches Next.js production server listening on all network interfaces (`0.0.0.0:3000`).
  - Keeps the terminal window open to display live system logs.

### B. Stopping the Server (`stop-onpremise.bat`)
- **Action:** Double-click `stop-onpremise.bat`.
- **What it does:**
  - Identifies any running process on port 3000.
  - Gracefully terminates the process, ensuring all SQLite WAL buffers are flushed to disk.

### C. Restarting the Server (`restart-onpremise.bat`)
- **Action:** Double-click `restart-onpremise.bat`.
- **What it does:**
  - Runs `stop-onpremise.bat`, waits 2 seconds, and then runs `start-onpremise.bat`.

---

## 2. Automatic Startup with Windows (Recommended)

To ensure your ERP server is always accessible to staff even after the computer restarts:

1. Right-click on `scripts/onprem/install-service.bat` and select **"Run as Administrator"**.
2. This creates a Windows Scheduled Task named `SaleFlow-ERP-Startup` configured to:
   - Run at user logon.
   - Start minimized in the background.
   - Automatically restart if unexpectedly stopped.

### Removing Auto-Startup
To disable automatic startup:
1. Press `Win + R`, type `taskschd.msc`, and press **Enter**.
2. In Task Scheduler Library, locate `SaleFlow-ERP-Startup`.
3. Right-click and select **Delete**.
