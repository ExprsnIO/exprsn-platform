import { http } from '@/lib/http';

// Feed (timeline). Endpoints under /timeline/api/*. Shapes mirror the backend
// Post model (services/timeline/src/models/Post.js) — note ownership is `userId`.
export interface Post {
  id: string;
  userId: string;
  content: string;
  contentType?: string;
  media?: unknown[];
  visibility?: string;
  likeCount: number;
  commentCount: number;
  repostCount: number;
  /** Present on some feeds; otherwise tracked optimistically client-side. */
  liked?: boolean;
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
};
