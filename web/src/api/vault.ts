import { http } from '@/lib/http';

// Secrets (vault). Endpoints under /vault/api/*. Secrets are path-addressed
// (e.g. /myapp/db-pw). The list returns metadata only; fetching a single secret
// returns the decrypted `value`.
export interface Secret {
  id: string;
  path: string;
  key: string;
  version?: number;
  status?: string;
  encryptionKeyId?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
  /** Only present on a single-secret GET, not in the list. */
  value?: string;
  [k: string]: unknown;
}

/** Normalize a stored path ("/myapp/db-pw") into a URL suffix ("myapp/db-pw"). */
function toUrlPath(path: string): string {
  return path
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');
}

export const vaultApi = {
  listSecrets: () =>
    http.get<{ success: boolean; data: Secret[]; count: number }>('/vault/api/secrets'),
  getSecret: (path: string) =>
    http.get<{ success: boolean; data: Secret }>(`/vault/api/secrets/${toUrlPath(path)}`),
  createSecret: (path: string, value: string) => {
    const segments = path.split('/').filter(Boolean);
    const key = segments[segments.length - 1] || path;
    return http.post<{ success: boolean; data: Secret }>(
      `/vault/api/secrets/${toUrlPath(path)}`,
      { key, value },
    );
  },
  deleteSecret: (path: string) =>
    http.del<{ success: boolean }>(`/vault/api/secrets/${toUrlPath(path)}`),
};
