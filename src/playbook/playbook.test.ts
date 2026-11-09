// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { findRemovedToolMentions } from '../mcp/removed-tools';
import { agentStages, playbookPluginName } from '../tickets/agent-commands';
import {
  currentPlaybookLock,
  hashPlaybook,
  playbookLockFile,
  playbookPath,
  readPlaybookLock,
} from './playbook';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * The skills the Playbook ships so far. Each Stage's ticket adds its skill
 * here and to `playbook/skills/`.
 */
const shippedStageSkills = ['implement', 'spec'];

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
    for (const skill of shippedStageSkills) {
      const frontmatter = frontmatterOf(skill);
      expect(frontmatter.name).toBe(skill);
      expect(frontmatter.description).not.toBe('');
      expect(frontmatter['disable-model-invocation']).toBe('true');
    }
  });

  it('ships only skills a Stage runs, plus the review skill', () => {
    const stageSkills = agentStages.map(({ skill }) => skill);
    for (const skill of shippedStageSkills) {
      expect([...stageSkills, 'review']).toContain(skill);
    }
  });

  it('names no MCP tool that was removed', () => {
    const mentions = findRemovedToolMentions(process.cwd(), ['playbook']);
    expect(
      mentions.map(({ file, line, name }) => `${file}:${line} ${name}`),
    ).toEqual([]);
  });

  it('has an implement skill that uses the workflow tools and hands off', () => {
    const text = readFileSync(
      join(playbookPath, 'skills/implement/SKILL.md'),
      'utf8',
    );
    for (const tool of [
      'start_work',
      'check_criterion',
      'open_pr',
      'abandon_work',
    ]) {
      expect(text).toContain(tool);
    }
    expect(text).toContain('handOff: true');
    expect(text).toContain('t<number>-<slug>');
  });

  it('has a spec skill that grills, checks seams and publishes only after approval (T1222)', () => {
    const text = readFileSync(
      join(playbookPath, 'skills/spec/SKILL.md'),
      'utf8',
    );
    for (const tool of [
      'get_ticket',
      'find_tickets',
      'file_tickets',
      'update_ticket',
      'add_note',
    ]) {
      expect(text).toContain(tool);
    }
    expect(text).toContain('changedSince');
    expect(text).toContain('originNumber');
    expect(text).toContain('blockedByPositions');
    expect(text).toContain('test seams');
    expect(text).toContain('a round at a time');
    expect(text).toMatch(/never apply the `ready-for-agent` label/);
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
