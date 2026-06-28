import { PropsWithChildren } from 'react';
import { Navigate } from 'react-router-dom';
import { useAppStore } from '@/app/store';

/**
 * Route guard for the admin console. Allows only users whose token roles
 * include 'admin'. Assumes RequireAuth has already established a session — wrap
 * RequireAdmin INSIDE RequireAuth. This is UX / defense-in-depth; every admin
 * endpoint is still enforced on the backend.
 */
export function RequireAdmin({ children }: PropsWithChildren) {
  const roles = useAppStore((s) => s.user?.roles);
  const isAdmin = Array.isArray(roles) && roles.includes('admin');

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
