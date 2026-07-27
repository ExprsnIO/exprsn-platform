/**
 * True for relative URLs and absolute URLs on this origin.
 *
 * Callers own the empty-string rule (guard `url !== ''` at the call site if
 * blank means "unset" rather than "this origin").
 */
export function isSameOriginUrl(url: string): boolean {
  try {
    return new URL(url, window.location.origin).origin === window.location.origin;
  } catch {
    return false;
  }
}
