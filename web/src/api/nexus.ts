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

export type GovernanceModel = 'centralized' | 'decentralized' | 'dao' | 'consensus';

export interface CreateGroupInput {
  name: string;
  description?: string;
  visibility?: GroupVisibility;
  joinMode?: JoinMode;
  governanceModel?: GovernanceModel;
  category?: string;
  tags?: string[];
  maxMembers?: number | null;
  website?: string;
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

// ── Group / member mutations ────────────────────────────────────────────────
/** Fields accepted by PUT /groups/:id (all optional — send what changed). */
export interface UpdateGroupInput {
  name?: string;
  description?: string | null;
  visibility?: GroupVisibility;
  joinMode?: JoinMode;
  category?: string | null;
  tags?: string[];
  location?: string | null;
  website?: string | null;
  /** Decimal degrees, -90..90. Sent together with longitude or not at all. */
  latitude?: number | null;
  /** Decimal degrees, -180..180. */
  longitude?: number | null;
}

/** Member role mutable via the role endpoint (owner is transfer-only). */
export type AssignableRole = 'admin' | 'moderator' | 'member';

export interface InviteInput {
  /** Target a specific user (omit for a shareable multi-use invite). */
  userId?: string;
  message?: string;
  maxUses?: number;
  /** Epoch ms. */
  expiresAt?: number;
}

// ── Events ──────────────────────────────────────────────────────────────────
export type EventType = 'in-person' | 'virtual' | 'hybrid';
export type EventVisibility = 'public' | 'members-only' | 'invite-only';
export type RsvpStatus = 'going' | 'maybe' | 'not-going';

export interface CreateEventInput {
  groupId: string;
  title: string;
  description?: string;
  eventType: EventType;
  location?: string | null;
  virtualUrl?: string | null;
  /** Epoch ms, must be in the future. */
  startTime: number;
  /** Epoch ms, >= startTime. */
  endTime?: number | null;
  timezone?: string;
  maxAttendees?: number | null;
  visibility?: EventVisibility;
}
export type UpdateEventInput = Partial<Omit<CreateEventInput, 'groupId'>>;

export interface EventAttendee {
  id: string;
  eventId: string;
  userId: string;
  rsvpStatus: RsvpStatus;
  guestCount?: number;
  checkInStatus?: string;
  notes?: string | null;
  [k: string]: unknown;
}

export interface RsvpInput {
  rsvpStatus?: RsvpStatus;
  guestCount?: number;
  notes?: string;
}

export interface ReminderPresets {
  presets: Record<string, number>;
  default: number[];
}

// ── Subgroups (channels) ────────────────────────────────────────────────────
export type SubGroupType = 'channel' | 'subgroup';
export type SubGroupVisibility = 'public' | 'members' | 'restricted';

export interface SubGroup {
  id: string;
  parentGroupId: string;
  name: string;
  description?: string | null;
  type: SubGroupType;
  visibility: SubGroupVisibility;
  sortOrder?: number;
  isPinned?: boolean;
  [k: string]: unknown;
}

export interface CreateSubGroupInput {
  parentGroupId: string;
  name: string;
  description?: string;
  type?: SubGroupType;
  visibility?: SubGroupVisibility;
}
export interface UpdateSubGroupInput {
  name?: string;
  description?: string;
  visibility?: SubGroupVisibility;
  sortOrder?: number;
  isPinned?: boolean;
}

export type SubGroupMemberRole = 'moderator' | 'member';

// ── Recommendations ─────────────────────────────────────────────────────────
export interface Recommendation {
  id: string;
  groupId: string;
  userId?: string;
  score?: number;
  reason?: string;
  group?: Group;
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

