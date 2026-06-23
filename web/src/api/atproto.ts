/**
 * AT-Protocol per-user identity client (/atproto/users/:id/dids).
 *
 * did:exprsn is platform-minted (self-certifying, derived from the user id) and
 * returned on GET. did:web / did:plc are linked by the user; the PUT is guarded
 * by the CA bearer token + ownership (handled by lib/http.ts sending the bearer).
 */
import { http } from '@/lib/http';

export interface UserDids {
  userId: string;
  didExprsn: string | null;
  didWeb: string | null;
  didWebVerified: boolean;
  didWebProof: string | null;
  didPlc: string | null;
  didPlcVerified: boolean;
  didPlcProof: string | null;
  challengePending: boolean;
}

export interface LinkDidsPayload {
  didWeb?: string;
  didPlc?: string;
}

export interface DidChallenge {
  token: string;
  expiresAt: string;
  instructions: { web: string; plc: string };
}

export interface VerifyResult {
  verified: boolean;
  method?: string;
  reason?: string;
}

export const atprotoApi = {
  getUserDids: (userId: string) => http.get<UserDids>(`/atproto/users/${userId}/dids`),
  linkUserDids: (userId: string, patch: LinkDidsPayload) =>
    http.put<UserDids>(`/atproto/users/${userId}/dids`, patch),
  unlinkUserDid: (userId: string, method: 'web' | 'plc') =>
    http.del<UserDids>(`/atproto/users/${userId}/dids/${method}`),
  // Proof-of-control: issue a challenge token, then verify after publishing it.
  issueChallenge: (userId: string) =>
    http.post<DidChallenge>(`/atproto/users/${userId}/dids/challenge`, {}),
  verifyControl: (userId: string, method: 'web' | 'plc') =>
    http.post<VerifyResult>(`/atproto/users/${userId}/dids/verify`, { method }, { skipAuthHandler: true }),
};
