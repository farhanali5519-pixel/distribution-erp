export interface Route {
  id: string;
  company_id?: string;
  name: string;
  code: string;
  area_territory: string | null;
  city: string | null;
  assigned_salesperson_id: string | null;
  assigned_salesperson_name?: string | null;
  assigned_supply_person_id: string | null;
  assigned_supply_person_name?: string | null;
  delivery_days: string[];
  is_active: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Summary counts
  customers_count?: number;
  orders_count?: number;
  collections_count?: number;
  staff_count?: number;
}

export interface CreateRouteInput {
  name: string;
  code: string;
  area_territory?: string | null;
  city?: string | null;
  assigned_salesperson_id?: string | null;
  assigned_supply_person_id?: string | null;
  delivery_days?: string[];
  isActive?: boolean;
  notes?: string | null;
}

export interface UpdateRouteInput {
  name?: string;
  code?: string;
  area_territory?: string | null;
  city?: string | null;
  assigned_salesperson_id?: string | null;
  assigned_supply_person_id?: string | null;
  delivery_days?: string[];
  isActive?: boolean;
  notes?: string | null;
}

export interface RouteDeletionCheckResult {
  canDelete: boolean;
  message?: string;
  summary: {
    totalLinked: number;
    customersCount: number;
    ordersCount: number;
    invoicesCount: number;
    collectionsCount: number;
    staffCount: number;
  };
  linkedItems: {
    customers: { id: string; name: string; shop_name: string | null; phone: string | null; balance: number }[];
    orders: { id: string; order_number: string; order_date: string; total_amount: number; status: string; customer_name?: string }[];
    invoices: { id: string; invoice_number: string; invoice_date: string; total_amount: number; status: string }[];
    collections: { id: string; payment_number: string; payment_date: string; amount: number; customer_name?: string }[];
    staff: { id: string; name: string; role: string; phone?: string | null }[];
  };
}
