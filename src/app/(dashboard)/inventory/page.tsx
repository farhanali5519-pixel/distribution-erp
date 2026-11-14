'use client';

import { useState, useEffect, useMemo } from 'react';
import { SearchableSelect } from '@/shared/components/SearchableSelect';
import { ListPageContainer } from '@/shared/components/ListPageContainer';
import { PaginationControls, usePagination } from '@/shared/components/PaginationControls';
import { Button, IconButton } from '@/shared/components/Button';

const sortOptions = [
  { value: 'NAME_ASC', label: 'Name (A → Z)' },
  { value: 'NAME_DESC', label: 'Name (Z → A)' },
  { value: 'STOCK_DESC', label: 'Highest Stock' },
  { value: 'STOCK_ASC', label: 'Lowest Stock' },
  { value: 'TP_DESC', label: 'Highest Trade Price' },
  { value: 'MARGIN_DESC', label: 'Highest Margin %' },
];
import { formatCurrency, formatInteger, formatPercentage, formatNumber, toPaisas, fromPaisas } from '@/shared/utils/currency';
import { useAuth } from '@/shared/context/auth-context';
import { useFeatureFlags } from '@/shared/context/feature-flags-context';
import { 
  breakdownStock, 
  toBasePieces, 
  formatPackagingRatio, 
  calculatePiecesPerCarton 
} from '@/shared/utils/uom';
import { 
  Package, 
  Plus, 
  AlertTriangle, 
  CheckCircle2, 
  Layers, 
  Search, 
  SlidersHorizontal, 
  TrendingUp, 
  ArrowRightLeft,
  RefreshCw,
  Boxes,
  X,
  Sparkles,
  Building2,
  FolderTree,
  Edit2,
  Trash2,
  Info,
  Check,
  PackageCheck,
  PackageX,
  Tag,
  ShieldAlert,
  ArrowRight,
  Filter
} from 'lucide-react';

interface Product {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  category_id: string | null;
  category_name: string;
  brand_id: string | null;
  brand_name: string;
  uom_base: string;
  uom_bulk: string;
  bulk_conversion_factor: number;
  boxes_per_carton: number;
  pieces_per_box: number;
  total_pieces_per_carton: number;
  packaging_ratio: string;
  cost_price: number;
  trade_price: number;
  mrp: number;
  margin_percentage: number;
  current_stock_base: number;
  stock_cartons: number;
  stock_boxes: number;
  stock_pieces: number;
  formatted_stock: string;
  stock_summary: string;
  min_stock_alert: number;
  is_low_stock: boolean;
  is_active: number;
}

interface CategoryItem {
  id: string;
  name: string;
  description: string | null;
  is_active: number;
  product_count: number;
}

interface BrandItem {
  id: string;
  name: string;
  description: string | null;
  is_active: number;
  product_count: number;
}

type StockFilterTab = 'ALL' | 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
type SortOption = 'NAME_ASC' | 'NAME_DESC' | 'STOCK_DESC' | 'STOCK_ASC' | 'MARGIN_DESC' | 'TP_DESC';

