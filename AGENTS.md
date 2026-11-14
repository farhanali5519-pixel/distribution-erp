<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Permanent Global Numeric UI & Typography Standard

All numeric values across any page, module, card, table, report, invoice, dashboard, form, summary, or component must strictly follow this clean professional standard:

1. **Standard Business Font:** Use `tabular-nums` / `font-variant-numeric: tabular-nums lining-nums` with the UI sans-serif font (`Inter`). Avoid harsh, blocky, or oversized monospace fonts for prices, quantities, balances, and percentages.
2. **Proper Thousand Separators:** Always format numbers with commas (e.g. `1,250,000`).
3. **Consistent Decimals:** Currency and financial values always use 2 decimals (`1,250.00`). Integers use whole numbers (`1,250`). Percentages use 1 decimal (`15.0%`).
4. **Consistent Currency:** Always format via `formatCurrency(amount)` from `@/shared/utils/currency` (or `@/shared/utils/formatting`). No visible currency label (e.g. 'PKR') is displayed in the UI as the system is dedicated to Pakistan, displaying clean standard amounts (e.g. `1,250.00`).
5. **Right-Align Financial Values:** In all tables and lists, right-align amounts, rates, prices, costs, debits, credits, and balances (`text-right tabular-nums` or `.num-financial`).
6. **Balanced KPI Cards:** Use `.num-kpi` or `text-xl font-bold tracking-tight tabular-nums text-[var(--text-heading)]` with small uppercase tracking labels.
7. **Shared Utilities:** Always import from `@/shared/utils/currency` or `@/shared/utils/formatting` or use `<NumericValue />` from `@/shared/components/NumericValue`.
8. **Integrity Guarantee:** Never alter actual numeric formulas, minor-unit calculations, or database values; standard formatting applies strictly at the visual presentation layer.

