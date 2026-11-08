// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { statusLine } from './status-line';

const tool = (name: string, input: unknown) => ({
  role: 'tool' as const,
  text: `${name} ${JSON.stringify(input)}`,
  permissionRules: null,
});

describe('statusLine', () => {
  describe('tool entries with columns', () => {
    it('reads the name and input rather than the text', () => {
      expect(
        statusLine({
          role: 'tool',
          text: 'unrelated',
          permissionRules: null,
          toolName: 'Read',
          toolInput: { file_path: '/repo/src/board.tsx' },
        }),
      ).toBe('Reading board.tsx');
    });

    it('reads a long input in full', () => {
      expect(
        statusLine({
          role: 'tool',
          text: 'Bash {"command":"x"',
          permissionRules: null,
          toolName: 'mcp__tandembike__get_ticket',
          toolInput: { number: 1066, pad: 'y'.repeat(2000) },
        }),
      ).toBe('Reading T1066');
    });

    it('falls back to the text when the input was over the cap', () => {
      expect(
        statusLine({
          role: 'tool',
          text: 'Write {"file_path":"/repo/c.ts","content":"xxx',
          permissionRules: null,
          toolName: 'Write',
          toolInput: null,
        }),
      ).toBe('Writing c.ts');
    });
  });

  describe('tool entries', () => {
    it.each([
      ['Read', { file_path: '/repo/src/board.tsx' }, 'Reading board.tsx'],
      [
        'Edit',
        { file_path: '/repo/src/a.ts', old_string: 'x' },
        'Editing a.ts',
      ],
      ['MultiEdit', { file_path: '/repo/b.ts', edits: [] }, 'Editing b.ts'],
      ['Write', { file_path: '/repo/c.ts', content: 'x' }, 'Writing c.ts'],
      ['Grep', { pattern: 'isStalled' }, 'Searching isStalled'],
      ['Glob', { pattern: 'src/**/*.ts' }, 'Finding src/**/*.ts'],
      [
        'Bash',
        { command: 'npm run check', description: 'Check everything' },
        'Running Check everything',
      ],
      ['Bash', { command: 'npm run check' }, 'Running npm run check'],
      ['Skill', { skill: 'tdd' }, 'Using tdd'],
      [
        'Agent',
        { description: 'Explore the board' },
        'Delegating Explore the board',
      ],
      [
        'WebFetch',
        { url: 'https://example.com' },
        'Fetching https://example.com',
      ],
      [
        'WebSearch',
        { query: 'vitest fake timers' },
        'Searching vitest fake timers',
      ],
    ])('maps %s %j to "%s"', (name, input, line) => {
      expect(statusLine(tool(name, input))).toBe(line);
    });

    it.each([
      ['get_ticket', { number: 42 }, 'Reading T42'],
      ['update_ticket', { number: 42, status: 'Done' }, 'Updating T42'],
      ['add_note', { number: 42, body: 'Hi' }, 'Commenting on T42'],
      ['start_work', { number: 42 }, 'Starting T42'],
      ['file_tickets', { tickets: [] }, 'Creating Tickets'],
      ['find_tickets', {}, 'Listing Tickets'],
      ['check_criterion', { number: 3 }, 'Checking criteria of T3'],
      ['create_cycle', { title: 'A' }, 'Creating a Cycle'],
    ])('maps the Tandembike tool %s %j to "%s"', (name, input, line) => {
      expect(statusLine(tool(`mcp__tandembike__${name}`, input))).toBe(line);
    });

    it('falls back to a humanised name for an unknown Tandembike tool', () => {
      expect(statusLine(tool('mcp__tandembike__frobnicate_ticket', {}))).toBe(
        'Frobnicate ticket',
      );
    });

    it('gives the bare name and first string value of an unmapped tool', () => {
      expect(
        statusLine(tool('NotebookRead', { limit: 3, path: 'a.ipynb' })),
      ).toBe('NotebookRead a.ipynb');
      expect(statusLine(tool('Mystery', {}))).toBe('Mystery');
    });

    it('reads input that was cut off at 300 characters', () => {
      const text = `Read {"file_path":"/repo/src/components/board/board.tsx","offset":10,"li`;
      expect(statusLine({ role: 'tool', text, permissionRules: null })).toBe(
        'Reading board.tsx',
      );
      expect(
        statusLine({
          role: 'tool',
          text: 'Bash {"command":"npm run check && echo a very lo',
          permissionRules: null,
        }),
      ).toBe('Running npm run check && echo a very lo');
    });

    it('gives only the verb when the target is missing', () => {
      expect(statusLine(tool('Read', {}))).toBe('Reading');
    });
  });

  it('gives the first sentence of an agent entry', () => {
    expect(
      statusLine({
        role: 'agent',
        text: 'Now I will fix the board.\nThen the tests.',
        permissionRules: null,
      }),
    ).toBe('Now I will fix the board.');
    expect(
      statusLine({
        role: 'agent',
        text: 'No full stop here\nsecond',
        permissionRules: null,
      }),
    ).toBe('No full stop here');
  });

  it('gives the first rule of a permission entry, else the tool name', () => {
    expect(
      statusLine({
        role: 'permission',
        text: 'Bash {"command":"rm x"}',
        permissionRules: ['Bash(rm:*)', 'Bash(ls:*)'],
      }),
    ).toBe('Bash(rm:*)');
    expect(
      statusLine({
        role: 'permission',
        text: 'Bash {"command":"rm x"}',
        permissionRules: null,
      }),
    ).toBe('Bash');
  });

  it('gives the first question of a question entry', () => {
    expect(
      statusLine({
        role: 'question',
        text: 'Which one?\nAnd then?',
        permissionRules: null,
      }),
    ).toBe('Which one?');
  });

  it('gives the error of an error entry', () => {
    expect(
      statusLine({
        role: 'error',
        text: 'The Agent crashed.',
        permissionRules: null,
      }),
    ).toBe('The Agent crashed.');
  });

  it('says Starting for the prompt and what was created for a created entry', () => {
    expect(
      statusLine({ role: 'user', text: 'Do it', permissionRules: null }),
    ).toBe('Starting');
    expect(
      statusLine({
        role: 'created',
        text: 'Created T1, T2',
        permissionRules: null,
      }),
    ).toBe('Created T1, T2');
  });

  it('says Starting without an entry', () => {
    expect(statusLine(null)).toBe('Starting');
  });
});
