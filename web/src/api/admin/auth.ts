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
  /** Present when listed with ?include=counts. */
  counts?: OrgCounts;
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

export interface OrgCounts {
  groups: number;
  users: number;
  violations: number;
}

/** Result envelope from the provisioning engine (admin/self-serve/public). */
export interface ProvisionResult {
  success: boolean;
  status: 'completed' | 'failed' | 'compensation_failed' | string;
  organizationId?: string;
  caGroupId?: string;
  intermediateCertId?: string;
  ownerUserId?: string;
  ownerCertId?: string;
  ownerTokenId?: string;
  error?: string;
  [k: string]: unknown;
}

/** Aggregate returned by GET /users/:id/detail — the admin user inspector. */
export interface UserDetail {
  user: AuthUser;
  groups: Group[];
  roles: Role[];
  organizations: Array<{
    id: string;
    name?: string;
    slug?: string;
    status?: string;
    memberRole?: string | null;
    memberStatus?: string | null;
  }>;
  permissions?: Record<string, unknown> | null;
  sessions: Session[];
}

/**
 * One line of an import report. The base fields (`email`/`name`/`outcome`/
 * `reason`) are shared by the users and groups paths; the remaining fields are
 * the additive FEAT-035 slice-A superset emitted only by the users import
 * (`outcome ∈ created|invited|skipped|failed`).
 */
export interface ImportResultRow {
  email?: string;
  name?: string;
  outcome: string;
  reason?: string;
  /** 1-based source row number (users path). */
  row?: number;
  /** Org membership role granted for this row (users path). */
  orgRole?: string | null;
  /** Resolved auth RBAC group slug, or null when not found (non-fatal). */
  authGroup?: string | null;
  /** Echoed nexus group (assignment deferred behind a server flag). */
  nexusGroup?: string | null;
  /** True when member credentials were provisioned for this row. */
  credentialsIssued?: boolean;
}

export interface ImportResult {
  created: number;
  skipped: number;
  failed: number;
  /** Users import, invite mode — count of activation invites created. */
  invited?: number;
  /** Target org the users import ran against, echoed back. */
  organizationId?: string | null;
  rows: ImportResultRow[];
}

/** Options for the multipart users import (FEAT-035 slice-A). */
export interface ImportUsersOptions {
  /** Target org; members are added here with `defaultRole`. */
  organizationId?: string;
  /** Role applied to rows lacking a `role` column (owner is rejected). */
  defaultRole?: string;
  /** `create` sets passwords; `invite` creates inactive accounts + emails activation. */
  mode?: 'create' | 'invite';
  /** Provision member cert/token on creation (create mode + target org only). */
  provisionCredentials?: boolean;
}

export interface RoleAssignments {
  role: Role;
  users: Array<{
    userId: string;
    organizationId?: string | null;
    expiresAt?: string | null;
    user?: { id: string; email?: string; displayName?: string | null; status?: string } | null;
  }>;
  groups: Array<{
    groupId: string;
    organizationId?: string | null;
    group?: { id: string; name?: string; organizationId?: string | null } | null;
  }>;
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
  getUserDetail: (id: string) => http.get<UserDetail>(`/auth/api/users/${id}/detail`),
  createUser: (body: {
    email: string;
    password?: string;
    displayName?: string;
    firstName?: string;
    lastName?: string;
    status?: string;
    emailVerified?: boolean;
  }) => http.post<{ user: AuthUser }>('/auth/api/users', body),
  importUsers: (users: Array<Record<string, unknown>>) =>
    http.post<ImportResult>('/auth/api/users/import', { users }),
  /**
   * Multipart users import (FEAT-035 slice-A): streams a raw CSV `File` to the
   * server (parsed + row-capped server-side) with structured options. Uses the
   * FormData rawBody mechanism so the browser sets the multipart boundary.
   */
  importUsersFile: (file: File, opts?: ImportUsersOptions) => {
    const form = new FormData();
    form.append('file', file);
    if (opts?.organizationId) form.append('organizationId', opts.organizationId);
    if (opts?.defaultRole) form.append('defaultRole', opts.defaultRole);
    if (opts?.mode) form.append('mode', opts.mode);
    if (opts?.provisionCredentials) form.append('provisionCredentials', 'true');
    return http.post<ImportResult>('/auth/api/users/import', undefined, { rawBody: form });
  },
  exportUsersCsv: () => http.get<string>('/auth/api/users/export'),

  // Groups.
  listGroups: (params?: { organizationId?: string }) =>
    http.get<{ groups: Group[] }>(`/auth/api/groups${q(params)}`),
  createGroup: (body: {
    name: string;
    description?: string;
    organizationId?: string;
    permissions?: Record<string, boolean>;
    parentId?: string;
  }) => http.post<{ group: Group }>('/auth/api/groups', body),
  importGroups: (groups: Array<Record<string, unknown>>) =>
    http.post<ImportResult>('/auth/api/groups/import', { groups }),
  deleteGroup: (id: string) => http.del<Record<string, unknown>>(`/auth/api/groups/${id}`),

  // Organizations.
  listOrganizations: (opts?: { includeCounts?: boolean }) =>
    http.get<{ organizations?: Organization[]; data?: Organization[] }>(
      `/auth/api/organizations${opts?.includeCounts ? '?include=counts' : ''}`,
    ),
  getOrganization: (id: string) => http.get<{ organization: Organization }>(`/auth/api/organizations/${id}`),
  createOrganization: (body: Record<string, unknown>) => http.post<Record<string, unknown>>('/auth/api/organizations', body),
  /**
   * Provision a full organization via the shared engine (FEAT-032/033): CA
   * directory group + per-org intermediate CA, RBAC groups, owner cert/token,
   * and (enterprise/team) Nexus group + Spark channels — atomic-or-compensated.
   * 201 → `status:'completed'`; a failed run returns 500 carrying `{status,error,ids}`.
   */
  provisionOrganization: (body: {
    type: OrgType;
    organization: { name: string; slug?: string; description?: string; email?: string; website?: string };
    owner: { email: string; displayName?: string; password?: string };
    idempotencyKey?: string;
  }) => http.post<ProvisionResult>('/auth/api/organizations/provision', body),
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
  getRole: (id: string) => http.get<{ role: Role }>(`/auth/api/roles/${id}`),
  updateRole: (id: string, body: Record<string, unknown>) =>
    http.patch<{ role?: Role }>(`/auth/api/roles/${id}`, body),
  deleteRole: (id: string) => http.del<Record<string, unknown>>(`/auth/api/roles/${id}`),
  getRoleAssignments: (id: string) => http.get<RoleAssignments>(`/auth/api/roles/${id}/assignments`),
  listPermissions: (params?: { scope?: string; service?: string }) =>
    http.get<{ permissions?: Permission[]; data?: Permission[] }>(`/auth/api/roles/permissions${q(params)}`),
  createPermission: (body: {
    permissionString?: string;
    resource?: string;
    action?: string;
    scope?: string;
    service?: string;
    description?: string;
  }) => http.post<{ permission: Permission }>('/auth/api/roles/permissions', body),
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
