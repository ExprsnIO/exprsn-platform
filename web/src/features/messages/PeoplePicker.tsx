import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Autocomplete, Avatar, Box, CircularProgress, Stack, TextField, Typography } from '@mui/material';
import { usersApi, type PublicUser } from '@/api/users';
import { initials } from './util';

/**
 * Type-ahead multi-select over the public people directory. Used to pick
 * recipients when starting a conversation or adding participants. Selected
 * users are merged into the option list so MUI never warns about a value that
 * isn't in the current (search-filtered) options.
 */
export function PeoplePicker({
  selected,
  onChange,
  excludeIds = [],
  label = 'Add people',
  placeholder = 'Search by name…',
}: {
  selected: PublicUser[];
  onChange: (users: PublicUser[]) => void;
  excludeIds?: string[];
  label?: string;
  placeholder?: string;
}) {
  const [input, setInput] = useState('');
  const q = useQuery({
    queryKey: ['people', 'directory', input],
    queryFn: () => usersApi.directory({ search: input || undefined, limit: 20 }),
  });

  const fetched = (q.data?.users ?? []).filter((u) => !excludeIds.includes(u.id));
  // Merge selected (may not be in the current search results) so the control
  // can always render its value.
  const byId = new Map<string, PublicUser>();
  [...selected, ...fetched].forEach((u) => byId.set(u.id, u));
  const options = [...byId.values()];

  return (
    <Autocomplete
      multiple
      options={options}
      value={selected}
      filterSelectedOptions
      loading={q.isLoading}
      isOptionEqualToValue={(o, v) => o.id === v.id}
      getOptionLabel={(u) => u.displayName || u.id.slice(0, 8)}
      onInputChange={(_e, v) => setInput(v)}
      onChange={(_e, v) => onChange(v)}
      renderOption={(props, u) => (
        <Box component="li" {...props} key={u.id}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Avatar src={u.avatarUrl ?? undefined} sx={{ width: 28, height: 28, fontSize: 12 }}>
              {initials(u.displayName || u.id)}
            </Avatar>
            <Box>
              <Typography variant="body2">{u.displayName || u.id.slice(0, 8)}</Typography>
              {u.bio && (
                <Typography variant="caption" color="text.secondary" noWrap>
                  {u.bio}
                </Typography>
              )}
            </Box>
          </Stack>
        </Box>
      )}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder={placeholder}
          InputProps={{
            ...params.InputProps,
            endAdornment: (
              <>
                {q.isLoading ? <CircularProgress size={16} /> : null}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
        />
      )}
    />
  );
}
