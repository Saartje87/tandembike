import { describe, expect, it } from 'vitest';

import {
  boardRoute,
  cyclePath,
  cycleRoute,
  cyclesPath,
  openTicketNumber,
  projectIdFromPath,
  projectPath,
  projectsPath,
  ticketByNumberPath,
  ticketOnBoardPath,
} from './paths';

describe('paths', () => {
  it('puts the Projects list under a plural segment', () => {
    expect(projectsPath()).toBe('/projects');
  });

  it("puts a Project's Board under a singular segment", () => {
    expect(projectPath(3)).toBe('/project/3');
  });

  it('puts a Cycle under its Project', () => {
    expect(cyclePath(3, 7)).toBe('/project/3/cycle/7');
  });

  it("puts a Project's archived Cycles under a plural segment", () => {
    expect(cyclesPath(3)).toBe('/project/3/cycles');
  });

  it('finds a Ticket by its number alone', () => {
    expect(ticketByNumberPath(12)).toBe('/ticket/12');
  });

  it('names the route patterns that revalidatePath takes', () => {
    expect(boardRoute).toBe('/project/[id]');
    expect(cycleRoute).toBe('/project/[id]/cycle/[cycleId]');
  });
});

describe('projectIdFromPath', () => {
  it.each([
    ['/project/2', 2],
    ['/project/2/cycles', 2],
    ['/project/2/cycle/4', 2],
    ['/projects', undefined],
    ['/projects/2', undefined],
    ['/ticket/7', undefined],
    ['/', undefined],
  ])('reads the Project on screen from %s', (pathname, id) => {
    expect(projectIdFromPath(pathname)).toBe(id);
  });

  it('opens a Ticket on a Board through a ?ticket= parameter', () => {
    expect(ticketOnBoardPath('/project/3', 12)).toBe('/project/3?ticket=12');
    expect(ticketOnBoardPath('/project/3/cycle/7', 12)).toBe(
      '/project/3/cycle/7?ticket=12',
    );
  });

  it.each([
    ['12', 12],
    [undefined, undefined],
    ['', undefined],
    ['abc', undefined],
    ['1.5', undefined],
    ['-2', undefined],
    [['12', '13'], undefined],
  ])('reads ?ticket=%j as %j', (value, expected) => {
    expect(openTicketNumber(value)).toBe(expected);
  });
});
