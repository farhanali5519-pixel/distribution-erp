# SaleFlow ERP — Multi-User Local Area Network (LAN) Access Guide

SaleFlow ERP is designed to run on a primary PC/server and allow multiple computers, tablets, and phones on your office Wi-Fi or LAN cable network to connect simultaneously without requiring internet access.

---

## 1. Finding Your Server's Local IP Address

On the primary PC where SaleFlow ERP is running:
1. Press `Win + R`, type `cmd`, and press **Enter**.
2. Type `ipconfig` and press **Enter**.
3. Look for **IPv4 Address** under your active Ethernet or Wi-Fi adapter (e.g. `192.168.1.50` or `192.168.100.15`).

---

## 2. Connecting from Other Office Computers & Devices

On any staff computer, laptop, or tablet connected to the same router:
1. Open Google Chrome, Edge, or Safari.
2. In the address bar, enter:
   ```text
   http://192.168.1.50:3000
   ```
   *(Replace `192.168.1.50` with the actual IP address of your primary PC).*
3. The SaleFlow ERP login screen will appear.
4. Staff can log in with their respective assigned roles (Cashier, Order Booker, Salesman, Accountant, Warehouse).

---

## 3. Windows Firewall Configuration

If other devices cannot open the page (e.g. "Connection timed out" or "Site can't be reached"):
Windows Firewall on the primary PC may be blocking incoming connections on port 3000.

### Quick Firewall Unblock:
Open Command Prompt **as Administrator** on the primary PC and execute:
```cmd
netsh advfirewall firewall add rule name="SaleFlow ERP (Port 3000)" dir=in action=allow protocol=TCP localport=3000
```
This enables seamless office LAN communication while keeping your network secure.

---

## 4. Recommended Concurrent LAN User Capacity

SaleFlow ERP utilizes SQLite with Write-Ahead Logging (WAL) and 15,000ms busy-timeout handling:
- **Recommended Concurrent Active LAN Users:** **15 to 25 staff members** concurrently posting orders, booking field sales, checking stock, and processing cash payments.
- For distribution centers exceeding 30 concurrent active data-entry operators, an optional migration to PostgreSQL is supported via our automated DAL abstraction.
