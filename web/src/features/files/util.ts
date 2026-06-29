import { useEffect, useState } from 'react';

/** Human-readable byte size, e.g. 1536 -> "1.5 KB". */
export function formatBytes(bytes?: number): string {
  if (bytes == null) return '—';
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let val = n / 1024;
  let i = 0;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i += 1;
  }
  return `${val.toFixed(val < 10 ? 1 : 0)} ${units[i]}`;
}

/** Locale date-time, blank on missing/invalid. */
export function formatDate(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
}

/** True for image mimetypes (previewable in a lightbox). */
export function isImageType(mimetype?: string): boolean {
  return !!mimetype && mimetype.startsWith('image/');
}

/** True for PDFs (previewable in an embedded frame). */
export function isPdfType(mimetype?: string): boolean {
  return mimetype === 'application/pdf';
}

/** True for text-ish mimetypes (eligible for inline diff). */
export function isTextType(mimetype?: string): boolean {
  if (!mimetype) return false;
  return (
    mimetype.startsWith('text/') ||
    mimetype === 'application/json' ||
    mimetype === 'application/javascript' ||
    mimetype === 'application/xml' ||
    mimetype === 'application/x-sh'
  );
}

/**
 * Convert a `<input type="datetime-local">` value to whole seconds from now,
 * clamped to >= 1. Returns undefined for an empty/past value.
 */
export function datetimeToExpiresIn(value: string): number | undefined {
  if (!value) return undefined;
  const target = new Date(value).getTime();
  if (Number.isNaN(target)) return undefined;
  const secs = Math.floor((target - Date.now()) / 1000);
  return secs > 0 ? secs : undefined;
}

/**
 * Load a bearer-authed object URL (thumbnail or full file) and revoke it on
 * unmount / dependency change. FileVault binary endpoints have no public URL —
 * the bytes are served only to an authenticated request, so they must be
 * fetched as blobs and wrapped. Mirrors the timeline PostMedia pattern.
 */
export function useObjectUrl(loader: () => Promise<string>, deps: unknown[]) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let created: string | null = null;
    setUrl(null);
    setFailed(false);
    loader()
      .then((u) => {
        if (!active) {
          URL.revokeObjectURL(u);
          return;
        }
        created = u;
        setUrl(u);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
      if (created) URL.revokeObjectURL(created);
    };
    // loader is recreated each render; deps are the real dependency signal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { url, failed };
}
