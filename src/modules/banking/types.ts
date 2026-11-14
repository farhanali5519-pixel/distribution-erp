export type BankAccountType = 'CURRENT' | 'SAVINGS' | 'OTHER';

export interface BankAccount {
  id: string;
  bank_name: string;
  account_title: string;
  account_number: string;
  iban: string | null;
  branch_name: string | null;
  branch_code: string | null;
  account_type: BankAccountType;
  currency: string;
  opening_balance_paisas: number;
  opening_balance: number;
  account_id: string; // Linked GL Account
  is_active: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  company_id?: string;
  // Computed & joined fields
  gl_account_code?: string;
  gl_account_name?: string;
  current_balance: number;
  current_balance_paisas: number;
}

export interface CreateBankAccountInput {
  companyId?: string;
  bankName: string;
  accountTitle: string;
  accountNumber: string;
  iban?: string | null;
  branchName?: string | null;
  branchCode?: string | null;
  accountType?: BankAccountType;
  currency?: string;
  openingBalance?: number;
  accountId?: string | null;
  autoCreateGLAccount?: boolean;
  isActive?: boolean;
  notes?: string | null;
}

export interface UpdateBankAccountInput {
  bankName?: string;
  accountTitle?: string;
  accountNumber?: string;
  iban?: string | null;
  branchName?: string | null;
  branchCode?: string | null;
  accountType?: BankAccountType;
  currency?: string;
  accountId?: string | null;
  isActive?: boolean;
  notes?: string | null;
}

export interface BankStatementFilter {
  bankAccountId: string;
  fromDate?: string;
  toDate?: string;
}

export interface BankStatementLine {
  date: string;
  voucherNumber: string;
  entryNumber?: string;
  businessReference?: string;
  sourceModule: string;
  sourceDocumentId?: string | null;
  journalEntryId?: string | null;
  transactionType: string;
  description: string;
  memo: string | null;
  debit: number;
  credit: number;
  runningBalance: number;
  debitPaisas: number;
  creditPaisas: number;
  runningBalancePaisas: number;
}

export interface BankStatementReport {
  bankAccount: BankAccount;
  fromDate: string;
  toDate: string;
  openingBalance: number;
  totalDeposits: number;
  totalWithdrawals: number;
  netMovement: number;
  closingBalance: number;
  lines: BankStatementLine[];
}

export interface BankDeletionCheckResult {
  canDelete: boolean;
  message?: string;
  summary: {
    totalLinked: number;
    customerPaymentsCount: number;
    vendorPaymentsCount: number;
    expensesCount: number;
    otherJournalEntriesCount: number;
  };
  linkedItems: {
    customerPayments: { id: string; number: string; date: string; amount: number; party: string }[];
    vendorPayments: { id: string; number: string; date: string; amount: number; party: string }[];
    expenses: { id: string; number: string; date: string; amount: number; description: string }[];
    journalEntries: { id: string; number: string; date: string; description: string }[];
  };
}

export interface PaymentAccountOption {
  id: string; // The GL account ID used for posting
  bankAccountId?: string | null;
  code: string;
  name: string;
  accountType: 'CASH' | 'BANK';
  bankName?: string | null;
  accountNumber?: string | null;
  currentBalance: number;
  isActive: boolean;
}
