'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { recordAuditLog } from '@/lib/audit';
import {
  Plus, Search, Edit2, ToggleLeft, ToggleRight,
  ArrowLeft, Loader2, Users, X, Save, AlertCircle,
  CheckCircle2, RefreshCw, Mail, Phone, User, Barcode,
  Eye,
} from 'lucide-react';

interface OdooCustomer {
  id: number;
  name: string;
  phone: string | false;
  email: string | false;
  barcode: string | false;
  active: boolean;
}

interface CustomerFormData {
  name: string;
  phone: string;
  email: string;
  barcode: string;
}

const emptyForm: CustomerFormData = {
  name: '',
  phone: '',
  email: '',
  barcode: '',
};

export default function CustomersPage() {
  const router = useRouter();
  const { sessionId, isAuthenticated, isLoading: authLoading, user } = useAuth();

  const [customers, setCustomers] = useState<OdooCustomer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<OdooCustomer | null>(null);
  const [form, setForm] = useState<CustomerFormData>(emptyForm);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push('/login');
  }, [authLoading, isAuthenticated, router]);

  const fetchData = useCallback(async () => {
    if (!sessionId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/odoo/customers?session_id=${sessionId}&all=true`);
      const data = await res.json();
      if (data.success) setCustomers(data.customers || []);
    } catch (err) {
      console.error('Failed to fetch customers', err);
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filteredCustomers = customers.filter((c) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      c.name.toLowerCase().includes(q) ||
      (typeof c.phone === 'string' && c.phone.includes(q)) ||
      (typeof c.email === 'string' && c.email.toLowerCase().includes(q)) ||
      (typeof c.barcode === 'string' && c.barcode.includes(q));
    const matchesStatus = showArchived || c.active;
    return matchesSearch && matchesStatus;
  });

  const openCreate = () => {
    setEditingCustomer(null);
    setForm(emptyForm);
    setFormError('');
    setFormSuccess('');
    setModalOpen(true);
  };

  const openEdit = (customer: OdooCustomer) => {
    setEditingCustomer(customer);
    setForm({
      name: customer.name,
      phone: typeof customer.phone === 'string' ? customer.phone : '',
      email: typeof customer.email === 'string' ? customer.email : '',
      barcode: typeof customer.barcode === 'string' ? customer.barcode : '',
    });
    setFormError('');
    setFormSuccess('');
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');
    if (!form.name.trim()) {
      setFormError('Customer name is required.');
      return;
    }
    setIsSubmitting(true);
    try {
      if (editingCustomer) {
        const res = await fetch(`/api/odoo/customers?session_id=${sessionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingCustomer.id, ...form }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Update failed');
        await recordAuditLog({
          action: 'updated',
          entityType: 'customer',
          entityName: form.name.trim(),
          actor: user?.name,
          details: `Client #${editingCustomer.id} modifie`,
        });
        setFormSuccess('Customer updated successfully!');
        await fetchData();
        setTimeout(() => setModalOpen(false), 1000);
      } else {
        const res = await fetch(`/api/odoo/customers?session_id=${sessionId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Create failed');
        await recordAuditLog({
          action: 'created',
          entityType: 'customer',
          entityName: form.name.trim(),
          actor: user?.name,
          details: 'Nouveau client ajoute',
        });
        setFormSuccess('Customer created successfully!');
        await fetchData();
        setTimeout(() => setModalOpen(false), 1000);
      }
    } catch (err: any) {
      setFormError(err.message || 'An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleCustomerStatus = async (customer: OdooCustomer) => {
    setTogglingId(customer.id);
    try {
      const res = await fetch(`/api/odoo/customers?session_id=${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: customer.id, active: !customer.active }),
      });
      const data = await res.json();
      if (data.success) {
        await recordAuditLog({
          action: customer.active ? 'archived' : 'restored',
          entityType: 'customer',
          entityName: customer.name,
          actor: user?.name,
          details: customer.active ? 'Client archive' : 'Client reactive',
        });
        setCustomers((prev) =>
          prev.map((c) =>
            c.id === customer.id ? { ...c, active: !c.active } : c
          )
        );
      }
    } catch (err) {
      console.error('Toggle failed', err);
    } finally {
      setTogglingId(null);
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
            <Users className="h-5 w-5 text-primary" />
            Client Management
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
            Add Client
          </button>
        </div>
      </div>

      <div className="p-6 max-w-7xl mx-auto">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by name, phone, email or barcode..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border bg-card pl-10 pr-4 py-2.5 text-sm shadow-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            />
          </div>
          <button
            onClick={() => setShowArchived(!showArchived)}
            className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors ${
              showArchived
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card text-muted-foreground hover:bg-muted border-border'
            }`}
          >
            {showArchived ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
            Show Archived
          </button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Total Clients', value: customers.length, color: 'text-foreground' },
            { label: 'Active', value: customers.filter((c) => c.active).length, color: 'text-emerald-600' },
            { label: 'Archived', value: customers.filter((c) => !c.active).length, color: 'text-muted-foreground' },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Customers table */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading clients from Odoo...</p>
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
            <Users className="h-12 w-12 opacity-30" />
            <p className="font-medium">No clients found</p>
            <button onClick={openCreate} className="text-sm text-primary underline">Add your first client</button>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground w-12"></th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Name</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Contact</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground hidden md:table-cell">Barcode</th>
                  <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Status</th>
                  <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredCustomers.map((customer) => {
                  return (
                    <tr key={customer.id} className="hover:bg-muted/30 transition-colors group">
                      <td className="px-4 py-3">
                        <div className="h-9 w-9 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 flex items-center justify-center border border-indigo-200 dark:border-indigo-800">
                          <User className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                        </div>
                      </td>
                      <td className="px-4 py-3 font-semibold text-foreground">
                        {customer.name}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          {customer.phone && (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Phone className="h-3 w-3" />
                              {customer.phone}
                            </div>
                          )}
                          {customer.email && (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Mail className="h-3 w-3" />
                              {customer.email}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        {customer.barcode ? (
                          <span className="inline-flex items-center gap-1 text-[10px] bg-muted rounded-md px-2 py-0.5 font-mono text-muted-foreground border">
                            <Barcode className="h-3 w-3" />
                            {customer.barcode}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => toggleCustomerStatus(customer)}
                          disabled={togglingId === customer.id}
                          className="inline-flex items-center justify-center transition-colors"
                        >
                          {togglingId === customer.id ? (
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                          ) : customer.active ? (
                            <ToggleRight className="h-6 w-6 text-emerald-500 hover:text-emerald-600" />
                          ) : (
                            <ToggleLeft className="h-6 w-6 text-muted-foreground hover:text-foreground" />
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => openEdit(customer)}
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
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl bg-background shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal header */}
            <div className="flex items-center justify-between border-b px-6 py-4 bg-primary/5">
              <h2 className="text-lg font-bold flex items-center gap-2">
                {editingCustomer ? <Edit2 className="h-5 w-5 text-primary" /> : <Plus className="h-5 w-5 text-primary" />}
                {editingCustomer ? 'Edit Client' : 'Add New Client'}
              </h2>
              <button onClick={() => setModalOpen(false)} className="rounded-full p-2 hover:bg-black/5 transition-colors">
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium mb-1">Full Name *</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full rounded-xl border bg-muted/20 pl-10 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                    placeholder="e.g. Marie Durand"
                    required
                  />
                </div>
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-medium mb-1">Phone Number</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full rounded-xl border bg-muted/20 pl-10 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                    placeholder="+216 00 000 000"
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium mb-1">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full rounded-xl border bg-muted/20 pl-10 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                    placeholder="marie@example.com"
                  />
                </div>
              </div>

              {/* Barcode */}
              <div>
                <label className="block text-sm font-medium mb-1">Barcode (for cards)</label>
                <div className="relative">
                  <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={form.barcode}
                    onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                    className="w-full rounded-xl border bg-muted/20 pl-10 pr-4 py-2.5 text-sm font-mono outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                    placeholder="e.g. CARD-123456"
                  />
                </div>
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
                    <><Save className="h-4 w-4" /> {editingCustomer ? 'Save Changes' : 'Create Client'}</>
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
