import { getDatabase } from '@/core/database/db';
import { DEFAULT_COMPANY_ID } from '@/core/tenancy/constants';
import { fromPaisas } from '@/shared/utils/currency';

export type SalesAnalysisViewBy =
  | 'detailed'
  | 'salesman'
  | 'order_booker'
  | 'item'
  | 'customer'
  | 'route'
  | 'brand'
  | 'company'
  | 'category'
  | 'source'
  | 'date';

export interface SalesAnalysisFilter {
  companyId?: string;
  fromDate?: string; // YYYY-MM-DD
  toDate?: string;   // YYYY-MM-DD
  salesmanIds?: string[];
  orderBookerIds?: string[];
  productIds?: string[];
  customerIds?: string[];
  routeIds?: string[];
  brandIds?: string[];
  companyNames?: string[];
  categoryIds?: string[];
  sources?: string[];
  statuses?: string[];
  warehouses?: string[];
  supplyPersonIds?: string[];
  search?: string;
  viewBy: SalesAnalysisViewBy;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface SalesAnalysisKpis {
  totalNetSalesPaisas: number;
  totalGrossSalesPaisas: number;
  totalDiscountPaisas: number;
  totalTaxPaisas: number;
  totalQuantityPcs: number;
  totalBonusPcs: number;
  totalOrders: number;
  totalPaidPaisas: number;
  totalDuePaisas: number;
}

export interface SalesDetailedRow {
  id: string;
  invoiceId: string;
  date: string;
  documentNumber: string;
  source: string;
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
  brandId: string | null;
  brandName: string;
  companyName: string;
  categoryId: string | null;
  categoryName: string;
  warehouse: string;
  quantityPcs: number;
  bonusPcs: number;
  ratePcsPaisas: number;
  grossPaisas: number;
  discountPaisas: number;
  taxPaisas: number;
  netSalePaisas: number;
  paidPaisas: number;
  duePaisas: number;
  status: string;
  paymentStatus: string;
}

export interface SalesGroupedRow {
  groupId: string;
  groupKey: string;
  groupName: string;
  groupCode?: string;
  secondaryLabel?: string;
  quantityPcs: number;
  bonusPcs: number;
  grossPaisas: number;
  discountPaisas: number;
  taxPaisas: number;
  netSalePaisas: number;
  paidPaisas: number;
  duePaisas: number;
  orderCount: number;
  customerCount?: number;
}

export interface SalesAnalysisReportResult {
  viewBy: SalesAnalysisViewBy;
  kpis: SalesAnalysisKpis;
  grandTotal: SalesGroupedRow;
  detailedRows?: SalesDetailedRow[];
  groupedRows?: SalesGroupedRow[];
  pagination: {
    totalItems: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

export interface FilterDimensionsResult {
  salesmen: Array<{ id: string; name: string; employeeCode: string }>;
  orderBookers: Array<{ id: string; name: string; employeeCode: string }>;
  supplyPersons: Array<{ id: string; name: string; employeeCode: string }>;
  customers: Array<{ id: string; name: string; shopName: string; phone?: string; routeId?: string; code?: string }>;
  routes: Array<{ id: string; code: string; name: string }>;
  products: Array<{ id: string; name: string; sku: string; categoryId?: string; brandId?: string }>;
  categories: Array<{ id: string; name: string }>;
  brands: Array<{ id: string; name: string }>;
  companies: Array<{ id: string; name: string }>;
  sources: Array<{ id: string; label: string }>;
  statuses: Array<{ id: string; label: string }>;
  warehouses: Array<{ id: string; name: string }>;
}

export class SalesAnalysisService {
  /**
   * Helper to format human friendly sale source labels
   */
  public static formatSourceLabel(sourceChannel: string | null, invoiceType: string | null): string {
    if (invoiceType === 'ORDER_DELIVERY') return 'Commercial Bill (Order Delivery)';
    if (invoiceType === 'DIRECT_SALE') {
      if (sourceChannel === 'VAN_SALE') return 'Direct Van Sale';
      if (sourceChannel === 'OFFICE') return 'Office / Counter Sale';
      return 'Direct Sale';
    }
    if (sourceChannel === 'FIELD_BOOKER') return 'Field Order Booker';
    if (sourceChannel === 'OFFICE') return 'Office Sale';
    if (sourceChannel === 'VAN_SALE') return 'Direct Van Sale';
    return sourceChannel || 'Direct Sale';
  }

  /**
   * Load master dropdown filter options
   */
  public static getFilterDimensions(companyIdOverride?: string): FilterDimensionsResult {
    const db = getDatabase();
    const companyId = companyIdOverride || DEFAULT_COMPANY_ID;

    // 1. Staff: Salesmen, Order Bookers, Supply Persons
    const staffRows = db.prepare(`
      SELECT id, name, employee_code, role
      FROM staff_members
      WHERE (company_id = ? OR company_id IS NULL)
        AND is_active = 1
      ORDER BY name ASC
    `).all(companyId) as any[];

    const salesmen: Array<{ id: string; name: string; employeeCode: string }> = [];
    const orderBookers: Array<{ id: string; name: string; employeeCode: string }> = [];
    const supplyPersons: Array<{ id: string; name: string; employeeCode: string }> = [];

    for (const s of staffRows) {
      const code = s.employee_code || '';
      if (s.role === 'SALESMAN' || s.role === 'BOTH') {
        salesmen.push({ id: s.id, name: s.name, employeeCode: code });
      }
      if (s.role === 'ORDER_BOOKER' || s.role === 'SALESMAN' || s.role === 'BOTH') {
        orderBookers.push({ id: s.id, name: s.name, employeeCode: code });
      }
      if (s.role === 'SUPPLY_PERSON' || s.role === 'BOTH') {
        supplyPersons.push({ id: s.id, name: s.name, employeeCode: code });
      }
    }

    // 2. Customers
    const customerRows = db.prepare(`
      SELECT id, name, shop_name, phone, route_id
      FROM customers
      WHERE (company_id = ? OR company_id IS NULL)
        AND is_active = 1
      ORDER BY COALESCE(shop_name, name) ASC
    `).all(companyId) as any[];

    const customers = customerRows.map((c) => ({
      id: c.id,
      name: c.name,
      shopName: c.shop_name || c.name,
      phone: c.phone || '',
      routeId: c.route_id || '',
    }));

    // 3. Routes
    const routeRows = db.prepare(`
      SELECT id, code, name
      FROM routes
      WHERE (company_id = ? OR company_id IS NULL)
        AND is_active = 1
      ORDER BY name ASC
    `).all(companyId) as any[];

    const routes = routeRows.map((r) => ({
      id: r.id,
      code: r.code || '',
      name: r.name,
    }));

    // 4. Products
    const productRows = db.prepare(`
      SELECT id, name, sku, category_id, brand_id
      FROM products
      WHERE (company_id = ? OR company_id IS NULL)
        AND is_active = 1
      ORDER BY name ASC
    `).all(companyId) as any[];

    const products = productRows.map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      categoryId: p.category_id || '',
      brandId: p.brand_id || '',
    }));

