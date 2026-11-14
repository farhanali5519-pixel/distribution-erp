'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/shared/context/auth-context';
import { useFeatureFlags } from '@/shared/context/feature-flags-context';
import { formatCurrency, formatInteger } from '@/shared/utils/currency';
import { generateUUID } from '@/shared/utils/uuid';
import { SearchableSelect, SearchableSelectOption } from '@/shared/components/SearchableSelect';
import { 
  Smartphone, 
  CheckCircle2, 
  AlertCircle, 
  Calendar, 
  MapPin, 
  ShoppingBag, 
  Plus, 
  Trash2, 
  ShieldAlert, 
  Lock, 
  AlertTriangle,
  Send,
  Truck,
  Minus
} from 'lucide-react';

interface RouteOption {
  id: string;
  name: string;
  code: string;
  assigned_salesperson_id?: string;
  assigned_supply_person_id?: string;
}

interface CustomerOption {
  id: string;
  name: string;
  shop_name: string | null;
  phone: string | null;
  route_id: string | null;
  route_name?: string | null;
  credit_limit: number;
  live_balance: number;
}

interface ProductOption {
  id: string;
  sku: string;
  name: string;
  brand_name?: string;
  uom_base: string;
  uom_bulk: string;
  bulk_conversion_factor: number;
  boxes_per_carton: number;
  pieces_per_box: number;
  total_pieces_per_carton: number;
  trade_price: number; // Trade price per bulk carton
  current_stock_base: number;
}

interface StaffOption {
  id: string;
  employee_code?: string;
  name: string;
  role: string;
  route_id?: string;
}

interface OrderCartItem {
  id: string; // Line temp id
  product: ProductOption;
  pieces: number; // Quantity PCS
  cartons: number;
  boxes: number;
  loosePieces: number;
  unitPrice: number; // Trade price per bulk carton
  discPercent: number; // Disc %
  discPkr: number; // Disc PKR
  taxPercent: number; // Tax %
  taxPkr: number; // Tax PKR
  schemeBonus: number; // Bonus PCS
  grossAmount: number;
  netBeforeTax: number;
  taxAmount: number;
  netLineTotal: number; // Net Line Amount
}

