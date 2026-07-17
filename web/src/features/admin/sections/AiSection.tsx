/**
 * Consolidated Infrastructure → AI view (TASK-039 admin IA restructure).
 * All AI administration lives here: the moderator module's provider config +
 * live provider status, the cortex model list, the moderation AI agents, and
 * the cortex tool/guardrail/skill registries. Every tab reuses the component
 * that previously lived in the Moderation / Cortex sections — nothing is
 * duplicated. The Cortex section itself is now just a task/chat console.
 */
import { useState } from 'react';
import { Stack, Tab, Tabs } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { moderatorAdminApi } from '@/api/admin/moderator';
import { Card, ConfigSectionEditor, DataView, QueryState, SectionHeader, useToast } from '../ui';
import { AgentsTab } from './moderator/AgentsTab';
import { ModelsTab } from './cortex/ModelsTab';
import { ToolsTab } from './cortex/ToolsTab';
import { GuardrailsTab } from './cortex/GuardrailsTab';
import { SkillsTab } from './cortex/SkillsTab';

/** Moderator AI-provider config (the `moderation-ai` section) + live provider status. */
function ProvidersTab() {
  const providers = useQuery({ queryKey: ['mod', 'providers'], queryFn: moderatorAdminApi.providersStatus });
  return (
    <Stack spacing={2}>
      <Card title="Provider status">
        <QueryState query={providers}>{(d) => <DataView value={d} />}</QueryState>
      </Card>
      <ConfigSectionEditor
        sections={['moderation-ai']}
        load={(s) => moderatorAdminApi.getConfigSection(s)}
        save={(s, data) => moderatorAdminApi.saveConfigSection(s, data)}
      />
    </Stack>
  );
}

type AiTab = 'providers' | 'models' | 'agents' | 'tools' | 'guardrails' | 'skills';

export function AiSection() {
  const [tab, setTab] = useState<AiTab>('providers');
  const { showToast, ToastHost } = useToast();
  return (
    <Stack spacing={2} sx={{ pb: 6 }}>
      <SectionHeader
        title="AI"
        subtitle="Providers, models, moderation agents, and the tool/guardrail/skill registries — /moderator/api + /cortex/api/v1"
      />
      <Tabs value={tab} onChange={(_e, v) => setTab(v)} variant="scrollable" scrollButtons="auto">
        <Tab value="providers" label="Providers" />
        <Tab value="models" label="Models" />
        <Tab value="agents" label="Moderation Agents" />
        <Tab value="tools" label="Tools" />
        <Tab value="guardrails" label="Guardrails" />
        <Tab value="skills" label="Skills" />
      </Tabs>
      {tab === 'providers' && <ProvidersTab />}
      {tab === 'models' && <ModelsTab />}
      {tab === 'agents' && <AgentsTab onToast={showToast} />}
      {tab === 'tools' && <ToolsTab toast={showToast} />}
      {tab === 'guardrails' && <GuardrailsTab toast={showToast} />}
      {tab === 'skills' && <SkillsTab toast={showToast} />}
      {ToastHost}
    </Stack>
  );
}
