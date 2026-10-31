import { describe, expect, it } from 'vitest';

import {
  archivedProjectsPath,
  attachmentPath,
  boardFilterOf,
  boardPathOf,
  boardRoute,
  conversationOnBoardPath,
  cyclePath,
  cycleRoute,
  cyclesPath,
  filteredBoardPath,
  openConversationId,
  openTicketNumber,
  projectIdFromPath,
  projectPath,
  projectSettingsPath,
  projectsPath,
  statsPath,
  ticketByNumberPath,
  ticketOnBoardPath,
} from './paths';

describe('paths', () => {
  it('puts the Projects list under a plural segment', () => {
    expect(projectsPath()).toBe('/projects');
  });

  it('puts the Stats page at its own top-level segment', () => {
    expect(statsPath()).toBe('/stats');
  });

  it('puts the archived Projects under the Projects list', () => {
    expect(archivedProjectsPath()).toBe('/projects/archived');
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

  it("puts a Project's settings under its own segment", () => {
    expect(projectSettingsPath(3)).toBe('/project/3/settings');
  });

  it('serves an Attachment under a singular segment', () => {
    expect(attachmentPath(9)).toBe('/attachment/9');
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

  it("names a Backlog's or a Cycle's Board", () => {
    expect(boardPathOf(3, null)).toBe('/project/3');
    expect(boardPathOf(3, 7)).toBe('/project/3/cycle/7');
  });

  it('opens a Ticket on a Board through a ?ticket= parameter', () => {
    expect(ticketOnBoardPath('/project/3', 12)).toBe('/project/3?ticket=12');
    expect(ticketOnBoardPath('/project/3/cycle/7', 12)).toBe(
      '/project/3/cycle/7?ticket=12',
    );
  });

  it('narrows a Board by a Board filter through ?q= and one ?label= per Label', () => {
    expect(
      filteredBoardPath('/project/3', {
        query: 'fix header',
        labels: ['bug', 'ui'],
      }),
    ).toBe('/project/3?q=fix+header&label=bug&label=ui');
  });

  it('leaves a blank search and an empty filter out of a Board path', () => {
    expect(filteredBoardPath('/project/3', { query: '  ', labels: [] })).toBe(
      '/project/3',
    );
    expect(
      filteredBoardPath('/project/3/cycle/7', { query: '', labels: ['bug'] }),
    ).toBe('/project/3/cycle/7?label=bug');
  });

  it('opens a Ticket on a filtered Board, keeping the filter', () => {
    expect(
      ticketOnBoardPath('/project/3', 12, { query: 'fix', labels: ['bug'] }),
    ).toBe('/project/3?q=fix&label=bug&ticket=12');
  });

  it.each([
    [undefined, undefined, { query: '', labels: [] }],
    ['fix', 'bug', { query: 'fix', labels: ['bug'] }],
    [
      ['fix', 'more'],
      ['bug', 'UI', 'bug'],
      { query: 'fix', labels: ['bug', 'ui'] },
    ],
    ['x', ['', ' '], { query: 'x', labels: [] }],
  ])('reads ?q=%j&label=%j as a Board filter', (q, label, expected) => {
    expect(boardFilterOf(q, label)).toEqual(expected);
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

  it('opens a Conversation over a Board with ?conversation=, keeping the filter', () => {
    expect(conversationOnBoardPath('/project/3', 9)).toBe(
      '/project/3?conversation=9',
    );
    expect(
      conversationOnBoardPath('/project/3/cycle/7', 9, {
        query: 'a b',
        labels: ['bug'],
      }),
    ).toBe('/project/3/cycle/7?q=a+b&label=bug&conversation=9');
  });

  it('links a Conversation back to the Ticket it replaced with from=', () => {
    expect(conversationOnBoardPath('/project/3', 9, undefined, 12)).toBe(
      '/project/3?conversation=9&from=12',
    );
  });

  it.each([
    ['9', 9],
    ['0', undefined],
    ['abc', undefined],
    [undefined, undefined],
    [['1', '2'], undefined],
  ])('reads ?conversation=%j as %j', (value, expected) => {
    expect(openConversationId(value)).toBe(expected);
  });
});
