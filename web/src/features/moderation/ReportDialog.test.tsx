import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReportDialog } from './ReportDialog';
import { REPORT_REASONS } from '@/api/reports';
import { ApiError } from '@/lib/http';

// Mock only the network call; keep the real REPORT_REASONS list.
const createMock = vi.fn();
vi.mock('@/api/reports', async () => {
  const actual = await vi.importActual<typeof import('@/api/reports')>('@/api/reports');
  return { ...actual, reportsApi: { create: (...args: unknown[]) => createMock(...args) } };
});

function renderDialog() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <ReportDialog
        open
        onClose={onClose}
        contentType="post"
        contentId="post-42"
        sourceService="timeline"
        contentLabel="post"
      />
    </QueryClientProvider>,
  );
  return { onClose };
}

describe('ReportDialog', () => {
  beforeEach(() => {
    createMock.mockReset();
  });

  it('renders every reason option from the static ENUM', () => {
    renderDialog();
    for (const r of REPORT_REASONS) {
      expect(screen.getByText(r.label)).toBeInTheDocument();
    }
    // Submit is disabled until a reason is chosen.
    expect(screen.getByRole('button', { name: /submit report/i })).toBeDisabled();
  });

  it('submits the selected reason + details and never sends reportedBy', async () => {
    createMock.mockResolvedValue({ success: true, report: { id: 'r1', status: 'open' } });
    renderDialog();

    fireEvent.click(screen.getByRole('radio', { name: /harassment or bullying/i }));
    fireEvent.change(screen.getByLabelText(/additional details/i), {
      target: { value: 'this is abusive' },
    });
    fireEvent.click(screen.getByRole('button', { name: /submit report/i }));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    const payload = createMock.mock.calls[0][0];
    expect(payload).toEqual({
      contentType: 'post',
      contentId: 'post-42',
      sourceService: 'timeline',
      reason: 'harassment',
      details: 'this is abusive',
    });
    expect(payload).not.toHaveProperty('reportedBy');

    // Confirmation state.
    expect(await screen.findByText(/report received/i)).toBeInTheDocument();
  });

  it('treats a 409 duplicate as an "already reported" confirmation, not an error', async () => {
    createMock.mockRejectedValue(new ApiError(409, { error: 'ALREADY_REPORTED' }));
    renderDialog();

    fireEvent.click(screen.getByRole('radio', { name: /spam or misleading/i }));
    fireEvent.click(screen.getByRole('button', { name: /submit report/i }));

    expect(await screen.findByText(/you have already reported this post/i)).toBeInTheDocument();
    // Confirmation, not an error alert.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
