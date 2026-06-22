import { PropsWithChildren } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAppStore } from '@/app/store';

/**
 * Route guard. Assumes AuthGate has already resolved session status. Redirects
 * anonymous users to /login, preserving where they were headed via returnUrl
 * (mirrors the backend's existing returnUrl convention).
 */
export function RequireAuth({ children }: PropsWithChildren) {
  const status = useAppStore((s) => s.status);
  const location = useLocation();

  if (status !== 'authenticated') {
    const returnUrl = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?returnUrl=${returnUrl}`} replace />;
  }
  return <>{children}</>;
}
