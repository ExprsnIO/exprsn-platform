/**
 * Shared building blocks for the admin/management console. Kept deliberately
 * generic (column-driven tables, a query-state wrapper, a JSON config editor) so
 * the per-module sections stay declarative and small while covering the full
 * API surface. Conventions match the rest of web/: TanStack Query for server
 * state, MUI for chrome, toMessage() for the gateway error envelope.
 */
import { Fragment, isValidElement, ReactNode, useCallback, useEffect, useMemo, useState, MouseEvent } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Link,
  Menu,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import FilterListIcon from '@mui/icons-material/FilterList';
import SearchIcon from '@mui/icons-material/Search';
import { InputAdornment } from '@mui/material';
import type { UseQueryResult } from '@tanstack/react-query';
import { toMessage } from '@/lib/errors';

/* ------------------------------------------------------------------ toast */

export interface Toast {
  message: string;
  severity?: 'success' | 'error' | 'info' | 'warning';
}

export function useToast() {
  const [toast, setToast] = useState<Toast | null>(null);
  const showToast = useCallback(
    (message: string, severity: Toast['severity'] = 'info') => setToast({ message, severity }),
    [],
  );
  const showError = useCallback((e: unknown) => setToast({ message: toMessage(e), severity: 'error' }), []);
  const ToastHost = (
    <Snackbar
      open={!!toast}
      autoHideDuration={4500}
      onClose={() => setToast(null)}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      {toast ? (
        <Alert severity={toast.severity} variant="filled" onClose={() => setToast(null)}>
          {toast.message}
        </Alert>
      ) : undefined}
    </Snackbar>
  );
  return { showToast, showError, ToastHost };
}

/* ----------------------------------------------------------------- layout */

export function SectionHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <Stack direction="row" alignItems="flex-start" justifyContent="space-between" sx={{ mb: 1 }}>
      <Box>
        <Typography variant="h5">{title}</Typography>
        {subtitle && (
          <Typography variant="body2" color="text.secondary">
            {subtitle}
          </Typography>
        )}
      </Box>
      {actions && <Stack direction="row" spacing={1}>{actions}</Stack>}
    </Stack>
  );
}

export function Card({
  title,
  actions,
  children,
}: {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      {(title || actions) && (
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
          {title && <Typography variant="subtitle1" fontWeight={600}>{title}</Typography>}
          {actions}
        </Stack>
      )}
      {children}
    </Paper>
  );
}

export function StatCard({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, minWidth: 150, flex: '1 1 150px' }}>
      <Typography variant="overline" color="text.secondary" noWrap>
        {label}
      </Typography>
      <Typography variant="h5" sx={{ lineHeight: 1.2 }}>
        {display(value)}
      </Typography>
      {hint && (
        <Typography variant="caption" color="text.secondary">
          {hint}
        </Typography>
      )}
    </Paper>
  );
}

export function Loading({ size = 28 }: { size?: number }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
      <CircularProgress size={size} />
    </Box>
  );
}

/**
 * Renders loading / error / empty states for a query, then hands the resolved
 * data to `children`. Keeps every list page from re-implementing the trio.
 */
export function QueryState<T>({
  query,
  children,
  empty = 'Nothing here yet.',
}: {
  query: UseQueryResult<T>;
  children: (data: T) => ReactNode;
  empty?: ReactNode;
}) {
  if (query.isLoading) return <Loading />;
  if (query.isError) return <Alert severity="error">{toMessage(query.error)}</Alert>;
  const data = query.data as T;
  const isEmptyArray = Array.isArray(data) && data.length === 0;
  if (data == null || isEmptyArray) return <Alert severity="info">{empty}</Alert>;
  return <>{children(data)}</>;
}

/* ---------------------------------------------------------------- display */

/**
 * Coerce an arbitrary value to something safe to drop into JSX. The admin APIs
 * occasionally hand back an object/array where a scalar was expected (Sequelize
 * aggregate rows, nested `{ value, unit }` stats, etc.); the naive `String(v)`
 * fallback turned those into the literal "[object Object]" in every table cell
 * and stat card. Render plain objects/arrays as compact JSON so the data is at
 * least visible, pass through React elements untouched, and show an em-dash for
 * nullish values.
 */
export function display(v: unknown): ReactNode {
  if (v == null) return '—';
  if (isValidElement(v)) return v;
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v);
    } catch {
      return '—';
    }
  }
  return String(v);
}

