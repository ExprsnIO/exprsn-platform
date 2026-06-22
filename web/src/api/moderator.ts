import { http } from '@/lib/http';

// Moderation (moderator). Endpoints under /moderator/api/*. Realtime via the
// /moderation and /notifications namespaces.
export interface Rule {
  id: string;
  name?: string;
  enabled?: boolean;
  [k: string]: unknown;
}
export interface Report {
  id: string;
  status?: string;
  [k: string]: unknown;
}

export const moderatorApi = {
  listRules: () => http.get<{ rules: Rule[] }>('/moderator/api/rules'),
  listReports: () => http.get<{ reports: Report[] }>('/moderator/api/reports'),
  listReviewQueue: () => http.get<{ items: unknown[] }>('/moderator/api/review'),
};
