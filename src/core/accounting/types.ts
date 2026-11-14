export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
export type NormalBalance = 'DEBIT' | 'CREDIT';
export type EntityType = 'CUSTOMER' | 'VENDOR' | 'EMPLOYEE';

export interface ChartOfAccount {
  id: string; // UUID
  code: string; // e.g., '1030'
  name: string;
  type: AccountType;
  normal_balance: NormalBalance;
  parent_id: string | null;
  parent_code?: string | null;
  parent_name?: string | null;
  is_active: number;
  is_system: number;
  currency: string;
  account_group?: string | null;
  description?: string | null;
  balance?: number; // Calculated on the fly (decimal PKR)
  balance_paisas?: number; // Exact integer minor units
  total_debits?: number;
  total_credits?: number;
  total_debits_paisas?: number;
  total_credits_paisas?: number;
  transaction_count?: number;
  sub_account_count?: number;
  created_at: string;
  updated_at: string;
}

export type JournalStatus = 'DRAFT' | 'POSTED' | 'VOID';

export interface JournalLine {
  id: string; // UUID
  company_id?: string;
  journal_id: string;
  account_id: string;
  account_code?: string;
  account_name?: string;
  debit: number; // Decimal PKR for display
  credit: number;
  debit_paisas: number; // Exact integer minor units stored in DB
  credit_paisas: number;
  entity_id?: string | null; // Sub-ledger link (e.g. customer UUID, vendor UUID)
  entity_type?: EntityType | null; // 'CUSTOMER' | 'VENDOR' | 'EMPLOYEE'
  entity_name?: string | null;
  memo?: string | null;
  created_at?: string;
}

export interface JournalEntry {
  id: string; // UUID
  company_id?: string;
  entry_number: string;
  entry_date: string;
  description: string;
  source_module: string;
  sourceModule?: string;
  source_document_id?: string | null;
  status: JournalStatus;
  total_amount: number; // Decimal PKR
  total_amount_paisas: number; // Integer Paisas
  created_by?: string;
  reversal_of_id?: string | null; // If this entry is a reversal of another entry
  is_reversed?: number; // 1 if this entry has been reversed
  sync_status: 'pending' | 'synced' | 'conflict';
  version: number;
  created_at: string;
  updated_at: string;
  lines?: JournalLine[];
}

export interface CreateJournalLineInput {
  accountId: string;
  debit: number; // in PKR (e.g. 1500.50)
  credit: number;
  debitPaisas?: number;
  creditPaisas?: number;
  memo?: string;
  entityId?: string | null;
  entityType?: EntityType | null;
}

export interface CreateJournalEntryInput {
  companyId?: string;
  entryDate: string;
  description: string;
  sourceModule: string;
  sourceDocumentId?: string;
  lines: CreateJournalLineInput[];
  createdBy?: string;
}

export interface TrialBalanceRow {
  accountId: string;
  code: string;
  name: string;
  type: AccountType;
  totalDebit: number;
  totalCredit: number;
  netBalance: number;
  normalBalance: NormalBalance;
}

export interface SubLedgerEntry {
  date: string;
  voucherNumber: string;
  description: string;
  memo?: string | null;
  debit: number;
  credit: number;
  runningBalance: number;
}
