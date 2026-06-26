import { useRouteError, isRouteErrorResponse, Link as RouterLink } from 'react-router-dom';
import { Alert, AlertTitle, Box, Button, Paper, Stack, Typography } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import HomeIcon from '@mui/icons-material/Home';
import { toMessage } from '@/lib/errors';

/**
 * Route-level error boundary. React Router renders this in place of a route's
 * element when that element throws during render (or a loader/action errors),
 * so a single page crash shows a contained panel instead of white-screening the
 * whole SPA. Wired as `errorElement` on the app shells in router.tsx.
 */
export function RouteErrorBoundary() {
  const error = useRouteError();
  const detail = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : toMessage(error);
  const stack = error instanceof Error ? error.stack : undefined;

  return (
    <Box sx={{ maxWidth: 640, mx: 'auto', mt: 6, px: 2 }}>
      <Alert severity="error" sx={{ mb: 2 }}>
        <AlertTitle>Something went wrong</AlertTitle>
        This page hit an unexpected error. The rest of the app is still working —
        you can reload this page or head back home.
      </Alert>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2, wordBreak: 'break-word' }}>
        {detail}
      </Typography>

      {import.meta.env.DEV && stack && (
        <Paper
          variant="outlined"
          sx={{ p: 1.5, mb: 2, maxHeight: 220, overflow: 'auto', bgcolor: 'action.hover' }}
        >
          <Typography
            component="pre"
            variant="caption"
            sx={{ m: 0, whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}
          >
            {stack}
          </Typography>
        </Paper>
      )}

      <Stack direction="row" spacing={1}>
        <Button variant="contained" startIcon={<RefreshIcon />} onClick={() => window.location.reload()}>
          Reload page
        </Button>
        <Button variant="outlined" startIcon={<HomeIcon />} component={RouterLink} to="/">
          Go home
        </Button>
      </Stack>
    </Box>
  );
}
