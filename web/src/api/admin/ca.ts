/**
 * CA admin API (/ca/admin/api/*). Bearer-admin path: the signed-in user must be
 * a platform admin (PLATFORM_ADMIN_EMAILS). Covers the full admin surface —
 * stats/activity/timeseries, certificate + token lifecycle, OCSP/CRL, the
 * directory listings (users/groups/roles), and masked config.
 */
import { http, ApiError } from '@/lib/http';
import { config } from '@/lib/config';
import { tokenStore } from '@/lib/token';
import type { Certificate, CaToken } from '@/api/ca';

export type { Certificate, CaToken } from '@/api/ca';

/** Live revocation status for a single certificate (OCSP/CRL aware). */
export interface CertificateStatus {
  success: boolean;
  serialNumber?: string;
  /** good | revoked | unknown (server-normalized). */
  status?: string;
  revoked?: boolean;
  revocationReason?: string | null;
  revokedAt?: string | null;
  ocsp?: { enabled?: boolean; status?: string };
  crl?: {
    enabled?: boolean;
    crlNumber?: number | string;
    thisUpdate?: string;
    nextUpdate?: string;
    listed?: boolean;
  };
  [k: string]: unknown;
}

/** Result of revoking a certificate — surfaces the cert→token cascade count. */
export interface RevokeCertResult {
  success: boolean;
  revokedTokenCount?: number;
  [k: string]: unknown;
}

/** Export formats supported by /ca/api/certificates/:id/export. */
export type CertExportFormat = 'pem' | 'der' | 'chain' | 'pkcs12';

const EXPORT_EXT: Record<CertExportFormat, string> = {
  pem: 'pem',
  der: 'der',
  chain: 'chain.pem',
  pkcs12: 'p12',
};

export interface CaStats {
  [k: string]: unknown;
}
export interface ActivityEntry {
  id?: string;
  type?: string;
  action?: string;
  description?: string;
  createdAt?: string;
  [k: string]: unknown;
}
export interface CaUser {
  id: string;
  username?: string;
  email?: string;
  status?: string;
  createdAt?: string;
  [k: string]: unknown;
}

function q(params?: Record<string, string | number | undefined>): string {
  if (!params) return '';
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export interface IssueCertInput {
  type: string;
  commonName: string;
  organization?: string;
  keySize?: number;
  validityDays?: number;
  subjectAlternativeNames?: string[];
}

export interface GenerateTokenInput {
  certificateId: string;
  resourceType: string;
  resourceValue: string;
  permissions?: Record<string, boolean>;
  expiryType?: string;
  expiryValue?: number;
}

export const caAdminApi = {
  stats: () => http.get<CaStats>('/ca/admin/api/stats'),
  health: () => http.get<Record<string, unknown>>('/ca/admin/api/health'),
  activity: (params?: { limit?: number; offset?: number }) =>
    http.get<{ activities?: ActivityEntry[]; activity?: ActivityEntry[]; data?: ActivityEntry[] }>(
      `/ca/admin/api/activity${q(params)}`,
    ),
  recentCertificates: (limit = 20) =>
    http.get<{ certificates: Certificate[] }>(`/ca/admin/api/certificates/recent${q({ limit })}`),
  recentTokens: (limit = 20) => http.get<{ tokens: CaToken[] }>(`/ca/admin/api/tokens/recent${q({ limit })}`),
  timeseries: (type: 'certificates' | 'tokens' | 'users', params?: { days?: number; interval?: string }) =>
    http.get<{ series?: Array<{ bucket: string; count: number }>; data?: unknown }>(
      `/ca/admin/api/timeseries/${type}${q(params)}`,
    ),

  listCertificates: (params?: { status?: string; type?: string; limit?: number; offset?: number }) =>
    http.get<{ certificates: Certificate[]; pagination?: Record<string, number> }>(
      `/ca/admin/api/certificates${q(params)}`,
    ),
  issueCertificate: (input: IssueCertInput) =>
    http.post<{ certificate: Certificate }>('/ca/admin/api/certificates/issue', input),
  revokeCertificate: (id: string, reason: string) =>
    http.post<RevokeCertResult>(`/ca/admin/api/certificates/${id}/revoke`, { reason }),

  /**
   * Live revocation status for a cert (OCSP/CRL aware). Lives under /ca/api
   * (owner-or-admin); admins pass the check for any cert. Cheap enough to poll.
   */
  certificateStatus: (id: string) =>
    http.get<CertificateStatus>(`/ca/api/certificates/${id}/status`),

  /**
   * Authenticated export → blob download. Binary for der/pkcs12, PEM text for
   * pem/chain. pkcs12 requires a passphrase (server 400s PASSWORD_REQUIRED).
   * Mirrors caApi.downloadCertificate's bearer→blob pattern.
   */
  exportCertificate: async (cert: Certificate, format: CertExportFormat, password?: string): Promise<void> => {
    const headers = new Headers();
    const token = tokenStore.get();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const sp = new URLSearchParams({ format });
    if (password) sp.set('password', password);
    const res = await fetch(
      `${config.apiBase}/ca/api/certificates/${cert.id}/export?${sp.toString()}`,
      { headers, credentials: 'include' },
    );
    if (!res.ok) {
      let body: Record<string, unknown> = {};
      try {
        body = await res.json();
      } catch {
        /* non-JSON */
      }
      throw new ApiError(res.status, body);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${cert.commonName || cert.serialNumber}.${EXPORT_EXT[format]}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  listTokens: (params?: { status?: string; expiryType?: string; limit?: number; offset?: number }) =>
    http.get<{ tokens: CaToken[]; pagination?: Record<string, number> }>(`/ca/admin/api/tokens${q(params)}`),
  generateToken: (input: GenerateTokenInput) =>
    http.post<{ token: CaToken; tokenValue?: string }>('/ca/admin/api/tokens/generate', input),
  validateToken: (tokenId: string, requiredPermission?: string, resourceValue?: string) =>
    http.post<Record<string, unknown>>('/ca/admin/api/tokens/validate', {
      tokenId,
      requiredPermission,
      resourceValue,
    }),
  revokeToken: (id: string, reason: string) =>
    http.post<{ success: boolean }>(`/ca/admin/api/tokens/${id}/revoke`, { tokenId: id, reason }),

  ocspStatus: () => http.get<Record<string, unknown>>('/ca/admin/api/ocsp/status'),
  crlStatus: () => http.get<Record<string, unknown>>('/ca/admin/api/crl/status'),
  generateCrl: () => http.post<Record<string, unknown>>('/ca/admin/api/crl/generate', {}),

  listUsers: (params?: { limit?: number; offset?: number; search?: string }) =>
    http.get<{ users: CaUser[]; pagination?: Record<string, number> }>(`/ca/admin/api/users${q(params)}`),
  listGroups: () => http.get<{ groups: Array<Record<string, unknown>> }>('/ca/admin/api/groups'),
  listRoles: () => http.get<{ roles: Array<Record<string, unknown>> }>('/ca/admin/api/roles'),

  getConfig: () => http.get<Record<string, unknown>>('/ca/admin/api/config'),
  updateConfig: (updates: Record<string, unknown>) =>
    http.post<Record<string, unknown>>('/ca/admin/api/config/update', { updates }),
};
