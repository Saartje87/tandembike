// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { findRemovedToolMentions } from '../mcp/removed-tools';
import { agentStages, playbookPluginName } from '../tickets/agent-commands';
import { defaultSkills } from '../tickets/skills';
import {
  currentPlaybookLock,
  hashPlaybook,
  playbookLockFile,
  playbookPath,
  readPlaybookLock,
} from './playbook';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** The skill of every Stage that sends an agent command. */
const stageSkills = agentStages.map(({ skill }) => skill);

const frontmatterOf = (skill: string): Record<string, string> => {
  const text = readFileSync(
    join(playbookPath, 'skills', skill, 'SKILL.md'),
    'utf8',
  );
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  expect(match, `${skill}/SKILL.md starts with frontmatter`).not.toBeNull();
  return Object.fromEntries(
    (match?.[1] ?? '').split('\n').map((line) => {
      const colon = line.indexOf(':');
      return [line.slice(0, colon), line.slice(colon + 1).trim()];
    }),
  );
};

describe('The Playbook plugin', () => {
  const manifest = JSON.parse(
    readFileSync(join(playbookPath, '.claude-plugin/plugin.json'), 'utf8'),
  );

  it('is named tandembike and has a version', () => {
    expect(manifest.name).toBe('tandembike');
    expect(manifest.name).toBe(playbookPluginName);
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('keeps the mattpocock-skills MIT notice in its LICENSE', () => {
    const license = readFileSync(join(playbookPath, 'LICENSE'), 'utf8');
    expect(license).toContain('MIT License');
    expect(license).toContain('Matt Pocock');
  });

  it('has a skill for each Stage it ships, switched off for the model', () => {
    for (const skill of stageSkills) {
      const frontmatter = frontmatterOf(skill);
      expect(frontmatter.name).toBe(skill);
      expect(frontmatter.description).not.toBe('');
      expect(frontmatter['disable-model-invocation']).toBe('true');
    }
  });

  it('has a review skill the model can invoke', () => {
    const frontmatter = frontmatterOf('review');
    expect(frontmatter.name).toBe('review');
    expect(frontmatter.description).not.toBe('');
    expect(frontmatter).not.toHaveProperty('disable-model-invocation');
  });

  it('has a plan skill that proposes a Prepared Cycle and never starts one (T1248)', () => {
    const text = readFileSync(
      join(playbookPath, 'skills/plan/SKILL.md'),
      'utf8',
    );
    for (const tool of ['find_tickets', 'get_ticket', 'create_cycle']) {
      expect(text).toContain(tool);
    }
    expect(text).toContain('ready-for-agent');
    expect(text).toContain('Blockers come first');
    expect(text).toContain('AskUserQuestion');
    expect(text).toMatch(/never start a Cycle/);
    expect(text).not.toContain('propose_cycle');
  });

  it("ships every default Skill a new Project's Conversations offer (T1229)", () => {
    expect(defaultSkills).not.toEqual([]);
    for (const command of defaultSkills) {
      expect(command).not.toMatch(/^\/mattpocock-skills/);
      const prefix = `/${playbookPluginName}:`;
      expect(command.startsWith(prefix), command).toBe(true);
      const skill = command.slice(prefix.length);
      expect(
        existsSync(join(playbookPath, 'skills', skill, 'SKILL.md')),
        `${command} has a skill in playbook/skills`,
      ).toBe(true);
    }
  });

  it('names no MCP tool that was removed', () => {
    const mentions = findRemovedToolMentions(process.cwd(), ['playbook']);
    expect(
      mentions.map(({ file, line, name }) => `${file}:${line} ${name}`),
    ).toEqual([]);
  });
});

describe('The Playbook version guard', () => {
  it('passes when the lock records the files and version as they are', () => {
    const lock = readPlaybookLock();
    const current = currentPlaybookLock();
    const howToUpdate =
      'Bump "version" in playbook/.claude-plugin/plugin.json when the Playbook changed, then run `npm run playbook:lock` and commit playbook/playbook.lock.json.';
    if (lock.version === current.version) {
      expect(
        current.hash,
        `The Playbook's files changed but its version is still ${current.version}. ${howToUpdate}`,
      ).toBe(lock.hash);
    } else {
      expect(
        lock,
        `The Playbook's version changed without an updated lock. ${howToUpdate}`,
      ).toEqual(current);
    }
  });

  it('fails when a file changes and the version stays', () => {
    const copy = mkdtempSync(join(tmpdir(), 'playbook-'));
    cpSync(playbookPath, copy, { recursive: true });
    const before = hashPlaybook(copy);
    writeFileSync(join(copy, 'skills/implement/SKILL.md'), 'changed');
    expect(hashPlaybook(copy)).not.toBe(before);
  });

  it('leaves the lock file out of the hash', () => {
    const copy = mkdtempSync(join(tmpdir(), 'playbook-'));
    cpSync(playbookPath, copy, { recursive: true });
    const before = hashPlaybook(copy);
    writeFileSync(join(copy, playbookLockFile), '{}');
    expect(hashPlaybook(copy)).toBe(before);
  });
});
