/**
 * Shared building blocks for the admin/management console. Kept deliberately
 * generic (column-driven tables, a query-state wrapper, a JSON config editor) so
 * the per-module sections stay declarative and small while covering the full
 * API surface. Conventions match the rest of web/: TanStack Query for server
 * state, MUI for chrome, toMessage() for the gateway error envelope.
 */
import { isValidElement, ReactNode, useCallback, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
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
}

export function DataTable<R>({
  columns,
  rows,
  rowKey,
  empty = 'No records.',
}: {
  columns: Column<R>[];
  rows: R[];
  rowKey: (row: R, i: number) => string;
  empty?: ReactNode;
}) {
  if (!rows.length) return <Alert severity="info">{empty}</Alert>;
  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small">
        <TableHead>
          <TableRow>
            {columns.map((c) => (
              <TableCell key={c.key} align={c.align}>
                {c.header}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow key={rowKey(row, i)} hover>
              {columns.map((c) => (
                <TableCell
                  key={c.key}
                  align={c.align}
                  sx={c.mono ? { fontFamily: 'monospace', fontSize: 12 } : undefined}
                >
                  {c.render ? c.render(row) : display((row as Record<string, unknown>)[c.key])}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
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

/* ------------------------------------------------------------- json dialog */

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
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Box
          component="pre"
          sx={{
            m: 0,
            p: 1.5,
            bgcolor: 'grey.100',
            borderRadius: 1,
            fontSize: 12,
            overflow: 'auto',
            maxHeight: '60vh',
          }}
        >
          {JSON.stringify(value, null, 2)}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * Generic editor for the per-module `/api/config/:sectionId` endpoints. GETs the
 * section into a JSON textarea; POSTs the edited JSON back. Several modules
 * expose these unauthenticated (CA/auth require admin); errors surface inline.
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
  const [text, setText] = useState('');
  const [status, setStatus] = useState<{ kind: 'idle' | 'error' | 'success'; msg?: string }>({ kind: 'idle' });
  const [busy, setBusy] = useState(false);

  const doLoad = async (s: string) => {
    setBusy(true);
    setStatus({ kind: 'idle' });
    try {
      const data = await load(s);
      setText(JSON.stringify(data, null, 2));
    } catch (e) {
      setText('');
      setStatus({ kind: 'error', msg: toMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const doSave = async () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text || '{}');
    } catch {
      setStatus({ kind: 'error', msg: 'Body is not valid JSON.' });
      return;
    }
    setBusy(true);
    try {
      await save(section, parsed);
      setStatus({ kind: 'success', msg: 'Saved.' });
    } catch (e) {
      setStatus({ kind: 'error', msg: toMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Config sections">
      <Stack spacing={1.5}>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {sections.map((s) => (
            <Chip
              key={s}
              label={s}
              color={s === section ? 'primary' : 'default'}
              variant={s === section ? 'filled' : 'outlined'}
              onClick={() => {
                setSection(s);
                doLoad(s);
              }}
            />
          ))}
        </Stack>
        <TextField
          label={`Section: ${section || '(none)'}`}
          multiline
          minRows={8}
          maxRows={20}
          value={text}
          onChange={(e) => setText(e.target.value)}
          inputProps={{ style: { fontFamily: 'monospace', fontSize: 12 } }}
          placeholder="Select a section to load its config…"
        />
        {status.kind !== 'idle' && (
          <Alert severity={status.kind === 'error' ? 'error' : 'success'}>{status.msg}</Alert>
        )}
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" disabled={!section || busy} onClick={() => doLoad(section)}>
            Reload
          </Button>
          <Button variant="contained" disabled={!section || busy} onClick={doSave}>
            Save section
          </Button>
        </Stack>
      </Stack>
    </Card>
  );
}
