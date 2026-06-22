/**
 * Spark (messaging) admin API. The admin surface is the Bull queue controls
 * (requireAuth + admin) plus the runtime config sections. Messaging content
 * itself is E2EE and not an admin concern.
 */
import { http } from '@/lib/http';

export interface SparkQueueStats {
  [k: string]: unknown;
}

export const SPARK_CONFIG_SECTIONS = ['messaging-settings', 'messaging-moderation'];

export const sparkAdminApi = {
  queueStats: () => http.get<Record<string, unknown>>('/spark/api/queues/stats'),
  queueStatsByName: (name: string) => http.get<Record<string, unknown>>(`/spark/api/queues/${name}/stats`),
  pause: (name: string) => http.post<unknown>(`/spark/api/queues/${name}/pause`, {}),
  resume: (name: string) => http.post<unknown>(`/spark/api/queues/${name}/resume`, {}),
  clean: (name: string, grace = 3600000) => http.post<unknown>(`/spark/api/queues/${name}/clean`, { grace }),

  getConfigSection: (s: string) => http.get<unknown>(`/spark/api/config/${s}`),
  saveConfigSection: (s: string, data: unknown) => http.post<unknown>(`/spark/api/config/${s}`, data),
};
