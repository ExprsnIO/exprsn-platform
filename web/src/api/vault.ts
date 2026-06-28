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

/** Permission a group may hold on a shared secret. */
export type SecretPermission = 'read' | 'write' | 'manage';

/**
 * A secret shared with a group. METADATA ONLY — the list/share/revoke endpoints
 * never return the plaintext `value`; that lives behind the explicit reveal call.
 */
export interface GroupSecret {
  secretId: string;
  path: string;
  key: string;
  permission: SecretPermission;
  grantedBy?: string | null;
  expiresAt?: string | null;
  grantedAt?: string;
  updatedAt?: string;
  secretCreatedAt?: string;
  secretUpdatedAt?: string;
  secretVersion?: number;
}

export interface ShareSecretBody {
  permission?: SecretPermission;
  /** ISO timestamp; omit for a grant that never expires. */
  expiresAt?: string;
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

  // --- Group-shared secrets (admin only on the gateway) -------------------
  /** Metadata only — never returns plaintext values. */
  listGroupSecrets: (groupId: string) =>
    http.get<{ success: boolean; data: GroupSecret[]; count: number }>(
      `/vault/api/groups/${encodeURIComponent(groupId)}/secrets`,
    ),
  /** Share an EXISTING secret with the group (404 if the secret doesn't exist). */
  shareSecretWithGroup: (groupId: string, path: string, body: ShareSecretBody = {}) =>
    http.post<{ success: boolean; data: GroupSecret }>(
      `/vault/api/groups/${encodeURIComponent(groupId)}/secrets/${toUrlPath(path)}/share`,
      body,
    ),
  /** Revoke the group's grant on a secret (404 if no grant). */
  revokeGroupSecret: (groupId: string, path: string) =>
    http.del<{ success: boolean }>(
      `/vault/api/groups/${encodeURIComponent(groupId)}/secrets/${toUrlPath(path)}/share`,
    ),
  /**
   * The ONLY plaintext path. Server-audited, admin-only, one-shot. Caller must
   * NOT persist the returned `value` in any query cache.
   */
  revealGroupSecret: (groupId: string, path: string) =>
    http.get<{ success: boolean; data: Secret }>(
      `/vault/api/groups/${encodeURIComponent(groupId)}/secrets/${toUrlPath(path)}/reveal`,
    ),
};
