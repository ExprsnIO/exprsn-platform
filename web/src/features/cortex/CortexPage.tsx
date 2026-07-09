import { Stack, Typography } from '@mui/material';

/** Cortex user workspace — assistant chat, agent tasks, CS flows, outbox. */
export function CortexPage() {
  return (
    <Stack spacing={2} sx={{ p: 3 }}>
      <Typography variant="h5">AI (Cortex)</Typography>
      <Typography color="text.secondary">Loading…</Typography>
    </Stack>
  );
}
