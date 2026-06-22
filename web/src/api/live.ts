import { http } from '@/lib/http';

// Live streaming (live). Endpoints under /live/api/*. Ingest provider is
// configurable server-side (self-hosted SRS or Cloudflare Stream); the API is
// provider-agnostic.
export interface Stream {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  rtmp_url?: string;
  hls_url?: string;
  dash_url?: string;
  thumbnail_url?: string;
  status?: string;
  visibility?: string;
  viewer_count?: number;
  currentViewers?: number;
  isLive?: boolean;
  is_recording?: boolean;
  started_at?: string;
  created_at?: string;
  [k: string]: unknown;
}

export interface CreateStreamInput {
  title: string;
  description?: string;
  visibility?: 'public' | 'unlisted' | 'private';
}

/**
 * Rewrite a self-hosted SRS playback URL (http://host:8085/live/<key>.m3u8) to
 * the same-origin HTTPS path proxied by nginx (/srs/live/<key>.m3u8), avoiding
 * mixed-content blocking. HTTPS provider URLs (e.g. Cloudflare) pass through.
 */
export function playableHlsUrl(hlsUrl?: string): string | null {
  if (!hlsUrl) return null;
  try {
    const u = new URL(hlsUrl, window.location.origin);
    if (u.protocol === 'http:') return `/srs${u.pathname}`;
    return u.toString();
  } catch {
    return hlsUrl;
  }
}

export const liveApi = {
  listStreams: () => http.get<{ success: boolean; streams: Stream[] }>('/live/api/streams'),
  getStream: (id: string) => http.get<{ success: boolean; stream: Stream }>(`/live/api/streams/${id}`),
  createStream: (input: CreateStreamInput) =>
    http.post<{ success: boolean; stream: Stream }>('/live/api/streams', input),
  startStream: (id: string) =>
    http.post<{ success: boolean; stream: Stream }>(`/live/api/streams/${id}/start`, {}),
  stopStream: (id: string) =>
    http.post<{ success: boolean; stream: Stream }>(`/live/api/streams/${id}/stop`, {}),
  deleteStream: (id: string) => http.del<{ success: boolean }>(`/live/api/streams/${id}`),
};
