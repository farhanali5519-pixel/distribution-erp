import { DoubleEntryEngine } from '@/core/accounting/engine';
import { formatCurrency, areBalancesEqual } from '@/shared/utils/currency';
import { CheckCircle2, AlertCircle } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function TrialBalancePage() {
  const { rows, totalDebits, totalCredits } = DoubleEntryEngine.getTrialBalance();
  const isBalanced = areBalancesEqual(totalDebits, totalCredits);

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.75rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-heading)', letterSpacing: '-0.02em' }}>
            Trial Balance
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Verification schedule confirming that total debits equal total credits across all accounts.
          </p>
        </div>

        {/* Verification Pill */}
        {isBalanced ? (
          <div style={{
            background: 'rgba(16, 185, 129, 0.12)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: 'var(--radius-md)',
            padding: '0.65rem 1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            color: '#10b981'
          }}>
            <CheckCircle2 size={20} />
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>LEDGER BALANCED</div>
              <div style={{ fontSize: '0.75rem', opacity: 0.85 }}>Total Debits = Total Credits</div>
            </div>
          </div>
        ) : (
          <div style={{
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 'var(--radius-md)',
            padding: '0.65rem 1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            color: '#ef4444'
          }}>
            <AlertCircle size={20} />
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>IMBALANCE DETECTED</div>
              <div style={{ fontSize: '0.75rem' }}>Variance: {formatCurrency(Math.abs(totalDebits - totalCredits))}</div>
            </div>
          </div>
        )}
      </div>

      {/* Trial Balance Table Card */}
      <div className="card">
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Account Title</th>
                <th>Classification</th>
                <th>Normal Balance</th>
                <th style={{ textAlign: 'right' }}>Debit Balance</th>
                <th style={{ textAlign: 'right' }}>Credit Balance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.accountId}>
                  <td className="numeric-text" style={{ fontWeight: 700, color: 'var(--primary)' }}>
                    {row.code}
                  </td>
                  <td style={{ fontWeight: 600, color: 'var(--text-heading)' }}>{row.name}</td>
                  <td>
                    <span className="badge badge-muted">{row.type}</span>
                  </td>
                  <td>
                    <span className="badge badge-primary">{row.normalBalance}</span>
                  </td>
                  <td className="tabular-nums text-right font-medium" style={{ color: row.totalDebit > 0 ? 'var(--primary)' : 'var(--text-muted)' }}>
                    {formatCurrency(row.totalDebit)}
                  </td>
                  <td className="tabular-nums text-right font-medium" style={{ color: row.totalCredit > 0 ? 'var(--accent-emerald)' : 'var(--text-muted)' }}>
                    {formatCurrency(row.totalCredit)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--bg-panel)', fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-heading)' }}>
                <td colSpan={4} style={{ padding: '0.85rem 1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Total General Ledger Balances
                </td>
                <td className="tabular-nums text-right" style={{ padding: '0.85rem 1rem', color: 'var(--primary)', fontWeight: 700 }}>
                  {formatCurrency(totalDebits)}
                </td>
                <td className="tabular-nums text-right" style={{ padding: '0.85rem 1rem', color: 'var(--accent-emerald)', fontWeight: 700 }}>
                  {formatCurrency(totalCredits)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
