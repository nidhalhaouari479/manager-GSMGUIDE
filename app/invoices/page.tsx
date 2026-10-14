'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import {
  Search, ArrowLeft, Loader2, FileText, RefreshCw, 
  Calendar, User, CreditCard, CheckCircle2, AlertCircle,
  ExternalLink, Clock, ShoppingCart, Receipt, Eye
} from 'lucide-react';

interface OdooOrder {
  id: number;
  name: string;
  pos_reference: string;
  partner_id: [number, string] | false;
  date_order: string;
  amount_total: number;
  state: 'draft' | 'cancel' | 'paid' | 'done' | 'invoiced';
  account_move: [number, string] | false;
  user_id: [number, string] | false;
}

interface OdooInvoice {
  id: number;
  name: string;
  partner_id: [number, string] | false;
  invoice_date: string;
  amount_total: number;
  state: 'draft' | 'posted' | 'cancel';
  payment_state: 'not_paid' | 'in_payment' | 'paid' | 'partial' | 'reversed';
  create_uid: [number, string] | false;
}

export default function InvoicesPage() {
  const router = useRouter();
  const { sessionId, isAuthenticated, isLoading: authLoading } = useAuth();

  const [orders, setOrders] = useState<OdooOrder[]>([]);
  const [invoices, setInvoices] = useState<OdooInvoice[]>([]);
  const [users, setUsers] = useState<{id: number, name: string}[]>([]);
  const [viewMode, setViewMode] = useState<'orders' | 'invoices'>('invoices'); 
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string>('all');
  
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push('/login');
  }, [authLoading, isAuthenticated, router]);

  // Fetch users for the filter
  useEffect(() => {
    const fetchUsers = async () => {
      if (!sessionId) return;
      try {
        const res = await fetch(`/api/odoo/users?session_id=${sessionId}`);
        const data = await res.json();
        if (data.success) setUsers(data.users || []);
      } catch (err) {
        console.error('Failed to fetch users', err);
      }
    };
    fetchUsers();
  }, [sessionId]);

  const fetchData = useCallback(async () => {
    if (!sessionId) return;
    setIsLoading(true);
    try {
      const endpoint = viewMode === 'orders' ? '/api/odoo/orders' : '/api/odoo/invoices';
      const url = new URL(endpoint, window.location.origin);
      url.searchParams.append('session_id', sessionId);
      if (startDate) url.searchParams.append('start_date', startDate);
      if (endDate) url.searchParams.append('end_date', endDate);
      if (searchQuery) url.searchParams.append('search', searchQuery);
      
      if (selectedUserId !== 'all') {
        const paramName = viewMode === 'orders' ? 'user_id' : 'creator_id';
        url.searchParams.append(paramName, selectedUserId);
      }

      const res = await fetch(url.toString());
      const data = await res.json();
      if (data.success) {
        if (viewMode === 'orders') {
          setOrders(data.orders || []);
        } else {
          setInvoices(data.invoices || []);
        }
      }
    } catch (err) {
      console.error(`Failed to fetch ${viewMode}`, err);
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, startDate, endDate, searchQuery, viewMode, selectedUserId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchData();
    }, 500);
    return () => clearTimeout(timer);
  }, [fetchData]);

  const getStatusBadge = (state: string, paymentState?: string) => {
    if (viewMode === 'orders') {
      switch (state) {
        case 'paid':
          return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">Paid</span>;
        case 'invoiced':
          return <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-950/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800">Invoiced</span>;
        case 'done':
          return <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">Done</span>;
        case 'cancel':
          return <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800 dark:bg-red-950/30 dark:text-red-400 border border-red-200 dark:border-red-800">Cancelled</span>;
        default:
          return <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800 dark:bg-gray-800 dark:text-gray-400">{state}</span>;
      }
    } else {
      // Invoices
      if (state === 'posted') {
        switch (paymentState) {
          case 'paid':
            return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">Payé</span>;
          case 'partial':
            return <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800">Partiel</span>;
          case 'not_paid':
            return <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-950/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800">Ouvert</span>;
          case 'in_payment':
            return <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">En paiement</span>;
          default:
            return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">Publié</span>;
        }
      }
      return <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800 dark:bg-gray-800 dark:text-gray-400">{state}</span>;
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
      <div className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-border bg-card px-6 shadow-sm">
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
            <FileText className="h-5 w-5 text-primary" />
            Gestion des Factures
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {/* Toggle View Mode */}
          <div className="flex items-center bg-muted/50 rounded-lg p-1 mr-2 border border-border">
            <button
              onClick={() => setViewMode('invoices')}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                viewMode === 'invoices' 
                  ? 'bg-card text-primary shadow-sm' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Receipt className="h-3.5 w-3.5" />
              Factures
            </button>
            <button
              onClick={() => setViewMode('orders')}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                viewMode === 'orders' 
                  ? 'bg-card text-primary shadow-sm' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <ShoppingCart className="h-3.5 w-3.5" />
              Commandes POS
            </button>
          </div>
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
        </div>
      </div>

      <div className="p-6 max-w-7xl mx-auto">
        {/* Filters Panel */}
        <div className="rounded-2xl border border-border bg-card p-6 mb-6 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Search */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Recherche</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder={viewMode === 'orders' ? "Référence ou commande..." : "Numéro de facture ou client..."}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border bg-muted/20 pl-10 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                />
              </div>
            </div>

            {/* Date Start */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Date Début</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full rounded-xl border bg-muted/20 pl-10 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                />
              </div>
            </div>

            {/* Date End */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Date Fin</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full rounded-xl border bg-muted/20 pl-10 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                />
              </div>
            </div>

            {/* Created By Filter */}
            <div className="md:col-span-3">
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Filtrer par Créateur</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="w-full rounded-xl border bg-muted/20 pl-10 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all appearance-none cursor-pointer"
                >
                  <option value="all">Tous les créateurs</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id.toString()}>{u.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { 
              label: viewMode === 'orders' ? 'Total Commandes' : 'Total Factures', 
              value: viewMode === 'orders' ? orders.length : invoices.length, 
              icon: FileText, 
              color: 'text-foreground' 
            },
            { 
              label: 'Montant Total', 
              value: `${(viewMode === 'orders' ? orders : invoices).reduce((acc, o) => acc + o.amount_total, 0).toFixed(2)} DT`, 
              icon: CreditCard, 
              color: 'text-primary' 
            },
            { 
              label: viewMode === 'orders' ? 'Facturées' : 'Payées', 
              value: viewMode === 'orders' 
                ? orders.filter((o) => o.state === 'invoiced' || o.account_move).length 
                : invoices.filter((i) => i.payment_state === 'paid').length, 
              icon: CheckCircle2, 
              color: 'text-emerald-600' 
            },
            { 
              label: 'En Attente', 
              value: viewMode === 'orders' 
                ? orders.filter((o) => o.state === 'paid').length 
                : invoices.filter((i) => i.payment_state !== 'paid').length, 
              icon: Clock, 
              color: 'text-amber-600' 
            },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <stat.icon className={`h-4 w-4 ${stat.color} opacity-70`} />
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
              <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>

        {/* List table */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Fetching {viewMode} from Odoo...</p>
          </div>
        ) : (viewMode === 'orders' ? orders.length === 0 : invoices.length === 0) ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground bg-card rounded-2xl border border-border">
            <FileText className="h-12 w-12 opacity-30" />
            <p className="font-medium">Aucune {viewMode === 'orders' ? 'commande' : 'facture'} trouvée</p>
            <p className="text-sm">Essayez de changer les dates ou la recherche.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">ID</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Référence</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Client</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Créé par</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Date</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Montant</th>
                  <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {viewMode === 'orders' ? (
                  orders.map((order) => {
                    const partnerName = Array.isArray(order.partner_id) ? order.partner_id[1] : 'Client Passager';
                    const formattedDate = new Date(order.date_order).toLocaleString();
                    const invoiceName = Array.isArray(order.account_move) ? order.account_move[1] : null;

                    return (
                      <tr key={`order-${order.id}`} className="hover:bg-muted/30 transition-colors group">
                        <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                          #{order.id}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-foreground">{order.pos_reference || order.name}</p>
                          {invoiceName && (
                            <p className="text-[10px] text-blue-500 font-medium mt-0.5 flex items-center gap-1">
                              <ExternalLink className="h-2.5 w-2.5" />
                              {invoiceName}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center">
                              <User className="h-3 w-3 text-muted-foreground" />
                            </div>
                            <span className="text-foreground">{partnerName}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {Array.isArray(order.user_id) ? order.user_id[1] : 'Système'}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {formattedDate}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-foreground">
                          {order.amount_total.toFixed(2)} DT
                        </td>
                        <td className="px-4 py-3 text-center">
                          {getStatusBadge(order.state)}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  invoices.map((invoice) => {
                    const partnerName = Array.isArray(invoice.partner_id) ? invoice.partner_id[1] : 'Client Inconnu';
                    const formattedDate = new Date(invoice.invoice_date).toLocaleDateString();

                    return (
                      <tr key={`invoice-${invoice.id}`} className="hover:bg-muted/30 transition-colors group">
                        <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                          #{invoice.id}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-foreground">{invoice.name}</p>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center">
                              <User className="h-3 w-3 text-muted-foreground" />
                            </div>
                            <span className="text-foreground">{partnerName}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {Array.isArray(invoice.create_uid) ? invoice.create_uid[1] : 'Système'}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {formattedDate}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-foreground">
                          {invoice.amount_total.toFixed(2)} DT
                        </td>
                        <td className="px-4 py-3 text-center">
                          {getStatusBadge(invoice.state, invoice.payment_state)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
