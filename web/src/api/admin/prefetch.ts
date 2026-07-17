/**
 * Prefetch admin API (/prefetch/api/*). The queue/metrics/per-user/config
 * client lives in ./jobs (shared with the cross-module Jobs & Queues section)
 * and is re-exported here so PrefetchSection has a single import surface; this
 * file adds the prefetch-specific extras (health).
 *
 * Note: the prefetch.js router is double-mounted at /api/prefetch and
 * /api/cache — we always use the /api/prefetch spelling.
 */
import { http } from '@/lib/http';

export { prefetchAdminApi, PREFETCH_CONFIG_SECTIONS, type Job, type QueueStats } from './jobs';

export interface PrefetchHealth {
  service?: string;
  status?: string;
  uptime?: number;
  timestamp?: string;
  checks?: Record<string, { status?: string; latency?: string; error?: string; [k: string]: unknown }>;
  [k: string]: unknown;
}

export const prefetchModuleApi = {
  /** Dependency health (redis/timeline/ca/cache) — unauthenticated. */
  health: () => http.get<PrefetchHealth>('/prefetch/health'),
};
