'use client';

import { Stack, Text } from '@blockle/blocks';
import type { FC } from 'react';

import type { QuestionEntry } from '../../conversations/conversation-state';

export type ConversationQuestionProps = { question: QuestionEntry };

/**
 * An AskUserQuestion of an older run, read-only: each question with its
 * answer, or "Not answered". New runs ask with Widgets (ADR 0045), so no
 * question entry waits any more.
 */
export const ConversationQuestion: FC<ConversationQuestionProps> = ({
  question: { questions, answers },
}) => {
  if (answers !== null) {
    return (
      <Stack gap={1} listStyle="none" role="list" asChild>
        <ul aria-label="Answers">
          {questions.map(({ question }) => (
            <li key={question}>
              <Text tag="p" fontSize="small" color="muted">
                {question}
              </Text>
              <Text tag="p" fontWeight="strong">
                {answers[question]}
              </Text>
            </li>
          ))}
        </ul>
      </Stack>
    );
  }
  return (
    <Stack gap={1}>
      {questions.map(({ question }) => (
        <Text key={question}>{question}</Text>
      ))}
      <Text fontSize="small" color="muted">
        Not answered
      </Text>
    </Stack>
  );
};