    // 5. Categories
    const categoryRows = db.prepare(`
      SELECT id, name
      FROM categories
      WHERE (company_id = ? OR company_id IS NULL)
        AND is_active = 1
      ORDER BY name ASC
    `).all(companyId) as any[];

    const categories = categoryRows.map((c) => ({
      id: c.id,
      name: c.name,
    }));

    // 6. Brands
    const brandRows = db.prepare(`
      SELECT id, name, description
      FROM brands
      WHERE (company_id = ? OR company_id IS NULL)
        AND is_active = 1
      ORDER BY name ASC
    `).all(companyId) as any[];

    const brands = brandRows.map((b) => ({
      id: b.id,
      name: b.name,
    }));

    // 7. Companies / Manufacturers (from brands description/name and vendors)
    const companySet = new Set<string>();
    brandRows.forEach((b) => {
      const desc = (b.description || '').trim();
      if (desc) companySet.add(desc);
      else if (b.name) companySet.add(b.name);
    });

    try {
      const vendorRows = db.prepare(`
        SELECT DISTINCT company_name
        FROM vendors
        WHERE (company_id = ? OR company_id IS NULL)
          AND company_name IS NOT NULL AND company_name != ''
      `).all(companyId) as any[];
      vendorRows.forEach((v) => companySet.add(v.company_name));
    } catch {}

    const companies = Array.from(companySet)
      .sort()
      .map((name) => ({ id: name, name }));

