/**
 * Read-only JSON viewer. Fetches the file as text, JSON.parses it, and renders a
 * collapsible tree (objects/arrays expand/collapse; leaves are colour-coded by
 * type). On parse failure it falls back to showing the raw text verbatim.
 * Dependency-free — the tree is a small recursive component.
 */
import { useEffect, useState } from 'react';
import { Alert, Box, CircularProgress } from '@mui/material';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { filevaultApi, type FileItem } from '@/api/filevault';

type Json = unknown;

function leafColor(value: Json): string {
  if (typeof value === 'string') return 'success.main';
  if (typeof value === 'number') return 'info.main';
  if (typeof value === 'boolean') return 'warning.main';
  return 'text.disabled'; // null
}

function leafText(value: Json): string {
  if (typeof value === 'string') return JSON.stringify(value);
  if (value === null) return 'null';
  return String(value);
}

function Node({ name, value, depth }: { name?: string; value: Json; depth: number }) {
  const isObject = value !== null && typeof value === 'object';
  const [open, setOpen] = useState(depth < 2);

  if (!isObject) {
    return (
      <Box sx={{ pl: depth * 1.5, py: 0.1 }}>
        {name !== undefined && (
          <Box component="span" sx={{ color: 'text.secondary' }}>
            {name}:{' '}
          </Box>
        )}
        <Box component="span" sx={{ color: leafColor(value) }}>
          {leafText(value)}
        </Box>
      </Box>
    );
  }

  const entries: [string, Json][] = Array.isArray(value)
    ? value.map((v, i) => [String(i), v])
    : Object.entries(value as Record<string, Json>);
  const open0 = Array.isArray(value) ? '[' : '{';
  const close0 = Array.isArray(value) ? ']' : '}';

  return (
    <Box sx={{ pl: depth * 1.5 }}>
      <Box
        component="button"
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Collapse' : 'Expand'}
        aria-expanded={open}
        sx={{
          display: 'flex',
          alignItems: 'center',
          cursor: 'pointer',
          border: 0,
          background: 'none',
          p: 0,
          width: '100%',
          textAlign: 'left',
          font: 'inherit',
          color: 'inherit',
          py: 0.1,
          userSelect: 'none',
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        {open ? (
          <ExpandMoreIcon sx={{ fontSize: 16 }} />
        ) : (
          <ChevronRightIcon sx={{ fontSize: 16 }} />
        )}
        {name !== undefined && (
          <Box component="span" sx={{ color: 'text.secondary', mr: 0.5 }}>
            {name}:
          </Box>
        )}
        <Box component="span" sx={{ color: 'text.disabled' }}>
          {open ? open0 : `${open0} … ${close0}`}
          {!open && (
            <Box component="span" sx={{ ml: 0.5 }}>
              {entries.length} {entries.length === 1 ? 'item' : 'items'}
            </Box>
          )}
        </Box>
      </Box>
      {open && (
        <Box>
          {entries.map(([k, v]) => (
            <Node key={k} name={k} value={v} depth={depth + 1} />
          ))}
          <Box sx={{ pl: (depth + 1) * 1.5, color: 'text.disabled' }}>{close0}</Box>
        </Box>
      )}
    </Box>
  );
}

export function JsonView({ file }: { file: FileItem }) {
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setText(null);
    setFailed(false);
    filevaultApi
      .getTextContent(file.id)
      .then((t) => {
        if (active) setText(t);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [file.id]);

  if (failed) {
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        Couldn’t load this file.
      </Alert>
    );
  }

  if (text === null) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 240 }}>
        <CircularProgress />
      </Box>
    );
  }

  let parsed: Json;
  let parseFailed = false;
  try {
    parsed = JSON.parse(text);
  } catch {
    parseFailed = true;
  }

  if (parseFailed) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="warning" sx={{ mb: 1 }}>
          Not valid JSON — showing raw text.
        </Alert>
        <Box
          component="pre"
          sx={{
            m: 0,
            p: 1.5,
            maxHeight: '64vh',
            overflow: 'auto',
            borderRadius: 1,
            bgcolor: 'action.hover',
            fontFamily: 'monospace',
            fontSize: 12,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {text}
        </Box>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        p: 1.5,
        maxHeight: '64vh',
        overflow: 'auto',
        fontFamily: 'monospace',
        fontSize: 12.5,
        lineHeight: 1.6,
      }}
    >
      <Node value={parsed!} depth={0} />
    </Box>
  );
}
