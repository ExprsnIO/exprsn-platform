import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@mui/material';
import PersonAddAltIcon from '@mui/icons-material/PersonAddAlt';
import HowToRegIcon from '@mui/icons-material/HowToReg';
import { timelineApi } from '@/api/timeline';
import { toMessage } from '@/lib/errors';

/**
 * Follow/unfollow toggle backed by the timeline follow graph. Seeds its initial
 * state from GET /interactions/users/:id/follow and invalidates on change.
 */
export function FollowButton({
  userId,
  size = 'small',
  onError,
}: {
  userId: string;
  size?: 'small' | 'medium';
  onError?: (msg: string) => void;
}) {
  const qc = useQueryClient();
  const status = useQuery({
    queryKey: ['follow', userId],
    queryFn: () => timelineApi.followStatus(userId),
  });
  const following = !!status.data?.following;

  const toggle = useMutation({
    mutationFn: (): Promise<unknown> =>
      following ? timelineApi.unfollow(userId) : timelineApi.follow(userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['follow', userId] }),
    onError: (err) => onError?.(toMessage(err)),
  });

  return (
    <Button
      size={size}
      variant={following ? 'outlined' : 'contained'}
      color={following ? 'inherit' : 'primary'}
      startIcon={following ? <HowToRegIcon /> : <PersonAddAltIcon />}
      disabled={status.isLoading || toggle.isPending}
      onClick={() => toggle.mutate()}
    >
      {following ? 'Following' : 'Follow'}
    </Button>
  );
}
