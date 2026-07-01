/**
 * AT-Protocol bridge admin API. Read-only ops endpoints under /atproto plus the
 * public label firehose query (/xrpc/com.atproto.label.queryLabels). All GETs
 * are unauthenticated in this deployment; mutations (negate) need the admin
 * service token and are not exposed here.
 */
import { http } from '@/lib/http';

export interface AtprotoStats {
  labels: { total: number; lastSeq: number };
  inboundLabels: number;
  queue: Record<string, number>;
  /** Depth of the DID moderation dead-letter queue (null when DLQ disabled). */
  moderationDlq?: number | null;
}

export interface AtprotoIdentity {
  did: string | null;
  method: string;
  publicKeyMultibase: string | null;
  published: boolean;
  host: string;
}

export interface OutLabel {
  ver: number;
  src: string;
  uri: string;
  val: string;
  neg?: boolean;
  cid?: string;
  cts: string;
}

export interface InboundLabel {
  labeler: string;
  src: string;
  uri: string;
  val: string;
  neg: boolean;
  verified: boolean;
  cts: string | null;
  srcSeq: string | null;
}

export interface ExternalLabeler {
  endpoint: string;
  did: string | null;
  cursor: string | null;
  active: boolean;
  status: 'idle' | 'connecting' | 'connected' | 'disconnected';
  lastConnectedAt: string | null;
  lastEventAt: string | null;
  connectAttempts: number;
  heartbeatAt: string | null;
  lastError: string | null;
}

export interface FeedRecord {
  rkey: string;
  uri: string;
  record: Record<string, unknown>;
}

export const atprotoAdminApi = {
  stats: () => http.get<AtprotoStats>('/atproto/stats'),
  identity: () => http.get<AtprotoIdentity>('/atproto/identity'),
  feedRecord: () => http.get<FeedRecord>('/atproto/feed-record'),
  outLabels: (limit = 100) =>
    http.get<{ cursor?: string; labels: OutLabel[] }>(
      `/xrpc/com.atproto.label.queryLabels?uriPatterns=*&limit=${limit}`,
    ),
  inboundLabels: (limit = 100) =>
    http.get<{ labels: InboundLabel[] }>(`/atproto/inbound-labels?limit=${limit}`),
  externalLabelers: () => http.get<{ labelers: ExternalLabeler[] }>('/atproto/external-labelers'),

  // --- Operator mutations (platform-admin CA bearer required) ---
  applyLabel: (uri: string, val: string, neg = false) =>
    http.post<{ seq: string; uri: string; val: string; neg: boolean }>(
      '/atproto/labels',
      { uri, val, neg },
      { skipAuthHandler: true },
    ),
  negate: (uri: string, reason = 'manual') =>
    http.post<{ status: string; uri: string }>(
      '/atproto/labels/negate',
      { uri, reason },
      { skipAuthHandler: true },
    ),
  subscribeLabeler: (labeler: string) =>
    http.post<{ endpoint: string; did: string | null; active: boolean }>(
      '/atproto/external-labelers',
      { labeler },
      { skipAuthHandler: true },
    ),
  unsubscribeLabeler: (endpoint: string, purge = false) =>
    http.del<{ endpoint: string; active: boolean; purged: boolean }>(
      `/atproto/external-labelers?endpoint=${encodeURIComponent(endpoint)}${purge ? '&purge=true' : ''}`,
      { skipAuthHandler: true },
    ),
};
