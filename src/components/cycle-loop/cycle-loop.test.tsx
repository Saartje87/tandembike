import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithTheme } from '../../test/render';
import { CycleLoop } from './cycle-loop';

const step = (title: string) => screen.getByRole('region', { name: title });

describe('CycleLoop', () => {
  it('draws the loop from Backlog to Archive, marking the steps that are yours', () => {
    renderWithTheme(
      <CycleLoop backlogPath="/project/1" prepared={[]} active={null} />,
    );

    expect(
      screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent),
    ).toEqual([
      'Backlog',
      'Plan',
      'Plan by hand',
      'Prepared Cycle',
      'Start the Cycle',
      'Autopilot dispatches',
      'Complete',
      'Retro',
      'Archive',
    ]);
    expect(
      within(step('Start the Cycle')).getByText('You'),
    ).toBeInTheDocument();
    expect(within(step('Archive')).getByText('You')).toBeInTheDocument();
    expect(
      within(step('Plan')).getByText(/only proposes a Prepared Cycle/),
    ).toBeInTheDocument();
  });

  it("names the Project's Cycles at their steps, linking to their Boards", () => {
    renderWithTheme(
      <CycleLoop
        backlogPath="/project/1"
        prepared={[
          { id: 8, title: 'Launch', path: '/project/1/cycle/8' },
          { id: 9, title: 'Later', path: '/project/1/cycle/9' },
        ]}
        active={{ id: 7, title: 'Beta', path: '/project/1/cycle/7' }}
      />,
    );

    expect(
      within(step('Prepared Cycle'))
        .getAllByRole('link')
        .map((link) => [link.textContent, link.getAttribute('href')]),
    ).toEqual([
      ['Launch', '/project/1/cycle/8'],
      ['Later', '/project/1/cycle/9'],
    ]);
    expect(
      within(step('Autopilot dispatches')).getByRole('link', { name: 'Beta' }),
    ).toHaveAttribute('href', '/project/1/cycle/7');
  });

  it('says when there is no Prepared or Active Cycle', () => {
    renderWithTheme(
      <CycleLoop backlogPath="/project/1" prepared={[]} active={null} />,
    );

    expect(
      within(step('Prepared Cycle')).getByText(/No Prepared Cycle now/),
    ).toBeInTheDocument();
    expect(
      within(step('Autopilot dispatches')).getByText(/No Active Cycle now/),
    ).toBeInTheDocument();
  });
});
