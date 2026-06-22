import { PropsWithChildren, useMemo } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { ApiError } from '@/lib/http';
import { buildTheme } from './theme';
import { useThemeMode } from './themeMode';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error) => {
        // Don't retry auth/permission failures; retry transient errors once.
        if (error instanceof ApiError && [401, 403, 404].includes(error.status)) return false;
        return failureCount < 1;
      },
    },
  },
});

export function Providers({ children }: PropsWithChildren) {
  const mode = useThemeMode((s) => s.mode);
  const theme = useMemo(() => buildTheme(mode), [mode]);
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </QueryClientProvider>
  );
}
