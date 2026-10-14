'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { recordAuditLog } from '@/lib/audit';
import {
  Plus, Search, Edit2, ToggleLeft, ToggleRight,
  ArrowLeft, Loader2, Users, X, Save, AlertCircle,
  CheckCircle2, RefreshCw, Mail, User, Shield,
  Eye,
} from 'lucide-react';

interface OdooUser {
  id: number;
  name: string;
  login: string;
  email: string | false;
  active: boolean;
}

interface UserFormData {
  name: string;
  login: string;
  password: string;
  email: string;
}

const emptyForm: UserFormData = {
  name: '',
  login: '',
  password: '',
  email: '',
};

export default function CashiersPage() {
  const router = useRouter();
  const { sessionId, isAuthenticated, isLoading: authLoading, user } = useAuth();

  const [users, setUsers] = useState<OdooUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<OdooUser | null>(null);
  const [form, setForm] = useState<UserFormData>(emptyForm);
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
      const res = await fetch(`/api/odoo/users?session_id=${sessionId}&all=true`);
      const data = await res.json();
      if (data.success) setUsers(data.users || []);
    } catch (err) {
      console.error('Failed to fetch users', err);
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filteredUsers = users.filter((u) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      u.name.toLowerCase().includes(q) ||
      u.login.toLowerCase().includes(q) ||
      (typeof u.email === 'string' && u.email.toLowerCase().includes(q));
    const matchesStatus = showInactive || u.active;
    return matchesSearch && matchesStatus;
  });

  const openCreate = () => {
    setEditingUser(null);
    setForm(emptyForm);
    setFormError('');
    setFormSuccess('');
    setModalOpen(true);
  };

  const openEdit = (odooUser: OdooUser) => {
    setEditingUser(odooUser);
    setForm({
      name: odooUser.name,
      login: odooUser.login,
      password: '', // Don't show existing password
      email: typeof odooUser.email === 'string' ? odooUser.email : '',
    });
    setFormError('');
    setFormSuccess('');
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');
    
    if (!form.name.trim() || !form.login.trim()) {
      setFormError('Name and login are required.');
      return;
    }
    
    if (!editingUser && !form.password) {
      setFormError('Password is required for new cashiers.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingUser) {
        const res = await fetch(`/api/odoo/users?session_id=${sessionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingUser.id, ...form }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Update failed');
        await recordAuditLog({
          action: 'updated',
          entityType: 'cashier',
          entityName: form.name.trim(),
          actor: user?.name,
          details: `Caissier #${editingUser.id} modifie`,
        });
        setFormSuccess('Cashier updated successfully!');
        await fetchData();
        setTimeout(() => setModalOpen(false), 1000);
      } else {
        const res = await fetch(`/api/odoo/users?session_id=${sessionId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Create failed');
        await recordAuditLog({
          action: 'created',
          entityType: 'cashier',
          entityName: form.name.trim(),
          actor: user?.name,
          details: `Login: ${form.login.trim()}`,
        });
        setFormSuccess('Cashier created successfully!');
        await fetchData();
        setTimeout(() => setModalOpen(false), 1000);
      }
    } catch (err: any) {
      setFormError(err.message || 'An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleUserStatus = async (odooUser: OdooUser) => {
    setTogglingId(odooUser.id);
    try {
      const res = await fetch(`/api/odoo/users?session_id=${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: odooUser.id, active: !odooUser.active }),
      });
      const data = await res.json();
      if (data.success) {
        await recordAuditLog({
          action: odooUser.active ? 'archived' : 'restored',
          entityType: 'cashier',
          entityName: odooUser.name,
          actor: user?.name,
          details: odooUser.active ? 'Caissier archive' : 'Caissier reactive',
        });
        setUsers((prev) =>
          prev.map((u) =>
            u.id === odooUser.id ? { ...u, active: !u.active } : u
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
            Cashier Management
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
            Add Cashier
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
              placeholder="Search by name, login or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border bg-card pl-10 pr-4 py-2.5 text-sm shadow-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            />
          </div>
          <button
            onClick={() => setShowInactive(!showInactive)}
            className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors ${
              showInactive
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card text-muted-foreground hover:bg-muted border-border'
            }`}
          >
            {showInactive ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
            Show Archived
          </button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Total Cashiers', value: users.length, color: 'text-foreground' },
            { label: 'Active', value: users.filter((u) => u.active).length, color: 'text-emerald-600' },
            { label: 'Archived', value: users.filter((u) => !u.active).length, color: 'text-muted-foreground' },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Users table */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading users from Odoo...</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
            <Users className="h-12 w-12 opacity-30" />
            <p className="font-medium">No cashiers found</p>
            <button onClick={openCreate} className="text-sm text-primary underline">Add your first cashier</button>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground w-12"></th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Name</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Login / Username</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground hidden md:table-cell">Email</th>
                  <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Status</th>
                  <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredUsers.map((odooUser) => {
                  return (
                    <tr key={odooUser.id} className="hover:bg-muted/30 transition-colors group">
                      <td className="px-4 py-3">
                        <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20">
                          <User className="h-5 w-5 text-primary" />
                        </div>
                      </td>
                      <td className="px-4 py-3 font-semibold text-foreground">
                        {odooUser.name}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                        {odooUser.login}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">
                        {odooUser.email || '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => toggleUserStatus(odooUser)}
                          disabled={togglingId === odooUser.id}
                          className="inline-flex items-center justify-center transition-colors"
                        >
                          {togglingId === odooUser.id ? (
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                          ) : odooUser.active ? (
                            <ToggleRight className="h-6 w-6 text-emerald-500 hover:text-emerald-600" />
                          ) : (
                            <ToggleLeft className="h-6 w-6 text-muted-foreground hover:text-foreground" />
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => openEdit(odooUser)}
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
                {editingUser ? <Edit2 className="h-5 w-5 text-primary" /> : <Plus className="h-5 w-5 text-primary" />}
                {editingUser ? 'Edit Cashier' : 'Add New Cashier'}
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
                    placeholder="e.g. John Doe"
                    required
                  />
                </div>
              </div>

              {/* Login */}
              <div>
                <label className="block text-sm font-medium mb-1">Login / Username *</label>
                <div className="relative">
                  <Shield className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={form.login}
                    onChange={(e) => setForm({ ...form, login: e.target.value })}
                    className="w-full rounded-xl border bg-muted/20 pl-10 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                    placeholder="e.g. john.doe"
                    required
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  {editingUser ? 'New Password (leave blank to keep current)' : 'Password *'}
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full rounded-xl border bg-muted/20 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  placeholder="••••••••"
                  required={!editingUser}
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium mb-1">Email (Optional)</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full rounded-xl border bg-muted/20 pl-10 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                    placeholder="john@example.com"
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
                    <><Save className="h-4 w-4" /> {editingUser ? 'Save Changes' : 'Create Cashier'}</>
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
