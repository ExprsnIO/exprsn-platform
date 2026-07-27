/**
 * AdvancedDataTable — a column-driven table with per-column filtering, sortable
 * headers and pagination, in two modes:
 *
 *  · client mode (default): give it ALL rows; it filters/sorts/paginates in the
 *    browser. Used for the small schema lists (entities, lookups, flows, apps).
 *  · server mode: pass `server={{ total, query, onQueryChange }}`; the table is
 *    controlled and emits a TableQuery for the caller to translate into API
 *    params (records, which can be large).
 *
 * Sits alongside the simpler admin `DataTable`; this one is opt-in where the
 * advanced UX is wanted, so existing screens are untouched.
 */
import { ReactNode, useMemo, useState } from 'react';
import {
  Alert, IconButton, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableContainer,
  TableHead, TablePagination, TableRow, TableSortLabel, TextField, Tooltip, Typography,
} from '@mui/material';
import ClearIcon from '@mui/icons-material/Clear';
import { display } from '@/features/admin/ui';
import type { FilterOp } from '@/api/admin/lowcode';

export type ColumnFilterType = 'text' | 'number' | 'enum' | 'boolean' | 'date';

export interface AdvColumn<R> {
  key: string;
  header: ReactNode;
  render?: (row: R) => ReactNode;
  align?: 'left' | 'right' | 'center';
  mono?: boolean;
  /** Enable a sort header. Server mode uses `filterField`/`key` as the sort field. */
  sortable?: boolean;
  /** Enable a per-column filter control. */
  filter?: {
    type?: ColumnFilterType;
    /** Field name sent to the server (defaults to column key). */
    field?: string;
    options?: { value: string; label: string }[];
    /** For client mode: how to read the comparable value off a row. */
    accessor?: (row: R) => unknown;
  };
}

export interface FilterState {
  op: FilterOp;
  value: string;
  /** second bound for range (number/date) filters → maps to a second condition */
  value2?: string;
}

export interface TableQuery {
  filters: Record<string, FilterState>;
  sort: { field: string; dir: 'asc' | 'desc' }[];
  offset: number;
  limit: number;
}

export const emptyQuery = (limit = 25): TableQuery => ({ filters: {}, sort: [], offset: 0, limit });

/** Column filter → server RecordFilter list (a range yields two conditions). */
export function queryFilters(q: TableQuery): { field: string; op: FilterOp; value: string }[] {
  const out: { field: string; op: FilterOp; value: string }[] = [];
  for (const [field, f] of Object.entries(q.filters)) {
    if (f.value !== '' && f.value != null) out.push({ field, op: f.op, value: f.value });
    if (f.value2 !== '' && f.value2 != null) out.push({ field, op: 'lte', value: f.value2 });
  }
  return out;
}