export default function FieldOrderBookingPage() {
  const router = useRouter();
  const { currentUser, role, isAdmin, isOrderBooker } = useAuth();
  const { isEnabled } = useFeatureFlags();

  // Module state
  const [moduleDisabled, setModuleDisabled] = useState(false);
  const [loading, setLoading] = useState(true);

  // Master data
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [bookerContext, setBookerContext] = useState<any>(null);

  // Feature Flags
  const supplyPersonEnabled = isEnabled('sales.enable_supply_person_tracking', true);
  const lineDiscountEnabled = isEnabled('sales.enable_line_discount', true);
  const billDiscountEnabled = isEnabled('sales.enable_bill_discount', true);
  const schemeBonusEnabled = isEnabled('sales.enable_scheme_bonus', true);

  // Form State
  const [selectedRouteId, setSelectedRouteId] = useState('');
  const [showAllCustomers, setShowAllCustomers] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [supplyPersonId, setSupplyPersonId] = useState('');
  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [orderNotes, setOrderNotes] = useState('');
  const [billDiscount, setBillDiscount] = useState<number | ''>('');

  // Cart State
  const [cartItems, setCartItems] = useState<OrderCartItem[]>([]);

  // Current Item Entry State
  const [entryProductId, setEntryProductId] = useState('');
  const [entryPieces, setEntryPieces] = useState<number | ''>(1);
  const [entryUnitPrice, setEntryUnitPrice] = useState<number | ''>('');
  const [entryDiscountPercent, setEntryDiscountPercent] = useState<number | ''>('');
  const [entryDiscountPkr, setEntryDiscountPkr] = useState<number | ''>('');
  const [entryTaxPercent, setEntryTaxPercent] = useState<number | ''>('');
  const [entryTaxPkr, setEntryTaxPkr] = useState<number | ''>('');
  const [entrySchemeBonus, setEntrySchemeBonus] = useState<number | ''>('');

  // Validation feedback & scroll refs
  const customerSectionRef = useRef<HTMLDivElement>(null);
  const productSectionRef = useRef<HTMLDivElement>(null);
  const quantityInputRef = useRef<HTMLInputElement>(null);

  const [customerError, setCustomerError] = useState<string | null>(null);
  const [productEntryError, setProductEntryError] = useState<string | null>(null);
  const [quantityError, setQuantityError] = useState<string | null>(null);
  const [cartError, setCartError] = useState<string | null>(null);

  // Idempotency token & Submission state
  const clientOrderUuidRef = useRef<string>(generateUUID());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [bookedOrderResult, setBookedOrderResult] = useState<any | null>(null);

  // Fetch initial portal data
  const fetchPortalData = async () => {
    setLoading(true);
    setSubmitError(null);
    try {
      const url = currentUser?.id 
        ? `/api/sales/field-order-booking?userId=${currentUser.id}` 
        : '/api/sales/field-order-booking';
      const res = await fetch(url);
      const data = await res.json();

      if (res.status === 403 || data.moduleDisabled) {
        setModuleDisabled(true);
        setLoading(false);
        return;
      }

      if (data.success) {
        setRoutes(data.routes || []);
        setCustomers(data.customers || []);
        setProducts(data.products || []);
        setStaff(data.staff || []);
        setBookerContext(data.bookerContext || null);

        // Auto-select assigned route
        if (data.bookerContext?.assigned_route_id) {
          setSelectedRouteId(data.bookerContext.assigned_route_id);
        } else if (data.routes && data.routes.length > 0) {
          setSelectedRouteId(data.routes[0].id);
        }
      } else {
        setSubmitError(data.message || 'Failed to load field booking data');
      }
    } catch (err: any) {
      console.error('Error fetching field booking data:', err);
      setSubmitError('Unable to connect to sales server. Check network connection.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPortalData();
  }, [currentUser]);

  // Delivery / Supply Officer options
  const supplyPersonOptions = useMemo(() => {
    return staff
      .filter((s) => s.role === 'SUPPLY_PERSON' || s.role === 'DRIVER' || s.role === 'BOTH')
      .map((s) => ({
        value: s.id,
        label: s.name,
        badge: s.employee_code,
        badgeColor: 'indigo' as const,
        keywords: [s.employee_code || '', s.name],
      }));
  }, [staff]);

  // When route changes, default supplyPersonId if route has assigned_supply_person_id
  useEffect(() => {
    if (selectedRouteId) {
      const r = routes.find((rt) => rt.id === selectedRouteId);
      if (r?.assigned_supply_person_id) {
        setSupplyPersonId(r.assigned_supply_person_id);
      }
    }
  }, [selectedRouteId, routes]);

  // Options for route SearchableSelect
  const routeSelectOptions: SearchableSelectOption[] = useMemo(() => [
    { value: '', label: '-- All Available Routes --' },
    ...routes.map((r) => ({
      value: r.id,
      label: `${r.name} (${r.code})`,
      keywords: [r.code, r.name],
    })),
  ], [routes]);

  // Selected customer details
  const selectedCustomer = useMemo(() => {
    return customers.find((c) => c.id === selectedCustomerId) || null;
  }, [customers, selectedCustomerId]);

  // Filtered customers based on selected route
  const filteredCustomers = useMemo(() => {
    if (showAllCustomers || !selectedRouteId) {
      return customers;
    }
    return customers.filter((c) => c.route_id === selectedRouteId);
  }, [customers, selectedRouteId, showAllCustomers]);

  // Options for customer SearchableSelect
  const customerOptions: SearchableSelectOption[] = useMemo(() => {
    return filteredCustomers.map((c) => ({
      value: c.id,
      label: c.shop_name ? `${c.name} (${c.shop_name})` : c.name,
      subLabel: `${c.route_name || 'No Route'} | Bal: ${formatCurrency(c.live_balance)} | Limit: ${formatCurrency(c.credit_limit)}`,
      badge: c.live_balance > c.credit_limit ? 'Over Limit' : undefined,
      badgeColor: c.live_balance > c.credit_limit ? 'rose' : undefined,
      keywords: [c.name, c.shop_name || '', c.phone || ''],
    }));
  }, [filteredCustomers]);

  // Selected product in entry form
  const selectedEntryProduct = useMemo(() => {
    return products.find((p) => p.id === entryProductId) || null;
  }, [products, entryProductId]);

  // Options for product SearchableSelect
  const productOptions: SearchableSelectOption[] = useMemo(() => {
    return products.map((p) => ({
      value: p.id,
      label: p.name,
      subLabel: `SKU: ${p.sku} | ${p.brand_name || 'General'} | Stock: ${formatInteger(p.current_stock_base)} pcs`,
      badge: `${formatCurrency(p.trade_price)} / PCS`,
      badgeColor: 'blue',
      keywords: [p.name, p.sku, p.brand_name || ''],
    }));
  }, [products]);

  // Pure calculation helpers
  // Trade price is strictly per base piece (TP / PCS)
  const getEntryGross = (prod?: ProductOption | null, pieces: number | '' = 0, unitPrice: number | '' = 0) => {
    if (!prod) return 0;
    const totalPcs = typeof pieces === 'number' ? Math.max(0, pieces) : 0;
    const price = typeof unitPrice === 'number' ? unitPrice : prod.trade_price;
    return price * totalPcs;
  };

  const calculateEntryAmounts = (
    prod?: ProductOption | null,
    pieces: number | '' = 0,
    unitPrice: number | '' = 0,
    discPkr: number | '' = 0,
    discPercent: number | '' = 0,
    taxPkr: number | '' = 0,
    taxPercent: number | '' = 0
  ) => {
    const gross = getEntryGross(prod, pieces, unitPrice);
    const discount = typeof discPkr === 'number' ? Math.max(0, discPkr) : 0;
    const netBeforeTax = Math.max(0, gross - discount);

    let taxAmount = 0;
    let computedTaxPct = typeof taxPercent === 'number' ? Math.max(0, taxPercent) : 0;

    if (typeof taxPkr === 'number' && taxPkr > 0) {
      taxAmount = taxPkr;
      computedTaxPct = netBeforeTax > 0 ? (taxAmount / netBeforeTax) * 100 : 0;
    } else if (typeof taxPercent === 'number' && taxPercent > 0) {
      taxAmount = (netBeforeTax * taxPercent) / 100;
    }

    const netLineTotal = netBeforeTax + taxAmount;

    return {
      gross,
      discount,
      netBeforeTax,
      taxAmount: Math.round(taxAmount * 100) / 100,
      taxPercent: Math.round(computedTaxPct * 10) / 10,
      netLineTotal: Math.round(netLineTotal * 100) / 100,
    };
  };

  // Two-way sync handlers for entry row
  const handleProductChange = (prodId: string) => {
    setEntryProductId(prodId);
    setProductEntryError(null);
    if (!prodId) {
      setEntryUnitPrice('');
      setEntryDiscountPercent('');
      setEntryDiscountPkr('');
      setEntryTaxPercent('');
      setEntryTaxPkr('');
      setEntrySchemeBonus('');
      return;
    }
    const prod = products.find((p) => p.id === prodId);
    const tp = prod ? prod.trade_price : 0;
    setEntryUnitPrice(tp);
    const pcs = typeof entryPieces === 'number' && entryPieces > 0 ? entryPieces : 1;
    setEntryPieces(pcs);
    const gross = getEntryGross(prod, pcs, tp);
    const discPct = typeof entryDiscountPercent === 'number' ? entryDiscountPercent : 0;
    const discPkr = discPct > 0 ? (gross * discPct) / 100 : (typeof entryDiscountPkr === 'number' ? entryDiscountPkr : 0);
    const netBeforeTax = Math.max(0, gross - discPkr);
    const taxPct = typeof entryTaxPercent === 'number' ? entryTaxPercent : 0;
    const taxPkr = taxPct > 0 ? (netBeforeTax * taxPct) / 100 : (typeof entryTaxPkr === 'number' ? entryTaxPkr : 0);
    setEntryDiscountPkr(discPkr > 0 ? Math.round(discPkr * 100) / 100 : '');
    setEntryTaxPkr(taxPkr > 0 ? Math.round(taxPkr * 100) / 100 : '');
  };

  const handlePiecesChange = (val: number | '') => {
    const pcs = val === '' ? '' : Math.max(0, val);
    setEntryPieces(pcs);
    if (typeof pcs === 'number' && pcs > 0) {
      setQuantityError(null);
    }
    const prod = selectedEntryProduct;
    const gross = getEntryGross(prod, pcs, entryUnitPrice);
    const discPct = typeof entryDiscountPercent === 'number' ? entryDiscountPercent : 0;
    const discPkr = discPct > 0 ? (gross * discPct) / 100 : (typeof entryDiscountPkr === 'number' ? entryDiscountPkr : 0);
    const netBeforeTax = Math.max(0, gross - discPkr);
    const taxPct = typeof entryTaxPercent === 'number' ? entryTaxPercent : 0;
    const taxPkr = taxPct > 0 ? (netBeforeTax * taxPct) / 100 : (typeof entryTaxPkr === 'number' ? entryTaxPkr : 0);
    setEntryDiscountPkr(discPkr > 0 ? Math.round(discPkr * 100) / 100 : '');
    setEntryTaxPkr(taxPkr > 0 ? Math.round(taxPkr * 100) / 100 : '');
  };

  const handleUnitPriceChange = (val: number | '') => {
    const price = val === '' ? '' : Math.max(0, val);
    setEntryUnitPrice(price);
    const prod = selectedEntryProduct;
    const gross = getEntryGross(prod, entryPieces, price);
    const discPct = typeof entryDiscountPercent === 'number' ? entryDiscountPercent : 0;
    const discPkr = discPct > 0 ? (gross * discPct) / 100 : (typeof entryDiscountPkr === 'number' ? entryDiscountPkr : 0);
    const netBeforeTax = Math.max(0, gross - discPkr);
    const taxPct = typeof entryTaxPercent === 'number' ? entryTaxPercent : 0;
    const taxPkr = taxPct > 0 ? (netBeforeTax * taxPct) / 100 : (typeof entryTaxPkr === 'number' ? entryTaxPkr : 0);
    setEntryDiscountPkr(discPkr > 0 ? Math.round(discPkr * 100) / 100 : '');
    setEntryTaxPkr(taxPkr > 0 ? Math.round(taxPkr * 100) / 100 : '');
  };

  const handleDiscPercentChange = (val: number | '') => {
    if (val === '' || val === 0) {
      setEntryDiscountPercent('');
      setEntryDiscountPkr('');
      const prod = selectedEntryProduct;
      const gross = getEntryGross(prod, entryPieces, entryUnitPrice);
      const taxPct = typeof entryTaxPercent === 'number' ? entryTaxPercent : 0;
      const taxPkr = taxPct > 0 ? (gross * taxPct) / 100 : (typeof entryTaxPkr === 'number' ? entryTaxPkr : 0);
      setEntryTaxPkr(taxPkr > 0 ? Math.round(taxPkr * 100) / 100 : '');
      return;
    }
    const pct = Math.min(100, Math.max(0, Number(val)));
    const prod = selectedEntryProduct;
    const gross = getEntryGross(prod, entryPieces, entryUnitPrice);
    const discPkr = (gross * pct) / 100;
    const netBeforeTax = Math.max(0, gross - discPkr);
    const taxPct = typeof entryTaxPercent === 'number' ? entryTaxPercent : 0;
    const taxPkr = taxPct > 0 ? (netBeforeTax * taxPct) / 100 : (typeof entryTaxPkr === 'number' ? entryTaxPkr : 0);
    setEntryDiscountPercent(pct);
    setEntryDiscountPkr(Math.round(discPkr * 100) / 100);
    setEntryTaxPkr(taxPkr > 0 ? Math.round(taxPkr * 100) / 100 : '');
  };

  const handleDiscPkrChange = (val: number | '') => {
    if (val === '' || val === 0) {
      setEntryDiscountPkr('');
      setEntryDiscountPercent('');
      const prod = selectedEntryProduct;
      const gross = getEntryGross(prod, entryPieces, entryUnitPrice);
      const taxPct = typeof entryTaxPercent === 'number' ? entryTaxPercent : 0;
      const taxPkr = taxPct > 0 ? (gross * taxPct) / 100 : (typeof entryTaxPkr === 'number' ? entryTaxPkr : 0);
      setEntryTaxPkr(taxPkr > 0 ? Math.round(taxPkr * 100) / 100 : '');
      return;
    }
    const pkr = Math.max(0, Number(val));
    const prod = selectedEntryProduct;
    const gross = getEntryGross(prod, entryPieces, entryUnitPrice);
    const pct = gross > 0 ? (pkr / gross) * 100 : 0;
    const netBeforeTax = Math.max(0, gross - pkr);
    const taxPct = typeof entryTaxPercent === 'number' ? entryTaxPercent : 0;
    const taxPkr = taxPct > 0 ? (netBeforeTax * taxPct) / 100 : (typeof entryTaxPkr === 'number' ? entryTaxPkr : 0);
    setEntryDiscountPkr(pkr);
    setEntryDiscountPercent(Math.round(pct * 10) / 10);
    setEntryTaxPkr(taxPkr > 0 ? Math.round(taxPkr * 100) / 100 : '');
  };

  const handleTaxPercentChange = (val: number | '') => {
    if (val === '' || val === 0) {
      setEntryTaxPercent('');
      setEntryTaxPkr('');
      return;
    }
    const pct = Math.min(100, Math.max(0, Number(val)));
    const prod = selectedEntryProduct;
    const gross = getEntryGross(prod, entryPieces, entryUnitPrice);
    const disc = typeof entryDiscountPkr === 'number' ? entryDiscountPkr : 0;
    const netBeforeTax = Math.max(0, gross - disc);
    const taxPkr = (netBeforeTax * pct) / 100;
    setEntryTaxPercent(pct);
    setEntryTaxPkr(Math.round(taxPkr * 100) / 100);
  };

  const handleTaxPkrChange = (val: number | '') => {
    if (val === '' || val === 0) {
      setEntryTaxPkr('');
      setEntryTaxPercent('');
      return;
    }
    const pkr = Math.max(0, Number(val));
    const prod = selectedEntryProduct;
    const gross = getEntryGross(prod, entryPieces, entryUnitPrice);
    const disc = typeof entryDiscountPkr === 'number' ? entryDiscountPkr : 0;
    const netBeforeTax = Math.max(0, gross - disc);
    const pct = netBeforeTax > 0 ? (pkr / netBeforeTax) * 100 : 0;
    setEntryTaxPkr(pkr);
    setEntryTaxPercent(Math.round(pct * 10) / 10);
  };

  const handleSchemeBonusChange = (val: number | '') => {
    setEntrySchemeBonus(val === '' ? '' : Math.max(0, parseInt(String(val)) || 0));
  };

  // Live calculation for entry row preview
  const entryFinancials = useMemo(() => {
    return calculateEntryAmounts(
      selectedEntryProduct,
      entryPieces,
      entryUnitPrice,
      entryDiscountPkr,
      entryDiscountPercent,
      entryTaxPkr,
      entryTaxPercent
    );
  }, [selectedEntryProduct, entryPieces, entryUnitPrice, entryDiscountPkr, entryDiscountPercent, entryTaxPkr, entryTaxPercent]);

  // Handle Add Item to Cart
  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    setProductEntryError(null);
    setQuantityError(null);

    if (!selectedEntryProduct) {
      setProductEntryError('Please select a product first.');
      productSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const pieces = typeof entryPieces === 'number' ? entryPieces : 0;
    if (pieces <= 0) {
      setQuantityError('Quantity PCS must be at least 1.');
      quantityInputRef.current?.focus();
      return;
    }

    const prod = selectedEntryProduct;
    const bpc = Math.max(1, prod.boxes_per_carton || 1);
    const ppb = Math.max(1, prod.pieces_per_box || 1);
    const ppc = Math.max(1, prod.total_pieces_per_carton || (bpc * ppb) || prod.bulk_conversion_factor || 1);
    const ctn = Math.floor(pieces / ppc);
    const box = Math.floor((pieces % ppc) / ppb);
    const loose = (pieces % ppc) % ppb;

    const fin = calculateEntryAmounts(
      prod,
      pieces,
      entryUnitPrice,
      entryDiscountPkr,
      entryDiscountPercent,
      entryTaxPkr,
      entryTaxPercent
    );

    const newItem: OrderCartItem = {
      id: generateUUID(),
      product: selectedEntryProduct,
      pieces,
      cartons: ctn,
      boxes: box,
      loosePieces: loose,
      unitPrice: typeof entryUnitPrice === 'number' ? entryUnitPrice : selectedEntryProduct.trade_price,
      discPercent: typeof entryDiscountPercent === 'number' ? entryDiscountPercent : 0,
      discPkr: fin.discount,
      taxPercent: fin.taxPercent,
      taxPkr: fin.taxAmount,
      schemeBonus: typeof entrySchemeBonus === 'number' ? entrySchemeBonus : 0,
      grossAmount: fin.gross,
      netBeforeTax: fin.netBeforeTax,
      taxAmount: fin.taxAmount,
      netLineTotal: fin.netLineTotal,
    };

    setCartItems((prev) => [...prev, newItem]);
    setCartError(null);

    // Reset entry inputs
    setEntryProductId('');
    setEntryPieces(1);
    setEntryUnitPrice('');
    setEntryDiscountPercent('');
    setEntryDiscountPkr('');
    setEntryTaxPercent('');
    setEntryTaxPkr('');
    setEntrySchemeBonus('');
  };

  // Remove Item from Cart
  const handleRemoveItem = (id: string) => {
    setCartItems((prev) => prev.filter((item) => item.id !== id));
  };

  // Update item quantity directly via stepper controls
  const handleUpdateItemPieces = (id: string, newPieces: number) => {
    if (newPieces <= 0) return;
    setCartItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const prod = item.product;
        const bpc = Math.max(1, prod.boxes_per_carton || 1);
        const ppb = Math.max(1, prod.pieces_per_box || 1);
        const ppc = Math.max(1, prod.total_pieces_per_carton || (bpc * ppb) || prod.bulk_conversion_factor || 1);
        const ctn = Math.floor(newPieces / ppc);
        const box = Math.floor((newPieces % ppc) / ppb);
        const loose = (newPieces % ppc) % ppb;

        const fin = calculateEntryAmounts(
          prod,
          newPieces,
          item.unitPrice,
          item.discPercent > 0 ? '' : item.discPkr,
          item.discPercent,
          item.taxPercent > 0 ? '' : item.taxPkr,
          item.taxPercent
        );

        return {
          ...item,
          pieces: newPieces,
          cartons: ctn,
          boxes: box,
          loosePieces: loose,
          grossAmount: fin.gross,
          discPkr: fin.discount,
          netBeforeTax: fin.netBeforeTax,
          taxAmount: fin.taxAmount,
          netLineTotal: fin.netLineTotal,
        };
      })
    );
  };

  // Order Totals Summary
  const orderSummary = useMemo(() => {
    const totalItems = cartItems.length;
    const totalBasePieces = cartItems.reduce((sum, item) => sum + item.pieces, 0);
    const totalCartons = cartItems.reduce((sum, item) => sum + item.cartons, 0);
    const grossTotal = cartItems.reduce((sum, item) => sum + item.grossAmount, 0);
    const lineDiscounts = cartItems.reduce((sum, item) => sum + item.discPkr, 0);
    const totalTax = cartItems.reduce((sum, item) => sum + item.taxAmount, 0);
    const totalBonus = cartItems.reduce((sum, item) => sum + item.schemeBonus, 0);
    const billDisc = typeof billDiscount === 'number' ? billDiscount : 0;
    const netBeforeTax = Math.max(0, grossTotal - lineDiscounts - billDisc);
    const netTotal = netBeforeTax + totalTax;

    return {
      totalItems,
      totalBasePieces,
      totalCartons,
      grossTotal,
      lineDiscounts,
      totalTax,
      totalBonus,
      billDisc,
      netTotal,
    };
  }, [cartItems, billDiscount]);

  // Check if credit limit will be exceeded
  const creditCheck = useMemo(() => {
    if (!selectedCustomer) return { isOver: false, excess: 0, currentBal: 0, limit: 0, projectedBal: 0 };
    const currentBal = selectedCustomer.live_balance || 0;
    const limit = selectedCustomer.credit_limit || 0;
    const projectedBal = currentBal + orderSummary.netTotal;
    const isOver = limit > 0 && projectedBal > limit;
    const excess = isOver ? projectedBal - limit : 0;

    return { isOver, excess, currentBal, limit, projectedBal };
  }, [selectedCustomer, orderSummary.netTotal]);

  // Submit Order to Server
  const handleSubmitOrder = async () => {
    setCustomerError(null);
    setCartError(null);

    if (!selectedCustomerId) {
      setCustomerError('Please select a customer / retail shop.');
      customerSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (cartItems.length === 0) {
      setCartError('Please add at least one product item to the order.');
      productSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const payload = {
        customerId: selectedCustomerId,
        routeId: selectedRouteId || selectedCustomer?.route_id || undefined,
        salesmanId: bookerContext?.staff_id || undefined,
        supplyPersonId: supplyPersonEnabled && supplyPersonId ? supplyPersonId : undefined,
        orderDate,
        billDiscountPaisas: typeof billDiscount === 'number' && billDiscount > 0 
          ? Math.round(billDiscount * 100) 
          : 0,
        notes: orderNotes ? `[Field Booker: ${bookerContext?.staff_name || currentUser?.full_name || 'App'}] ${orderNotes}` : undefined,
        
        // Field Booker Idempotency & Metadata
        sourceChannel: 'FIELD_BOOKER',
        createdByUserId: currentUser?.id || undefined,
        createdByStaffId: bookerContext?.staff_id || undefined,
        clientOrderUuid: clientOrderUuidRef.current,
        bookerCode: bookerContext?.employee_code || undefined,
        clientCreatedAt: new Date().toISOString(),

        items: cartItems.map((item) => ({
          productId: item.product.id,
          cartonsCount: item.cartons,
          boxesCount: item.boxes,
          loosePiecesCount: item.loosePieces,
          quantityBase: item.pieces,
          unitPricePaisas: Math.round(item.unitPrice * 100),
          discountPercent: item.discPercent,
          discountPaisas: Math.round(item.discPkr * 100),
          taxPercent: item.taxPercent,
          taxPaisas: Math.round(item.taxPkr * 100),
          schemeBonusBase: item.schemeBonus,
        })),
      };

      const res = await fetch('/api/sales/field-order-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.status === 403 || data.moduleDisabled) {
        setModuleDisabled(true);
        setIsSubmitting(false);
        return;
      }

      if (data.success && data.order) {
        setBookedOrderResult(data.order);
      } else {
        setSubmitError(data.message || 'Failed to book field order.');
      }
    } catch (err: any) {
      console.error('Error submitting field order:', err);
      setSubmitError('Network failure occurred while posting order. Please verify connection and tap Book Order again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reset form to book next order
  const handleBookNextOrder = () => {
    clientOrderUuidRef.current = generateUUID();
    setBookedOrderResult(null);
    setSelectedCustomerId('');
    setCartItems([]);
    setBillDiscount('');
    setOrderNotes('');
    setSubmitError(null);
    setCustomerError(null);
    setProductEntryError(null);
    setQuantityError(null);
    setCartError(null);
  };

  // Module Disabled Fallback View
  if (moduleDisabled) {
    return (
      <div style={{ maxWidth: '640px', margin: '3rem auto', padding: '1rem' }}>
        <div className="card" style={{ textAlign: 'center', padding: '2.5rem 1.5rem', border: '1px solid #fecaca' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#fee2e2', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
            <ShieldAlert size={28} />
          </div>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-heading)', marginBottom: '0.5rem' }}>
            Field Order Booking Module Disabled
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '1.75rem' }}>
            The Field Order Booking portal is currently disabled in your system module registry. To use this feature, an administrator must enable it under Settings &gt; Modules.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/" className="btn btn-outline min-h-[44px] flex items-center justify-center">
              Return to Dashboard
            </Link>
            {isAdmin && (
              <Link href="/modules" className="btn btn-primary min-h-[44px] flex items-center justify-center">
                Configure Modules
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Loading View
  if (loading) {
    return (
      <div style={{ maxWidth: '800px', margin: '2rem auto', padding: '1rem' }}>
        <div className="card" style={{ padding: '2.5rem', textAlign: 'center' }}>
          <div className="spinner" style={{ margin: '0 auto 1rem' }} />
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-heading)' }}>
            Loading Market Order Booker Portal...
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Synchronizing assigned territory routes, retail customers, and commercial pricing.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', paddingBottom: 'calc(110px + env(safe-area-inset-bottom, 0px))' }}>
      
      {/* 1. Header (Mobile Compact / Desktop Rich) */}
      <div 
        className="card" 
        style={{ 
          marginBottom: '0.85rem', 
          padding: '0.75rem 1rem',
          borderLeft: '4px solid var(--accent-emerald)',
          background: 'linear-gradient(to right, rgba(16, 185, 129, 0.05), transparent)'
        }}
      >
        {/* Mobile Header (< 768px) */}
        <div className="flex md:hidden items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div 
              style={{ 
                width: '36px', 
                height: '36px', 
                borderRadius: '8px', 
                background: 'rgba(16, 185, 129, 0.12)', 
                color: 'var(--accent-emerald)', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              <Smartphone size={18} />
            </div>
            <div className="min-w-0">
              <h1 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-heading)', margin: 0, lineHeight: 1.25 }} className="truncate">
                Field Sale
              </h1>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }} className="truncate">
                Booker: <strong style={{ color: 'var(--text-heading)' }}>{bookerContext?.staff_name || currentUser?.full_name || 'Market Officer'}</strong>
                {bookerContext?.assigned_route_name && (
                  <span style={{ color: 'var(--accent-emerald)', marginLeft: '6px', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                    <MapPin size={10} /> {bookerContext.assigned_route_name}
                  </span>
                )}
              </div>
            </div>
          </div>
          <Link 
            href="/sales" 
            className="btn btn-outline btn-sm min-h-[40px] px-3 shrink-0 flex items-center justify-center font-semibold text-xs"
          >
            View Orders
          </Link>
        </div>

        {/* Desktop Header (>= 768px) */}
        <div className="hidden md:flex justify-between items-center flex-wrap gap-3">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div 
              style={{ 
                width: '42px', 
                height: '42px', 
                borderRadius: '8px', 
                background: 'rgba(16, 185, 129, 0.12)', 
                color: 'var(--accent-emerald)', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center' 
              }}
            >
              <Smartphone size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-heading)', margin: 0 }}>
                  Field Sale
                </h1>
                <span className="badge badge-emerald" style={{ fontSize: '0.7rem' }}>
                  Mobile / Tablet Mode
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginTop: '0.2rem', fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
                <span>
                  Booker: <strong>{bookerContext?.staff_name || currentUser?.full_name || 'Market Officer'}</strong>
                </span>
                {bookerContext?.employee_code && (
                  <span className="badge badge-subtle" style={{ fontSize: '0.7rem' }}>
                    {bookerContext.employee_code}
                  </span>
                )}
                {bookerContext?.assigned_route_name && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: 'var(--accent-emerald)' }}>
                    <MapPin size={13} /> {bookerContext.assigned_route_name}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Link href="/sales" className="btn btn-outline btn-sm min-h-[38px] flex items-center">
              View All Orders
            </Link>
          </div>
        </div>
      </div>

      {submitError && (
        <div 
          className="card" 
          style={{ 
            marginBottom: '0.85rem', 
            background: '#fef2f2', 
            border: '1px solid #fecaca', 
            color: '#dc2626',
            padding: '0.75rem 1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem'
          }}
        >
          <AlertCircle size={20} style={{ flexShrink: 0 }} />
          <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>{submitError}</div>
        </div>
      )}

      {/* Main Single-Column on Mobile, 2 Columns on Desktop/Tablet */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
        
        {/* 2. Territory & Customer Selection */}
        <div ref={customerSectionRef} className="card p-3.5 sm:p-4">
          <h2 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-heading)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <MapPin size={16} style={{ color: 'var(--accent-emerald)' }} />
            1. Territory & Customer
          </h2>

          {/* Target Market Route */}
          <div style={{ marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', margin: 0 }}>
                Target Market Route
              </label>
              {isOrderBooker && bookerContext?.assigned_route_id && (
                <span style={{ fontSize: '0.725rem', color: 'var(--accent-emerald)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <Lock size={11} /> Locked to Assigned Territory
                </span>
              )}
            </div>
            <SearchableSelect
              value={selectedRouteId}
              onChange={(val) => {
                setSelectedRouteId(val);
                setSelectedCustomerId('');
                setCustomerError(null);
              }}
              disabled={isOrderBooker && !!bookerContext?.assigned_route_id}
              options={routeSelectOptions}
              placeholder="-- All Available Routes --"
              searchPlaceholder="Search routes..."
              size="lg"
            />
          </div>

          {/* Select Shop / Customer */}
          <div style={{ marginBottom: selectedCustomer ? '0.75rem' : 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', margin: 0 }}>
                Select Shop / Customer <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <button
                type="button"
                onClick={() => setShowAllCustomers(!showAllCustomers)}
                style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '0.725rem', cursor: 'pointer', textDecoration: 'underline', padding: '2px 0' }}
              >
                {showAllCustomers ? 'Filter by Route' : 'Show All Routes'}
              </button>
            </div>

            <SearchableSelect
              value={selectedCustomerId}
              onChange={(val) => {
                setSelectedCustomerId(val);
                setCustomerError(null);
              }}
              options={customerOptions}
              placeholder="-- Type customer name or shop --"
              searchPlaceholder="Search by shop, name or phone..."
              size="lg"
              allowClear
            />

            {customerError && (
              <div style={{ color: '#dc2626', fontSize: '0.75rem', fontWeight: 600, marginTop: '0.35rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <AlertCircle size={13} /> {customerError}
              </div>
            )}
          </div>

          {/* Selected Customer Snapshot Card */}
          {selectedCustomer && (
            <div 
              style={{ 
                background: creditCheck.isOver ? 'rgba(239, 68, 68, 0.05)' : 'var(--surface-muted)', 
                border: creditCheck.isOver ? '1px solid #fecaca' : '1px solid var(--border-subtle)', 
                borderRadius: '8px', 
                padding: '0.75rem',
                fontSize: '0.825rem'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.35rem' }}>
                <div className="min-w-0 pr-2">
                  <div style={{ fontWeight: 700, color: 'var(--text-heading)' }}>{selectedCustomer.name}</div>
                  {selectedCustomer.shop_name && (
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.775rem' }}>{selectedCustomer.shop_name}</div>
                  )}
                  {selectedCustomer.phone && (
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                      Phone: <span className="numeric-text font-medium">{selectedCustomer.phone}</span>
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <span className="badge badge-subtle" style={{ fontSize: '0.7rem' }}>
                    {selectedCustomer.route_name || 'Standard'}
                  </span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.45rem', paddingTop: '0.45rem', borderTop: '1px solid var(--border-subtle)' }}>
                <div>
                  <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>Current Balance:</div>
                  <div className="tabular-nums" style={{ fontWeight: 600, color: selectedCustomer.live_balance > 0 ? '#f59e0b' : 'var(--text-heading)' }}>
                    {formatCurrency(selectedCustomer.live_balance)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>Credit Limit:</div>
                  <div className="tabular-nums" style={{ fontWeight: 600, color: 'var(--text-heading)' }}>
                    {selectedCustomer.credit_limit > 0 ? formatCurrency(selectedCustomer.credit_limit) : 'No Limit'}
                  </div>
                </div>
              </div>

              {creditCheck.isOver && (
                <div style={{ marginTop: '0.45rem', display: 'flex', alignItems: 'center', gap: '4px', color: '#dc2626', fontSize: '0.75rem', fontWeight: 600 }}>
                  <AlertTriangle size={14} className="shrink-0" />
                  <span>Warning: Projected balance exceeds credit limit by {formatCurrency(creditCheck.excess)}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 3. Dates & Delivery Info (Stacked on Mobile) */}
        <div className="card p-3.5 sm:p-4">
          <h2 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-heading)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <Calendar size={16} style={{ color: 'var(--accent-emerald)' }} />
            2. Dates & Delivery Info
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>
                Booking Date
              </label>
              <input
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
                className="input tabular-nums min-h-[44px] text-base sm:text-sm w-full"
                style={{ width: '100%', fontSize: '16px' }}
              />
            </div>

            {supplyPersonEnabled && (
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>
                  Delivery / Supply Officer
                </label>
                <SearchableSelect
                  value={supplyPersonId}
                  onChange={setSupplyPersonId}
                  options={supplyPersonOptions}
                  clearLabel="Unassigned Delivery"
                  placeholder="Unassigned Delivery"
                  searchPlaceholder="Search delivery staff..."
                  size="lg"
                />
              </div>
            )}
          </div>

          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>
              Booking Remarks / Market Notes
            </label>
            <input
              type="text"
              value={orderNotes}
              onChange={(e) => setOrderNotes(e.target.value)}
              placeholder="e.g. Urgent morning delivery, back entrance"
              className="input min-h-[44px] text-base sm:text-sm w-full"
              style={{ width: '100%', fontSize: '16px' }}
            />
          </div>
        </div>

      </div>

      {/* 4. Add Products to Order (Critical Mobile Product Entry Card) */}
      <div ref={productSectionRef} className="card p-3.5 sm:p-4 mb-3">
        <h2 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-heading)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          <ShoppingBag size={16} style={{ color: 'var(--accent-emerald)' }} />
          3. Add Products to Order
        </h2>

        <form onSubmit={handleAddItem}>
          
          {/* MOBILE PRODUCT ENTRY CARD (< 1024px) */}
          <div className="block lg:hidden">
            {/* Full-width Product Selector */}
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>
                Product / SKU <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <SearchableSelect
                value={entryProductId}
                onChange={handleProductChange}
                options={productOptions}
                placeholder="-- Select Product / SKU --"
                searchPlaceholder="Search product by name or SKU..."
                size="lg"
                allowClear
              />
              {productEntryError && (
                <div style={{ color: '#dc2626', fontSize: '0.75rem', fontWeight: 600, marginTop: '0.35rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <AlertCircle size={13} /> {productEntryError}
                </div>
              )}
            </div>

            {/* Pack & Stock Preview Tag */}
            {selectedEntryProduct && (
              <div 
                style={{ 
                  marginBottom: '0.75rem', 
                  padding: '0.45rem 0.65rem', 
                  background: 'var(--surface-muted)', 
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '0.35rem',
                  fontSize: '0.75rem'
                }}
              >
                <span style={{ color: 'var(--text-muted)' }}>
                  1 CTN = {Math.max(1, selectedEntryProduct.total_pieces_per_carton || ((selectedEntryProduct.boxes_per_carton || 1) * (selectedEntryProduct.pieces_per_box || 1)) || selectedEntryProduct.bulk_conversion_factor || 1)} PCS
                </span>
                <span>
                  Available Stock: <strong className="tabular-nums" style={{ color: selectedEntryProduct.current_stock_base >= (entryPieces || 0) ? '#10b981' : '#f59e0b' }}>{formatInteger(selectedEntryProduct.current_stock_base)} pcs</strong>
                </span>
              </div>
            )}

            {/* Compact 2-Column Grid */}
            <div className="grid grid-cols-2 gap-2.5 mb-3">
              {/* Row 1: Quantity PCS & Bonus PCS */}
              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>
                  Quantity PCS <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  ref={quantityInputRef}
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  value={entryPieces}
                  onChange={(e) => handlePiecesChange(e.target.value === '' ? '' : parseInt(e.target.value) || 0)}
                  placeholder="1"
                  className="input tabular-nums text-right min-h-[44px] font-bold w-full"
                  style={{ fontSize: '16px' }}
                  required
                />
                {quantityError && (
                  <div style={{ color: '#dc2626', fontSize: '0.72rem', fontWeight: 600, marginTop: '2px' }}>
                    {quantityError}
                  </div>
                )}
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>
                  Bonus PCS
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  value={entrySchemeBonus}
                  onChange={(e) => handleSchemeBonusChange(e.target.value === '' ? '' : parseInt(e.target.value) || 0)}
                  placeholder="0"
                  className="input tabular-nums text-right min-h-[44px] w-full"
                  style={{ fontSize: '16px' }}
                />
              </div>

              {/* Row 2: Trade Price & Disc % */}
              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>
                  TP / PCS
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={entryUnitPrice}
                  onChange={(e) => handleUnitPriceChange(e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="input tabular-nums text-right min-h-[44px] w-full"
                  style={{ fontSize: '16px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>
                  Disc %
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  inputMode="decimal"
                  value={entryDiscountPercent}
                  onChange={(e) => handleDiscPercentChange(e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                  placeholder="0%"
                  className="input tabular-nums text-right min-h-[44px] w-full"
                  style={{ fontSize: '16px' }}
                />
              </div>

              {/* Row 3: Disc PKR & Tax % */}
              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>
                  Disc PKR
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={entryDiscountPkr}
                  onChange={(e) => handleDiscPkrChange(e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="input tabular-nums text-right min-h-[44px] w-full"
                  style={{ fontSize: '16px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>
                  Tax %
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  inputMode="decimal"
                  value={entryTaxPercent}
                  onChange={(e) => handleTaxPercentChange(e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                  placeholder="0%"
                  className="input tabular-nums text-right min-h-[44px] w-full"
                  style={{ fontSize: '16px' }}
                />
              </div>

              {/* Row 4: Tax PKR (Span 2) */}
              <div className="col-span-2">
                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>
                  Tax PKR
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={entryTaxPkr}
                  onChange={(e) => handleTaxPkrChange(e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="input tabular-nums text-right min-h-[44px] w-full"
                  style={{ fontSize: '16px' }}
                />
              </div>
            </div>

            {/* Net Line Amount Preview */}
            {selectedEntryProduct && (
              <div 
                style={{ 
                  marginBottom: '0.75rem', 
                  padding: '0.55rem 0.75rem', 
                  background: 'var(--surface-muted)', 
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '0.825rem'
                }}
              >
                <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
                  Estimated Line Amount:
                </span>
                <strong className="tabular-nums font-bold" style={{ fontSize: '1rem', color: 'var(--text-heading)' }}>
                  {formatCurrency(entryFinancials.netLineTotal)}
                </strong>
              </div>
            )}

            {/* Full-Width Mobile Add Item Button */}
            <button
              type="submit"
              disabled={!selectedEntryProduct || !entryPieces || entryPieces <= 0}
              className="btn btn-emerald w-full min-h-[46px] font-bold text-base flex items-center justify-center gap-2 shadow-xs disabled:opacity-50"
            >
              <Plus size={18} /> + Add Item
            </button>
          </div>

          {/* DESKTOP PRODUCT ENTRY ROW (>= 1024px) */}
          <div className="hidden lg:block">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(125px, 1fr))', gap: '0.75rem', alignItems: 'flex-end' }}>
              
              {/* Product / SKU Selector */}
              <div style={{ minWidth: '240px', gridColumn: 'span 2' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
                  Product / SKU <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <SearchableSelect
                  value={entryProductId}
                  onChange={handleProductChange}
                  options={productOptions}
                  placeholder="-- Select Product --"
                  searchPlaceholder="Search product by name or SKU..."
                  size="md"
                  allowClear
                />
              </div>

              {/* Quantity PCS */}
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
                  Quantity PCS <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  value={entryPieces}
                  onChange={(e) => handlePiecesChange(e.target.value === '' ? '' : parseInt(e.target.value) || 0)}
                  placeholder="1"
                  className="input tabular-nums text-right"
                  style={{ width: '100%', fontSize: '0.9rem', fontWeight: 600, minHeight: '38px' }}
                  required
                />
              </div>

              {/* Trade Price */}
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
                  TP / PCS
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={entryUnitPrice}
                  onChange={(e) => handleUnitPriceChange(e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="input tabular-nums text-right"
                  style={{ width: '100%', fontSize: '0.9rem', minHeight: '38px' }}
                />
              </div>

              {/* Disc % */}
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
                  Disc %
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  inputMode="decimal"
                  value={entryDiscountPercent}
                  onChange={(e) => handleDiscPercentChange(e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                  placeholder="0%"
                  className="input tabular-nums text-right"
                  style={{ width: '100%', fontSize: '0.9rem', minHeight: '38px' }}
                />
              </div>

              {/* Disc PKR */}
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
                  Disc PKR
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={entryDiscountPkr}
                  onChange={(e) => handleDiscPkrChange(e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="input tabular-nums text-right"
                  style={{ width: '100%', fontSize: '0.9rem', minHeight: '38px' }}
                />
              </div>

              {/* Tax % */}
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
                  Tax %
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  inputMode="decimal"
                  value={entryTaxPercent}
                  onChange={(e) => handleTaxPercentChange(e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                  placeholder="0%"
                  className="input tabular-nums text-right"
                  style={{ width: '100%', fontSize: '0.9rem', minHeight: '38px' }}
                />
              </div>

              {/* Tax PKR */}
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
                  Tax PKR
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={entryTaxPkr}
                  onChange={(e) => handleTaxPkrChange(e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="input tabular-nums text-right"
                  style={{ width: '100%', fontSize: '0.9rem', minHeight: '38px' }}
                />
              </div>

              {/* Bonus PCS */}
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
                  Bonus PCS
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  value={entrySchemeBonus}
                  onChange={(e) => handleSchemeBonusChange(e.target.value === '' ? '' : parseInt(e.target.value) || 0)}
                  placeholder="0"
                  className="input tabular-nums text-right"
                  style={{ width: '100%', fontSize: '0.9rem', minHeight: '38px' }}
                />
              </div>

              {/* Add Button */}
              <div>
                <button
                  type="submit"
                  disabled={!selectedEntryProduct || !entryPieces || entryPieces <= 0}
                  className="btn btn-primary"
                  style={{ width: '100%', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                >
                  <Plus size={16} /> Add Item
                </button>
              </div>

            </div>

            {/* Live Dynamic Computation Preview Bar */}
            {selectedEntryProduct && (
              <div 
                style={{ 
                  marginTop: '0.85rem', 
                  padding: '0.65rem 0.85rem', 
                  background: 'var(--surface-muted)', 
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '0.75rem',
                  fontSize: '0.825rem'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
                  <span>
                    Quantity: <strong className="tabular-nums" style={{ color: 'var(--text-heading)' }}>{formatInteger(entryPieces || 0)} PCS</strong>
                  </span>
                  <span style={{ color: 'var(--border-strong)' }}>|</span>
                  <span style={{ color: 'var(--text-muted)' }}>
                    1 CTN = {Math.max(1, selectedEntryProduct.total_pieces_per_carton || ((selectedEntryProduct.boxes_per_carton || 1) * (selectedEntryProduct.pieces_per_box || 1)) || selectedEntryProduct.bulk_conversion_factor || 1)} PCS
                  </span>
                  <span style={{ color: 'var(--border-strong)' }}>|</span>
                  <span>
                    Available Stock: <strong className="tabular-nums" style={{ color: selectedEntryProduct.current_stock_base >= (entryPieces || 0) ? '#10b981' : '#f59e0b' }}>{formatInteger(selectedEntryProduct.current_stock_base)} pcs</strong>
                  </span>
                </div>
                <div>
                  Net Line Amount: <strong className="tabular-nums font-bold" style={{ fontSize: '0.95rem', color: 'var(--text-heading)' }}>{formatCurrency(entryFinancials.netLineTotal)}</strong>
                </div>
              </div>
            )}
          </div>

        </form>
      </div>

      {/* 5. Cart Items Table & List */}
      <div className="card p-0 overflow-hidden mb-3">
        <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, color: 'var(--text-heading)' }}>
            Order Items ({cartItems.length})
          </h3>
          <span className="tabular-nums" style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>
            Total Pieces: <strong>{formatInteger(orderSummary.totalBasePieces)}</strong>
          </span>
        </div>

        {cartError && (
          <div style={{ padding: '0.5rem 1rem', background: '#fef2f2', borderBottom: '1px solid #fecaca', color: '#dc2626', fontSize: '0.785rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
            <AlertCircle size={14} /> {cartError}
          </div>
        )}

        {cartItems.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2.5rem 1.25rem', color: 'var(--text-muted)' }}>
            <ShoppingBag size={32} style={{ margin: '0 auto 0.5rem', opacity: 0.3 }} />
            <div style={{ fontWeight: 600, fontSize: '0.925rem', marginBottom: '0.2rem' }}>Cart is empty</div>
            <div style={{ fontSize: '0.8rem' }}>Select a product above to start building the order.</div>
          </div>
        ) : (
          <>
            {/* MOBILE ORDER ITEMS CARDS (< 768px) */}
            <div className="block md:hidden p-2.5 space-y-2.5">
              {cartItems.map((item) => (
                <div 
                  key={item.id} 
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '8px',
                    padding: '0.75rem',
                  }}
                >
                  {/* Product Title & Remove Button */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.45rem', paddingBottom: '0.45rem', borderBottom: '1px solid var(--border-subtle)' }}>
                    <div className="min-w-0 pr-1">
                      <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-heading)', lineHeight: 1.3 }}>
                        {item.product.name}
                      </div>
                      <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        SKU: {item.product.sku} {item.product.brand_name ? `• ${item.product.brand_name}` : ''}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(item.id)}
                      className="p-1.5 rounded text-rose-600 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 min-h-[38px] min-w-[38px] flex items-center justify-center shrink-0"
                      title="Remove item"
                      aria-label="Remove item"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  {/* 2-Column Metrics Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem 0.75rem', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.65rem' }}>
                    <div>
                      <span>Qty: </span>
                      <strong className="tabular-nums" style={{ color: 'var(--text-heading)' }}>
                        {formatInteger(item.pieces)} pcs {item.cartons > 0 && `(${item.cartons} ctn)`}
                      </strong>
                    </div>
                    <div>
                      <span>Bonus: </span>
                      <strong className="tabular-nums" style={{ color: item.schemeBonus > 0 ? '#10b981' : 'var(--text-muted)' }}>
                        {item.schemeBonus > 0 ? `+${formatInteger(item.schemeBonus)} pcs` : '0'}
                      </strong>
                    </div>
                    <div>
                      <span>Price: </span>
                      <span className="tabular-nums font-medium" style={{ color: 'var(--text-primary)' }}>
                        {formatCurrency(item.unitPrice)}
                      </span>
                    </div>
                    <div>
                      <span>Discount: </span>
                      <span className="tabular-nums font-medium">
                        {item.discPkr > 0 ? formatCurrency(item.discPkr) : '0.00'}
                      </span>
                    </div>
                    <div>
                      <span>Tax: </span>
                      <span className="tabular-nums font-medium">
                        {item.taxPkr > 0 ? formatCurrency(item.taxPkr) : '0.00'}
                      </span>
                    </div>
                  </div>

                  {/* Line Total & Thumb-friendly Quantity Stepper */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '0.45rem', borderTop: '1px solid var(--border-subtle)' }}>
                    <div>
                      <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', fontWeight: 600 }}>
                        Line Total
                      </div>
                      <div className="tabular-nums font-bold" style={{ fontSize: '1rem', color: 'var(--text-heading)' }}>
                        {formatCurrency(item.netLineTotal)}
                      </div>
                    </div>

                    {/* Stepper [-] Qty [+] */}
                    <div style={{ display: 'inline-flex', alignItems: 'center', background: 'var(--surface-muted)', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '2px' }}>
                      <button
                        type="button"
                        onClick={() => handleUpdateItemPieces(item.id, Math.max(1, item.pieces - 1))}
                        disabled={item.pieces <= 1}
                        style={{
                          width: '38px',
                          height: '38px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: 'none',
                          background: item.pieces <= 1 ? 'transparent' : 'var(--bg-surface)',
                          borderRadius: '4px',
                          color: 'var(--text-heading)',
                          fontWeight: 700,
                          cursor: item.pieces <= 1 ? 'not-allowed' : 'pointer',
                          opacity: item.pieces <= 1 ? 0.35 : 1
                        }}
                        aria-label="Decrease quantity"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="tabular-nums font-bold" style={{ width: '38px', textAlign: 'center', fontSize: '0.875rem', color: 'var(--text-heading)' }}>
                        {item.pieces}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleUpdateItemPieces(item.id, item.pieces + 1)}
                        style={{
                          width: '38px',
                          height: '38px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: 'none',
                          background: 'var(--bg-surface)',
                          borderRadius: '4px',
                          color: 'var(--text-heading)',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                        aria-label="Increase quantity"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* DESKTOP ORDER ITEMS TABLE (>= 768px) */}
            <div className="hidden md:block table-container" style={{ overflowX: 'auto' }}>
              <table className="table" style={{ width: '100%', minWidth: '920px' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Product / SKU</th>
                    <th style={{ textAlign: 'right' }}>Quantity PCS</th>
                    <th style={{ textAlign: 'right' }}>Trade Price</th>
                    <th style={{ textAlign: 'right' }}>Disc %</th>
                    <th style={{ textAlign: 'right' }}>Disc PKR</th>
                    <th style={{ textAlign: 'right' }}>Tax %</th>
                    <th style={{ textAlign: 'right' }}>Tax PKR</th>
                    <th style={{ textAlign: 'right' }}>Bonus PCS</th>
                    <th style={{ textAlign: 'right' }}>Net Line Amount</th>
                    <th style={{ textAlign: 'center', width: '60px' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {cartItems.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.product.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          SKU: {item.product.sku} | {item.product.brand_name || 'Standard'}
                        </div>
                      </td>
                      <td className="text-right tabular-nums font-semibold" style={{ fontSize: '0.85rem' }}>
                        {formatInteger(item.pieces)}
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                          {item.cartons > 0 && `${item.cartons} ctn `}
                          {item.boxes > 0 && `${item.boxes} box `}
                          {item.loosePieces > 0 && `${item.loosePieces} pcs`}
                        </div>
                      </td>
                      <td className="text-right tabular-nums" style={{ fontSize: '0.85rem' }}>
                        {formatCurrency(item.unitPrice)}
                      </td>
                      <td className="text-right tabular-nums" style={{ fontSize: '0.85rem' }}>
                        {item.discPercent > 0 ? `${item.discPercent.toFixed(1)}%` : '-'}
                      </td>
                      <td className="text-right tabular-nums" style={{ fontSize: '0.85rem' }}>
                        {item.discPkr > 0 ? formatCurrency(item.discPkr) : '-'}
                      </td>
                      <td className="text-right tabular-nums" style={{ fontSize: '0.85rem' }}>
                        {item.taxPercent > 0 ? `${item.taxPercent.toFixed(1)}%` : '-'}
                      </td>
                      <td className="text-right tabular-nums" style={{ fontSize: '0.85rem' }}>
                        {item.taxPkr > 0 ? formatCurrency(item.taxPkr) : '-'}
                      </td>
                      <td className="text-right tabular-nums" style={{ fontSize: '0.85rem', color: '#10b981' }}>
                        {item.schemeBonus > 0 ? `+${formatInteger(item.schemeBonus)} pcs` : '-'}
                      </td>
                      <td className="text-right tabular-nums font-bold" style={{ color: 'var(--text-heading)' }}>
                        {formatCurrency(item.netLineTotal)}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.id)}
                          className="btn btn-sm"
                          style={{ padding: '0.35rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: 'none', minHeight: '32px' }}
                          title="Remove item"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Optional Bill Discount Row if enabled */}
        {billDiscountEnabled && cartItems.length > 0 && (
          <div style={{ padding: '0.65rem 1rem', borderTop: '1px solid var(--border-subtle)', background: 'var(--surface-muted)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.785rem', fontWeight: 600, color: 'var(--text-secondary)', margin: 0 }}>
                Overall Bill Discount (Optional)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={billDiscount}
                onChange={(e) => setBillDiscount(e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                placeholder="0.00"
                className="input tabular-nums text-right"
                style={{ width: '130px', minHeight: '38px', fontSize: '16px' }}
              />
            </div>
          </div>
        )}
      </div>

      {/* 6. Sticky Bottom Action Bar for Mobile & Tablet */}
      <div 
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          background: 'var(--bg-surface)',
          borderTop: '1px solid var(--border-subtle)',
          padding: '0.65rem 1rem calc(0.65rem + env(safe-area-inset-bottom, 0px))',
          boxShadow: '0 -4px 18px rgba(0, 0, 0, 0.08)',
          zIndex: 40,
        }}
      >
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
          
          {/* Order Summary Snapshot */}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {orderSummary.totalItems} items ({formatInteger(orderSummary.totalBasePieces)} pcs)
              </span>
              {cartItems.length > 0 && (
                <button
                  type="button"
                  onClick={handleBookNextOrder}
                  disabled={isSubmitting}
                  style={{ 
                    fontSize: '0.725rem', 
                    color: 'var(--text-muted)', 
                    textDecoration: 'underline', 
                    background: 'none', 
                    border: 'none', 
                    padding: 0, 
                    cursor: 'pointer' 
                  }}
                >
                  Clear
                </button>
              )}
            </div>
            <div className="tabular-nums font-bold" style={{ fontSize: '1.2rem', color: 'var(--accent-emerald)', lineHeight: 1.25 }}>
              {formatCurrency(orderSummary.netTotal)}
            </div>
          </div>

          {/* Action Button: Book Order (Dominant Action) */}
          <button
            type="button"
            onClick={handleSubmitOrder}
            disabled={isSubmitting || cartItems.length === 0 || !selectedCustomerId}
            className="btn btn-emerald"
            style={{ 
              minWidth: '150px', 
              minHeight: '46px', 
              fontSize: '0.95rem', 
              fontWeight: 700, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              gap: '0.5rem',
              borderRadius: 'var(--radius-md)',
              boxShadow: '0 4px 14px rgba(16, 185, 129, 0.28)',
              flexShrink: 0
            }}
          >
            {isSubmitting ? (
              <span>Posting Order...</span>
            ) : (
              <>
                <Send size={16} /> Book Order Now
              </>
            )}
          </button>

        </div>
      </div>

      {/* 7. Success Modal */}
      {bookedOrderResult && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 60,
            padding: '1rem'
          }}
        >
          <div 
            className="card" 
            style={{ 
              maxWidth: '480px', 
              width: '100%', 
              textAlign: 'center', 
              padding: '1.75rem 1.25rem', 
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)' 
            }}
          >
            <div 
              style={{ 
                width: '58px', 
                height: '58px', 
                borderRadius: '50%', 
                background: '#ecfdf5', 
                color: '#059669', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                margin: '0 auto 1rem',
                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)' 
              }}
            >
              <CheckCircle2 size={32} />
            </div>

            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-heading)', marginBottom: '0.25rem' }}>
              Order Booked Successfully!
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
              The field order has been recorded into the centralized Sales Order registry.
            </p>

            <div 
              style={{ 
                background: 'var(--surface-muted)', 
                borderRadius: '8px', 
                padding: '0.85rem', 
                marginBottom: '1.25rem', 
                textAlign: 'left',
                fontSize: '0.85rem' 
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.45rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Order Number:</span>
                <strong className="doc-identifier" style={{ color: 'var(--primary)', fontSize: '0.95rem' }}>
                  {bookedOrderResult.order_number}
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.45rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Customer:</span>
                <strong>{selectedCustomer?.name || 'Customer'}</strong>
              </div>
              {supplyPersonId && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.45rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Delivery Officer:</span>
                  <span>{supplyPersonOptions.find((s) => s.value === supplyPersonId)?.label || 'Assigned'}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.45rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Total Pieces:</span>
                <span className="tabular-nums font-semibold">{formatInteger(orderSummary.totalBasePieces)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '0.45rem', borderTop: '1px solid var(--border-subtle)' }}>
                <span style={{ fontWeight: 700, color: 'var(--text-heading)' }}>Order Value:</span>
                <strong className="tabular-nums font-bold" style={{ fontSize: '1.05rem', color: 'var(--accent-emerald)' }}>
                  {formatCurrency(bookedOrderResult.grand_total || orderSummary.netTotal)}
                </strong>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={handleBookNextOrder}
                className="btn btn-emerald min-h-[44px]"
                style={{ width: '100%', fontSize: '0.875rem', fontWeight: 600 }}
              >
                + Next Order
              </button>
              <Link
                href="/sales"
                className="btn btn-outline min-h-[44px]"
                style={{ width: '100%', fontSize: '0.875rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                View Orders List
              </Link>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
