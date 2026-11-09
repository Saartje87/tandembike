import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * The names of the MCP tools that were removed when the tool set came to
 * follow the work, not the data model (ADR 0037). None of them may appear in
 * the files Agents read: they would call a tool that does not exist.
 */
export const removedToolNames = [
  'add_attachment',
  'add_blocker',
  'add_comment',
  'add_ticket_labels',
  'archive_cycle',
  'archive_ticket',
  'attach_to_epic',
  'claim_ticket',
  'complete_ticket',
  'create_project',
  'create_ticket',
  'create_tickets',
  'detach_from_epic',
  'edit_comment',
  'get_attachment',
  'list_activity',
  'list_blockers',
  'list_comments',
  'list_cycles',
  'list_labels',
  'list_projects',
  'list_tickets',
  'move_tickets',
  'plan_ticket',
  'plan_tickets',
  'release_ticket_claim',
  'remove_attachment',
  'remove_blocker',
  'remove_comment',
  'remove_ticket_labels',
  'rename_cycle',
  'rename_project',
  'restore_ticket',
  'set_acceptance_criteria_checked',
  'sort_lane',
  'start_cycle',
  'unplan_ticket',
  'unplan_tickets',
  'update_tickets',
] as const;

/**
 * Where Agents read how to use the tools: the skills (this repository's and
 * the Playbook's), the agent docs, the repository instructions and the
 * sources of the run brief and Retro prompt.
 * ADRs, research notes and roadmaps are history and left out.
 */
export const guardedPaths = [
  '.agents/skills',
  'docs/agents',
  'AGENTS.md',
  'CLAUDE.md',
  'playbook',
  'src/conversations/run-brief.ts',
  'src/conversations/retro-prompt.ts',
];

export type RemovedToolMention = { file: string; line: number; name: string };

const removedToolPattern = new RegExp(`\\b(${removedToolNames.join('|')})\\b`);

const filesUnder = (path: string): string[] => {
  let stats: ReturnType<typeof statSync>;
  try {
    stats = statSync(path);
  } catch {
    return [];
  }
  if (stats.isFile()) {
    return [path];
  }
  return readdirSync(path).flatMap((entry) => filesUnder(join(path, entry)));
};

/**
 * Every mention of a removed tool in `paths` (relative to `root`), with its
 * file (relative to `root`) and 1-based line, in path and line order.
 */
export function findRemovedToolMentions(
  root: string,
  paths: readonly string[] = guardedPaths,
): RemovedToolMention[] {
  return paths.flatMap((path) =>
    filesUnder(join(root, path)).flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .flatMap((text, index) => {
          const name = removedToolPattern.exec(text)?.[1];
          return name
            ? [{ file: relative(root, file), line: index + 1, name }]
            : [];
        }),
    ),
  );
}
