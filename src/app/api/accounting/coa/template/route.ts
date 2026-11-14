import { NextResponse } from 'next/server';

export async function GET() {
  const headers = [
    'account_code',
    'account_name',
    'parent_account_code',
    'account_group',
    'account_type',
    'opening_balance',
    'active_status',
  ];

  const sampleRows = [
    ['1026', 'Allied Bank Limited (Islamic)', '1020', 'Assets', 'ASSET', '0', '1'],
    ['1050', 'Security Deposits Receivable', '', 'Assets', 'ASSET', '0', '1'],
    ['2030', 'Short Term Bank Financing', '', 'Liabilities', 'LIABILITY', '0', '1'],
    ['4040', 'Scrap & Packaging Sales Revenue', '', 'Revenue / Income', 'REVENUE', '0', '1'],
    ['5015', 'Sub-Contracting Packaging Costs', '5010', 'Cost of Sales', 'EXPENSE', '0', '1'],
    ['6010', 'Office Internet & Telecommunications', '', 'Expenses', 'EXPENSE', '0', '1'],
  ];

  const csv = [headers.join(','), ...sampleRows.map(r => r.join(','))].join('\r\n');

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="chart_of_accounts_sample_template.csv"',
    },
  });
}
