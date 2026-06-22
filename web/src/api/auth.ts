/**
 * Auth module client (/auth/api/...). The identity provider for the platform.
 * Login establishes a passport session cookie AND returns a bearer (CA) token;
 * the SPA keeps the bearer for module API calls (see lib/token.ts).
 *
 * Fleshed out in Phase 2; signatures here lock the contract discovered in
 * services/auth/src/routes/auth.js.
 */
import { http } from '@/lib/http';

export interface User {
  id: string;
  email: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  bio?: string;
  avatarUrl?: string;
  status?: 'active' | 'inactive' | 'suspended';
  roles?: string[];
  mfaEnabled?: boolean;
  [k: string]: unknown;
}

export interface LoginSuccess {
  user: User;
  token: string;
}
export interface MfaChallenge {
  mfaRequired: true;
  mfaToken: string;
}
export type LoginResult = LoginSuccess | MfaChallenge;

export const isMfaChallenge = (r: LoginResult): r is MfaChallenge =>
  (r as MfaChallenge).mfaRequired === true;

export const authApi = {
  login: (email: string, password: string) =>
    http.post<LoginResult>('/auth/api/auth/login', { email, password }),
  verifyMfa: (mfaToken: string, code: string) =>
    http.post<LoginSuccess>('/auth/api/auth/mfa/verify', { mfaToken, code }),
  /** Swap a one-time SSO/SAML callback code for the real bearer token. */
  exchange: (code: string) => http.post<{ token: string; user?: User }>('/auth/api/auth/exchange', { code }),
  /**
   * Re-mint the bearer from the live session cookie (reload rehydration).
   * Returns 401 when there is no authenticated session.
   */
  remint: () => http.post<{ token: string; user: User }>('/auth/api/auth/token'),
  me: () => http.get<{ user: User }>('/auth/api/auth/me'),
  logout: () => http.post<{ message: string }>('/auth/api/auth/logout'),
};
