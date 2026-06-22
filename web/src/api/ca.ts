import { http, ApiError } from '@/lib/http';
import { config } from '@/lib/config';
import { tokenStore } from '@/lib/token';

// Certificate Authority admin. Endpoints under /ca/admin/api/* (bearer admin —
// the signed-in user must be a platform admin; see PLATFORM_ADMIN_EMAILS).
export interface Certificate {
  id: string;
  serialNumber: string;
  type?: string;
  commonName?: string;
  organization?: string | null;
  notBefore?: string;
  notAfter?: string;
  status?: string;
  revocationReason?: string | null;
  [k: string]: unknown;
}

export interface CaToken {
  id: string;
  userId?: string;
  certificateId?: string;
  permissionRead?: boolean;
  permissionWrite?: boolean;
  permissionAppend?: boolean;
  permissionDelete?: boolean;
  permissionUpdate?: boolean;
  resourceType?: string;
  resourceValue?: string;
  expiryType?: string;
  issuedAt?: string;
  expiresAt?: string;
  status?: string;
  revokedReason?: string | null;
  [k: string]: unknown;
}

export interface CaPagination {
  limit: number;
  offset: number;
  total: number;
  hasMore: boolean;
}

function pageQuery(params?: { limit?: number; offset?: number }): string {
  const sp = new URLSearchParams();
  if (params?.limit != null) sp.set('limit', String(params.limit));
  if (params?.offset != null) sp.set('offset', String(params.offset));
  const q = sp.toString();
  return q ? `?${q}` : '';
}

export const caApi = {
  listCertificates: (params?: { limit?: number; offset?: number }) =>
    http.get<{ certificates: Certificate[]; pagination: CaPagination }>(
      `/ca/admin/api/certificates${pageQuery(params)}`,
    ),
  listTokens: (params?: { limit?: number; offset?: number }) =>
    http.get<{ tokens: CaToken[]; pagination: CaPagination }>(
      `/ca/admin/api/tokens${pageQuery(params)}`,
    ),
  revokeCertificate: (id: string, reason: string) =>
    http.post<{ success: boolean }>(`/ca/admin/api/certificates/${id}/revoke`, { reason }),
  revokeToken: (id: string, reason: string) =>
    http.post<{ success: boolean }>(`/ca/admin/api/tokens/${id}/revoke`, { reason }),

  /** Download a certificate's PEM (bearer-authenticated → blob save). */
  downloadCertificate: async (cert: Certificate): Promise<void> => {
    const headers = new Headers();
    const token = tokenStore.get();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const res = await fetch(`${config.apiBase}/ca/admin/api/certificates/${cert.id}/download`, {
      headers,
      credentials: 'include',
    });
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
    a.download = `${cert.commonName || cert.serialNumber}.pem`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};
