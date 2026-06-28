import { http } from '@/lib/http';

// Feed (timeline). Endpoints under /timeline/api/*. Shapes mirror the backend
// Post model (services/timeline/src/models/Post.js) — note ownership is `userId`.
/** A like row, as included on group-feed posts (`include: [{ model: Like }]`). */
export interface Like {
  id?: string;
  postId?: string;
  userId: string;
  createdAt?: string;
}

export interface Post {
  id: string;
  userId: string;
  content: string;
  contentType?: string;
  media?: unknown[];
  /** Group ownership — present on group-scoped posts. */
  groupId?: string | null;
  visibility?: string;
  likeCount: number;
  commentCount: number;
  repostCount: number;
  /** Present on some feeds; otherwise tracked optimistically client-side. */
  liked?: boolean;
  /** Tracked optimistically client-side (the feed carries no per-user repost flag). */
  reposted?: boolean;
  /** Included on the group feed so the client can derive `liked`. */
  likes?: Like[];
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt?: string;
  [k: string]: unknown;
}

export interface FeedResponse {
  success: boolean;
  posts: Post[];
  pagination?: { page?: number; limit?: number; hasMore?: boolean };
}

/** A post comment (services/timeline Comment model). */
export interface Comment {
  id: string;
  postId: string;
  userId: string;
  content: string;
  createdAt: string;
  [k: string]: unknown;
}

export interface CommentsResponse {
  comments: Comment[];
  pagination?: { page?: number; limit?: number; hasMore?: boolean };
}

/** Cursor pagination block returned by the group feed (cursor mode). */
export interface CursorPagination {
  hasMore?: boolean;
  nextCursor?: string | null;
  prevCursor?: string | null;
  count?: number;
}

export interface GroupFeedResponse {
  success: boolean;
  groupId: string;
  posts: Post[];
  pagination?: CursorPagination & { page?: number; limit?: number };
}

export interface GroupFeedParams {
  limit?: number;
  /** Cursor-mode: opaque cursor + direction (after = older, before = newer). */
  cursor?: string;
  direction?: 'after' | 'before';
}

/** Options for creating a group-scoped post. */
export interface CreateGroupPostOptions {
  visibility?: string;
  mediaIds?: string[];
  replyTo?: string;
  quoteOf?: string;
}

export interface FeedParams {
  limit?: number;
  offset?: number;
}

function qs(params?: FeedParams): string {
  if (!params) return '';
  const sp = new URLSearchParams();
  if (params.limit != null) sp.set('limit', String(params.limit));
  if (params.offset != null) sp.set('offset', String(params.offset));
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const timelineApi = {
  /** Home feed — posts from the people the signed-in user follows (+ their own). */
  homeFeed: (params?: FeedParams) => http.get<FeedResponse>(`/timeline/api/timeline${qs(params)}`),
  /** Global public timeline. */
  globalFeed: (params?: FeedParams) => http.get<FeedResponse>(`/timeline/api/timeline/global${qs(params)}`),
  createPost: (content: string, visibility = 'public') =>
    http.post<{ success: boolean; post: Post }>('/timeline/api/posts', { content, visibility }),
  like: (postId: string) => http.post<{ liked: boolean }>(`/timeline/api/posts/${postId}/like`),
  unlike: (postId: string) => http.del<{ liked: boolean }>(`/timeline/api/posts/${postId}/like`),

  /** A specific user's posts (their public timeline). */
  userPosts: (userId: string, params?: { page?: number; limit?: number }) => {
    const sp = new URLSearchParams();
    if (params?.page != null) sp.set('page', String(params.page));
    if (params?.limit != null) sp.set('limit', String(params.limit));
    const q = sp.toString();
    return http.get<FeedResponse>(`/timeline/api/timeline/user/${userId}${q ? `?${q}` : ''}`);
  },

  // ── Groups ────────────────────────────────────────────────────────────────
  /** A group's feed (newest-first), guarded by membership (403 for non-members). */
  groupFeed: (groupId: string, params?: GroupFeedParams) => {
    const sp = new URLSearchParams();
    if (params?.limit != null) sp.set('limit', String(params.limit));
    if (params?.cursor) {
      sp.set('cursor', params.cursor);
      sp.set('direction', params.direction ?? 'after');
    }
    const q = sp.toString();
    return http.get<GroupFeedResponse>(`/timeline/api/timeline/group/${groupId}${q ? `?${q}` : ''}`);
  },
  /** Create a post that belongs to a group. The backend enforces member-only
   *  visibility for private/unlisted groups regardless of `opts.visibility`. */
  createGroupPost: (groupId: string, content: string, opts?: CreateGroupPostOptions) =>
    http.post<{ success: boolean; post: Post }>('/timeline/api/posts', {
      groupId,
      content,
      ...(opts?.visibility ? { visibility: opts.visibility } : {}),
      ...(opts?.mediaIds?.length ? { mediaIds: opts.mediaIds } : {}),
      ...(opts?.replyTo ? { replyTo: opts.replyTo } : {}),
      ...(opts?.quoteOf ? { quoteOf: opts.quoteOf } : {}),
    }),

  // ── Comments / reposts (postId-based; shared with the main timeline) ────────
  comments: (postId: string, params?: { page?: number; limit?: number }) => {
    const sp = new URLSearchParams();
    if (params?.page != null) sp.set('page', String(params.page));
    if (params?.limit != null) sp.set('limit', String(params.limit));
    const q = sp.toString();
    return http.get<CommentsResponse>(`/timeline/api/posts/${postId}/comments${q ? `?${q}` : ''}`);
  },
  comment: (postId: string, content: string) =>
    http.post<{ message: string; comment: Comment }>(`/timeline/api/posts/${postId}/comments`, { content }),
  repost: (postId: string) =>
    http.post<{ success: boolean; reposted: boolean }>(`/timeline/api/posts/${postId}/repost`),
  unrepost: (postId: string) =>
    http.del<{ success: boolean; reposted: boolean }>(`/timeline/api/posts/${postId}/repost`),

  // ── Follow graph ──────────────────────────────────────────────────────────
  followStatus: (userId: string) =>
    http.get<{ following: boolean }>(`/timeline/api/interactions/users/${userId}/follow`),
  follow: (userId: string) =>
    http.post<{ follow: unknown }>(`/timeline/api/interactions/users/${userId}/follow`),
  unfollow: (userId: string) =>
    http.del<{ success: boolean }>(`/timeline/api/interactions/users/${userId}/follow`),
};
