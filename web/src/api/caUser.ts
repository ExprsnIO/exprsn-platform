import { http, ApiError } from '@/lib/http';
import { config } from '@/lib/config';
import { tokenStore } from '@/lib/token';

/**
 * User-scoped Certificate Authority client (`/ca/api/*`). These routes are
 * OWNER-scoped: every call returns/acts on the signed-in user's own
 * certificates and tokens, authenticated by the SPA's CA bearer (sent by the
 * shared `http` wrapper). This is deliberately separate from `caApi`
 * (`@/api/ca`), which targets the admin routes (`/ca/admin/api/*`) and must not
 * be repurposed for end-user data.
 */

// ── Certificates ──────────────────────────────────────────────────────────

export type UserCertType = 'entity' | 'san' | 'code_signing' | 'client' | 'server';

export interface UserCertificate {
  id: string;
  serialNumber: string;
  commonName?: string;
  type?: string;
  status?: string;
  issuerId?: string | null;
  organization?: string | null;
  notBefore?: string;
  notAfter?: string;
  fingerprint?: string;
  revokedAt?: string | null;
  revocationReason?: string | null;
  createdAt?: string;
  [k: string]: unknown;
}

/** Single certificate (GET /:id) — never includes private key material. */
export interface UserCertificateDetail {
  id: string;
  serialNumber: string;
  commonName?: string;
  type?: string;
  status?: string;
  notBefore?: string;
  notAfter?: string;
  fingerprint?: string;
}

/** One link of a certificate chain (GET /:id/chain). */
export interface CertChainEntry {
  pem?: string;
  commonName?: string;
  serialNumber?: string;
  type?: string;
  [k: string]: unknown;
}

/** Live revocation status (GET /:id/status) — the SPA polls this. */
export interface CertStatus {
  success: boolean;
  serialNumber: string;
  status: string;
  revoked: boolean;
  revocationReason: string | null;
  revokedAt: string | null;
  ocsp: { enabled: boolean; status: string | null };
  crl: {
    enabled: boolean;
    crlNumber: number | null;
    thisUpdate: string | null;
    nextUpdate: string | null;
    listed: boolean | null;
  };
}

export interface GenerateCertBody {
  commonName: string;
  type: UserCertType;
  subjectAlternativeNames?: string[];
  keySize?: 2048 | 4096;
  validityDays?: number;
  /**
   * When set, the private key is stored encrypted under this passphrase
   * (enables PKCS#12 export) but the cert can NO LONGER sign API tokens. When
   * omitted, the key is CA-held (token-capable) and the raw `privateKey` is
   * returned ONCE in the response.
   */
  password?: string;
  organization?: string;
  organizationalUnit?: string;
  country?: string;
  state?: string;
  locality?: string;
  email?: string;
}

export interface GenerateCertResponse {
  success: boolean;
  certificate: {
    id: string;
    serialNumber: string;
    commonName: string;
    fingerprint: string;
    notBefore: string;
    notAfter: string;
    pem: string;
  };
  /** Present only for no-passphrase (CA-held) certs — shown to the user once. */
  privateKey?: string;
}

export interface RevokeCertResponse {
  success: boolean;
  certificate: UserCertificate;
  revokedTokenCount: number;
}

export type ExportFormat = 'pem' | 'der' | 'chain' | 'pkcs12';

// ── Tokens ────────────────────────────────────────────────────────────────

export interface TokenPermissions {
  read?: boolean;
  write?: boolean;
  append?: boolean;
  delete?: boolean;
  update?: boolean;
}

export type ResourceType = 'url' | 'did' | 'cid';
export type ExpiryType = 'time' | 'use' | 'persistent';

export interface UserToken {
  id: string;
  certificateId?: string;
  resourceType?: ResourceType | string;
  resourceValue?: string;
  permissions?: TokenPermissions;
  expiryType?: ExpiryType | string;
  expiresAt?: string | null;
  usesRemaining?: number | null;
  status?: string;
  createdAt?: string;
  [k: string]: unknown;
}

export interface GenerateTokenBody {
  certificateId: string;
  permissions: TokenPermissions;
  resource: { type: ResourceType; value: string };
  expiryType: ExpiryType;
  /** Absolute epoch ms — required for time-based tokens. */
  expiresAt?: number;
  /** Required for use-based tokens. */
  maxUses?: number;
}

// ── Authed-blob download (mirrors caApi.downloadCertificate / filevaultApi) ──

/** Best-effort filename from a Content-Disposition header. */
function filenameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(header);
  return m ? decodeURIComponent(m[1]) : fallback;
}

