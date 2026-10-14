'use client';

import { useState, useEffect, useCallback, useMemo, useDeferredValue } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { buildShopStock } from '@/hooks/useOdooProducts';
import { recordAuditLog } from '@/lib/audit';
import {
  Plus, Search, Edit2, ToggleLeft, ToggleRight,
  ArrowLeft, Loader2, Package, X, Save, AlertCircle,
  CheckCircle2, RefreshCw, Tag, DollarSign, Barcode,
  Eye, Square, CheckSquare, MinusSquare, ArrowLeftRight, ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface OdooProduct {
  id: number;
  name: string;
  list_price: number;
  standard_price: number;
  pos_categ_ids: number[] | [number, string][];
  barcode: string | false;
  default_code: string | false;
  description_sale: string | false;
  available_in_pos: boolean;
}

interface OdooCategory {
  id: number;
  name: string;
}

interface ProductFormData {
  name: string;
  list_price: string;
  standard_price: string;
  barcode: string;
  description_sale: string;
  pos_categ_id: string;
}

interface TransferFormData {
  fromWarehouseId: string;
  toWarehouseId: string;
  qty: string;
}

const PAGE_SIZE = 50;

/** Thumbnail loaded lazily from Odoo; falls back to the initial when the product has no image */
function ProductThumb({ productId, name, sessionId }: { productId: number; name: string; sessionId: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!sessionId || failed) {
    return (
      <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center border border-border">
        <span className="text-sm font-bold text-muted-foreground">{name.charAt(0).toUpperCase()}</span>
      </div>
    );
  }
  return (
    <img
      src={`/api/odoo/image?session_id=${sessionId}&id=${productId}`}
      alt={name}
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-9 w-9 rounded-lg object-cover border border-border"
    />
  );
}

const emptyForm: ProductFormData = {
  name: '',
  list_price: '',
  standard_price: '',
  barcode: '',
  description_sale: '',
  pos_categ_id: '',
};

export default function ProductsPage() {
  const router = useRouter();
  const { sessionId, isAuthenticated, isLoading: authLoading, user } = useAuth();

  const [products, setProducts] = useState<OdooProduct[]>([]);
  const [categories, setCategories] = useState<OdooCategory[]>([]);
  const [stockData, setStockData] = useState<Parameters<typeof buildShopStock>[1] | null>(null);
  const [stockError, setStockError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showPOSOnly, setShowPOSOnly] = useState(false);

  // Selection & Bulk state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<OdooProduct | null>(null);
  const [form, setForm] = useState<ProductFormData>(emptyForm);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  // Stock transfer modal state
  const [transferProduct, setTransferProduct] = useState<OdooProduct | null>(null);
  const [transferForm, setTransferForm] = useState<TransferFormData>({ fromWarehouseId: '', toWarehouseId: '', qty: '' });
  const [transferError, setTransferError] = useState('');
  const [transferSuccess, setTransferSuccess] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push('/login');
  }, [authLoading, isAuthenticated, router]);

  const fetchData = useCallback(async () => {
    if (!sessionId) return;
    setIsLoading(true);
    try {
      const [prodRes, catRes, stockRes] = await Promise.all([
        fetch(`/api/odoo/products?session_id=${sessionId}&all=true&images=false`),
        fetch(`/api/odoo/categories?session_id=${sessionId}`),
        fetch(`/api/odoo/stock?session_id=${sessionId}`)
          .then((r) => r.json())
          .catch((err) => ({ error: err.message || 'Requête stock échouée' })),
      ]);
      const prodData = await prodRes.json();
      const catData = await catRes.json();
      if (prodData.success) setProducts(prodData.products || []);
      if (catData.success) setCategories(catData.categories || []);
      setStockData(stockRes?.success ? stockRes : null);
      setStockError(stockRes?.success ? '' : stockRes?.error || 'Réponse stock invalide');
    } catch (err) {
      console.error('Failed to fetch products', err);
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Filtering runs on the deferred query so typing stays responsive on large catalogues
  const deferredQuery = useDeferredValue(searchQuery);
  const filteredProducts = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    return products.filter((p) => {
      const matchesSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (typeof p.default_code === 'string' && p.default_code.toLowerCase().includes(q)) ||
        (typeof p.barcode === 'string' && p.barcode.toLowerCase().includes(q));
      const matchesPOS = !showPOSOnly || p.available_in_pos;
      return matchesSearch && matchesPOS;
    });
  }, [products, deferredQuery, showPOSOnly]);

  // Render the table in pages; rendering thousands of rows at once is what made the page slow
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [deferredQuery, showPOSOnly]);
  const visibleProducts = filteredProducts.slice(0, visibleCount);

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredProducts.length && filteredProducts.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredProducts.map((p) => p.id)));
    }
  };

  const openCreate = () => {
    setEditingProduct(null);
    setForm(emptyForm);
    setFormError('');
    setFormSuccess('');
    setModalOpen(true);
  };

  const openEdit = (product: OdooProduct) => {
    setEditingProduct(product);
    const catId = product.pos_categ_ids?.length > 0
      ? String(Array.isArray(product.pos_categ_ids[0]) ? product.pos_categ_ids[0][0] : product.pos_categ_ids[0])
      : '';
    setForm({
      name: product.name,
      list_price: String(product.list_price),
      standard_price: String(product.standard_price),
      barcode: typeof product.barcode === 'string' ? product.barcode : '',
      description_sale: typeof product.description_sale === 'string' ? product.description_sale : '',
      pos_categ_id: catId,
    });
    setFormError('');
    setFormSuccess('');
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');
    if (!form.name.trim() || !form.list_price) {
      setFormError('Product name and sale price are required.');
      return;
    }
    setIsSubmitting(true);
    try {
      if (editingProduct) {
        // Update
        const res = await fetch(`/api/odoo/products?session_id=${sessionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingProduct.id, ...form }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Update failed');
        await recordAuditLog({
          action: 'updated',
          entityType: 'product',
          entityName: form.name.trim(),
          actor: user?.name,
          details: `Produit #${editingProduct.id} modifie`,
        });
        setFormSuccess('Product updated successfully!');
        await fetchData();
        setTimeout(() => setModalOpen(false), 1000);
      } else {
        // Create
        const res = await fetch(`/api/odoo/products?session_id=${sessionId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Create failed');
        await recordAuditLog({
          action: 'created',
          entityType: 'product',
          entityName: form.name.trim(),
          actor: user?.name,
          details: 'Nouveau produit ajoute',
        });
        setFormSuccess('Product created successfully!');
        await fetchData();
        setTimeout(() => setModalOpen(false), 1000);
      }
    } catch (err: any) {
      setFormError(err.message || 'An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const togglePOSAccess = async (product: OdooProduct) => {
    setTogglingId(product.id);
    try {
      const res = await fetch(`/api/odoo/products?session_id=${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: product.id, available_in_pos: !product.available_in_pos }),
      });
      const data = await res.json();
      if (data.success) {
        await recordAuditLog({
          action: product.available_in_pos ? 'disabled' : 'enabled',
          entityType: 'product',
          entityName: product.name,
          actor: user?.name,
          details: product.available_in_pos ? 'Retire du POS' : 'Ajoute au POS',
        });
        setProducts((prev) =>
          prev.map((p) =>
            p.id === product.id ? { ...p, available_in_pos: !p.available_in_pos } : p
          )
        );
      }
    } catch (err) {
      console.error('Toggle failed', err);
    } finally {
      setTogglingId(null);
    }
  };

  const openTransfer = (product: OdooProduct) => {
    if (!stockData) return;
    // Default: send from the boutique with the most stock to the one with the least
    const sorted = [...buildShopStock(product.id, stockData)].sort((a, b) => b.qty - a.qty);
    setTransferProduct(product);
    setTransferForm({
      fromWarehouseId: String(sorted[0]?.warehouseId ?? ''),
      toWarehouseId: String(sorted[sorted.length - 1]?.warehouseId ?? ''),
      qty: '',
    });
    setTransferError('');
    setTransferSuccess('');
  };

  const canTransfer = !!stockData && stockData.warehouses.length > 1;
  const transferShops =transferProduct && stockData ? buildShopStock(transferProduct.id, stockData) : [];
  const transferFrom = transferShops.find((s) => String(s.warehouseId) === transferForm.fromWarehouseId);
  const transferTo = transferShops.find((s) => String(s.warehouseId) === transferForm.toWarehouseId);
  const transferQty = parseFloat(transferForm.qty) || 0;
  const transferInvalid =
    !transferFrom || !transferTo || transferFrom.warehouseId === transferTo.warehouseId ||
    transferQty <= 0 || transferQty > transferFrom.qty;

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferProduct || !transferFrom || !transferTo || transferInvalid) return;
    setTransferError('');
    setTransferSuccess('');
    setIsTransferring(true);
    try {
      const res = await fetch(`/api/odoo/stock/transfer?session_id=${sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: transferProduct.id,
          fromWarehouseId: transferFrom.warehouseId,
          toWarehouseId: transferTo.warehouseId,
          qty: transferQty,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Transfer failed');
      const refs = data.transfer.references.join(', ');
      await recordAuditLog({
        action: 'transferred',
        entityType: 'stock',
        entityName: transferProduct.name,
        actor: user?.name,
        details: `${transferQty} pièce(s) ${transferFrom.name} → ${transferTo.name} (${refs})`,
      });
      setTransferSuccess(`Transfert effectué (${refs})`);
      await fetchData();
      setTimeout(() => setTransferProduct(null), 1200);
    } catch (err: any) {
      setTransferError(err.message || 'An unexpected error occurred');
    } finally {
      setIsTransferring(false);
    }
  };

  const handleBulkTogglePOS = async (available: boolean) => {
    if (selectedIds.size === 0 || !sessionId) return;
    setIsBulkUpdating(true);
    const idsToUpdate = Array.from(selectedIds);
    try {
      const res = await fetch(`/api/odoo/products?session_id=${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: idsToUpdate, available_in_pos: available }),
      });
      const data = await res.json();
      if (data.success) {
        await recordAuditLog({
          action: available ? 'bulk-enabled' : 'bulk-disabled',
          entityType: 'product',
          entityName: `${idsToUpdate.length} produits`,
          actor: user?.name,
          details: `Mise a jour groupée de ${idsToUpdate.length} produits (POS: ${available})`,
        });
        setProducts((prev) =>
          prev.map((p) =>
            idsToUpdate.includes(p.id) ? { ...p, available_in_pos: available } : p
          )
        );
        setSelectedIds(new Set());
      }
    } catch (err) {
      console.error('Bulk update failed', err);
    } finally {
      setIsBulkUpdating(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <div className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-card px-6 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to POS
          </button>
          <div className="h-6 w-px bg-border" />
          <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Product Management
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/logs')}
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors"
          >
            <Eye className="h-4 w-4" />
            Logs
          </button>
          <button
            onClick={fetchData}
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Add Product
          </button>
        </div>
      </div>

      <div className="p-6 max-w-7xl mx-auto pb-32">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by name, internal reference or barcode..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border bg-card pl-10 pr-4 py-2.5 text-sm shadow-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            />
          </div>
          <button
            onClick={() => setShowPOSOnly(!showPOSOnly)}
            className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors ${
              showPOSOnly
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card text-muted-foreground hover:bg-muted border-border'
            }`}
          >
            {showPOSOnly ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
            POS Only
          </button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Total Products', value: products.length, color: 'text-foreground' },
            { label: 'Available in POS', value: products.filter((p) => p.available_in_pos).length, color: 'text-emerald-600' },
            { label: 'Hidden from POS', value: products.filter((p) => !p.available_in_pos).length, color: 'text-muted-foreground' },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Why stock transfer is unavailable */}
        {!isLoading && (stockError || (stockData && stockData.warehouses.length < 2)) && (
          <div className="mb-4 flex items-start gap-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            {stockError
              ? `Stock non chargé : ${stockError}`
              : `Boutiques trouvées dans Odoo : ${stockData!.warehouses.map((w) => w.name).join(', ') || 'aucune'}`}
          </div>
        )}

        {/* Global Selection Banner */}
        {selectedIds.size > 0 && selectedIds.size === filteredProducts.length && filteredProducts.length < products.length && (
          <div className="mb-4 rounded-lg bg-primary/10 border border-primary/20 p-3 text-center text-sm">
            Toute la sélection visible ({filteredProducts.length} produits) est sélectionnée.{' '}
            <button
              onClick={() => setSelectedIds(new Set(products.map((p) => p.id)))}
              className="font-bold text-primary hover:underline"
            >
              Sélectionner les {products.length} produits du catalogue
            </button>
          </div>
        )}

        {/* Products table */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading products from Odoo...</p>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
            <Package className="h-12 w-12 opacity-30" />
            <p className="font-medium">No products found</p>
            <button onClick={openCreate} className="text-sm text-primary underline">Add your first product</button>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-3 w-10 text-center">
                    <button
                      onClick={handleSelectAll}
                      className="inline-flex items-center justify-center p-1 rounded-md hover:bg-muted transition-colors"
                    >
                      {selectedIds.size === 0 ? (
                        <Square className="h-4 w-4 text-muted-foreground" />
                      ) : selectedIds.size === filteredProducts.length ? (
                        <CheckSquare className="h-4 w-4 text-primary" />
                      ) : (
                        <MinusSquare className="h-4 w-4 text-primary" />
                      )}
                    </button>
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground w-12"></th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Product</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground hidden lg:table-cell">Référence interne</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Sale Price</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Cost</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Stock</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground hidden md:table-cell">Barcode</th>
                  <th className="text-center px-4 py-3 font-semibold text-muted-foreground">POS</th>
                  <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visibleProducts.map((product) => {
                  const isSelected = selectedIds.has(product.id);
                  return (
                    <tr
                      key={product.id}
                      className={cn(
                        'hover:bg-muted/30 transition-colors group',
                        isSelected && 'bg-primary/5 hover:bg-primary/10'
                      )}
                    >
                      {/* Checkbox */}
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => toggleSelect(product.id)}
                          className="inline-flex items-center justify-center p-1 rounded-md hover:bg-muted transition-colors"
                        >
                          {isSelected ? (
                            <CheckSquare className="h-4 w-4 text-primary" />
                          ) : (
                            <Square className="h-4 w-4 text-muted-foreground" />
                          )}
                        </button>
                      </td>
                      {/* Image */}
                      <td className="px-4 py-3">
                        <ProductThumb productId={product.id} name={product.name} sessionId={sessionId} />
                      </td>
                      {/* Name */}
                      <td className="px-4 py-3">
                        <p className="font-semibold text-foreground">{product.name}</p>
                        {typeof product.description_sale === 'string' && product.description_sale && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{product.description_sale}</p>
                        )}
                      </td>
                      {/* Internal reference */}
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {typeof product.default_code === 'string' && product.default_code ? (
                          <span className="font-mono text-sm text-muted-foreground">{product.default_code}</span>
                        ) : (
                          <span className="text-muted-foreground/40 text-xs">—</span>
                        )}
                      </td>
                      {/* Sale price */}
                      <td className="px-4 py-3 text-right font-semibold text-foreground">
                        {product.list_price.toFixed(2)} DT
                      </td>
                      {/* Cost */}
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        {product.standard_price > 0 ? `${product.standard_price.toFixed(2)} DT` : '—'}
                      </td>
                      {/* Stock per boutique */}
                      <td className="px-4 py-3">
                        {stockData ? (
                          <div className="space-y-0.5 text-xs">
                            {buildShopStock(product.id, stockData).map((s) => (
                              <div key={s.warehouseId} className="flex justify-between gap-3 whitespace-nowrap">
                                <span className="text-muted-foreground">{s.name}</span>
                                <span className={cn('font-semibold tabular-nums', s.qty > 0 ? 'text-foreground' : 'text-destructive')}>
                                  {s.qty}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground/40 text-xs">—</span>
                        )}
                      </td>
                      {/* Barcode */}
                      <td className="px-4 py-3 hidden md:table-cell">
                        {typeof product.barcode === 'string' && product.barcode ? (
                          <span className="inline-flex items-center gap-1 text-xs bg-muted rounded-md px-2 py-1 font-mono text-muted-foreground">
                            <Barcode className="h-3 w-3" />
                            {product.barcode}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/40 text-xs">—</span>
                        )}
                      </td>
                      {/* POS toggle */}
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => togglePOSAccess(product)}
                          disabled={togglingId === product.id}
                          title={product.available_in_pos ? 'Remove from POS' : 'Add to POS'}
                          className="inline-flex items-center justify-center transition-colors"
                        >
                          {togglingId === product.id ? (
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                          ) : product.available_in_pos ? (
                            <ToggleRight className="h-6 w-6 text-emerald-500 hover:text-emerald-600" />
                          ) : (
                            <ToggleLeft className="h-6 w-6 text-muted-foreground hover:text-foreground" />
                          )}
                        </button>
                      </td>
                      {/* Transfer / Edit */}
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <button
                          onClick={() => openTransfer(product)}
                          disabled={!canTransfer}
                          title={
                            !stockData
                              ? 'Stock non chargé depuis Odoo'
                              : !canTransfer
                                ? 'Il faut au moins 2 boutiques (entrepôts) dans Odoo'
                                : 'Transférer du stock entre boutiques'
                          }
                          className="mr-1.5 inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <ArrowLeftRight className="h-3 w-3" />
                          Transférer
                        </button>
                        <button
                          onClick={() => openEdit(product)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Edit2 className="h-3 w-3" />
                          Edit
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredProducts.length > visibleCount && (
              <div className="flex items-center justify-center gap-3 border-t border-border px-4 py-3 text-sm">
                <span className="text-muted-foreground">
                  {visibleCount} / {filteredProducts.length} produits
                </span>
                <button
                  onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                  className="rounded-lg border border-border px-3 py-1.5 font-medium hover:bg-muted transition-colors"
                >
                  Afficher plus
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bulk Actions Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 duration-300">
          <div className="flex items-center gap-6 px-6 py-4 rounded-2xl bg-slate-900 text-white shadow-2xl border border-white/10 backdrop-blur-xl">
            <div className="flex flex-col">
              <span className="text-xs font-black uppercase tracking-widest text-slate-400">Sélection</span>
              <span className="text-lg font-black tracking-tight">{selectedIds.size} produits</span>
            </div>
            
            <div className="h-10 w-px bg-white/20" />

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleBulkTogglePOS(true)}
                disabled={isBulkUpdating}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-sm font-black transition-all active:scale-95 disabled:opacity-50"
              >
                {isBulkUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ToggleRight className="h-4 w-4" />}
                Activer au POS
              </button>
              <button
                onClick={() => handleBulkTogglePOS(false)}
                disabled={isBulkUpdating}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-sm font-black transition-all active:scale-95 disabled:opacity-50"
              >
                {isBulkUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ToggleLeft className="h-4 w-4" />}
                Retirer du POS
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                disabled={isBulkUpdating}
                className="p-2.5 rounded-xl hover:bg-white/10 transition-colors"
                title="Annuler la sélection"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stock Transfer Modal */}
      {transferProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl bg-background shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b px-6 py-4 bg-primary/5">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <ArrowLeftRight className="h-5 w-5 text-primary" />
                Transfert de stock
              </h2>
              <button onClick={() => setTransferProduct(null)} className="rounded-full p-2 hover:bg-black/5 transition-colors">
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>

            <form onSubmit={handleTransfer} className="p-6 space-y-4">
              <p className="font-semibold text-foreground">{transferProduct.name}</p>

              <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">De</label>
                  <select
                    value={transferForm.fromWarehouseId}
                    onChange={(e) => setTransferForm({ ...transferForm, fromWarehouseId: e.target.value })}
                    className="w-full rounded-xl border bg-muted/20 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  >
                    {transferShops.map((s) => (
                      <option key={s.warehouseId} value={s.warehouseId}>{s.name} ({s.qty})</option>
                    ))}
                  </select>
                </div>
                <ArrowRight className="h-4 w-4 mb-3 text-muted-foreground" />
                <div>
                  <label className="block text-sm font-medium mb-1">Vers</label>
                  <select
                    value={transferForm.toWarehouseId}
                    onChange={(e) => setTransferForm({ ...transferForm, toWarehouseId: e.target.value })}
                    className="w-full rounded-xl border bg-muted/20 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  >
                    {transferShops.map((s) => (
                      <option key={s.warehouseId} value={s.warehouseId}>{s.name} ({s.qty})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Quantité</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  max={transferFrom?.qty}
                  value={transferForm.qty}
                  onChange={(e) => setTransferForm({ ...transferForm, qty: e.target.value })}
                  className="w-full rounded-xl border bg-muted/20 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  placeholder="0"
                  autoFocus
                  required
                />
              </div>

              {/* Before → after preview */}
              {transferFrom && transferTo && transferFrom.warehouseId !== transferTo.warehouseId && (
                <div className="rounded-lg bg-muted/40 px-4 py-3 text-sm space-y-1">
                  {[
                    { shop: transferFrom, after: transferFrom.qty - transferQty },
                    { shop: transferTo, after: transferTo.qty + transferQty },
                  ].map(({ shop, after }) => (
                    <div key={shop.warehouseId} className="flex justify-between">
                      <span className="text-muted-foreground">{shop.name}</span>
                      <span className="font-semibold tabular-nums">
                        {shop.qty} → <span className={after < 0 ? 'text-destructive' : 'text-foreground'}>{after}</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {transferFrom && transferTo && transferFrom.warehouseId === transferTo.warehouseId && (
                <p className="text-xs text-destructive">Choisissez deux boutiques différentes.</p>
              )}
              {transferFrom && transferQty > transferFrom.qty && (
                <p className="text-xs text-destructive">Stock insuffisant à {transferFrom.name} ({transferFrom.qty} disponible(s)).</p>
              )}

              {transferError && (
                <div className="flex items-start gap-2 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  {transferError}
                </div>
              )}
              {transferSuccess && (
                <div className="flex items-center gap-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  {transferSuccess}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setTransferProduct(null)}
                  className="flex-1 rounded-xl border py-3 text-sm font-medium hover:bg-muted/50 transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isTransferring || transferInvalid || !!transferSuccess}
                  className="flex-1 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isTransferring ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Transfert...</>
                  ) : (
                    <><ArrowLeftRight className="h-4 w-4" /> Transférer</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl bg-background shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal header */}
            <div className="flex items-center justify-between border-b px-6 py-4 bg-primary/5">
              <h2 className="text-lg font-bold flex items-center gap-2">
                {editingProduct ? <Edit2 className="h-5 w-5 text-primary" /> : <Plus className="h-5 w-5 text-primary" />}
                {editingProduct ? 'Edit Product' : 'Add New Product'}
              </h2>
              <button onClick={() => setModalOpen(false)} className="rounded-full p-2 hover:bg-black/5 transition-colors">
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium mb-1">Product Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-xl border bg-muted/20 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  placeholder="e.g. iPhone 15 Screen"
                  required
                />
              </div>

              {/* Prices */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1 flex items-center gap-1">
                    <DollarSign className="h-3 w-3" />Sale Price (DT) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.list_price}
                    onChange={(e) => setForm({ ...form, list_price: e.target.value })}
                    className="w-full rounded-xl border bg-muted/20 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                    placeholder="0.00"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 flex items-center gap-1">
                    <Tag className="h-3 w-3" />Cost Price (DT)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.standard_price}
                    onChange={(e) => setForm({ ...form, standard_price: e.target.value })}
                    className="w-full rounded-xl border bg-muted/20 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                    placeholder="0.00"
                  />
                </div>
              </div>

              {/* Margin indicator */}
              {form.list_price && form.standard_price && parseFloat(form.list_price) > 0 && (
                <div className="rounded-lg bg-muted/40 px-4 py-2 text-xs flex justify-between">
                  <span className="text-muted-foreground">Margin</span>
                  <span className={`font-semibold ${
                    parseFloat(form.list_price) > parseFloat(form.standard_price)
                      ? 'text-emerald-600'
                      : 'text-red-500'
                  }`}>
                    {(((parseFloat(form.list_price) - parseFloat(form.standard_price)) / parseFloat(form.list_price)) * 100).toFixed(1)}%
                    {' '}({(parseFloat(form.list_price) - parseFloat(form.standard_price)).toFixed(2)} DT)
                  </span>
                </div>
              )}

              {/* POS Category */}
              <div>
                <label className="block text-sm font-medium mb-1">POS Category</label>
                <select
                  value={form.pos_categ_id}
                  onChange={(e) => setForm({ ...form, pos_categ_id: e.target.value })}
                  className="w-full rounded-xl border bg-muted/20 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                >
                  <option value="">-- No category --</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>

              {/* Barcode */}
              <div>
                <label className="block text-sm font-medium mb-1">Barcode</label>
                <input
                  type="text"
                  value={form.barcode}
                  onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                  className="w-full rounded-xl border bg-muted/20 px-4 py-2.5 text-sm font-mono outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  placeholder="e.g. 6201234567890"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea
                  value={form.description_sale}
                  onChange={(e) => setForm({ ...form, description_sale: e.target.value })}
                  rows={2}
                  className="w-full rounded-xl border bg-muted/20 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all resize-none"
                  placeholder="Short product description..."
                />
              </div>

              {/* Feedback */}
              {formError && (
                <div className="flex items-start gap-2 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  {formError}
                </div>
              )}
              {formSuccess && (
                <div className="flex items-center gap-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  {formSuccess}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="flex-1 rounded-xl border py-3 text-sm font-medium hover:bg-muted/50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</>
                  ) : (
                    <><Save className="h-4 w-4" /> {editingProduct ? 'Save Changes' : 'Create Product'}</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
