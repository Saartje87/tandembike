import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithTheme } from '../../test/render';
import { ProjectFrame } from './project-frame';

vi.mock('next/navigation', () => ({ useRouter: vi.fn() }));
vi.mock('../../app/projects/actions', () => ({
  renameProject: vi.fn(),
  styleProject: vi.fn(),
}));
vi.mock('../../app/cycles/actions', () => ({ createCycle: vi.fn() }));

const project = {
  id: 3,
  name: 'Website',
  color: null,
  icon: null,
  createdAt: new Date('2026-01-01'),
};

describe('ProjectFrame', () => {
  it("shows the Project's name and tabs, with History current, above its content", () => {
    renderWithTheme(
      <ProjectFrame project={project} cycles={[]}>
        <p>Archived Cycles</p>
      </ProjectFrame>,
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'Website' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'History' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByText('Archived Cycles')).toBeInTheDocument();
  });
});