export default function InventoryPage() {
  const { isSalesman } = useAuth();
  const { isEnabled } = useFeatureFlags();
  const maskCostForSalesman = isSalesman && isEnabled('auth.mask_cost_price_for_salesmen', true);

  // Core Data
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [brands, setBrands] = useState<BrandItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<StockFilterTab>('ALL');
  const [sortBy, setSortBy] = useState<SortOption>('NAME_ASC');

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showBrandModal, setShowBrandModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Add / Edit Product Form State
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [brandId, setBrandId] = useState('');
  
  // 3-Tier Packaging State
  const [boxesPerCarton, setBoxesPerCarton] = useState<number>(12);
  const [piecesPerBox, setPiecesPerBox] = useState<number>(10);
  
  // Pricing State
  const [costPrice, setCostPrice] = useState<number | ''>('');
  const [tradePrice, setTradePrice] = useState<number | ''>('');
  const [mrp, setMrp] = useState<number | ''>('');
  
  // Opening Stock (in CTN / BOX / PCS)
  const [initialCartons, setInitialCartons] = useState<number | ''>(0);
  const [initialBoxes, setInitialBoxes] = useState<number | ''>(0);
  const [initialPieces, setInitialPieces] = useState<number | ''>(0);
  const [minStockAlert, setMinStockAlert] = useState<number | ''>(12);

  // Adjust Form State (3-Tier)
  const [adjustType, setAdjustType] = useState<'INCREASE' | 'DECREASE'>('INCREASE');
  const [adjustCartons, setAdjustCartons] = useState<number | ''>(0);
  const [adjustBoxes, setAdjustBoxes] = useState<number | ''>(0);
  const [adjustPieces, setAdjustPieces] = useState<number | ''>(0);
  const [adjustReason, setAdjustReason] = useState('Stock Count Verification');

  // Category Modal Form State
  const [catName, setCatName] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [catReassignSource, setCatReassignSource] = useState<CategoryItem | null>(null);
  const [catReassignTargetId, setCatReassignTargetId] = useState('');

  // Brand Modal Form State
  const [brandName, setBrandName] = useState('');
  const [brandDesc, setBrandDesc] = useState('');
  const [editingBrandId, setEditingBrandId] = useState<string | null>(null);
  const [brandReassignSource, setBrandReassignSource] = useState<BrandItem | null>(null);
  const [brandReassignTargetId, setBrandReassignTargetId] = useState('');

  // Status & Alerts
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError: boolean } | null>(null);

  // Fetch all inventory, category, and brand data
  const fetchInventoryData = async () => {
    try {
      const [resProd, resCat, resBrand] = await Promise.all([
        fetch('/api/inventory'),
        fetch('/api/inventory/categories'),
        fetch('/api/inventory/brands'),
      ]);
      const dataProd = await resProd.json();
      const dataCat = await resCat.json();
      const dataBrand = await resBrand.json();

      if (dataProd.success) setProducts(dataProd.products || []);
      if (dataCat.success) setCategories(dataCat.categories || []);
      if (dataBrand.success) setBrands(dataBrand.brands || []);
    } catch (err: any) {
      console.error('Failed to load inventory data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchInventoryData();
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('new') === '1' || params.get('create') === '1') {
        setShowAddModal(true);
      }
    }
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchInventoryData();
  };

  // Auto-calculated Pieces per Carton in form
  const calculatedPiecesPerCarton = useMemo(() => {
    return calculatePiecesPerCarton(boxesPerCarton, piecesPerBox);
  }, [boxesPerCarton, piecesPerBox]);

  // Auto-calculated Total Opening Pieces in form
  const calculatedOpeningPieces = useMemo(() => {
    return toBasePieces(
      Number(initialCartons) || 0,
      Number(initialBoxes) || 0,
      Number(initialPieces) || 0,
      boxesPerCarton,
      piecesPerBox
    );
  }, [initialCartons, initialBoxes, initialPieces, boxesPerCarton, piecesPerBox]);

  // Auto-calculated Opening Valuation in integer paisas: total PCS × Purchase Cost / PCS
  const calculatedOpeningValuation = useMemo(() => {
    const costPerPiecePaisas = toPaisas(Number(costPrice) || 0);
    const valuationPaisas = calculatedOpeningPieces * costPerPiecePaisas;
    return fromPaisas(valuationPaisas);
  }, [calculatedOpeningPieces, costPrice]);

  // Auto-calculated Profit Margin % in form
  const calculatedMargin = useMemo(() => {
    const cp = Number(costPrice) || 0;
    const tp = Number(tradePrice) || 0;
    if (tp <= 0) return 0;
    return Math.round(((tp - cp) / tp) * 1000) / 10;
  }, [costPrice, tradePrice]);

  // Open Add Product Modal
  const openAddProductModal = () => {
    setEditingProductId(null);
    setSku(`SKU-${String(Date.now()).slice(-6)}`);
    setBarcode('');
    setName('');
    setCategoryId(categories.length > 0 ? categories[0].id : '');
    setBrandId(brands.length > 0 ? brands[0].id : '');
    setBoxesPerCarton(12);
    setPiecesPerBox(10);
    setCostPrice('');
    setTradePrice('');
    setMrp('');
    setInitialCartons(0);
    setInitialBoxes(0);
    setInitialPieces(0);
    setMinStockAlert(12);
    setShowAddModal(true);
  };

  // Open Edit Product Modal
  const openEditProductModal = (p: Product) => {
    setEditingProductId(p.id);
    setSku(p.sku);
    setBarcode(p.barcode || '');
    setName(p.name);
    setCategoryId(p.category_id || '');
    setBrandId(p.brand_id || '');
    setBoxesPerCarton(p.boxes_per_carton || 12);
    setPiecesPerBox(p.pieces_per_box || 10);
    setCostPrice(p.cost_price || '');
    setTradePrice(p.trade_price || '');
    setMrp(p.mrp || '');
    setMinStockAlert(p.min_stock_alert || 0);
    setShowEditModal(true);
  };

  // Open Adjust Modal
  const openAdjustStockModal = (p: Product) => {
    setSelectedProduct(p);
    setAdjustType('INCREASE');
    setAdjustCartons(0);
    setAdjustBoxes(0);
    setAdjustPieces(0);
    setAdjustReason('Stock Reconciliation');
    setShowAdjustModal(true);
  };

  // Handle Save Product (Create)
  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku,
          barcode,
          name,
          categoryId: categoryId || undefined,
          brandId: brandId || undefined,
          boxesPerCarton,
          piecesPerBox,
          costPrice: Number(costPrice) || 0,
          tradePrice: Number(tradePrice) || 0,
          mrp: Number(mrp) || 0,
          initialCartons: Number(initialCartons) || 0,
          initialBoxes: Number(initialBoxes) || 0,
          initialPieces: Number(initialPieces) || 0,
          minStockAlert: Number(minStockAlert) || 0,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        setStatusMessage({ text: data.message || 'Failed to create product', isError: true });
        return;
      }

      setStatusMessage({ text: `Product "${data.product.name}" created successfully with 3-tier packaging!`, isError: false });
      setShowAddModal(false);
      await fetchInventoryData();
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Error creating product', isError: true });
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Save Product (Update)
  const handleUpdateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProductId) return;
    setStatusMessage(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/inventory', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingProductId,
          sku,
          barcode,
          name,
          categoryId: categoryId || null,
          brandId: brandId || null,
          boxesPerCarton,
          piecesPerBox,
          costPrice: Number(costPrice) || 0,
          tradePrice: Number(tradePrice) || 0,
          mrp: Number(mrp) || 0,
          minStockAlert: Number(minStockAlert) || 0,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        setStatusMessage({ text: data.message || 'Failed to update product', isError: true });
        return;
      }

      setStatusMessage({ text: `Product "${data.product.name}" updated successfully!`, isError: false });
      setShowEditModal(false);
      await fetchInventoryData();
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Error updating product', isError: true });
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Stock Adjustment
  const handleStockAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;

    setStatusMessage(null);
    setSubmitting(true);

    try {
      const ctn = Number(adjustCartons) || 0;
      const box = Number(adjustBoxes) || 0;
      const pcs = Number(adjustPieces) || 0;

      if (ctn === 0 && box === 0 && pcs === 0) {
        setStatusMessage({ text: 'Please enter at least one carton, box, or piece quantity to adjust.', isError: true });
        setSubmitting(false);
        return;
      }

      const res = await fetch('/api/inventory/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: selectedProduct.id,
          adjustmentType: adjustType,
          cartons: ctn,
          boxes: box,
          pieces: pcs,
          reason: adjustReason,
          postToGL: true,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        setStatusMessage({ text: data.message || 'Stock adjustment failed', isError: true });
        return;
      }

      setStatusMessage({ text: `Stock adjusted successfully for "${selectedProduct.name}"!`, isError: false });
      setShowAdjustModal(false);
      await fetchInventoryData();
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Error submitting stock adjustment', isError: true });
    } finally {
      setSubmitting(false);
    }
  };

  // Category Operations
  const handleCreateOrUpdateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) return;

    try {
      const method = editingCatId ? 'PUT' : 'POST';
      const body: any = { name: catName.trim(), description: catDesc.trim() || undefined };
      if (editingCatId) body.id = editingCatId;

      const res = await fetch('/api/inventory/categories', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        alert(data.error || 'Failed to save category');
        return;
      }

      setCatName('');
      setCatDesc('');
      setEditingCatId(null);
      await fetchInventoryData();
    } catch (err: any) {
      alert(err.message || 'Error saving category');
    }
  };

  const handleDeleteCategory = async (cat: CategoryItem) => {
    if (cat.product_count > 0) {
      setCatReassignSource(cat);
      const otherCats = categories.filter((c) => c.id !== cat.id);
      setCatReassignTargetId(otherCats.length > 0 ? otherCats[0].id : '');
      return;
    }

    if (!confirm(`Are you sure you want to delete category "${cat.name}"?`)) return;

    try {
      const res = await fetch(`/api/inventory/categories?id=${cat.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to delete category');
        return;
      }
      await fetchInventoryData();
    } catch (err: any) {
      alert(err.message || 'Error deleting category');
    }
  };

  const handleReassignAndDeleteCategory = async () => {
    if (!catReassignSource || !catReassignTargetId) return;

    try {
      const res = await fetch(`/api/inventory/categories?id=${catReassignSource.id}&reassignToId=${catReassignTargetId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to reassign and delete category');
        return;
      }
      setCatReassignSource(null);
      await fetchInventoryData();
    } catch (err: any) {
      alert(err.message || 'Error processing reassignment');
    }
  };

  // Brand Operations
  const handleCreateOrUpdateBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!brandName.trim()) return;

    try {
      const method = editingBrandId ? 'PUT' : 'POST';
      const body: any = { name: brandName.trim(), description: brandDesc.trim() || undefined };
      if (editingBrandId) body.id = editingBrandId;

      const res = await fetch('/api/inventory/brands', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        alert(data.error || 'Failed to save brand');
        return;
      }

      setBrandName('');
      setBrandDesc('');
      setEditingBrandId(null);
      await fetchInventoryData();
    } catch (err: any) {
      alert(err.message || 'Error saving brand');
    }
  };

  const handleDeleteBrand = async (brand: BrandItem) => {
    if (brand.product_count > 0) {
      setBrandReassignSource(brand);
      const otherBrands = brands.filter((b) => b.id !== brand.id);
      setBrandReassignTargetId(otherBrands.length > 0 ? otherBrands[0].id : '');
      return;
    }

    if (!confirm(`Are you sure you want to delete company/brand "${brand.name}"?`)) return;

    try {
      const res = await fetch(`/api/inventory/brands?id=${brand.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to delete company/brand');
        return;
      }
      await fetchInventoryData();
    } catch (err: any) {
      alert(err.message || 'Error deleting brand');
    }
  };

  const handleReassignAndDeleteBrand = async () => {
    if (!brandReassignSource || !brandReassignTargetId) return;

    try {
      const res = await fetch(`/api/inventory/brands?id=${brandReassignSource.id}&reassignToId=${brandReassignTargetId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to reassign and delete company/brand');
        return;
      }
      setBrandReassignSource(null);
      await fetchInventoryData();
    } catch (err: any) {
      alert(err.message || 'Error processing reassignment');
    }
  };

  // Filtered & Sorted Products
  const filteredProducts = useMemo(() => {
    let result = [...products];

    // Search Query (SKU, Name, Barcode, Brand, Category)
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          (p.barcode && p.barcode.toLowerCase().includes(q)) ||
          p.category_name.toLowerCase().includes(q) ||
          p.brand_name.toLowerCase().includes(q)
      );
    }

    // Multi-Select Category Filter: OR within categories group
    if (selectedCategories.length > 0) {
      result = result.filter((p) => selectedCategories.includes(p.category_id || ''));
    }

    // Multi-Select Brand Filter: OR within brands group (AND across category group)
    if (selectedBrands.length > 0) {
      result = result.filter((p) => selectedBrands.includes(p.brand_id || ''));
    }

    // Multi-Select Status Filter: OR within status group (AND across category and brand groups)
    if (selectedStatuses.length > 0) {
      result = result.filter((p) => {
        const isOut = p.current_stock_base <= 0;
        const isLow = p.is_low_stock && p.current_stock_base > 0;
        const isIn = p.current_stock_base > 0;
        return (
          (selectedStatuses.includes('OUT_OF_STOCK') && isOut) ||
          (selectedStatuses.includes('LOW_STOCK') && isLow) ||
          (selectedStatuses.includes('IN_STOCK') && isIn)
        );
      });
    }

    // Stock Tab Filter
    if (activeTab === 'IN_STOCK') {
      result = result.filter((p) => p.current_stock_base > 0);
    } else if (activeTab === 'LOW_STOCK') {
      result = result.filter((p) => p.is_low_stock && p.current_stock_base > 0);
    } else if (activeTab === 'OUT_OF_STOCK') {
      result = result.filter((p) => p.current_stock_base <= 0);
    }

    // Sorting
    result.sort((a, b) => {
      switch (sortBy) {
        case 'NAME_ASC':
          return a.name.localeCompare(b.name);
        case 'NAME_DESC':
          return b.name.localeCompare(a.name);
        case 'STOCK_DESC':
          return b.current_stock_base - a.current_stock_base;
        case 'STOCK_ASC':
          return a.current_stock_base - b.current_stock_base;
        case 'TP_DESC':
          return b.trade_price - a.trade_price;
        case 'MARGIN_DESC':
          return b.margin_percentage - a.margin_percentage;
        default:
          return 0;
      }
    });

    return result;
  }, [products, searchTerm, selectedCategories, selectedBrands, selectedStatuses, activeTab, sortBy]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    const totalCount = products.length;
    const inStockCount = products.filter((p) => p.current_stock_base > 0).length;
    const lowStockCount = products.filter((p) => p.is_low_stock).length;
    const outOfStockCount = products.filter((p) => p.current_stock_base <= 0).length;

    let totalValuationPaisas = 0;
    let totalCartons = 0;
    let totalBoxes = 0;

    products.forEach((p) => {
      const stock = p.current_stock_base || 0;
      const bpc = Math.max(1, p.boxes_per_carton || 1);
      const ppb = Math.max(1, p.pieces_per_box || 1);
      const ppc = Math.max(1, p.total_pieces_per_carton || (bpc * ppb));

      totalCartons += Math.floor(stock / ppc);
      totalBoxes += Math.floor((stock % ppc) / ppb);
      totalValuationPaisas += (p.trade_price || 0) * (stock / ppc);
    });

    return {
      totalCount,
      inStockCount,
      lowStockCount,
      outOfStockCount,
      totalValuation: Math.round(totalValuationPaisas),
      totalCartons,
      totalBoxes,
    };
  }, [products]);

  const categoryFilterOptions = useMemo(() => categories.map((c) => ({
    value: c.id,
    label: c.name,
    badge: `${c.product_count || 0} items`,
    badgeColor: 'emerald' as const,
    keywords: [c.name],
  })), [categories]);

  const brandFilterOptions = useMemo(() => brands.map((b) => ({
    value: b.id,
    label: b.name,
    badge: `${b.product_count || 0} items`,
    badgeColor: 'blue' as const,
    keywords: [b.name],
  })), [brands]);

  const categorySelectOptions = useMemo(() => [
    { value: '', label: 'Select Category...' },
    ...categories.map((c) => ({
      value: c.id,
      label: c.name,
      keywords: [c.name],
    })),
  ], [categories]);

  const brandSelectOptions = useMemo(() => [
    { value: '', label: 'Select Company/Brand...' },
    ...brands.map((b) => ({
      value: b.id,
      label: b.name,
      keywords: [b.name],
    })),
  ], [brands]);

  const statusFilterOptions = useMemo(() => [
    { value: 'IN_STOCK', label: 'In Stock', badge: `${metrics.inStockCount}`, badgeColor: 'emerald' as const },
    { value: 'LOW_STOCK', label: 'Low Stock', badge: `${metrics.lowStockCount}`, badgeColor: 'amber' as const },
    { value: 'OUT_OF_STOCK', label: 'Out of Stock', badge: `${metrics.outOfStockCount}`, badgeColor: 'rose' as const },
  ], [metrics]);

  const catReassignOptions = useMemo(() => {
    if (!catReassignSource) return [];
    return categories
      .filter((c) => c.id !== catReassignSource.id)
      .map((c) => ({
        value: c.id,
        label: c.name,
        badge: `${c.product_count || 0} items`,
        badgeColor: 'emerald' as const,
        keywords: [c.name],
      }));
  }, [categories, catReassignSource]);

  const brandReassignOptions = useMemo(() => {
    if (!brandReassignSource) return [];
    return brands
      .filter((b) => b.id !== brandReassignSource.id)
      .map((b) => ({
        value: b.id,
        label: b.name,
        badge: `${b.product_count || 0} items`,
        badgeColor: 'blue' as const,
        keywords: [b.name],
      }));
  }, [brands, brandReassignSource]);

  const pagination = usePagination(filteredProducts);

  return (
    <ListPageContainer className="space-y-3.5">
      {/* Top Header & Master Action Buttons */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-1 border-b border-[var(--border-subtle)]">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-slate-900 text-white dark:bg-emerald-600">
              <Package className="w-4 h-4" />
            </div>
            <h1 className="text-lg font-bold tracking-tight text-[var(--text-heading)]">
              Products & Pricing
            </h1>
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-medium">
              <span className="numeric-text font-bold">{products.length}</span> SKUs
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCategoryModal(true)}
            icon={<FolderTree className="w-3.5 h-3.5 text-[var(--color-primary)]" />}
            title="Manage Categories"
          >
            Categories ({categories.length})
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowBrandModal(true)}
            icon={<Building2 className="w-3.5 h-3.5 text-[var(--color-secondary)]" />}
            title="Manage Companies / Brands"
          >
            Brands ({brands.length})
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={openAddProductModal}
            icon={<Plus className="w-3.5 h-3.5" />}
          >
            Add Product
          </Button>

          <IconButton
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            loading={refreshing}
            title="Refresh Catalog"
            aria-label="Refresh Catalog"
            icon={<RefreshCw className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />}
          />
        </div>
      </div>

      {/* Global Status Banner */}
      {statusMessage && (
        <div
          className={`p-2.5 rounded-md border text-xs flex items-center justify-between shadow-xs animate-in fade-in duration-150 ${
            statusMessage.isError
              ? 'bg-rose-50/80 border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:border-rose-900/60 dark:text-rose-300'
              : 'bg-emerald-50/80 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-900/60 dark:text-emerald-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMessage.isError ? (
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            )}
            <span className="font-medium">{statusMessage.text}</span>
          </div>
          <button
            onClick={() => setStatusMessage(null)}
            className="text-slate-400 hover:text-slate-600 p-0.5"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}



      {/* Filter, Search & Tabs Toolbar - Streamlined & Professional */}
      <div className="filter-section-card p-3.5 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 pb-2.5 border-b border-slate-200/80 dark:border-slate-800">
          {/* Status Tabs */}
          <div className="inline-flex items-center bg-slate-200/70 dark:bg-slate-800/90 p-0.5 rounded-lg text-xs font-medium overflow-x-auto">
            <button
              onClick={() => setActiveTab('ALL')}
              className={`px-3 py-1.5 rounded-md transition-all whitespace-nowrap ${
                activeTab === 'ALL'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              All ({metrics.totalCount})
            </button>
            <button
              onClick={() => setActiveTab('IN_STOCK')}
              className={`px-3 py-1.5 rounded-md transition-all whitespace-nowrap ${
                activeTab === 'IN_STOCK'
                  ? 'bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-400 shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              In Stock ({metrics.inStockCount})
            </button>
            <button
              onClick={() => setActiveTab('LOW_STOCK')}
              className={`px-3 py-1.5 rounded-md transition-all whitespace-nowrap ${
                activeTab === 'LOW_STOCK'
                  ? 'bg-white dark:bg-slate-700 text-amber-700 dark:text-amber-400 shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Low Stock ({metrics.lowStockCount})
            </button>
            <button
              onClick={() => setActiveTab('OUT_OF_STOCK')}
              className={`px-3 py-1.5 rounded-md transition-all whitespace-nowrap ${
                activeTab === 'OUT_OF_STOCK'
                  ? 'bg-white dark:bg-slate-700 text-rose-700 dark:text-rose-400 shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Out of Stock ({metrics.outOfStockCount})
            </button>
          </div>

          {/* Result counter */}
          <div className="text-xs text-slate-600 dark:text-slate-400 self-end lg:self-auto font-medium flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>Showing <strong className="font-bold text-slate-900 dark:text-slate-100">{filteredProducts.length}</strong> of {products.length} products</span>
          </div>
        </div>

        {/* Search & Multi-Filters Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5">
          {/* Search Box */}
          <div className="relative lg:col-span-3">
            <label className="sr-only">Search Products</label>
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search SKU, Product, Brand..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="filter-input-control w-full rounded-lg pl-9 pr-7 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 transition-all outline-none focus:ring-1 focus:ring-blue-500"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                title="Clear search"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Category Filter (Multi-Select) */}
          <div className="lg:col-span-3">
            <label className="sr-only">Category Filter</label>
            <SearchableSelect
              mode="multiple"
              options={categoryFilterOptions}
              value={selectedCategories}
              onChange={(vals) => setSelectedCategories(vals)}
              placeholder="All Categories"
              className="w-full"
            />
          </div>

          {/* Brand Filter (Multi-Select) */}
          <div className="lg:col-span-2">
            <label className="sr-only">Brand Filter</label>
            <SearchableSelect
              mode="multiple"
              options={brandFilterOptions}
              value={selectedBrands}
              onChange={(vals) => setSelectedBrands(vals)}
              placeholder="All Brands"
              className="w-full"
            />
          </div>

          {/* Status Filter (Multi-Select) */}
          <div className="lg:col-span-2">
            <label className="sr-only">Status Filter</label>
            <SearchableSelect
              mode="multiple"
              options={statusFilterOptions}
              value={selectedStatuses}
              onChange={(vals) => setSelectedStatuses(vals)}
              placeholder="All Statuses"
              className="w-full"
            />
          </div>

          {/* Sort By */}
          <div className="lg:col-span-2">
            <label className="sr-only">Sort By</label>
            <SearchableSelect
              value={sortBy}
              onChange={(val) => setSortBy(val as SortOption)}
              options={sortOptions}
              placeholder="Sort By"
              searchPlaceholder="Search sort..."
              size="sm"
            />
          </div>
        </div>
      </div>

      {/* Products Master Data Table - Clean, Compact ERP View */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-lg overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/90 dark:bg-slate-900/60 border-b border-[var(--border-subtle)] text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider select-none">
                <th className="py-2.5 px-3 whitespace-nowrap">SKU / Barcode</th>
                <th className="py-2.5 px-3 min-w-[200px]">Product & Brand</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Category</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Packaging (3-Tier)</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Godown Stock</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">Reorder</th>
                {!maskCostForSalesman && <th className="py-2.5 px-3 text-right whitespace-nowrap">Cost / PCS</th>}
                <th className="py-2.5 px-3 text-right whitespace-nowrap">TP / PCS</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">MRP / PCS</th>
                {!maskCostForSalesman && <th className="py-2.5 px-3 text-center whitespace-nowrap">Margin</th>}
                <th className="py-2.5 px-3 text-center whitespace-nowrap">Status</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {loading ? (
                <tr>
                  <td colSpan={12} className="text-center py-10 text-[var(--text-muted)]">
                    <div className="flex flex-col items-center gap-2">
                      <RefreshCw className="w-5 h-5 animate-spin text-[var(--primary)]" />
                      <span className="text-xs">Loading products catalog...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={12} className="text-center py-10 text-[var(--text-muted)]">
                    <div className="flex flex-col items-center gap-1.5">
                      <PackageX className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                      <p className="font-semibold text-xs text-slate-700 dark:text-slate-300">No products found</p>
                      <p className="text-[11px] text-slate-400">Try adjusting your filters or search terms.</p>
                      <button onClick={openAddProductModal} className="mt-2 h-7 px-2.5 text-xs rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 font-medium inline-flex items-center gap-1">
                        <Plus className="w-3 h-3" /> Add Product
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                pagination.paginatedItems.map((p: any) => {
                  const isOut = p.current_stock_base <= 0;
                  const isLow = p.is_low_stock && !isOut;

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                      {/* SKU & Barcode */}
                      <td className="py-2 px-3 align-middle whitespace-nowrap">
                        <span className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">
                          {p.sku}
                        </span>
                        {p.barcode && (
                          <span className="block font-mono text-[10px] text-slate-400 leading-tight">
                            {p.barcode}
                          </span>
                        )}
                      </td>

                      {/* Product Name & Brand */}
                      <td className="py-2 px-3 align-middle max-w-[240px]">
                        <div className="font-medium text-xs text-slate-900 dark:text-slate-100 truncate" title={p.name}>
                          {p.name}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate">
                          {p.brand_name || 'Generic'}
                        </div>
                      </td>

                      {/* Category */}
                      <td className="py-2 px-3 align-middle whitespace-nowrap">
                        <span className="text-xs text-slate-600 dark:text-slate-400">
                          {p.category_name}
                        </span>
                      </td>

                      {/* 3-Tier Packaging Ratio */}
                      <td className="py-2 px-3 align-middle whitespace-nowrap">
                        <div className="tabular-nums text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                          {p.packaging_ratio || formatPackagingRatio(p.boxes_per_carton, p.pieces_per_box)}
                        </div>
                        <span className="text-[10px] text-slate-400 block leading-tight tabular-nums">
                          {formatInteger(p.total_pieces_per_carton || (p.boxes_per_carton * p.pieces_per_box))} pcs/ctn
                        </span>
                      </td>

                      {/* Current Stock Breakdown (CTN / BOX / PCS) */}
                      <td className="py-2 px-3 align-middle whitespace-nowrap">
                        <div className="tabular-nums text-xs text-slate-800 dark:text-slate-200 font-medium">
                          <span className="text-blue-600 dark:text-blue-400 font-semibold">{formatInteger(p.stock_cartons)}</span>
                          <span className="text-[10px] text-slate-400 ml-0.5 mr-1.5 font-normal">CTN</span>
                          <span className="text-amber-600 dark:text-amber-400 font-semibold">{formatInteger(p.stock_boxes)}</span>
                          <span className="text-[10px] text-slate-400 ml-0.5 mr-1.5 font-normal">BOX</span>
                          <span className="text-slate-600 dark:text-slate-400 font-semibold">{formatInteger(p.stock_pieces)}</span>
                          <span className="text-[10px] text-slate-400 ml-0.5 font-normal">PCS</span>
                        </div>
                        <span className="text-[10px] text-slate-400 block leading-tight tabular-nums">
                          {formatInteger(p.current_stock_base)} {p.uom_base}s total
                        </span>
                      </td>

                      {/* Reorder Level */}
                      <td className="py-2 px-3 align-middle text-right tabular-nums text-xs text-slate-500 whitespace-nowrap">
                        {formatInteger(p.min_stock_alert)}
                      </td>

                      {/* Cost Price */}
                      {!maskCostForSalesman && (
                        <td className="py-2 px-3 align-middle text-right tabular-nums text-xs text-slate-500 whitespace-nowrap">
                          {formatCurrency(p.cost_price)}
                        </td>
                      )}

                      {/* Trade Price (TP) */}
                      <td className="py-2 px-3 align-middle text-right tabular-nums text-xs font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        {formatCurrency(p.trade_price)}
                      </td>

                      {/* Retail Price (MRP) */}
                      <td className="py-2 px-3 align-middle text-right tabular-nums text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {formatCurrency(p.mrp)}
                      </td>

                      {/* Margin % */}
                      {!maskCostForSalesman && (
                        <td className="py-2 px-3 align-middle text-center tabular-nums text-xs whitespace-nowrap">
                          <span
                            className={`font-semibold ${
                              p.margin_percentage >= 15
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : p.margin_percentage > 0
                                ? 'text-blue-600 dark:text-blue-400'
                                : 'text-rose-600 dark:text-rose-400'
                            }`}
                          >
                            {formatPercentage(p.margin_percentage, 1)}
                          </span>
                        </td>
                      )}

                      {/* Status */}
                      <td className="py-2 px-3 align-middle text-center whitespace-nowrap">
                        {isOut ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                            Out
                          </span>
                        ) : isLow ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-900/50">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                            Low
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            In Stock
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-2 px-3 align-middle text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openAdjustStockModal(p)}
                            className="p-1 rounded text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="Adjust Inventory Balance"
                          >
                            <ArrowRightLeft className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => openEditProductModal(p)}
                            className="p-1 rounded text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="Edit Product Master"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        <PaginationControls {...pagination} />
      </div>

      {/* ========================================================================= */}
      {/* ADD / EDIT PRODUCT MODAL (Clean, Compact, Structured) */}
      {/* ========================================================================= */}
      {(showAddModal || showEditModal) && (
        <div className="modal-backdrop fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-3 overflow-y-auto">
          <div className="modal-content bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg shadow-xl max-w-xl w-full p-4 space-y-3.5 animate-in fade-in zoom-in-95 duration-150 my-6">
            <div className="flex justify-between items-center border-b border-[var(--border-subtle)] pb-2.5">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-emerald-600" />
                <h3 className="font-semibold text-sm text-[var(--text-heading)]">
                  {showEditModal ? 'Edit Product & Packaging Master' : 'Add New Product to Catalog'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAddModal(false);
                  setShowEditModal(false);
                }}
                className="text-slate-400 hover:text-slate-600 p-0.5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={showEditModal ? handleUpdateProduct : handleCreateProduct} className="space-y-3">
              {/* Section 1: Basic Identifiers */}
              <div className="space-y-2.5">
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Product Identification</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                      SKU Code *
                    </label>
                    <input
                      type="text"
                      className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] focus:border-emerald-500 rounded px-2.5 py-1 font-mono text-xs text-[var(--text-primary)] outline-none"
                      value={sku}
                      onChange={(e) => setSku(e.target.value.toUpperCase())}
                      required
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                      Barcode / EAN
                    </label>
                    <input
                      type="text"
                      className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] focus:border-emerald-500 rounded px-2.5 py-1 font-mono text-xs text-[var(--text-primary)] outline-none"
                      value={barcode}
                      onChange={(e) => setBarcode(e.target.value)}
                      placeholder="Optional"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                      Min Stock Alert
                    </label>
                    <input
                      type="number"
                      min="0"
                      className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] focus:border-emerald-500 rounded px-2.5 py-1 text-xs text-[var(--text-primary)] numeric-text input-numeric outline-none"
                      value={minStockAlert}
                      onChange={(e) => setMinStockAlert(Number(e.target.value))}
                      placeholder="12"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                    Product Title *
                  </label>
                  <input
                    type="text"
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] focus:border-emerald-500 rounded px-2.5 py-1 text-xs text-[var(--text-primary)] outline-none"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Olpers Full Cream Milk 1000ml"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                      Product Category *
                    </label>
                    <SearchableSelect
                      options={categorySelectOptions}
                      value={categoryId}
                      onChange={(val) => setCategoryId(val)}
                      placeholder="Select Category..."
                      className="w-full"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                      Brand Principle *
                    </label>
                    <SearchableSelect
                      options={brandSelectOptions}
                      value={brandId}
                      onChange={(val) => setBrandId(val)}
                      placeholder="Select Company/Brand..."
                      className="w-full"
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: 3-Tier Packaging Ratio */}
              <div className="p-2.5 bg-slate-50 dark:bg-slate-900/60 border border-[var(--border-subtle)] rounded-md space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Boxes className="w-3.5 h-3.5 text-emerald-600" />
                    3-Tier Packaging Configuration
                  </span>
                  <span className="text-[10px] text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-900/50 font-medium">
                    Base: Piece (PCS)
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] text-slate-600 dark:text-slate-400 mb-0.5">
                      Boxes / Carton (Outer → Middle)
                    </label>
                    <input
                      type="number"
                      min="1"
                      className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded px-2.5 py-1 font-mono text-xs text-[var(--text-primary)] outline-none"
                      value={boxesPerCarton}
                      onChange={(e) => setBoxesPerCarton(Math.max(1, Number(e.target.value) || 1))}
                      required
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-600 dark:text-slate-400 mb-0.5">
                      Pieces / Box (Middle → Base)
                    </label>
                    <input
                      type="number"
                      min="1"
                      className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded px-2.5 py-1 font-mono text-xs text-[var(--text-primary)] outline-none"
                      value={piecesPerBox}
                      onChange={(e) => setPiecesPerBox(Math.max(1, Number(e.target.value) || 1))}
                      required
                    />
                  </div>
                </div>

                <div className="p-1.5 bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs">
                  <span className="text-[11px] text-slate-500">Calculated Ratio:</span>
                  <div className="font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                    1 CTN = {boxesPerCarton} BOX = {calculatedPiecesPerCarton} PCS
                  </div>
                </div>
              </div>

              {/* Section 3: Pricing Tiers & Profit Margin */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Pricing</span>
                  {tradePrice && (
                    <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                      Estimated Margin: {calculatedMargin}%
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                      Purchase Cost / PCS *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] focus:border-emerald-500 rounded px-2.5 py-1 text-xs text-[var(--text-primary)] numeric-text input-numeric outline-none"
                      value={costPrice}
                      onChange={(e) => setCostPrice(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="0.00"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                      TP / PCS *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] focus:border-emerald-500 rounded px-2.5 py-1 text-xs text-[var(--text-primary)] numeric-text input-numeric outline-none"
                      value={tradePrice}
                      onChange={(e) => setTradePrice(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="0.00"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                      MRP / PCS *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] focus:border-emerald-500 rounded px-2.5 py-1 text-xs text-[var(--text-primary)] numeric-text input-numeric outline-none"
                      value={mrp}
                      onChange={(e) => setMrp(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="0.00"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Section 4: Initial Opening Stock (Only on Add Product) */}
              {!showEditModal && (
                <div className="p-2.5 bg-slate-50 dark:bg-slate-900/60 border border-[var(--border-subtle)] rounded-md space-y-1.5">
                  <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    Opening Stock in Godown (CTN • BOX • PCS)
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[10px] text-slate-500 mb-0.5">Cartons (CTN)</label>
                      <input
                        type="number"
                        min="0"
                        className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded px-2 py-1 text-xs text-[var(--text-primary)] numeric-text input-numeric outline-none"
                        value={initialCartons}
                        onChange={(e) => setInitialCartons(e.target.value === '' ? '' : Number(e.target.value))}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500 mb-0.5">Boxes (BOX)</label>
                      <input
                        type="number"
                        min="0"
                        className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded px-2 py-1 text-xs text-[var(--text-primary)] numeric-text input-numeric outline-none"
                        value={initialBoxes}
                        onChange={(e) => setInitialBoxes(e.target.value === '' ? '' : Number(e.target.value))}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500 mb-0.5">Pieces (PCS)</label>
                      <input
                        type="number"
                        min="0"
                        className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded px-2 py-1 text-xs text-[var(--text-primary)] numeric-text input-numeric outline-none"
                        value={initialPieces}
                        onChange={(e) => setInitialPieces(e.target.value === '' ? '' : Number(e.target.value))}
                      />
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-500 numeric-text tabular-nums flex items-center justify-between pt-0.5">
                    <span>Equivalent Base Quantity:</span>
                    <strong className="text-slate-900 dark:text-slate-100">
                      {formatInteger(calculatedOpeningPieces)} Pieces
                    </strong>
                  </div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-300 numeric-text tabular-nums flex items-center justify-between pt-1 border-t border-slate-200 dark:border-slate-700">
                    <span>Opening Valuation:</span>
                    <strong className="text-emerald-700 dark:text-emerald-400 tabular-nums">
                      {formatInteger(calculatedOpeningPieces)} PCS × {formatCurrency(Number(costPrice) || 0)} = {formatCurrency(calculatedOpeningValuation)}
                    </strong>
                  </div>
                </div>
              )}

              {/* Footer Buttons */}
              <div className="flex justify-end items-center gap-2 pt-2 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setShowEditModal(false);
                  }}
                  className="h-8 px-3 text-xs rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="h-8 px-3.5 text-xs font-medium rounded bg-[var(--primary)] text-[var(--bg-surface)] hover:opacity-90 flex items-center gap-1.5 transition-opacity"
                >
                  {submitting && <RefreshCw className="w-3 h-3 animate-spin" />}
                  {showEditModal ? 'Update Product' : 'Save Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STOCK ADJUSTMENT MODAL (Compact & Clean) */}
      {/* ========================================================================= */}
      {showAdjustModal && selectedProduct && (
        <div className="modal-backdrop fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="modal-content bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg shadow-xl max-w-md w-full p-4 space-y-3.5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center border-b border-[var(--border-subtle)] pb-2.5">
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4 text-blue-600" />
                <h3 className="font-semibold text-sm text-[var(--text-heading)]">Adjust Physical Stock Balance</h3>
              </div>
              <button onClick={() => setShowAdjustModal(false)} className="text-slate-400 hover:text-slate-600 p-0.5">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Product Summary Banner */}
            <div className="p-2.5 bg-slate-50 dark:bg-slate-900/60 border border-[var(--border-subtle)] rounded-md">
              <div className="font-medium text-xs text-slate-900 dark:text-slate-100">{selectedProduct.name}</div>
              <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono mt-0.5">
                <span>SKU: {selectedProduct.sku}</span>
                <span>•</span>
                <span>Current: <strong className="text-slate-800 dark:text-slate-200">{selectedProduct.formatted_stock}</strong></span>
              </div>
            </div>

            <form onSubmit={handleStockAdjustment} className="space-y-3">
              {/* Type: Increase or Decrease */}
              <div>
                <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">Adjustment Direction</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAdjustType('INCREASE')}
                    className={`p-2 rounded border text-xs font-medium flex items-center justify-center gap-1.5 transition-all ${
                      adjustType === 'INCREASE'
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                        : 'bg-[var(--bg-surface)] border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                    }`}
                  >
                    <Plus className="w-3.5 h-3.5 text-emerald-600" />
                    Stock In (Increase)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustType('DECREASE')}
                    className={`p-2 rounded border text-xs font-medium flex items-center justify-center gap-1.5 transition-all ${
                      adjustType === 'DECREASE'
                        ? 'bg-rose-50 border-rose-500 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300'
                        : 'bg-[var(--bg-surface)] border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                    }`}
                  >
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                    Stock Out (Loss/Damage)
                  </button>
                </div>
              </div>

              {/* 3-Tier Quantity Inputs */}
              <div>
                <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Adjustment Quantities (CTN • BOX • PCS)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-500 mb-0.5">Cartons</label>
                    <input
                      type="number"
                      min="0"
                      className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded px-2 py-1 text-xs text-[var(--text-primary)] numeric-text input-numeric outline-none"
                      value={adjustCartons}
                      onChange={(e) => setAdjustCartons(e.target.value === '' ? '' : Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 mb-0.5">Boxes</label>
                    <input
                      type="number"
                      min="0"
                      className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded px-2 py-1 text-xs text-[var(--text-primary)] numeric-text input-numeric outline-none"
                      value={adjustBoxes}
                      onChange={(e) => setAdjustBoxes(e.target.value === '' ? '' : Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 mb-0.5">Pieces</label>
                    <input
                      type="number"
                      min="0"
                      className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded px-2 py-1 text-xs text-[var(--text-primary)] numeric-text input-numeric outline-none"
                      value={adjustPieces}
                      onChange={(e) => setAdjustPieces(e.target.value === '' ? '' : Number(e.target.value))}
                    />
                  </div>
                </div>

                <div className="text-[11px] text-slate-500 numeric-text tabular-nums mt-1.5 bg-slate-50 dark:bg-slate-900/60 p-1.5 rounded border border-[var(--border-subtle)] flex justify-between">
                  <span>Equivalent Base Pieces:</span>
                  <strong className="text-slate-900 dark:text-slate-100">
                    {toBasePieces(
                      Number(adjustCartons) || 0,
                      Number(adjustBoxes) || 0,
                      Number(adjustPieces) || 0,
                      selectedProduct.boxes_per_carton,
                      selectedProduct.pieces_per_box
                    )}{' '}
                    Pieces
                  </strong>
                </div>
              </div>

              {/* Reason */}
              <div>
                <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">Reason / Memo</label>
                <input
                  type="text"
                  className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] focus:border-emerald-500 rounded px-2.5 py-1 text-xs text-[var(--text-primary)] outline-none"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="e.g. Physical inventory count variance"
                  required
                />
              </div>

              {/* Submit Buttons */}
              <div className="flex justify-end items-center gap-2 pt-2 border-t border-[var(--border-subtle)]">
                <button type="button" onClick={() => setShowAdjustModal(false)} className="h-8 px-3 text-xs rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="h-8 px-3.5 text-xs font-medium rounded bg-[var(--primary)] text-[var(--bg-surface)] hover:opacity-90 flex items-center gap-1.5 transition-opacity">
                  {submitting && <RefreshCw className="w-3 h-3 animate-spin" />}
                  Confirm Adjustment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CATEGORY MANAGEMENT MODAL */}
      {/* ========================================================================= */}
      {showCategoryModal && (
        <div className="modal-backdrop fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="modal-content bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg shadow-xl max-w-lg w-full p-4 space-y-3 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center border-b border-[var(--border-subtle)] pb-2.5">
              <div className="flex items-center gap-2">
                <FolderTree className="w-4 h-4 text-emerald-600" />
                <h3 className="font-semibold text-sm text-[var(--text-heading)]">Product Category Management</h3>
              </div>
              <button onClick={() => setShowCategoryModal(false)} className="text-slate-400 hover:text-slate-600 p-0.5">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Reassignment Warning Modal if trying to delete category with products */}
            {catReassignSource && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-900 rounded-md space-y-2 text-xs">
                <div className="flex items-center gap-1.5 text-amber-900 dark:text-amber-300 font-semibold">
                  <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Cannot Delete Directly: {catReassignSource.product_count} Products Assigned</span>
                </div>
                <p className="text-amber-800 dark:text-amber-400">
                  Category &quot;{catReassignSource.name}&quot; has {catReassignSource.product_count} linked products. Select a destination category to reassign them:
                </p>
                <div>
                  <label className="text-[11px] font-medium text-slate-700 dark:text-slate-300 mb-0.5">Reassign to:</label>
                  <SearchableSelect
                    options={catReassignOptions}
                    value={catReassignTargetId}
                    onChange={(val) => setCatReassignTargetId(val)}
                    placeholder="Select destination category..."
                    className="w-full"
                  />
                </div>
                <div className="flex justify-end gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => setCatReassignSource(null)}
                    className="h-7 px-2.5 text-xs rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleReassignAndDeleteCategory}
                    className="h-7 px-2.5 text-xs rounded bg-rose-600 text-white hover:bg-rose-700 transition-colors font-medium"
                  >
                    Reassign & Delete
                  </button>
                </div>
              </div>
            )}

            {/* Add / Edit Category Form */}
            {!catReassignSource && (
              <form onSubmit={handleCreateOrUpdateCategory} className="p-2.5 bg-slate-50 dark:bg-slate-900/60 border border-[var(--border-subtle)] rounded-md space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    {editingCatId ? 'Edit Category' : 'Add New Category'}
                  </span>
                  {editingCatId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCatId(null);
                        setCatName('');
                        setCatDesc('');
                      }}
                      className="text-[11px] text-slate-500 hover:text-slate-800"
                    >
                      Cancel Edit
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] focus:border-emerald-500 rounded px-2.5 py-1 text-xs text-[var(--text-primary)] outline-none"
                    placeholder="Category Name *"
                    value={catName}
                    onChange={(e) => setCatName(e.target.value)}
                    required
                  />
                  <input
                    type="text"
                    className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] focus:border-emerald-500 rounded px-2.5 py-1 text-xs text-[var(--text-primary)] outline-none"
                    placeholder="Description (Optional)"
                    value={catDesc}
                    onChange={(e) => setCatDesc(e.target.value)}
                  />
                </div>

                <div className="flex justify-end">
                  <button type="submit" className="h-7 px-3 text-xs font-medium rounded bg-[var(--primary)] text-[var(--bg-surface)] hover:opacity-90 transition-opacity">
                    {editingCatId ? 'Update Category' : 'Add Category'}
                  </button>
                </div>
              </form>
            )}

            {/* Category List */}
            <div className="max-h-56 overflow-y-auto border border-[var(--border-subtle)] rounded-md divide-y divide-[var(--border-subtle)]">
              {categories.map((c) => (
                <div key={c.id} className="p-2 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/40 text-xs transition-colors">
                  <div>
                    <div className="font-medium text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                      <span>{c.name}</span>
                      <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 px-1.5 py-0.2 rounded font-mono">
                        {c.product_count} SKUs
                      </span>
                    </div>
                    {c.description && <p className="text-[10px] text-slate-400 mt-0.5">{c.description}</p>}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCatId(c.id);
                        setCatName(c.name);
                        setCatDesc(c.description || '');
                      }}
                      className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                      title="Edit Category"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteCategory(c)}
                      className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                      title="Delete Category"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-1">
              <button type="button" onClick={() => setShowCategoryModal(false)} className="h-7 px-3 text-xs rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* BRAND / COMPANY MANAGEMENT MODAL */}
      {/* ========================================================================= */}
      {showBrandModal && (
        <div className="modal-backdrop fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="modal-content bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg shadow-xl max-w-lg w-full p-4 space-y-3 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center border-b border-[var(--border-subtle)] pb-2.5">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-indigo-600" />
                <h3 className="font-semibold text-sm text-[var(--text-heading)]">Company / Brand Management</h3>
              </div>
              <button onClick={() => setShowBrandModal(false)} className="text-slate-400 hover:text-slate-600 p-0.5">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Reassignment Warning Modal if trying to delete brand with products */}
            {brandReassignSource && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-900 rounded-md space-y-2 text-xs">
                <div className="flex items-center gap-1.5 text-amber-900 dark:text-amber-300 font-semibold">
                  <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Cannot Delete Directly: {brandReassignSource.product_count} Products Assigned</span>
                </div>
                <p className="text-amber-800 dark:text-amber-400">
                  Brand &quot;{brandReassignSource.name}&quot; has {brandReassignSource.product_count} linked products. Select a destination brand to reassign them:
                </p>
                <div>
                  <label className="text-[11px] font-medium text-slate-700 dark:text-slate-300 mb-0.5">Reassign to:</label>
                  <SearchableSelect
                    options={brandReassignOptions}
                    value={brandReassignTargetId}
                    onChange={(val) => setBrandReassignTargetId(val)}
                    placeholder="Select destination brand..."
                    className="w-full"
                  />
                </div>
                <div className="flex justify-end gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => setBrandReassignSource(null)}
                    className="h-7 px-2.5 text-xs rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleReassignAndDeleteBrand}
                    className="h-7 px-2.5 text-xs rounded bg-rose-600 text-white hover:bg-rose-700 transition-colors font-medium"
                  >
                    Reassign & Delete
                  </button>
                </div>
              </div>
            )}

            {/* Add / Edit Brand Form */}
            {!brandReassignSource && (
              <form onSubmit={handleCreateOrUpdateBrand} className="p-2.5 bg-slate-50 dark:bg-slate-900/60 border border-[var(--border-subtle)] rounded-md space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    {editingBrandId ? 'Edit Company / Brand' : 'Add New Company / Brand'}
                  </span>
                  {editingBrandId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingBrandId(null);
                        setBrandName('');
                        setBrandDesc('');
                      }}
                      className="text-[11px] text-slate-500 hover:text-slate-800"
                    >
                      Cancel Edit
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] focus:border-emerald-500 rounded px-2.5 py-1 text-xs text-[var(--text-primary)] outline-none"
                    placeholder="Brand Name *"
                    value={brandName}
                    onChange={(e) => setBrandName(e.target.value)}
                    required
                  />
                  <input
                    type="text"
                    className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] focus:border-emerald-500 rounded px-2.5 py-1 text-xs text-[var(--text-primary)] outline-none"
                    placeholder="Description (Optional)"
                    value={brandDesc}
                    onChange={(e) => setBrandDesc(e.target.value)}
                  />
                </div>

                <div className="flex justify-end">
                  <button type="submit" className="h-7 px-3 text-xs font-medium rounded bg-[var(--primary)] text-[var(--bg-surface)] hover:opacity-90 transition-opacity">
                    {editingBrandId ? 'Update Brand' : 'Add Brand'}
                  </button>
                </div>
              </form>
            )}

            {/* Brand List */}
            <div className="max-h-56 overflow-y-auto border border-[var(--border-subtle)] rounded-md divide-y divide-[var(--border-subtle)]">
              {brands.map((b) => (
                <div key={b.id} className="p-2 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/40 text-xs transition-colors">
                  <div>
                    <div className="font-medium text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                      <span>{b.name}</span>
                      <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 px-1.5 py-0.2 rounded font-mono">
                        {b.product_count} SKUs
                      </span>
                    </div>
                    {b.description && <p className="text-[10px] text-slate-400 mt-0.5">{b.description}</p>}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingBrandId(b.id);
                        setBrandName(b.name);
                        setBrandDesc(b.description || '');
                      }}
                      className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                      title="Edit Brand"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteBrand(b)}
                      className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                      title="Delete Brand"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-1">
              <button type="button" onClick={() => setShowBrandModal(false)} className="h-7 px-3 text-xs rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </ListPageContainer>
  );
}
