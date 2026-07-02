/**
 * Public (anonymous) form landing — /f/:slug, no auth guard, no app shell
 * (same pattern as the FileVault share landing /s/:id). Fetches the render
 * spec from the lowcode hooks API, renders the form's declared layout
 * (sections, wizard steps, per-field visibleWhen evaluated live) and submits
 * anonymously. The backend whitelists submitted fields to the layout.
 */
import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardContent, CircularProgress, FormControlLabel, MenuItem,
  Stack, Step, StepLabel, Stepper, Switch, TextField, Typography,
} from '@mui/material';
import { useMutation, useQuery } from '@tanstack/react-query';
import { http } from '@/lib/http';
import { toMessage } from '@/lib/errors';
import { evaluateCondition } from './conditions';

interface PublicField {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  min?: number;
  max?: number;
  options?: string[];
}

interface PublicFormSpec {
  form: {
    name: string;
    entityKey: string;
    layout?: {
      sections?: { title?: string; fields: (string | { key: string; visibleWhen?: unknown; placeholder?: string; help?: string })[] }[];
      steps?: boolean;
      submitLabel?: string;
    };
    settings?: Record<string, unknown>;
    fields: PublicField[];
  };
  app: { name: string };
}

type Values = Record<string, unknown>;

interface LayoutEntry { key: string; visibleWhen?: unknown; placeholder?: string; help?: string }

const normalize = (e: string | LayoutEntry): LayoutEntry => (typeof e === 'string' ? { key: e } : e);

function FieldInput({ field, entry, value, onChange }: {
  field: PublicField; entry: LayoutEntry; value: unknown; onChange: (v: unknown) => void;
}) {
  const common = {
    label: field.label + (field.required ? ' *' : ''),
    fullWidth: true,
    placeholder: entry.placeholder,
    helperText: entry.help,
  } as const;
  switch (field.type) {
    case 'boolean':
      return <FormControlLabel control={<Switch checked={value === true} onChange={(e) => onChange(e.target.checked)} />} label={field.label} />;
    case 'enum':
      return (
        <TextField {...common} select value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)}>
          <MenuItem value=""><em>—</em></MenuItem>
          {(field.options ?? []).map((o) => <MenuItem key={o} value={o}>{o}</MenuItem>)}
        </TextField>
      );
    case 'number':
    case 'integer':
      return <TextField {...common} type="number" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />;
    case 'date':
      return <TextField {...common} type="date" InputLabelProps={{ shrink: true }} value={String(value ?? '').slice(0, 10)} onChange={(e) => onChange(e.target.value)} />;
    case 'datetime':
      return <TextField {...common} type="datetime-local" InputLabelProps={{ shrink: true }} value={String(value ?? '').slice(0, 16)} onChange={(e) => onChange(e.target.value)} />;
    case 'text':
      return <TextField {...common} multiline minRows={3} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />;
    default:
      return <TextField {...common} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />;
  }
}

export function PublicFormPage() {
  const { slug } = useParams<{ slug: string }>();
  const [values, setValues] = useState<Values>({});
  const [step, setStep] = useState(0);
  const [done, setDone] = useState<string | null>(null);

  const specQ = useQuery({
    queryKey: ['lowcode', 'public-form', slug],
    queryFn: () => http.get<PublicFormSpec>(`/lowcode/api/hooks/forms/${encodeURIComponent(slug!)}`),
    enabled: !!slug,
    retry: false,
  });

  const submit = useMutation({
    mutationFn: () => http.post<{ ok: boolean; message?: string }>(`/lowcode/api/hooks/forms/${encodeURIComponent(slug!)}/submit`, values),
    onSuccess: (r) => setDone(r.message || 'Thanks — your response was recorded.'),
  });

  const spec = specQ.data;
  const fieldsByKey = useMemo(() => new Map((spec?.form.fields ?? []).map((f) => [f.key, f])), [spec]);

  // Sections from the layout; a layout with no sections renders all fields flat.
  const sections = useMemo((): { title?: string; entries: LayoutEntry[] }[] => {
    const declared = spec?.form.layout?.sections;
    if (declared?.length) return declared.map((s) => ({ title: s.title, entries: s.fields.map(normalize) }));
    return [{ title: undefined, entries: (spec?.form.fields ?? []).map((f) => ({ key: f.key })) }];
  }, [spec]);

  const isWizard = !!spec?.form.layout?.steps && sections.length > 1;
  const visibleSections = isWizard ? [sections[Math.min(step, sections.length - 1)]] : sections;

  const set = (key: string, v: unknown) => setValues((prev) => ({ ...prev, [key]: v }));

  if (specQ.isLoading) return <Center><CircularProgress /></Center>;
  if (specQ.isError || !spec) return <Center><Alert severity="error">This form doesn't exist or is no longer accepting responses.</Alert></Center>;

  return (
    <Center>
      <Card sx={{ width: '100%', maxWidth: 560 }}>
        <CardContent>
          <Stack spacing={2}>
            <Box>
              <Typography variant="overline" color="text.secondary">{spec.app.name}</Typography>
              <Typography variant="h5">{spec.form.name}</Typography>
            </Box>

            {done ? (
              <Alert severity="success">{done}</Alert>
            ) : (
              <>
                {isWizard && (
                  <Stepper activeStep={step} alternativeLabel>
                    {sections.map((s, i) => <Step key={i}><StepLabel>{s.title || `Step ${i + 1}`}</StepLabel></Step>)}
                  </Stepper>
                )}

                {visibleSections.map((s, si) => (
                  <Stack key={si} spacing={2}>
                    {!isWizard && s.title && <Typography variant="subtitle2">{s.title}</Typography>}
                    {s.entries
                      .filter((e) => fieldsByKey.has(e.key) && evaluateCondition(e.visibleWhen, values))
                      .map((e) => (
                        <FieldInput
                          key={e.key}
                          field={fieldsByKey.get(e.key)!}
                          entry={e}
                          value={values[e.key]}
                          onChange={(v) => set(e.key, v)}
                        />
                      ))}
                  </Stack>
                ))}

                {submit.isError && <Alert severity="error">{toMessage(submit.error)}</Alert>}

                <Stack direction="row" spacing={1} justifyContent="flex-end">
                  {isWizard && step > 0 && <Button onClick={() => setStep((s) => s - 1)}>Back</Button>}
                  {isWizard && step < sections.length - 1 ? (
                    <Button variant="contained" onClick={() => setStep((s) => s + 1)}>Next</Button>
                  ) : (
                    <Button variant="contained" disabled={submit.isPending} onClick={() => submit.mutate()}>
                      {spec.form.layout?.submitLabel || 'Submit'}
                    </Button>
                  )}
                </Stack>
              </>
            )}
          </Stack>
        </CardContent>
      </Card>
    </Center>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2, bgcolor: 'background.default' }}>
      {children}
    </Box>
  );
}
