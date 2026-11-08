// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { connectMcpClient } from '../test/mcp';
import { createTestTickets } from '../test/tickets';
import {
  findRemovedToolMentions,
  guardedPaths,
  removedToolNames,
} from './removed-tools';
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const repository = process.cwd();

const describeMentions = (
  mentions: ReturnType<typeof findRemovedToolMentions>,
) => mentions.map(({ file, line, name }) => `${file}:${line} ${name}`);

describe('removed MCP tool names', () => {
  it('appear in no skill, agent doc, repository instruction, run brief or Retro prompt', () => {
    expect(describeMentions(findRemovedToolMentions(repository))).toEqual([]);
  });

  it('are reported with file and line when planted in a copy', () => {
    const copy = mkdtempSync(join(tmpdir(), 'removed-tools-'));
    for (const path of guardedPaths) {
      try {
        cpSync(join(repository, path), join(copy, path), { recursive: true });
      } catch {
        // A guarded path this checkout lacks has nothing to copy.
      }
    }
    mkdirSync(join(copy, 'docs/agents'), { recursive: true });
    writeFileSync(
      join(copy, 'docs/agents/planted.md'),
      'Fine line.\nThen call claim_ticket first.\n',
    );
    writeFileSync(join(copy, 'CLAUDE.md'), 'Use list_tickets to find work.\n');

    expect(describeMentions(findRemovedToolMentions(copy))).toEqual([
      'docs/agents/planted.md:2 claim_ticket',
      'CLAUDE.md:1 list_tickets',
    ]);
  });

  it('are not offered by the server', async () => {
    const client = await connectMcpClient(createTestTickets());

    const { tools } = await client.listTools();

    const offered = tools.map((tool) => tool.name);
    expect(removedToolNames.filter((name) => offered.includes(name))).toEqual(
      [],
    );
    await client.close();
  });
});