/* ------------------------------------------------------------------ table */

export interface Column<R> {
  key: string;
  header: ReactNode;
  /** Cell renderer; defaults to String(row[key]). */
  render?: (row: R) => ReactNode;
  align?: 'left' | 'right' | 'center';
  mono?: boolean;
  /** Value used for sorting; defaults to the raw row[key]. */
  sortValue?: (row: R) => string | number | null | undefined;
  /** Value the per-column filter matches against; defaults to String(row[key]). */
  filterValue?: (row: R) => string;
  /** Column cannot be hidden from the column picker (e.g. an actions column). */
  locked?: boolean;
  /** Start hidden until enabled from the column picker. */
  defaultHidden?: boolean;
}

function rawCell<R>(row: R, key: string): unknown {
  return (row as Record<string, unknown>)[key];
}

function sortComparable<R>(c: Column<R>, row: R): string | number | null {
  const v = c.sortValue ? c.sortValue(row) : rawCell(row, c.key);
  if (v == null || v === '') return null;
  if (typeof v === 'number' || typeof v === 'boolean') return Number(v);
  const s = String(v);
  // Dates (ISO or parseable) sort chronologically.
  if (ISO_DATE_RE.test(s)) {
    const t = Date.parse(s);
    if (!Number.isNaN(t)) return t;
  }
  const n = Number(s);
  if (s.trim() !== '' && !Number.isNaN(n)) return n;
  return s.toLowerCase();
}

function filterText<R>(c: Column<R>, row: R): string {
  if (c.filterValue) return c.filterValue(row);
  const v = rawCell(row, c.key);
  if (v == null) return '';
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
}

const columnPrefsKey = (tableId: string) => `admin.table.${tableId}.hidden`;

function loadHidden(tableId: string | undefined, columns: { key: string; defaultHidden?: boolean }[]): string[] {
  const fallback = columns.filter((c) => c.defaultHidden).map((c) => c.key);
  if (!tableId) return fallback;
  try {
    const stored = localStorage.getItem(columnPrefsKey(tableId));
    if (stored) return JSON.parse(stored) as string[];
  } catch {
    /* ignore storage failures */
  }
  return fallback;
}

/**
 * Column-driven table. Sort, per-column filters, and global search are ON by
 * default (TASK-039) — pass `sortable={false}` etc. to opt out. Capabilities:
 *  - `tableId` — column picker (add/remove columns), persisted per table
 *  - `sortable` — click headers to sort (uses `sortValue`, falls back to the raw cell)
 *  - `filterable` — a per-column filter row, toggled from the toolbar
 *  - `searchable` — global free-text search across all visible columns
 *  - `onRowClick` — row click opens the row (clicks on buttons/inputs are ignored)
 */
