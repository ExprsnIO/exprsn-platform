/**
 * Timeline admin API (/timeline/api/*). The Bull-queue and config clients live
 * in ./jobs (shared with the cross-module Jobs & Queues section) and are
 * re-exported here so TimelineSection has a single import surface; this file
 * adds the timeline-specific admin calls (post-approval decisions, module
 * stats via the settings config section, health).
 */
import { http } from '@/lib/http';

export {
  timelineJobsApi,
  timelineConfigApi,
  asQueueMap,
  TIMELINE_CONFIG_SECTIONS,
  type Job,
  type QueueStats,
} from './jobs';

/** Shape of GET /timeline/api/config/timeline-settings — a config form schema
 *  that also carries module stats (totalPosts/totalLists/todayPosts). */
export interface TimelineSettingsPayload {
  title?: string;
  description?: string;
  fields?: Array<{ name: string; label?: string; type?: string; value?: unknown }>;
  stats?: { totalPosts?: number; totalLists?: number; todayPosts?: number };
  [k: string]: unknown;
}

export interface TimelineHealth {
  service?: string;
  status?: string;
  uptime?: number;
  timestamp?: string;
  checks?: Record<string, { status?: string; latency?: string; error?: string; [k: string]: unknown }>;
  [k: string]: unknown;
}

export const timelineAdminApi = {
  /** Admin-guarded settings section; also the only source of post/list counts. */
  settings: () => http.get<TimelineSettingsPayload>('/timeline/api/config/timeline-settings'),
  /** Current moderation/approval policy (requireApproval, approvalMechanism, …). */
  moderationPolicy: () => http.get<TimelineSettingsPayload>('/timeline/api/config/timeline-moderation'),
  /** Dependency health (db/redis/queues/…) — unauthenticated. */
  health: () => http.get<TimelineHealth>('/timeline/health'),
  /** Fetch a single post (used to preview a held post before deciding). */
  post: (id: string) => http.get<Record<string, unknown>>(`/timeline/api/posts/${id}`),
  /** Posts held for approval (admin). */
  pendingApprovals: (limit = 50) =>
    http.get<{ success: boolean; count: number; posts: Record<string, unknown>[] }>(
      `/timeline/api/posts/approvals/pending?limit=${limit}`,
    ),
  /**
   * Manual approval decision for a post held by "Require Approval for New
   * Posts" (admin only). Approve restores the requested visibility.
   */
  approvalDecision: (postId: string, decision: 'approved' | 'rejected', reason?: string) =>
    http.post<{ success?: boolean; post?: Record<string, unknown> }>(
      `/timeline/api/posts/${postId}/approval`,
      { decision, ...(reason ? { reason } : {}) },
    ),
};
