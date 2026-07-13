/**
 * Organizations API (/auth/api/organizations). Backs the org-admin surface:
 * list the orgs you belong to (with your role), inspect one, and manage members.
 * Mutations are authorized server-side (owner/admin only).
 */
import { http } from '@/lib/http';

export type OrgRole = 'owner' | 'admin' | 'member' | 'guest';

export interface Organization {
  id: string;
  name: string;
  slug?: string;
  type?: 'enterprise' | 'team' | 'personal' | string;
  ownerId?: string;
  plan?: string;
  status?: string;
  /** The caller's membership on this org, when returned by "my orgs". */
  OrganizationMember?: { role?: OrgRole; joinedAt?: string };
  role?: OrgRole;
  [k: string]: unknown;
}

export interface OrgMember {
  id?: string;
  userId: string;
  role: OrgRole;
  status?: string;
  joinedAt?: string;
  [k: string]: unknown;
}

/** The caller's effective role on an org, however the API surfaced it. */
export function orgRole(org: Organization): OrgRole | undefined {
  return org.role ?? org.OrganizationMember?.role;
}

/** Can the current user administer this org (owner or admin, or org owner)? */
export function canAdminOrg(org: Organization, userId?: string): boolean {
  const role = orgRole(org);
  return org.ownerId === userId || role === 'owner' || role === 'admin';
}

export type OrgTemplate = 'enterprise' | 'team' | 'personal';

/** Result envelope from the shared provisioning engine (self-serve front). */
export interface ProvisionSelfResult {
  success: boolean;
  status: 'completed' | 'failed' | 'compensation_failed' | string;
  organizationId?: string;
  [k: string]: unknown;
}

export const organizationsApi = {
  myOrgs: () => http.get<{ organizations: Organization[] }>('/auth/api/organizations'),
  getOrg: (id: string) => http.get<{ organization: Organization }>(`/auth/api/organizations/${id}`),
  createOrg: (body: { name: string; slug?: string; type?: string }) =>
    http.post<{ organization: Organization }>('/auth/api/organizations', body),
  /**
   * Self-serve org provisioning (FEAT-033) — the same engine as the admin and
   * public-signup fronts, differing only in owner (the calling user) and
   * actor.isAdmin=false. `type` selects the template; org fields are allowlisted
   * server-side. 201 → `status:'completed'`.
   */
  provisionSelf: (body: { name: string; type: OrgTemplate; slug?: string; description?: string }) =>
    http.post<ProvisionSelfResult>('/auth/api/organizations/provision-self', body),

  members: (id: string) => http.get<{ members: OrgMember[] }>(`/auth/api/organizations/${id}/members`),
  addMember: (id: string, body: { userId: string; role: OrgRole }) =>
    http.post<{ member: OrgMember }>(`/auth/api/organizations/${id}/members`, body),
  updateMemberRole: (id: string, userId: string, role: OrgRole) =>
    http.patch<{ member: OrgMember }>(`/auth/api/organizations/${id}/members/${userId}`, { role }),
  removeMember: (id: string, userId: string) =>
    http.del<{ success: boolean }>(`/auth/api/organizations/${id}/members/${userId}`),
};