/**
 * Fetch a bearer-authed binary endpoint and trigger a browser save. The CA
 * export/download routes are bearer-authenticated (no query token), so we send
 * the Authorization header and save the resulting blob rather than navigating.
 */
async function downloadAuthedBlob(
  path: string,
  fallbackName: string,
  headers?: Record<string, string>,
): Promise<void> {
  const finalHeaders = new Headers(headers);
  const token = tokenStore.get();
  if (token) finalHeaders.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${config.apiBase}${path}`, {
    headers: finalHeaders,
    credentials: 'include',
  });
  if (!res.ok) {
    let body: Record<string, unknown> = {};
    try {
      body = await res.json();
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, body);
  }
  const blob = await res.blob();
  const name = filenameFromDisposition(res.headers.get('content-disposition'), fallbackName);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function listQuery(params?: { type?: string; status?: string; limit?: number; offset?: number }): string {
  const sp = new URLSearchParams();
  if (params?.type) sp.set('type', params.type);
  if (params?.status) sp.set('status', params.status);
  if (params?.limit != null) sp.set('limit', String(params.limit));
  if (params?.offset != null) sp.set('offset', String(params.offset));
  const q = sp.toString();
  return q ? `?${q}` : '';
}

export const caUserApi = {
  // --- Certificates (owner-scoped) ---
  listCertificates: (params?: { type?: string; status?: string; limit?: number; offset?: number }) =>
    http.get<{ success: boolean; certificates: UserCertificate[]; count: number }>(
      `/ca/api/certificates${listQuery(params)}`,
    ),

  getCertificate: (id: string) =>
    http.get<{ success: boolean; certificate: UserCertificateDetail }>(`/ca/api/certificates/${id}`),

  getCertificateChain: (id: string) =>
    http.get<{ success: boolean; chain: CertChainEntry[]; chainLength: number }>(
      `/ca/api/certificates/${id}/chain`,
    ),

  /** Live revocation status — polled by the SPA via TanStack `refetchInterval`. */
  getCertificateStatus: (id: string) =>
    http.get<CertStatus>(`/ca/api/certificates/${id}/status`),

  generateCertificate: (body: GenerateCertBody) =>
    http.post<GenerateCertResponse>('/ca/api/certificates/generate', body),

  revokeCertificate: (id: string, reason: string) =>
    http.post<RevokeCertResponse>(`/ca/api/certificates/${id}/revoke`, { reason }),

  /** NOTE: the backend requires `certificateId` in the body (same as the :id). */
  renewCertificate: (id: string, opts?: { validityDays?: number; keySize?: 2048 | 4096 }) =>
    http.post<GenerateCertResponse>(`/ca/api/certificates/${id}/renew`, {
      certificateId: id,
      ...opts,
    }),

  /**
   * Export a certificate as a downloaded file. PKCS#12 needs a passphrase
   * (sent via the `X-Export-Password` header, not the URL). Errors surface as
   * ApiError (400 PASSWORD_REQUIRED / NO_PRIVATE_KEY / INVALID_PASSWORD).
   */
  exportCertificate: (cert: UserCertificate, format: ExportFormat, password?: string) => {
    const ext = format === 'pkcs12' ? 'p12' : format === 'chain' ? 'chain.pem' : format;
    const base = cert.commonName || cert.serialNumber || 'certificate';
    const headers = format === 'pkcs12' && password ? { 'X-Export-Password': password } : undefined;
    return downloadAuthedBlob(
      `/ca/api/certificates/${cert.id}/export?format=${format}`,
      `${base}.${ext}`,
      headers,
    );
  },

  // --- Tokens (owner-scoped) ---
  listTokens: (status?: string) =>
    http.get<{ success: boolean; tokens: UserToken[] }>(
      `/ca/api/tokens${status ? `?status=${encodeURIComponent(status)}` : ''}`,
    ),

  generateToken: (body: GenerateTokenBody) =>
    http.post<{ success: boolean; token: UserToken }>('/ca/api/tokens/generate', body),

  revokeToken: (tokenId: string, reason: string) =>
    http.post<{ success: boolean; token: UserToken }>('/ca/api/tokens/revoke', { tokenId, reason }),

  /** Time-based tokens only. `expiresAt` is absolute epoch ms in the future. */
  refreshToken: (tokenId: string, expiresAt: number) =>
    http.post<{ success: boolean; token: UserToken }>(`/ca/api/tokens/${tokenId}/refresh`, {
      tokenId,
      expiresAt,
    }),

  introspectToken: (tokenId: string) =>
    http.get<{ success: boolean; introspection: Record<string, unknown> }>(
      `/ca/api/tokens/${tokenId}/introspect`,
    ),
};
