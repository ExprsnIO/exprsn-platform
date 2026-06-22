/**
 * Vault admin API (/vault/api/*). Admin token + policy lifecycle, dashboard
 * stats, audit logs, maintenance, plus the secrets/keys/credentials/leases
 * inventories. Scoped CA-token perms apply (read/write/delete on /admin, /audit,
 * /secrets, …); 403s surface inline.
 */
import { http } from '@/lib/http';
import type { Secret } from '@/api/vault';

export type { Secret } from '@/api/vault';

export interface VaultToken {
  id: string;
  displayName?: string;
  entityType?: string;
  entityId?: string;
  status?: string;
  permissions?: Record<string, boolean>;
  expiresAt?: string;
  createdAt?: string;
  [k: string]: unknown;
}
export interface Policy {
  id: string;
  name?: string;
  policyType?: string;
  status?: string;
  priority?: number;
  enforcementMode?: string;
  [k: string]: unknown;
}
export interface VaultKey {
  id: string;
  name?: string;
  purpose?: string;
  status?: string;
  createdAt?: string;
  [k: string]: unknown;
}
export interface AuditLog {
  id?: string;
  action?: string;
  actor?: string;
  resourceType?: string;
  resourcePath?: string;
  success?: boolean;
  createdAt?: string;
  [k: string]: unknown;
}
export interface Lease {
  id?: string;
  leaseId?: string;
  secretType?: string;
  status?: string;
  expiresAt?: string;
  [k: string]: unknown;
}

function q(params?: Record<string, string | number | undefined>): string {
  if (!params) return '';
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const VAULT_CONFIG_SECTIONS = ['vault', 'vault-secrets', 'vault-encryption', 'vault-access', 'vault-audit'];

export const vaultAdminApi = {
  dashboardStats: () => http.get<Record<string, unknown>>('/vault/api/admin/dashboard/stats'),

  listTokens: (params?: { entityType?: string; status?: string; limit?: number; offset?: number }) =>
    http.get<{ tokens?: VaultToken[]; data?: VaultToken[] }>(`/vault/api/admin/tokens${q(params)}`),
  revokeToken: (id: string, reason: string) => http.post<unknown>(`/vault/api/admin/tokens/${id}/revoke`, { reason }),
  suspendToken: (id: string) => http.post<unknown>(`/vault/api/admin/tokens/${id}/suspend`, {}),
  reactivateToken: (id: string) => http.post<unknown>(`/vault/api/admin/tokens/${id}/reactivate`, {}),
  tokenAnomalies: (id: string) => http.get<Record<string, unknown>>(`/vault/api/admin/tokens/${id}/anomalies`),

  listPolicies: (params?: { policyType?: string; status?: string }) =>
    http.get<{ policies?: Policy[]; data?: Policy[] }>(`/vault/api/admin/policies${q(params)}`),
  createPolicy: (body: Record<string, unknown>) => http.post<Record<string, unknown>>('/vault/api/admin/policies', body),
  deletePolicy: (id: string) => http.del<unknown>(`/vault/api/admin/policies/${id}`),

  purge: () => http.post<unknown>('/vault/api/admin/maintenance/purge', {}),
  clearCache: () => http.post<unknown>('/vault/api/admin/maintenance/cache/clear', {}),
  accessReport: (body?: Record<string, unknown>) => http.post<Record<string, unknown>>('/vault/api/admin/reports/access', body ?? {}),

  // Inventories.
  listSecrets: () => http.get<{ data?: Secret[]; count?: number }>('/vault/api/secrets'),
  listKeys: (params?: { status?: string; purpose?: string }) =>
    http.get<{ keys?: VaultKey[]; data?: VaultKey[] }>(`/vault/api/keys${q(params)}`),
  listCredentials: (params?: { service?: string; status?: string }) =>
    http.get<{ credentials?: Array<Record<string, unknown>>; data?: Array<Record<string, unknown>> }>(`/vault/api/credentials${q(params)}`),
  listLeases: (params?: { status?: string; secretType?: string }) =>
    http.get<{ leases?: Lease[]; data?: Lease[] }>(`/vault/api/dynamic/leases${q(params)}`),

  auditLogs: (params?: { action?: string; actor?: string; limit?: number }) =>
    http.get<{ logs?: AuditLog[]; data?: AuditLog[] }>(`/vault/api/audit/logs${q(params)}`),
  auditStats: () => http.get<Record<string, unknown>>('/vault/api/audit/stats'),

  getConfigSection: (s: string) => http.get<unknown>(`/vault/api/config/${s}`),
  saveConfigSection: (s: string, data: unknown) => http.post<unknown>(`/vault/api/config/${s}`, data),
};
