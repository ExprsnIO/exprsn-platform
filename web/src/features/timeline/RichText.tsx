/**
 * Body renderer for post / comment text. When `markdown` is on it renders GFM
 * via react-markdown (which does NOT emit raw HTML by default, so it is safe
 * against embedded <script>/HTML injection). When off, it renders the raw text
 * with preserved whitespace. Sizing is compact and inherits the surrounding
 * Typography colour so it drops into cards and comment rows unchanged.
 */
import { Box } from '@mui/material';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function RichText({
  text,
  markdown,
  dense = false,
}: {
  text: string;
  markdown: boolean;
  dense?: boolean;
}) {
  if (!markdown) {
    return (
      <Box
        component="div"
        sx={{
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          fontSize: dense ? '0.875rem' : '0.95rem',
          lineHeight: 1.5,
        }}
      >
        {text}
      </Box>
    );
  }

  return (
    <Box
      sx={{
        color: 'text.primary',
        wordBreak: 'break-word',
        fontSize: dense ? '0.875rem' : '0.95rem',
        lineHeight: 1.55,
        // Tight vertical rhythm so a one-line comment stays one line tall.
        '& > :first-of-type': { mt: 0 },
        '& > :last-child': { mb: 0 },
        '& p': { my: 0.5 },
        '& h1,& h2,& h3,& h4': { mt: 1, mb: 0.5, fontWeight: 700, lineHeight: 1.3 },
        '& h1': { fontSize: '1.3rem' },
        '& h2': { fontSize: '1.15rem' },
        '& h3': { fontSize: '1.05rem' },
        '& a': { color: 'primary.main' },
        '& code': {
          fontFamily: 'monospace',
          bgcolor: 'action.hover',
          px: 0.5,
          borderRadius: 0.5,
          fontSize: '0.85em',
        },
        '& pre': { bgcolor: 'action.hover', p: 1.5, borderRadius: 1, overflow: 'auto', my: 1 },
        '& pre code': { bgcolor: 'transparent', p: 0 },
        '& blockquote': {
          borderLeft: '3px solid',
          borderColor: 'divider',
          pl: 1.5,
          ml: 0,
          color: 'text.secondary',
          my: 0.5,
        },
        '& table': { borderCollapse: 'collapse', my: 1 },
        '& th,& td': { border: '1px solid', borderColor: 'divider', px: 1, py: 0.5, textAlign: 'left' },
        '& img': { maxWidth: '100%', borderRadius: 1 },
        '& ul,& ol': { pl: 2.5, my: 0.5 },
        '& li': { my: 0.25 },
      }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Force safe link behaviour on any user-authored anchor.
          a: ({ node: _node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer nofollow ugc" />
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </Box>
  );
}
