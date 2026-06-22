/**
 * Auth/identity admin API (/auth/api/*). The auth module has no bulk list for
 * users/groups, but the public `/api/config/:sectionId` directory sections do
 * surface listings; orgs, roles, applications and sessions have real list
 * endpoints. Org/role/app calls are session-cookie authed (the SPA holds one);
 * users/groups by-id are CA-bearer.
 */
import { http } from '@/lib/http';
import type { User } from '@/api/auth';

/** Two-factor methods that can be permitted by an org policy. `totp` and
 *  `backup_codes` are implemented end-to-end; the rest are config-only
 *  scaffolding for methods not yet built in the auth service. */
export type MfaMethod = 'totp' | 'backup_codes' | 'sms' | 'email' | 'webauthn';

export interface OrgMfaPolicy {
  allowedMethods?: MfaMethod[];
  enrollmentGracePeriodDays?: number;
  rememberDeviceDays?: number;
}

export interface OrgPasswordPolicy {
  minLength?: number;
  requireUppercase?: boolean;
  requireLowercase?: boolean;
  requireNumbers?: boolean;
  requireSymbols?: boolean;
}

export interface OrgSettings {
  allowUserRegistration?: boolean;
  requireEmailVerification?: boolean;
  requireMfa?: boolean;
  mfa?: OrgMfaPolicy;
  sessionTimeout?: number; // milliseconds
  passwordPolicy?: OrgPasswordPolicy;
  [k: string]: unknown;
}

export type OrgType = 'enterprise' | 'team' | 'personal';
export type OrgPlan = 'free' | 'starter' | 'professional' | 'enterprise';

export interface Organization {
  id: string;
  name: string;
  slug?: string;
  description?: string | null;
  type?: OrgType;
  ownerId?: string;
  email?: string | null;
  website?: string | null;
  logoUrl?: string | null;
  plan?: OrgPlan;
  billingEmail?: string | null;
  status?: string;
  settings?: OrgSettings;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
  [k: string]: unknown;
}
export interface OrgMember {
  id?: string;
  userId: string;
  role?: string;
  status?: string;
  user?: { id: string; email?: string; displayName?: string | null };
  [k: string]: unknown;
}
export interface AuthUser {
  id: string;
  email: string;
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  status?: string;
  emailVerified?: boolean;
  mfaEnabled?: boolean;
  lastLoginAt?: string | null;
  createdAt?: string;
  [k: string]: unknown;
}
export interface Group {
  id: string;
  name: string;
  description?: string | null;
  organizationId?: string | null;
  type?: string;
  members?: Array<{ id: string; email?: string; displayName?: string | null }>;
  [k: string]: unknown;
}
export interface Application {
  id: string;
  name?: string;
  clientId?: string;
  organizationId?: string;
  createdAt?: string;
  [k: string]: unknown;
}
export interface Role {
  id: string;
  name?: string;
  type?: string;
  priority?: number;
  isSystem?: boolean;
  organizationId?: string | null;
  permissions?: string[];
  [k: string]: unknown;
}
export interface Permission {
  id?: string;
  permissionString?: string;
  scope?: string;
  service?: string;
  description?: string;
  [k: string]: unknown;
}
export interface Session {
  id: string;
  ipAddress?: string;
  userAgent?: string;
  lastActivityAt?: string;
  createdAt?: string;
  current?: boolean;
  [k: string]: unknown;
}

