/**
 * Live streaming admin API (/live/api/*). Streams + rooms + simulcast
 * destinations. Ingest provider is configured server-side (self-hosted SRS or
 * Cloudflare); these endpoints are provider-agnostic.
 */
import { http } from '@/lib/http';
import type { Stream } from '@/api/live';

export type { Stream } from '@/api/live';

export interface Room {
  id: string;
  name?: string;
  code?: string;
  status?: string;
  hostId?: string;
  isPrivate?: boolean;
  maxParticipants?: number;
  participantCount?: number;
  createdAt?: string;
  [k: string]: unknown;
}
export interface Destination {
  id: string;
  stream_id?: string;
  platform?: string;
  name?: string;
  is_enabled?: boolean;
  status?: string;
  rtmp_url?: string;
  [k: string]: unknown;
}

function q(params?: Record<string, string | number | boolean | undefined>): string {
  if (!params) return '';
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : '';
}

// Persisted Live config sections surfaced via ConfigSectionEditor, grouped
// logically: general settings, capacity/provider, rooms, recording, moderation.
export const LIVE_CONFIG_SECTIONS = [
  'live-settings',
  'limits',
  'provider',
  'live-rooms',
  'roompolicy',
  'recording',
  'live-recordings',
  'moderation',
];

export const liveAdminApi = {
  stats: () => http.get<Record<string, unknown>>('/live/api/stats'),
  listStreams: (params?: { status?: string; visibility?: string; userId?: string; limit?: number }) =>
    http.get<{ streams?: Stream[]; data?: Stream[] }>(`/live/api/streams${q(params)}`),
  startStream: (id: string) => http.post<unknown>(`/live/api/streams/${id}/start`, {}),
  stopStream: (id: string) => http.post<unknown>(`/live/api/streams/${id}/stop`, {}),
  deleteStream: (id: string) => http.del<unknown>(`/live/api/streams/${id}`),
  recordings: (id: string) => http.get<Record<string, unknown>>(`/live/api/streams/${id}/recordings`),

  listRooms: (params?: { status?: string; isPrivate?: boolean; limit?: number }) =>
    http.get<{ rooms?: Room[]; data?: Room[] }>(`/live/api/rooms${q(params)}`),
  deleteRoom: (id: string) => http.del<unknown>(`/live/api/rooms/${id}`),

  listDestinations: (params?: { stream_id?: string; platform?: string }) =>
    http.get<{ destinations?: Destination[]; data?: Destination[] }>(`/live/api/destinations${q(params)}`),
  createDestination: (body: Record<string, unknown>) => http.post<Record<string, unknown>>('/live/api/destinations', body),
  deleteDestination: (id: string) => http.del<unknown>(`/live/api/destinations/${id}`),
  testDestination: (id: string) => http.post<Record<string, unknown>>(`/live/api/destinations/${id}/test-connection`, {}),

  simulcastStatus: (streamId: string) => http.get<Record<string, unknown>>(`/live/api/simulcast/${streamId}/status`),
  simulcastStart: (streamId: string) => http.post<unknown>(`/live/api/simulcast/${streamId}/start`, {}),
  simulcastStop: (streamId: string) => http.post<unknown>(`/live/api/simulcast/${streamId}/stop`, {}),

  getConfigSection: (s: string) => http.get<unknown>(`/live/api/config/${s}`),
  saveConfigSection: (s: string, data: unknown) => http.post<unknown>(`/live/api/config/${s}`, data),

  // RabbitMQ ffmpeg fanout + recording queue depths for the Workers tab.
  workersStats: () =>
    http.get<{
      success?: boolean;
      queues?: {
        enabled: boolean;
        fanout?: { depth: number; dlq: number };
        recording?: { depth: number; dlq: number };
      };
    }>('/live/api/config/workers/stats'),
};
