// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithTheme } from '../../test/render';
import { FlowConnector } from './flow-connector';

describe('FlowConnector', () => {
  it('draws each branch with its label', () => {
    renderWithTheme(
      <FlowConnector
        branches={[
          { key: 'a', label: 'ready-for-agent', children: <p>Queued</p> },
          { key: 'b', label: 'ready-for-human', children: <p>Your work</p> },
        ]}
      />,
    );

    expect(screen.getByText('ready-for-agent')).toBeInTheDocument();
    expect(screen.getByText('Your work')).toBeInTheDocument();
  });
});
