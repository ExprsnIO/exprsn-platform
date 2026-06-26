import { http } from '@/lib/http';

/**
 * People directory + public profiles. These hit the SAFE public projections
 * (auth `/users/directory`, `/users/:id/profile`) — never the admin/own-only
 * full-record endpoints — plus a user's public nexus groups.
 */
export interface PublicUser {
  id: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  createdAt?: string;
}

export interface DirectoryResponse {
  users: PublicUser[];
  pagination: { limit: number; offset: number; total: number; hasMore: boolean };
}

export interface PublicGroup {
  id: string;
  name: string;
  slug?: string;
  description?: string | null;
  avatarUrl?: string | null;
  memberCount?: number;
}

export const usersApi = {
  directory: (params?: { search?: string; limit?: number; offset?: number }) => {
    const sp = new URLSearchParams();
    if (params?.search) sp.set('search', params.search);
    if (params?.limit != null) sp.set('limit', String(params.limit));
    if (params?.offset != null) sp.set('offset', String(params.offset));
    const q = sp.toString();
    return http.get<DirectoryResponse>(`/auth/api/users/directory${q ? `?${q}` : ''}`);
  },
  profile: (id: string) => http.get<{ user: PublicUser }>(`/auth/api/users/${id}/profile`),
  /** Batch-resolve public profiles for many ids (e.g. a member list). */
  profilesByIds: (ids: string[]) =>
    http.post<{ users: PublicUser[] }>('/auth/api/users/profiles', { ids }),
  publicGroups: (id: string) =>
    http.get<{ success: boolean; data: PublicGroup[] }>(`/nexus/api/memberships/user/${id}`),
};
