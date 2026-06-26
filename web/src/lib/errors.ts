import { ApiError } from './http';

/** True when `err` is an ApiError with the given HTTP status (e.g. 403, 404). */
export function isHttpError(err: unknown, status: number): boolean {
  return err instanceof ApiError && err.status === status;
}

/** Human-readable message from any thrown error, surfacing the correlation id. */
export function toMessage(err: unknown): string {
  if (err instanceof ApiError) {
    return err.correlationId ? `${err.message} (ref ${err.correlationId})` : err.message;
  }
  const raw = (err as Error)?.message;
  if (typeof raw === 'string' && raw) return raw;
  // Never let a non-string message reach JSX as the literal "[object Object]".
  if (raw != null) {
    try {
      return JSON.stringify(raw);
    } catch {
      /* fall through */
    }
  }
  return 'Something went wrong';
}
