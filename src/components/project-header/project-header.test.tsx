// @vitest-environment jsdom
import { atoms } from '@blockle/blocks';
import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithTheme } from '../../test/render';
import type { Project } from '../../tickets/tickets';
import { tintBackground } from '../palette/palette.css';
import { ProjectHeader } from './project-header';

vi.mock('next/navigation', () => ({
  usePathname: () => '/project/3',
  useSearchParams: () => new URLSearchParams(),
}));

const project: Project = {
  id: 3,
  name: 'Website',
  color: null,
  icon: null,
  archived: false,
  createdAt: new Date('2026-01-01'),
};

const header = () => screen.getByRole('region', { name: 'Website' });
const padding = atoms({ paddingBlock: 2, paddingInline: 3 }).split(' ');

describe('ProjectHeader', () => {
  it("shows the Project's name and what is under it, with no band without a colour", () => {
    renderWithTheme(
      <ProjectHeader project={project}>
        <nav>Tabs</nav>
      </ProjectHeader>,
    );

    expect(
      within(header()).getByRole('heading', { level: 1, name: 'Website' }),
    ).toBeInTheDocument();
    expect(within(header()).getByText('Tabs')).toBeInTheDocument();
    expect(header()).not.toHaveAttribute('data-color');
  });

  it("tints the header with the Project's colour", () => {
    renderWithTheme(<ProjectHeader project={{ ...project, color: 'teal' }} />);

    expect(header()).toHaveAttribute('data-color', 'teal');
    expect(header()).toHaveClass(tintBackground.teal);
  });

  it.each([
    ['without', null],
    ['with', 'teal'],
  ] as const)('pads the header the same %s a colour', (_, color) => {
    renderWithTheme(<ProjectHeader project={{ ...project, color }} />);

    expect(header()).toHaveClass(...padding);
  });

  it('offers no rename, colour or icon editing, and links to the Settings', () => {
    renderWithTheme(<ProjectHeader project={{ ...project, icon: 'star' }} />);

    expect(
      within(header()).queryByRole('button', { name: 'Colour and icon' }),
    ).toBeNull();
    expect(within(header()).queryByRole('button')).toBeNull();
    expect(
      within(header()).getByRole('link', { name: 'Project settings' }),
    ).toHaveAttribute('href', '/project/3/settings?section=general');
  });
});
