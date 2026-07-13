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
  /** Soft org-policy nudge: enrolment required but still within the grace window. */
  mfaEnrollmentRequired?: boolean;
  allowedMethods?: string[];
  mfaEnrollmentGraceEndsAt?: number;
}
export interface MfaChallenge {
  mfaRequired: true;
  mfaToken: string;
  /** >0 when the org policy allows trusting this device to skip future prompts. */
  rememberDeviceDays?: number;
}
/**
 * Hard org-policy gate: the user's organization requires 2FA and the enrolment
 * grace window has elapsed. The passport session cookie IS established, but no
 * bearer is issued until the user enrols (setup → verify → re-mint).
 */
export interface MfaEnrollmentRequired {
  mfaEnrollmentRequired: true;
  enforced: true;
  allowedMethods: string[];
  message?: string;
}
export type LoginResult = LoginSuccess | MfaChallenge | MfaEnrollmentRequired;

export const isMfaChallenge = (r: LoginResult): r is MfaChallenge =>
  (r as MfaChallenge).mfaRequired === true;

export const isMfaEnrollmentRequired = (r: LoginResult): r is MfaEnrollmentRequired =>
  (r as MfaEnrollmentRequired).mfaEnrollmentRequired === true &&
  (r as MfaEnrollmentRequired).enforced === true;

/** Platform-level public-signup policy (fail-closed defaults on the server). */
export interface SignupPolicy {
  allowUserRegistration: boolean;
  requireEmailVerification: boolean;
}

/** Org signup body — an owner account plus the org to provision. */
export interface SignupBody {
  email: string;
  password: string;
  displayName?: string;
  org: {
    name: string;
    type: 'enterprise' | 'team' | 'personal';
    slug?: string;
    description?: string;
  };
}

/**
 * Verify-before-provision outcome (202): the account was created but the org is
 * held until the email is verified. No session/bearer is issued (no `token`).
 */
export interface SignupPending {
  message: string;
  user?: User;
}

/**
 * 201 provisions immediately and is LoginSuccess-shaped ({ user, token }); 202
 * withholds the org+session pending email verification. Discriminate on `token`.
 */
export type SignupResult = LoginSuccess | SignupPending;

export const isSignupPending = (r: SignupResult): r is SignupPending =>
  typeof (r as LoginSuccess).token !== 'string';

export const authApi = {
  login: (email: string, password: string) =>
    http.post<LoginResult>('/auth/api/auth/login', { email, password }),
  verifyMfa: (mfaToken: string, code: string, rememberDevice = false) =>
    http.post<LoginSuccess>('/auth/api/auth/mfa/verify', { mfaToken, code, rememberDevice }),
  /** Swap a one-time SSO/SAML callback code for the real bearer token. */
  exchange: (code: string) => http.post<{ token: string; user?: User }>('/auth/api/auth/exchange', { code }),
  /**
   * Re-mint the bearer from the live session cookie (reload rehydration).
   * Returns 401 when there is no authenticated session.
   */
  remint: () => http.post<{ token: string; user: User }>('/auth/api/auth/token'),
  me: () => http.get<{ user: User }>('/auth/api/auth/me'),
  logout: () => http.post<{ message: string }>('/auth/api/auth/logout'),
  /**
   * Accept a single-use invite / activation token: set the password, activate
   * the account, and receive a session (same { user, token } shape as login).
   * Public + token-gated; path is under /auth/api/auth/ so a validation 401
   * won't force-logout via the SPA's 401 whitelist.
   */
  acceptInvite: (body: { token: string; password: string; displayName?: string }) =>
    http.post<LoginSuccess>('/auth/api/auth/accept-invite', body),
  /**
   * Public platform signup policy (FEAT-033). The SPA reads this to gate the
   * public-signup entry point; fail-closed on the client too (no form when
   * registration is disabled). Public + under /auth/api/auth/ (401-whitelist).
   */
  signupPolicy: () => http.get<SignupPolicy>('/auth/api/auth/signup-policy'),
  /**
   * Public org signup (FEAT-033). Composes the same provisioning engine as the
   * admin/self-serve paths. Resolves to a LoginSuccess (201, provisioned +
   * sessioned) or a SignupPending (202, held for email verification — no token).
   */
  signupOrg: (body: SignupBody) => http.post<SignupResult>('/auth/api/auth/signup', body),
};