    // 8. Sources
    const sources = [
      { id: 'DIRECT_SALE', label: 'Direct Store / Van Sale' },
      { id: 'ORDER_DELIVERY', label: 'Commercial Bill (Order Delivery)' },
      { id: 'FIELD_BOOKER', label: 'Field Order Booker' },
      { id: 'OFFICE', label: 'Office / Store Sale' },
      { id: 'VAN_SALE', label: 'Direct Van Sale' },
      { id: 'UNBILLED_ORDER', label: 'Booked Orders (Unbilled)' },
    ];

    // 9. Document Statuses
    const statuses = [
      { id: 'POSTED', label: 'POSTED (Confirmed / Active)' },
      { id: 'DRAFT', label: 'DRAFT' },
      { id: 'PAID', label: 'Fully Paid' },
      { id: 'PARTIAL', label: 'Partially Paid' },
      { id: 'UNPAID', label: 'Unpaid' },
      { id: 'VOID', label: 'Void / Cancelled' },
    ];

    // 10. Warehouses
    const warehouses = [
      { id: 'Main Warehouse', name: 'Main Warehouse' },
      { id: 'Godown 1', name: 'Godown 1' },
    ];

    return {
      salesmen,
      orderBookers,
      supplyPersons,
      customers,
      routes,
      products,
      categories,
      brands,
      companies,
      sources,
      statuses,
      warehouses,
    };
  }

