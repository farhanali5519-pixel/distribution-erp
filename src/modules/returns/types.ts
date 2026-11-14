export type ReturnCondition = 'FRESH' | 'DAMAGED_EXPIRED';
export type SettlementType = 'CREDIT_TO_LEDGER' | 'CASH_REFUND';
export type ReturnStatus = 'POSTED' | 'VOID';

export interface CustomerEligibilityResult {
  customerId: string;
  productId: string;
  productName: string;
  sku: string;
  boxesPerCarton: number;
  piecesPerBox: number;
  totalPiecesPerCarton: number;
  tradePricePaisas: number;
  tradePrice: number;
  totalDeliveredBase: number;
  alreadyReturnedBase: number;
  maxReturnableBase: number;
  isEligible: boolean;
}

export interface SalesReturnItemInput {
  productId: string;
  condition: ReturnCondition;
  cartonsQty?: number;
  boxesQty?: number;
  piecesQty?: number;
  totalBaseQty?: number;
  unitRatePaisas?: number;
  unitRate?: number;
}

export interface CreateSalesReturnInput {
  companyId?: string;
  customerId: string;
  invoiceId?: string | null;
  returnDate: string;
  salesmanId?: string | null;
  supplyPersonId?: string | null;
  settlementType: SettlementType;
  notes?: string;
  items: SalesReturnItemInput[];
}

export interface SalesReturnItemDetail {
  id: string;
  return_id: string;
  product_id: string;
  product_name: string;
  sku: string;
  condition: ReturnCondition;
  cartons_qty: number;
  boxes_qty: number;
  pieces_qty: number;
  total_base_qty: number;
  unit_rate_paisas: number;
  line_total_paisas: number;
  unit_rate: number;
  line_total: number;
}

export interface SalesReturnSummary {
  id: string;
  return_number: string;
  customer_id: string;
  customer_name: string;
  shop_name?: string | null;
  invoice_id?: string | null;
  return_date: string;
  salesman_id?: string | null;
  salesman_name?: string | null;
  supply_person_id?: string | null;
  supply_person_name?: string | null;
  settlement_type: SettlementType;
  subtotal_paisas: number;
  total_refund_paisas: number;
  subtotal: number;
  total_refund: number;
  journal_entry_id: string;
  notes?: string | null;
  status: ReturnStatus;
  created_at: string;
  items?: SalesReturnItemDetail[];
}

export interface PurchaseReturnItemInput {
  productId: string;
  cartonsQty?: number;
  boxesQty?: number;
  piecesQty?: number;
  totalBaseQty?: number;
  ratePerPiecePaisas?: number;
  ratePerPiece?: number;
}

export interface CreatePurchaseReturnInput {
  companyId?: string;
  vendorId: string;
  returnDate: string;
  vendorInvoiceNumber?: string;
  notes?: string;
  items: PurchaseReturnItemInput[];
}

export interface PurchaseReturnItemDetail {
  id: string;
  return_id: string;
  product_id: string;
  product_name: string;
  sku: string;
  cartons_qty: number;
  boxes_qty: number;
  pieces_qty: number;
  total_base_qty: number;
  rate_per_piece_paisas: number;
  line_total_paisas: number;
  rate_per_piece: number;
  line_total: number;
}

export interface PurchaseReturnSummary {
  id: string;
  return_number: string;
  vendor_id: string;
  vendor_name: string;
  return_date: string;
  vendor_invoice_number?: string | null;
  total_amount_paisas: number;
  total_amount: number;
  journal_entry_id: string;
  notes?: string | null;
  status: ReturnStatus;
  created_at: string;
  items?: PurchaseReturnItemDetail[];
}
