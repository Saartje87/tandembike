import { describe, expect, it } from 'vitest';

import { renderWithTheme } from '../../test/render';
import { ProjectIcon } from './project-icon';

const maskOf = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('[role="presentation"]')?.style
    .maskImage;

describe('ProjectIcon', () => {
  it("draws the Project's icon", () => {
    const { container } = renderWithTheme(
      <ProjectIcon project={{ color: 'teal', icon: 'rocket-launch' }} />,
    );

    expect(maskOf(container)).toBe(
      'url("/heroicons/outline/rocket-launch.svg")',
    );
    expect(container.querySelector('[data-color]')).toHaveAttribute(
      'data-color',
      'teal',
    );
  });

  it('draws a neutral folder for a Project with neither', () => {
    const { container } = renderWithTheme(
      <ProjectIcon project={{ color: null, icon: null }} />,
    );

    expect(maskOf(container)).toBe('url("/heroicons/outline/folder.svg")');
    expect(container.querySelector('[data-color]')).toBeNull();
  });
});
