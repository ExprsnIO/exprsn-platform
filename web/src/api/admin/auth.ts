/**
 * Auth/identity admin API (/auth/api/*). The auth module has no bulk list for
 * users/groups, but the public `/api/config/:sectionId` directory sections do
 * surface listings; orgs, roles, applications and sessions have real list
 * endpoints. Org/role/app calls are session-cookie authed (the SPA holds one);
 * users/groups by-id are CA-bearer.
 */
import { http } from '@/lib/http';
import type { User } from '@/api/auth';

export interface Organization {
  id: string;
  name: string;
  slug?: string;
  ownerId?: string;
  status?: string;
  createdAt?: string;
  [k: string]: unknown;
}
export interface OrgMember {
  id?: string;
  userId: string;
  role?: string;
  status?: string;
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

  // Users / groups by id.
  getUser: (id: string) => http.get<{ user?: User } & Record<string, unknown>>(`/auth/api/users/${id}`),
  getUserGroups: (id: string) => http.get<Record<string, unknown>>(`/auth/api/users/${id}/groups`),

  // Organizations.
  listOrganizations: () => http.get<{ organizations?: Organization[]; data?: Organization[] }>('/auth/api/organizations'),
  getOrganization: (id: string) => http.get<Record<string, unknown>>(`/auth/api/organizations/${id}`),
  createOrganization: (body: Record<string, unknown>) => http.post<Record<string, unknown>>('/auth/api/organizations', body),
  listOrgMembers: (id: string) => http.get<{ members?: OrgMember[]; data?: OrgMember[] }>(`/auth/api/organizations/${id}/members`),

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

  // Sessions (self).
  listSessions: () => http.get<{ sessions?: Session[]; data?: Session[] }>('/auth/api/sessions'),
  revokeSession: (id: string) => http.del<Record<string, unknown>>(`/auth/api/sessions/${id}`),
  revokeAllSessions: () => http.del<Record<string, unknown>>('/auth/api/sessions'),
};
