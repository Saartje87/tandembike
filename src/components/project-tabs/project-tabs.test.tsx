import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import {
  useRouter,
  useSearchParams,
  useSelectedLayoutSegments,
} from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createCycle } from '../../app/cycles/actions';
import { mockRouter } from '../../test/navigation';
import { renderWithTheme } from '../../test/render';
import type { Cycle, OpenTicketCounts } from '../../tickets/cycles';
import { ProjectTabs } from './project-tabs';

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
  useSearchParams: vi.fn(),
  useSelectedLayoutSegments: vi.fn(),
}));
vi.mock('../../app/cycles/actions', () => ({ createCycle: vi.fn() }));

const cycle = (
  fields: Pick<Cycle, 'id' | 'title'> & Partial<Cycle>,
): Cycle => ({
  projectId: 3,
  state: 'Prepared',
  ticketNumbers: [],
  createdAt: new Date('2026-01-01'),
  archivedAt: null,
  ...fields,
});

/**
 * Renders the tabs as the Project layout does at `segments` below it, with
 * search parameters `search` and open Ticket counts `counts`.
 */
const renderTabs = (
  cycles: Cycle[],
  segments: string[] = [],
  search = '',
  counts: OpenTicketCounts = { backlog: 0, cycles: {} },
) => {
  vi.mocked(useSelectedLayoutSegments).mockReturnValue(segments);
  vi.mocked(useSearchParams).mockReturnValue(
    new URLSearchParams(search) as ReturnType<typeof useSearchParams>,
  );
  return renderWithTheme(
    <ProjectTabs projectId={3} cycles={cycles} openTicketCounts={counts} />,
  );
};

const tabLinks = () =>
  within(
    screen.getByRole('navigation', { name: 'Project views' }),
  ).getAllByRole('link');

/** Each tab's title, before its badge, with its link and current marker. */
const tabs = () =>
  tabLinks().map((link) => ({
    name: link.firstChild?.textContent,
    href: link.getAttribute('href'),
    current: link.getAttribute('aria-current'),
  }));

