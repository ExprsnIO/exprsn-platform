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

function qs(params?: ListFilesParams): string {
  if (!params) return '';
  const sp = new URLSearchParams();
  if (params.directoryId) sp.set('directoryId', params.directoryId);
  if (params.limit != null) sp.set('limit', String(params.limit));
  if (params.offset != null) sp.set('offset', String(params.offset));
  const s = sp.toString();
  return s ? `?${s}` : '';
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
  upload: (file: File, opts?: { directoryId?: string | null }) => {
    const form = new FormData();
    form.append('file', file);
    if (opts?.directoryId) form.append('directoryId', opts.directoryId);
    return http.post<{ success: boolean; file: FileItem }>(
      '/filevault/api/files/upload',
      undefined,
      { rawBody: form },
    );
  },

  deleteFile: (id: string) => http.del<{ success: boolean }>(`/filevault/api/files/${id}`),

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
