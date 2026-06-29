/**
 * FileVault admin API (/filevault/api/admin/* + storage). Dedup/duplicates,
 * cleanup, per-user quotas, blob migration/verification, storage health. All
 * require CA-bearer with the `admin` permission.
 */
import { http } from '@/lib/http';

export interface Quota {
  userId: string;
  quotaBytes?: number;
  usedBytes?: number;
  fileCount?: number;
  [k: string]: unknown;
}

function q(params?: Record<string, string | number | undefined>): string {
  if (!params) return '';
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const filevaultAdminApi = {
  stats: () => http.get<Record<string, unknown>>('/filevault/api/admin/stats'),
  deduplication: () => http.get<Record<string, unknown>>('/filevault/api/admin/deduplication'),
  duplicates: () => http.get<{ duplicates?: Array<Record<string, unknown>>; data?: Array<Record<string, unknown>> }>('/filevault/api/admin/duplicates'),
  storageHealth: () => http.get<Record<string, unknown>>('/filevault/api/admin/storage/health'),

  listQuotas: (limit = 100) => http.get<{ quotas?: Quota[]; data?: Quota[] }>(`/filevault/api/admin/quotas${q({ limit })}`),
  setQuota: (userId: string, quotaBytes: number) => http.put<unknown>(`/filevault/api/admin/quotas/${userId}`, { quotaBytes }),

  cleanup: (minAge?: number) => http.post<Record<string, unknown>>('/filevault/api/admin/cleanup', minAge != null ? { minAge } : {}),
  cleanupBlobs: (minAge?: number) => http.post<Record<string, unknown>>('/filevault/api/admin/cleanup/blobs', minAge != null ? { minAge } : {}),
  verifyBlob: (blobId: string) => http.post<Record<string, unknown>>(`/filevault/api/admin/verify/${blobId}`, {}),
  migrate: (body: { fileIds: string[]; toBackend: string; deleteSource?: boolean }) =>
    http.post<Record<string, unknown>>('/filevault/api/admin/migrate', body),

  storageUsage: () => http.get<Record<string, unknown>>('/filevault/api/storage/usage'),
  storageQuota: () => http.get<Record<string, unknown>>('/filevault/api/storage/quota'),
};
