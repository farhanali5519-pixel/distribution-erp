# SaleFlow ERP — Troubleshooting & FAQ Guide

This guide provides immediate solutions to the most common operational scenarios encountered during on-premise usage.

---

## 1. Server Does Not Start (`start-onpremise.bat` closes immediately)

### Symptoms:
The terminal window appears for a second and disappears.

### Solutions:
1. **Check if Port 3000 is Already in Use:**
   - Double-click `stop-onpremise.bat` to terminate any hanging instances.
   - Try running `start-onpremise.bat` again.
2. **Missing Node.js:**
   - Open Command Prompt and type `node -v`.
   - If it says `'node' is not recognized`, install Node.js LTS from [nodejs.org](https://nodejs.org).
3. **Database File Locked:**
   - Check if an antivirus or backup software is scanning `data/sales_distribution.db`.
   - Ensure you did not place the ERP folder inside Dropbox/OneDrive/Google Drive sync directories.

---

## 2. Other LAN Computers Cannot Connect

### Symptoms:
The main PC can open `http://localhost:3000`, but office staff get "Site can't be reached" when visiting `http://192.168.x.x:3000`.

### Solutions:
1. **Windows Firewall Rule:**
   - Run this in Command Prompt as Administrator on the main PC:
     ```cmd
     netsh advfirewall firewall add rule name="SaleFlow ERP (Port 3000)" dir=in action=allow protocol=TCP localport=3000
     ```
2. **Network Profile:**
   - Verify that your network connection in Windows Settings is set to **Private Network** (not Public).
3. **IP Address Change:**
   - Check if your router assigned a new IP to the server PC. We recommend setting a **Static DHCP Reservation** in your office Wi-Fi router for the server PC.

---

## 3. "Day is Closed" Message on Sales / Returns

### Symptoms:
A user attempts to post or void a transaction and receives an error: *"Transactions for [Date] cannot be modified because the day has been closed."*

### Cause & Solution:
- The cashier or accountant finalized the daily closing for that date.
- Normal staff (Salesman, Order Booker, Cashier) are strictly blocked from editing closed days.
- Only an Administrator with a valid Admin PIN and a mandatory written audit reason can override and modify a transaction after day closing.

---

## 4. "Credit Limit Exceeded" Error on Order Booking

### Symptoms:
When saving a sale order, the system warns: *"Customer credit limit exceeded by [Amount]."*

### Solutions:
1. Record a payment received from the customer in **Payments -> Received** to settle their outstanding balance.
2. If authorized, an Administrator can temporarily increase the customer's credit limit under **Customers -> Edit Customer**.

---

## 5. Brute Force Lockout ("Too Many Attempts")

### Symptoms:
After entering an incorrect password or PIN multiple times, the system shows: *"Too many failed attempts. Please wait 15 minutes before trying again."*

### Solution:
The system automatically rate-limits brute force attempts. Wait 15 minutes or ask an Administrator to log in and reset your password.
