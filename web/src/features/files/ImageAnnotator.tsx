import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import TextFieldsOutlinedIcon from '@mui/icons-material/TextFieldsOutlined';
import CropOutlinedIcon from '@mui/icons-material/CropOutlined';
import UndoOutlinedIcon from '@mui/icons-material/UndoOutlined';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import { filevaultApi, type FileItem } from '@/api/filevault';
import { toMessage } from '@/lib/errors';

type Tool = 'pen' | 'text' | 'crop';

interface Point {
  x: number;
  y: number;
}

/** An ordered, replayable annotation operation. The base image + this list fully
 *  describe the canvas, so undo is just "pop and re-render from scratch". */
type Op =
  | { kind: 'stroke'; color: string; width: number; points: Point[] }
  | { kind: 'text'; color: string; size: number; text: string; at: Point }
  // A crop changes the base for subsequent ops: it captures the cropped pixels
  // (as an ImageBitmap-able canvas) and the new dimensions.
  | { kind: 'crop'; image: HTMLCanvasElement; width: number; height: number };

// Concrete hex (not var()) because these are baked into exported canvas pixels;
// values mirror the Unified tokens: danger, warning, accent-green, info,
// accent-purple, black, white.
const SWATCHES = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#0a0a0a', '#ffffff'];
const STROKE_WIDTHS = [2, 4, 8, 14];

/**
 * Open an image from FileVault, mark it up (freehand pen, text, crop) on a native
 * <canvas>, and save the flattened result as a NEW VERSION of the file.
 *
 * Undo model: we keep the loaded base image plus an ordered list of operations and
 * re-render the whole canvas from scratch on every change. Undo simply pops the
 * last op. A crop produces a new base (a snapshot canvas) so later ops draw onto
 * the cropped image — and because each crop captures pixels, undoing back past it
 * still works by replaying the remaining ops over the original base.
 */