function FilterCell({ type, options, state, onChange }: {
  type: ColumnFilterType;
  options?: { value: string; label: string }[];
  state: FilterState | undefined;
  onChange: (s: FilterState | undefined) => void;
}) {
  const v = state?.value ?? '';
  if (type === 'enum' || type === 'boolean') {
    const opts = type === 'boolean'
      ? [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]
      : options ?? [];
    return (
      <TextField
        select fullWidth size="small" variant="standard" value={v}
        onChange={(e) => onChange(e.target.value ? { op: 'eq', value: e.target.value } : undefined)}
        SelectProps={{ displayEmpty: true }}
      >
        <MenuItem value=""><em>Any</em></MenuItem>
        {opts.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
      </TextField>
    );
  }
  if (type === 'number' || type === 'date') {
    // range: value = min (gte), value2 = max (lte)
    return (
      <Stack direction="row" spacing={0.5}>
        <TextField
          size="small" variant="standard" placeholder="min" type={type === 'date' ? 'date' : 'number'}
          value={state?.value ?? ''}
          onChange={(e) => onChange({ op: 'gte', value: e.target.value, value2: state?.value2 })}
          InputLabelProps={type === 'date' ? { shrink: true } : undefined}
        />
        <TextField
          size="small" variant="standard" placeholder="max" type={type === 'date' ? 'date' : 'number'}
          value={state?.value2 ?? ''}
          onChange={(e) => onChange({ op: 'gte', value: state?.value ?? '', value2: e.target.value })}
          InputLabelProps={type === 'date' ? { shrink: true } : undefined}
        />
      </Stack>
    );
  }
  return (
    <TextField
      fullWidth size="small" variant="standard" placeholder="contains…" value={v}
      onChange={(e) => onChange(e.target.value ? { op: 'contains', value: e.target.value } : undefined)}
    />
  );
}

export function AdvancedDataTable<R>({
  columns, rows, rowKey, empty = 'No records.', onRowClick, dense = true, server, rowsPerPageOptions = [10, 25, 50, 100],
}: {
  columns: AdvColumn<R>[];
  rows: R[];
  rowKey: (row: R, i: number) => string;
  empty?: ReactNode;
  onRowClick?: (row: R) => void;
  dense?: boolean;
  rowsPerPageOptions?: number[];
  /** Provide to switch to server-controlled mode. */
  server?: { total: number; query: TableQuery; onQueryChange: (q: TableQuery) => void };
}) {
  const [local, setLocal] = useState<TableQuery>(() => emptyQuery());
  const query = server ? server.query : local;
  const setQuery = server ? server.onQueryChange : setLocal;
  const [showFilters, setShowFilters] = useState(false);

  const fieldOf = (c: AdvColumn<R>) => c.filter?.field ?? c.key;

  const setFilter = (field: string, s: FilterState | undefined) => {
    const filters = { ...query.filters };
    if (s) filters[field] = s; else delete filters[field];
    setQuery({ ...query, filters, offset: 0 });
  };

  const toggleSort = (field: string) => {
    const cur = query.sort.find((s) => s.field === field);
    let sort: TableQuery['sort'];
    if (!cur) sort = [{ field, dir: 'asc' }];
    else if (cur.dir === 'asc') sort = [{ field, dir: 'desc' }];
    else sort = [];
    setQuery({ ...query, sort, offset: 0 });
  };

  // ── client-mode derivation ────────────────────────────────────────────────
  const derived = useMemo(() => {
    if (server) return { view: rows, total: rows.length };
    let view = [...rows];
    for (const c of columns) {
      const f = query.filters[fieldOf(c)];
      if (!f || !c.filter) continue;
      const acc = c.filter.accessor ?? ((r: R) => (r as Record<string, unknown>)[c.key]);
      const type = c.filter.type ?? 'text';
      view = view.filter((r) => {
        const raw = acc(r);
        if (type === 'text') return String(raw ?? '').toLowerCase().includes(f.value.toLowerCase());
        if (type === 'enum') return String(raw ?? '') === f.value;
        if (type === 'boolean') return String(!!raw) === f.value;
        const num = Number(raw);
        const min = f.value !== '' ? Number(f.value) : -Infinity;
        const max = f.value2 !== '' && f.value2 != null ? Number(f.value2) : Infinity;
        if (type === 'date') {
          const t = new Date(String(raw)).getTime();
          const lo = f.value ? new Date(f.value).getTime() : -Infinity;
          const hi = f.value2 ? new Date(f.value2).getTime() : Infinity;
          return t >= lo && t <= hi;
        }
        return num >= min && num <= max;
      });
    }
    if (query.sort.length) {
      const s = query.sort[0];
      const col = columns.find((c) => fieldOf(c) === s.field);
      const acc = col?.filter?.accessor ?? ((r: R) => (r as Record<string, unknown>)[s.field]);
      view.sort((a, b) => {
        const av = acc(a); const bv = acc(b);
        let cmp: number;
        if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
        else cmp = String(av ?? '').localeCompare(String(bv ?? ''), undefined, { numeric: true });
        return s.dir === 'asc' ? cmp : -cmp;
      });
    }
    return { view, total: view.length };
  }, [server, rows, columns, query]);

  const total = server ? server.total : derived.total;
  const pageRows = useMemo(() => {
    if (server) return rows; // server already returns the current page
    return derived.view.slice(query.offset, query.offset + query.limit);
  }, [server, rows, derived, query.offset, query.limit]);

  const activeFilterCount = Object.keys(query.filters).length;
  const hasFilterable = columns.some((c) => c.filter);

  return (
    <Stack spacing={1}>
      {hasFilterable && (
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography
            variant="caption" color="primary" sx={{ cursor: 'pointer', userSelect: 'none' }}
            onClick={() => setShowFilters((s) => !s)}
          >
            {showFilters ? 'Hide filters' : 'Show filters'}{activeFilterCount ? ` (${activeFilterCount} active)` : ''}
          </Typography>
          {activeFilterCount > 0 && (
            <Tooltip title="Clear all filters">
              <IconButton aria-label="Clear all filters" size="small" onClick={() => setQuery({ ...query, filters: {}, offset: 0 })}>
                <ClearIcon fontSize="inherit" />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      )}
      <TableContainer component={Paper} variant="outlined">
        <Table size={dense ? 'small' : 'medium'}>
          <TableHead>
            <TableRow>
              {columns.map((c) => {
                const field = fieldOf(c);
                const sort = query.sort.find((s) => s.field === field);
                return (
                  <TableCell key={c.key} align={c.align}>
                    {c.sortable ? (
                      <TableSortLabel
                        active={!!sort}
                        direction={sort?.dir ?? 'asc'}
                        onClick={() => toggleSort(field)}
                      >
                        {c.header}
                      </TableSortLabel>
                    ) : c.header}
                  </TableCell>
                );
              })}
            </TableRow>
            {showFilters && hasFilterable && (
              <TableRow>
                {columns.map((c) => (
                  <TableCell key={c.key} sx={{ verticalAlign: 'top', pt: 0.5 }}>
                    {c.filter ? (
                      <FilterCell
                        type={c.filter.type ?? 'text'}
                        options={c.filter.options}
                        state={query.filters[fieldOf(c)]}
                        onChange={(s) => setFilter(fieldOf(c), s)}
                      />
                    ) : null}
                  </TableCell>
                ))}
              </TableRow>
            )}
          </TableHead>
          <TableBody>
            {pageRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length}>
                  <Alert severity="info" sx={{ my: 0.5 }}>{empty}</Alert>
                </TableCell>
              </TableRow>
            ) : pageRows.map((row, i) => (
              <TableRow
                key={rowKey(row, i)} hover
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                sx={onRowClick ? { cursor: 'pointer' } : undefined}
              >
                {columns.map((c) => (
                  <TableCell key={c.key} align={c.align} sx={c.mono ? { fontFamily: 'monospace', fontSize: 12 } : undefined}>
                    {c.render ? c.render(row) : display((row as Record<string, unknown>)[c.key])}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        component="div"
        count={total}
        page={query.limit ? Math.floor(query.offset / query.limit) : 0}
        onPageChange={(_e, p) => setQuery({ ...query, offset: p * query.limit })}
        rowsPerPage={query.limit}
        onRowsPerPageChange={(e) => setQuery({ ...query, limit: parseInt(e.target.value, 10), offset: 0 })}
        rowsPerPageOptions={rowsPerPageOptions}
      />
    </Stack>
  );
}
