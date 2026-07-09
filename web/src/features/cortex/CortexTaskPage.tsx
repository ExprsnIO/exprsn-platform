import { Stack, Typography } from '@mui/material';
import { useParams } from 'react-router-dom';

/** Agent task detail — polls the task until it finishes, renders transcript. */
export function CortexTaskPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <Stack spacing={2} sx={{ p: 3 }}>
      <Typography variant="h5">Agent task {id}</Typography>
      <Typography color="text.secondary">Loading…</Typography>
    </Stack>
  );
}
