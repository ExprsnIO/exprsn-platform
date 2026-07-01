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
  path?: string;
  visibility?: 'private' | 'shared' | 'public';
  tags?: string[];
  deletedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  [k: string]: unknown;
}

/** A single stored revision of a file (GET /files/:id/versions). */
export interface FileVersionItem {
  id: string;
  version: number;
  size?: number;
  changeDescription?: string | null;
  contentHash?: string;
  createdAt?: string;
  [k: string]: unknown;
}

/** A line-level change in a text diff (one entry of `diff.changes`). */
export interface VersionDiffChange {
  value: string;
  added?: boolean;
  removed?: boolean;
  count?: number;
}

export interface VersionDiffSummary {
  additionsCount: number;
  deletionsCount: number;
  totalChanges: number;
}

export interface VersionDiff {
  fromVersion: number;
  toVersion: number;
  diff: {
    changes: VersionDiffChange[];
    additions: unknown[];
    deletions: unknown[];
    summary: VersionDiffSummary;
  };
  summary: VersionDiffSummary;
}

/** Storage usage totals (GET /storage/usage). */
export interface StorageUsage {
  fileCount: number;
  totalSize: number;
  totalSizeMB: string;
  totalSizeGB: string;
}

/** Quota figures (GET /storage/quota). */
export interface StorageQuota {
  used: number;
  total: number;
  available: number;
  usedPercentage: string;
}

/** A directory level's children (GET /directories[?directoryId=]). */
export interface DirectoryListing {
  subdirectories: DirectoryItem[];
  files: FileItem[];
}

