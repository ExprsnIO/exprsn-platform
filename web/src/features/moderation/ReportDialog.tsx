import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormLabel,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import {
  reportsApi,
  REPORT_REASONS,
  type ReportContentType,
  type ReportReason,
} from '@/api/reports';
import { isHttpError, toMessage } from '@/lib/errors';

const DETAILS_MAX = 1000;

/**
 * Structured report/flag form bound to the static Report.reason ENUM
 * (REPORT_REASONS) — a reason picker plus an optional details field, submit,
 * confirmation, and error handling. Satisfies the no-JSON-only-modals rule: a
 * real form on live content identity, not a raw JSON blob.
 *
 * The reporter identity is bound server-side to the bearer, so this never sends
 * `reportedBy`. A duplicate report of the same item returns 409
 * (`ALREADY_REPORTED`), which we treat as a (benign) "already reported"
 * confirmation rather than an error — the double-report guard.
 *
 * Timeline is the first surface (contentType 'post', sourceService 'timeline').
 * TODO(FEAT-010 fast-follow): spark message reporting reuses this dialog with
 * contentType 'message' + sourceService 'spark' from the message overflow menu.
 */
export function ReportDialog({
  open,
  onClose,
  contentType,
  contentId,
  sourceService,
  contentLabel = 'content',
}: {
  open: boolean;
  onClose: () => void;
  contentType: ReportContentType;
  contentId: string;
  /** Module the content lives in, e.g. 'timeline'. */
  sourceService: string;
  /** Human noun for the confirmation copy, e.g. 'post' or 'message'. */
  contentLabel?: string;
}) {
  const [reason, setReason] = useState<ReportReason | ''>('');
  const [details, setDetails] = useState('');
  // Distinguishes a fresh submit from an idempotent "you already reported this".
  const [done, setDone] = useState<null | 'submitted' | 'already'>(null);

  const mutation = useMutation({
    mutationFn: () =>
      reportsApi.create({
        contentType,
        contentId,
        sourceService,
        reason: reason as ReportReason,
        details: details.trim() || undefined,
      }),
    onSuccess: () => setDone('submitted'),
    onError: (err) => {
      // A second report of the same item by the same user is a clean 409, not a
      // failure — show the same confirmation path ("already reported").
      if (isHttpError(err, 409)) setDone('already');
    },
  });

  // Reset all local state whenever the dialog (re)opens so a prior submission or
  // error never bleeds into the next report.
  useEffect(() => {
    if (open) {
      setReason('');
      setDetails('');
      setDone(null);
      mutation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const detailsTooLong = details.length > DETAILS_MAX;
  const canSubmit = reason !== '' && !detailsTooLong && !mutation.isPending;
  // 409 lands in onError; keep the confirmation view and suppress the alert.
  const showError = mutation.isError && !isHttpError(mutation.error, 409);

  if (done) {
    return (
      <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
        <DialogTitle>{done === 'already' ? 'Already reported' : 'Report received'}</DialogTitle>
        <DialogContent>
          <Stack direction="row" spacing={1.5} alignItems="flex-start">
            <CheckCircleOutlineIcon color="success" sx={{ mt: 0.25 }} />
            <Typography variant="body2" color="text.secondary">
              {done === 'already'
                ? `You have already reported this ${contentLabel}. Our moderators will review it.`
                : `Thanks — this ${contentLabel} has been sent to our moderators for review.`}
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={onClose}>
            Done
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Report {contentLabel}</DialogTitle>
      <DialogContent>
        {showError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {toMessage(mutation.error)}
          </Alert>
        )}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Tell us what’s wrong with this {contentLabel}. Your report is confidential.
        </Typography>

        <FormControl component="fieldset" fullWidth>
          <FormLabel component="legend" sx={{ mb: 1 }}>
            Reason
          </FormLabel>
          <RadioGroup
            aria-label="Report reason"
            value={reason}
            onChange={(e) => setReason(e.target.value as ReportReason)}
          >
            {REPORT_REASONS.map((r) => (
              <FormControlLabel
                key={r.value}
                value={r.value}
                control={<Radio />}
                label={
                  <Box sx={{ py: 0.25 }}>
                    <Typography variant="body2">{r.label}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {r.description}
                    </Typography>
                  </Box>
                }
                sx={{ alignItems: 'flex-start', mb: 0.5 }}
              />
            ))}
          </RadioGroup>
        </FormControl>

        <TextField
          fullWidth
          multiline
          minRows={2}
          maxRows={6}
          label="Additional details (optional)"
          placeholder="Add any context that will help our moderators."
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          error={detailsTooLong}
          helperText={`${details.length}/${DETAILS_MAX}`}
          sx={{ mt: 2 }}
        />
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="contained" disabled={!canSubmit} onClick={() => mutation.mutate()}>
          {mutation.isPending ? 'Submitting…' : 'Submit report'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
