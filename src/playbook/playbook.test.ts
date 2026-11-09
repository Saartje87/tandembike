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
const shippedStageSkills = [
  'implement',
  'implement-epic',
  'triage',
  'retro',
  'spec',
  'merge',
];

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

  it('has a review skill the model can invoke', () => {
    const frontmatter = frontmatterOf('review');
    expect(frontmatter.name).toBe('review');
    expect(frontmatter.description).not.toBe('');
    expect(frontmatter).not.toHaveProperty('disable-model-invocation');
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

  it('has an implement skill that reviews through the review skill before the pull request', () => {
    const text = readFileSync(
      join(playbookPath, 'skills/implement/SKILL.md'),
      'utf8',
    );
    expect(text).toContain('`review` skill');
    expect(text.indexOf('`review` skill')).toBeLessThan(
      text.indexOf('open_pr'),
    );
  });

  it('has an implement-epic skill that works the children in Blocker order to one pull request', () => {
    const text = readFileSync(
      join(playbookPath, 'skills/implement-epic/SKILL.md'),
      'utf8',
    );
    for (const tool of ['start_work', 'check_criterion', 'open_pr']) {
      expect(text).toContain(tool);
    }
    expect(text).toContain('Blocker order');
    expect(text).toContain('`review` skill');
    expect(text).toContain('handOff: true');
    expect(text).toContain('one pull request');
    expect(text).toContain('Do not call `finish_work`');
  });
});

describe('The Playbook triage and retro skills', () => {
  const read = (skill: string) =>
    readFileSync(join(playbookPath, 'skills', skill, 'SKILL.md'), 'utf8');

  it('has a triage skill that comments with the disclaimer and never readies a Ticket itself', () => {
    const text = read('triage');
    expect(text).toContain('> *This was generated by AI during triage.*');
    expect(text).toContain('add_note');
    expect(text).toContain('needs-info');
    expect(text).toMatch(/never (apply|add|set)[^.\n]*`ready-for-agent`/i);
    expect(text).not.toMatch(/addLabels: \["ready-for-agent"\]/);
  });

  it('has a retro skill that files Tickets only after the User agrees', () => {
    const text = read('retro');
    for (const tool of ['find_tickets', 'get_project', 'file_tickets']) {
      expect(text).toContain(tool);
    }
    expect(text).toMatch(/only after the User (agrees|has agreed)/i);
  });

  it('keeps both skills self-contained', () => {
    for (const skill of ['triage', 'retro']) {
      const text = read(skill);
      expect(text).not.toContain('docs/agents');
      expect(text).not.toMatch(/\bSkill tool\b/);
    }
  });
});

describe('The Playbook merge Stage', () => {
  const text = (skill: string) =>
    readFileSync(join(playbookPath, 'skills', skill, 'SKILL.md'), 'utf8');

  it('has a merge skill that merges through the host CLI and finishes, or comments and stops', () => {
    const merge = text('merge');
    for (const tool of ['finish_work', 'add_note', 'get_ticket']) {
      expect(merge).toContain(tool);
    }
    expect(merge).toContain('rebase');
  });

  it('lets implement merge only after the User approves', () => {
    expect(text('implement')).toContain('Approved: merge');
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
