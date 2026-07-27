import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  IconButton,
  Paper,
  Snackbar,
  Stack,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import BlockIcon from '@mui/icons-material/Block';
import { useAppStore } from '@/app/store';
import { toMessage } from '@/lib/errors';
import { caApi, type Certificate, type CaToken } from '@/api/ca';
import { formatDate } from '@/features/files/util';

const STATUS_COLOR: Record<string, 'success' | 'error' | 'warning' | 'default'> = {
  active: 'success',
  revoked: 'error',
  expired: 'warning',
};

function statusChip(status?: string) {
  return <Chip size="small" variant="outlined" color={STATUS_COLOR[status ?? ''] ?? 'default'} label={status ?? 'unknown'} />;
}

/** Compact R/W/A/D/U permission badges for a token. */
function permBadges(t: CaToken) {
  const flags: Array<[string, boolean | undefined]> = [
    ['R', t.permissionRead],
    ['W', t.permissionWrite],
    ['A', t.permissionAppend],
    ['D', t.permissionDelete],
    ['U', t.permissionUpdate],
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

function CertificatesTab({ onToast }: { onToast: (m: string) => void }) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['ca', 'certificates'],
    queryFn: () => caApi.listCertificates({ limit: 100 }),
  });
  const downloadMutation = useMutation({
    mutationFn: (c: Certificate) => caApi.downloadCertificate(c),
    onError: (e) => onToast(toMessage(e)),
  });
  const revokeMutation = useMutation({
    mutationFn: (c: Certificate) => caApi.revokeCertificate(c.id, 'Revoked from admin console'),
    onSuccess: () => {
      onToast('Certificate revoked');
      qc.invalidateQueries({ queryKey: ['ca', 'certificates'] });
    },
    onError: (e) => onToast(toMessage(e)),
  });

  if (query.isLoading)
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress size={28} />
      </Box>
    );
  if (query.isError) return <Alert severity="error">{toMessage(query.error)}</Alert>;

  const certs = query.data?.certificates ?? [];
  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Common name</TableCell>
            <TableCell>Type</TableCell>
            <TableCell>Serial</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Expires</TableCell>
            <TableCell align="right">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {certs.map((c) => (
            <TableRow key={c.id} hover>
              <TableCell>{c.commonName}</TableCell>
              <TableCell sx={{ color: 'text.secondary' }}>{c.type}</TableCell>
              <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>
                {c.serialNumber?.slice(0, 16)}…
              </TableCell>
              <TableCell>{statusChip(c.status)}</TableCell>
              <TableCell sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
                {formatDate(c.notAfter)}
              </TableCell>
              <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                <Tooltip title="Download PEM">
                  <IconButton aria-label="Download PEM" size="small" onClick={() => downloadMutation.mutate(c)}>
                    <DownloadIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Revoke">
                  <span>
                    <IconButton
                      size="small"
                      color="error"
                      aria-label={`Revoke certificate “${c.commonName}”`}
                      disabled={c.status !== 'active'}
                      onClick={() => {
                        if (window.confirm(`Revoke certificate “${c.commonName}”?`)) revokeMutation.mutate(c);
                      }}
                    >
                      <BlockIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function TokensTab({ onToast }: { onToast: (m: string) => void }) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['ca', 'tokens'],
    queryFn: () => caApi.listTokens({ limit: 100 }),
  });
  const revokeMutation = useMutation({
    mutationFn: (t: CaToken) => caApi.revokeToken(t.id, 'Revoked from admin console'),
    onSuccess: () => {
      onToast('Token revoked');
      qc.invalidateQueries({ queryKey: ['ca', 'tokens'] });
    },
    onError: (e) => onToast(toMessage(e)),
  });

  if (query.isLoading)
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress size={28} />
      </Box>
    );
  if (query.isError) return <Alert severity="error">{toMessage(query.error)}</Alert>;

  const tokens = query.data?.tokens ?? [];
  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Token</TableCell>
            <TableCell>Permissions</TableCell>
            <TableCell>Resource</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Expires</TableCell>
            <TableCell align="right">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {tokens.map((t) => (
            <TableRow key={t.id} hover>
              <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{t.id.slice(0, 8)}…</TableCell>
              <TableCell>{permBadges(t)}</TableCell>
              <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>
                {t.resourceType}:{t.resourceValue}
              </TableCell>
              <TableCell>{statusChip(t.status)}</TableCell>
              <TableCell sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
                {t.expiryType === 'time' ? formatDate(t.expiresAt) : t.expiryType}
              </TableCell>
              <TableCell align="right">
                <Tooltip title="Revoke">
                  <span>
                    <IconButton
                      size="small"
                      color="error"
                      aria-label={`Revoke token ${t.id.slice(0, 8)}…`}
                      disabled={t.status !== 'active'}
                      onClick={() => {
                        if (window.confirm(`Revoke token ${t.id.slice(0, 8)}…?`)) revokeMutation.mutate(t);
                      }}
                    >
                      <BlockIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

/**
 * Phase 5 — CA admin (Certificates + Tokens). Reaches the CA admin API
 * (`/ca/admin/api/*`) via the bearer-admin path; the signed-in user must be a
 * platform admin. List + revoke for both; certificates also download as PEM.
 */
export function CaAdminPage() {
  const userId = useAppStore((s) => s.user?.id);
  const [tab, setTab] = useState<'certs' | 'tokens'>('certs');
  const [toast, setToast] = useState<string | null>(null);

  if (!userId) return <Alert severity="error">Not signed in.</Alert>;

  return (
    <Stack spacing={2} sx={{ maxWidth: 960, mx: 'auto', pb: 6 }}>
      <Typography variant="h5" component="h1">Certificate Authority</Typography>
      <Tabs value={tab} onChange={(_e, v) => setTab(v)}>
        <Tab value="certs" label="Certificates" />
        <Tab value="tokens" label="Tokens" />
      </Tabs>
      {tab === 'certs' ? <CertificatesTab onToast={setToast} /> : <TokensTab onToast={setToast} />}
      <Snackbar
        open={!!toast}
        autoHideDuration={4000}
        onClose={() => setToast(null)}
        message={toast}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Stack>
  );
}
