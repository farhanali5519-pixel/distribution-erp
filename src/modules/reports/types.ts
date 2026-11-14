export type PartyType = 'CUSTOMER' | 'VENDOR';

export interface PartyLedgerFilter {
  companyId?: string;
  entityType: PartyType;
  entityId: string;
  fromDate?: string;
  toDate?: string;
}

export interface PartyLedgerLine {
  date: string;
  voucherNumber: string;
  entryNumber?: string | null;
  businessReference?: string | null;
  sourceModule: string;
  sourceDocumentId?: string | null;
  journalEntryId?: string | null;
  transactionType: string;
  description: string;
  memo?: string | null;
  debit: number;
  credit: number;
  runningBalance: number;
  debitPaisas: number;
  creditPaisas: number;
  runningBalancePaisas: number;
}

export interface PartyLedgerStatement {
  party: {
    id: string;
    name: string;
    shopName?: string | null;
    companyName?: string | null;
    contactPerson?: string | null;
    phone?: string | null;
    address?: string | null;
    city?: string | null;
    cnicOrNtn?: string | null;
    entityType: PartyType;
  };
  fromDate: string;
  toDate: string;
  openingBalance: number;
  openingBalancePaisas: number;
  totalDebits: number;
  totalCredits: number;
  closingBalance: number;
  closingBalancePaisas: number;
  lines: PartyLedgerLine[];
}

export interface ExpenseItem {
  code: string;
  name: string;
  amount: number;
  amountPaisas: number;
  percentageOfRevenue: number;
}

export interface ProfitAndLossStatement {
  fromDate: string;
  toDate: string;
  grossSales: number;
  grossSalesPaisas: number;
  salesReturns: number;
  salesReturnsPaisas: number;
  netSales: number;
  netSalesPaisas: number;
  costOfGoodsSold: number;
  costOfGoodsSoldPaisas: number;
  grossProfit: number;
  grossProfitPaisas: number;
  grossMarginPercentage: number;
  operatingExpenses: ExpenseItem[];
  totalOperatingExpenses: number;
  totalOperatingExpensesPaisas: number;
  netProfit: number;
  netProfitPaisas: number;
  netMarginPercentage: number;
}

export interface StockValuationRow {
  productId: string;
  sku: string;
  name: string;
  categoryName: string;
  boxesPerCarton: number;
  piecesPerBox: number;
  totalPiecesPerCarton: number;
  currentStockBase: number;
  cartonsCount: number;
  boxesCount: number;
  piecesCount: number;
  unitCost: number;
  unitCostPaisas: number;
  tradePrice: number;
  sellableStockValue: number;
  sellableStockValuePaisas: number;
  damagedStockBase: number;
  damagedStockValue: number;
  damagedStockValuePaisas: number;
  totalStockValue: number;
  totalStockValuePaisas: number;
  minStockAlert: number;
  isLowStock: boolean;
}

export interface StockValuationSummary {
  totalSellableStockValue: number;
  totalSellableStockValuePaisas: number;
  totalDamagedStockValue: number;
  totalDamagedStockValuePaisas: number;
  totalCombinedStockValue: number;
  totalCombinedStockValuePaisas: number;
  totalSellablePieces: number;
  totalDamagedPieces: number;
  glInventoryAccountBalance: number;
  varianceWithGL: number;
  rows: StockValuationRow[];
}

export interface SalesmanPerformanceRow {
  salesmanId: string;
  salesmanName: string;
  phone?: string | null;
  assignedRoutes: string;
  ordersCount: number;
  grossBilled: number;
  grossBilledPaisas: number;
  spotCashCollected: number;
  spotCashCollectedPaisas: number;
  creditGiven: number;
  creditGivenPaisas: number;
  routeRecoveriesCollected: number;
  routeRecoveriesCollectedPaisas: number;
  totalCashHandedOver: number;
  totalCashHandedOverPaisas: number;
}

export interface SalesmanPerformanceSummary {
  fromDate: string;
  toDate: string;
  totalOrders: number;
  totalGrossBilled: number;
  totalSpotCash: number;
  totalCreditGiven: number;
  totalRecoveries: number;
  totalCashHandedOver: number;
  salesmen: SalesmanPerformanceRow[];
}

