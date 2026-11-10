// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithTheme } from '../../test/render';
import { FlowArrow } from './flow-arrow';

describe('FlowArrow', () => {
  it('draws, with its label when given', () => {
    renderWithTheme(<FlowArrow label="ready-for-agent" />);

    expect(screen.getByText('ready-for-agent')).toBeInTheDocument();
  });
});
