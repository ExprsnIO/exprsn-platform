/**
 * Account-management client (/auth/api/...). Powers the Settings page: profile,
 * password, MFA, and active sessions.
 *
 * Two auth styles are in play and both work through lib/http.ts (which sends the
 * bearer AND `credentials: 'include'`):
 *  - profile update (`PUT /auth/api/users/:id`) is guarded by the CA bearer token
 *    (`validateCAToken`, read+update);
 *  - everything else is guarded by the passport session cookie (`requireAuth`).
 *
 * MFA disable / regenerate post the account password and return 401 on mismatch;
 * those calls pass `skipAuthHandler` so a wrong password shows an inline error
 * instead of tripping the global 401→logout (verified: services/auth mfa.js).
 */
import { http } from '@/lib/http';
import type { User } from './auth';

/** A group the user belongs to (from `GET /auth/api/auth/me`). */
export interface UserGroup {
  id: string;
  name: string;
  description?: string;
}

/** Rich identity returned by `me` — superset of the in-memory session `User`. */
export interface AccountUser extends User {
  emailVerified?: boolean;
  groups?: UserGroup[];
  lastLoginAt?: number | null;
  passwordChangedAt?: number | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProfileUpdate {
  displayName?: string;
  firstName?: string;
  lastName?: string;
  bio?: string;
  avatarUrl?: string;
}

export interface MfaStatus {
  mfaEnabled: boolean;
  backupCodesRemaining: number;
}

export interface MfaSetup {
  message: string;
  secret: string;
  /** PNG data URL — render directly in an <img src>. */
  qrCode: string;
  backupCodes: string[];
}

export interface SessionInfo {
  id: string;
  sessionId: string;
  ipAddress?: string;
  userAgent?: string;
  lastActivityAt?: string;
  expiresAt?: string;
  isCurrent?: boolean;
}

export const accountApi = {
  me: () => http.get<{ user: AccountUser }>('/auth/api/auth/me'),

  updateProfile: (userId: string, patch: ProfileUpdate) =>
    http.put<{ message: string; user: AccountUser }>(`/auth/api/users/${userId}`, patch),

  changePassword: (currentPassword: string, newPassword: string, confirmPassword: string) =>
    http.post<{ message: string }>('/auth/api/auth/change-password', {
      currentPassword,
      newPassword,
      confirmPassword,
    }),

  // --- MFA management ---
  mfaStatus: () => http.get<MfaStatus>('/auth/api/mfa/status'),
  mfaSetup: () => http.post<MfaSetup>('/auth/api/mfa/setup'),
  mfaVerify: (token: string) =>
    http.post<{ message: string }>('/auth/api/mfa/verify', { token }),
  mfaDisable: (password: string) =>
    http.post<{ message: string }>('/auth/api/mfa/disable', { password }, { skipAuthHandler: true }),
  mfaRegenerateBackupCodes: (password: string) =>
    http.post<{ message: string; backupCodes: string[] }>(
      '/auth/api/mfa/regenerate-backup-codes',
      { password },
      { skipAuthHandler: true },
    ),

  // --- Sessions ---
  listSessions: () => http.get<{ sessions: SessionInfo[] }>('/auth/api/sessions'),
  revokeSession: (id: string) =>
    http.del<{ message: string }>(`/auth/api/sessions/${id}`),
  revokeOtherSessions: () =>
    http.del<{ message: string; revokedCount: number }>('/auth/api/sessions'),
};
