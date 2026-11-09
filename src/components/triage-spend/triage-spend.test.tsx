import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithTheme } from '../../test/render';
import { TriageSpend } from './triage-spend';

describe('TriageSpend', () => {
  it("shows today's triage spend against the ceiling", () => {
    renderWithTheme(
      <TriageSpend spendUsd={0.5} ceilingUsd={2} paused={false} />,
    );

    expect(
      screen.getByText('Triage today: $0.50 of $2.00'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/paused/)).not.toBeInTheDocument();
  });

  it('says triage is paused once the spend reaches the ceiling', () => {
    renderWithTheme(<TriageSpend spendUsd={2} ceilingUsd={2} paused />);

    expect(
      screen.getByText('Triage today: $2.00 of $2.00'),
    ).toBeInTheDocument();
    expect(screen.getByText('triage paused: over ceiling')).toBeInTheDocument();
  });
});