export function DataTable<R>({
  columns,
  rows,
  rowKey,
  empty = 'No records.',
  tableId,
  sortable = true,
  filterable = true,
  searchable = true,
  onRowClick,
  initialSort,
}: {
  columns: Column<R>[];
  rows: R[];
  rowKey: (row: R, i: number) => string;
  empty?: ReactNode;
  tableId?: string;
  sortable?: boolean;
  filterable?: boolean;
  searchable?: boolean;
  onRowClick?: (row: R) => void;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
}) {
  const [hidden, setHidden] = useState<string[]>(() => loadHidden(tableId, columns));
  const [pickerAnchor, setPickerAnchor] = useState<HTMLElement | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(initialSort ?? null);

  const toggleColumn = (key: string) => {
    setHidden((cur) => {
      const next = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key];
      if (tableId) {
        try { localStorage.setItem(columnPrefsKey(tableId), JSON.stringify(next)); } catch { /* ignore */ }
      }
      return next;
    });
  };

  const visible = columns.filter((c) => c.locked || !hidden.includes(c.key));

  const activeFilters = Object.entries(filters).filter(([, v]) => v.trim() !== '');
  const needle = search.trim().toLowerCase();
  const processed = useMemo(() => {
    let out = rows;
    if (searchable && needle) {
      const searchCols = columns.filter((c) => c.header !== '' && (c.locked || !hidden.includes(c.key)));
      out = out.filter((row) => searchCols.some((c) => filterText(c, row).toLowerCase().includes(needle)));
    }
    if (filterable && activeFilters.length) {
      out = out.filter((row) =>
        activeFilters.every(([key, needle]) => {
          const col = columns.find((c) => c.key === key);
          if (!col) return true;
          return filterText(col, row).toLowerCase().includes(needle.trim().toLowerCase());
        }),
      );
    }
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      if (col) {
        const dir = sort.dir === 'asc' ? 1 : -1;
        out = [...out].sort((a, b) => {
          const av = sortComparable(col, a);
          const bv = sortComparable(col, b);
          if (av == null && bv == null) return 0;
          if (av == null) return 1; // nullish always last
          if (bv == null) return -1;
          if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
          return String(av).localeCompare(String(bv)) * dir;
        });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, columns, sort, filterable, searchable, needle, hidden, JSON.stringify(filters)]);

  const hasToolbar = !!tableId || filterable || searchable;

  if (!rows.length && !hasToolbar) return <Alert severity="info">{empty}</Alert>;

  const handleRowClick = (e: MouseEvent<HTMLTableRowElement>, row: R) => {
    if (!onRowClick) return;
    // Ignore clicks that originate from interactive cell content.
    const el = e.target as HTMLElement;
    if (el.closest('button, a, input, textarea, select, [role="button"], [role="combobox"], .MuiSelect-select')) return;
    onRowClick(row);
  };

  return (
    <Box>
      {hasToolbar && (
        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: 0.5 }}>
          {searchable ? (
            <TextField
              size="small"
              variant="standard"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{ maxWidth: 260, flexGrow: 1 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" color={needle ? 'primary' : 'disabled'} />
                  </InputAdornment>
                ),
              }}
            />
          ) : (
            <Box sx={{ flexGrow: 1 }} />
          )}
          <Box sx={{ flexGrow: 1 }} />
          {filterable && (
            <Tooltip title={filtersOpen ? 'Hide filters' : 'Filter columns'}>
              <IconButton
                size="small"
                color={filtersOpen || activeFilters.length ? 'primary' : 'default'}
                onClick={() => setFiltersOpen((o) => !o)}
              >
                <FilterListIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {(
            <>
              <Tooltip title="Add / remove columns">
                <IconButton size="small" onClick={(e) => setPickerAnchor(e.currentTarget)}>
                  <ViewColumnIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Menu anchorEl={pickerAnchor} open={!!pickerAnchor} onClose={() => setPickerAnchor(null)}>
                {columns.filter((c) => !c.locked && c.header !== '').map((c) => (
                  <MenuItem key={c.key} dense onClick={() => toggleColumn(c.key)}>
                    <Checkbox size="small" checked={!hidden.includes(c.key)} sx={{ p: 0.5, mr: 1 }} />
                    {typeof c.header === 'string' ? c.header : c.key}
                  </MenuItem>
                ))}
              </Menu>
            </>
          )}
        </Stack>
      )}

      {!rows.length ? (
        <Alert severity="info">{empty}</Alert>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                {visible.map((c) => (
                  <TableCell key={c.key} align={c.align} sortDirection={sort?.key === c.key ? sort.dir : false}>
                    {sortable && c.header !== '' ? (
                      <TableSortLabel
                        active={sort?.key === c.key}
                        direction={sort?.key === c.key ? sort.dir : 'asc'}
                        onClick={() =>
                          setSort((cur) =>
                            cur?.key === c.key
                              ? cur.dir === 'asc' ? { key: c.key, dir: 'desc' } : null
                              : { key: c.key, dir: 'asc' },
                          )
                        }
                      >
                        {c.header}
                      </TableSortLabel>
                    ) : (
                      c.header
                    )}
                  </TableCell>
                ))}
              </TableRow>
              {filterable && filtersOpen && (
                <TableRow>
                  {visible.map((c) => (
                    <TableCell key={c.key} sx={{ py: 0.5 }}>
                      {c.header !== '' && (
                        <TextField
                          size="small"
                          variant="standard"
                          placeholder="Filter…"
                          value={filters[c.key] ?? ''}
                          onChange={(e) => setFilters((f) => ({ ...f, [c.key]: e.target.value }))}
                          fullWidth
                        />
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              )}
            </TableHead>
            <TableBody>
              {processed.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={visible.length} sx={{ color: 'text.disabled', fontStyle: 'italic' }}>
                    No rows match the current search/filters.
                  </TableCell>
                </TableRow>
              ) : (
                processed.map((row, i) => (
                  <TableRow
                    key={rowKey(row, i)}
                    hover
                    onClick={(e) => handleRowClick(e, row)}
                    sx={onRowClick ? { cursor: 'pointer' } : undefined}
                  >
                    {visible.map((c) => (
                      <TableCell
                        key={c.key}
                        align={c.align}
                        sx={c.mono ? { fontFamily: 'monospace', fontSize: 12 } : undefined}
                      >
                        {c.render ? c.render(row) : display(rawCell(row, c.key))}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}

/* ----------------------------------------------------------------- chips */

const STATUS_COLOR: Record<string, 'success' | 'error' | 'warning' | 'info' | 'default'> = {
  active: 'success',
  live: 'success',
  enabled: 'success',
  completed: 'success',
  approved: 'success',
  resolved: 'success',
  ready: 'success',
  created: 'success',
  invited: 'info',
  skipped: 'default',
  revoked: 'error',
  error: 'error',
  failed: 'error',
  rejected: 'error',
  banned: 'error',
  expired: 'warning',
  pending: 'warning',
  waiting: 'warning',
  suspended: 'warning',
  delayed: 'warning',
  'under-review': 'info',
  ended: 'default',
  inactive: 'default',
};

export function StatusChip({ status }: { status?: string }) {
  const label = status == null || typeof status === 'object' ? 'unknown' : String(status);
  const key = label.toLowerCase();
  return (
    <Chip size="small" variant="outlined" color={STATUS_COLOR[key] ?? 'default'} label={label} />
  );
}

/** Compact R/W/A/D/U permission badges from a permissions-like object. */
export function PermBadges({
  perms,
}: {
  perms: { read?: boolean; write?: boolean; append?: boolean; delete?: boolean; update?: boolean; admin?: boolean };
}) {
  const flags: Array<[string, boolean | undefined]> = [
    ['R', perms.read],
    ['W', perms.write],
    ['A', perms.append],
    ['U', perms.update],
    ['D', perms.delete],
    ['*', perms.admin],
  ];
  return (
    <Stack direction="row" spacing={0.5}>
      {flags.map(([label, on]) => (
        <Box
          key={label}
          sx={{
            width: 18,
            height: 18,
            borderRadius: '4px',
            fontSize: 11,
            lineHeight: '18px',
            textAlign: 'center',
            fontWeight: 700,
            color: on ? 'success.contrastText' : 'text.disabled',
            bgcolor: on ? 'success.main' : 'action.hover',
          }}
        >
          {label}
        </Box>
      ))}
    </Stack>
  );
}

/* ------------------------------------------------ typed value presentation */

// Tokens that should read as all-caps once a key is split into words.
const ACRONYMS = new Set([
  'id', 'url', 'uri', 'ocsp', 'crl', 'tls', 'ssl', 'mfa', 'api', 'ai', 'ip', 'ttl',
  'sso', 'oidc', 'saml', 'jwt', 'ca', 'db', 'cpu', 'ram', 'os', 'ui', 'rtmp', 'srt',
  'p50', 'p95', 'p99', 'kbps', 'mbps', 'fps', 'json', 'html', 'http', 'https', 'pid',
]);

/** Turn an object key (`maxRoomSize`, `ocsp_enabled`) into a human label. */
export function humanizeKey(key: string): string {
  return String(key)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((w) => (ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && !isValidElement(v);
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function humanBytes(n: number): string {
  if (!isFinite(n)) return String(n);
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let i = 0;
  let x = Math.abs(n);
  while (x >= 1024 && i < units.length - 1) { x /= 1024; i++; }
  return `${x % 1 === 0 ? x : x.toFixed(1)} ${units[i]}`;
}

/** A single leaf value rendered according to its inferred type. */
export function Scalar({ name, value }: { name?: string; value: unknown }): ReactNode {
  if (value == null || value === '') return <Box component="span" sx={{ color: 'text.disabled' }}>—</Box>;
  if (isValidElement(value)) return value;
  if (typeof value === 'boolean') {
    return <Chip size="small" variant="outlined" color={value ? 'success' : 'default'} label={value ? 'Yes' : 'No'} />;
  }
  if (typeof value === 'number') {
    if (name && /bytes|size$/i.test(name)) return <>{humanBytes(value)}</>;
    if (Number.isInteger(value) && Math.abs(value) >= 10000 && !(name && /port|year|code|pid|^id$/i.test(name))) {
      return <>{value.toLocaleString()}</>;
    }
    return <>{String(value)}</>;
  }
  const s = String(value);
  if (ISO_DATE_RE.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return <>{d.toLocaleString()}</>;
  }
  if (/^https?:\/\//.test(s)) return <Link href={s} target="_blank" rel="noopener noreferrer">{s}</Link>;
  if (name && /^status$/i.test(name) && s.length <= 24) return <StatusChip status={s} />;
  return <>{s}</>;
}

function ArrayView({ rows }: { rows: unknown[] }) {
  if (rows.length === 0) return <Box sx={{ color: 'text.disabled', fontStyle: 'italic' }}>None</Box>;
  if (rows.every((r) => isPlainObject(r))) {
    const cols = Array.from(new Set((rows as Record<string, unknown>[]).flatMap((r) => Object.keys(r))));
    return (
      <DataTable
        rows={rows as Record<string, unknown>[]}
        rowKey={(_r, i) => String(i)}
        columns={cols.map((c) => ({ key: c, header: humanizeKey(c), render: (r: Record<string, unknown>) => <Scalar name={c} value={r[c]} /> }))}
      />
    );
  }
  return (
    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
      {rows.map((r, i) => <Chip key={i} size="small" variant="outlined" label={isPlainObject(r) ? JSON.stringify(r) : String(r)} />)}
    </Stack>
  );
}

/** A `{ headers: [...], rows: [...] }` shape — a declarative table descriptor. */
function looksLikeTable(v: Record<string, unknown>): v is { headers: unknown[]; rows: unknown[] } {
  return Array.isArray(v.headers) && Array.isArray(v.rows);
}

/** Render a `{ headers, rows }` descriptor as a real table. Rows may be arrays
 *  (positional cells) or objects (keyed by header). */
function TableView({ headers, rows }: { headers: unknown[]; rows: unknown[] }) {
  const cols = headers.map((h) => String(h));
  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small">
        <TableHead>
          <TableRow>
            {cols.map((c, i) => <TableCell key={i} sx={{ fontWeight: 600 }}>{c}</TableCell>)}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={cols.length || 1} sx={{ color: 'text.disabled', fontStyle: 'italic' }}>
                No rows
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r, ri) => {
              const cells = Array.isArray(r)
                ? r
                : cols.map((c) => (isPlainObject(r) ? r[c] : r));
              return (
                <TableRow key={ri}>
                  {cols.map((c, ci) => <TableCell key={ci}><Scalar name={c} value={cells[ci]} /></TableCell>)}
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function ObjectView({ obj, dense }: { obj: Record<string, unknown>; dense?: boolean }) {
  const entries = Object.entries(obj);
  if (entries.length === 0) return <Box sx={{ color: 'text.disabled', fontStyle: 'italic' }}>None</Box>;
  const scalars = entries.filter(([, v]) => !isPlainObject(v) && !Array.isArray(v));
  const groups = entries.filter(([, v]) => isPlainObject(v) || Array.isArray(v));
  return (
    <Stack spacing={dense ? 1 : 1.5}>
      {scalars.length > 0 && (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(150px, max-content) 1fr', columnGap: 2.5, rowGap: 0.75, alignItems: 'baseline' }}>
          {scalars.map(([k, val]) => (
            <Fragment key={k}>
              <Box sx={{ color: 'text.secondary', fontSize: 13 }}>{humanizeKey(k)}</Box>
              <Box sx={{ fontSize: 14 }}><Scalar name={k} value={val} /></Box>
            </Fragment>
          ))}
        </Box>
      )}
      {groups.map(([k, val]) => (
        <Box key={k}>
          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>{humanizeKey(k)}</Typography>
          <Box sx={{ pl: 1.5, borderLeft: '2px solid', borderColor: 'divider' }}>
            {Array.isArray(val) ? (
              <ArrayView rows={val} />
            ) : looksLikeTable(val as Record<string, unknown>) ? (
              <TableView headers={(val as { headers: unknown[] }).headers} rows={(val as { rows: unknown[] }).rows} />
            ) : (
              <ObjectView obj={val as Record<string, unknown>} dense />
            )}
          </Box>
        </Box>
      ))}
    </Stack>
  );
}

/**
 * Renders an arbitrary API value (object / array / scalar) as typed,
 * human-readable HTML instead of raw JSON — booleans become chips, dates are
 * formatted, nested objects become labelled groups, arrays of objects become
 * tables. Common gateway envelopes ({ success, data }) are unwrapped. This is
 * the typed replacement for `<pre>{JSON.stringify(...)}</pre>`.
 */
export function DataView({ value }: { value: unknown }): ReactNode {
  let v = value;
  if (isPlainObject(v) && 'success' in v) {
    if (v.success === false) {
      return <Alert severity="error">{String(v.error ?? v.message ?? 'Request failed')}</Alert>;
    }
    const rest = Object.keys(v).filter((k) => k !== 'success');
    if (rest.length === 1 && (isPlainObject(v[rest[0]]) || Array.isArray(v[rest[0]]))) {
      v = v[rest[0]];
    } else {
      const o: Record<string, unknown> = {};
      rest.forEach((k) => (o[k] = (v as Record<string, unknown>)[k]));
      v = o;
    }
  }
  if (Array.isArray(v)) return <ArrayView rows={v} />;
  if (isPlainObject(v)) return <ObjectView obj={v} />;
  return <Box sx={{ fontSize: 14 }}><Scalar value={v} /></Box>;
}

/* ------------------------------------------------------------- json dialog */

/**
 * Detail dialog. Renders the value as typed HTML (DataView) by default, with a
 * toggle to inspect the raw JSON for power users / debugging.
 */
export function JsonDialog({
  open,
  title,
  value,
  onClose,
}: {
  open: boolean;
  title: string;
  value: unknown;
  onClose: () => void;
}) {
  const [raw, setRaw] = useState(false);
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent dividers>
        {raw ? (
          <Box
            component="pre"
            sx={{ m: 0, p: 1.5, bgcolor: 'background.default', borderRadius: 1, fontSize: 12, overflow: 'auto', maxHeight: '60vh' }}
          >
            {JSON.stringify(value, null, 2)}
          </Box>
        ) : (
          <Box sx={{ py: 0.5, maxHeight: '60vh', overflow: 'auto' }}>
            <DataView value={value} />
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setRaw((r) => !r)} sx={{ mr: 'auto' }}>{raw ? 'Formatted view' : 'Show raw JSON'}</Button>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

/* ----------------------------------------------------------- config editor */

interface ConfigField {
  name: string;
  label?: string;
  type?: string;
  value?: unknown;
  options?: unknown[];
  placeholder?: string;
}
interface ConfigSchema extends Record<string, unknown> {
  title?: string;
  description?: string;
  fields: ConfigField[];
}

function hasFields(v: unknown): v is ConfigSchema {
  return isPlainObject(v) && Array.isArray((v as { fields?: unknown }).fields);
}

/** One typed control for a config schema field. */
function ConfigFieldInput({
  field,
  value,
  onChange,
}: {
  field: ConfigField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const label = field.label ?? humanizeKey(field.name);
  const type = (field.type ?? 'text').toLowerCase();

  if (type === 'checkbox' || type === 'boolean' || type === 'switch' || type === 'toggle') {
    return <FormControlLabel control={<Switch checked={!!value} onChange={(e) => onChange(e.target.checked)} />} label={label} />;
  }
  if (type === 'select' && Array.isArray(field.options)) {
    return (
      <TextField select fullWidth label={label} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        {field.options.map((o) => <MenuItem key={String(o)} value={String(o)}>{String(o)}</MenuItem>)}
      </TextField>
    );
  }
  if (type === 'number') {
    return (
      <TextField
        fullWidth
        type="number"
        label={label}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
      />
    );
  }
  if (type === 'password') {
    return (
      <TextField
        fullWidth
        type="password"
        label={label}
        value={value ?? ''}
        placeholder={field.value === '' || field.value == null ? 'unset' : '••••••••'}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="new-password"
      />
    );
  }
  if (type === 'textarea') {
    return <TextField fullWidth multiline minRows={3} label={label} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
  }
  return <TextField fullWidth type={type === 'email' ? 'email' : 'text'} label={label} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
}

/**
 * Editor for the per-module `/api/config/:sectionId` endpoints. These return a
 * declarative form schema ({ title, description, fields: [{ name, label, type,
 * value, options }] }), so we render real typed controls (Switch / number /
 * select / text / password) rather than a JSON blob. Sections without a schema
 * fall back to a read-only typed view; an "Edit as JSON" escape hatch remains
 * for either case. Save round-trips the original payload with updated values.
 */
export function ConfigSectionEditor({
  sections,
  load,
  save,
}: {
  sections: string[];
  load: (section: string) => Promise<unknown>;
  save: (section: string, data: unknown) => Promise<unknown>;
}) {
  const [section, setSection] = useState(sections[0] ?? '');
  const [raw, setRaw] = useState<unknown>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [text, setText] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<{ kind: 'idle' | 'error' | 'success'; msg?: string }>({ kind: 'idle' });
  const [busy, setBusy] = useState(false);

  const doLoad = async (s: string) => {
    setBusy(true);
    setStatus({ kind: 'idle' });
    setLoaded(false);
    setAdvanced(false);
    try {
      const data = await load(s);
      setRaw(data);
      setText(JSON.stringify(data, null, 2));
      if (hasFields(data)) {
        const v: Record<string, unknown> = {};
        data.fields.forEach((f) => { v[f.name] = f.value; });
        setValues(v);
      }
      setLoaded(true);
    } catch (e) {
      setRaw(null);
      setText('');
      setStatus({ kind: 'error', msg: toMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const doSave = async () => {
    setBusy(true);
    setStatus({ kind: 'idle' });
    try {
      let payload: unknown;
      if (advanced) {
        try { payload = JSON.parse(text || '{}'); }
        catch { setStatus({ kind: 'error', msg: 'Body is not valid JSON.' }); setBusy(false); return; }
      } else if (hasFields(raw)) {
        payload = { ...raw, fields: raw.fields.map((f) => ({ ...f, value: values[f.name] })) };
      } else {
        payload = raw;
      }
      await save(section, payload);
      setStatus({ kind: 'success', msg: 'Settings saved.' });
    } catch (e) {
      setStatus({ kind: 'error', msg: toMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  // Auto-load the active section on mount and whenever it changes, so the form
  // renders immediately instead of waiting for a manual Reload click.
  useEffect(() => {
    if (section) doLoad(section);
    // doLoad is recreated each render; we intentionally key only on `section`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

  const schema = hasFields(raw) ? raw : null;

  return (
    <Card title="Configuration">
      <Stack spacing={2}>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {sections.map((s) => (
            <Chip
              key={s}
              label={humanizeKey(s.replace(/^[a-z]+-/, ''))}
              title={s}
              color={s === section ? 'primary' : 'default'}
              variant={s === section ? 'filled' : 'outlined'}
              onClick={() => setSection(s)}
            />
          ))}
        </Stack>

        {!loaded && busy && <Alert severity="info">Loading settings…</Alert>}

        {schema && !advanced && (
          <Stack spacing={2}>
            {(schema.title || schema.description) && (
              <Box>
                {schema.title && <Typography variant="subtitle1" fontWeight={600}>{String(schema.title)}</Typography>}
                {schema.description && <Typography variant="body2" color="text.secondary">{String(schema.description)}</Typography>}
              </Box>
            )}
            <Stack spacing={2} sx={{ maxWidth: 520 }}>
              {schema.fields.map((f) => (
                <ConfigFieldInput
                  key={f.name}
                  field={f}
                  value={values[f.name]}
                  onChange={(val) => setValues((cur) => ({ ...cur, [f.name]: val }))}
                />
              ))}
            </Stack>
          </Stack>
        )}

        {loaded && !schema && !advanced && (
          <Box>
            <Alert severity="info" sx={{ mb: 1.5 }}>This section has no editable form schema; values are shown read-only. Use “Edit as JSON” to change them.</Alert>
            <DataView value={raw} />
          </Box>
        )}

        {advanced && (
          <TextField
            label={`Section: ${section}`}
            multiline
            minRows={8}
            maxRows={24}
            value={text}
            onChange={(e) => setText(e.target.value)}
            inputProps={{ style: { fontFamily: 'monospace', fontSize: 12 } }}
          />
        )}

        {status.kind !== 'idle' && <Alert severity={status.kind === 'error' ? 'error' : 'success'}>{status.msg}</Alert>}

        <Stack direction="row" spacing={1} alignItems="center">
          <Button variant="outlined" disabled={!section || busy} onClick={() => doLoad(section)}>Reload</Button>
          <Button variant="contained" disabled={!section || busy || !loaded} onClick={doSave}>Save</Button>
          {loaded && (
            <Button size="small" sx={{ ml: 'auto' }} onClick={() => setAdvanced((a) => !a)}>
              {advanced ? 'Form view' : 'Edit as JSON'}
            </Button>
          )}
        </Stack>
      </Stack>
    </Card>
  );
}
