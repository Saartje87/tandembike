// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { CapHolder } from '../../autopilot/explanation';
import { renderWithTheme } from '../../test/render';
import { PauseReasons } from './pause-reasons';

const holder = (fields: Partial<CapHolder>): CapHolder => ({
  conversationId: 1,
  projectId: 3,
  projectName: 'Tandembike',
  intent: 'start',
  terminal: false,
  ticketNumber: null,
  title: null,
  waitingOnUser: false,
  lastActivity: new Date(Date.now() - 22 * 60 * 60 * 1000),
  ...fields,
});

const capFull = (holders: CapHolder[]) => {
  renderWithTheme(
    <PauseReasons
      projectId={3}
      autopilot={{
        state: 'paused',
        reasons: [{ type: 'machineCapFull', cap: holders.length, holders }],
      }}
      autoTriage={{
        state: 'paused',
        reasons: [{ type: 'machineCapFull', cap: holders.length, holders }],
      }}
    />,
  );
  return screen.getByRole('region', { name: 'Autopilot' });
};

describe('PauseReasons', () => {
  it('lists every run a full machine cap counts, from any Project, with its state and last activity (T1521)', () => {
    const autopilot = capFull([
      holder({
        conversationId: 4,
        ticketNumber: 12,
        title: 'Build it',
        waitingOnUser: true,
      }),
      holder({
        conversationId: 8,
        projectId: 6,
        projectName: 'Wrockle',
        intent: 'spar',
        title: 'Pricing',
        waitingOnUser: true,
      }),
      holder({
        conversationId: 9,
        intent: 'start',
        terminal: true,
        ticketNumber: 5,
        title: 'In a terminal',
      }),
      holder({ conversationId: 11, intent: 'ask' }),
    ]);

    const runs = within(
      within(autopilot).getByRole('list', { name: 'Runs counted' }),
    )
      .getAllByRole('listitem')
      .map((item) => item.textContent);
    expect(runs).toEqual([
      'Start T12 “Build it” in Tandembike: waiting on you, last active 22 hours ago. Answer it to let it go on, or close it.',
      'Spar “Pricing” in Wrockle: waiting on you, last active 22 hours ago. Close it if you are done with it: idle, it still counts.',
      'Terminal Start T5 “In a terminal” in Tandembike: working in your terminal, last active 22 hours ago. End the session in your terminal to free it.',
      'Ask Conversation 11 in Tandembike: working, last active 22 hours ago. Wait for it to finish, or stop it.',
    ]);
  });

  it('links each run to where it can be answered, closed or stopped (T1521)', () => {
    const autopilot = capFull([
      holder({ conversationId: 4, ticketNumber: 12, title: 'Build it' }),
      holder({
        conversationId: 8,
        projectId: 6,
        projectName: 'Wrockle',
        intent: 'spar',
        title: 'Pricing',
        waitingOnUser: true,
      }),
      holder({ conversationId: 9, terminal: true, ticketNumber: 5 }),
    ]);

    expect(
      within(autopilot).getByRole('link', { name: 'Start T12 “Build it”' }),
    ).toHaveAttribute('href', '/project/3/flow?conversation=4');
    expect(
      within(autopilot).getByRole('link', { name: 'Spar “Pricing”' }),
    ).toHaveAttribute('href', '/project/6/spar/8');
    expect(
      within(autopilot).queryByRole('link', { name: /T5/ }),
    ).not.toBeInTheDocument();
  });

  it('lists the same runs under Auto-triage (T1521)', () => {
    capFull([holder({ conversationId: 4, ticketNumber: 12, title: 'A' })]);

    const triage = screen.getByRole('region', { name: 'Auto-triage' });
    expect(
      within(triage).getByRole('link', { name: 'Start T12 “A”' }),
    ).toBeInTheDocument();
  });
});