  // ── Group / member management (Phase 1) ──────────────────────────────────
  /** Update a group (admin/owner or platform admin). */
  updateGroup: (id: string, input: UpdateGroupInput) =>
    http.put<{ success: boolean; group: Group }>(`/nexus/api/groups/${id}`, input),
  /** Soft-delete a group (owner or platform admin). */
  deleteGroup: (id: string) =>
    http.del<{ success: boolean; message: string }>(`/nexus/api/groups/${id}`),
  /** Promote/demote a member (owner→transfer only, so not assignable here). */
  changeMemberRole: (groupId: string, userId: string, role: AssignableRole) =>
    http.put<{ success: boolean; membership: Membership }>(
      `/nexus/api/groups/${groupId}/members/${userId}/role`,
      { role },
    ),
  /** Remove a member (admin/owner). */
  removeMember: (groupId: string, userId: string, reason?: string) =>
    http.del<{ success: boolean; message: string }>(
      `/nexus/api/groups/${groupId}/members/${userId}`,
      reason ? { body: { reason } } : undefined,
    ),
  /** Create an invite (specific user or shareable). */
  invite: (groupId: string, input: InviteInput = {}) =>
    http.post<{ success: boolean; invite: { inviteCode?: string; [k: string]: unknown } }>(
      `/nexus/api/groups/${groupId}/invite`,
      input,
    ),
  // NOTE: there is no endpoint to LIST pending join requests (only approve/reject
  // by requestId). approve/reject are wired below for when a list endpoint lands.
  approveJoinRequest: (groupId: string, requestId: string) =>
    http.post<{ success: boolean }>(
      `/nexus/api/groups/${groupId}/join-requests/${requestId}/approve`,
      {},
    ),
  rejectJoinRequest: (groupId: string, requestId: string, reason?: string) =>
    http.post<{ success: boolean }>(
      `/nexus/api/groups/${groupId}/join-requests/${requestId}/reject`,
      reason ? { reason } : {},
    ),

  // ── Calendar & contacts (iCal / CalDAV / CardDAV) ─────────────────────────
  /** Group members as vCards (JSON envelope with per-member `vcard` strings). */
  listGroupContacts: (groupId: string) =>
    http.get<{ success: boolean; contacts: Array<{ id: string; href?: string; etag?: string; vcard: string }>; count: number }>(
      `/nexus/api/calendar/carddav/groups/${groupId}/contacts`,
    ),
  /** Group contacts as a raw .vcf payload for download. */
  groupContactsVcf: (groupId: string) =>
    http.get<string>(`/nexus/api/calendar/carddav/groups/${groupId}/contacts?format=vcf`),
  /** Group calendar as a raw .ics payload for download. */
  groupICal: (groupId: string) =>
    http.get<string>(`/nexus/api/calendar/groups/${groupId}/ical?upcoming=false&limit=500`),
  /** Stable protocol paths for external calendar/contact clients. */
  calendarSyncPaths: (groupId: string) => ({
    ical: `/nexus/api/calendar/groups/${groupId}/ical`,
    caldav: `/nexus/api/calendar/caldav/groups/${groupId}/calendar`,
    caldavEvents: `/nexus/api/calendar/caldav/groups/${groupId}/events`,
    carddav: `/nexus/api/calendar/carddav/groups/${groupId}/addressbook`,
    carddavContacts: `/nexus/api/calendar/carddav/groups/${groupId}/contacts`,
  }),

