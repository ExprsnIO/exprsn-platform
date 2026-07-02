/** Two-character initials from a display name, falling back to an id. */
export function personInitials(name?: string | null, fallbackId?: string): string {
  const src = (name || '').trim();
  if (src) {
    const parts = src.split(/\s+/);
    return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
  }
  return (fallbackId ?? '?').slice(0, 2).toUpperCase();
}

/** A stable-ish avatar background color derived from an id (Unified accent tokens). */
export function avatarColor(id?: string): string {
  const palette = [
    'var(--exprsn-primary)',
    'var(--exprsn-accent-purple)',
    'var(--exprsn-accent-green)',
    'var(--exprsn-accent-orange)',
    'var(--exprsn-accent-pink)',
    'var(--exprsn-accent-cyan)',
    'var(--exprsn-secondary)',
  ];
  if (!id) return palette[0];
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length];
}
