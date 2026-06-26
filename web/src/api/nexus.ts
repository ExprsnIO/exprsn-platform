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
  location?: string;
  /** Decimal degrees, -90..90. Sent together with longitude or not at all. */
  latitude?: number;
  /** Decimal degrees, -180..180. */
  longitude?: number;
}

export interface Pagination {
  total: number;
  page: number;
  limit: number;
  pages: number;
}

// ── Governance (proposals & voting) ────────────────────────────────────────
export type ProposalType = 'rule-change' | 'role-change' | 'member-action' | 'general' | 'other';
export type ProposalStatus = 'draft' | 'active' | 'passed' | 'rejected' | 'cancelled' | 'expired';
export type VoteValue = 'yes' | 'no' | 'abstain';

export interface Proposal {
  id: string;
  groupId: string;
  proposerId: string;
  title: string;
  description: string;
  proposalType: ProposalType;
  status: ProposalStatus;
  voteCountYes?: number;
  voteCountNo?: number;
  voteCountAbstain?: number;
  totalVotes?: number;
  votingStartsAt?: number;
  votingEndsAt?: number;
  executedAt?: number | null;
  createdAt?: number;
  [k: string]: unknown;
}

export interface CreateProposalInput {
  groupId: string;
  title: string;
  description: string;
  proposalType: ProposalType;
  votingDuration?: number;
}

export interface UpdateProposalInput {
  title?: string;
  description?: string;
  proposalType?: ProposalType;
}

export interface GroupMember {
  id: string;
  userId: string;
  groupId: string;
  role: MemberRole;
  status: string;
  joinedAt?: string;
}

export interface GroupEvent {
  id: string;
  groupId: string;
  title: string;
  description?: string | null;
  eventType?: string;
  startTime?: string | number;
  endTime?: string | number;
  location?: string | null;
  virtualUrl?: string | null;
  status?: string;
  attendeeCount?: number;
  [k: string]: unknown;
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
  /** Proximity discovery — groups within `radiusKm`, nearest first (carries distanceKm). */
  nearbyGroups: (lat: number, lng: number, radiusKm = 50) => {
    const sp = new URLSearchParams({
      lat: String(lat),
      lng: String(lng),
      radius: String(radiusKm),
      limit: '50',
    });
    return http.get<{ success: boolean; groups: (Group & { distanceKm?: number })[]; count: number }>(
      `/nexus/api/groups/discover/nearby?${sp.toString()}`,
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

  // ── Group detail ──────────────────────────────────────────────────────────
  /** Full group record (visibility-aware; works for public groups when signed in). */
  getGroup: (id: string) =>
    http.get<{ success: boolean; group: Group }>(`/nexus/api/groups/${id}`),
  /** Group members — member-only on the backend (403 for non-members). */
  listMembers: (id: string, params?: { limit?: number; page?: number }) => {
    const sp = new URLSearchParams();
    if (params?.limit != null) sp.set('limit', String(params.limit));
    if (params?.page != null) sp.set('page', String(params.page));
    const q = sp.toString();
    return http.get<{ members: GroupMember[]; pagination: Pagination }>(
      `/nexus/api/groups/${id}/members${q ? `?${q}` : ''}`,
    );
  },
  /** A group's events (default upcoming). Visibility is members-only by default. */
  listGroupEvents: (groupId: string, params?: { upcoming?: boolean; limit?: number }) => {
    const sp = new URLSearchParams({ groupId });
    if (params?.upcoming) sp.set('upcoming', 'true');
    if (params?.limit != null) sp.set('limit', String(params.limit));
    return http.get<{ success: boolean; events: GroupEvent[]; pagination?: Pagination }>(
      `/nexus/api/events?${sp.toString()}`,
    );
  },

  // ── Governance ──────────────────────────────────────────────────────────
  /** Proposals for a group (newest first). */
  listProposals: (groupId: string) => {
    const sp = new URLSearchParams({ groupId });
    return http.get<{ success: boolean; proposals: Proposal[]; total: number }>(
      `/nexus/api/governance/proposals?${sp.toString()}`,
    );
  },
  createProposal: (input: CreateProposalInput) =>
    http.post<{ success: boolean; proposal: Proposal }>('/nexus/api/governance/proposals', input),
  voteOnProposal: (id: string, vote: VoteValue, reason?: string) =>
    http.post<{ success: boolean; vote: unknown }>(
      `/nexus/api/governance/proposals/${id}/vote`,
      reason ? { vote, reason } : { vote },
    ),
  updateProposal: (id: string, input: UpdateProposalInput) =>
    http.put<{ success: boolean; proposal: Proposal }>(
      `/nexus/api/governance/proposals/${id}`,
      input,
    ),
  cancelProposal: (id: string) =>
    http.del<{ success: boolean }>(`/nexus/api/governance/proposals/${id}`),
  executeProposal: (id: string) =>
    http.post<{ success: boolean; result: { status: string } }>(
      `/nexus/api/governance/proposals/${id}/execute`,
      {},
    ),
};
