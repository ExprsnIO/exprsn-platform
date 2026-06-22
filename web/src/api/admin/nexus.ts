/**
 * Nexus admin API (/nexus/api/*). Discovery is public; moderation, trending
 * recompute, events/governance/subgroups inspection are token-authed. Several
 * moderation endpoints are group-scoped, so the UI takes a group id.
 */
import { http } from '@/lib/http';
import type { Group } from '@/api/nexus';

export type { Group } from '@/api/nexus';

export interface Flag {
  id: string;
  contentType?: string;
  contentId?: string;
  flagReason?: string;
  status?: string;
  priority?: string;
  createdAt?: string;
  [k: string]: unknown;
}
export interface ModCase {
  id: string;
  status?: string;
  priority?: string;
  contentType?: string;
  createdAt?: string;
  [k: string]: unknown;
}
export interface Proposal {
  id: string;
  title?: string;
  proposalType?: string;
  status?: string;
  votingEndsAt?: string;
  [k: string]: unknown;
}
export interface NexusEvent {
  id: string;
  title?: string;
  eventType?: string;
  status?: string;
  startTime?: string;
  [k: string]: unknown;
}
export interface Subgroup {
  id: string;
  name?: string;
  type?: string;
  visibility?: string;
  [k: string]: unknown;
}

function q(params?: Record<string, string | number | boolean | undefined>): string {
  if (!params) return '';
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const NEXUS_CONFIG_SECTIONS = ['nexus-groups', 'nexus-events', 'nexus-calendar', 'nexus-trending'];

export const nexusAdminApi = {
  listGroups: (params?: { search?: string; visibility?: string; limit?: number }) =>
    http.get<{ groups: Group[]; pagination?: Record<string, number> }>(`/nexus/api/groups${q(params)}`),
  trendingGroups: (limit = 25) => http.get<{ groups?: Group[]; data?: Group[] }>(`/nexus/api/trending/groups${q({ limit })}`),
  recomputeTrending: () => http.post<Record<string, unknown>>('/nexus/api/trending/update', {}),

  flags: (groupId: string, params?: { status?: string; limit?: number }) =>
    http.get<{ flags?: Flag[]; data?: Flag[] }>(`/nexus/api/moderation/flags/${groupId}${q(params)}`),
  queue: (groupId: string, params?: { status?: string; limit?: number }) =>
    http.get<{ cases?: ModCase[]; queue?: ModCase[]; data?: ModCase[] }>(`/nexus/api/moderation/queue/${groupId}${q(params)}`),
  caseDetail: (id: string) => http.get<Record<string, unknown>>(`/nexus/api/moderation/cases/${id}`),
  caseAction: (id: string, actionType: string, reason: string, duration?: number) =>
    http.post<unknown>(`/nexus/api/moderation/cases/${id}/action`, { actionType, reason, duration }),
  caseAssign: (id: string, moderatorIds: string[]) =>
    http.post<unknown>(`/nexus/api/moderation/cases/${id}/assign`, { moderatorIds }),

  events: (params?: { groupId?: string; upcoming?: boolean; limit?: number }) =>
    http.get<{ events?: NexusEvent[]; data?: NexusEvent[] }>(`/nexus/api/events${q(params)}`),
  proposals: (groupId: string, params?: { status?: string; limit?: number }) =>
    http.get<{ proposals?: Proposal[]; data?: Proposal[] }>(`/nexus/api/governance/proposals${q({ groupId, ...params })}`),
  subgroups: (parentGroupId: string) =>
    http.get<{ subgroups?: Subgroup[]; data?: Subgroup[] }>(`/nexus/api/subgroups${q({ parentGroupId })}`),

  getConfigSection: (s: string) => http.get<unknown>(`/nexus/api/config/${s}`),
  saveConfigSection: (s: string, data: unknown) => http.post<unknown>(`/nexus/api/config/${s}`, data),
};

export function rows<T>(d: Record<string, unknown>, ...keys: string[]): T[] {
  for (const k of keys) if (Array.isArray(d[k])) return d[k] as T[];
  return [];
}
