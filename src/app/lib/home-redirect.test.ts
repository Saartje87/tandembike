import { describe, expect, it } from 'vitest';

import { homeRedirect } from './home-redirect';

const project = (id: number, name: string, archived = false) => ({
  id,
  name,
  color: null,
  icon: null,
  archived,
  createdAt: new Date('2026-01-01'),
});

describe('homeRedirect', () => {
  it("goes to the first Project's Board", () => {
    expect(homeRedirect([project(3, 'Website'), project(1, 'App')])).toBe(
      '/project/3',
    );
  });

  it('skips archived Projects', () => {
    expect(
      homeRedirect([project(3, 'Old site', true), project(1, 'App')]),
    ).toBe('/project/1');
  });

  it('goes to the Projects page when every Project is archived', () => {
    expect(homeRedirect([project(3, 'Old site', true)])).toBe('/projects');
  });

  it('stays on the first-run prompt when there are no Projects', () => {
    expect(homeRedirect([])).toBeUndefined();
  });
});
