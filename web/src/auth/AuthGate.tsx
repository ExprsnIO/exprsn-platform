import { PropsWithChildren, useEffect, useState } from 'react';
import { Box, CircularProgress } from '@mui/material';
import { authApi } from '@/api/auth';
import { setUnauthorizedHandler } from '@/lib/http';
import { useAppStore } from '@/app/store';

/**
 * Bootstraps the session once on app load. The bearer token lives only in
 * memory, so on a hard reload we re-mint it from the httpOnly session cookie
 * via POST /auth/api/auth/token. A 401 means no live session -> anonymous.
 *
 * Renders a spinner until session status is known so guards don't flicker.
 */
export function AuthGate({ children }: PropsWithChildren) {
  const { status, setSession, setAnonymous } = useAppStore();
  const [bootstrapped, setBootstrapped] = useState(false);

  useEffect(() => {
    // Drop the session on any 401 from a normal API call so guards redirect.
    setUnauthorizedHandler(() => useAppStore.getState().clearSession());
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { token, user } = await authApi.remint();
        if (!cancelled) setSession(user, token);
      } catch {
        // 401 (no live session) is the normal logged-out case; network/unknown
        // errors also land the user at the login screen.
        if (!cancelled) setAnonymous();
      } finally {
        if (!cancelled) setBootstrapped(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setSession, setAnonymous]);

  if (!bootstrapped && status === 'unknown') {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }
  return <>{children}</>;
}