export function ImageAnnotator({
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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // The originally-loaded image, used as the render base until a crop replaces it.
  const baseRef = useRef<HTMLImageElement | null>(null);
  const opsRef = useRef<Op[]>([]);
  // Force re-render of toolbar state (undo enabled, etc.) without re-rendering canvas.
  const [opCount, setOpCount] = useState(0);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState<string>('#ef4444');
  const [strokeWidth, setStrokeWidth] = useState<number>(4);

  // In-progress pen stroke and crop rectangle (live, not yet committed to ops).
  const drawingRef = useRef<Op | null>(null);
  const cropRectRef = useRef<{ start: Point; end: Point } | null>(null);

  // Pending text placement: where the user clicked + the typed value.
  const [textAnchor, setTextAnchor] = useState<Point | null>(null);
  const [textValue, setTextValue] = useState('');

  /** Resolve the current render base: the most recent crop snapshot, else the image. */
  const currentBase = useCallback((): {
    draw: HTMLImageElement | HTMLCanvasElement | null;
    width: number;
    height: number;
  } => {
    const ops = opsRef.current;
    for (let i = ops.length - 1; i >= 0; i -= 1) {
      const op = ops[i];
      if (op.kind === 'crop') return { draw: op.image, width: op.width, height: op.height };
    }
    const img = baseRef.current;
    return { draw: img, width: img?.naturalWidth ?? 0, height: img?.naturalHeight ?? 0 };
  }, []);

  /** Re-render the canvas from the base image + all ops (plus any live op). */
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const base = currentBase();
    if (!base.draw) return;

    // Size the canvas to the current base (native resolution preserved).
    if (canvas.width !== base.width || canvas.height !== base.height) {
      canvas.width = base.width;
      canvas.height = base.height;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(base.draw, 0, 0, base.width, base.height);

    // Replay ops that come AFTER the last crop (the crop already baked in earlier ops).
    const ops = opsRef.current;
    let startIdx = 0;
    for (let i = ops.length - 1; i >= 0; i -= 1) {
      if (ops[i].kind === 'crop') {
        startIdx = i + 1;
        break;
      }
    }

    const paint = (op: Op) => {
      if (op.kind === 'stroke') {
        if (op.points.length === 0) return;
        ctx.save();
        ctx.strokeStyle = op.color;
        ctx.lineWidth = op.width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(op.points[0].x, op.points[0].y);
        for (let i = 1; i < op.points.length; i += 1) ctx.lineTo(op.points[i].x, op.points[i].y);
        ctx.stroke();
        ctx.restore();
      } else if (op.kind === 'text') {
        ctx.save();
        ctx.fillStyle = op.color;
        ctx.font = `${op.size}px sans-serif`;
        ctx.textBaseline = 'top';
        ctx.fillText(op.text, op.at.x, op.at.y);
        ctx.restore();
      }
    };

    for (let i = startIdx; i < ops.length; i += 1) paint(ops[i]);

    // Live (uncommitted) pen stroke.
    const live = drawingRef.current;
    if (live && live.kind === 'stroke') paint(live);

    // Live crop rectangle overlay.
    const rect = cropRectRef.current;
    if (rect) {
      const x = Math.min(rect.start.x, rect.end.x);
      const y = Math.min(rect.start.y, rect.end.y);
      const w = Math.abs(rect.end.x - rect.start.x);
      const h = Math.abs(rect.end.y - rect.start.y);
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      // Dim everything outside the selection.
      ctx.fillRect(0, 0, canvas.width, y);
      ctx.fillRect(0, y, x, h);
      ctx.fillRect(x + w, y, canvas.width - (x + w), h);
      ctx.fillRect(0, y + h, canvas.width, canvas.height - (y + h));
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1, canvas.width / 400);
      ctx.setLineDash([8, 6]);
      ctx.strokeRect(x, y, w, h);
      ctx.restore();
    }
  }, [currentBase]);

  // Load the image when the dialog opens; revoke the object URL on close/unmount.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let objectUrl: string | null = null;

    setLoading(true);
    setLoadError(null);
    setSaveError(null);
    opsRef.current = [];
    drawingRef.current = null;
    cropRectRef.current = null;
    setTextAnchor(null);
    setTextValue('');
    setOpCount(0);

    (async () => {
      try {
        objectUrl = await filevaultApi.getFileObjectUrl(file.id);
        const img = new Image();
        img.onload = () => {
          if (cancelled) return;
          baseRef.current = img;
          setLoading(false);
          // Render after state flush so the canvas element exists.
          requestAnimationFrame(() => render());
        };
        img.onerror = () => {
          if (cancelled) return;
          setLoadError('Could not load this image.');
          setLoading(false);
        };
        img.src = objectUrl;
      } catch (err) {
        if (!cancelled) {
          setLoadError(toMessage(err));
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, file.id, render]);

  /** Map a pointer event's client coords to canvas (native-resolution) coords. */
  const toCanvasPoint = useCallback((e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }, []);

  const commitOp = useCallback(
    (op: Op) => {
      opsRef.current = [...opsRef.current, op];
      setOpCount(opsRef.current.length);
      render();
    },
    [render],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (loading || loadError) return;
      const p = toCanvasPoint(e);
      if (tool === 'pen') {
        e.currentTarget.setPointerCapture(e.pointerId);
        drawingRef.current = { kind: 'stroke', color, width: strokeWidth, points: [p] };
        render();
      } else if (tool === 'crop') {
        e.currentTarget.setPointerCapture(e.pointerId);
        cropRectRef.current = { start: p, end: p };
        render();
      } else if (tool === 'text') {
        // Place the text cursor; the inline TextField handles the value.
        setTextAnchor(p);
        setTextValue('');
      }
    },
    [loading, loadError, toCanvasPoint, tool, color, strokeWidth, render],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const p = toCanvasPoint(e);
      if (tool === 'pen' && drawingRef.current && drawingRef.current.kind === 'stroke') {
        drawingRef.current.points.push(p);
        render();
      } else if (tool === 'crop' && cropRectRef.current) {
        cropRectRef.current.end = p;
        render();
      }
    },
    [toCanvasPoint, tool, render],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (tool === 'pen' && drawingRef.current && drawingRef.current.kind === 'stroke') {
        const stroke = drawingRef.current;
        drawingRef.current = null;
        if (stroke.points.length > 1) commitOp(stroke);
        else render();
      } else if (tool === 'crop' && cropRectRef.current) {
        const rect = cropRectRef.current;
        cropRectRef.current = null;
        const x = Math.round(Math.min(rect.start.x, rect.end.x));
        const y = Math.round(Math.min(rect.start.y, rect.end.y));
        const w = Math.round(Math.abs(rect.end.x - rect.start.x));
        const h = Math.round(Math.abs(rect.end.y - rect.start.y));
        if (w > 4 && h > 4) {
          // Snapshot the current fully-rendered canvas, then cut out the rect.
          const canvas = canvasRef.current;
          if (canvas) {
            const snap = document.createElement('canvas');
            snap.width = w;
            snap.height = h;
            const sctx = snap.getContext('2d');
            if (sctx) {
              sctx.drawImage(canvas, x, y, w, h, 0, 0, w, h);
              commitOp({ kind: 'crop', image: snap, width: w, height: h });
            }
          }
        } else {
          render();
        }
      }
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    },
    [tool, commitOp, render],
  );

  const placeText = useCallback(() => {
    if (textAnchor && textValue.trim()) {
      commitOp({
        kind: 'text',
        color,
        size: Math.max(12, strokeWidth * 6),
        text: textValue,
        at: textAnchor,
      });
    }
    setTextAnchor(null);
    setTextValue('');
  }, [textAnchor, textValue, color, strokeWidth, commitOp]);

  const undo = useCallback(() => {
    if (opsRef.current.length === 0) return;
    opsRef.current = opsRef.current.slice(0, -1);
    setOpCount(opsRef.current.length);
    render();
  }, [render]);

  const handleClose = useCallback(() => {
    setTextAnchor(null);
    onClose();
  }, [onClose]);

  const save = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const mime =
      file.mimetype === 'image/png' || file.mimetype === 'image/jpeg' ? file.mimetype : 'image/png';
    setSaving(true);
    setSaveError(null);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setSaving(false);
          setSaveError('Could not export the image.');
          return;
        }
        filevaultApi
          .saveContent(file.id, blob, file.name, 'Annotated')
          .then(() => {
            setSaving(false);
            onSaved?.('Saved annotated version');
            handleClose();
          })
          .catch((err) => {
            setSaving(false);
            setSaveError(toMessage(err));
          });
      },
      mime,
      0.92,
    );
  }, [file.id, file.name, file.mimetype, onSaved, handleClose]);

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="lg">
      <DialogTitle sx={{ wordBreak: 'break-all' }}>Annotate — {file.name}</DialogTitle>
      <DialogContent dividers sx={{ p: 0 }}>
        {/* Toolbar */}
        <Stack
          direction="row"
          spacing={1.5}
          alignItems="center"
          flexWrap="wrap"
          useFlexGap
          sx={{ p: 1.5 }}
        >
          <ToggleButtonGroup
            size="small"
            exclusive
            value={tool}
            onChange={(_e, v: Tool | null) => v && setTool(v)}
          >
            <ToggleButton value="pen" aria-label="pen">
              <Tooltip title="Pen (freehand)">
                <BrushOutlinedIcon fontSize="small" />
              </Tooltip>
            </ToggleButton>
            <ToggleButton value="text" aria-label="text">
              <Tooltip title="Text">
                <TextFieldsOutlinedIcon fontSize="small" />
              </Tooltip>
            </ToggleButton>
            <ToggleButton value="crop" aria-label="crop">
              <Tooltip title="Crop">
                <CropOutlinedIcon fontSize="small" />
              </Tooltip>
            </ToggleButton>
          </ToggleButtonGroup>

          <Divider orientation="vertical" flexItem />

          {/* Colour swatches + custom picker */}
          <Stack direction="row" spacing={0.5} alignItems="center">
            {SWATCHES.map((c) => (
              <Box
                key={c}
                onClick={() => setColor(c)}
                sx={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  bgcolor: c,
                  cursor: 'pointer',
                  border: '2px solid',
                  borderColor: color === c ? 'primary.main' : 'divider',
                  boxShadow: c === '#ffffff' ? 'inset 0 0 0 1px color-mix(in srgb, var(--exprsn-black) 20%, transparent)' : undefined,
                }}
              />
            ))}
            <Box
              component="input"
              type="color"
              value={color}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setColor(e.target.value)}
              aria-label="Custom colour"
              sx={{
                width: 28,
                height: 28,
                p: 0,
                border: 'none',
                bgcolor: 'transparent',
                cursor: 'pointer',
              }}
            />
          </Stack>

          <Divider orientation="vertical" flexItem />

          {/* Stroke / text size */}
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Typography variant="caption" color="text.secondary">
              Width
            </Typography>
            {STROKE_WIDTHS.map((w) => (
              <Box
                key={w}
                onClick={() => setStrokeWidth(w)}
                sx={{
                  width: 30,
                  height: 30,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 1,
                  cursor: 'pointer',
                  border: '1px solid',
                  borderColor: strokeWidth === w ? 'primary.main' : 'divider',
                  bgcolor: strokeWidth === w ? 'action.selected' : 'transparent',
                }}
              >
                <Box sx={{ width: 18, height: w, borderRadius: 4, bgcolor: 'text.primary' }} />
              </Box>
            ))}
          </Stack>

          <Box sx={{ flex: 1 }} />

          <Tooltip title="Undo last action">
            <span>
              <IconButton size="small" onClick={undo} disabled={opCount === 0}>
                <UndoOutlinedIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>

        <Divider />

        {saveError && (
          <Alert severity="error" sx={{ m: 2 }}>
            {saveError}
          </Alert>
        )}
        {loadError && (
          <Alert severity="error" sx={{ m: 2 }}>
            {loadError}
          </Alert>
        )}

        {/* Canvas stage */}
        <Box
          sx={{
            position: 'relative',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            bgcolor: 'black',
            minHeight: 320,
            maxHeight: '70vh',
            overflow: 'auto',
            p: 1,
          }}
        >
          {loading && <CircularProgress sx={{ color: 'common.white' }} />}
          {!loading && !loadError && (
            <Box sx={{ position: 'relative', display: 'inline-block' }}>
              <Box
                component="canvas"
                ref={canvasRef}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                sx={{
                  display: 'block',
                  maxWidth: '100%',
                  maxHeight: '66vh',
                  objectFit: 'contain',
                  touchAction: 'none',
                  cursor: tool === 'text' ? 'text' : 'crosshair',
                }}
              />
              {/* Inline text entry anchored where the user clicked. */}
              {textAnchor && (
                <Box sx={{ position: 'absolute', left: 8, bottom: 8, right: 8 }}>
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{ bgcolor: 'background.paper', p: 1, borderRadius: 1, boxShadow: 3 }}
                  >
                    <TextField
                      autoFocus
                      size="small"
                      fullWidth
                      placeholder="Type, then Enter to place"
                      value={textValue}
                      onChange={(e) => setTextValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          placeText();
                        } else if (e.key === 'Escape') {
                          setTextAnchor(null);
                          setTextValue('');
                        }
                      }}
                    />
                    <Button variant="contained" size="small" onClick={placeText}>
                      Add
                    </Button>
                    <Button
                      size="small"
                      onClick={() => {
                        setTextAnchor(null);
                        setTextValue('');
                      }}
                    >
                      Cancel
                    </Button>
                  </Stack>
                </Box>
              )}
            </Box>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Typography variant="caption" color="text.secondary" sx={{ mr: 'auto', ml: 1 }}>
          {opCount} change{opCount === 1 ? '' : 's'}
        </Typography>
        <Button onClick={handleClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="contained"
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveOutlinedIcon />}
          onClick={save}
          disabled={saving || loading || !!loadError}
        >
          Save version
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default ImageAnnotator;
