import type {
  ChoiceIntent,
  ChoicesOf,
  ConversationChoice,
  TicketChoice,
} from '../conversations/terminal-choices';
import { type RunnableCommand, ticketNumberOf } from './session';

/**
 * Bare `tandembike` in a terminal (ADR 0052): asks for a Project when the
 * folder is in none, an action, and what the action needs, and returns the
 * same command the typed command parses to, which `cli.ts` runs
 * through the typed command's path. Pure over a prompter and the server's
 * answers, so tests drive it with fakes; `cli.ts` backs the prompter with
 * `@clack/prompts`.
 */

/** What a prompt returns when the User cancels it (Ctrl+C). */
export const cancelled: unique symbol = Symbol('cancelled');

export type Option<T> = { value: T; label: string; hint?: string };

export type Prompter = {
  select<T>(
    message: string,
    options: Option<T>[],
  ): Promise<T | typeof cancelled>;
  /** `validate` returns why a value is refused, or undefined. */
  text(
    message: string,
    validate: (value: string) => string | undefined,
  ): Promise<string | typeof cancelled>;
};

export type WizardDeps = {
  prompter: Prompter;
  /** The Server entry's label, such as "Server: running on :4747". */
  serverLabel: string;
  /** The known Projects and the folder's Project (the terminal route's `projects`). */
  projects(): Promise<{
    projects: { id: number; name: string }[];
    folderProjectId: number | null;
  }>;
  /** What an action lists in a Project (the terminal route's `list`). */
  choices<I extends ChoiceIntent>(
    intent: I,
    projectId: number,
  ): Promise<ChoicesOf<I>>;
};

/** The command to run, or the exit code (130 for a cancel) and what to say. */
export type WizardOutcome =
  | { run: RunnableCommand }
  | { exit: number; message?: string };

/** The option every list ends with. */
export const typeANumber = 'Type a number…';

const cancel: WizardOutcome = { exit: 130 };

type Action = 'implement' | 'triage' | 'spec' | 'plan' | 'resume' | 'server';
type ServerAction = 'start' | 'stop' | 'restart' | 'status';

const serverCommands: Record<ServerAction, RunnableCommand> = {
  start: { command: 'start', port: null, foreground: false },
  stop: { command: 'stop', force: false },
  restart: { command: 'restart' },
  status: { command: 'status' },
};

/** What an empty list says, per action. */
const emptyText: Record<ChoiceIntent, string> = {
  start: 'Nothing in the Active Cycle of {project} is ready to implement.',
  triage: 'No Tickets to triage in {project}.',
  spec: 'No ideas or empty Epics to spec in {project}.',
  resume: 'No Conversations to continue in {project}.',
};

const listText: Record<ChoiceIntent, string> = {
  start: 'Which Ticket to implement?',
  triage: 'Which Ticket to triage?',
  spec: 'Which Ticket to spec?',
  resume: 'Which Conversation to continue?',
};

const typed = (value: string | typeof cancelled) =>
  value === cancelled ? null : value.trim();