  // ── Events lifecycle (Phase 1) ───────────────────────────────────────────
  createEvent: (input: CreateEventInput) =>
    http.post<{ success: boolean; event: GroupEvent }>('/nexus/api/events', input),
  updateEvent: (id: string, input: UpdateEventInput) =>
    http.put<{ success: boolean; event: GroupEvent }>(`/nexus/api/events/${id}`, input),
  cancelEvent: (id: string, reason?: string) =>
    http.post<{ success: boolean; event: GroupEvent }>(
      `/nexus/api/events/${id}/cancel`,
      reason ? { reason } : {},
    ),
  deleteEvent: (id: string) =>
    http.del<{ success: boolean; message: string }>(`/nexus/api/events/${id}`),
  /** Attach (or, with null, clear) a live stream on a scheduled group event. */
  setEventLiveStream: (eventId: string, liveStreamId: string | null) =>
    http.post<{ success: boolean; event: GroupEvent }>(
      `/nexus/api/events/${eventId}/live`,
      { liveStreamId },
    ),
  rsvpEvent: (id: string, input: RsvpInput = {}) =>
    http.post<{ success: boolean }>(`/nexus/api/events/${id}/rsvp`, input),
  cancelRsvp: (id: string) =>
    http.del<{ success: boolean; message: string }>(`/nexus/api/events/${id}/rsvp`),
  getMyRsvp: (id: string) =>
    http.get<{ success: boolean; rsvp: EventAttendee | null }>(`/nexus/api/events/${id}/rsvp`),
  listAttendees: (id: string, params?: { rsvpStatus?: RsvpStatus; limit?: number }) => {
    const sp = new URLSearchParams();
    if (params?.rsvpStatus) sp.set('rsvpStatus', params.rsvpStatus);
    if (params?.limit != null) sp.set('limit', String(params.limit));
    const q = sp.toString();
    return http.get<{ success: boolean; attendees: EventAttendee[]; pagination?: Pagination }>(
      `/nexus/api/events/${id}/attendees${q ? `?${q}` : ''}`,
    );
  },
  reminderPresets: () =>
    http.get<{ success: boolean } & ReminderPresets>('/nexus/api/events/reminders/presets'),
  createReminder: (eventId: string, reminderTimes: number[]) =>
    http.post<{ success: boolean; scheduled: number }>(
      `/nexus/api/events/${eventId}/reminders`,
      { reminderTimes },
    ),
  updateReminder: (eventId: string, reminderTimes: number[]) =>
    http.put<{ success: boolean; scheduled: number }>(
      `/nexus/api/events/${eventId}/reminders`,
      { reminderTimes },
    ),
  deleteReminder: (eventId: string) =>
    http.del<{ success: boolean; cancelled: number }>(`/nexus/api/events/${eventId}/reminders`),

  // ── Subgroups / channels (Phase 1) ───────────────────────────────────────
  listSubgroups: (parentGroupId: string, params?: { type?: SubGroupType }) => {
    const sp = new URLSearchParams({ parentGroupId });
    if (params?.type) sp.set('type', params.type);
    return http.get<{ success: boolean; subGroups: SubGroup[]; count: number }>(
      `/nexus/api/subgroups?${sp.toString()}`,
    );
  },
  createSubgroup: (input: CreateSubGroupInput) =>
    http.post<{ success: boolean; subGroup: SubGroup }>('/nexus/api/subgroups', input),
  updateSubgroup: (id: string, input: UpdateSubGroupInput) =>
    http.put<{ success: boolean; subGroup: SubGroup }>(`/nexus/api/subgroups/${id}`, input),
  deleteSubgroup: (id: string) =>
    http.del<{ success: boolean; message: string }>(`/nexus/api/subgroups/${id}`),
  addSubgroupMember: (id: string, userId: string, role: SubGroupMemberRole = 'member') =>
    http.post<{ success: boolean }>(`/nexus/api/subgroups/${id}/members`, { userId, role }),
  removeSubgroupMember: (id: string, userId: string) =>
    http.del<{ success: boolean }>(`/nexus/api/subgroups/${id}/members/${userId}`),

  // ── Recommendations (Phase 1) ────────────────────────────────────────────
  listRecommendations: (params?: { limit?: number }) => {
    const sp = new URLSearchParams();
    if (params?.limit != null) sp.set('limit', String(params.limit));
    const q = sp.toString();
    return http.get<{ success: boolean; recommendations: Recommendation[]; count: number }>(
      `/nexus/api/recommendations${q ? `?${q}` : ''}`,
    );
  },
};
