/**
 * Nexus admin API (/nexus/api/*). Discovery is public; moderation, trending
 * recompute, events/governance/subgroups inspection are token-authed. Several
 * moderation endpoints are group-scoped, so the UI takes a group id.
 */
import { http } from '@/lib/http';
import type {
  Group,
  GroupMember,
  UpdateGroupInput,
  AssignableRole,
  SubGroup,
  CreateSubGroupInput,
  UpdateSubGroupInput,
} from '@/api/nexus';

export type {
  Group,
  GroupMember,
  UpdateGroupInput,
  AssignableRole,
  SubGroup,
  CreateSubGroupInput,
  UpdateSubGroupInput,
} from '@/api/nexus';

/* ----------------------------------------------------- analytics / audit -- */

export interface StatsSeriesPoint {
  date: string;
  groups?: number;
  members?: number;
  events?: number;
  flags?: number;
}
export interface PlatformStats {
  success?: boolean;
  totals: {
    groups: number;
    activeGroups: number;
    members: number;
    events: number;
    activeProposals: number;
    [k: string]: number;
  };
  growth: {
    period: string;
    days: number;
    since: string;
    newGroups: number;
    newMembers: number;
    newEvents: number;
    series: StatsSeriesPoint[];
    [k: string]: unknown;
  };
}
export interface GroupStats {
  success?: boolean;
  group: Record<string, unknown>;
  totals: {
    members: number;
    activeMembers: number;
    events: number;
    proposals: number;
    activeProposals: number;
    flags: number;
    pendingFlags: number;
    [k: string]: number;
  };
  growth: {
    period: string;
    days: number;
    since: string;
    series: StatsSeriesPoint[];
    [k: string]: unknown;
  };
  activity: {
    recentMembers: number;
    recentEvents: number;
    recentFlags: number;
    [k: string]: unknown;
  };
}
export interface AuditEntry {
  id: string;
  actorUserId?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  groupId?: string;
  metadata?: unknown;
  createdAt?: string;
  [k: string]: unknown;
}
export interface AuditResponse {
  success?: boolean;
  entries: AuditEntry[];
  total: number;
  limit: number;
  offset: number;
}

export type FlagResolution = 'dismiss' | 'escalate';

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

  // Flag resolution — group mod/admin or platform admin.
  resolveFlag: (flagId: string, body: { resolution: FlagResolution; reason?: string }) =>
    http.post<unknown>(`/nexus/api/moderation/flags/${flagId}/resolve`, body),

  events: (params?: { groupId?: string; upcoming?: boolean; limit?: number }) =>
    http.get<{ events?: NexusEvent[]; data?: NexusEvent[] }>(`/nexus/api/events${q(params)}`),
  proposals: (groupId: string, params?: { status?: string; limit?: number }) =>
    http.get<{ proposals?: Proposal[]; data?: Proposal[] }>(`/nexus/api/governance/proposals${q({ groupId, ...params })}`),
  subgroups: (parentGroupId: string) =>
    http.get<{ subGroups?: Subgroup[]; subgroups?: Subgroup[]; data?: Subgroup[] }>(`/nexus/api/subgroups${q({ parentGroupId })}`),

  // ── Group & member management (platform-admin override) ─────────────────
  getGroup: (id: string) => http.get<{ success?: boolean; group: Group }>(`/nexus/api/groups/${id}`),
  updateGroup: (id: string, input: UpdateGroupInput) =>
    http.put<{ success?: boolean; group: Group }>(`/nexus/api/groups/${id}`, input),
  deleteGroup: (id: string) => http.del<{ success?: boolean; message?: string }>(`/nexus/api/groups/${id}`),
  listMembers: (groupId: string, params?: { role?: string; status?: string; limit?: number; page?: number }) =>
    http.get<{ members?: GroupMember[]; data?: GroupMember[]; pagination?: Record<string, number> }>(
      `/nexus/api/groups/${groupId}/members${q(params)}`,
    ),
  changeMemberRole: (groupId: string, userId: string, role: AssignableRole) =>
    http.put<unknown>(`/nexus/api/groups/${groupId}/members/${userId}/role`, { role }),
  removeMember: (groupId: string, userId: string, reason?: string) =>
    http.del<unknown>(`/nexus/api/groups/${groupId}/members/${userId}`, reason ? { body: { reason } } : undefined),

  // ── Governance actions ──────────────────────────────────────────────────
  executeProposal: (id: string) => http.post<unknown>(`/nexus/api/governance/proposals/${id}/execute`, {}),
  closeProposal: (id: string) => http.post<unknown>(`/nexus/api/governance/proposals/${id}/close`, {}),

  // ── Event actions ───────────────────────────────────────────────────────
  cancelEvent: (id: string, reason?: string) =>
    http.post<unknown>(`/nexus/api/events/${id}/cancel`, reason ? { reason } : {}),
  deleteEvent: (id: string) => http.del<unknown>(`/nexus/api/events/${id}`),
  notifyEvent: (id: string, body: { updateType: string; message: string }) =>
    http.post<unknown>(`/nexus/api/events/${id}/notify`, body),

  // ── Subgroup CRUD ───────────────────────────────────────────────────────
  createSubgroup: (input: CreateSubGroupInput) =>
    http.post<{ success?: boolean; subGroup: SubGroup }>('/nexus/api/subgroups', input),
  updateSubgroup: (id: string, input: UpdateSubGroupInput) =>
    http.put<{ success?: boolean; subGroup: SubGroup }>(`/nexus/api/subgroups/${id}`, input),
  deleteSubgroup: (id: string) => http.del<unknown>(`/nexus/api/subgroups/${id}`),

  // ── Analytics (platform admin) ──────────────────────────────────────────
  adminStats: (period = '30d') => http.get<PlatformStats>(`/nexus/api/admin/stats${q({ period })}`),
  groupStats: (id: string, period = '30d') => http.get<GroupStats>(`/nexus/api/admin/groups/${id}/stats${q({ period })}`),

  // ── Audit log (platform admin) ──────────────────────────────────────────
  auditLog: (params?: { actor?: string; action?: string; targetType?: string; groupId?: string; limit?: number; offset?: number }) =>
    http.get<AuditResponse>(`/nexus/api/admin/audit${q(params)}`),

  getConfigSection: (s: string) => http.get<unknown>(`/nexus/api/config/${s}`),
  saveConfigSection: (s: string, data: unknown) => http.post<unknown>(`/nexus/api/config/${s}`, data),
};

export function rows<T>(d: Record<string, unknown>, ...keys: string[]): T[] {
  for (const k of keys) if (Array.isArray(d[k])) return d[k] as T[];
  return [];
}
