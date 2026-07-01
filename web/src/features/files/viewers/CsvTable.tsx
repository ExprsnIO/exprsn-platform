/**
 * Read-only CSV/TSV table. Fetches the file as decoded text, parses it with
 * papaparse (no header inference — the first row is treated as the header), and
 * renders an MUI Table. Large files are capped at MAX_ROWS with a notice.
 */
import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import Papa from 'papaparse';
import { filevaultApi, type FileItem } from '@/api/filevault';

const MAX_ROWS = 500;

export function CsvTable({ file }: { file: FileItem }) {
  const [rows, setRows] = useState<string[][] | null>(null);
  const [total, setTotal] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setRows(null);
    setFailed(false);
    filevaultApi
      .getTextContent(file.id)
      .then((text) => {
        if (!active) return;
        const parsed = Papa.parse<string[]>(text, { header: false, skipEmptyLines: true });
        const data = (parsed.data as string[][]).filter((r) => Array.isArray(r));
        setTotal(data.length);
        setRows(data.slice(0, MAX_ROWS + 1)); // +1 so the header doesn't eat into the row cap
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

  if (!rows) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 240 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (rows.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>
        Empty file.
      </Typography>
    );
  }

  const [header, ...body] = rows;
  const cols = header.length;
  const shownDataRows = Math.min(body.length, MAX_ROWS);
  const truncated = total - 1 > shownDataRows; // total includes the header row

  return (
    <Box sx={{ p: 1 }}>
      <TableContainer sx={{ maxHeight: '64vh' }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              {header.map((cell, i) => (
                <TableCell key={i} sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                  {cell}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {body.slice(0, MAX_ROWS).map((row, r) => (
              <TableRow key={r} hover>
                {Array.from({ length: cols }).map((_, c) => (
                  <TableCell key={c} sx={{ whiteSpace: 'nowrap' }}>
                    {row[c] ?? ''}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {truncated && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', p: 1 }}>
          Showing {shownDataRows} of {total - 1} rows.
        </Typography>
      )}
    </Box>
  );
}
