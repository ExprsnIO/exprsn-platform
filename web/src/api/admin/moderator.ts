/**
 * Moderator admin API (/moderator/api/*). NOTE: nearly every moderator REST
 * route is unauthenticated in this deployment (only POST /api/notifications is
 * service-HMAC), so these calls work with or without a bearer.
 */
import { http } from '@/lib/http';

export interface QueueItem {
  id: string;
  contentType?: string;
  status?: string;
  priority?: number | string;
  riskScore?: number;
  sourceService?: string;
  createdAt?: string;
  [k: string]: unknown;
}
export interface ModReport {
  id: string;
  status?: string;
  reason?: string;
  contentType?: string;
  reportedBy?: string;
  createdAt?: string;
  [k: string]: unknown;
}
export interface ModRule {
  id: string;
  name?: string;
  action?: string;
  enabled?: boolean;
  priority?: number;
  appliesTo?: string;
  [k: string]: unknown;
}
export interface Appeal {
  id: string;
  status?: string;
  reason?: string;
  userId?: string;
  createdAt?: string;
  [k: string]: unknown;
}
export interface Workflow {
  id: string;
  name?: string;
  enabled?: boolean;
  trigger?: string;
  [k: string]: unknown;
}

function q(params?: Record<string, string | number | undefined>): string {
  if (!params) return '';
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const MODERATOR_CONFIG_SECTIONS = ['moderation-rules', 'moderation-ai', 'moderation-queue'];

export const moderatorAdminApi = {
  queue: (params?: { status?: string; priority?: string; limit?: number }) =>
    http.get<{ items?: QueueItem[]; queue?: QueueItem[]; data?: QueueItem[] }>(`/moderator/api/queue${q(params)}`),
  approve: (itemId: string, moderatorId: string) => http.post<unknown>(`/moderator/api/queue/${itemId}/approve`, { moderatorId }),
  reject: (itemId: string, moderatorId: string) => http.post<unknown>(`/moderator/api/queue/${itemId}/reject`, { moderatorId }),
  warn: (id: string) => http.post<unknown>(`/moderator/api/queue/${id}/warn`, {}),
  remove: (id: string) => http.post<unknown>(`/moderator/api/queue/${id}/remove`, {}),
  ban: (id: string) => http.post<unknown>(`/moderator/api/queue/${id}/ban`, {}),
  analyze: (id: string) => http.post<Record<string, unknown>>(`/moderator/api/queue/${id}/analyze`, {}),

  reports: (params?: { status?: string; limit?: number }) =>
    http.get<{ reports?: ModReport[]; data?: ModReport[] }>(`/moderator/api/reports${q(params)}`),
  resolveReport: (id: string, resolvedBy: string, actionTaken?: string) =>
    http.put<unknown>(`/moderator/api/reports/${id}/resolve`, { resolvedBy, actionTaken }),

  rules: (params?: { enabled?: string; limit?: number }) =>
    http.get<{ rules?: ModRule[]; data?: ModRule[] }>(`/moderator/api/rules${q(params)}`),
  enableRule: (id: string) => http.post<unknown>(`/moderator/api/rules/${id}/enable`, {}),
  disableRule: (id: string) => http.post<unknown>(`/moderator/api/rules/${id}/disable`, {}),
  deleteRule: (id: string) => http.del<unknown>(`/moderator/api/rules/${id}`),

  appeals: (params?: { status?: string; limit?: number }) =>
    http.get<{ appeals?: Appeal[]; data?: Appeal[] }>(`/moderator/api/appeals${q(params)}`),
  appealStats: () => http.get<Record<string, unknown>>('/moderator/api/appeals/stats/summary'),
  reviewAppeal: (id: string, decision: 'approve' | 'deny', notes: string) =>
    http.post<unknown>(`/moderator/api/appeals/${id}/review`, { decision, notes }),

  workflows: () => http.get<{ workflows?: Workflow[]; data?: Workflow[] }>('/moderator/api/workflows'),
  executeWorkflow: (id: string) => http.post<Record<string, unknown>>(`/moderator/api/workflows/${id}/execute`, {}),

  metrics: (period = 'today') => http.get<Record<string, unknown>>(`/moderator/api/metrics${q({ period })}`),
  recentActions: (limit = 25) => http.get<{ actions?: Array<Record<string, unknown>>; data?: Array<Record<string, unknown>> }>(`/moderator/api/actions/recent${q({ limit })}`),
  providersStatus: () => http.get<Record<string, unknown>>('/moderator/api/actions/providers/status'),

  getConfigSection: (s: string) => http.get<unknown>(`/moderator/api/config/${s}`),
  saveConfigSection: (s: string, data: unknown) => http.post<unknown>(`/moderator/api/config/${s}`, data),
};
