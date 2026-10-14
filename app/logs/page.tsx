'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { clearAuditLogs, getAuditActionLabel, getAuditEntityLabel, getAuditLogs, AUDIT_LOG_EVENT, type AuditLogEntry } from '@/lib/audit';
import { ArrowLeft, Eye, Loader2, RefreshCw, Trash2 } from 'lucide-react';

export default function LogsPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push('/login');
  }, [authLoading, isAuthenticated, router]);

  const loadLogs = async () => {
    const data = await getAuditLogs();
    setLogs(data);
    setIsInitialLoading(false);
  };

  useEffect(() => {
    loadLogs();

    const handleFocus = () => loadLogs();
    const handleStorage = () => loadLogs();

    window.addEventListener('focus', handleFocus);
    window.addEventListener('storage', handleStorage);
    window.addEventListener(AUDIT_LOG_EVENT as any, handleStorage);

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(AUDIT_LOG_EVENT as any, handleStorage);
    };
  }, []);

  const stats = useMemo(() => {
    return {
      total: logs.length,
      products: logs.filter((log) => log.entityType === 'product').length,
      customers: logs.filter((log) => log.entityType === 'customer').length,
      invoices: logs.filter((log) => log.entityType === 'invoice').length,
    };
  }, [logs]);

  if (authLoading || isInitialLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
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
          <h1 className="flex items-center gap-2 text-lg font-bold text-foreground">
            <Eye className="h-5 w-5 text-primary" />
            Activity Logs
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadLogs}
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          <button
            onClick={async () => {
              await clearAuditLogs();
              await loadLogs();
            }}
            className="flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
            Clear Logs
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-7xl p-6">
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            { label: 'Total Logs', value: stats.total },
            { label: 'Produits', value: stats.products },
            { label: 'Clients', value: stats.customers },
            { label: 'Factures', value: stats.invoices },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className="mt-1 text-2xl font-bold text-foreground">{stat.value}</p>
            </div>
          ))}
        </div>

        {logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card py-24 text-muted-foreground">
            <Eye className="h-12 w-12 opacity-30" />
            <p className="font-medium">Aucun log disponible</p>
            <p className="text-sm">Les actions comme ajouter un produit, un client ou creer une facture apparaitront ici.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Date</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Utilisateur</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Type</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Action</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Element</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">{log.actor}</td>
                    <td className="px-4 py-3 text-muted-foreground">{getAuditEntityLabel(log.entityType)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{getAuditActionLabel(log.action)}</td>
                    <td className="px-4 py-3 font-medium text-foreground">{log.entityName}</td>
                    <td className="px-4 py-3 text-muted-foreground">{log.details || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
