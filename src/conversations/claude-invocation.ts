import {
  agentCommandMessage,
  commandForStage,
  type ProjectAgentCommands,
  planCommandMessage,
  sparCommandMessage,
} from '../tickets/agent-commands';
import type { StageInvocation } from './agent-runner';
import { retroPrompt } from './retro-prompt';

/**
 * How a Claude Code run invokes a Stage (ADR 0051): the slash command of its
 * Stage, the Project's override or the Playbook's, followed by its Ticket,
 * Cycle, goal or topic, as the first message has always read.
 */
export function claudeInvocationText(
  invocation: StageInvocation,
  commands: ProjectAgentCommands,
): string {
  switch (invocation.stage) {
    case 'triage':
    case 'start':
    case 'spec':
    case 'merge':
      return agentCommandMessage(invocation.stage, invocation.ticket, commands);
    case 'retro':
      return retroPrompt(invocation.cycle, commandForStage('retro', commands));
    case 'plan':
      return planCommandMessage(invocation.goal, commands);
    case 'spar':
      return sparCommandMessage(
        invocation.topic,
        invocation.focusTicketNumber,
        commands,
      );
  }
}