function q(params?: Record<string, string | number | undefined>): string {
  if (!params) return '';
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const AUTH_CONFIG_SECTIONS = ['auth-users', 'auth-groups', 'auth-roles', 'auth-methods'];

export const authAdminApi = {
  // Directory (public config sections — GET returns listings).
  getConfigSection: (section: string) => http.get<unknown>(`/auth/api/config/${section}`),
  saveConfigSection: (section: string, data: unknown) => http.post<unknown>(`/auth/api/config/${section}`, data),

  // Users.
  listUsers: (params?: { limit?: number; offset?: number; search?: string }) =>
    http.get<{ users: AuthUser[]; pagination?: Record<string, number> }>(`/auth/api/users${q(params)}`),
  getUser: (id: string) => http.get<{ user?: User } & Record<string, unknown>>(`/auth/api/users/${id}`),
  getUserGroups: (id: string) => http.get<Record<string, unknown>>(`/auth/api/users/${id}/groups`),

  // Groups.
  listGroups: (params?: { organizationId?: string }) =>
    http.get<{ groups: Group[] }>(`/auth/api/groups${q(params)}`),
  createGroup: (body: { name: string; description?: string; organizationId?: string }) =>
    http.post<{ group: Group }>('/auth/api/groups', body),
  deleteGroup: (id: string) => http.del<Record<string, unknown>>(`/auth/api/groups/${id}`),

  // Organizations.
  listOrganizations: () => http.get<{ organizations?: Organization[]; data?: Organization[] }>('/auth/api/organizations'),
  getOrganization: (id: string) => http.get<{ organization: Organization }>(`/auth/api/organizations/${id}`),
  createOrganization: (body: Record<string, unknown>) => http.post<Record<string, unknown>>('/auth/api/organizations', body),
  updateOrganization: (id: string, body: Record<string, unknown>) =>
    http.patch<{ organization?: Organization }>(`/auth/api/organizations/${id}`, body),
  listOrgMembers: (id: string) => http.get<{ members?: OrgMember[]; data?: OrgMember[] }>(`/auth/api/organizations/${id}/members`),
  addOrgMember: (id: string, userId: string, role?: string) =>
    http.post<Record<string, unknown>>(`/auth/api/organizations/${id}/members`, { userId, role }),
  updateOrgMember: (id: string, userId: string, role: string) =>
    http.patch<Record<string, unknown>>(`/auth/api/organizations/${id}/members/${userId}`, { role }),
  removeOrgMember: (id: string, userId: string) =>
    http.del<Record<string, unknown>>(`/auth/api/organizations/${id}/members/${userId}`),

  // Applications.
  listApplications: (organizationId?: string) =>
    http.get<{ applications?: Application[]; data?: Application[] }>(`/auth/api/applications${q({ organizationId })}`),

  // Roles & permissions.
  listRoles: (params?: { organizationId?: string; type?: string }) =>
    http.get<{ roles?: Role[]; data?: Role[] }>(`/auth/api/roles${q(params)}`),
  createRole: (body: Record<string, unknown>) => http.post<Record<string, unknown>>('/auth/api/roles', body),
  listPermissions: (params?: { scope?: string; service?: string }) =>
    http.get<{ permissions?: Permission[]; data?: Permission[] }>(`/auth/api/roles/permissions${q(params)}`),
  assignRoleUser: (roleId: string, userId: string, organizationId?: string) =>
    http.post<Record<string, unknown>>(`/auth/api/roles/${roleId}/assign-user`, { userId, organizationId }),
  revokeRoleUser: (roleId: string, userId: string, organizationId?: string) =>
    http.post<Record<string, unknown>>(`/auth/api/roles/${roleId}/revoke-user`, { userId, organizationId }),
  assignRoleGroup: (roleId: string, groupId: string, organizationId?: string) =>
    http.post<Record<string, unknown>>(`/auth/api/roles/${roleId}/assign-group`, { groupId, organizationId }),
  revokeRoleGroup: (roleId: string, groupId: string, organizationId?: string) =>
    http.post<Record<string, unknown>>(`/auth/api/roles/${roleId}/revoke-group`, { groupId, organizationId }),

  // Sessions (self).
  listSessions: () => http.get<{ sessions?: Session[]; data?: Session[] }>('/auth/api/sessions'),
  revokeSession: (id: string) => http.del<Record<string, unknown>>(`/auth/api/sessions/${id}`),
  revokeAllSessions: () => http.del<Record<string, unknown>>('/auth/api/sessions'),
};
