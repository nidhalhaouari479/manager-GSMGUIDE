'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { recordAuditLog } from '@/lib/audit';
import { ArrowLeft, CalendarDays, Loader2, Printer, ReceiptText, RefreshCw, User2 } from 'lucide-react';

interface CashierOption {
  id: number;
  name: string;
}

interface ClosureLine {
  id: number;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
  discount: number;
  discountAmount: number;
}

interface ClosureFamily {
  family: string;
  lines: ClosureLine[];
}

interface ClosureSummary {
  cashierName: string;
  date: string;
  sessionOpenAt: string | null;
  sessionCloseAt: string | null;
  sessionState: string | null;
  totalSales: number;
  totalTax: number;
  totalDiscount: number;
  cashTotal: number;
  closureAmount: number;
  difference: number;
  itemCount: number;
  ticketCount: number;
  payments: Array<{ name: string; amount: number }>;
  salesByFamily: ClosureFamily[];
}

export default function ClosuresPage() {
  const router = useRouter();
  const { sessionId, isAuthenticated, isLoading: authLoading, user } = useAuth();
  const [cashiers, setCashiers] = useState<CashierOption[]>([]);
  const [selectedCashierId, setSelectedCashierId] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [summary, setSummary] = useState<ClosureSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isUsersLoading, setIsUsersLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push('/login');
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    const fetchCashiers = async () => {
      if (!sessionId) return;
      setIsUsersLoading(true);
      try {
        const response = await fetch(`/api/odoo/users?session_id=${sessionId}&all=true`);
        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.error || 'Failed to fetch cashiers');
        }

        const nextCashiers = (data.users || []).map((cashier: any) => ({
          id: cashier.id,
          name: cashier.name,
        }));

        setCashiers(nextCashiers);

        if (nextCashiers.length > 0) {
          const currentUserMatch = user?.uid
            ? nextCashiers.find((cashier: CashierOption) => cashier.id === user.uid)
            : null;
          setSelectedCashierId(String(currentUserMatch?.id || nextCashiers[0].id));
        }
      } catch (err: any) {
        setError(err.message || 'Failed to fetch cashiers');
      } finally {
        setIsUsersLoading(false);
      }
    };

    fetchCashiers();
  }, [sessionId, user?.uid]);

  const fetchClosure = async () => {
    if (!sessionId || !selectedCashierId || !selectedDate) return;

    setIsLoading(true);
    setError('');
    try {
      const response = await fetch(
        `/api/odoo/closures?session_id=${sessionId}&user_id=${selectedCashierId}&date=${selectedDate}`
      );
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch closure');
      }
      setSummary(data.summary || null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch closure');
      setSummary(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (selectedCashierId && selectedDate) {
      fetchClosure();
    }
  }, [selectedCashierId, selectedDate]);

  const selectedCashierName = useMemo(
    () => cashiers.find((cashier) => String(cashier.id) === selectedCashierId)?.name || 'Caissier',
    [cashiers, selectedCashierId]
  );

  const printClosure = async () => {
    if (!summary) return;

    const paymentRows = summary.payments
      .map((payment) => `<div class="row"><span>${payment.name.toUpperCase()}</span><span>${payment.amount.toFixed(3)}</span></div>`)
      .join('');

    const salesRows = summary.salesByFamily
      .map((family) => {
        const lines = family.lines
          .map((line) => {
            const discountNote = line.discount > 0
              ? `<div class="muted">(Remise ${line.discount.toFixed(0)}%) ${line.discountAmount.toFixed(3)}</div>`
              : '';

            return `
              <div class="sale-line">
                <div class="line-name">${line.name}</div>
                ${discountNote}
                <div class="row small">
                  <span>${line.quantity} x ${line.unitPrice.toFixed(3)}</span>
                  <span>${line.total.toFixed(3)}</span>
                </div>
              </div>
            `;
          })
          .join('');

        return `
          <div class="family-block">
            <div class="family-title">Famille : ${family.family.toUpperCase()}</div>
            ${lines}
          </div>
        `;
      })
      .join('');

    const html = `
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8" />
        <title>Cloture de caisse</title>
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            font-family: Arial, sans-serif;
            color: #111;
            background: #fff;
          }
          .ticket {
            width: 80mm;
            padding: 8mm 6mm 10mm;
            margin: 0 auto;
            font-size: 11px;
            line-height: 1.45;
          }
          .center { text-align: center; }
          .title {
            font-size: 18px;
            font-weight: 700;
            margin-bottom: 8px;
          }
          .subtitle {
            font-size: 12px;
            font-weight: 700;
          }
          .muted {
            color: #666;
            font-size: 10px;
          }
          .separator {
            text-align: center;
            margin: 10px 0;
            color: #777;
            letter-spacing: 1px;
          }
          .row {
            display: flex;
            justify-content: space-between;
            gap: 10px;
            margin: 4px 0;
          }
          .row.small {
            font-size: 10px;
          }
          .strong {
            font-weight: 700;
          }
          .family-block {
            margin: 10px 0 14px;
          }
          .family-title {
            font-weight: 700;
            margin-bottom: 6px;
          }
          .sale-line {
            margin-bottom: 8px;
          }
          .line-name {
            font-size: 10.5px;
          }
          @media print {
            @page { size: 80mm auto; margin: 0; }
            body { print-color-adjust: exact; }
          }
        </style>
      </head>
      <body>
        <div class="ticket">
          <div class="center title">Cloture de caisse</div>
          <div class="center subtitle">Caissier: ${summary.cashierName}</div>
          <div class="center muted">DATE ${new Date(summary.date).toLocaleDateString('fr-FR')} ${new Date().toLocaleTimeString('fr-FR')}</div>

          <div class="separator">------------------------------</div>
          <div class="center strong">REGLEMENTS</div>
          <div class="separator">------------------------------</div>

          <div class="row"><span>DATE OUVERTURE SESSION</span><span>${summary.sessionOpenAt ? new Date(summary.sessionOpenAt).toLocaleString('fr-FR') : '-'}</span></div>
          <div class="row strong"><span>TOTAL VENTE</span><span>${summary.totalSales.toFixed(3)}</span></div>
          ${paymentRows}
          <div class="row"><span>TOTAL REMISE</span><span>${summary.totalDiscount.toFixed(3)}</span></div>
          <div class="row strong"><span>TOTAL CAISSE (ESP)</span><span>${summary.cashTotal.toFixed(3)}</span></div>

          <div class="separator">------------------------------</div>
          <div class="center strong">VENTES</div>
          <div class="separator">------------------------------</div>

          ${salesRows || '<div class="center muted">Aucune vente</div>'}

          <div class="row strong"><span>NOMBRE D\'ARTICLES VENDUS</span><span>${summary.itemCount}</span></div>
          <div class="row strong"><span>NOMBRE TICKETS DE VENTES</span><span>${summary.ticketCount}</span></div>

          <div class="separator">------------------------------</div>
          <div class="center strong">CLOTURE</div>
          <div class="separator">------------------------------</div>

          <div class="row"><span>NOMBRE TICKETS DE VENTES</span><span>${summary.ticketCount}</span></div>
          <div class="row strong"><span>MONTANT DE CLOTURE</span><span>${summary.closureAmount.toFixed(3)}</span></div>
          <div class="row"><span>ECART</span><span>${summary.difference.toFixed(3)}</span></div>
          <div class="row"><span>DATE FERMETURE SESSION</span><span>${summary.sessionCloseAt ? new Date(summary.sessionCloseAt).toLocaleString('fr-FR') : '-'}</span></div>

          <div class="separator">------------------------------</div>
          <div class="center strong">FIN</div>
        </div>
      </body>
      </html>
    `;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.width = '0px';
    iframe.style.height = '0px';
    iframe.style.border = 'none';
    iframe.style.left = '-9999px';
    document.body.appendChild(iframe);

    if (iframe.contentWindow) {
      iframe.contentWindow.document.open();
      iframe.contentWindow.document.write(html);
      iframe.contentWindow.document.close();
      iframe.contentWindow.focus();
      setTimeout(() => {
        iframe.contentWindow?.print();
        setTimeout(() => {
          document.body.removeChild(iframe);
        }, 1000);
      }, 300);
    }

    await recordAuditLog({
      action: 'created',
      entityType: 'system',
      entityName: 'Cloture de caisse',
      actor: user?.name,
      details: `${summary.cashierName} - ${summary.date}`,
    });
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
            <ReceiptText className="h-5 w-5 text-primary" />
            Cloture de caisse
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchClosure}
            disabled={!selectedCashierId || !selectedDate || isLoading}
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          <button
            onClick={printClosure}
            disabled={!summary}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <Printer className="h-4 w-4" />
            Imprimer
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-7xl p-6">
        <div className="mb-6 grid gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm md:grid-cols-3">
          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-muted-foreground">Caissier</label>
            <div className="relative">
              <User2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <select
                value={selectedCashierId}
                onChange={(e) => setSelectedCashierId(e.target.value)}
                className="w-full rounded-xl border bg-muted/20 py-2.5 pl-10 pr-4 text-sm outline-none transition-all focus:ring-2 focus:ring-primary/20"
                disabled={isUsersLoading}
              >
                <option value="">{isUsersLoading ? 'Chargement...' : 'Choisir un caissier'}</option>
                {cashiers.map((cashier) => (
                  <option key={cashier.id} value={cashier.id}>
                    {cashier.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-muted-foreground">Date</label>
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full rounded-xl border bg-muted/20 py-2.5 pl-10 pr-4 text-sm outline-none transition-all focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          <div className="flex items-end">
            <div className="w-full rounded-xl border border-dashed border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
              Ticket de cloture pour <span className="font-semibold text-foreground">{selectedCashierName}</span> le{' '}
              <span className="font-semibold text-foreground">{selectedDate || '-'}</span>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Chargement de la cloture...</p>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700 shadow-sm">
            {error}
          </div>
        ) : !summary ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card py-24 text-muted-foreground shadow-sm">
            <ReceiptText className="h-12 w-12 opacity-30" />
            <p className="font-medium">Aucune cloture disponible</p>
            <p className="text-sm">Choisissez un caissier et une date pour afficher le recapitulatif.</p>
          </div>
        ) : (
          <>
            <div className="mb-6 grid gap-4 md:grid-cols-4">
              {[
                { label: 'Total vente', value: `${summary.totalSales.toFixed(3)} DT` },
                { label: 'Espèce', value: `${summary.cashTotal.toFixed(3)} DT` },
                { label: 'Remises', value: `${summary.totalDiscount.toFixed(3)} DT` },
                { label: 'Tickets', value: summary.ticketCount },
              ].map((stat) => (
                <div key={stat.label} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                  <p className="mt-1 text-2xl font-bold text-foreground">{stat.value}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
              <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <h2 className="mb-4 text-base font-bold text-foreground">Résumé</h2>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Caissier</span>
                    <span className="font-semibold text-foreground">{summary.cashierName}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Date ouverture</span>
                    <span className="text-right font-semibold text-foreground">
                      {summary.sessionOpenAt ? new Date(summary.sessionOpenAt).toLocaleString() : '-'}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Date fermeture</span>
                    <span className="text-right font-semibold text-foreground">
                      {summary.sessionCloseAt ? new Date(summary.sessionCloseAt).toLocaleString() : '-'}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Etat session</span>
                    <span className="font-semibold text-foreground">{summary.sessionState || '-'}</span>
                  </div>
                  <div className="border-t pt-3" />
                  {summary.payments.map((payment) => (
                    <div key={payment.name} className="flex justify-between gap-4">
                      <span className="text-muted-foreground">{payment.name}</span>
                      <span className="font-semibold text-foreground">{payment.amount.toFixed(3)} DT</span>
                    </div>
                  ))}
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Articles vendus</span>
                    <span className="font-semibold text-foreground">{summary.itemCount}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Montant clôture</span>
                    <span className="font-semibold text-foreground">{summary.closureAmount.toFixed(3)} DT</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Écart</span>
                    <span className="font-semibold text-foreground">{summary.difference.toFixed(3)} DT</span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <h2 className="mb-4 text-base font-bold text-foreground">Détail des ventes</h2>
                {summary.salesByFamily.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucune vente pour cette sélection.</p>
                ) : (
                  <div className="space-y-6">
                    {summary.salesByFamily.map((family) => (
                      <div key={family.family}>
                        <div className="mb-3 rounded-lg bg-muted px-3 py-2 text-sm font-semibold text-foreground">
                          Famille : {family.family}
                        </div>
                        <div className="space-y-3">
                          {family.lines.map((line) => (
                            <div key={line.id} className="rounded-xl border border-border p-3">
                              <div className="flex items-start justify-between gap-4">
                                <div>
                                  <p className="font-medium text-foreground">{line.name}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {line.quantity} x {line.unitPrice.toFixed(3)} DT
                                  </p>
                                  {line.discount > 0 && (
                                    <p className="text-xs text-amber-600">
                                      Remise {line.discount.toFixed(0)}% - {line.discountAmount.toFixed(3)} DT
                                    </p>
                                  )}
                                </div>
                                <div className="text-right font-semibold text-foreground">
                                  {line.total.toFixed(3)} DT
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
