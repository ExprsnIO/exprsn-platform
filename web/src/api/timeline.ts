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

/**
 * A media attachment persisted on a post (`Post.media` JSON array).
 *
 * Two addressing modes, checked in this order by the renderer:
 *  - `url` — a directly-loadable URL (public/external asset or an HLS manifest
 *    for live/video). Used by demo/seed content and link unfurls.
 *  - `id`  — a FileVault fileId; bytes are bearer-authed and fetched as a blob
 *    (the default for user uploads via the Composer).
 *
 * `type` drives how it renders: 'image' (grid + lightbox), 'video' (inline
 * player), 'live' (HLS card → player), 'gallery' (alias for a run of images).
 */
export interface PostMedia {
  /** FileVault fileId (bearer-authed) — present on user uploads. */
  id?: string;
  /** 'image' | 'video' | 'live' | 'gallery' | string. */
  type?: string;
  /** Directly-loadable URL (image src, mp4, or HLS .m3u8). */
  url?: string;
  /** Poster/preview image URL (videos and live cards). */
  thumbnailUrl?: string;
  /** Optional caption/title (shown on live + video cards). */
  title?: string;
  /** Intrinsic dimensions, when known (reserved for layout). */
  width?: number;
  height?: number;
  [k: string]: unknown;
}

export interface Post {
  id: string;
  userId: string;
  content: string;
  contentType?: string;
  media?: PostMedia[];
  /** Group ownership — present on group-scoped posts. */
  groupId?: string | null;
  visibility?: string;
  likeCount: number;
  commentCount: number;
  repostCount: number;
  /** Present on some feeds; otherwise tracked optimistically client-side. */
  liked?: boolean;
  /** Present on the bookmarks feed; otherwise tracked optimistically client-side. */
  bookmarked?: boolean;
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
  /** Direct parent comment for threaded replies; null/absent = top-level. */
  parentId?: string | null;
  createdAt: string;
  [k: string]: unknown;
}

/** Order of the comment list returned by GET /:id/comments. */
export type CommentSortParam = 'newest' | 'oldest';

export interface CommentsResponse {
  comments: Comment[];
  sort?: string;
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

/** Options for creating a post (main timeline or group-scoped). */
export interface CreatePostOptions {
  visibility?: string;
  mediaIds?: string[];
  replyTo?: string;
  quoteOf?: string;
  groupId?: string;
}

/** Response from GET /timeline/api/timeline/bookmarks. */
export interface BookmarksResponse {
  success: boolean;
  bookmarks: Post[];
  count?: number;
  pagination?: { page?: number; limit?: number; hasMore?: boolean };
}

export interface SearchParams {
  page?: number;
  limit?: number;
  offset?: number;
}

export interface SearchResponse {
  success: boolean;
  query: string;
  posts: Post[];
  total?: number;
  count?: number;
  searchMethod?: string;
  pagination?: { page?: number; limit?: number; offset?: number; hasMore?: boolean };
}

export interface TrendingHashtag {
  tag: string;
  count?: number;
  [k: string]: unknown;
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
  /**
   * Create a post. Backward-compatible: callers may pass a visibility string
   * (legacy) or an options object `{ visibility, mediaIds, replyTo, quoteOf,
   * groupId }`. Media is persisted on the post via FileVault file ids.
   */
  createPost: (content: string, optsOrVisibility?: string | CreatePostOptions) => {
    const opts: CreatePostOptions =
      typeof optsOrVisibility === 'string'
        ? { visibility: optsOrVisibility }
        : optsOrVisibility ?? {};
    return http.post<{ success: boolean; post: Post }>('/timeline/api/posts', {
      content,
      visibility: opts.visibility ?? 'public',
      ...(opts.mediaIds?.length ? { mediaIds: opts.mediaIds } : {}),
      ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
      ...(opts.quoteOf ? { quoteOf: opts.quoteOf } : {}),
      ...(opts.groupId ? { groupId: opts.groupId } : {}),
    });
  },
  /** A single post by id (full-content / permalink view). 403 if private + not author. */
  getPost: (postId: string) =>
    http.get<{ success: boolean; post: Post }>(`/timeline/api/posts/${postId}`),
  /** Edit a post's content (author-gated; 403 for non-authors). */
  updatePost: (postId: string, content: string) =>
    http.put<{ success: boolean; post: Post }>(`/timeline/api/posts/${postId}`, { content }),
  /** Delete a post (author-gated). */
  deletePost: (postId: string) =>
    http.del<{ success: boolean }>(`/timeline/api/posts/${postId}`),
  like: (postId: string) => http.post<{ liked: boolean }>(`/timeline/api/posts/${postId}/like`),
  unlike: (postId: string) => http.del<{ liked: boolean }>(`/timeline/api/posts/${postId}/like`),

  // ── Bookmarks ───────────────────────────────────────────────────────────
  bookmark: (postId: string) =>
    http.post<{ bookmarked: boolean }>(`/timeline/api/posts/${postId}/bookmark`),
  unbookmark: (postId: string) =>
    http.del<{ bookmarked: boolean }>(`/timeline/api/posts/${postId}/bookmark`),
  bookmarksFeed: (params?: FeedParams) =>
    http.get<BookmarksResponse>(`/timeline/api/timeline/bookmarks${qs(params)}`),

  // ── Search ──────────────────────────────────────────────────────────────
  searchPosts: (q: string, params?: SearchParams) => {
    const sp = new URLSearchParams();
    sp.set('q', q);
    if (params?.page != null) sp.set('page', String(params.page));
    if (params?.limit != null) sp.set('limit', String(params.limit));
    if (params?.offset != null) sp.set('offset', String(params.offset));
    return http.get<SearchResponse>(`/timeline/api/search/posts?${sp.toString()}`);
  },
  trendingHashtags: () =>
    http.get<{ success?: boolean; hashtags?: TrendingHashtag[]; trending?: TrendingHashtag[] }>(
      '/timeline/api/search/trending/hashtags',
    ),

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
  comments: (
    postId: string,
    params?: { page?: number; limit?: number; sort?: CommentSortParam },
  ) => {
    const sp = new URLSearchParams();
    if (params?.page != null) sp.set('page', String(params.page));
    if (params?.limit != null) sp.set('limit', String(params.limit));
    if (params?.sort) sp.set('sort', params.sort);
    const q = sp.toString();
    return http.get<CommentsResponse>(`/timeline/api/posts/${postId}/comments${q ? `?${q}` : ''}`);
  },
  /** Create a comment, optionally as a threaded reply to `parentId`. */
  comment: (postId: string, content: string, parentId?: string | null) =>
    http.post<{ message: string; comment: Comment }>(`/timeline/api/posts/${postId}/comments`, {
      content,
      ...(parentId ? { parentId } : {}),
    }),
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
