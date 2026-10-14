'use client';

export type AuditEntityType = 'product' | 'customer' | 'invoice' | 'cashier' | 'system' | 'session' | 'stock';
export type AuditActionType =
  | 'created'
  | 'updated'
  | 'archived'
  | 'restored'
  | 'enabled'
  | 'disabled'
  | 'bulk-enabled'
  | 'bulk-disabled'
  | 'opened'
  | 'closed'
  | 'transferred';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  action: AuditActionType;
  entityType: AuditEntityType;
  entityName: string;
  actor: string;
  details?: string;
}

interface RecordAuditLogInput {
  action: AuditActionType;
  entityType: AuditEntityType;
  entityName: string;
  actor?: string | null;
  details?: string;
}

export const AUDIT_LOG_EVENT = 'pos_audit_log_updated';

/**
 * Fetches logs from the server-side storage.
 */
export async function getAuditLogs(): Promise<AuditLogEntry[]> {
  try {
    const response = await fetch('/api/audit', { cache: 'no-store' });
    const data = await response.json();
    if (data.success) {
      return data.logs || [];
    }
    return [];
  } catch (error) {
    console.error('Failed to fetch audit logs:', error);
    return [];
  }
}

/**
 * Records a log entry on the server.
 */
export async function recordAuditLog(input: RecordAuditLogInput) {
  const nextEntry: AuditLogEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    action: input.action,
    entityType: input.entityType,
    entityName: input.entityName,
    actor: input.actor?.trim() || 'Utilisateur inconnu',
    details: input.details?.trim() || undefined,
  };

  try {
    const response = await fetch('/api/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nextEntry),
      cache: 'no-store',
    });

    if (response.ok) {
      // Notify other components in the same tab that something changed
      window.dispatchEvent(new CustomEvent(AUDIT_LOG_EVENT));
    } else {
      const errorData = await response.json();
      console.error('Failed to record audit log:', errorData.error);
    }
  } catch (error) {
    console.error('Failed to record audit log:', error);
  }
}

/**
 * Clears all logs on the server.
 */
export async function clearAuditLogs() {
  try {
    const response = await fetch('/api/audit', { 
      method: 'DELETE',
      cache: 'no-store',
    });
    if (response.ok) {
      window.dispatchEvent(new CustomEvent(AUDIT_LOG_EVENT));
    }
  } catch (error) {
    console.error('Failed to clear audit logs:', error);
  }
}

export function getAuditActionLabel(action: AuditActionType) {
  switch (action) {
    case 'created':
      return 'Creation';
    case 'updated':
      return 'Modification';
    case 'archived':
      return 'Archivage';
    case 'restored':
      return 'Restauration';
    case 'enabled':
      return 'Activation';
    case 'disabled':
      return 'Desactivation';
    case 'bulk-enabled':
      return 'Activation groupee';
    case 'bulk-disabled':
      return 'Desactivation groupee';
    case 'opened':
      return 'Ouverture';
    case 'closed':
      return 'Fermeture';
    case 'transferred':
      return 'Transfert';
    default:
      return action;
  }
}

export function getAuditEntityLabel(entityType: AuditEntityType) {
  switch (entityType) {
    case 'product':
      return 'Produit';
    case 'customer':
      return 'Client';
    case 'invoice':
      return 'Facture';
    case 'cashier':
      return 'Caissier';
    case 'system':
      return 'Systeme';
    case 'session':
      return 'Session';
    case 'stock':
      return 'Stock';
    default:
      return entityType;
  }
}
