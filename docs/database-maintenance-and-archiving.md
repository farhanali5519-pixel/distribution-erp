# SaleFlow ERP — Database Maintenance, Archiving & Read-Replica Architecture

This document specifies the operational database maintenance policies, autovacuum tuning, slow query monitoring, read-replica routing, and historical archiving strategy for SaleFlow ERP as part of **Phase 6 Performance & Database Optimization**.

---

## 1. PostgreSQL Engine & Autovacuum Tuning

In multi-tenant ERP operations handling hundreds of companies and hundreds of thousands of ledger entries, table bloat and stale query planner statistics are the primary causes of query degradation.

### 1.1 Recommended Server Configuration (`postgresql.conf`)

| Parameter | Recommended Value | Purpose |
|---|---|---|
| `shared_buffers` | 25% of system RAM (e.g., 4GB on 16GB host) | Primary page cache for active indexes and table blocks |
| `effective_cache_size` | 75% of system RAM | Informs query planner of available filesystem cache |
| `work_mem` | 16MB – 32MB | Memory per sort/hash join operation (prevents disk spill) |
| `maintenance_work_mem` | 512MB – 1GB | Accelerates `VACUUM`, `CREATE INDEX`, and `ALTER TABLE` |
| `checkpoint_completion_target` | 0.9 | Smooths disk I/O over checkpoint intervals |
| `wal_buffers` | 16MB | Buffers WAL activity during peak transactional bursts |

### 1.2 Autovacuum Optimization for High-Churn Tables

Default PostgreSQL autovacuum settings wait for 20% of a table to change before running vacuum. On a 1,000,000-row `journal_lines` table, that would require 200,000 dead tuples before cleaning!

We configure aggressive autovacuum thresholds for transactional ledger tables:

```sql
-- Aggressive autovacuum for high-volume ledger and order tables
ALTER TABLE sales_orders SET (
    autovacuum_vacuum_scale_factor = 0.05,
    autovacuum_vacuum_threshold = 1000,
    autovacuum_analyze_scale_factor = 0.02,
    autovacuum_analyze_threshold = 500
);

ALTER TABLE sales_order_items SET (
    autovacuum_vacuum_scale_factor = 0.05,
    autovacuum_vacuum_threshold = 2000,
    autovacuum_analyze_scale_factor = 0.02,
    autovacuum_analyze_threshold = 1000
);

ALTER TABLE journal_lines SET (
    autovacuum_vacuum_scale_factor = 0.02,
    autovacuum_vacuum_threshold = 1000,
    autovacuum_analyze_scale_factor = 0.01,
    autovacuum_analyze_threshold = 500
);

ALTER TABLE inventory_movements SET (
    autovacuum_vacuum_scale_factor = 0.02,
    autovacuum_vacuum_threshold = 1000,
    autovacuum_analyze_scale_factor = 0.01,
    autovacuum_analyze_threshold = 500
);

ALTER TABLE audit_logs SET (
    autovacuum_vacuum_scale_factor = 0.05,
    autovacuum_vacuum_threshold = 1000
);
```

---

## 2. Routine Maintenance Schedule

Automate these maintenance tasks via local cron or Windows Task Scheduler during off-peak hours (e.g., 03:00 AM local time):

### 2.1 Daily Off-Peak Maintenance
```sql
-- Re-analyze active transactional tables to maintain accurate query plans
ANALYZE sales_orders;
ANALYZE sales_order_items;
ANALYZE inventory_movements;
ANALYZE journal_lines;
ANALYZE journal_entries;
ANALYZE customers;
```

### 2.2 Weekly Index Maintenance
High insert/update volume can fragment B-tree indexes over time. Use `REINDEX CONCURRENTLY` so transactional operations are never blocked:

```sql
-- Concurrent re-indexing avoids table-level locks
REINDEX TABLE CONCURRENTLY sales_orders;
REINDEX TABLE CONCURRENTLY sales_order_items;
REINDEX TABLE CONCURRENTLY journal_lines;
REINDEX TABLE CONCURRENTLY inventory_movements;
```

### 2.3 Bloat Detection Query
To monitor unused dead space across tables:

```sql
SELECT
    schemaname,
    relname,
    n_dead_tup,
    n_live_tup,
    ROUND(n_dead_tup * 100.0 / NULLIF(n_live_tup + n_dead_tup, 0), 2) AS dead_tuple_pct,
    last_vacuum,
    last_autovacuum
FROM pg_stat_user_tables
WHERE n_dead_tup > 500
ORDER BY dead_tuple_pct DESC;
```

