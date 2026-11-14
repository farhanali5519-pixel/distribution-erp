import { getDatabase } from '@/core/database/db';
import { DEFAULT_COMPANY_ID } from '@/core/tenancy/constants';
import { FilterDimensionsResult, SalesAnalysisService } from './sales-analysis.service';

export type { FilterDimensionsResult };

export type StockReportViewType =
  | 'detailed'
  | 'supply_man'
  | 'salesman'
  | 'order_booker'
  | 'customer'
  | 'order'
  | 'item'
  | 'route'
  | 'brand'
  | 'company'
  | 'category'
  | 'warehouse';

export type StockViewMode =
  | 'all'
  | 'physical'
  | 'booked'
  | 'allocated'
  | 'available';

export interface PackagingBreakdown {
  cartons: number;
  boxes: number;
  loosePieces: number;
  formatted: string;
}

export function formatPackagingBreakdown(
  totalPieces: number,
  piecesPerCarton: number = 1,
  piecesPerBox: number = 1
): PackagingBreakdown {
  const conv = Math.max(1, piecesPerCarton);
  const boxConv = Math.max(1, piecesPerBox);
  const total = Math.max(0, totalPieces);

  const cartons = Math.floor(total / conv);
  const remCarton = total % conv;
  const boxes = Math.floor(remCarton / boxConv);
  const loosePieces = remCarton % boxConv;

  const parts: string[] = [];
  if (cartons > 0) parts.push(`${cartons} CTN`);
  if (boxes > 0) parts.push(`${boxes} BOX`);
  if (loosePieces > 0 || parts.length === 0) parts.push(`${loosePieces} PCS`);

  return {
    cartons,
    boxes,
    loosePieces,
    formatted: parts.join(' '),
  };
}