/** Public share metadata (GET /share/:shareLinkId, no auth). */
export interface SharedFileMeta {
  id: string;
  name: string;
  size?: number;
  mimetype?: string;
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

/** Bearer-authed fetch returning the raw Response (for .text()/.arrayBuffer()). */
async function fetchRaw(path: string): Promise<Response> {
  const headers = new Headers();
  const token = tokenStore.get();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(`${config.apiBase}${path}`, { headers, credentials: 'include' });
  if (!res.ok) {
    let body: Record<string, unknown> = {};
    try { body = await res.json(); } catch { /* non-JSON */ }
    throw new ApiError(res.status, body);
  }
  return res;
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

  /** Upload a new version of an existing file (multipart; multer field `file`). */
  updateFile: (fileId: string, file: File, changeDescription?: string) => {
    const form = new FormData();
    form.append('file', file);
    if (changeDescription) form.append('changeDescription', changeDescription);
    return http.put<{ success: boolean; file: FileItem }>(
      `/filevault/api/files/${fileId}`,
      undefined,
      { rawBody: form },
    );
  },

  // --- In-browser editor: create / rename / read-content / save-as-new-version ---

  /** Create a new blank (or seeded) file. */
  createFile: (name: string, directoryId?: string | null, content?: string) =>
    http.post<{ success: boolean; file: FileItem }>('/filevault/api/files/create', {
      name,
      directoryId: directoryId ?? null,
      content: content ?? '',
    }),

  /** Rename a file (metadata only — no new version). */
  renameFile: (fileId: string, name: string) =>
    http.patch<{ success: boolean; file: FileItem }>(`/filevault/api/files/${fileId}/rename`, { name }),

  /** Fetch a file's content as decoded text (for the editor / CSV / JSON). */
  getTextContent: (fileId: string): Promise<string> =>
    fetchRaw(`/filevault/api/files/${fileId}/download`).then((r) => r.text()),

  /** Fetch a file's content as an ArrayBuffer (for docx/xlsx viewers). */
  getArrayBuffer: (fileId: string): Promise<ArrayBuffer> =>
    fetchRaw(`/filevault/api/files/${fileId}/download`).then((r) => r.arrayBuffer()),

  /**
   * Save edited content as a NEW VERSION. `data` may be text or a Blob (e.g. an
   * annotated-image canvas export). Reuses updateFile (PUT → new version).
   */
  saveContent: (fileId: string, data: Blob | string, filename: string, changeDescription?: string) => {
    const blob = typeof data === 'string' ? new Blob([data], { type: 'text/plain;charset=utf-8' }) : data;
    const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
    const form = new FormData();
    form.append('file', file);
    if (changeDescription) form.append('changeDescription', changeDescription);
    return http.put<{ success: boolean; file: FileItem }>(
      `/filevault/api/files/${fileId}`,
      undefined,
      { rawBody: form },
    );
  },

  // --- Directories (CRUD; one schema-scoped tree per user) ---

  createDirectory: (name: string, parentId?: string | null) =>
    http.post<{ success: boolean; directory: DirectoryItem }>('/filevault/api/directories', {
      name,
      parentId: parentId ?? null,
    }),

  /**
   * List a directory level's children (folders + files). Pass the parent
   * directory id (omit for the root). Note the backend query param is
   * `directoryId`, not `parentId`.
   */
  listDirectories: (parentId?: string | null) => {
    const sp = new URLSearchParams();
    if (parentId) sp.set('directoryId', parentId);
    const s = sp.toString();
    return http.get<{ success: boolean } & DirectoryListing>(
      `/filevault/api/directories${s ? `?${s}` : ''}`,
    );
  },

  getDirectory: (directoryId: string) =>
    http.get<{ success: boolean; directory: DirectoryItem }>(
      `/filevault/api/directories/${directoryId}`,
    ),

  renameDirectory: (directoryId: string, name: string) =>
    http.put<{ success: boolean; directory: DirectoryItem }>(
      `/filevault/api/directories/${directoryId}/rename`,
      { name },
    ),

  /** Move a directory under a new parent (null = root). Backend body key is `newParentId`. */
  moveDirectory: (directoryId: string, newParentId: string | null) =>
    http.put<{ success: boolean; directory: DirectoryItem }>(
      `/filevault/api/directories/${directoryId}/move`,
      { newParentId },
    ),

  deleteDirectory: (directoryId: string, recursive = false) =>
    http.del<{ success: boolean }>(
      `/filevault/api/directories/${directoryId}${recursive ? '?recursive=true' : ''}`,
    ),

  // --- Versions ---

  listVersions: (fileId: string) =>
    http.get<{ success: boolean; versions: FileVersionItem[] }>(
      `/filevault/api/files/${fileId}/versions`,
    ),

  restoreVersion: (fileId: string, versionNumber: number) =>
    http.post<{ success: boolean; file: FileItem }>(
      `/filevault/api/files/${fileId}/restore/${versionNumber}`,
    ),

  diffVersions: (fileId: string, from: number, to: number) =>
    http.get<{ success: boolean; diff: VersionDiff }>(
      `/filevault/api/files/${fileId}/diff?from=${from}&to=${to}`,
    ),

  // --- Storage / quota ---

  storageUsage: () =>
    http.get<{ success: boolean; usage: StorageUsage }>('/filevault/api/storage/usage'),

  storageQuota: () =>
    http.get<{ success: boolean; quota: StorageQuota }>('/filevault/api/storage/quota'),

  // --- Search ---

  search: (q: string, params?: { limit?: number; offset?: number }) => {
    const sp = new URLSearchParams({ q });
    if (params?.limit != null) sp.set('limit', String(params.limit));
    if (params?.offset != null) sp.set('offset', String(params.offset));
    return http.get<{ success: boolean; query: string; files: FileItem[]; count: number }>(
      `/filevault/api/search?${sp.toString()}`,
    );
  },

  searchByTag: (tag: string) =>
    http.get<{ success: boolean; tag: string; files: FileItem[]; count: number }>(
      `/filevault/api/search/tag/${encodeURIComponent(tag)}`,
    ),

  // --- Trash (soft-deleted files) ---

  listTrash: () =>
    http.get<{ success: boolean; files: FileItem[]; count: number }>(
      '/filevault/api/files/trash',
    ),

  /** Restore (undelete) a soft-deleted file. */
  restoreFile: (fileId: string) =>
    http.post<{ success: boolean; file: FileItem }>(`/filevault/api/files/${fileId}/restore`),

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

  /**
   * Public share metadata (no auth). The CA token is the capability: it must be
   * supplied and match the link. Metadata fetch does NOT consume a use.
   */
  getSharedFile: (shareLinkId: string, token: string) =>
    http.get<{ success: boolean; file: SharedFileMeta }>(
      `/filevault/api/share/${shareLinkId}?token=${encodeURIComponent(token)}`,
    ),

  /** The shareable in-app landing URL (the SPA `/s/:id` route, carrying the token). */
  shareAppUrl: (shareLinkId: string, token: string): string =>
    `${window.location.origin}/s/${shareLinkId}?token=${encodeURIComponent(token)}`,

  /** Build a same-origin public download URL for a share link (token required). */
  shareDownloadUrl: (shareLinkId: string, token: string): string =>
    `${window.location.origin}/filevault/api/share/${shareLinkId}/download?token=${encodeURIComponent(token)}`,

  /**
   * Mint a file-scoped CA access token (Vault-style direct access, no share-link
   * row). Returns the token id + a ready-to-use public download URL.
   */
  createFileAccessToken: (fileId: string, input?: { expiresIn?: number; permissions?: SharePermissions }) =>
    http.post<{ success: boolean; tokenId: string; expiresAt: string | null; downloadUrl: string }>(
      `/filevault/api/share/files/${fileId}/access-token`,
      input ?? {},
    ),

  /** Same-origin public download URL for a file-scoped access token. */
  fileTokenDownloadUrl: (fileId: string, token: string): string =>
    `${window.location.origin}/filevault/api/share/file/${fileId}/download?token=${encodeURIComponent(token)}`,

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
