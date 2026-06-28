import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '@/app/store';
import { nexusApi, type Group, type Membership, type MemberRole } from '@/api/nexus';

/**
 * Capabilities a user may hold inside a group. This is the single source of
 * truth every group tab consults via `ctx.can(...)`. The backend is the real
 * enforcer; this gate is UX / defense-in-depth.
 */
export type GroupCapability =
  | 'viewMemberContent' // see member-only posts/galleries/files/messages/events
  | 'post' // create posts
  | 'uploadMedia' // upload to galleries / attach files
  | 'deleteOthersContent' // moderate: remove others' content
  | 'broadcast' // send group-wide announcements
  | 'goLive' // start a live stream for the group
  | 'manageSecrets' // view/manage the group's shared secrets
  | 'editGroup' // edit/delete group settings
  | 'manageMembers'; // invite, change roles, remove, approve join requests

/** Effective role, including the synthetic 'non-member'. */
export type EffectiveRole = MemberRole | 'non-member';

export interface GroupContextValue {
  group: Group | undefined;
  membership: Membership | undefined;
  /** The user's role in this group, or 'non-member'. Platform admins read as 'admin'. */
  role: EffectiveRole;
  isMember: boolean;
  /** True when the signed-in user has the platform 'admin' role (token role). */
  isPlatformAdmin: boolean;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  /** Total, typed capability check. */
  can: (capability: GroupCapability) => boolean;
}

// Capability matrix keyed by effective role. Platform admins are resolved to
// 'admin' before lookup, so they inherit the full owner/admin capability set.
const MATRIX: Record<EffectiveRole, ReadonlySet<GroupCapability>> = {
  owner: new Set<GroupCapability>([
    'viewMemberContent',
    'post',
    'uploadMedia',
    'deleteOthersContent',
    'broadcast',
    'goLive',
    'manageSecrets',
    'editGroup',
    'manageMembers',
  ]),
  admin: new Set<GroupCapability>([
    'viewMemberContent',
    'post',
    'uploadMedia',
    'deleteOthersContent',
    'broadcast',
    'goLive',
    'manageSecrets',
    'editGroup',
    'manageMembers',
  ]),
  moderator: new Set<GroupCapability>([
    'viewMemberContent',
    'post',
    'uploadMedia',
    'deleteOthersContent',
  ]),
  member: new Set<GroupCapability>(['viewMemberContent', 'post', 'uploadMedia']),
  'non-member': new Set<GroupCapability>(),
};

/**
 * Resolves a user's group + role and exposes a capability gate. Fetches the
 * group (getGroup) and the user's membership (myMemberships). Owner cannot be
 * assigned via the role endpoint, but is recognised here for capability checks.
 */
export function useGroupContext(groupId: string): GroupContextValue {
  const user = useAppStore((s) => s.user);
  const userId = user?.id;
  const isPlatformAdmin = Array.isArray(user?.roles) && user.roles.includes('admin');

  const groupQ = useQuery({
    queryKey: ['nexus', 'group', groupId],
    queryFn: () => nexusApi.getGroup(groupId),
    enabled: !!groupId,
  });
  const membershipsQ = useQuery({
    queryKey: ['nexus', 'memberships'],
    queryFn: nexusApi.myMemberships,
    enabled: !!userId,
  });

  const membership = (membershipsQ.data?.data ?? []).find((m) => m.groupId === groupId);
  const isMember = !!membership;
  // Platform admins are treated as group admins for UX gating; otherwise the
  // membership role, otherwise non-member.
  const role: EffectiveRole = isPlatformAdmin ? 'admin' : membership?.role ?? 'non-member';

  const can = (capability: GroupCapability): boolean => MATRIX[role].has(capability);

  return {
    group: groupQ.data?.group,
    membership,
    role,
    isMember,
    isPlatformAdmin,
    isLoading: groupQ.isLoading || (!!userId && membershipsQ.isLoading),
    isError: groupQ.isError,
    error: groupQ.error,
    can,
  };
}
