/**
 * Reports client (/moderator/api/reports). User-facing content reporting wired
 * to the moderator `Report` backend.
 *
 * The submit path is an AUTHENTICATED write: the server binds the reporter
 * identity (`reportedBy`) to the validated bearer (req.userId), so the client
 * MUST NOT send `reportedBy` — a body value is ignored server-side (BUG-010 /
 * SPIKE-001). Verified against API_SURFACE.md: `POST /moderator/api/reports`.
 */
import { http } from '@/lib/http';

/**
 * The report reasons — the single client-side source of truth, mirroring the
 * fixed `reason` ENUM on services/moderator/models/Report.js. Defined here (no
 * live `GET /reasons` endpoint this cycle) so the picker binds to a known,
 * structured list rather than a free-text blob (no-JSON-only-modals rule).
 */
export type ReportReason =
  | 'spam'
  | 'harassment'
  | 'hate_speech'
  | 'violence'
  | 'nsfw'
  | 'misinformation'
  | 'copyright'
  | 'personal_info'
  | 'other';

export const REPORT_REASONS: ReadonlyArray<{
  value: ReportReason;
  label: string;
  description: string;
}> = [
  { value: 'spam', label: 'Spam or misleading', description: 'Unwanted commercial content or deceptive activity' },
  { value: 'harassment', label: 'Harassment or bullying', description: 'Targeted abuse or intimidation' },
  { value: 'hate_speech', label: 'Hate speech', description: 'Attacks on protected groups' },
  { value: 'violence', label: 'Violence or threats', description: 'Threats or incitement of violence' },
  { value: 'nsfw', label: 'Nudity or sexual content', description: 'Adult or explicit material' },
  { value: 'misinformation', label: 'Misinformation', description: 'False or misleading claims' },
  { value: 'copyright', label: 'Copyright infringement', description: 'Unauthorized use of protected work' },
  { value: 'personal_info', label: 'Personal information', description: 'Sharing private or identifying details' },
  { value: 'other', label: 'Something else', description: 'A concern not covered above' },
];

/** Mirrors the `contentType` ENUM on the Report model. */
export type ReportContentType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'post'
  | 'comment'
  | 'message'
  | 'profile'
  | 'file';

export interface CreateReportInput {
  contentType: ReportContentType;
  contentId: string;
  /** Module the content lives in, e.g. 'timeline'. */
  sourceService: string;
  reason: ReportReason;
  details?: string;
  // NOTE: no `reportedBy` — the server binds it to the authenticated caller.
}

export interface CreateReportResult {
  success: boolean;
  report: { id: string; status: string };
}

export const reportsApi = {
  /**
   * POST /moderator/api/reports — submit a content report. The reporter identity
   * is derived server-side from the bearer; a duplicate report of the same item
   * by the same user returns a 409 (`ALREADY_REPORTED`), which callers surface
   * as "already reported" rather than an error.
   */
  create: (input: CreateReportInput) =>
    http.post<CreateReportResult>('/moderator/api/reports', input),
};