export async function runWizard(deps: WizardDeps): Promise<WizardOutcome> {
  const { prompter } = deps;

  const known = await deps.projects();
  let projectId = known.folderProjectId;
  if (projectId === null) {
    if (known.projects.length === 0) {
      return {
        exit: 1,
        message: 'There is no Project yet: create one in Tandembike first.',
      };
    }
    const picked = await prompter.select(
      'Which Project?',
      known.projects.map(({ id, name }) => ({ value: id, label: name })),
    );
    if (picked === cancelled) return cancel;
    projectId = picked;
  }
  const projectName =
    known.projects.find(({ id }) => id === projectId)?.name ?? 'this Project';

  const action = await prompter.select<Action>('What do you want to do?', [
    { value: 'implement', label: 'Implement' },
    { value: 'triage', label: 'Triage' },
    { value: 'spec', label: 'Spec' },
    { value: 'plan', label: 'Plan' },
    { value: 'resume', label: 'Resume' },
    { value: 'server', label: deps.serverLabel },
  ]);
  if (action === cancelled) return cancel;

  /** A list of the action's choices ending with "type a number…"; null for that. */
  const pick = async <I extends ChoiceIntent>(
    intent: I,
    options: Option<number>[],
  ): Promise<number | null | typeof cancelled> => {
    const message =
      options.length === 0
        ? `${emptyText[intent].replace('{project}', projectName)} Type a number?`
        : listText[intent];
    const picked = await prompter.select<number | null>(message, [
      ...options,
      { value: null, label: typeANumber },
    ]);
    return picked;
  };

  const ticketOptions = (list: TicketChoice[], firstHint?: string) =>
    list.map(({ number, title }, index) => ({
      value: number,
      label: `T${number} ${title}`,
      ...(index === 0 && firstHint ? { hint: firstHint } : {}),
    }));

  switch (action) {
    case 'implement': {
      const list = await deps.choices('start', projectId);
      const picked = await pick('start', ticketOptions(list, 'next'));
      if (picked === cancelled) return cancel;
      if (picked !== null) {
        return { run: { command: 'implement', ticketNumber: picked } };
      }
      const value = typed(
        await prompter.text('Ticket number (T42 or 42), or next', (v) =>
          v.trim().toLowerCase() === 'next' || ticketNumberOf(v.trim()) !== null
            ? undefined
            : 'Type a Ticket number, such as T42 or 42, or next.',
        ),
      );
      if (value === null) return cancel;
      if (value.toLowerCase() === 'next') {
        return { run: { command: 'implement', ticketNumber: null, projectId } };
      }
      return {
        run: {
          command: 'implement',
          ticketNumber: ticketNumberOf(value) as number,
        },
      };
    }
    case 'triage':
    case 'spec': {
      const list = await deps.choices(action, projectId);
      const picked = await pick(action, ticketOptions(list));
      if (picked === cancelled) return cancel;
      if (picked !== null) {
        return { run: { command: action, ticketNumber: picked } };
      }
      const value = typed(
        await prompter.text('Ticket number (T42 or 42)', (v) =>
          ticketNumberOf(v.trim()) === null
            ? 'Type a Ticket number, such as T42 or 42.'
            : undefined,
        ),
      );
      if (value === null) return cancel;
      return {
        run: { command: action, ticketNumber: ticketNumberOf(value) as number },
      };
    }
    case 'resume': {
      const list: ConversationChoice[] = await deps.choices(
        'resume',
        projectId,
      );
      const picked = await pick(
        'resume',
        list.map(({ conversationId, ticketNumber, title }) => ({
          value: conversationId,
          label: `#${conversationId} ${ticketNumber === null ? '' : `T${ticketNumber} `}${title}`,
        })),
      );
      if (picked === cancelled) return cancel;
      if (picked !== null) {
        return { run: { command: 'resume', conversationId: picked } };
      }
      const value = typed(
        await prompter.text('Conversation id', (v) =>
          /^[1-9]\d*$/.test(v.trim())
            ? undefined
            : 'Type a Conversation id, such as 12.',
        ),
      );
      if (value === null) return cancel;
      return { run: { command: 'resume', conversationId: Number(value) } };
    }
    case 'plan': {
      const goal = typed(
        await prompter.text('What is the goal?', (v) =>
          v.trim() === '' ? 'Describe the goal to plan for.' : undefined,
        ),
      );
      if (goal === null) return cancel;
      return { run: { command: 'plan', goal, projectId } };
    }
    case 'server': {
      const picked = await prompter.select<ServerAction>(deps.serverLabel, [
        { value: 'start', label: 'Start' },
        { value: 'stop', label: 'Stop' },
        { value: 'restart', label: 'Restart' },
        { value: 'status', label: 'Status' },
      ]);
      if (picked === cancelled) return cancel;
      return { run: serverCommands[picked] };
    }
  }
}
