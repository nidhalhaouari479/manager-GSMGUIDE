'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, MonitorCheck, Store, AlertTriangle } from 'lucide-react';

interface Config { id: number; name: string; }
interface ActiveSession { id: number; name: string; configName: string; startedAt: string; }

interface OpenSessionModalProps {
  open: boolean;
  sessionId: string | null;
  onSessionOpened: (session: ActiveSession) => void;
}

export function OpenSessionModal({ open, sessionId, onSessionOpened }: OpenSessionModalProps) {
  const [loading, setLoading] = useState(true);
  const [configs, setConfigs] = useState<Config[]>([]);
  const [opening, setOpening] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && sessionId) fetchConfigs();
  }, [open, sessionId]);

  const fetchConfigs = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/odoo/pos-session?session_id=${sessionId}`);
      const data = await res.json();
      if (data.hasActiveSession && data.session) {
        onSessionOpened(data.session);
        return;
      }
      setConfigs(data.configs || []);
    } catch {
      setError('Impossible de récupérer les configurations POS.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = async (configId: number) => {
    setOpening(configId);
    setError(null);
    try {
      const res = await fetch(`/api/odoo/pos-session?session_id=${sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configId }),
      });
      const data = await res.json();
      if (data.success && data.session) {
        onSessionOpened(data.session);
      } else {
        setError(data.error || 'Erreur lors de l\'ouverture de la session.');
      }
    } catch {
      setError('Erreur réseau.');
    } finally {
      setOpening(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-md gap-0 p-0 overflow-hidden border-none shadow-2xl rounded-3xl [&>button]:hidden">
        <DialogHeader className="p-8 bg-slate-900 text-white">
          <div className="flex items-center gap-4 mb-2">
            <div className="p-3 bg-emerald-500/20 rounded-2xl">
              <MonitorCheck className="h-6 w-6 text-emerald-400" />
            </div>
            <div>
              <DialogTitle className="text-xl font-black uppercase tracking-tight">Ouvrir la Session</DialogTitle>
              <DialogDescription className="text-slate-400 text-sm">
                Choisissez une caisse pour commencer
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="p-8 space-y-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground font-medium">Chargement des caisses...</p>
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 p-4 rounded-xl flex items-center gap-3 text-red-800">
              <AlertTriangle className="h-5 w-5 flex-shrink-0" />
              <p className="text-sm font-medium">{error}</p>
            </div>
          ) : configs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Store className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Aucune caisse disponible.</p>
              <p className="text-xs mt-1">Vérifiez votre configuration Odoo.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {configs.map((config) => (
                <Button
                  key={config.id}
                  onClick={() => handleOpen(config.id)}
                  disabled={opening !== null}
                  className="w-full h-14 justify-between px-5 bg-card hover:bg-secondary border border-border text-foreground font-bold text-base rounded-xl transition-all"
                  variant="outline"
                >
                  <div className="flex items-center gap-3">
                    <Store className="h-5 w-5 text-primary" />
                    {config.name}
                  </div>
                  {opening === config.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <span className="text-xs text-muted-foreground font-normal">Ouvrir →</span>
                  )}
                </Button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
