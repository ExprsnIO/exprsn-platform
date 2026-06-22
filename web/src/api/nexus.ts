import { http } from '@/lib/http';

// Groups & events (nexus). Endpoints under /nexus/api/*. Shapes mirror the
// nexus Group / GroupMembership models.
export type GroupVisibility = 'public' | 'private' | 'unlisted';
export type JoinMode = 'open' | 'request' | 'invite';
export type MemberRole = 'owner' | 'admin' | 'moderator' | 'member';

export interface Group {
  id: string;
  name: string;
  slug?: string;
  description?: string | null;
  creatorId?: string;
  visibility?: GroupVisibility;
  joinMode?: JoinMode;
  memberCount?: number;
  category?: string | null;
  tags?: string[];
  createdAt?: string;
  [k: string]: unknown;
}

export interface Membership {
  id: string;
  userId: string;
  groupId: string;
  role: MemberRole;
  status: string;
  joinedAt?: string;
  group?: Group;
  [k: string]: unknown;
}

export interface CreateGroupInput {
  name: string;
  description?: string;
  visibility?: GroupVisibility;
  joinMode?: JoinMode;
}

export interface Pagination {
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export const nexusApi = {
  /** Public discovery list. */
  listGroups: (params?: { limit?: number; search?: string }) => {
    const sp = new URLSearchParams();
    if (params?.limit != null) sp.set('limit', String(params.limit));
    if (params?.search) sp.set('search', params.search);
    const q = sp.toString();
    return http.get<{ groups: Group[]; pagination: Pagination }>(
      `/nexus/api/groups${q ? `?${q}` : ''}`,
    );
  },
  /** The signed-in user's memberships (each carries its nested `group`). */
  myMemberships: () =>
    http.get<{ success: boolean; data: Membership[]; pagination: Pagination }>(
      '/nexus/api/memberships',
    ),
  // NOTE: `category` is intentionally omitted — it's an FK to nexus.group_categories
  // (currently unseeded), so any value other than null violates the constraint.
  createGroup: (input: CreateGroupInput) =>
    http.post<{ success: boolean; group: Group }>('/nexus/api/groups', input),
  joinGroup: (id: string) => http.post<unknown>(`/nexus/api/groups/${id}/join`, {}),
  leaveGroup: (id: string) => http.post<unknown>(`/nexus/api/groups/${id}/leave`, {}),
};
