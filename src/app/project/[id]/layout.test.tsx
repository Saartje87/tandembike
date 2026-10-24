import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithTheme } from '../../../test/render';
import ProjectLayout from './layout';

describe('ProjectLayout', () => {
  it('keeps the Project content alongside the Ticket drawer slot', () => {
    renderWithTheme(
      <ProjectLayout ticket={<div role="dialog">Ticket drawer</div>}>
        <main>Project Board</main>
      </ProjectLayout>,
    );

    expect(screen.getByRole('main')).toHaveTextContent('Project Board');
    expect(screen.getByRole('dialog')).toHaveTextContent('Ticket drawer');
  });
});
