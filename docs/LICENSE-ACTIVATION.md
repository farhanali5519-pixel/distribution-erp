# SaleFlow ERP — License Activation & Security Guide

SaleFlow ERP uses secure **Ed25519 asymmetric cryptographic digital signatures** for commercial licensing. This ensures your software runs reliably offline while protecting commercial licensing rules.

---

## 1. How Licensing Works

1. **Hardware Fingerprint:** The system inspects hardware characteristics (CPU, BIOS, and motherboard UUIDs) to produce a unique 32-character Machine Fingerprint.
2. **Asymmetric Key Architecture:**
   - **Customer Application:** Contains ONLY the vendor's Ed25519 **Public Key** (`DEFAULT_PLATFORM_PUBLIC_KEY`). It verifies that the license signature is genuine and untampered.
   - **Vendor Generation Tool:** The private key is held exclusively by the software author. Customer software packages NEVER contain the private key.
3. **License Types:**
   - **Perpetual:** Lifetime commercial license with no expiration date.
   - **Subscription:** Annual or monthly license with automatic 14-day grace period alerts.

---

## 2. Obtaining Your License Key

1. Login as an Administrator.
2. Go to **Settings -> System Information & License**.
3. Under the **Licensing & Commercial Subscription** card, locate:
   ```text
   Machine Fingerprint: [e.g. b949f3b89253eab8f139d3cdea94890f]
   ```
4. Click **"Copy Fingerprint"** and provide this string to your software distributor/vendor along with your company name.
5. Your distributor will issue a cryptographically signed license payload.

---

## 3. Activating Your License

1. In **Settings -> System Information & License**, scroll to **"Activate License"**.
2. Paste the full JSON license payload provided by your distributor into the activation box.
3. Click **"Verify & Activate License"**.
4. The system validates the Ed25519 signature:
   - If genuine and matched to your machine, the license status updates immediately to **ACTIVE / VALID**.
   - Your registered company name, expiration date, max user count, and licensed modules will be displayed.
