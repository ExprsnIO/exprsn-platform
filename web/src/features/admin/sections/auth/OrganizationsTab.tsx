import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
} from '@mui/material';
import { authAdminApi, type Organization, type OrgType } from '@/api/admin/auth';
import { formatDate } from '@/features/files/util';
import { useAppStore } from '@/app/store';
import { DataTable, QueryState, StatusChip } from '@/features/admin/ui';
import { ORG_TYPES, OrganizationDetail } from './OrgDetail';

/** Provisioning templates keyed on org type — helper copy for the type picker. */
const ORG_TEMPLATE_HELP: Record<OrgType, string> = {
  enterprise: 'Full org: per-org intermediate CA, RBAC groups, owner cert/token, Nexus group and Spark channels.',
  team: 'Collaborative workspace with RBAC groups and channels, minus the enterprise CA overhead.',
  personal: 'Lightweight personal workspace for a single owner.',
};

function slugifyOrg(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100);
}

/**
 * Provision a full organization through the shared engine (FEAT-032/033) — the
 * same code path as public signup and self-serve, differing only in auth (admin
 * CA token) and owner (chosen here; defaults to the acting admin). A structured
 * form, never a name-only stub: name, slug, type/template, description, and the
 * owner's email (an existing user is adopted, otherwise created).
 */
function CreateOrgDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (m: string) => void }) {
  const qc = useQueryClient();
  const myEmail = useAppStore((s) => s.user?.email) ?? '';
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [type, setType] = useState<OrgType>('team');
  const [description, setDescription] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');

  useEffect(() => {
    if (open) {
      setName(''); setSlug(''); setSlugTouched(false); setType('team'); setDescription('');
      setOwnerEmail(myEmail);
    }
  }, [open, myEmail]);

  const slugValue = slugTouched ? slug : slugifyOrg(name);
  const slugValid = slugValue === '' || /^[a-z0-9-]+$/.test(slugValue);
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail);
  const canSubmit = !!name.trim() && slugValid && emailValid;

  const mut = useMutation({
    mutationFn: () => authAdminApi.provisionOrganization({
      type,
      organization: {
        name: name.trim(),
        slug: slugValue || undefined,
        description: description.trim() || undefined,
      },
      owner: { email: ownerEmail.trim() },
    }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['auth', 'orgs'] });
      onDone(res.status === 'completed' ? 'Organization provisioned' : `Provisioning ${res.status}`);
      onClose();
    },
    onError: (e) => onDone((e as Error).message),
  });

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Provision organization</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField autoFocus required fullWidth label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <TextField
            fullWidth
            label="Slug"
            value={slugValue}
            onChange={(e) => { setSlugTouched(true); setSlug(e.target.value); }}
            error={!!slugValue && !slugValid}
            helperText={!!slugValue && !slugValid ? 'Lowercase letters, numbers and hyphens only.' : 'Used in URLs; leave as suggested or customize. Must be unique.'}
          />
          <TextField
            select
            fullWidth
            label="Type / template"
            value={type}
            onChange={(e) => setType(e.target.value as OrgType)}
            helperText={ORG_TEMPLATE_HELP[type]}
          >
            {ORG_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
          </TextField>
          <TextField fullWidth label="Description" value={description} onChange={(e) => setDescription(e.target.value)} multiline minRows={2} />
          <TextField
            required
            fullWidth
            type="email"
            label="Owner email"
            value={ownerEmail}
            onChange={(e) => setOwnerEmail(e.target.value)}
            error={!!ownerEmail && !emailValid}
            helperText={!!ownerEmail && !emailValid ? 'Enter a valid email address.' : 'Defaults to you. An existing user is made owner; otherwise a new owner account is created.'}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!canSubmit || mut.isPending} onClick={() => mut.mutate()}>
          {mut.isPending ? 'Provisioning…' : 'Provision'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function OrganizationsTab({ onToast }: { onToast: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Organization | null>(null);
  const query = useQuery({
    queryKey: ['auth', 'orgs', 'counts'],
    queryFn: () => authAdminApi.listOrganizations({ includeCounts: true }),
  });

  // Details opens the org's page: its stored settings extrapolated into editable
  // fields (2FA policy included), with membership/group/role management below.
  // Clicking anywhere on a row opens the same inspector.
  if (selected) {
    return <OrganizationDetail org={selected} onBack={() => setSelected(null)} onToast={onToast} />;
  }

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="flex-end">
        <Button variant="contained" onClick={() => setOpen(true)}>Provision organization</Button>
      </Stack>
      <QueryState query={query} empty="You belong to no organizations.">
        {(d) => (
          <DataTable
            rows={d.organizations ?? d.data ?? []}
            rowKey={(o) => o.id}
            tableId="auth.orgs"
            onRowClick={(o) => setSelected(o)}
            columns={[
              { key: 'name', header: 'Name' },
              { key: 'slug', header: 'Slug', render: (o) => o.slug ?? '—' },
              { key: 'type', header: 'Type', defaultHidden: true, render: (o) => o.type ?? '—' },
              { key: 'plan', header: 'Plan', defaultHidden: true, render: (o) => o.plan ?? '—' },
              {
                key: 'status',
                header: 'Status',
                render: (o) => <StatusChip status={o.status} />,
                sortValue: (o) => o.status ?? '',
                filterValue: (o) => o.status ?? '',
              },
              {
                key: 'mfa',
                header: '2FA',
                render: (o) => <StatusChip status={o.settings?.requireMfa ? 'required' : 'optional'} />,
                sortValue: (o) => (o.settings?.requireMfa ? 1 : 0),
                filterValue: (o) => (o.settings?.requireMfa ? 'required' : 'optional'),
              },
              {
                key: 'groups',
                header: 'Groups',
                align: 'right',
                render: (o) => o.counts?.groups ?? '—',
                sortValue: (o) => o.counts?.groups ?? null,
                filterValue: (o) => String(o.counts?.groups ?? ''),
              },
              {
                key: 'users',
                header: 'Users',
                align: 'right',
                render: (o) => o.counts?.users ?? '—',
                sortValue: (o) => o.counts?.users ?? null,
                filterValue: (o) => String(o.counts?.users ?? ''),
              },
              {
                key: 'violations',
                header: 'Violations',
                align: 'right',
                render: (o) => o.counts?.violations ?? '—',
                sortValue: (o) => o.counts?.violations ?? null,
                filterValue: (o) => String(o.counts?.violations ?? ''),
              },
              {
                key: 'createdAt',
                header: 'Created',
                render: (o) => formatDate(o.createdAt),
                sortValue: (o) => o.createdAt ?? null,
              },
              {
                key: 'actions',
                header: '',
                align: 'right',
                locked: true,
                render: (o) => (
                  <Stack direction="row" spacing={1} justifyContent="flex-end">
                    <Button size="small" onClick={() => setSelected(o)}>Details</Button>
                  </Stack>
                ),
              },
            ]}
          />
        )}
      </QueryState>
      <CreateOrgDialog open={open} onClose={() => setOpen(false)} onDone={onToast} />
    </Stack>
  );
}