describe('ProjectTabs', () => {
  let router: ReturnType<typeof mockRouter>;

  beforeEach(() => {
    router = mockRouter();
    vi.mocked(useRouter).mockReturnValue(router);
    vi.mocked(createCycle).mockReset();
  });

  it('shows a Backlog tab and one tab per Prepared Cycle, marking the current one', () => {
    renderTabs(
      [cycle({ id: 7, title: 'Beta' }), cycle({ id: 8, title: 'Launch' })],
      ['cycle', '8'],
    );

    expect(tabs()).toEqual([
      { name: 'Backlog', href: '/project/3', current: null },
      { name: 'Beta', href: '/project/3/cycle/7', current: null },
      { name: 'Launch', href: '/project/3/cycle/8', current: 'page' },
      { name: 'History', href: '/project/3/cycles', current: null },
      { name: 'Settings', href: '/project/3/settings', current: null },
    ]);
  });

  it("carries a Board filter to the Backlog's and Cycles' tabs, not to the History or Settings", () => {
    renderTabs(
      [cycle({ id: 7, title: 'Beta' })],
      [],
      'q=fix+it&label=bug&label=ui&ticket=12',
    );

    expect(tabs().map(({ href }) => href)).toEqual([
      '/project/3?q=fix+it&label=bug&label=ui',
      '/project/3/cycle/7?q=fix+it&label=bug&label=ui',
      '/project/3/cycles',
      '/project/3/settings',
    ]);
  });

  it('puts the Active Cycle first and leaves Archived ones out', () => {
    renderTabs([
      cycle({ id: 6, title: 'Old', state: 'Archived' }),
      cycle({ id: 7, title: 'Beta' }),
      cycle({ id: 8, title: 'Launch', state: 'Active' }),
    ]);

    expect(tabs().map(({ name }) => name)).toEqual([
      'Backlog',
      'Launch',
      'Beta',
      'History',
      'Settings',
    ]);
  });

  it('marks the History tab current on the History', () => {
    renderTabs([], ['cycles']);

    expect(tabs()).toEqual([
      { name: 'Backlog', href: '/project/3', current: null },
      { name: 'History', href: '/project/3/cycles', current: 'page' },
      { name: 'Settings', href: '/project/3/settings', current: null },
    ]);
  });

  it("marks the History tab current on an Archived Cycle's page", () => {
    renderTabs(
      [
        cycle({ id: 6, title: 'Old', state: 'Archived' }),
        cycle({ id: 7, title: 'Beta' }),
      ],
      ['cycle', '6'],
    );

    expect(tabs()).toEqual([
      { name: 'Backlog', href: '/project/3', current: null },
      { name: 'Beta', href: '/project/3/cycle/7', current: null },
      { name: 'History', href: '/project/3/cycles', current: 'page' },
      { name: 'Settings', href: '/project/3/settings', current: null },
    ]);
  });

  it('marks the Settings tab current on the Settings', () => {
    renderTabs([], ['settings']);

    expect(tabs()).toEqual([
      { name: 'Backlog', href: '/project/3', current: null },
      { name: 'History', href: '/project/3/cycles', current: null },
      { name: 'Settings', href: '/project/3/settings', current: 'page' },
    ]);
  });

  it('marks the Backlog tab current on the Backlog', () => {
    renderTabs([]);

    expect(tabs()).toEqual([
      { name: 'Backlog', href: '/project/3', current: 'page' },
      { name: 'History', href: '/project/3/cycles', current: null },
      { name: 'Settings', href: '/project/3/settings', current: null },
    ]);
  });

  it('shows the open Tickets of the Backlog and each Cycle in a badge, not on the History or Settings', () => {
    renderTabs(
      [
        cycle({ id: 6, title: 'Old', state: 'Archived' }),
        cycle({ id: 7, title: 'Beta' }),
        cycle({ id: 8, title: 'Launch', state: 'Active' }),
      ],
      [],
      '',
      { backlog: 4, cycles: { 7: 0, 8: 1 } },
    );

    expect(
      tabLinks().map((link) => ({
        name: link.firstChild?.textContent,
        badge:
          within(link).queryByText(/^\d+ open Tickets?$/)?.textContent ?? null,
      })),
    ).toEqual([
      { name: 'Backlog', badge: '4 open Tickets' },
      { name: 'Launch', badge: '1 open Ticket' },
      { name: 'Beta', badge: '0 open Tickets' },
      { name: 'History', badge: null },
      { name: 'Settings', badge: null },
    ]);
    expect(screen.getByRole('link', { name: /^Backlog/ })).toHaveTextContent(
      /^Backlog 4/,
    );
  });

  it('shows a badge reading 0 for a Cycle missing from the counts', () => {
    renderTabs([cycle({ id: 7, title: 'Beta' })], [], '', {
      backlog: 2,
      cycles: {},
    });

    expect(screen.getByText('0 open Tickets')).toBeInTheDocument();
  });

  it('creates a Cycle from its title and opens its tab', async () => {
    vi.mocked(createCycle).mockResolvedValue({ ok: true, cycleId: 9 });
    renderTabs([]);

    await userEvent.click(screen.getByRole('button', { name: 'New Cycle' }));
    await userEvent.type(
      screen.getByRole('textbox', { name: 'New Cycle title' }),
      'Launch the beta{Enter}',
    );

    expect(createCycle).toHaveBeenCalledWith({
      projectId: 3,
      title: 'Launch the beta',
    });
    expect(router.push).toHaveBeenCalledWith('/project/3/cycle/9');
    expect(
      screen.queryByRole('textbox', { name: 'New Cycle title' }),
    ).not.toBeInTheDocument();
  });

  it('shows why a new Cycle was refused and keeps the title', async () => {
    vi.mocked(createCycle).mockResolvedValue({
      ok: false,
      error: 'Enter a title.',
      fieldErrors: { title: 'Enter a title.' },
    });
    renderTabs([]);

    await userEvent.click(screen.getByRole('button', { name: 'New Cycle' }));
    const input = screen.getByRole('textbox', { name: 'New Cycle title' });
    await userEvent.type(input, ' {Enter}');

    expect(await screen.findByText('Enter a title.')).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(router.push).not.toHaveBeenCalled();
  });

  it('cancels a new Cycle with Escape', async () => {
    renderTabs([]);

    await userEvent.click(screen.getByRole('button', { name: 'New Cycle' }));
    await userEvent.type(
      screen.getByRole('textbox', { name: 'New Cycle title' }),
      'Beta{Escape}',
    );

    expect(createCycle).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'New Cycle' }),
    ).toBeInTheDocument();
  });
});
