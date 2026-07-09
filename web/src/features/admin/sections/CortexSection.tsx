import { useState } from 'react';
import { Stack, Tab, Tabs } from '@mui/material';
import { SectionHeader, useToast } from '../ui';
import { OverviewTab } from './cortex/OverviewTab';
import { GuardrailsTab } from './cortex/GuardrailsTab';
import { ToolsTab } from './cortex/ToolsTab';
import { SkillsTab } from './cortex/SkillsTab';
import { ReviewsTab } from './cortex/ReviewsTab';
import { PromptLogTab } from './cortex/PromptLogTab';

type CortexTab = 'overview' | 'guardrails' | 'tools' | 'skills' | 'reviews' | 'prompts';

/** Cortex admin — overview, guardrails/tools/skills registries, reviews, prompt log. */
export function CortexSection() {
  const [tab, setTab] = useState<CortexTab>('overview');
  const { showToast, ToastHost } = useToast();
  return (
    <Stack spacing={2} sx={{ pb: 6 }}>
      <SectionHeader title="AI (Cortex)" subtitle="Local-LLM agents, guardrails, skills, and tools — /cortex/api/v1" />
      <Tabs value={tab} onChange={(_e, v) => setTab(v)} variant="scrollable" scrollButtons="auto">
        <Tab value="overview" label="Overview" />
        <Tab value="guardrails" label="Guardrails" />
        <Tab value="tools" label="Tools" />
        <Tab value="skills" label="Skills" />
        <Tab value="reviews" label="Reviews" />
        <Tab value="prompts" label="Prompt Log" />
      </Tabs>
      {tab === 'overview' && <OverviewTab />}
      {tab === 'guardrails' && <GuardrailsTab toast={showToast} />}
      {tab === 'tools' && <ToolsTab toast={showToast} />}
      {tab === 'skills' && <SkillsTab toast={showToast} />}
      {tab === 'reviews' && <ReviewsTab toast={showToast} />}
      {tab === 'prompts' && <PromptLogTab />}
      {ToastHost}
    </Stack>
  );
}
