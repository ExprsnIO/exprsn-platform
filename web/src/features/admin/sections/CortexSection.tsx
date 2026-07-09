import { Stack } from '@mui/material';
import { SectionHeader } from '../ui';

/** Cortex admin — overview, guardrails/tools/skills registries, reviews, prompt log. */
export function CortexSection() {
  return (
    <Stack spacing={2} sx={{ pb: 6 }}>
      <SectionHeader title="AI (Cortex)" subtitle="Local-LLM agents, guardrails, skills, and tools — /cortex/api/v1" />
    </Stack>
  );
}
