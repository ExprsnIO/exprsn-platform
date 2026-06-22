import { http } from '@/lib/http';

// Prefetch cache/proxy. Endpoints under /prefetch/api/*. No realtime namespace,
// no Sequelize models — thin admin/status surface.
export const prefetchApi = {
  status: () => http.get<Record<string, unknown>>('/prefetch/api/prefetch'),
};
