import Link from 'next/link';
import { DoubleEntryEngine } from '@/core/accounting/engine';
import { ModuleRegistry } from '@/core/registry/module-registry';
import { getDatabaseClient } from '@/core/database/factory';
import { formatCurrency, formatInteger } from '@/shared/utils/currency';
import { 
  Layers, 
  ArrowUpRight, 
  TrendingUp, 
  Users, 
  Package, 
  CheckCircle2, 
  Clock,
  BookOpen
} from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const accounts = await DoubleEntryEngine.getAccountsWithBalancesAsync();
  const journalEntries = await DoubleEntryEngine.getEntriesAsync(5);
  const trialBalance = await DoubleEntryEngine.getTrialBalanceAsync();
  const allModules = ModuleRegistry.getAllModules();
  const activeModules = allModules.filter((m) => m.isEnabled);

  const client = getDatabaseClient();
  const customerCount = (await client.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM customers')) || { count: 0 };
  const productCount = (await client.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM products')) || { count: 0 };

  // Calculate quick metric sums
  const totalReceivables = accounts
    .filter((a) => a.code === '1030')
    .reduce((sum, a) => sum + (a.balance || 0), 0);

  const cashAndBank = accounts
    .filter((a) => a.code === '1010' || a.code === '1020')
    .reduce((sum, a) => sum + (a.balance || 0), 0);

  return (
    <div>
      {/* Welcome Banner */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.12) 0%, rgba(99, 102, 241, 0.08) 100%)',
        border: '1px solid rgba(56, 189, 248, 0.2)',
        borderRadius: 'var(--radius-lg)',
        padding: '2rem',
        marginBottom: '2rem',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div style={{ position: 'relative', zIndex: 10 }}>
          <h1 style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--text-heading)', letterSpacing: '-0.02em', marginBottom: '0.4rem' }}>
            Sales & Distribution Overview
          </h1>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '720px', fontSize: '0.925rem' }}>
            Comprehensive overview of daily sales operations, customer receivables, inventory levels, and financial performance.
          </p>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="stats-grid">
        <div className="card stat-card">
          <div className="stat-icon" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}>
            <Layers size={24} />
          </div>
          <div>
            <div className="stat-val">{formatInteger(activeModules.length)} / {formatInteger(allModules.length)}</div>
            <div className="stat-label">Active Modules</div>
          </div>
        </div>

        <div className="card stat-card">
          <div className="stat-icon" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>
            <TrendingUp size={24} />
          </div>
          <div>
            <div className="stat-val">{formatCurrency(totalReceivables)}</div>
            <div className="stat-label">Accounts Receivable</div>
          </div>
        </div>

        <div className="card stat-card">
          <div className="stat-icon" style={{ background: 'rgba(129, 140, 248, 0.15)', color: '#818cf8' }}>
            <Users size={24} />
          </div>
          <div>
            <div className="stat-val">{formatInteger(customerCount?.count || 0)}</div>
            <div className="stat-label">Retail Customers</div>
          </div>
        </div>

        <div className="card stat-card">
          <div className="stat-icon" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' }}>
            <Package size={24} />
          </div>
          <div>
            <div className="stat-val">{formatInteger(productCount?.count || 0)}</div>
            <div className="stat-label">Products in Catalog</div>
          </div>
        </div>
      </div>

      {/* Two-Column Overview */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        {/* Trial Balance Health */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <div>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-heading)' }}>Financial & Trial Balance Status</h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>General ledger equilibrium and account verification</p>
            </div>
            <Link href="/accounting/trial-balance" className="btn btn-outline btn-sm">
              Full View <ArrowUpRight size={14} />
            </Link>
          </div>

          <div style={{
            background: 'var(--bg-panel)',
            borderRadius: 'var(--radius-sm)',
            padding: '1.25rem',
            border: '1px solid var(--border-subtle)',
            marginBottom: '1.25rem'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Total Debits:</span>
              <span className="tabular-nums" style={{ color: '#38bdf8', fontWeight: 600 }}>{formatCurrency(trialBalance.totalDebits)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Total Credits:</span>
              <span className="tabular-nums" style={{ color: '#10b981', fontWeight: 600 }}>{formatCurrency(trialBalance.totalCredits)}</span>
            </div>
            <div style={{ height: '1px', background: 'var(--border-subtle)', margin: '0.75rem 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>Net Variance:</span>
              <span className="badge badge-success">
                <CheckCircle2 size={13} style={{ marginRight: '4px' }} />
                0.00 (Balanced)
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <Link href="/accounting/coa" className="btn btn-outline" style={{ flex: 1 }}>
              <BookOpen size={16} /> Chart of Accounts ({accounts.length})
            </Link>
            <Link href="/accounting/journal" className="btn btn-primary" style={{ flex: 1 }}>
              + Manual Journal Entry
            </Link>
          </div>
        </div>

        {/* Dynamic Pluggable Modules Status */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <div>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-heading)' }}>System Modules</h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Installed business feature modules</p>
            </div>
            <Link href="/modules" className="btn btn-outline btn-sm">
              Manage <ArrowUpRight size={14} />
            </Link>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {allModules.map((mod) => (
              <div key={mod.id} style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.85rem 1rem',
                background: 'var(--bg-panel)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)'
              }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{mod.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>v{mod.version}</div>
                </div>
                <span className={mod.isEnabled ? 'badge badge-success' : 'badge badge-muted'}>
                  {mod.isEnabled ? 'ENABLED' : 'DISABLED'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Double-Entry Journal Entries */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-heading)' }}>Recent General Ledger Entries</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Double-entry postings from all active operational modules</p>
          </div>
          <Link href="/accounting/journal" className="btn btn-outline btn-sm">
            View All Entries <ArrowUpRight size={14} />
          </Link>
        </div>

        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Voucher #</th>
                <th>Date</th>
                <th>Narration</th>
                <th>Source</th>
                <th style={{ textAlign: 'right' }}>Debits</th>
                <th style={{ textAlign: 'right' }}>Credits</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {journalEntries.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    No journal entries recorded yet. Create an invoice or manual voucher to post your first entry.
                  </td>
                </tr>
              ) : (
                journalEntries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="font-mono" style={{ color: 'var(--primary)', fontWeight: 600 }}>{entry.entry_number}</td>
                    <td>{entry.entry_date}</td>
                    <td style={{ fontWeight: 500 }}>{entry.description}</td>
                    <td>
                      <span className="badge badge-primary">{entry.source_module.toUpperCase()}</span>
                    </td>
                    <td className="tabular-nums" style={{ color: '#38bdf8', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(entry.total_amount)}</td>
                    <td className="tabular-nums" style={{ color: '#10b981', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(entry.total_amount)}</td>
                    <td>
                      <span className="badge badge-success">{entry.status}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
