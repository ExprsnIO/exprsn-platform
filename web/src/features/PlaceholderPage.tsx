import { Alert, Stack, Typography } from '@mui/material';

/** Temporary stand-in for feature areas that land in later phases. */
export function PlaceholderPage({ title }: { title: string }) {
  return (
    <Stack spacing={2}>
      <Typography variant="h5" component="h1">{title}</Typography>
      <Alert severity="info">
        This feature area is scaffolded but not yet implemented. It will be built in a later phase
        against the corresponding backend module.
      </Alert>
    </Stack>
  );
}
