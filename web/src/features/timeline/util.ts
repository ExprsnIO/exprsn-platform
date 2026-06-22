/** Compact relative-time label, e.g. "now", "5m", "3h", "2d", else a date. */
export function relativeTime(iso?: string): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const secs = Math.floor((Date.now() - then) / 1000);
  if (secs < 45) return 'now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
  if (secs < 604800) return `${Math.floor(secs / 86400)}d`;
  return new Date(iso).toLocaleDateString();
}

/** Full, locale-formatted timestamp for the relative-time tooltip. */
export function absoluteTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
}

/** Two-character avatar initials derived from an id/handle. */
export function initials(id?: string): string {
  if (!id) return '?';
  return id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || '?';
}

/** Short, stable display handle for a raw user id (UUIDs are unwieldy). */
export function shortHandle(userId?: string): string {
  if (!userId) return 'unknown';
  return userId.length > 12 ? `${userId.slice(0, 8)}…` : userId;
}
