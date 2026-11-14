import { ChartOfAccount, AccountType, NormalBalance } from '@/core/accounting/types';

export type MainAccountHead =
  | 'Assets'
  | 'Liabilities'
  | 'Equity'
  | 'Revenue / Income'
  | 'Cost of Sales'
  | 'Expenses';

export interface HeadDefinition {
  key: MainAccountHead;
  title: string;
  codePrefix: string;
  badgeColor: string;
  badgeBg: string;
  badgeBorder: string;
  description: string;
}

export const MAIN_HEADS: HeadDefinition[] = [
  {
    key: 'Assets',
    title: 'Assets',
    codePrefix: '1xxx',
    badgeColor: '#0284c7',
    badgeBg: 'rgba(2, 132, 199, 0.08)',
    badgeBorder: 'rgba(2, 132, 199, 0.25)',
    description: 'Cash, bank accounts, customer receivables, inventory merchandise, and company assets',
  },
  {
    key: 'Liabilities',
    title: 'Liabilities',
    codePrefix: '2xxx',
    badgeColor: '#d97706',
    badgeBg: 'rgba(217, 119, 6, 0.08)',
    badgeBorder: 'rgba(217, 119, 6, 0.25)',
    description: 'Vendor accounts payable, tax liabilities, short-term advances, and financial obligations',
  },
  {
    key: 'Equity',
    title: 'Equity',
    codePrefix: '3xxx',
    badgeColor: '#6366f1',
    badgeBg: 'rgba(99, 102, 241, 0.08)',
    badgeBorder: 'rgba(99, 102, 241, 0.25)',
    description: "Owner's capital, retained earnings, shareholder equity, and opening balances",
  },
  {
    key: 'Revenue / Income',
    title: 'Revenue / Income',
    codePrefix: '4xxx',
    badgeColor: '#16a34a',
    badgeBg: 'rgba(22, 163, 74, 0.08)',
    badgeBorder: 'rgba(22, 163, 74, 0.25)',
    description: 'Wholesale sales revenue, logistics delivery charges, and other operating turnover',
  },
  {
    key: 'Cost of Sales',
    title: 'Cost of Sales',
    codePrefix: '501x',
    badgeColor: '#ea580c',
    badgeBg: 'rgba(234, 88, 12, 0.08)',
    badgeBorder: 'rgba(234, 88, 12, 0.25)',
    description: 'Cost of Goods Sold (COGS), direct unit merchandise costs, and direct trade procurement',
  },
  {
    key: 'Expenses',
    title: 'Expenses',
    codePrefix: '502x-7xxx',
    badgeColor: '#dc2626',
    badgeBg: 'rgba(220, 38, 38, 0.08)',
    badgeBorder: 'rgba(220, 38, 38, 0.25)',
    description: 'Distribution van fuel, driver per diem, godown rent, utilities, repair, and overhead',
  },
];

export function resolveAccountHead(acc: {
  type: string;
  code: string;
  name?: string;
  account_group?: string | null;
  parent_code?: string | null;
}): MainAccountHead {
  if (acc.account_group) {
    const g = acc.account_group.trim().toLowerCase();
    if (g.includes('asset')) return 'Assets';
    if (g.includes('liabilit')) return 'Liabilities';
    if (g.includes('equity') || g.includes('capital')) return 'Equity';
    if (g.includes('revenue') || g.includes('income')) return 'Revenue / Income';
    if (g.includes('cost of sales') || g.includes('cost of goods') || g.includes('cogs')) return 'Cost of Sales';
    if (g.includes('expense')) return 'Expenses';
  }

  if (acc.type === 'ASSET') return 'Assets';
  if (acc.type === 'LIABILITY') return 'Liabilities';
  if (acc.type === 'EQUITY') return 'Equity';
  if (acc.type === 'REVENUE') return 'Revenue / Income';
  if (acc.type === 'EXPENSE') {
    if (
      acc.code.startsWith('501') ||
      acc.code === '5010' ||
      (acc.name && (
        acc.name.toLowerCase().includes('cost of goods') ||
        acc.name.toLowerCase().includes('cogs') ||
        acc.name.toLowerCase().includes('cost of sales')
      ))
    ) {
      return 'Cost of Sales';
    }
    return 'Expenses';
  }

  if (acc.code.startsWith('1')) return 'Assets';
  if (acc.code.startsWith('2')) return 'Liabilities';
  if (acc.code.startsWith('3')) return 'Equity';
  if (acc.code.startsWith('4')) return 'Revenue / Income';
  if (acc.code.startsWith('501')) return 'Cost of Sales';
  if (acc.code.startsWith('5') || acc.code.startsWith('6') || acc.code.startsWith('7')) return 'Expenses';

  return 'Expenses';
}

export interface EnrichedAccount extends ChartOfAccount {
  head: MainAccountHead;
  children?: EnrichedAccount[];
  level?: number;
}

export interface LedgerEntry {
  id: string;
  journalId: string;
  entryNumber: string;
  entryDate: string;
  sourceModule: string;
  sourceDocumentId: string | null;
  businessReference?: string;
  referenceDisplay?: string;
  description: string;
  memo: string | null;
  debit: number;
  credit: number;
  debitPaisas: number;
  creditPaisas: number;
  runningBalance: number;
  runningBalancePaisas: number;
}

export interface LedgerResponse {
  success: boolean;
  account: ChartOfAccount;
  entries: LedgerEntry[];
  kpi: {
    currentBalance: number;
    currentBalancePaisas: number;
    totalDebits: number;
    totalDebitsPaisas: number;
    totalCredits: number;
    totalCreditsPaisas: number;
    totalTransactions: number;
    netBalance: number;
    netBalancePaisas: number;
  };
}
