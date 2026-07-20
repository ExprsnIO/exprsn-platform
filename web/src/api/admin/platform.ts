/**
 * Platform config-overrides store API (TASK-039) — gateway-owned, not a module.
 * Lists every overridable env key with metadata; writes are validated against
 * the server-side descriptor (unknown keys 404, denylisted 403, bad values 422,
 * stale version 409).
 */
import { http } from '@/lib/http';

export interface PlatformConfigKey {
  key: string;
  module: string;
  type: 'boolean' | 'int' | 'string' | 'enum';
  values?: string[];
  description: string;
  restartRequired: boolean;
  isSecret: boolean;
  source: 'override' | 'env' | 'default';
  envSet: boolean;
  effectiveValue: string | null;
  override: {
    value: string | null;
    updatedBy: string | null;
    updatedAt: string;
    version: number;
  } | null;
  pendingRestart: boolean;
}

export interface PlatformConfigList {
  keys: PlatformConfigKey[];
  anomalies: { key: string; reason: string }[];
  channel: string;
}

export const platformAdminApi = {
  list: () => http.get<PlatformConfigList>('/platform/api/config'),
  set: (key: string, value: string, version?: number) =>
    http.put<{ key: string; version: number; pendingRestart: boolean }>(
      `/platform/api/config/${encodeURIComponent(key)}`,
      version === undefined ? { value } : { value, version },
    ),
  remove: (key: string) =>
    http.del<{ key: string; reverted: boolean; pendingRestart: boolean }>(
      `/platform/api/config/${encodeURIComponent(key)}`,
    ),
};
