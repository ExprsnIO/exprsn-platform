/**
 * Shared hook for the low-code vocab catalog (known hook-bus events, flow action
 * types, storage modes, field types/roles, lookup providers). Backed by
 * GET /lowcode/api/design/catalog and cached for the session so every editor can
 * present real options instead of hardcoding them.
 */
import { useQuery } from '@tanstack/react-query';
import { lowcodeApi } from '@/api/lowcode';
import type { LowcodeCatalog } from '@/api/admin/lowcode';

const EMPTY: LowcodeCatalog = {
  events: [], actions: [], capabilities: [], storageModes: ['db', 'mirror', 'filevault', 'export'],
  fieldTypes: ['string', 'text', 'number', 'integer', 'boolean', 'date', 'datetime', 'enum', 'reference', 'json'],
  fieldRoles: ['dimension', 'measure', 'attribute'], aggregations: ['sum', 'avg', 'count', 'min', 'max'],
  lookupProviders: [],
};

export function useCatalog() {
  const query = useQuery({
    queryKey: ['lowcode', 'catalog'],
    queryFn: () => lowcodeApi.catalog(),
    staleTime: 5 * 60 * 1000,
  });
  return { catalog: query.data ?? EMPTY, query };
}
