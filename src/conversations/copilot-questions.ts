import type { SessionConfigBase } from '@github/copilot-sdk';

import type { AskWidget } from './widget-tools';

type UserInputHandler = NonNullable<SessionConfigBase['onUserInputRequest']>;

/**
 * The Copilot runner's handler for Copilot's own questions, its `ask_user`
 * tool (ADR 0045, ADR 0051): a choice Widget with a button per choice, whose
 * Other field takes typed text. The run waits for the answer, and the
 * Conversation counts it as Needs you as any Widget.
 */
export function copilotQuestionHandler(askWidget: AskWidget): UserInputHandler {
  return async ({ question, choices = [] }) => {
    const answer = await askWidget({
      kind: 'choice',
      prompt: question,
      options: choices.map((label) => ({ label })),
      multiSelect: false,
    });
    if ('selected' in answer) {
      return { answer: answer.selected.join(', '), wasFreeform: false };
    }
    if ('other' in answer) {
      return { answer: answer.other, wasFreeform: true };
    }
    if ('skipped' in answer) {
      return { answer: 'The User skipped this question.', wasFreeform: true };
    }
    // The run ended before the User answered.
    throw new Error('The User did not answer.');
  };
}
