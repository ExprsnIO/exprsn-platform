/**
 * Read-only Office viewer (docx + xlsx). Fetches the file as an ArrayBuffer:
 *   - docx → mammoth.convertToHtml → sanitized HTML render.
 *   - xlsx → SheetJS (XLSX.read → sheet_to_html), with a sheet selector when the
 *     workbook has more than one sheet.
 * Both render into a styled container; rendering happens entirely client-side.
 */
import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, CircularProgress, MenuItem, TextField } from '@mui/material';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { filevaultApi, type FileItem } from '@/api/filevault';

/** Defensively strip <script>/<style> + inline event handlers from generated HTML. */
function sanitize(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '');
}

function isDocx(file: FileItem): boolean {
  return (
    /\.docx$/i.test(file.name) ||
    file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  );
}

const sheetSx = {
  '& table': { borderCollapse: 'collapse', width: '100%', fontSize: 13 },
  '& td,& th': { border: '1px solid', borderColor: 'divider', px: 1, py: 0.5, whiteSpace: 'nowrap' },
};

const docSx = {
  color: 'text.primary',
  lineHeight: 1.6,
  '& h1,& h2,& h3': { fontWeight: 700, mt: 2, mb: 1 },
  '& p': { my: 1 },
  '& table': { borderCollapse: 'collapse', my: 1 },
  '& td,& th': { border: '1px solid', borderColor: 'divider', px: 1, py: 0.5 },
  '& img': { maxWidth: '100%' },
  '& ul,& ol': { pl: 3, my: 1 },
};

export function OfficeView({ file }: { file: FileItem }) {
  const docx = isDocx(file);
  const [buffer, setBuffer] = useState<ArrayBuffer | null>(null);
  const [failed, setFailed] = useState(false);

  // docx state
  const [docHtml, setDocHtml] = useState<string | null>(null);
  // xlsx state
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [sheet, setSheet] = useState<string>('');

  useEffect(() => {
    let active = true;
    setBuffer(null);
    setFailed(false);
    setDocHtml(null);
    setWorkbook(null);
    filevaultApi
      .getArrayBuffer(file.id)
      .then((buf) => {
        if (active) setBuffer(buf);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [file.id]);

  useEffect(() => {
    if (!buffer) return;
    let active = true;
    if (docx) {
      mammoth
        .convertToHtml({ arrayBuffer: buffer })
        .then((res) => {
          if (active) setDocHtml(sanitize(res.value));
        })
        .catch(() => {
          if (active) setFailed(true);
        });
    } else {
      try {
        const wb = XLSX.read(buffer, { type: 'array' });
        setWorkbook(wb);
        setSheet(wb.SheetNames[0] ?? '');
      } catch {
        setFailed(true);
      }
    }
    return () => {
      active = false;
    };
  }, [buffer, docx]);

  const sheetHtml = useMemo(() => {
    if (!workbook || !sheet) return '';
    const ws = workbook.Sheets[sheet];
    return ws ? sanitize(XLSX.utils.sheet_to_html(ws)) : '';
  }, [workbook, sheet]);

  if (failed) {
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        Couldn’t render this document.
      </Alert>
    );
  }

  if (!buffer || (docx ? docHtml === null : workbook === null)) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 240 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (docx) {
    return (
      <Box
        sx={{ p: 2, maxHeight: '70vh', overflow: 'auto', ...docSx }}
        dangerouslySetInnerHTML={{ __html: docHtml ?? '' }}
      />
    );
  }

  return (
    <Box sx={{ p: 2 }}>
      {workbook!.SheetNames.length > 1 && (
        <TextField
          select
          size="small"
          label="Sheet"
          value={sheet}
          onChange={(e) => setSheet(e.target.value)}
          sx={{ mb: 1.5, minWidth: 180 }}
        >
          {workbook!.SheetNames.map((n) => (
            <MenuItem key={n} value={n}>
              {n}
            </MenuItem>
          ))}
        </TextField>
      )}
      <Box
        sx={{ maxHeight: '64vh', overflow: 'auto', ...sheetSx }}
        dangerouslySetInnerHTML={{ __html: sheetHtml }}
      />
    </Box>
  );
}
