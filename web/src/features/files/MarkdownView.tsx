/**
 * Rendered Markdown view (GFM). Shared by FilePreview (read-only render) and
 * FileEditor (live side-by-side preview). react-markdown does NOT render raw
 * HTML by default, so this is safe against embedded <script>/HTML injection.
 */
import { Box } from '@mui/material';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function MarkdownView({ source }: { source: string }) {
  return (
    <Box
      sx={{
        px: 1,
        color: 'text.primary',
        lineHeight: 1.6,
        wordBreak: 'break-word',
        '& h1,& h2,& h3': { mt: 2, mb: 1, fontWeight: 700 },
        '& h1': { fontSize: '1.6rem' },
        '& h2': { fontSize: '1.35rem' },
        '& h3': { fontSize: '1.15rem' },
        '& p': { my: 1 },
        '& a': { color: 'primary.main' },
        '& code': { fontFamily: 'monospace', bgcolor: 'action.hover', px: 0.5, borderRadius: 0.5, fontSize: '0.85em' },
        '& pre': { bgcolor: 'action.hover', p: 1.5, borderRadius: 1, overflow: 'auto' },
        '& pre code': { bgcolor: 'transparent', p: 0 },
        '& blockquote': { borderLeft: '3px solid', borderColor: 'divider', pl: 2, color: 'text.secondary', my: 1 },
        '& table': { borderCollapse: 'collapse', my: 1, width: '100%' },
        '& th,& td': { border: '1px solid', borderColor: 'divider', px: 1, py: 0.5, textAlign: 'left' },
        '& img': { maxWidth: '100%' },
        '& ul,& ol': { pl: 3, my: 1 },
      }}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{source}</ReactMarkdown>
    </Box>
  );
}
