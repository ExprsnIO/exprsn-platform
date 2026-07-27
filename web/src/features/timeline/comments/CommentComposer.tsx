/**
 * Markdown-aware comment composer, shared by the top-level box and every inline
 * reply. Offers a Write/Preview toggle and a small formatting toolbar that wraps
 * the current selection (bold/italic/code/link/quote). Submit on click or
 * Cmd/Ctrl+Enter. Purely controlled by its parent's mutation state.
 */
import { useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  IconButton,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
} from '@mui/material';
import FormatBoldIcon from '@mui/icons-material/FormatBold';
import FormatItalicIcon from '@mui/icons-material/FormatItalic';
import CodeIcon from '@mui/icons-material/Code';
import LinkIcon from '@mui/icons-material/Link';
import FormatQuoteIcon from '@mui/icons-material/FormatQuote';
import { RichText } from '../RichText';

export const COMMENT_MAX = 2000;

type Wrap = { before: string; after: string; placeholder: string };

const WRAPS: Record<string, Wrap> = {
  bold: { before: '**', after: '**', placeholder: 'bold text' },
  italic: { before: '_', after: '_', placeholder: 'italic text' },
  code: { before: '`', after: '`', placeholder: 'code' },
  link: { before: '[', after: '](https://)', placeholder: 'link text' },
  quote: { before: '> ', after: '', placeholder: 'quote' },
};

export function CommentComposer({
  value,
  onChange,
  onSubmit,
  submitting,
  markdown,
  error,
  placeholder = 'Write a comment…',
  submitLabel = 'Comment',
  autoFocus = false,
  onCancel,
  compact = false,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  markdown: boolean;
  error?: string | null;
  placeholder?: string;
  submitLabel?: string;
  autoFocus?: boolean;
  onCancel?: () => void;
  compact?: boolean;
}) {
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const ref = useRef<HTMLTextAreaElement | null>(null);

  const tooLong = value.length > COMMENT_MAX;
  const canSubmit = value.trim().length > 0 && !tooLong && !submitting;

  const applyWrap = (kind: string) => {
    const el = ref.current;
    const wrap = WRAPS[kind];
    if (!el || !wrap) return;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const selected = value.slice(start, end) || wrap.placeholder;
    const next = value.slice(0, start) + wrap.before + selected + wrap.after + value.slice(end);
    onChange(next);
    // Restore focus + selection around the wrapped text on the next tick.
    requestAnimationFrame(() => {
      el.focus();
      const s = start + wrap.before.length;
      el.setSelectionRange(s, s + selected.length);
    });
  };

  return (
    <Box>
      {markdown && (
        <Stack
          direction="row"
          spacing={0.5}
          alignItems="center"
          sx={{ mb: 0.5, flexWrap: 'wrap', rowGap: 0.5 }}
        >
          <ToggleButtonGroup
            size="small"
            exclusive
            value={tab}
            onChange={(_e, v) => v && setTab(v)}
            sx={{ mr: 1 }}
          >
            <ToggleButton value="write" sx={{ px: 1.25, py: 0.25, textTransform: 'none' }}>
              Write
            </ToggleButton>
            <ToggleButton value="preview" sx={{ px: 1.25, py: 0.25, textTransform: 'none' }}>
              Preview
            </ToggleButton>
          </ToggleButtonGroup>
          {tab === 'write' && (
            <>
              <Tooltip title="Bold">
                <IconButton aria-label="Bold" size="small" onClick={() => applyWrap('bold')}><FormatBoldIcon fontSize="small" /></IconButton>
              </Tooltip>
              <Tooltip title="Italic">
                <IconButton aria-label="Italic" size="small" onClick={() => applyWrap('italic')}><FormatItalicIcon fontSize="small" /></IconButton>
              </Tooltip>
              <Tooltip title="Code">
                <IconButton aria-label="Code" size="small" onClick={() => applyWrap('code')}><CodeIcon fontSize="small" /></IconButton>
              </Tooltip>
              <Tooltip title="Link">
                <IconButton aria-label="Link" size="small" onClick={() => applyWrap('link')}><LinkIcon fontSize="small" /></IconButton>
              </Tooltip>
              <Tooltip title="Quote">
                <IconButton aria-label="Quote" size="small" onClick={() => applyWrap('quote')}><FormatQuoteIcon fontSize="small" /></IconButton>
              </Tooltip>
            </>
          )}
        </Stack>
      )}

      {markdown && tab === 'preview' ? (
        <Box
          sx={{
            minHeight: 56,
            p: 1.25,
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1,
            bgcolor: 'action.hover',
          }}
        >
          {value.trim() ? (
            <RichText text={value} markdown dense={compact} />
          ) : (
            <Box sx={{ color: 'text.secondary', fontStyle: 'italic', fontSize: '0.875rem' }}>
              Nothing to preview yet.
            </Box>
          )}
        </Box>
      ) : (
        <TextField
          inputRef={ref}
          fullWidth
          multiline
          minRows={compact ? 1 : 2}
          maxRows={8}
          size="small"
          autoFocus={autoFocus}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && canSubmit) onSubmit();
            if (e.key === 'Escape' && onCancel) onCancel();
          }}
          error={tooLong}
          helperText={
            tooLong
              ? `${value.length}/${COMMENT_MAX}`
              : markdown
                ? 'Markdown supported · ⌘/Ctrl+Enter to send'
                : '⌘/Ctrl+Enter to send'
          }
        />
      )}

      {error && (
        <Alert severity="error" sx={{ mt: 1 }}>
          {error}
        </Alert>
      )}

      <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
        <Button variant="contained" size="small" disabled={!canSubmit} onClick={onSubmit}>
          {submitting ? '…' : submitLabel}
        </Button>
        {onCancel && (
          <Button size="small" color="inherit" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        )}
      </Stack>
    </Box>
  );
}
