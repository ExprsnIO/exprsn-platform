import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, Outlet } from 'react-router-dom';
import { RouteErrorBoundary } from './RouteErrorBoundary';

function Boom(): never {
  throw new Error('kaboom-test');
}

afterEach(() => vi.restoreAllMocks());

describe('RouteErrorBoundary', () => {
  it('renders a contained error panel when a route element throws during render', async () => {
    // React logs caught render errors via console.error — silence for clean output.
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const router = createMemoryRouter(
      [{ path: '/', element: <Boom />, errorElement: <RouteErrorBoundary /> }],
      { initialEntries: ['/'] },
    );
    render(<RouterProvider router={router} />);

    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('kaboom-test')).toBeInTheDocument(); // the thrown message
    expect(screen.getByRole('button', { name: /reload page/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /go home/i })).toBeInTheDocument();
  });

  it('keeps the surrounding layout mounted (boundary scoped to the Outlet)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const Shell = () => (
      <div>
        <nav>NAVBAR</nav>
        <Outlet />
      </div>
    );
    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: <Shell />,
          children: [{ index: true, element: <Boom />, errorElement: <RouteErrorBoundary /> }],
        },
      ],
      { initialEntries: ['/'] },
    );
    render(<RouterProvider router={router} />);

    // Page crashed → boundary shows, but the shell/nav above the Outlet survives.
    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('NAVBAR')).toBeInTheDocument();
  });
});
