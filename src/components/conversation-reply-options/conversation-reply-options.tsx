'use client';

import { Button, Inline, Stack, Text } from '@blockle/blocks';
import type { FC } from 'react';

import type {
  ReplyOption,
  ReplyQuestion,
} from '../../conversations/reply-options';

export type ConversationReplyOptionsProps = {
  questions: ReplyQuestion[];
  onChoose: (question: ReplyQuestion, option: ReplyOption) => void;
};

/**
 * A chip per option of the Agent's latest message, so the User answers with a
 * click (T613). Several questions get a group each.
 */
export const ConversationReplyOptions: FC<ConversationReplyOptionsProps> = ({
  questions,
  onChoose,
}) => (
  <Stack gap={1} role="group" aria-label="Options">
    {questions.map((question) => (
      <Inline
        key={question.label ?? 'options'}
        gap={1}
        role="group"
        aria-label={question.label ?? 'Options'}
      >
        {question.label && (
          <Text fontSize="small" color="muted">
            {question.label}
          </Text>
        )}
        {question.options.map((option) => (
          <Button
            key={option.key}
            type="button"
            size="small"
            variant="outline"
            onClick={() => onChoose(question, option)}
          >
            {`${option.key}) ${option.text}`}
          </Button>
        ))}
      </Inline>
    ))}
  </Stack>
);