export interface StockAnalysisFilter {
  companyId?: string;
  fromDate?: string; // YYYY-MM-DD
  toDate?: string;   // YYYY-MM-DD
  stockView?: StockViewMode;
  viewBy: StockReportViewType;
  salesmanIds?: string[];
  orderBookerIds?: string[];
  supplyPersonIds?: string[];
  customerIds?: string[];
  routeIds?: string[];
  productIds?: string[];
  categoryIds?: string[];
  brandIds?: string[];
  companyNames?: string[];
  sources?: string[];
  statuses?: string[];
  warehouses?: string[];
  search?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface StockAnalysisKpis {
  totalProducts: number;
  totalBookedPcs: number;
  totalBonusPcs: number;
  totalAllocatedPcs: number;
  totalIssuedPcs: number;
  totalPendingPcs: number;
  totalOrders: number;
  totalCustomers: number;
  totalSupplyPersons: number;
  totalRoutes: number;
  currentPhysicalStockPcs: number;
  availableStockPcs: number;
  totalBookedValuePaisas: number;
}

export interface StockDetailedRow {
  id: string;
  orderId: string;
  date: string;
  orderNumber: string;
  sourceChannel: string;
  sourceLabel: string;
  customerId: string;
  customerName: string;
  shopName: string;
  routeId: string | null;
  routeName: string;
  salesmanId: string | null;
  salesmanName: string;
  salesmanCode: string;
  orderBookerId: string | null;
  orderBookerName: string;
  orderBookerCode: string;
  supplyPersonId: string | null;
  supplyPersonName: string;
  supplyPersonCode: string;
  productId: string;
  productName: string;
  sku: string;
  brandName: string;
  companyName: string;
  categoryName: string;
  warehouse: string;
  bookedCartons: number;
  bookedBoxes: number;
  bookedLoosePieces: number;
  bookedCtn?: number;
  bookedBox?: number;
  bookedPcs?: number;
  piecesPerCarton?: number;
  piecesPerBox?: number;
  totalBookedPcs: number;
  bonusPcs: number;
  allocatedPcs: number;
  issuedPcs: number;
  pendingPcs: number;
  unitPricePaisas: number;
  lineTotalPaisas: number;
  orderStatus: string;
  invoiceId: string | null;
  invoiceNumber: string | null;
}

export interface OrderWiseItemDetail {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  cartons: number;
  boxes: number;
  loosePieces: number;
  totalPcs: number;
  bonusPcs: number;
  unitPricePaisas: number;
  lineTotalPaisas: number;
  orderStatus: string;
}

export interface StockGroupedRow {
  groupId: string;
  groupKey: string;
  groupName: string;
  groupCode?: string;
  secondaryLabel?: string;
  orderCount: number;
  customerCount: number;
  productCount: number;
  totalBookedPcs: number;
  bookedPcs?: number;
  bonusPcs: number;
  allocatedPcs: number;
  issuedPcs: number;
  pendingPcs: number;
  cartonsCount: number;
  boxesCount: number;
  loosePiecesCount: number;
  packagingSummary: string;
  stockValuePaisas: number;
  physicalStockPcs?: number;
  availableStockPcs?: number;
  // Specific metadata fields
  routeId?: string;
  routeName?: string;
  salesmanName?: string;
  orderBookerName?: string;
  supplyPersonName?: string;
  orderDate?: string;
  orderNumber?: string;
  customerName?: string;
  shopName?: string;
  orderStatus?: string;
  items?: OrderWiseItemDetail[];
}

export interface StockAnalysisReportResult {
  viewBy: StockReportViewType;
  stockView: StockViewMode;
  kpis: StockAnalysisKpis;
  grandTotal: StockGroupedRow;
  detailedRows?: StockDetailedRow[];
  groupedRows?: StockGroupedRow[];
  pagination: {
    totalItems: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

export class StockAnalysisService {
  /**
   * Reuses the comprehensive filter dimensions from SalesAnalysisService
   */
  public static getFilterDimensions(companyIdOverride?: string): FilterDimensionsResult {
    return SalesAnalysisService.getFilterDimensions(companyIdOverride);
  }

  /**
   * Builds the core WHERE clause for sales_orders and sales_order_items
   */
  private static buildWhereClause(filter: StockAnalysisFilter, companyId: string): { whereSql: string; params: any[] } {
    const conditions: string[] = ['so.company_id = ?'];
    const params: any[] = [companyId];

    // Date range applies to order_date
    if (filter.fromDate && filter.toDate) {
      conditions.push('so.order_date >= ? AND so.order_date <= ?');
      params.push(filter.fromDate, filter.toDate);
    } else if (filter.fromDate) {
      conditions.push('so.order_date >= ?');
      params.push(filter.fromDate);
    } else if (filter.toDate) {
      conditions.push('so.order_date <= ?');
      params.push(filter.toDate);
    }

    // Default status: exclude CANCELLED/VOID orders unless explicitly chosen
    if (filter.statuses && filter.statuses.length > 0) {
      const placeholders = filter.statuses.map(() => '?').join(', ');
      conditions.push(`so.status IN (${placeholders})`);
      params.push(...filter.statuses);
    } else {
      conditions.push("so.status NOT IN ('CANCELLED', 'VOID')");
    }

    // Stock View mode filter logic
    if (filter.stockView === 'booked') {
      // Pending booked stock not yet finally delivered
      conditions.push('si.id IS NULL');
    } else if (filter.stockView === 'allocated') {
      // Allocated to route / supply person
      conditions.push('so.supply_person_id IS NOT NULL');
    }

    // Salesman (OR within filter)
    if (filter.salesmanIds && filter.salesmanIds.length > 0) {
      const placeholders = filter.salesmanIds.map(() => '?').join(', ');
      conditions.push(`so.salesman_id IN (${placeholders})`);
      params.push(...filter.salesmanIds);
    }

    // Order Booker (OR within filter)
    if (filter.orderBookerIds && filter.orderBookerIds.length > 0) {
      const placeholders = filter.orderBookerIds.map(() => '?').join(', ');
      conditions.push(`COALESCE(so.created_by_staff_id, so.salesman_id) IN (${placeholders})`);
      params.push(...filter.orderBookerIds);
    }

    // Supply / Delivery Man (OR within filter)
    if (filter.supplyPersonIds && filter.supplyPersonIds.length > 0) {
      const placeholders = filter.supplyPersonIds.map(() => '?').join(', ');
      conditions.push(`so.supply_person_id IN (${placeholders})`);
      params.push(...filter.supplyPersonIds);
    }

    // Customer / Retail Outlet (OR within filter)
    if (filter.customerIds && filter.customerIds.length > 0) {
      const placeholders = filter.customerIds.map(() => '?').join(', ');
      conditions.push(`so.customer_id IN (${placeholders})`);
      params.push(...filter.customerIds);
    }

    // Route (OR within filter)
    if (filter.routeIds && filter.routeIds.length > 0) {
      const placeholders = filter.routeIds.map(() => '?').join(', ');
      conditions.push(`(so.route_id IN (${placeholders}) OR c.route_id IN (${placeholders}))`);
      params.push(...filter.routeIds, ...filter.routeIds);
    }

    // Product (OR within filter)
    if (filter.productIds && filter.productIds.length > 0) {
      const placeholders = filter.productIds.map(() => '?').join(', ');
      conditions.push(`soi.product_id IN (${placeholders})`);
      params.push(...filter.productIds);
    }

    // Category (OR within filter)
    if (filter.categoryIds && filter.categoryIds.length > 0) {
      const placeholders = filter.categoryIds.map(() => '?').join(', ');
      conditions.push(`p.category_id IN (${placeholders})`);
      params.push(...filter.categoryIds);
    }

    // Brand (OR within filter)
    if (filter.brandIds && filter.brandIds.length > 0) {
      const placeholders = filter.brandIds.map(() => '?').join(', ');
      conditions.push(`p.brand_id IN (${placeholders})`);
      params.push(...filter.brandIds);
    }

    // Company / Manufacturer (OR within filter)
    if (filter.companyNames && filter.companyNames.length > 0) {
      const placeholders = filter.companyNames.map(() => '?').join(', ');
      conditions.push(`COALESCE(b.description, b.name) IN (${placeholders})`);
      params.push(...filter.companyNames);
    }

    // Sale Source (OR within filter)
    if (filter.sources && filter.sources.length > 0) {
      const sourceClauses: string[] = [];
      for (const src of filter.sources) {
        if (src === 'DIRECT_SALE') {
          sourceClauses.push("so.source_channel = 'VAN_SALE' OR so.source_channel = 'DIRECT'");
        } else if (src === 'ORDER_DELIVERY') {
          sourceClauses.push("si.id IS NOT NULL");
        } else if (src === 'UNBILLED_ORDER') {
          sourceClauses.push("si.id IS NULL");
        } else {
          sourceClauses.push("so.source_channel = ?");
          params.push(src);
        }
      }
      if (sourceClauses.length > 0) {
        conditions.push(`(${sourceClauses.join(' OR ')})`);
      }
    }

    // General Search
    if (filter.search && filter.search.trim()) {
      const term = `%${filter.search.trim().toLowerCase()}%`;
      conditions.push(`(
        LOWER(so.order_number) LIKE ? OR
        LOWER(c.name) LIKE ? OR
        LOWER(COALESCE(c.shop_name, '')) LIKE ? OR
        LOWER(p.name) LIKE ? OR
        LOWER(p.sku) LIKE ? OR
        LOWER(COALESCE(sm.name, '')) LIKE ? OR
        LOWER(COALESCE(ob.name, '')) LIKE ? OR
        LOWER(COALESCE(sp.name, '')) LIKE ?
      )`);
      params.push(term, term, term, term, term, term, term, term);
    }

    return {
      whereSql: conditions.join(' AND '),
      params,
    };
  }

  /**
   * Main reporting method executing Stock & Booking Analysis
   */
  public static getStockAnalysisReport(filter: StockAnalysisFilter): StockAnalysisReportResult {
    const db = getDatabase();
    const companyId = filter.companyId || DEFAULT_COMPANY_ID;
    const viewBy = filter.viewBy || 'detailed';
    const stockView = filter.stockView || 'all';

    const { whereSql, params } = this.buildWhereClause(filter, companyId);

    // Common Joins for order item rows
    const baseJoins = `
      FROM sales_order_items soi
      JOIN sales_orders so ON soi.order_id = so.id AND soi.company_id = so.company_id
      LEFT JOIN products p ON soi.product_id = p.id AND (p.company_id = so.company_id OR p.company_id IS NULL)
      LEFT JOIN categories cat ON p.category_id = cat.id
      LEFT JOIN brands b ON p.brand_id = b.id
      LEFT JOIN customers c ON so.customer_id = c.id AND so.company_id = c.company_id
      LEFT JOIN routes r ON COALESCE(so.route_id, c.route_id) = r.id AND (r.company_id = so.company_id OR r.company_id IS NULL)
      LEFT JOIN staff_members sm ON so.salesman_id = sm.id AND (sm.company_id = so.company_id OR sm.company_id IS NULL)
      LEFT JOIN staff_members ob ON COALESCE(so.created_by_staff_id, so.salesman_id) = ob.id AND (ob.company_id = so.company_id OR ob.company_id IS NULL)
      LEFT JOIN staff_members sp ON so.supply_person_id = sp.id AND (sp.company_id = so.company_id OR sp.company_id IS NULL)
      LEFT JOIN sales_invoices si ON si.order_id = so.id AND si.company_id = so.company_id AND si.status NOT IN ('VOID', 'CANCELLED')
    `;

    // 1. Calculate Summary KPIs
    const kpiSql = `
      SELECT
        COUNT(DISTINCT so.id) as total_orders,
        COUNT(DISTINCT so.customer_id) as total_customers,
        COUNT(DISTINCT soi.product_id) as total_products,
        COUNT(DISTINCT so.supply_person_id) as total_supply_persons,
        COUNT(DISTINCT COALESCE(so.route_id, c.route_id)) as total_routes,
        COALESCE(SUM(soi.quantity_base + soi.scheme_bonus_base), 0) as total_booked_pcs,
        COALESCE(SUM(soi.scheme_bonus_base), 0) as total_bonus_pcs,
        COALESCE(SUM(CASE WHEN so.supply_person_id IS NOT NULL THEN (soi.quantity_base + soi.scheme_bonus_base) ELSE 0 END), 0) as total_allocated_pcs,
        COALESCE(SUM(CASE WHEN si.id IS NOT NULL THEN (soi.quantity_base + soi.scheme_bonus_base) ELSE 0 END), 0) as total_issued_pcs,
        COALESCE(SUM(CASE WHEN si.id IS NULL THEN (soi.quantity_base + soi.scheme_bonus_base) ELSE 0 END), 0) as total_pending_pcs,
        COALESCE(SUM(soi.line_total_paisas), 0) as total_booked_value_paisas
      ${baseJoins}
      WHERE ${whereSql}
    `;

    const kpiRow = db.prepare(kpiSql).get(...params) as any;

    // Physical stock query (filtered by product dimensions if specified)
    let prodFilterSql = 'WHERE (company_id = ? OR company_id IS NULL) AND is_active = 1';
    const prodParams: any[] = [companyId];
    if (filter.productIds && filter.productIds.length > 0) {
      prodFilterSql += ` AND id IN (${filter.productIds.map(() => '?').join(', ')})`;
      prodParams.push(...filter.productIds);
    }
    if (filter.categoryIds && filter.categoryIds.length > 0) {
      prodFilterSql += ` AND category_id IN (${filter.categoryIds.map(() => '?').join(', ')})`;
      prodParams.push(...filter.categoryIds);
    }
    if (filter.brandIds && filter.brandIds.length > 0) {
      prodFilterSql += ` AND brand_id IN (${filter.brandIds.map(() => '?').join(', ')})`;
      prodParams.push(...filter.brandIds);
    }

    const physicalStockRow = db.prepare(`
      SELECT COALESCE(SUM(current_stock_base), 0) as total_physical
      FROM products
      ${prodFilterSql}
    `).get(...prodParams) as any;

    const currentPhysicalStockPcs = Number(physicalStockRow?.total_physical || 0);
    const totalBookedPcs = Number(kpiRow?.total_booked_pcs || 0);
    const totalBonusPcs = Number(kpiRow?.total_bonus_pcs || 0);
    const totalAllocatedPcs = Number(kpiRow?.total_allocated_pcs || 0);
    const totalIssuedPcs = Number(kpiRow?.total_issued_pcs || 0);
    const totalPendingPcs = Number(kpiRow?.total_pending_pcs || 0);
    const availableStockPcs = Math.max(0, currentPhysicalStockPcs - totalPendingPcs);

    const kpis: StockAnalysisKpis = {
      totalProducts: Number(kpiRow?.total_products || 0),
      totalBookedPcs,
      totalBonusPcs,
      totalAllocatedPcs,
      totalIssuedPcs,
      totalPendingPcs,
      totalOrders: Number(kpiRow?.total_orders || 0),
      totalCustomers: Number(kpiRow?.total_customers || 0),
      totalSupplyPersons: Number(kpiRow?.total_supply_persons || 0),
      totalRoutes: Number(kpiRow?.total_routes || 0),
      currentPhysicalStockPcs,
      availableStockPcs,
      totalBookedValuePaisas: Number(kpiRow?.total_booked_value_paisas || 0),
    };

    // Global Packaging Breakdown for grand total
    const grandPack = formatPackagingBreakdown(totalBookedPcs, 120, 10);

    const grandTotal: StockGroupedRow = {
      groupId: 'GRAND_TOTAL',
      groupKey: 'GRAND_TOTAL',
      groupName: 'GRAND TOTAL',
      orderCount: kpis.totalOrders,
      customerCount: kpis.totalCustomers,
      productCount: kpis.totalProducts,
      totalBookedPcs,
      bookedPcs: totalBookedPcs,
      bonusPcs: totalBonusPcs,
      allocatedPcs: totalAllocatedPcs,
      issuedPcs: totalIssuedPcs,
      pendingPcs: totalPendingPcs,
      cartonsCount: grandPack.cartons,
      boxesCount: grandPack.boxes,
      loosePiecesCount: grandPack.loosePieces,
      packagingSummary: grandPack.formatted,
      stockValuePaisas: kpis.totalBookedValuePaisas,
      physicalStockPcs: currentPhysicalStockPcs,
      availableStockPcs,
    };

    const page = Math.max(1, filter.page || 1);
    const pageSize = filter.pageSize === -1 ? 999999 : (filter.pageSize || 50);

    // 2. DETAILED STOCK / BOOKING MODE
    if (viewBy === 'detailed') {
      const countSql = `
        SELECT COUNT(*) as count
        ${baseJoins}
        WHERE ${whereSql}
      `;
      const countRow = db.prepare(countSql).get(...params) as any;
      const totalItems = Number(countRow?.count || 0);
      const totalPages = Math.ceil(totalItems / pageSize) || 1;
      const offset = (page - 1) * pageSize;

      let orderBy = 'so.order_date DESC, so.order_number DESC, soi.id ASC';
      if (filter.sortBy) {
        const orderDir = filter.sortOrder === 'asc' ? 'ASC' : 'DESC';
        if (filter.sortBy === 'date') orderBy = `so.order_date ${orderDir}`;
        else if (filter.sortBy === 'orderNumber') orderBy = `so.order_number ${orderDir}`;
        else if (filter.sortBy === 'bookedPcs') orderBy = `(soi.quantity_base + soi.scheme_bonus_base) ${orderDir}`;
        else if (filter.sortBy === 'value') orderBy = `soi.line_total_paisas ${orderDir}`;
      }

      const detailedSql = `
        SELECT
          soi.id as item_id,
          so.id as order_id,
          so.order_date as date,
          so.order_number,
          so.source_channel,
          so.status as order_status,
          c.id as customer_id,
          c.name as customer_name,
          COALESCE(c.shop_name, c.name) as shop_name,
          r.id as route_id,
          COALESCE(r.name, 'Unassigned Route') as route_name,
          sm.id as salesman_id,
          COALESCE(sm.name, 'Unassigned') as salesman_name,
          COALESCE(sm.employee_code, '') as salesman_code,
          ob.id as order_booker_id,
          COALESCE(ob.name, 'Unassigned') as order_booker_name,
          COALESCE(ob.employee_code, '') as order_booker_code,
          sp.id as supply_person_id,
          COALESCE(sp.name, 'Unassigned') as supply_person_name,
          COALESCE(sp.employee_code, '') as supply_person_code,
          p.id as product_id,
          p.name as product_name,
          p.sku,
          p.total_pieces_per_carton,
          p.pieces_per_box,
          COALESCE(b.name, p.brand_name, 'No Brand') as brand_name,
          COALESCE(b.description, b.name, p.brand_name, 'Unassigned') as company_name,
          COALESCE(cat.name, p.category, 'No Category') as category_name,
          soi.quantity_base as booked_pcs,
          soi.scheme_bonus_base as bonus_pcs,
          (soi.quantity_base + soi.scheme_bonus_base) as total_booked_pcs,
          soi.unit_price_paisas,
          soi.line_total_paisas,
          si.id as invoice_id,
          si.invoice_number,
          CASE WHEN so.supply_person_id IS NOT NULL THEN (soi.quantity_base + soi.scheme_bonus_base) ELSE 0 END as allocated_pcs,
          CASE WHEN si.id IS NOT NULL THEN (soi.quantity_base + soi.scheme_bonus_base) ELSE 0 END as issued_pcs,
          CASE WHEN si.id IS NULL THEN (soi.quantity_base + soi.scheme_bonus_base) ELSE 0 END as pending_pcs
        ${baseJoins}
        WHERE ${whereSql}
        ORDER BY ${orderBy}
        LIMIT ? OFFSET ?
      `;

      const rows = db.prepare(detailedSql).all(...params, pageSize, offset) as any[];

      const detailedRows: StockDetailedRow[] = rows.map((r) => {
        const totalPcs = Number(r.total_booked_pcs || 0);
        const piecesPerCarton = Number(r.total_pieces_per_carton || 1);
        const piecesPerBox = Number(r.pieces_per_box || 1);
        const pack = formatPackagingBreakdown(totalPcs, piecesPerCarton, piecesPerBox);

        return {
          id: r.item_id,
          orderId: r.order_id,
          date: r.date,
          orderNumber: r.order_number,
          sourceChannel: r.source_channel || 'OFFICE',
          sourceLabel: SalesAnalysisService.formatSourceLabel(r.source_channel, null),
          customerId: r.customer_id,
          customerName: r.customer_name,
          shopName: r.shop_name,
          routeId: r.route_id,
          routeName: r.route_name,
          salesmanId: r.salesman_id,
          salesmanName: r.salesman_name,
          salesmanCode: r.salesman_code,
          orderBookerId: r.order_booker_id,
          orderBookerName: r.order_booker_name,
          orderBookerCode: r.order_booker_code,
          supplyPersonId: r.supply_person_id,
          supplyPersonName: r.supply_person_name,
          supplyPersonCode: r.supply_person_code,
          productId: r.product_id,
          productName: r.product_name,
          sku: r.sku,
          brandName: r.brand_name,
          companyName: r.company_name,
          categoryName: r.category_name,
          warehouse: 'Main Warehouse',
          bookedCartons: pack.cartons,
          bookedBoxes: pack.boxes,
          bookedLoosePieces: pack.loosePieces,
          bookedCtn: pack.cartons,
          bookedBox: pack.boxes,
          bookedPcs: pack.loosePieces,
          piecesPerCarton,
          piecesPerBox,
          totalBookedPcs: totalPcs,
          bonusPcs: Number(r.bonus_pcs || 0),
          allocatedPcs: Number(r.allocated_pcs || 0),
          issuedPcs: Number(r.issued_pcs || 0),
          pendingPcs: Number(r.pending_pcs || 0),
          unitPricePaisas: Number(r.unit_price_paisas || 0),
          lineTotalPaisas: Number(r.line_total_paisas || 0),
          orderStatus: r.order_status,
          invoiceId: r.invoice_id,
          invoiceNumber: r.invoice_number,
        };
      });

      return {
        viewBy,
        stockView,
        kpis,
        grandTotal,
        detailedRows,
        pagination: {
          totalItems,
          page,
          pageSize,
          totalPages,
        },
      };
    }

    // 3. ORDER WISE MODE (with expandable item lines)
    if (viewBy === 'order') {
      let orderBy = 'so.order_date DESC, so.order_number DESC';
      if (filter.sortBy) {
        const orderDir = filter.sortOrder === 'asc' ? 'ASC' : 'DESC';
        if (filter.sortBy === 'orderNumber') orderBy = `so.order_number ${orderDir}`;
        else if (filter.sortBy === 'date') orderBy = `so.order_date ${orderDir}`;
        else if (filter.sortBy === 'bookedPcs') orderBy = `total_booked_pcs ${orderDir}`;
        else if (filter.sortBy === 'pendingPcs') orderBy = `pending_pcs ${orderDir}`;
      }

      const orderSql = `
        SELECT
          so.id as group_id,
          so.order_number as group_key,
          so.order_number as group_name,
          so.order_date,
          so.status as order_status,
          c.name as customer_name,
          COALESCE(c.shop_name, c.name) as shop_name,
          COALESCE(r.name, 'Unassigned Route') as route_name,
          COALESCE(sm.name, 'Unassigned') as salesman_name,
          COALESCE(ob.name, 'Unassigned') as order_booker_name,
          COALESCE(sp.name, 'Unassigned') as supply_person_name,
          COUNT(DISTINCT soi.product_id) as product_count,
          COALESCE(SUM(soi.quantity_base + soi.scheme_bonus_base), 0) as total_booked_pcs,
          COALESCE(SUM(soi.scheme_bonus_base), 0) as bonus_pcs,
          COALESCE(SUM(CASE WHEN so.supply_person_id IS NOT NULL THEN (soi.quantity_base + soi.scheme_bonus_base) ELSE 0 END), 0) as allocated_pcs,
          COALESCE(SUM(CASE WHEN si.id IS NOT NULL THEN (soi.quantity_base + soi.scheme_bonus_base) ELSE 0 END), 0) as issued_pcs,
          COALESCE(SUM(CASE WHEN si.id IS NULL THEN (soi.quantity_base + soi.scheme_bonus_base) ELSE 0 END), 0) as pending_pcs,
          COALESCE(SUM(soi.line_total_paisas), 0) as stock_value_paisas
        ${baseJoins}
        WHERE ${whereSql}
        GROUP BY so.id, so.order_number, so.order_date, so.status, c.name, c.shop_name, r.name, sm.name, ob.name, sp.name
        ORDER BY ${orderBy}
      `;

      const allOrderRows = db.prepare(orderSql).all(...params) as any[];
      const totalItems = allOrderRows.length;
      const totalPages = Math.ceil(totalItems / pageSize) || 1;
      const offset = (page - 1) * pageSize;
      const paginatedOrders = allOrderRows.slice(offset, offset + pageSize);

      // Load items for the paginated orders to show item breakdown
      const orderIds = paginatedOrders.map((o) => o.group_id);
      const itemsMap = new Map<string, OrderWiseItemDetail[]>();

      if (orderIds.length > 0) {
        const itemRows = db.prepare(`
          SELECT 
            soi.id,
            soi.order_id,
            soi.product_id,
            p.name as product_name,
            p.sku,
            p.total_pieces_per_carton,
            p.pieces_per_box,
            (soi.quantity_base + soi.scheme_bonus_base) as total_pcs,
            soi.scheme_bonus_base as bonus_pcs,
            soi.unit_price_paisas,
            soi.line_total_paisas,
            so.status as order_status
          FROM sales_order_items soi
          JOIN sales_orders so ON soi.order_id = so.id
          LEFT JOIN products p ON soi.product_id = p.id
          WHERE soi.order_id IN (${orderIds.map(() => '?').join(', ')})
          ORDER BY p.name ASC
        `).all(...orderIds) as any[];

        for (const itm of itemRows) {
          const pack = formatPackagingBreakdown(
            Number(itm.total_pcs || 0),
            Number(itm.total_pieces_per_carton || 1),
            Number(itm.pieces_per_box || 1)
          );
          const list = itemsMap.get(itm.order_id) || [];
          list.push({
            id: itm.id,
            productId: itm.product_id,
            productName: itm.product_name,
            sku: itm.sku,
            cartons: pack.cartons,
            boxes: pack.boxes,
            loosePieces: pack.loosePieces,
            totalPcs: Number(itm.total_pcs || 0),
            bonusPcs: Number(itm.bonus_pcs || 0),
            unitPricePaisas: Number(itm.unit_price_paisas || 0),
            lineTotalPaisas: Number(itm.line_total_paisas || 0),
            orderStatus: itm.order_status,
          });
          itemsMap.set(itm.order_id, list);
        }
      }

      const groupedRows: StockGroupedRow[] = paginatedOrders.map((r) => {
        const totalPcs = Number(r.total_booked_pcs || 0);
        const pack = formatPackagingBreakdown(totalPcs, 120, 10);
        return {
          groupId: String(r.group_id),
          groupKey: String(r.group_key),
          groupName: String(r.group_name),
          orderCount: 1,
          customerCount: 1,
          productCount: Number(r.product_count || 0),
          totalBookedPcs: totalPcs,
          bookedPcs: totalPcs,
          bonusPcs: Number(r.bonus_pcs || 0),
          allocatedPcs: Number(r.allocated_pcs || 0),
          issuedPcs: Number(r.issued_pcs || 0),
          pendingPcs: Number(r.pending_pcs || 0),
          cartonsCount: pack.cartons,
          boxesCount: pack.boxes,
          loosePiecesCount: pack.loosePieces,
          packagingSummary: pack.formatted,
          stockValuePaisas: Number(r.stock_value_paisas || 0),
          orderDate: r.order_date,
          orderNumber: r.order_number,
          customerName: r.customer_name,
          shopName: r.shop_name,
          routeName: r.route_name,
          salesmanName: r.salesman_name,
          orderBookerName: r.order_booker_name,
          supplyPersonName: r.supply_person_name,
          orderStatus: r.order_status,
          items: itemsMap.get(r.group_id) || [],
        };
      });

      return {
        viewBy,
        stockView,
        kpis,
        grandTotal,
        groupedRows,
        pagination: {
          totalItems,
          page,
          pageSize,
          totalPages,
        },
      };
    }

    // 4. OTHER GROUPED MODES (Supply Man, Salesman, Booker, Customer, Item, Route, Brand, Company, Category, Warehouse)
    let groupSelect = '';
    let groupByClause = '';
    let defaultOrderBy = 'total_booked_pcs DESC';

    switch (viewBy) {
      case 'supply_man':
        groupSelect = `
          COALESCE(sp.id, 'unassigned') as group_id,
          COALESCE(sp.id, 'unassigned') as group_key,
          COALESCE(sp.name, 'Unassigned') as group_name,
          COALESCE(sp.employee_code, '') as group_code,
          COALESCE(MAX(r.name), 'Assigned Route') as secondary_label,
          COALESCE(MAX(r.id), '') as route_id,
          COALESCE(MAX(r.name), '') as route_name,
        `;
        groupByClause = 'GROUP BY sp.id, sp.name, sp.employee_code';
        break;

      case 'salesman':
        groupSelect = `
          COALESCE(sm.id, 'unassigned') as group_id,
          COALESCE(sm.id, 'unassigned') as group_key,
          COALESCE(sm.name, 'Unassigned') as group_name,
          COALESCE(sm.employee_code, '') as group_code,
          '' as secondary_label,
        `;
        groupByClause = 'GROUP BY sm.id, sm.name, sm.employee_code';
        break;

      case 'order_booker':
        groupSelect = `
          COALESCE(ob.id, 'unassigned') as group_id,
          COALESCE(ob.id, 'unassigned') as group_key,
          COALESCE(ob.name, 'Unassigned') as group_name,
          COALESCE(ob.employee_code, '') as group_code,
          '' as secondary_label,
        `;
        groupByClause = 'GROUP BY ob.id, ob.name, ob.employee_code';
        break;

      case 'customer':
        groupSelect = `
          c.id as group_id,
          c.id as group_key,
          COALESCE(c.shop_name, c.name) as group_name,
          c.name as group_code,
          COALESCE(MAX(r.name), 'Unassigned Route') as secondary_label,
          COALESCE(MAX(sm.name), 'Unassigned') as salesman_name,
          COALESCE(MAX(ob.name), 'Unassigned') as order_booker_name,
        `;
        groupByClause = 'GROUP BY c.id, c.shop_name, c.name';
        break;

      case 'item':
        groupSelect = `
          p.id as group_id,
          p.sku as group_key,
          p.name as group_name,
          p.sku as group_code,
          COALESCE(b.name, p.brand_name, 'No Brand') || ' • ' || COALESCE(cat.name, p.category, 'No Category') as secondary_label,
          p.total_pieces_per_carton,
          p.pieces_per_box,
          p.current_stock_base as physical_stock_pcs,
        `;
        groupByClause = 'GROUP BY p.id, p.sku, p.name, b.name, p.brand_name, cat.name, p.category, p.total_pieces_per_carton, p.pieces_per_box, p.current_stock_base';
        break;

      case 'route':
        groupSelect = `
          COALESCE(r.id, 'unassigned') as group_id,
          COALESCE(r.id, 'unassigned') as group_key,
          COALESCE(r.name, 'Unassigned Route') as group_name,
          COALESCE(r.code, '') as group_code,
          COALESCE(MAX(sp.name), 'Unassigned') as secondary_label,
          COALESCE(MAX(sp.name), '') as supply_person_name,
          COALESCE(MAX(sm.name), '') as salesman_name,
        `;
        groupByClause = 'GROUP BY r.id, r.name, r.code';
        break;

      case 'brand':
        groupSelect = `
          COALESCE(b.id, 'unbranded') as group_id,
          COALESCE(b.name, p.brand_name, 'Unbranded') as group_key,
          COALESCE(b.name, p.brand_name, 'Unbranded') as group_name,
          '' as group_code,
          COALESCE(b.description, '') as secondary_label,
        `;
        groupByClause = 'GROUP BY b.id, b.name, p.brand_name, b.description';
        break;

      case 'company':
        groupSelect = `
          COALESCE(b.description, b.name, p.brand_name, 'Unassigned') as group_id,
          COALESCE(b.description, b.name, p.brand_name, 'Unassigned') as group_key,
          COALESCE(b.description, b.name, p.brand_name, 'Unassigned') as group_name,
          '' as group_code,
          '' as secondary_label,
        `;
        groupByClause = "GROUP BY COALESCE(b.description, b.name, p.brand_name, 'Unassigned')";
        break;

      case 'category':
        groupSelect = `
          COALESCE(cat.id, 'uncategorized') as group_id,
          COALESCE(cat.name, p.category, 'Uncategorized') as group_key,
          COALESCE(cat.name, p.category, 'Uncategorized') as group_name,
          '' as group_code,
          '' as secondary_label,
        `;
        groupByClause = 'GROUP BY cat.id, cat.name, p.category';
        break;

      case 'warehouse':
        groupSelect = `
          'Main Warehouse' as group_id,
          'Main Warehouse' as group_key,
          'Main Warehouse' as group_name,
          '' as group_code,
          '' as secondary_label,
        `;
        groupByClause = '';
        break;
    }

    let orderBy = defaultOrderBy;
    if (filter.sortBy) {
      const orderDir = filter.sortOrder === 'asc' ? 'ASC' : 'DESC';
      if (filter.sortBy === 'name') orderBy = `group_name ${orderDir}`;
      else if (filter.sortBy === 'bookedPcs') orderBy = `total_booked_pcs ${orderDir}`;
      else if (filter.sortBy === 'allocatedPcs') orderBy = `allocated_pcs ${orderDir}`;
      else if (filter.sortBy === 'issuedPcs') orderBy = `issued_pcs ${orderDir}`;
      else if (filter.sortBy === 'pendingPcs') orderBy = `pending_pcs ${orderDir}`;
      else if (filter.sortBy === 'orderCount') orderBy = `order_count ${orderDir}`;
      else if (filter.sortBy === 'value') orderBy = `stock_value_paisas ${orderDir}`;
    }

    const groupedSql = `
      SELECT
        ${groupSelect}
        COUNT(DISTINCT so.id) as order_count,
        COUNT(DISTINCT so.customer_id) as customer_count,
        COUNT(DISTINCT soi.product_id) as product_count,
        COALESCE(SUM(soi.quantity_base + soi.scheme_bonus_base), 0) as total_booked_pcs,
        COALESCE(SUM(soi.scheme_bonus_base), 0) as bonus_pcs,
        COALESCE(SUM(CASE WHEN so.supply_person_id IS NOT NULL THEN (soi.quantity_base + soi.scheme_bonus_base) ELSE 0 END), 0) as allocated_pcs,
        COALESCE(SUM(CASE WHEN si.id IS NOT NULL THEN (soi.quantity_base + soi.scheme_bonus_base) ELSE 0 END), 0) as issued_pcs,
        COALESCE(SUM(CASE WHEN si.id IS NULL THEN (soi.quantity_base + soi.scheme_bonus_base) ELSE 0 END), 0) as pending_pcs,
        COALESCE(SUM(soi.line_total_paisas), 0) as stock_value_paisas
      ${baseJoins}
      WHERE ${whereSql}
      ${groupByClause}
      ORDER BY ${orderBy}
    `;

    const allGroupedRows = db.prepare(groupedSql).all(...params) as any[];
    const totalItems = allGroupedRows.length;
    const totalPages = Math.ceil(totalItems / pageSize) || 1;
    const offset = (page - 1) * pageSize;

    const paginatedRows = allGroupedRows.slice(offset, offset + pageSize);

    const groupedRows: StockGroupedRow[] = paginatedRows.map((r) => {
      const booked = Number(r.total_booked_pcs || 0);
      const pending = Number(r.pending_pcs || 0);
      const physicalStock = r.physical_stock_pcs !== undefined ? Number(r.physical_stock_pcs) : undefined;
      const available = physicalStock !== undefined ? Math.max(0, physicalStock - pending) : undefined;

      // Packaging breakdown
      const ctnConv = Number(r.total_pieces_per_carton || 120);
      const boxConv = Number(r.pieces_per_box || 10);
      const pack = formatPackagingBreakdown(booked, ctnConv, boxConv);

      return {
        groupId: String(r.group_id),
        groupKey: String(r.group_key),
        groupName: String(r.group_name),
        groupCode: r.group_code ? String(r.group_code) : undefined,
        secondaryLabel: r.secondary_label ? String(r.secondary_label) : undefined,
        orderCount: Number(r.order_count || 0),
        customerCount: Number(r.customer_count || 0),
        productCount: Number(r.product_count || 0),
        totalBookedPcs: booked,
        bookedPcs: booked,
        bonusPcs: Number(r.bonus_pcs || 0),
        allocatedPcs: Number(r.allocated_pcs || 0),
        issuedPcs: Number(r.issued_pcs || 0),
        pendingPcs: pending,
        cartonsCount: pack.cartons,
        boxesCount: pack.boxes,
        loosePiecesCount: pack.loosePieces,
        packagingSummary: pack.formatted,
        stockValuePaisas: Number(r.stock_value_paisas || 0),
        physicalStockPcs: physicalStock,
        availableStockPcs: available,
        routeId: r.route_id,
        routeName: r.route_name,
        salesmanName: r.salesman_name,
        orderBookerName: r.order_booker_name,
        supplyPersonName: r.supply_person_name,
      };
    });

    return {
      viewBy,
      stockView,
      kpis,
      grandTotal,
      groupedRows,
      pagination: {
        totalItems,
        page,
        pageSize,
        totalPages,
      },
    };
  }
}
