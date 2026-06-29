import { http, ApiError } from '@/lib/http';
import { config } from '@/lib/config';
import { tokenStore } from '@/lib/token';

// Files (filevault). Endpoints under /filevault/api/*. Shapes mirror the
// filevault File model (services/filevault/src/models/File.js).
export interface FileItem {
  id: string;
  name: string;
  size?: number;
  mimetype?: string;
  directoryId?: string | null;
  currentVersion?: number;
  createdAt?: string;
  updatedAt?: string;
  [k: string]: unknown;
}

export interface ListFilesParams {
  directoryId?: string;
  limit?: number;
  offset?: number;
}

/** Params for listing files inside a group (GET /groups/:id/files). */
export interface ListGroupFilesParams {
  directoryId?: string;
  /** Filter to image files only (gallery grid). */
  images?: boolean;
  /** Mimetype prefix filter, e.g. "video". Ignored when `images` is set. */
  mimetype?: string;
  /** Tags to filter by (sent as a csv). */
  tags?: string[];
  limit?: number;
  offset?: number;
}

/** Options for uploading a file into a group (POST /groups/:id/files/upload). */
export interface UploadToGroupOptions {
  path?: string;
  directoryId?: string | null;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface DirectoryItem {
  id: string;
  name: string;
  parentId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  [k: string]: unknown;
}

export interface SharePermissions {
  read: boolean;
  write?: boolean;
  delete?: boolean;
}

export interface ShareLink {
  id: string;
  fileId: string;
  tokenId?: string;
  permissions?: SharePermissions;
  expiresAt?: string | null;
  maxUses?: number | null;
  useCount?: number;
  createdAt?: string;
  [k: string]: unknown;
}

export interface CreateShareInput {
  permissions?: SharePermissions;
  /** Seconds until expiry; omit for a non-expiring link. */
  expiresIn?: number;
  maxUses?: number;
}

function qs(params?: ListFilesParams): string {
  if (!params) return '';
  const sp = new URLSearchParams();
  if (params.directoryId) sp.set('directoryId', params.directoryId);
  if (params.limit != null) sp.set('limit', String(params.limit));
  if (params.offset != null) sp.set('offset', String(params.offset));
  const s = sp.toString();
  return s ? `?${s}` : '';
}

function groupQs(params?: ListGroupFilesParams): string {
  if (!params) return '';
  const sp = new URLSearchParams();
  if (params.directoryId) sp.set('directoryId', params.directoryId);
  if (params.images) sp.set('images', 'true');
  else if (params.mimetype) sp.set('mimetype', params.mimetype);
  if (params.tags && params.tags.length > 0) sp.set('tags', params.tags.join(','));
  if (params.limit != null) sp.set('limit', String(params.limit));
  if (params.offset != null) sp.set('offset', String(params.offset));
  const s = sp.toString();
  return s ? `?${s}` : '';
}

/**
 * Fetch a bearer-authenticated binary endpoint and return an object URL for it.
 * Used for thumbnails and full images, which have no public URL — the bytes are
 * served only to an authenticated, group-member-guarded request, so we fetch
 * with the Authorization header and wrap the blob. Callers must
 * URL.revokeObjectURL the result when done to avoid leaking.
 */
async function fetchObjectUrl(path: string): Promise<string> {
  const headers = new Headers();
  const token = tokenStore.get();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${config.apiBase}${path}`, { headers, credentials: 'include' });
  if (!res.ok) {
    let body: Record<string, unknown> = {};
    try {
      body = await res.json();
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, body);
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

/** Parse a filename out of a Content-Disposition header, falling back. */
function filenameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(header);
  return m ? decodeURIComponent(m[1]) : fallback;
}

export const filevaultApi = {
  listFiles: (params?: ListFilesParams) =>
    http.get<{ success: boolean; files: FileItem[]; count: number }>(
      `/filevault/api/files${qs(params)}`,
    ),

  /** Multipart upload. The backend multer field name is `file`. */
  upload: (
    file: File,
    opts?: { directoryId?: string | null; visibility?: 'private' | 'shared' | 'public' },
  ) => {
    const form = new FormData();
    form.append('file', file);
    if (opts?.directoryId) form.append('directoryId', opts.directoryId);
    if (opts?.visibility) form.append('visibility', opts.visibility);
    return http.post<{ success: boolean; file: FileItem }>(
      '/filevault/api/files/upload',
      undefined,
      { rawBody: form },
    );
  },

  deleteFile: (id: string) => http.del<{ success: boolean }>(`/filevault/api/files/${id}`),

  // --- Group files (member-scoped; see /filevault/api/groups/:groupId/*) ---

  listGroupFiles: (groupId: string, params?: ListGroupFilesParams) =>
    http.get<{ success: boolean; files: FileItem[]; count: number }>(
      `/filevault/api/groups/${groupId}/files${groupQs(params)}`,
    ),

  /** Multipart upload into a group (member + write). multer field name is `file`. */
  uploadToGroup: (groupId: string, file: File, opts?: UploadToGroupOptions) => {
    const form = new FormData();
    form.append('file', file);
    if (opts?.path) form.append('path', opts.path);
    if (opts?.directoryId) form.append('directoryId', opts.directoryId);
    if (opts?.tags && opts.tags.length > 0) form.append('tags', JSON.stringify(opts.tags));
    if (opts?.metadata) form.append('metadata', JSON.stringify(opts.metadata));
    return http.post<{ success: boolean; file: FileItem }>(
      `/filevault/api/groups/${groupId}/files/upload`,
      undefined,
      { rawBody: form },
    );
  },

  listGroupDirectories: (groupId: string, params?: { directoryId?: string }) => {
    const sp = new URLSearchParams();
    if (params?.directoryId) sp.set('directoryId', params.directoryId);
    const s = sp.toString();
    return http.get<{ success: boolean; subdirectories: DirectoryItem[]; files: FileItem[] }>(
      `/filevault/api/groups/${groupId}/directories${s ? `?${s}` : ''}`,
    );
  },

  /**
   * Bearer-authed thumbnail bytes for an (image) file, returned as an object
   * URL. There is no public URL — the route is group-member-guarded. Caller
   * must URL.revokeObjectURL the result when the element unmounts.
   */
  getThumbnail: (fileId: string, size: 'small' | 'medium' | 'large' = 'small') =>
    fetchObjectUrl(`/filevault/api/thumbnails/${fileId}?size=${size}`),

  /** Bearer-authed full file bytes as an object URL (e.g. lightbox image). */
  getFileObjectUrl: (fileId: string) =>
    fetchObjectUrl(`/filevault/api/files/${fileId}/download`),

  // --- Sharing (share-link id is the capability; backed by a real CA token) ---

  createShare: (fileId: string, input: CreateShareInput) =>
    http.post<{ success: boolean; shareUrl: string; shareLink: ShareLink; token: { id: string } }>(
      `/filevault/api/share/files/${fileId}/share`,
      input,
    ),

  listShares: (fileId: string) =>
    http.get<{ success: boolean; shareLinks: ShareLink[]; count: number }>(
      `/filevault/api/share/files/${fileId}/shares`,
    ),

  revokeShare: (shareLinkId: string) =>
    http.del<{ success: boolean }>(`/filevault/api/share/${shareLinkId}`),

  /** Build a same-origin public download URL for a share link. */
  shareDownloadUrl: (shareLinkId: string): string =>
    `${window.location.origin}/filevault/api/share/${shareLinkId}/download`,

  /**
   * Download a file's bytes and trigger a browser save. The download route is
   * bearer-authenticated (no query-token), so we fetch with the Authorization
   * header and save the resulting blob rather than navigating to the URL.
   */
  download: async (item: FileItem): Promise<void> => {
    const headers = new Headers();
    const token = tokenStore.get();
    if (token) headers.set('Authorization', `Bearer ${token}`);

    const res = await fetch(`${config.apiBase}/filevault/api/files/${item.id}/download`, {
      headers,
      credentials: 'include',
    });
    if (!res.ok) {
      let body: Record<string, unknown> = {};
      try {
        body = await res.json();
      } catch {
        /* non-JSON error body */
      }
      throw new ApiError(res.status, body);
    }

    const blob = await res.blob();
    const name = filenameFromDisposition(res.headers.get('content-disposition'), item.name);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};
