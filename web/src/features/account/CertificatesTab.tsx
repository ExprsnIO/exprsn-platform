import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Menu,
  Paper,
  Radio,
  RadioGroup,
  Select,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import BlockIcon from '@mui/icons-material/Block';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { toMessage } from '@/lib/errors';
import { formatDate } from '@/features/files/util';
import {
  caUserApi,
  type ExportFormat,
  type GenerateCertBody,
  type UserCertType,
  type UserCertificate,
} from '@/api/caUser';

const CERTS_KEY = ['ca', 'me', 'certificates'] as const;

const STATUS_COLOR: Record<string, 'success' | 'error' | 'warning' | 'default'> = {
  active: 'success',
  revoked: 'error',
  expired: 'warning',
};

const CERT_TYPES: UserCertType[] = ['entity', 'san', 'code_signing', 'client', 'server'];

const REVOCATION_REASONS = [
  'unspecified',
  'keyCompromise',
  'caCompromise',
  'affiliationChanged',
  'superseded',
  'cessationOfOperation',
  'certificateHold',
  'removeFromCRL',
  'privilegeWithdrawn',
  'aaCompromise',
] as const;

function statusChip(status?: string) {
  return (
    <Chip
      size="small"
      variant="outlined"
      color={STATUS_COLOR[status ?? ''] ?? 'default'}
      label={status ?? 'unknown'}
    />
  );
}

/**
 * Live revocation badge. Polls GET /:id/status every 30s for active certs;
 * stops polling (and shows a muted "checking disabled" state) when neither OCSP
 * nor CRL is enabled, since there's nothing live to learn.
 */
function CertStatusBadge({ cert }: { cert: UserCertificate }) {
  const enabled = cert.status === 'active' || cert.status === 'revoked';
  const query = useQuery({
    queryKey: ['ca', 'me', 'cert-status', cert.id],
    queryFn: () => caUserApi.getCertificateStatus(cert.id),
    enabled,
    refetchInterval: (q) => {
      const data = q.state.data;
      if (!data) return 30_000;
      // Nothing to poll for if both revocation mechanisms are off.
      if (!data.ocsp.enabled && !data.crl.enabled) return false;
      return 30_000;
    },
    refetchIntervalInBackground: false,
  });

  if (!enabled) return <Chip size="small" variant="outlined" label="—" />;
  if (query.isLoading) return <CircularProgress size={14} />;
  if (query.isError) return <Chip size="small" color="default" variant="outlined" label="unknown" />;

  const s = query.data!;
  const checkingOff = !s.ocsp.enabled && !s.crl.enabled;
  if (checkingOff) {
    return (
      <Tooltip title="OCSP and CRL are both disabled — live revocation checking is off">
        <Chip size="small" variant="outlined" color="default" label="checking off" />
      </Tooltip>
    );
  }
  const good = !s.revoked && s.status === 'active';
  return (
    <Tooltip
      title={
        good
          ? 'Good — not listed as revoked'
          : `Revoked${s.revocationReason ? ` (${s.revocationReason})` : ''}`
      }
    >
      <Chip
        size="small"
        color={good ? 'success' : 'error'}
        label={good ? 'good' : 'revoked'}
      />
    </Tooltip>
  );
}

const EMPTY_GEN: GenerateCertBody & { sansText: string; usePassphrase: boolean } = {
  commonName: '',
  type: 'entity',
  keySize: 2048,
  validityDays: 365,
  organization: '',
  organizationalUnit: '',
  country: '',
  state: '',
  locality: '',
  email: '',
  password: '',
  sansText: '',
  usePassphrase: false,
};

