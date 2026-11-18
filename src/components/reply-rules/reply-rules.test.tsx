// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithTheme } from '../../test/render';
import { ReplyRules } from './reply-rules';

describe('ReplyRules (ADR 0054)', () => {
  it("shows the Project's Reply rules, keeping their lines, with a link to edit them", () => {
    renderWithTheme(
      <ReplyRules
        rules={'Approve copy choices.\nEscalate schema changes.'}
        settingsHref="/project/3/settings#reply-rules"
      />,
    );

    const region = screen.getByRole('region', { name: 'Reply rules' });
    expect(region).toHaveTextContent(
      'Approve copy choices. Escalate schema changes.',
    );
    expect(
      screen.getByRole('link', { name: 'Edit in Settings' }),
    ).toHaveAttribute('href', '/project/3/settings#reply-rules');
  });

  it('says Auto-reply follows its defaults without any', () => {
    renderWithTheme(
      <ReplyRules
        rules={null}
        settingsHref="/project/3/settings#reply-rules"
      />,
    );

    expect(
      screen.getByRole('region', { name: 'Reply rules' }),
    ).toHaveTextContent('None: Auto-reply follows its defaults.');
  });
});
