export type MovementType =
  | 'OPENING_STOCK'
  | 'PURCHASE'
  | 'PURCHASE_RETURN'
  | 'SALE_ORDER'
  | 'DIRECT_SALE'
  | 'SALE_RETURN'
  | 'STOCK_ADJUSTMENT'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'
  | 'DAMAGE_WRITEOFF'
  | 'BONUS_FREE'
  | 'CANCELLED'
  | 'REVERSAL_IN'
  | 'REVERSAL_OUT';

export type SourceModule = 'inventory' | 'purchase' | 'sales' | 'returns';

export type SourceDocumentType =
  | 'PRODUCT_OPENING'
  | 'PURCHASE_BILL'
  | 'PURCHASE_RETURN'
  | 'SALES_ORDER'
  | 'SALES_INVOICE'
  | 'SALES_RETURN'
  | 'STOCK_ADJUSTMENT'
  | 'WAREHOUSE_TRANSFER';

export type MovementStatus = 'POSTED' | 'REVERSED' | 'DELETED';

export interface InventoryMovement {
  id: string;
  movement_number: string;
  movement_date: string;
  created_at: string;
  product_id: string;
  product_name: string;
  sku: string;
  barcode: string | null;
  category_id: string | null;
  category_name: string;
  brand_id: string | null;
  brand_name: string;
  warehouse: string;
  to_warehouse: string | null;
  movement_type: MovementType;
  source_module: SourceModule;
  source_document_type: SourceDocumentType;
  document_number: string;
  original_transaction_id: string | null;
  reference_number: string | null;
  quantity_in_base: number;
  quantity_out_base: number;
  net_quantity_base: number;
  cartons_count: number;
  boxes_count: number;
  pieces_count: number;
  stock_before_base: number;
  stock_after_base: number;
  unit_cost_paisas: number;
  unit_cost: number;
  total_cost_paisas: number;
  total_cost: number;
  selling_price: number;
  user_id: string;
  user_name: string;
  user_role: string;
  status: MovementStatus;
  reversed_by_user_id: string | null;
  reversed_by_user_name: string | null;
  reversed_at: string | null;
  reversal_reason: string | null;
  admin_override_details: string | null;
  reversal_linked_movement_id: string | null;
  day_close_status: 'OPEN' | 'CLOSED';
  notes: string | null;
}

export interface RecordMovementInput {
  companyId?: string;
  productId: string;
  movementDate?: string;
  warehouse?: string;
  toWarehouse?: string;
  movementType: MovementType;
  sourceModule: SourceModule;
  sourceDocumentType: SourceDocumentType;
  documentNumber: string;
  originalTransactionId?: string | null;
  referenceNumber?: string | null;
  quantityInBase?: number;
  quantityOutBase?: number;
  cartons?: number;
  boxes?: number;
  pieces?: number;
  unitCostPaisas?: number;
  totalCostPaisas?: number;
  sellingPrice?: number;
  userId?: string;
  userName?: string;
  userRole?: string;
  notes?: string;
  reversalLinkedMovementId?: string;
  updateProductStock?: boolean;
}

export interface RecordReversalInput {
  companyId?: string;
  originalTransactionId?: string;
  movementId?: string;
  userId?: string;
  userName?: string;
  userRole?: string;
  reason: string;
  adminPin?: string;
  adminOverrideDetails?: string;
  updateProductStock?: boolean;
}

export interface WarehouseTransferInput {
  companyId?: string;
  productId: string;
  fromWarehouse: string;
  toWarehouse: string;
  quantityBase?: number;
  cartons?: number;
  boxes?: number;
  pieces?: number;
  transferDate?: string;
  referenceNumber?: string;
  notes?: string;
  userId?: string;
  userName?: string;
  userRole?: string;
}

export interface MovementFilterOptions {
  companyId?: string;
  fromDate?: string;
  toDate?: string;
  productId?: string;
  sku?: string;
  categoryId?: string;
  warehouse?: string;
  movementType?: string;
  sourceModule?: string;
  documentNumber?: string;
  user?: string;
  status?: 'ALL' | 'POSTED' | 'REVERSED' | 'DELETED';
  transactionCategory?: 'ALL' | 'SALES' | 'PURCHASE' | 'RETURN' | 'ADJUSTMENT' | 'TRANSFER';
  limit?: number;
  offset?: number;
}

export interface ProductStockLedgerRow {
  id: string;
  movementNumber: string;
  date: string;
  createdAt: string;
  documentNumber: string;
  sourceDocumentType: string;
  originalTransactionId: string | null;
  type: MovementType;
  warehouse: string;
  quantityIn: number;
  quantityOut: number;
  netChange: number;
  balance: number;
  cartons: number;
  boxes: number;
  pieces: number;
  formattedBreakdown: string;
  unitCost: number;
  totalValue: number;
  user: string;
  status: MovementStatus;
  notes: string;
  reversalReason?: string | null;
  reversedBy?: string | null;
  reversedAt?: string | null;
  reversalLinkedMovementId?: string | null;
}

export interface ProductStockLedgerSummary {
  productId: string;
  productName: string;
  sku: string;
  category: string;
  brand: string;
  currentStock: number;
  costPrice: number;
  tradePrice: number;
  warehouse: string;
  openingBalance: number;
  totalIn: number;
  totalOut: number;
  closingBalance: number;
  closingStockValue: number;
  rows: ProductStockLedgerRow[];
}

export interface ReconciliationItem {
  productId: string;
  productName: string;
  sku: string;
  category: string;
  warehouse: string;
  systemCurrentStock: number;
  ledgerCalculatedStock: number;
  difference: number;
  hasVariance: boolean;
  lastMovementDate: string | null;
  lastDocumentNumber: string | null;
  possibleSource: string;
}

export interface InventoryReconciliationReport {
  asOfDate: string;
  totalProductsChecked: number;
  matchedCount: number;
  varianceCount: number;
  totalVariancePieces: number;
  totalVarianceValue: number;
  items: ReconciliationItem[];
}

export interface AuditDashboardKPIs {
  totalProducts: number;
  totalStockValue: number;
  stockInToday: number;
  stockOutToday: number;
  totalAdjustments: number;
  totalReversals: number;
  productsWithVariance: number;
  negativeStockCount: number;
}
