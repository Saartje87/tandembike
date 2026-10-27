import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useRouter, useSelectedLayoutSegments } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createCycle } from '../../app/cycles/actions';
import { mockRouter } from '../../test/navigation';
import { renderWithTheme } from '../../test/render';
import type { Cycle } from '../../tickets/cycles';
import { ProjectTabs } from './project-tabs';

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
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

/** Renders the tabs as the Project layout does at `segments` below it. */
const renderTabs = (cycles: Cycle[], segments: string[] = []) => {
  vi.mocked(useSelectedLayoutSegments).mockReturnValue(segments);
  return renderWithTheme(<ProjectTabs projectId={3} cycles={cycles} />);
};

const tabs = () =>
  within(screen.getByRole('navigation', { name: 'Project views' }))
    .getAllByRole('link')
    .map((link) => ({
      name: link.textContent,
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
