import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp, signInAs } from '@/test/render-app';

describe('sign-in and role routing', () => {
  it('sends signed-out visitors to the demo sign-in', async () => {
    renderApp('/');
    expect(
      await screen.findByRole('heading', {
        name: 'Sign in to the demonstration',
      }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: 'Prevention officer' }),
    ).toBeInTheDocument();
  });

  it('signs an officer in to the officer workspace with only their portfolio', async () => {
    const { user } = renderApp('/sign-in');
    const officers = await screen.findByRole('region', {
      name: 'Prevention officer',
    });
    await user.click(
      within(officers).getByRole('button', { name: /Prevention Officer A/ }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Assigned work', level: 1 }),
    ).toBeInTheDocument();
    const portfolio = await screen.findByRole('table', {
      name: 'Assigned institutions by quarter',
    });
    expect(within(portfolio).getAllByRole('rowheader')).toHaveLength(4);
    expect(within(portfolio).queryByText('DEMO-005')).not.toBeInTheDocument();
  });

  it('lands an institution user on its own obligations with deadlines in EAT', async () => {
    await signInAs('focal-demo-003');
    renderApp('/institution');
    expect(
      await screen.findByRole('heading', {
        name: 'What is due and what needs attention',
      }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText('Demo County Licensing Office'),
    ).toBeInTheDocument();
    expect(
      await screen.findAllByText(/15 Oct 2026, 23:59 EAT/),
    ).not.toHaveLength(0);
  });

  it('refuses another role’s area', async () => {
    await signInAs('focal-demo-001');
    renderApp('/admin');
    expect(
      await screen.findByRole('heading', {
        name: "You don't have access to this page",
      }),
    ).toBeInTheDocument();
  });

  it('returns a visitor to the requested page after sign-in', async () => {
    const { user, router } = renderApp('/supervisor');
    const supervisors = await screen.findByRole('region', {
      name: 'Supervisor',
    });
    await user.click(
      within(supervisors).getByRole('button', { name: /Supervisor/ }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Oversight overview' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/supervisor');
  });
});
