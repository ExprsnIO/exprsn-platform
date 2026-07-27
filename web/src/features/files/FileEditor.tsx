// Side-effect import: configures the Monaco loader to use the locally-bundled
// editor + Vite web workers (no external CDN). MUST be imported before <Editor>.
import './monacoSetup';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import Editor, { type OnMount } from '@monaco-editor/react';
import { toMessage } from '@/lib/errors';
import { filevaultApi, type FileItem } from '@/api/filevault';
import { monacoLanguageFor, isMarkdown } from './util';
import { MarkdownView } from './MarkdownView';

type EditorInstance = Parameters<OnMount>[0];

/**
 * In-browser code/text editor (Monaco) for a FileVault file. Loads the file's
 * text content, edits it with full VS Code editing, and saves changes as a NEW
 * file version via filevaultApi.saveContent (PUT → new version). For Markdown it
 * offers a live side-by-side preview. Theme follows the app (light / vs-dark).
 */
export function FileEditor({
  file,
  open,
  onClose,
  onSaved,
}: {
  file: FileItem;
  open: boolean;
  onClose: () => void;
  onSaved?: (msg: string) => void;
}) {
  const theme = useTheme();
  const monacoTheme = theme.palette.mode === 'dark' ? 'vs-dark' : 'light';
  const language = useMemo(() => monacoLanguageFor(file.mimetype, file.name), [file.mimetype, file.name]);
  const markdown = isMarkdown(file.mimetype, file.name);

  const [loaded, setLoaded] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [changeDescription, setChangeDescription] = useState('');
  const [fullScreen, setFullScreen] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const dirty = loaded !== null && content !== loaded;
  const editorRef = useRef<EditorInstance | null>(null);
  // Ref so Monaco's Cmd/Ctrl+S command always calls the latest save (avoids a
  // stale closure capturing old content / changeDescription).
  const saveRef = useRef<() => void>(() => {});

  // (Re)load the file's text whenever the dialog opens for a (new) file.
  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoaded(null);
    setContent('');
    setLoadError(null);
    setSaveError(null);
    setChangeDescription('');
    filevaultApi
      .getTextContent(file.id)
      .then((text) => {
        if (!active) return;
        setLoaded(text);
        setContent(text);
      })
      .catch((err) => {
        if (active) setLoadError(toMessage(err));
      });
    return () => {
      active = false;
    };
  }, [open, file.id]);

  const saveMutation = useMutation({
    mutationFn: () =>
      filevaultApi.saveContent(file.id, content, file.name, changeDescription.trim() || undefined),
    onSuccess: () => {
      setLoaded(content); // clears dirty
      setChangeDescription('');
      setSaveError(null);
      onSaved?.('Saved new version');
    },
    onError: (err) => setSaveError(toMessage(err)),
  });

  const canSave = dirty && !saveMutation.isPending && loaded !== null;

  const doSave = useCallback(() => {
    if (dirty && !saveMutation.isPending && loaded !== null) saveMutation.mutate();
  }, [dirty, saveMutation, loaded]);

  // Keep the keybinding pointed at the current save closure.
  useEffect(() => {
    saveRef.current = doSave;
  }, [doSave]);

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveRef.current());
  };

  const requestClose = useCallback(() => {
    if (dirty && !window.confirm('You have unsaved changes. Discard them and close?')) return;
    onClose();
  }, [dirty, onClose]);

  // Word wrap for prose-ish content; off for code so long lines scroll.
  const wordWrap = markdown || language === 'plaintext' ? 'on' : 'off';

  return (
    <Dialog
      open={open}
      onClose={requestClose}
      fullWidth
      maxWidth="lg"
      fullScreen={fullScreen}
      PaperProps={{ sx: { height: fullScreen ? '100%' : '85vh' } }}
    >
      <DialogTitle component="div" sx={{ pb: 1 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography variant="h6" sx={{ wordBreak: 'break-all', flex: 1 }}>
            {file.name}
          </Typography>
          {dirty && <Chip size="small" color="warning" label="● unsaved" />}
          {markdown && (
            <Tooltip title={showPreview ? 'Hide preview' : 'Show preview'}>
              <IconButton size="small" aria-label={showPreview ? 'Hide preview' : 'Show preview'} onClick={() => setShowPreview((v) => !v)}>
                {showPreview ? <VisibilityOffOutlinedIcon fontSize="small" /> : <VisibilityOutlinedIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title={fullScreen ? 'Exit full screen' : 'Full screen'}>
            <IconButton size="small" aria-label={fullScreen ? 'Exit full screen' : 'Full screen'} onClick={() => setFullScreen((v) => !v)}>
              {fullScreen ? <FullscreenExitIcon fontSize="small" /> : <FullscreenIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        </Stack>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {loadError && (
          <Alert severity="error" sx={{ m: 2 }}>
            {loadError}
          </Alert>
        )}
        {saveError && (
          <Alert severity="error" sx={{ m: 2, mb: 0 }} onClose={() => setSaveError(null)}>
            {saveError}
          </Alert>
        )}

        {!loadError && loaded === null && (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1, minHeight: 240 }}>
            <CircularProgress />
          </Box>
        )}

        {!loadError && loaded !== null && (
          <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
            <Box sx={{ flex: 1, minWidth: 0, borderRight: showPreview ? '1px solid' : 0, borderColor: 'divider' }}>
              <Editor
                language={language}
                theme={monacoTheme}
                value={content}
                onChange={(val) => setContent(val ?? '')}
                onMount={handleMount}
                options={{
                  automaticLayout: true,
                  minimap: { enabled: true },
                  wordWrap,
                  fontSize: 13,
                  scrollBeyondLastLine: false,
                }}
              />
            </Box>
            {markdown && showPreview && (
              <Box sx={{ flex: 1, minWidth: 0, overflow: 'auto', p: 1 }}>
                <MarkdownView source={content} />
              </Box>
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 2, py: 1.5 }}>
        <TextField
          size="small"
          label="Change description (optional)"
          value={changeDescription}
          onChange={(e) => setChangeDescription(e.target.value)}
          disabled={loaded === null}
          sx={{ flex: 1, mr: 1 }}
        />
        <Button onClick={requestClose}>Close</Button>
        <Button
          variant="contained"
          startIcon={saveMutation.isPending ? <CircularProgress size={16} color="inherit" /> : <SaveOutlinedIcon />}
          disabled={!canSave}
          onClick={doSave}
        >
          Save version
        </Button>
      </DialogActions>
    </Dialog>
  );
}
