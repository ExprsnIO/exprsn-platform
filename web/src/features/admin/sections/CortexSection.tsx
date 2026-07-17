import { useState } from 'react';
import { Stack, Tab, Tabs } from '@mui/material';
import { SectionHeader, useToast } from '../ui';
import { OverviewTab } from './cortex/OverviewTab';
import { ReviewsTab } from './cortex/ReviewsTab';
import { PromptLogTab } from './cortex/PromptLogTab';

type CortexTab = 'overview' | 'reviews' | 'prompts';

/**
 * Cortex task/chat console — task overview, human reviews, prompt log.
 * The registries (tools/guardrails/skills) and model list moved to the
 * consolidated Infrastructure → AI section (AiSection).
 */
export function CortexSection() {
  const [tab, setTab] = useState<CortexTab>('overview');
  const { showToast, ToastHost } = useToast();
  return (
    <Stack spacing={2} sx={{ pb: 6 }}>
      <SectionHeader title="Cortex" subtitle="Task/chat console — tasks, human reviews, and the prompt log — /cortex/api/v1" />
      <Tabs value={tab} onChange={(_e, v) => setTab(v)} variant="scrollable" scrollButtons="auto">
        <Tab value="overview" label="Overview" />
        <Tab value="reviews" label="Reviews" />
        <Tab value="prompts" label="Prompt Log" />
      </Tabs>
      {tab === 'overview' && <OverviewTab />}
      {tab === 'reviews' && <ReviewsTab toast={showToast} />}
      {tab === 'prompts' && <PromptLogTab />}
      {ToastHost}
    </Stack>
  );
}
