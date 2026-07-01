/**
 * Bull queue admin across the two background-job modules:
 *   - timeline: /timeline/api/jobs/* (read `/jobs` perm + admin)
 *   - prefetch: /prefetch/api/prefetch/queue/* + per-user prefetch controls
 * Both run as separate worker processes; these endpoints inspect/steer them.
 */
import { http } from '@/lib/http';

export interface QueueStats {
  waiting?: number;
  active?: number;
  completed?: number;
  failed?: number;
  delayed?: number;
  paused?: number;
  [k: string]: unknown;
}
export interface Job {
  id: string;
  name?: string;
  state?: string;
  attemptsMade?: number;
  failedReason?: string;
  timestamp?: number;
  data?: unknown;
  [k: string]: unknown;
}

function q(params?: Record<string, string | number | undefined>): string {
  if (!params) return '';
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const timelineJobsApi = {
  /** All-queue stats — shape is `{ [queueName]: QueueStats }` (or wrapped). */
  stats: () => http.get<Record<string, unknown>>('/timeline/api/jobs/stats'),
  queueStats: (queue: string) => http.get<Record<string, unknown>>(`/timeline/api/jobs/stats/${queue}`),
  jobs: (queue: string, params?: { status?: string; limit?: number }) =>
    http.get<{ jobs?: Job[]; data?: Job[] }>(`/timeline/api/jobs/${queue}/jobs${q(params)}`),
  job: (queue: string, jobId: string) => http.get<Record<string, unknown>>(`/timeline/api/jobs/${queue}/job/${jobId}`),
  pause: (queue: string) => http.post<unknown>(`/timeline/api/jobs/${queue}/pause`, {}),
  resume: (queue: string) => http.post<unknown>(`/timeline/api/jobs/${queue}/resume`, {}),
  clean: (queue: string, grace = 3600000) => http.post<unknown>(`/timeline/api/jobs/${queue}/clean`, { grace }),
  retry: (queue: string, jobId: string) => http.post<unknown>(`/timeline/api/jobs/${queue}/job/${jobId}/retry`, {}),
  remove: (queue: string, jobId: string) => http.del<unknown>(`/timeline/api/jobs/${queue}/job/${jobId}`),
};

export const TIMELINE_CONFIG_SECTIONS = ['timeline-settings', 'timeline-moderation'];
export const PREFETCH_CONFIG_SECTIONS = ['prefetch-settings', 'prefetch-cache', 'prefetch-performance'];

export const prefetchAdminApi = {
  queueStats: () => http.get<QueueStats & Record<string, unknown>>('/prefetch/api/prefetch/queue/stats'),
  failed: (limit = 20) => http.get<{ jobs?: Job[]; data?: Job[]; failed?: Job[] }>(`/prefetch/api/prefetch/queue/failed${q({ limit })}`),
  retry: (jobId: string) => http.post<unknown>(`/prefetch/api/prefetch/queue/retry/${jobId}`, {}),
  metrics: () => http.get<Record<string, unknown>>('/prefetch/api/prefetch/metrics'),
  metricsByDate: (date: string) => http.get<Record<string, unknown>>(`/prefetch/api/prefetch/metrics/${date}`),

  userStatus: (userId: string) => http.get<Record<string, unknown>>(`/prefetch/api/prefetch/status/${userId}`),
  userCache: (userId: string) => http.get<Record<string, unknown>>(`/prefetch/api/prefetch/${userId}`),
  schedule: (userId: string, priority = 'medium', delay = 0) =>
    http.post<unknown>(`/prefetch/api/prefetch/schedule/${userId}`, { priority, delay }),
  immediate: (userId: string, priority = 'high') => http.post<unknown>(`/prefetch/api/prefetch/immediate/${userId}`, { priority }),
  clearUser: (userId: string) => http.del<unknown>(`/prefetch/api/prefetch/${userId}/timeline`),

  getConfigSection: (s: string) => http.get<unknown>(`/prefetch/api/config/${s}`),
  saveConfigSection: (s: string, data: unknown) => http.post<unknown>(`/prefetch/api/config/${s}`, data),
};

export const timelineConfigApi = {
  getConfigSection: (s: string) => http.get<unknown>(`/timeline/api/config/${s}`),
  saveConfigSection: (s: string, data: unknown) => http.post<unknown>(`/timeline/api/config/${s}`, data),
};

/** Pull a QueueStats map out of whatever envelope the stats endpoint returns. */
export function asQueueMap(raw: unknown): Record<string, QueueStats> {
  if (!raw || typeof raw !== 'object') return {};
  const obj = raw as Record<string, unknown>;
  const inner = obj.stats ?? obj.queues ?? obj.data ?? obj;
  const out: Record<string, QueueStats> = {};
  // Array shape: `[{ name, waiting, ... }]` (e.g. timeline /jobs/stats) — key by
  // each item's `name`, NOT by array index (which yielded queue "0").
  if (Array.isArray(inner)) {
    for (const v of inner) {
      if (v && typeof v === 'object' && typeof (v as Record<string, unknown>).name === 'string') {
        out[String((v as Record<string, unknown>).name)] = v as QueueStats;
      }
    }
    return out;
  }
  for (const [k, v] of Object.entries(inner as Record<string, unknown>)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) out[k] = v as QueueStats;
  }
  return out;
}
