# Global Enterprise Numeric Design Standard

This rule is a **mandatory, permanent design standard** across all pages, modules, cards, tables, reports, invoices, dashboards, forms, summaries, and components in the software.

Whenever creating, modifying, or refactoring any UI containing numbers, you MUST adhere to the following rules:

---

### 1. Typography & Font Rules
- **Standard Business Font for Numbers:** Use the clean sans-serif UI font (`Inter`, `var(--font-sans)`) paired with tabular figures (`tabular-nums` / `font-variant-numeric: tabular-nums lining-nums; font-feature-settings: 'tnum' 1, 'lnum' 1;`).
- **Avoid Harsh Monospace:** Do NOT use raw, blocky monospace fonts (e.g. `JetBrains Mono` or Courier) for general numeric figures, prices, quantities, balances, or percentages. Reserve `font-mono` strictly for system identifiers, SKUs, and barcodes, and even then ensure it is compact.
- **Consistent Font Size & Weight:**
  - Table numeric cells: `text-xs font-medium` or `font-semibold` for primary totals.
  - KPI card numbers: `text-xl font-bold tracking-tight text-[var(--text-heading)]` (or use `.num-kpi`).
  - Secondary counts/subtitles: `text-[11px] text-slate-400 font-medium`.

---

### 2. Number Formatting Rules
- **Thousand Separators (Mandatory):** Always format thousands with commas, e.g. `1,250,000` instead of `1250000`.
- **Consistent Decimals:**
  - Financial/currency values: Always format with 2 decimal places (e.g. `1,250.00`).
  - Integer quantities/pieces/cartons: Format as whole numbers with thousand separators (e.g. `1,250 PCS`).
  - Percentages/margins: Format consistently with 1 decimal place (e.g. `15.0%`).
- **Currency Formatting:**
  - Always use `formatCurrency(amount, 'PKR')` from `@/shared/utils/currency` (or `@/shared/utils/formatting`).
  - Outputs standard format: `PKR 1,250.00`.
- **Percentages:**
  - Always use `formatPercentage(rate)` from `@/shared/utils/formatting` (or format consistently with `%`).
  - Positive/healthy margins: `.num-pos` (`text-emerald-600 dark:text-emerald-400`).
  - Negative margins: `.num-neg` (`text-rose-600 dark:text-rose-400`).

---

### 3. Layout & Alignment Rules
- **Right-Align Financial Values in Tables:**
  - Table headers for Cost, Trade Price, MRP, Balances, Debits, Credits, and Totals MUST be `text-right` (`th className="text-right"`).
  - Corresponding numeric table cells MUST be `text-right tabular-nums` (`td className="text-right tabular-nums"` or `.num-financial`).
- **Balanced KPI Summary Cards:**
  - Place metrics in uniform grid cards (`grid-cols-2 lg:grid-cols-4 gap-2.5`).
  - Use high-contrast tabular numbers with a clean uppercase label (`text-[11px] uppercase tracking-wider`).

---

### 4. Shared Utilities & Components
Always reuse the shared global utilities instead of ad-hoc formatting:
- Import from `@/shared/utils/currency` or `@/shared/utils/formatting`:
  - `formatCurrency(val)` -> `"PKR 1,250.00"`
  - `formatNumber(val)` -> `"1,250"`
  - `formatInteger(val)` -> `"1,250"`
  - `formatDecimal(val, 2)` -> `"1,250.00"`
  - `formatPercentage(val)` -> `"15.0%"`
  - `formatQuantity(val, 'PCS')` -> `"1,250 PCS"`
- Or use the shared React component:
  - `<NumericValue value={amount} type="currency" />`
  - `<NumericValue value={quantity} type="integer" />`

---

### 5. Integrity Guarantee
- NEVER modify underlying mathematical calculations, paisa minor-unit integers, formulas, or database storage to achieve visual formatting. Only format at the presentation layer.
