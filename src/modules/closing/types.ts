export interface DenominationBreakdown {
  note5000: number;
  note1000: number;
  note500: number;
  note100: number;
  note50: number;
  note20: number;
  note10: number;
  coinsLoose: number; // in PKR
}

export interface DailyReconciliationResult {
  company_id?: string;
  closingDate: string;
  openingCashPaisas: number;
  openingCash: number;
  spotCashSalesPaisas: number;
  spotCashSales: number;
  debtRecoveriesPaisas: number;
  debtRecoveries: number;
  spotCashPurchasesPaisas: number;
  spotCashPurchases: number;
  dailyExpensesPaisas: number;
  dailyExpenses: number;
  bankDepositsPaisas: number;
  bankDeposits: number;
  expectedCashPaisas: number;
  expectedCash: number;
  isFinalized: boolean;
  finalizedClosing?: {
    id: string;
    company_id?: string;
    closing_date: string;
    physical_cash_paisas: number;
    physical_cash: number;
    variance_paisas: number;
    variance: number;
    denominations: DenominationBreakdown;
    status: 'OPEN' | 'CLOSED';
    notes: string | null;
    closed_by: string;
    closed_at: string;
  };
}

export interface FinalizeDailyClosingInput {
  companyId?: string;
  closingDate: string;
  openingCashPaisas: number;
  spotCashSalesPaisas: number;
  debtRecoveriesPaisas: number;
  spotCashPurchasesPaisas: number;
  dailyExpensesPaisas: number;
  bankDepositsPaisas: number;
  expectedCashPaisas: number;
  physicalCashPaisas: number;
  denominations: DenominationBreakdown;
  notes?: string;
  closedBy?: string;
}