  /**
   * Builds the core WHERE clause and parameters for sales analysis
   */
  private static buildWhereClause(filter: SalesAnalysisFilter, companyId: string): { whereSql: string; params: any[] } {
    const conditions: string[] = ['si.company_id = ?'];
    const params: any[] = [companyId];

    // Date range
    if (filter.fromDate && filter.toDate) {
      conditions.push('si.invoice_date >= ? AND si.invoice_date <= ?');
      params.push(filter.fromDate, filter.toDate);
    } else if (filter.fromDate) {
      conditions.push('si.invoice_date >= ?');
      params.push(filter.fromDate);
    } else if (filter.toDate) {
      conditions.push('si.invoice_date <= ?');
      params.push(filter.toDate);
    }

    // Default status: exclude VOID/CANCELLED unless user explicitly requests VOID
    if (filter.statuses && filter.statuses.length > 0) {
      const statusConditions: string[] = [];
      const paymentConditions: string[] = [];
      for (const st of filter.statuses) {
        if (st === 'PAID' || st === 'PARTIAL' || st === 'UNPAID') {
          paymentConditions.push('?');
          params.push(st);
        } else if (st === 'VOID') {
          statusConditions.push('?');
          params.push('VOID');
        } else {
          statusConditions.push('?');
          params.push(st);
        }
      }

      const combined: string[] = [];
      if (statusConditions.length > 0) {
        combined.push(`si.status IN (${statusConditions.join(', ')})`);
      }
      if (paymentConditions.length > 0) {
        combined.push(`si.payment_status IN (${paymentConditions.join(', ')})`);
      }
      if (combined.length > 0) {
        conditions.push(`(${combined.join(' OR ')})`);
      }
    } else {
      conditions.push("si.status NOT IN ('VOID', 'CANCELLED')");
    }

    // Salesman (OR within filter)
    if (filter.salesmanIds && filter.salesmanIds.length > 0) {
      const placeholders = filter.salesmanIds.map(() => '?').join(', ');
      conditions.push(`si.salesman_id IN (${placeholders})`);
      params.push(...filter.salesmanIds);
    }

    // Order Booker (OR within filter)
    if (filter.orderBookerIds && filter.orderBookerIds.length > 0) {
      const placeholders = filter.orderBookerIds.map(() => '?').join(', ');
      conditions.push(`COALESCE(si.created_by_staff_id, (SELECT so.created_by_staff_id FROM sales_orders so WHERE so.id = si.order_id)) IN (${placeholders})`);
      params.push(...filter.orderBookerIds);
    }

    // Supply / Delivery Person (OR within filter)
    if (filter.supplyPersonIds && filter.supplyPersonIds.length > 0) {
      const placeholders = filter.supplyPersonIds.map(() => '?').join(', ');
      conditions.push(`si.supply_person_id IN (${placeholders})`);
      params.push(...filter.supplyPersonIds);
    }

    // Customer (OR within filter)
    if (filter.customerIds && filter.customerIds.length > 0) {
      const placeholders = filter.customerIds.map(() => '?').join(', ');
      conditions.push(`si.customer_id IN (${placeholders})`);
      params.push(...filter.customerIds);
    }

    // Route (OR within filter)
    if (filter.routeIds && filter.routeIds.length > 0) {
      const placeholders = filter.routeIds.map(() => '?').join(', ');
      conditions.push(`si.route_id IN (${placeholders})`);
      params.push(...filter.routeIds);
    }

    // Product (OR within filter)
    if (filter.productIds && filter.productIds.length > 0) {
      const placeholders = filter.productIds.map(() => '?').join(', ');
      conditions.push(`sii.product_id IN (${placeholders})`);
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
          sourceClauses.push("si.invoice_type = 'DIRECT_SALE'");
        } else if (src === 'ORDER_DELIVERY') {
          sourceClauses.push("si.invoice_type = 'ORDER_DELIVERY'");
        } else if (src === 'FIELD_BOOKER' || src === 'OFFICE' || src === 'VAN_SALE') {
          sourceClauses.push("si.source_channel = ?");
          params.push(src);
        }
      }
      if (sourceClauses.length > 0) {
        conditions.push(`(${sourceClauses.join(' OR ')})`);
      }
    }

    // General Search (for Detailed mode or search box)
    if (filter.search && filter.search.trim()) {
      const term = `%${filter.search.trim().toLowerCase()}%`;
      conditions.push(`(
        LOWER(si.invoice_number) LIKE ? OR
        LOWER(c.name) LIKE ? OR
        LOWER(COALESCE(c.shop_name, '')) LIKE ? OR
        LOWER(p.name) LIKE ? OR
        LOWER(p.sku) LIKE ? OR
        LOWER(COALESCE(sm.name, '')) LIKE ? OR
        LOWER(COALESCE(ob.name, '')) LIKE ?
      )`);
      params.push(term, term, term, term, term, term, term);
    }

    return {
      whereSql: conditions.join(' AND '),
      params,
    };
  }

  /**
   * Main reporting method executing the comprehensive sales analysis
   */
  public static getSalesAnalysisReport(filter: SalesAnalysisFilter): SalesAnalysisReportResult {
    const db = getDatabase();
    const companyId = filter.companyId || DEFAULT_COMPANY_ID;
    const viewBy = filter.viewBy || 'detailed';

    const { whereSql, params } = this.buildWhereClause(filter, companyId);

    // Common Joins for line items
    const baseJoins = `
      FROM sales_invoice_items sii
      JOIN sales_invoices si ON sii.invoice_id = si.id AND sii.company_id = si.company_id
      LEFT JOIN products p ON sii.product_id = p.id AND (p.company_id = si.company_id OR p.company_id IS NULL)
      LEFT JOIN categories cat ON p.category_id = cat.id
      LEFT JOIN brands b ON p.brand_id = b.id
      LEFT JOIN customers c ON si.customer_id = c.id AND si.company_id = c.company_id
      LEFT JOIN routes r ON si.route_id = r.id AND si.company_id = r.company_id
      LEFT JOIN staff_members sm ON si.salesman_id = sm.id AND (sm.company_id = si.company_id OR sm.company_id IS NULL)
      LEFT JOIN staff_members ob ON (
        CASE 
          WHEN si.created_by_staff_id IS NOT NULL THEN si.created_by_staff_id 
          ELSE (SELECT so.created_by_staff_id FROM sales_orders so WHERE so.id = si.order_id)
        END
      ) = ob.id AND (ob.company_id = si.company_id OR ob.company_id IS NULL)
      LEFT JOIN staff_members sp ON si.supply_person_id = sp.id AND (sp.company_id = si.company_id OR sp.company_id IS NULL)
    `;

    // 1. Calculate Summary KPIs across all filtered rows
    const kpiSql = `
      SELECT
        COUNT(DISTINCT si.id) as total_orders,
        COALESCE(SUM(sii.quantity_base), 0) as total_qty,
        COALESCE(SUM(sii.scheme_bonus_base), 0) as total_bonus,
        COALESCE(SUM(sii.line_total_paisas + sii.discount_paisas), 0) as total_gross_paisas,
        COALESCE(SUM(sii.discount_paisas), 0) as total_discount_paisas,
        COALESCE(SUM(
          CASE 
            WHEN si.grand_total_paisas > 0 THEN CAST(ROUND((sii.line_total_paisas * 1.0 / si.grand_total_paisas) * (COALESCE(si.tax, 0) * 100)) AS INTEGER)
            ELSE 0 
          END
        ), 0) as total_tax_paisas,
        COALESCE(SUM(sii.line_total_paisas), 0) as total_net_paisas,
        COALESCE(SUM(
          CASE 
            WHEN si.grand_total_paisas > 0 THEN CAST(ROUND((sii.line_total_paisas * 1.0 / si.grand_total_paisas) * si.cash_received_paisas) AS INTEGER)
            ELSE 0 
          END
        ), 0) as total_paid_paisas
      ${baseJoins}
      WHERE ${whereSql}
    `;

    const kpiRow = db.prepare(kpiSql).get(...params) as any;
    const totalNet = Number(kpiRow?.total_net_paisas || 0);
    const totalPaid = Number(kpiRow?.total_paid_paisas || 0);
    const totalDue = totalNet - totalPaid;

    const kpis: SalesAnalysisKpis = {
      totalNetSalesPaisas: totalNet,
      totalGrossSalesPaisas: Number(kpiRow?.total_gross_paisas || 0),
      totalDiscountPaisas: Number(kpiRow?.total_discount_paisas || 0),
      totalTaxPaisas: Number(kpiRow?.total_tax_paisas || 0),
      totalQuantityPcs: Number(kpiRow?.total_qty || 0),
      totalBonusPcs: Number(kpiRow?.total_bonus || 0),
      totalOrders: Number(kpiRow?.total_orders || 0),
      totalPaidPaisas: totalPaid,
      totalDuePaisas: totalDue,
    };

    // Grand total row matching KPIs
    const grandTotal: SalesGroupedRow = {
      groupId: 'GRAND_TOTAL',
      groupKey: 'GRAND_TOTAL',
      groupName: 'GRAND TOTAL',
      groupCode: '',
      quantityPcs: kpis.totalQuantityPcs,
      bonusPcs: kpis.totalBonusPcs,
      grossPaisas: kpis.totalGrossSalesPaisas,
      discountPaisas: kpis.totalDiscountPaisas,
      taxPaisas: kpis.totalTaxPaisas,
      netSalePaisas: kpis.totalNetSalesPaisas,
      paidPaisas: kpis.totalPaidPaisas,
      duePaisas: kpis.totalDuePaisas,
      orderCount: kpis.totalOrders,
    };

    const page = Math.max(1, filter.page || 1);
    const pageSize = filter.pageSize === -1 ? 999999 : (filter.pageSize || 50);

    // 2. DETAILED SALES MODE
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

      // Determine sorting
      let orderBy = 'si.invoice_date DESC, si.invoice_number DESC, sii.id ASC';
      if (filter.sortBy) {
        const orderDir = filter.sortOrder === 'asc' ? 'ASC' : 'DESC';
        if (filter.sortBy === 'date') orderBy = `si.invoice_date ${orderDir}`;
        else if (filter.sortBy === 'documentNumber') orderBy = `si.invoice_number ${orderDir}`;
        else if (filter.sortBy === 'quantityPcs') orderBy = `sii.quantity_base ${orderDir}`;
        else if (filter.sortBy === 'grossPaisas') orderBy = `(sii.line_total_paisas + sii.discount_paisas) ${orderDir}`;
        else if (filter.sortBy === 'netSalePaisas') orderBy = `sii.line_total_paisas ${orderDir}`;
      }

      const detailedSql = `
        SELECT
          sii.id as item_id,
          si.id as invoice_id,
          si.invoice_date as date,
          si.invoice_number as document_number,
          si.source_channel,
          si.invoice_type,
          si.status,
          si.payment_status,
          si.grand_total_paisas as invoice_grand_total_paisas,
          si.cash_received_paisas as invoice_cash_received_paisas,
          si.tax as invoice_tax,
          c.id as customer_id,
          c.name as customer_name,
          COALESCE(c.shop_name, c.name) as shop_name,
          r.id as route_id,
          COALESCE(r.name, 'Unassigned') as route_name,
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
          b.id as brand_id,
          COALESCE(b.name, p.brand_name, 'No Brand') as brand_name,
          COALESCE(b.description, b.name, p.brand_name, 'Unassigned') as company_name,
          cat.id as category_id,
          COALESCE(cat.name, p.category, 'No Category') as category_name,
          sii.quantity_base as quantity_pcs,
          sii.scheme_bonus_base as bonus_pcs,
          sii.unit_price_paisas as rate_pcs_paisas,
          (sii.line_total_paisas + sii.discount_paisas) as gross_paisas,
          sii.discount_paisas,
          sii.line_total_paisas as net_sale_paisas
        ${baseJoins}
        WHERE ${whereSql}
        ORDER BY ${orderBy}
        LIMIT ? OFFSET ?
      `;

      const rows = db.prepare(detailedSql).all(...params, pageSize, offset) as any[];

      const detailedRows: SalesDetailedRow[] = rows.map((r) => {
        const invGrandTotal = Number(r.invoice_grand_total_paisas || 0);
        const invCashReceived = Number(r.invoice_cash_received_paisas || 0);
        const invTax = Number(r.invoice_tax || 0);
        const netSale = Number(r.net_sale_paisas || 0);

        const proportionalPaid = invGrandTotal > 0
          ? Math.round((netSale / invGrandTotal) * invCashReceived)
          : 0;
        const proportionalDue = netSale - proportionalPaid;
        const proportionalTax = invGrandTotal > 0
          ? Math.round((netSale / invGrandTotal) * (invTax * 100))
          : 0;

        return {
          id: r.item_id,
          invoiceId: r.invoice_id,
          date: r.date,
          documentNumber: r.document_number,
          source: r.source_channel || r.invoice_type || 'DIRECT',
          sourceLabel: this.formatSourceLabel(r.source_channel, r.invoice_type),
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
          brandId: r.brand_id,
          brandName: r.brand_name,
          companyName: r.company_name,
          categoryId: r.category_id,
          categoryName: r.category_name,
          warehouse: 'Main Warehouse',
          quantityPcs: Number(r.quantity_pcs || 0),
          bonusPcs: Number(r.bonus_pcs || 0),
          ratePcsPaisas: Number(r.rate_pcs_paisas || 0),
          grossPaisas: Number(r.gross_paisas || 0),
          discountPaisas: Number(r.discount_paisas || 0),
          taxPaisas: proportionalTax,
          netSalePaisas: netSale,
          paidPaisas: proportionalPaid,
          duePaisas: proportionalDue,
          status: r.status,
          paymentStatus: r.payment_status,
        };
      });

      return {
        viewBy,
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

    // 3. GROUPED SALES MODES
    let groupSelect = '';
    let groupByClause = '';
    let defaultOrderBy = 'net_sale_paisas DESC';

    switch (viewBy) {
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

      case 'item':
        groupSelect = `
          p.id as group_id,
          p.sku as group_key,
          p.name as group_name,
          p.sku as group_code,
          COALESCE(b.name, p.brand_name, 'No Brand') || ' • ' || COALESCE(cat.name, p.category, 'No Category') as secondary_label,
        `;
        groupByClause = 'GROUP BY p.id, p.sku, p.name, b.name, p.brand_name, cat.name, p.category';
        break;

      case 'customer':
        groupSelect = `
          c.id as group_id,
          c.id as group_key,
          COALESCE(c.shop_name, c.name) as group_name,
          c.name as group_code,
          COALESCE(r.name, 'Unassigned Route') as secondary_label,
        `;
        groupByClause = 'GROUP BY c.id, c.shop_name, c.name, r.name';
        break;

      case 'route':
        groupSelect = `
          COALESCE(r.id, 'unassigned') as group_id,
          COALESCE(r.id, 'unassigned') as group_key,
          COALESCE(r.name, 'Unassigned Route') as group_name,
          COALESCE(r.code, '') as group_code,
          COUNT(DISTINCT si.customer_id) || ' Outlets' as secondary_label,
          COUNT(DISTINCT si.customer_id) as customer_count,
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

      case 'source':
        groupSelect = `
          COALESCE(si.source_channel, si.invoice_type, 'DIRECT') as group_id,
          COALESCE(si.source_channel, si.invoice_type, 'DIRECT') as group_key,
          CASE 
            WHEN si.invoice_type = 'ORDER_DELIVERY' THEN 'Commercial Bill (Order Delivery)'
            WHEN si.source_channel = 'FIELD_BOOKER' THEN 'Field Order Booker'
            WHEN si.source_channel = 'OFFICE' THEN 'Office / Store Sale'
            WHEN si.source_channel = 'VAN_SALE' THEN 'Direct Van Sale'
            ELSE 'Direct Sale'
          END as group_name,
          COALESCE(si.source_channel, '') as group_code,
          '' as secondary_label,
        `;
        groupByClause = `GROUP BY COALESCE(si.source_channel, si.invoice_type, 'DIRECT'), si.invoice_type, si.source_channel`;
        break;

      case 'date':
        groupSelect = `
          si.invoice_date as group_id,
          si.invoice_date as group_key,
          si.invoice_date as group_name,
          '' as group_code,
          '' as secondary_label,
        `;
        groupByClause = 'GROUP BY si.invoice_date';
        defaultOrderBy = 'group_name DESC';
        break;
    }

    // Determine custom sorting
    let orderBy = defaultOrderBy;
    if (filter.sortBy) {
      const orderDir = filter.sortOrder === 'asc' ? 'ASC' : 'DESC';
      if (filter.sortBy === 'name') orderBy = `group_name ${orderDir}`;
      else if (filter.sortBy === 'quantityPcs') orderBy = `quantity_pcs ${orderDir}`;
      else if (filter.sortBy === 'grossPaisas') orderBy = `gross_paisas ${orderDir}`;
      else if (filter.sortBy === 'discountPaisas') orderBy = `discount_paisas ${orderDir}`;
      else if (filter.sortBy === 'taxPaisas') orderBy = `tax_paisas ${orderDir}`;
      else if (filter.sortBy === 'netSalePaisas') orderBy = `net_sale_paisas ${orderDir}`;
      else if (filter.sortBy === 'paidPaisas') orderBy = `paid_paisas ${orderDir}`;
      else if (filter.sortBy === 'duePaisas') orderBy = `due_paisas ${orderDir}`;
      else if (filter.sortBy === 'orderCount') orderBy = `order_count ${orderDir}`;
    }

    const groupedSql = `
      SELECT
        ${groupSelect}
        COUNT(DISTINCT si.id) as order_count,
        COALESCE(SUM(sii.quantity_base), 0) as quantity_pcs,
        COALESCE(SUM(sii.scheme_bonus_base), 0) as bonus_pcs,
        COALESCE(SUM(sii.line_total_paisas + sii.discount_paisas), 0) as gross_paisas,
        COALESCE(SUM(sii.discount_paisas), 0) as discount_paisas,
        COALESCE(SUM(
          CASE 
            WHEN si.grand_total_paisas > 0 THEN CAST(ROUND((sii.line_total_paisas * 1.0 / si.grand_total_paisas) * (COALESCE(si.tax, 0) * 100)) AS INTEGER)
            ELSE 0 
          END
        ), 0) as tax_paisas,
        COALESCE(SUM(sii.line_total_paisas), 0) as net_sale_paisas,
        COALESCE(SUM(
          CASE 
            WHEN si.grand_total_paisas > 0 THEN CAST(ROUND((sii.line_total_paisas * 1.0 / si.grand_total_paisas) * si.cash_received_paisas) AS INTEGER)
            ELSE 0 
          END
        ), 0) as paid_paisas
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

    const groupedRows: SalesGroupedRow[] = paginatedRows.map((r) => {
      const net = Number(r.net_sale_paisas || 0);
      const paid = Number(r.paid_paisas || 0);
      const due = net - paid;

      return {
        groupId: String(r.group_id),
        groupKey: String(r.group_key),
        groupName: String(r.group_name),
        groupCode: r.group_code ? String(r.group_code) : undefined,
        secondaryLabel: r.secondary_label ? String(r.secondary_label) : undefined,
        quantityPcs: Number(r.quantity_pcs || 0),
        bonusPcs: Number(r.bonus_pcs || 0),
        grossPaisas: Number(r.gross_paisas || 0),
        discountPaisas: Number(r.discount_paisas || 0),
        taxPaisas: Number(r.tax_paisas || 0),
        netSalePaisas: net,
        paidPaisas: paid,
        duePaisas: due,
        orderCount: Number(r.order_count || 0),
        customerCount: r.customer_count ? Number(r.customer_count) : undefined,
      };
    });

    return {
      viewBy,
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
