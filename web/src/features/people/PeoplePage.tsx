import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Avatar,
  Box,
  CircularProgress,
  InputAdornment,
  Paper,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { useAppStore } from '@/app/store';
import { usersApi, type PublicUser } from '@/api/users';
import { toMessage } from '@/lib/errors';
import { FollowButton } from './FollowButton';
import { avatarColor, personInitials } from './util';

function PersonRow({ user, isSelf, onError }: { user: PublicUser; isSelf: boolean; onError: (m: string) => void }) {
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack direction="row" spacing={1.5} alignItems="center">
        <Avatar
          src={user.avatarUrl ?? undefined}
          sx={{ bgcolor: avatarColor(user.id), width: 44, height: 44 }}
        >
          {personInitials(user.displayName, user.id)}
        </Avatar>
        <Box
          component={RouterLink}
          to={`/people/${user.id}`}
          sx={{ flex: 1, minWidth: 0, textDecoration: 'none', color: 'inherit' }}
        >
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }} noWrap>
            {user.displayName || 'Unnamed user'}
          </Typography>
          {user.bio && (
            <Typography variant="body2" color="text.secondary" noWrap>
              {user.bio}
            </Typography>
          )}
        </Box>
        {!isSelf && (
          <Box sx={{ flexShrink: 0 }}>
            <FollowButton userId={user.id} onError={onError} />
          </Box>
        )}
      </Stack>
    </Paper>
  );
}

/**
 * People directory — search and browse other users (safe public projection).
 * Each row links to the public profile and offers a follow toggle.
 */
export function PeoplePage() {
  const myId = useAppStore((s) => s.user?.id);
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  // Debounce the search term so we don't query on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearch(input.trim()), 300);
    return () => clearTimeout(t);
  }, [input]);

  const people = useQuery({
    queryKey: ['people', 'directory', search],
    queryFn: () => usersApi.directory({ search: search || undefined, limit: 50 }),
  });

  const users = people.data?.users ?? [];

  return (
    <Stack spacing={2} sx={{ maxWidth: 760, mx: 'auto', pb: 6 }}>
      <Typography variant="h5" component="h1">People</Typography>

      <TextField
        placeholder="Search by name…"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        fullWidth
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" />
            </InputAdornment>
          ),
        }}
      />

      {people.isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress size={28} />
        </Box>
      )}
      {people.isError && <Alert severity="error">{toMessage(people.error)}</Alert>}
      {people.isSuccess && users.length === 0 && (
        <Typography color="text.secondary" sx={{ textAlign: 'center', p: 4 }}>
          {search ? `No people match “${search}”.` : 'No people to show yet.'}
        </Typography>
      )}

      {users.map((u) => (
        <PersonRow key={u.id} user={u} isSelf={u.id === myId} onError={setToast} />
      ))}

      <Snackbar
        open={!!toast}
        autoHideDuration={4000}
        onClose={() => setToast(null)}
        message={toast}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Stack>
  );
}
