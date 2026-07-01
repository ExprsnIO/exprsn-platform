import { http } from '@/lib/http';

// Prefetch cache/proxy. Endpoints under /prefetch/api/*. No realtime namespace,
// no Sequelize models — a thin cache + queue surface in front of the timeline.

/** Cache presence/tier for a user's prefetched timeline (GET cache/status). */
export interface PrefetchCacheStatus {
  cached: boolean;
  tier?: 'hot' | 'warm' | string;
  ttl?: number;
  expiresIn?: number;
  [k: string]: unknown;
}

export const prefetchApi = {
  /** Service status / info. */
  status: () => http.get<Record<string, unknown>>('/prefetch/api/prefetch'),

  /** Whether a user's timeline is currently cached, and in which tier. */
  cacheStatus: (userId: string) =>
    http.get<PrefetchCacheStatus>(`/prefetch/api/cache/status/${userId}`),

  /** The cached timeline payload (404 when not cached). */
  getCached: (userId: string) =>
    http.get<{ posts?: unknown[]; fetchedAt?: number; postsCount?: number }>(
      `/prefetch/api/cache/${userId}`,
    ),

  /**
   * Queue a background prefetch of a user's timeline (returns 202 + jobId).
   * Fire-and-forget warm-up; cheaper than `prefetchNow` since it goes through
   * the Bull queue rather than blocking on the timeline fetch.
   */
  schedulePrefetch: (userId: string, priority: 'high' | 'medium' | 'low' = 'medium') =>
    http.post<{ jobId?: string }>(`/prefetch/api/prefetch/schedule/${userId}`, { priority }),

  /** Prefetch immediately (bypasses the queue; resolves with the result). */
  prefetchNow: (userId: string) =>
    http.post<{ success: boolean; tier?: string; postsCount?: number; duration?: number }>(
      `/prefetch/api/prefetch/immediate/${userId}`,
    ),
};