/** Issue-certificate dialog with advanced options + the passphrase trade-off. */
function IssueDialog({
  open,
  onClose,
  onIssued,
  onToast,
}: {
  open: boolean;
  onClose: () => void;
  onIssued: (privateKey: string | undefined, commonName: string) => void;
  onToast: (m: string) => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ ...EMPTY_GEN });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: () => {
      const body: GenerateCertBody = {
        commonName: form.commonName.trim(),
        type: form.type,
        keySize: form.keySize,
        validityDays: form.validityDays,
      };
      if (form.type === 'san') {
        const sans = form.sansText
          .split(/[\n,]/)
          .map((s) => s.trim())
          .filter(Boolean);
        if (sans.length) body.subjectAlternativeNames = sans;
      }
      if (form.usePassphrase && form.password) body.password = form.password;
      for (const k of ['organization', 'organizationalUnit', 'country', 'state', 'locality', 'email'] as const) {
        const v = (form[k] as string).trim();
        if (v) body[k] = v;
      }
      return caUserApi.generateCertificate(body);
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: CERTS_KEY });
      onIssued(res.privateKey, res.certificate.commonName);
      setForm({ ...EMPTY_GEN });
      onClose();
    },
    onError: (e) => onToast(toMessage(e)),
  });

  const canSubmit =
    form.commonName.trim().length > 0 &&
    (!form.usePassphrase || (form.password ?? '').length >= 8) &&
    !mutation.isPending;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Issue certificate</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {mutation.isError && <Alert severity="error">{toMessage(mutation.error)}</Alert>}

          <TextField
            label="Common name"
            required
            fullWidth
            value={form.commonName}
            onChange={(e) => set('commonName', e.target.value)}
            placeholder="my-service.example.com"
          />

          <FormControl fullWidth>
            <InputLabel id="cert-type-label">Type</InputLabel>
            <Select
              labelId="cert-type-label"
              label="Type"
              value={form.type}
              onChange={(e) => set('type', e.target.value as UserCertType)}
            >
              {CERT_TYPES.map((t) => (
                <MenuItem key={t} value={t}>
                  {t}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {form.type === 'san' && (
            <TextField
              label="Subject alternative names"
              fullWidth
              multiline
              minRows={2}
              value={form.sansText}
              onChange={(e) => set('sansText', e.target.value)}
              helperText="One per line or comma-separated"
            />
          )}

          {/* The key/passphrase trade-off — the central UX decision. */}
          <Paper variant="outlined" sx={{ p: 2, bgcolor: 'action.hover' }}>
            <Typography variant="subtitle2" gutterBottom>
              Key handling
            </Typography>
            <RadioGroup
              value={form.usePassphrase ? 'passphrase' : 'token'}
              onChange={(e) => set('usePassphrase', e.target.value === 'passphrase')}
            >
              <FormControlLabel
                value="token"
                control={<Radio size="small" />}
                label="For API tokens (no passphrase) — key is CA-held and can sign tokens; the private key is shown to you once."
              />
              <FormControlLabel
                value="passphrase"
                control={<Radio size="small" />}
                label="For export as PKCS#12 (set a passphrase) — key is stored encrypted for .p12 export, but this cert CANNOT sign tokens."
              />
            </RadioGroup>
            {form.usePassphrase && (
              <TextField
                label="Passphrase"
                type="password"
                fullWidth
                sx={{ mt: 1 }}
                value={form.password}
                onChange={(e) => set('password', e.target.value)}
                helperText="Min 8 characters — required for PKCS#12 export later"
              />
            )}
          </Paper>

          <Stack direction="row" spacing={2}>
            <FormControl fullWidth>
              <InputLabel id="keysize-label">Key size</InputLabel>
              <Select
                labelId="keysize-label"
                label="Key size"
                value={form.keySize}
                onChange={(e) => set('keySize', Number(e.target.value) as 2048 | 4096)}
              >
                <MenuItem value={2048}>2048</MenuItem>
                <MenuItem value={4096}>4096</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Validity (days)"
              type="number"
              fullWidth
              value={form.validityDays}
              onChange={(e) => set('validityDays', Number(e.target.value))}
              inputProps={{ min: 1, max: 825 }}
            />
          </Stack>

          <Divider>Subject (optional)</Divider>
          <Stack direction="row" spacing={2}>
            <TextField
              label="Organization"
              fullWidth
              value={form.organization}
              onChange={(e) => set('organization', e.target.value)}
            />
            <TextField
              label="Org. unit"
              fullWidth
              value={form.organizationalUnit}
              onChange={(e) => set('organizationalUnit', e.target.value)}
            />
          </Stack>
          <Stack direction="row" spacing={2}>
            <TextField
              label="Country"
              value={form.country}
              onChange={(e) => set('country', e.target.value.toUpperCase())}
              inputProps={{ maxLength: 2 }}
              sx={{ width: 120 }}
            />
            <TextField
              label="State"
              fullWidth
              value={form.state}
              onChange={(e) => set('state', e.target.value)}
            />
            <TextField
              label="Locality"
              fullWidth
              value={form.locality}
              onChange={(e) => set('locality', e.target.value)}
            />
          </Stack>
          <TextField
            label="Email"
            type="email"
            fullWidth
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="contained" disabled={!canSubmit} onClick={() => mutation.mutate()}>
          {mutation.isPending ? 'Issuing…' : 'Issue'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** One-time private key reveal after a no-passphrase issue. */
function PrivateKeyDialog({
  privateKey,
  onClose,
  onCopy,
}: {
  privateKey: string | null;
  onClose: () => void;
  onCopy: (text: string) => void;
}) {
  return (
    <Dialog open={!!privateKey} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Save your private key</DialogTitle>
      <DialogContent>
        <Alert severity="warning" sx={{ mb: 2 }}>
          This private key is shown <strong>once</strong> and cannot be retrieved again. Copy and
          store it securely now.
        </Alert>
        <Box
          sx={{
            p: 1.5,
            bgcolor: 'action.hover',
            borderRadius: 1,
            fontFamily: 'monospace',
            fontSize: 12,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            maxHeight: 280,
            overflow: 'auto',
          }}
        >
          {privateKey}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button startIcon={<ContentCopyIcon />} onClick={() => privateKey && onCopy(privateKey)}>
          Copy
        </Button>
        <Button variant="contained" onClick={onClose}>
          I&apos;ve saved it
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Certificate details: validity, fingerprint, and the issuance chain. */
function DetailsDialog({ cert, onClose }: { cert: UserCertificate | null; onClose: () => void }) {
  const query = useQuery({
    queryKey: ['ca', 'me', 'cert-chain', cert?.id],
    queryFn: () => caUserApi.getCertificateChain(cert!.id),
    enabled: !!cert,
  });

  return (
    <Dialog open={!!cert} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{cert?.commonName || 'Certificate'}</DialogTitle>
      <DialogContent dividers>
        {cert && (
          <Stack spacing={1.5}>
            <Detail label="Common name" value={cert.commonName} />
            <Detail label="Type" value={cert.type} />
            <Detail label="Status" value={cert.status} />
            <Detail label="Serial" value={cert.serialNumber} mono />
            <Detail label="Fingerprint" value={cert.fingerprint} mono />
            <Detail label="Valid from" value={formatDate(cert.notBefore)} />
            <Detail label="Valid until" value={formatDate(cert.notAfter)} />
            {cert.organization && <Detail label="Organization" value={cert.organization} />}
            {cert.revokedAt && <Detail label="Revoked at" value={formatDate(cert.revokedAt)} />}
            {cert.revocationReason && <Detail label="Revocation reason" value={cert.revocationReason} />}

            <Divider>Chain</Divider>
            {query.isLoading && <CircularProgress size={20} />}
            {query.isError && <Alert severity="error">{toMessage(query.error)}</Alert>}
            {query.data?.chain.map((c, i) => (
              <Typography key={i} variant="body2" sx={{ fontFamily: 'monospace' }}>
                {i + 1}. {c.commonName || c.serialNumber || '(unnamed)'}
                {c.type ? ` — ${c.type}` : ''}
              </Typography>
            ))}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

function Detail({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <Stack direction="row" spacing={1}>
      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 130 }}>
        {label}
      </Typography>
      <Typography
        variant="body2"
        sx={{ fontFamily: mono ? 'monospace' : undefined, wordBreak: 'break-all' }}
      >
        {value || '—'}
      </Typography>
    </Stack>
  );
}

export function CertificatesTab() {
  const qc = useQueryClient();
  const [toast, setToast] = useState<string | null>(null);
  const [issueOpen, setIssueOpen] = useState(false);
  const [privateKey, setPrivateKey] = useState<string | null>(null);
  const [detailCert, setDetailCert] = useState<UserCertificate | null>(null);

  // Export menu state.
  const [exportAnchor, setExportAnchor] = useState<null | HTMLElement>(null);
  const [exportCert, setExportCert] = useState<UserCertificate | null>(null);
  // PKCS#12 passphrase prompt.
  const [p12Cert, setP12Cert] = useState<UserCertificate | null>(null);
  const [p12Password, setP12Password] = useState('');
  // Revoke dialog.
  const [revokeCert, setRevokeCert] = useState<UserCertificate | null>(null);
  const [revokeReason, setRevokeReason] = useState<string>('unspecified');

  const query = useQuery({
    queryKey: CERTS_KEY,
    queryFn: () => caUserApi.listCertificates({ limit: 100 }),
  });

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setToast('Copied to clipboard');
    } catch {
      setToast('Copy failed');
    }
  };

  const exportMutation = useMutation({
    mutationFn: ({ cert, format, password }: { cert: UserCertificate; format: ExportFormat; password?: string }) =>
      caUserApi.exportCertificate(cert, format, password),
    onSuccess: () => setToast('Export downloaded'),
    onError: (e) => setToast(toMessage(e)),
  });

  const renewMutation = useMutation({
    mutationFn: (cert: UserCertificate) => caUserApi.renewCertificate(cert.id),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: CERTS_KEY });
      setToast('Certificate renewed');
      if (res.privateKey) setPrivateKey(res.privateKey);
    },
    onError: (e) => setToast(toMessage(e)),
  });

  const revokeMutation = useMutation({
    mutationFn: () => caUserApi.revokeCertificate(revokeCert!.id, revokeReason),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: CERTS_KEY });
      qc.invalidateQueries({ queryKey: ['ca', 'me', 'tokens'] });
      setToast(`Certificate revoked — revoked ${res.revokedTokenCount} dependent token(s)`);
      setRevokeCert(null);
    },
    onError: (e) => setToast(toMessage(e)),
  });

  const openExportMenu = (e: React.MouseEvent<HTMLElement>, cert: UserCertificate) => {
    setExportCert(cert);
    setExportAnchor(e.currentTarget);
  };
  const closeExportMenu = () => setExportAnchor(null);

  const doExport = (format: ExportFormat) => {
    const cert = exportCert;
    closeExportMenu();
    if (!cert) return;
    if (format === 'pkcs12') {
      setP12Cert(cert);
      setP12Password('');
      return;
    }
    exportMutation.mutate({ cert, format });
  };

  const certs = query.data?.certificates ?? [];

  return (
    <Stack spacing={2} sx={{ pb: 4 }}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="h6">Certificates</Typography>
        <Box sx={{ flex: 1 }} />
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setIssueOpen(true)}>
          Issue certificate
        </Button>
      </Stack>

      <Alert severity="info" variant="outlined">
        Revoking a certificate also revokes any API tokens it signed.
      </Alert>

      {query.isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress size={28} />
        </Box>
      )}
      {query.isError && <Alert severity="error">{toMessage(query.error)}</Alert>}

      {query.isSuccess &&
        (certs.length === 0 ? (
          <Paper variant="outlined" sx={{ p: 6, textAlign: 'center' }}>
            <Typography color="text.secondary">No certificates yet.</Typography>
          </Paper>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Common name</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Live</TableCell>
                  <TableCell>Expires</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {certs.map((c) => (
                  <TableRow key={c.id} hover>
                    <TableCell>{c.commonName}</TableCell>
                    <TableCell sx={{ color: 'text.secondary' }}>{c.type}</TableCell>
                    <TableCell>{statusChip(c.status)}</TableCell>
                    <TableCell>
                      <CertStatusBadge cert={c} />
                    </TableCell>
                    <TableCell sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
                      {formatDate(c.notAfter)}
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      <Tooltip title="Details">
                        <IconButton size="small" onClick={() => setDetailCert(c)}>
                          <InfoOutlinedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Export">
                        <IconButton size="small" onClick={(e) => openExportMenu(e, c)}>
                          <FileDownloadIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Renew">
                        <span>
                          <IconButton
                            size="small"
                            disabled={c.status !== 'active' || renewMutation.isPending}
                            onClick={() => renewMutation.mutate(c)}
                          >
                            <AutorenewIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="Revoke">
                        <span>
                          <IconButton
                            size="small"
                            color="error"
                            disabled={c.status !== 'active'}
                            onClick={() => {
                              setRevokeReason('unspecified');
                              setRevokeCert(c);
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
        ))}

      <Menu anchorEl={exportAnchor} open={!!exportAnchor} onClose={closeExportMenu}>
        <MenuItem onClick={() => doExport('pem')}>PEM (leaf)</MenuItem>
        <MenuItem onClick={() => doExport('der')}>DER</MenuItem>
        <MenuItem onClick={() => doExport('chain')}>Chain (PEM)</MenuItem>
        <MenuItem onClick={() => doExport('pkcs12')}>PKCS#12 (.p12)…</MenuItem>
      </Menu>

      {/* PKCS#12 passphrase prompt */}
      <Dialog open={!!p12Cert} onClose={() => setP12Cert(null)} fullWidth maxWidth="xs">
        <DialogTitle>Export PKCS#12</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Enter the passphrase set when this certificate was issued. The key must have been stored
            encrypted (passphrase certs only).
          </DialogContentText>
          <TextField
            label="Passphrase"
            type="password"
            fullWidth
            autoFocus
            value={p12Password}
            onChange={(e) => setP12Password(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setP12Cert(null)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={!p12Password || exportMutation.isPending}
            onClick={() => {
              const cert = p12Cert!;
              exportMutation.mutate({ cert, format: 'pkcs12', password: p12Password });
              setP12Cert(null);
            }}
          >
            Export
          </Button>
        </DialogActions>
      </Dialog>

      {/* Revoke dialog */}
      <Dialog open={!!revokeCert} onClose={() => setRevokeCert(null)} fullWidth maxWidth="xs">
        <DialogTitle>Revoke certificate</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Revoke &ldquo;{revokeCert?.commonName}&rdquo;? This also revokes any API tokens it signed.
          </DialogContentText>
          <FormControl fullWidth>
            <InputLabel id="revoke-reason-label">Reason</InputLabel>
            <Select
              labelId="revoke-reason-label"
              label="Reason"
              value={revokeReason}
              onChange={(e) => setRevokeReason(e.target.value)}
            >
              {REVOCATION_REASONS.map((r) => (
                <MenuItem key={r} value={r}>
                  {r}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setRevokeCert(null)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            disabled={revokeMutation.isPending}
            onClick={() => revokeMutation.mutate()}
          >
            {revokeMutation.isPending ? 'Revoking…' : 'Revoke'}
          </Button>
        </DialogActions>
      </Dialog>

      <IssueDialog
        open={issueOpen}
        onClose={() => setIssueOpen(false)}
        onIssued={(pk, cn) => {
          setToast(`Issued certificate “${cn}”`);
          if (pk) setPrivateKey(pk);
        }}
        onToast={setToast}
      />

      <PrivateKeyDialog
        privateKey={privateKey}
        onClose={() => setPrivateKey(null)}
        onCopy={copy}
      />

      <DetailsDialog cert={detailCert} onClose={() => setDetailCert(null)} />

      <Snackbar
        open={!!toast}
        autoHideDuration={5000}
        onClose={() => setToast(null)}
        message={toast}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Stack>
  );
}
