'use client';

// PROTOTYPE (T1431): in-memory fake settings for the layout prototype.

import { useState } from 'react';

import { agentStages } from '../../../../tickets/agent-commands';

export type Value = string | boolean;
export type Values = Record<string, Value>;

export type FieldKind = 'text' | 'switch' | 'select' | 'radio' | 'number';

export type Field = {
  key: string;
  label: string;
  hint?: string;
  kind: FieldKind;
  placeholder?: string;
  options?: { value: string; label: string }[];
  /** Fields that hang off a switch, such as its ceilings. */
  children?: Field[];
};

export type FieldGroup = { title?: string; fields: Field[] };

export type SectionId =
  | 'general'
  | 'repository'
  | 'agent'
  | 'automation'
  | 'commands'
  | 'references';

export type Section = {
  id: SectionId;
  title: string;
  description: string;
  /** The longer rules, behind "How this works". */
  help?: string[];
  /** Disabled until a repository path is saved. */
  needsRepository?: boolean;
  groups: FieldGroup[];
};

export const sections: Section[] = [
  {
    id: 'general',
    title: 'General',
    description: "The Project's name and how it looks in the sidebar.",
    groups: [{ fields: [{ key: 'name', label: 'Name', kind: 'text' }] }],
  },
  {
    id: 'repository',
    title: 'Repository',
    description: 'Where Agent runs start, and what green means there.',
    groups: [
      {
        fields: [
          {
            key: 'repositoryPath',
            label: 'Repository path',
            kind: 'text',
            placeholder: '/Users/you/Projects/website',
          },
          {
            key: 'checkCommand',
            label: 'Check command',
            hint: 'Must pass before a run opens a pull request. Empty follows the repository’s own instructions.',
            kind: 'text',
            placeholder: 'npm run check',
          },
          {
            key: 'prepareCommand',
            label: 'Prepare command',
            hint: 'Runs in each new worktree before its run starts.',
            kind: 'text',
            placeholder: 'npm ci',
          },
          {
            key: 'parallelRuns',
            label: 'Parallel runs',
            hint: 'Let Starts overlap, each in its own worktree, up to the machine cap.',
            kind: 'switch',
          },
        ],
      },
    ],
  },
  {
    id: 'agent',
    title: 'Agent',
    description: 'Which agent runs your Tickets, and how freely.',
    needsRepository: true,
    help: [
      'Default asks before each tool call the repository has not allowed. Auto lets a classifier decide, so runs wait less.',
      'A blank model uses the agent’s own default. Each kind’s models apply to its own runs only.',
    ],
    groups: [
      {
        fields: [
          {
            key: 'agentKind',
            label: 'Agent',
            kind: 'select',
            options: [
              { value: 'claude-code', label: 'Claude Code' },
              { value: 'copilot', label: 'Copilot' },
            ],
          },
          {
            key: 'agentMode',
            label: 'Agent mode',
            hint: 'Agents pick up ready Tickets from the Board.',
            kind: 'switch',
          },
          {
            key: 'runMode',
            label: 'Permission mode',
            kind: 'radio',
            options: [
              { value: 'default', label: 'Default: asks before new tools' },
              { value: 'auto', label: 'Auto: a classifier decides' },
            ],
          },
        ],
      },
      {
        title: 'Claude Code models',
        fields: [
          {
            key: 'runModel',
            label: 'Run model',
            kind: 'text',
            placeholder: 'Default',
          },
          {
            key: 'triageModel',
            label: 'Triage model',
            kind: 'text',
            placeholder: 'Default',
          },
        ],
      },
      {
        title: 'Copilot models',
        fields: [
          {
            key: 'copilotRunModel',
            label: 'Run model',
            kind: 'text',
            placeholder: 'Default',
          },
          {
            key: 'copilotTriageModel',
            label: 'Triage model',
            kind: 'text',
            placeholder: 'Default',
          },
        ],
      },
    ],
  },
  {
    id: 'automation',
    title: 'Automation',
    description: 'What the factory may do without asking you.',
    needsRepository: true,
    help: [
      'A ceiling stops new runs for the Cycle once its spend reaches it. Empty means no ceiling.',
      'Auto-merge merges a run’s own PR once CI, its review and every acceptance criterion pass.',
    ],
    groups: [
      {
        fields: [
          {
            key: 'autopilot',
            label: 'Autopilot',
            hint: 'Start ready Tickets of the Active Cycle on its own.',
            kind: 'switch',
            children: [
              {
                key: 'spendCeiling',
                label: 'Spend ceiling (USD)',
                kind: 'number',
              },
              {
                key: 'spendCeilingCredits',
                label: 'Spend ceiling (AI credits)',
                kind: 'number',
              },
            ],
          },
          {
            key: 'autoMerge',
            label: 'Auto-merge',
            hint: 'Runs merge their own green PRs.',
            kind: 'switch',
          },
          {
            key: 'autoTriage',
            label: 'Auto-triage',
            hint: 'Triage new Tickets as they arrive.',
            kind: 'switch',
            children: [
              {
                key: 'triageCeiling',
                label: 'Triage ceiling (USD)',
                kind: 'number',
              },
              {
                key: 'triageCeilingCredits',
                label: 'Triage ceiling (AI credits)',
                kind: 'number',
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'commands',
    title: 'Commands',
    description: 'Replace the Playbook command a Stage sends, per Stage.',
    help: [
      'A blank field runs the Playbook command shown under it; a command you set replaces it for that Stage only.',
      'Start on an Epic does not fall back to the Start command. The Retro command is followed by the Cycle’s title and id. The Merge command runs when you approve a merge.',
      'They apply to Claude Code runs only: another agent always runs the Playbook’s skill.',
    ],
    groups: [
      {
        fields: agentStages.map(({ field, label, skill }) => ({
          key: field,
          label,
          kind: 'text' as const,
          placeholder: `/tandembike:${skill}`,
        })),
      },
    ],
  },
  {
    id: 'references',
    title: 'References',
    description: 'Turn External reference keys such as #55 into links.',
    help: [
      'A key starting with a prefix opens the URL, with {n} replaced by the rest of the key. The first matching template applies.',
    ],
    groups: [
      {
        fields: [
          {
            key: 'ref1Prefix',
            label: 'Prefix',
            kind: 'text',
            placeholder: '#',
          },
          {
            key: 'ref1Url',
            label: 'URL',
            kind: 'text',
            placeholder: 'https://github.com/owner/repo/issues/{n}',
          },
          { key: 'ref2Prefix', label: 'Prefix', kind: 'text' },
          { key: 'ref2Url', label: 'URL', kind: 'text' },
        ],
      },
    ],
  },
];

const initial: Values = {
  name: 'Tandembike',
  repositoryPath: '/Users/you/Projects/tandembike',
  checkCommand: 'npm run check',
  prepareCommand: '',
  parallelRuns: true,
  agentKind: 'claude-code',
  agentMode: true,
  runMode: 'default',
  runModel: '',
  triageModel: 'haiku',
  copilotRunModel: '',
  copilotTriageModel: '',
  autopilot: true,
  spendCeiling: '20',
  spendCeilingCredits: '',
  autoMerge: true,
  autoTriage: false,
  triageCeiling: '2',
  triageCeilingCredits: '',
  ...Object.fromEntries(agentStages.map(({ field }) => [field, ''])),
  ref1Prefix: '#',
  ref1Url: 'https://github.com/Saartje87/tandembike/issues/{n}',
  ref2Prefix: 'JIRA-',
  ref2Url: 'https://example.atlassian.net/browse/JIRA-{n}',
};

/** Every field of a section, children included. */
export function fieldsOf(section: Section): Field[] {
  return section.groups.flatMap(({ fields }) =>
    fields.flatMap((field) => [field, ...(field.children ?? [])]),
  );
}

/** Keys that save with the section's Save: everything but switches. */
function savedWithSection(section: Section): string[] {
  return fieldsOf(section)
    .filter(({ kind }) => kind !== 'switch')
    .map(({ key }) => key);
}

export type PrototypeState = ReturnType<typeof usePrototypeState>;

/** Fake settings: switches save at once, the rest on the section's Save. */
export function usePrototypeState() {
  const [saved, setSaved] = useState<Values>(initial);
  const [draft, setDraft] = useState<Values>(initial);
  const [saving, setSaving] = useState<SectionId | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [setupOffer, setSetupOffer] = useState<string | null>(null);

  const hasRepository = String(saved.repositoryPath).trim() !== '';

  const dirty = (section: Section) =>
    savedWithSection(section).some((key) => draft[key] !== saved[key]);

  const change = (field: Field, value: Value) => {
    setDraft((values) => ({ ...values, [field.key]: value }));
    if (field.kind === 'switch') {
      setSaved((values) => ({ ...values, [field.key]: value }));
      setFlash(field.key);
      setTimeout(
        () => setFlash((key) => (key === field.key ? null : key)),
        1500,
      );
      if (
        value === true &&
        (field.key === 'agentMode' || field.key === 'parallelRuns')
      ) {
        setSetupOffer(field.key);
      }
    }
  };

  const save = (section: Section) => {
    setSaving(section.id);
    setTimeout(() => {
      const keys = savedWithSection(section);
      setSaved((values) => ({
        ...values,
        ...Object.fromEntries(keys.map((key) => [key, draft[key]])),
      }));
      setSaving(null);
    }, 600);
  };

  const discard = (section: Section) => {
    const keys = savedWithSection(section);
    setDraft((values) => ({
      ...values,
      ...Object.fromEntries(keys.map((key) => [key, saved[key]])),
    }));
  };

  /** Prototype only: flip between a saved repository path and none. */
  const toggleRepository = () => {
    const path = hasRepository ? '' : String(initial.repositoryPath);
    setSaved((values) => ({ ...values, repositoryPath: path }));
    setDraft((values) => ({ ...values, repositoryPath: path }));
  };

  return {
    saved,
    draft,
    saving,
    flash,
    setupOffer,
    hasRepository,
    dirty,
    change,
    save,
    discard,
    dismissSetup: () => setSetupOffer(null),
    toggleRepository,
  };
}