export interface StaffDistributionFilter {
  companyId?: string;
  fromDate?: string;
  toDate?: string;
  salesmanId?: string;
  supplyPersonId?: string;
  routeId?: string;
  customerId?: string;
  productId?: string;
  categoryId?: string;
  status?: string;
  viewType?: 'salesperson' | 'supply_person' | 'items' | 'customers' | 'transactions';
}

export interface SalespersonReportRow {
  staffId: string | null;
  employeeCode: string;
  staffName: string;
  phone?: string | null;
  role: string;
  assignedRoute?: string;
  ordersCount: number;
  invoicesCount: number;
  quantitySoldBase: number;
  grossSalesPaisas: number;
  grossSales: number;
  lineDiscountPaisas: number;
  billDiscountPaisas: number;
  totalDiscountPaisas: number;
  totalDiscount: number;
  netSalesPaisas: number;
  netSales: number;
  returnsCount: number;
  returnsQuantityBase: number;
  returnsAmountPaisas: number;
  returnsAmount: number;
  netAfterReturnsPaisas: number;
  netAfterReturns: number;
  netSalesAfterReturns?: number;
  collectionsPaisas: number;
  collections: number;
  spotCashCollectedPaisas: number;
  spotCashCollected: number;
  totalLiquidityCollectedPaisas: number;
  totalLiquidityCollected: number;
}

export interface SupplyPersonReportRow {
  staffId: string | null;
  employeeCode: string;
  staffName: string;
  phone?: string | null;
  role: string;
  assignedRoute?: string;
  ordersDeliveredCount: number;
  invoicesCount: number;
  quantityDeliveredBase: number;
  cartonsDelivered: number;
  deliveryAmountPaisas: number;
  deliveryAmount: number;
  returnsCount: number;
  returnsQuantityBase: number;
  returnsAmountPaisas: number;
  returnsAmount: number;
  routesServiced: string;
  customersServedCount: number;
}

export interface StaffItemReportRow {
  staffId: string | null;
  staffName: string;
  employeeCode: string;
  staffRoleType: 'SALESPERSON' | 'SUPPLY_PERSON';
  productId: string;
  sku: string;
  productName: string;
  categoryName: string;
  uomBase: string;
  uomBulk: string;
  quantitySoldBase: number;
  cartonsSold: number;
  loosePiecesSold: number;
  grossAmountPaisas: number;
  grossAmount: number;
  discountPaisas: number;
  discount: number;
  netAmountPaisas: number;
  netAmount: number;
  returnsQuantityBase: number;
  returnsAmountPaisas: number;
  returnsAmount: number;
  netDeliveredQuantityBase: number;
  netDeliveredAmountPaisas: number;
  netDeliveredAmount: number;
}

export interface StaffCustomerReportRow {
  staffId: string | null;
  staffName: string;
  employeeCode: string;
  staffRoleType: 'SALESPERSON' | 'SUPPLY_PERSON';
  customerId: string;
  customerName: string;
  shopName: string | null;
  routeName: string | null;
  ordersCount: number;
  quantityBase: number;
  netSalesPaisas: number;
  netSales: number;
  returnsPaisas: number;
  returns: number;
  netAfterReturnsPaisas: number;
  netAfterReturns: number;
  collectionsPaisas: number;
  collections: number;
}

export interface StaffTransactionReportRow {
  id: string;
  transactionNumber: string;
  transactionType: 'ORDER' | 'DIRECT_SALE' | 'RETURN';
  date: string;
  customerId: string;
  customerName: string;
  salesmanId: string | null;
  salesmanName: string;
  supplyPersonId: string | null;
  supplyPersonName: string;
  routeName: string | null;
  status: string;
  itemCount: number;
  quantityBase: number;
  grossAmount: number;
  discount: number;
  netAmount: number;
  cashReceived: number;
  remainingBalance: number;
}

export interface DistributionTeamReportSummary {
  fromDate: string;
  toDate: string;
  summary: {
    totalSalesmen: number;
    totalOrders: number;
    totalInvoices: number;
    totalQuantitySoldBase: number;
    totalGrossSales: number;
    totalDiscounts: number;
    totalNetSales: number;
    totalReturnsAmount: number;
    totalNetAfterReturns: number;
    totalCollections: number;
    totalDeliveries: number;
    totalQuantityDeliveredBase: number;
  };
  salespersonRows: SalespersonReportRow[];
  supplyPersonRows: SupplyPersonReportRow[];
  itemRows: StaffItemReportRow[];
  customerRows: StaffCustomerReportRow[];
  transactionRows: StaffTransactionReportRow[];
}

