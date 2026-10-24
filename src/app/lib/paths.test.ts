import { describe, expect, it } from 'vitest';

import {
  boardRoute,
  projectIdFromPath,
  projectPath,
  projectsPath,
  ticketByNumberPath,
  ticketPath,
  ticketRoute,
} from './paths';

describe('paths', () => {
  it('puts the Projects list under a plural segment', () => {
    expect(projectsPath()).toBe('/projects');
  });

  it("puts a Project's Board under a singular segment", () => {
    expect(projectPath(3)).toBe('/project/3');
  });

  it('puts a Ticket under its Project', () => {
    expect(ticketPath(3, 12)).toBe('/project/3/ticket/12');
  });

  it('finds a Ticket by its number alone', () => {
    expect(ticketByNumberPath(12)).toBe('/ticket/12');
  });

  it('names the route patterns that revalidatePath takes', () => {
    expect(boardRoute).toBe('/project/[id]');
    expect(ticketRoute).toBe('/project/[id]/ticket/[number]');
  });
});

describe('projectIdFromPath', () => {
  it.each([
    ['/project/2', 2],
    ['/project/2/ticket/7', 2],
    ['/projects', undefined],
    ['/projects/2', undefined],
    ['/ticket/7', undefined],
    ['/', undefined],
  ])('reads the Project on screen from %s', (pathname, id) => {
    expect(projectIdFromPath(pathname)).toBe(id);
  });
});