---

## 3. Slow Query Telemetry & Performance Monitoring

### 3.1 Enabling `pg_stat_statements`
Add to `postgresql.conf`:
```ini
shared_preload_libraries = 'pg_stat_statements'
pg_stat_statements.max = 5000
pg_stat_statements.track = all
log_min_duration_statement = 250   # Log queries taking longer than 250ms
```

### 3.2 Identifying Top Slow Queries
```sql
SELECT
    substring(query, 1, 80) AS query_snippet,
    calls,
    ROUND(total_exec_time::numeric, 2) AS total_time_ms,
    ROUND(mean_exec_time::numeric, 2) AS avg_time_ms,
    rows
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 15;
```

### 3.3 Connection Pool Metrics
SaleFlow exposes live pool health through `PostgresAdapter.getPoolStats()`:
- `totalCount`: Number of currently opened sockets
- `idleCount`: Available idle connections ready for immediate reuse
- `waitingCount`: Queued client requests waiting for a free connection

Alert if `waitingCount > 10` for more than 5 seconds.

---

## 4. Read-Replica Routing Architecture

SaleFlow codebase is architecturally prepared for physical read replicas via `src/core/database/factory.ts`:

```
                           +------------------------+
                           |   SaleFlow ERP App     |
                           +------------------------+
                               /                \
          intent === 'write'  /                  \  intent === 'read'
                             v                    v
              +----------------------+    +-----------------------+
              | Primary Database     |    | Read-Only Replica     |
              | (Writes + Core Reads)|    | (Heavy BI & Reports)  |
              +----------------------+    +-----------------------+
                         |                            ^
                         +--- Streaming Replication --+
```

### 4.1 Strict Routing Rules
1. **Critical Transactional Reads:** All immediate reads following a mutation (e.g., verifying newly posted sale order, checking credit limit balance before invoice posting, stock validation) **MUST** query the Primary database (`intent: 'write'` or `'primary'`). This prevents race conditions caused by replication lag.
2. **Heavy Historical Reports:** Large date-range reports (Year-to-Date Trial Balance, Annual Sales Trend, Inventory Audit Ledger) can be safely routed to `getDatabaseClient('read')`. If `DATABASE_READ_URL` is omitted, the factory automatically falls back to primary without application errors.

---

## 5. Historical Year Archiving Strategy

As companies accumulate hundreds of thousands of transactions over multiple years, historical data should be archived to preserve transactional query velocity while guaranteeing audit and financial balance integrity.

### 5.1 Annual Fiscal Year Closing Process
When a financial year closes:
1. **Financial Roll-Forward:** The accounting engine generates an automated Year-End Closing Journal Entry (`source_module: 'year_end_close'`):
   - Net Income (Revenue − Expenses) is transferred to Retained Earnings (`3010 Owner Capital / Equity`).
   - Revenue and Expense accounts are zeroed out for the new fiscal year.
   - Balance Sheet accounts (Asset, Liability, Equity) maintain their continuous cumulative balances.
2. **Opening Balance Confirmation:** The opening trial balance for the new fiscal year exactly matches the audited closing trial balance of the prior year.

### 5.2 Table Partitioning Architecture (Future Cloud Stage)
When dataset sizes exceed millions of rows, declarative PostgreSQL table partitioning by range can be introduced without breaking application queries:

```sql
-- Example future partitioned sales_orders table
CREATE TABLE sales_orders_partitioned (
    id TEXT NOT NULL,
    company_id TEXT NOT NULL,
    order_date DATE NOT NULL,
    -- ... remaining columns
    PRIMARY KEY (company_id, order_date, id)
) PARTITION BY RANGE (order_date);

-- Fiscal year partitions
CREATE TABLE sales_orders_2025 PARTITION OF sales_orders_partitioned
    FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');

CREATE TABLE sales_orders_2026 PARTITION OF sales_orders_partitioned
    FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
```

### 5.3 Cold Storage Archiving
1. Completed fiscal years older than 3 years can be exported to compressed Parquet or NDJSON archives.
2. Historical read-only archive tables can be relocated to a separate low-cost tablespace or cold storage bucket.
3. **Immutability Guarantee:** No historical journal line, document sequence, or audit log is ever deleted.
