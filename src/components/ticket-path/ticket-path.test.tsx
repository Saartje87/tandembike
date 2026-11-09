import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithTheme } from '../../test/render';
import { TicketPath, type TicketPathProps } from './ticket-path';

const counts = {
  queued: 3,
  yourWork: 1,
  inFlight: 2,
  actionNeeded: 1,
  review: 4,
  done: 5,
};

const renderPath = (props: Partial<TicketPathProps> = {}) =>
  renderWithTheme(
    <TicketPath
      backlogPath="/project/1"
      backlogIntake={2}
      activeCycle={{ path: '/project/1/cycle/7', counts }}
      autoMerge={false}
      {...props}
    />,
  );

/** The step headed `title`. */
const step = (title: string) => screen.getByRole('region', { name: title });

describe('TicketPath', () => {
  it('draws the steps from New Ticket to Done, with the split at triage', () => {
    renderPath();

    expect(
      screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent),
    ).toEqual([
      'New Ticket',
      'Intake',
      'Triage',
      'Queued',
      'Your work',
      'In flight',
      'Review',
      'Merge gate',
      'Done',
    ]);
    expect(screen.getByText('ready-for-agent')).toBeInTheDocument();
    expect(screen.getByText('ready-for-human')).toBeInTheDocument();
  });

  it('names who acts and the Board section at each step', () => {
    renderPath();

    expect(within(step('Queued')).getByText('Autopilot')).toBeInTheDocument();
    expect(
      within(step('Queued')).getByText('Board: Queued'),
    ).toBeInTheDocument();
    expect(within(step('Review')).getByText('You')).toBeInTheDocument();
    expect(
      within(step('Intake')).getByText('Board: Needs you → Intake'),
    ).toBeInTheDocument();
  });

  it("links each count to its section, Intake on the Backlog and the rest on the Active Cycle's Board", () => {
    renderPath();

    const link = (title: string) => within(step(title)).getByRole('link');
    expect(link('Intake')).toHaveTextContent('2 Tickets');
    expect(link('Intake')).toHaveAttribute('href', '/project/1#intake');
    expect(link('Queued')).toHaveTextContent('3 Tickets');
    expect(link('Queued')).toHaveAttribute('href', '/project/1/cycle/7#queued');
    expect(link('Your work')).toHaveAttribute(
      'href',
      '/project/1/cycle/7#your-work',
    );
    expect(link('In flight')).toHaveAttribute(
      'href',
      '/project/1/cycle/7#in-flight',
    );
    expect(link('Review')).toHaveTextContent('4 Tickets');
    expect(link('Done')).toHaveAttribute('href', '/project/1/cycle/7#done');
  });

  it('carries the Epic note at Queued and the approval at the Merge gate', () => {
    renderPath();

    expect(
      within(step('Queued')).getByText(
        /An Epic is queued once it has children/,
      ),
    ).toBeInTheDocument();
    expect(
      within(step('Merge gate')).getByText(
        /never merges its own pull request: you approve each merge/,
      ),
    ).toBeInTheDocument();
  });

  it('says a run merges its own pull request with Auto-merge on', () => {
    renderPath({ autoMerge: true });

    expect(
      within(step('Merge gate')).getByText(/Auto-merge is on/),
    ).toBeInTheDocument();
  });

  it('shows no Cycle counts without an Active Cycle', () => {
    renderPath({ activeCycle: null });

    expect(within(step('Queued')).queryByRole('link')).not.toBeInTheDocument();
    expect(
      within(step('Queued')).getByText(/No Active Cycle/),
    ).toBeInTheDocument();
  });
});
