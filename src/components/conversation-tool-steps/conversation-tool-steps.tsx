'use client';

import { Box, Inline, Stack, Text } from '@blockle/blocks';
import type { FC } from 'react';

import type { TranscriptEntry } from '../../conversations/conversations';
import { toolPhrase, toolRawInput } from '../../conversations/status-line';
import { Icon } from '../icon/icon';
import * as styles from './conversation-tool-steps.css';

export type ConversationToolStepsProps = {
  /** Consecutive tool entries of a transcript, at least one. */
  steps: TranscriptEntry[];
};

type StepProps = { entry: TranscriptEntry };

/** One tool call: its card-style phrase, its raw input as stored under it. */
const Step: FC<StepProps> = ({ entry }) => {
  const raw = toolRawInput(entry.text);
  return (
    <Stack gap={0} className={styles.step}>
      <Text tag="p" fontSize="small" color="muted">
        {toolPhrase(entry)}
      </Text>
      {raw && (
        <Text
          tag="code"
          fontFamily="mono"
          fontSize="xsmall"
          color="muted"
          whiteSpace="pre-wrap"
        >
          {raw}
        </Text>
      )}
    </Stack>
  );
};

/**
 * A run of consecutive tool calls in the chat (T1386). One call is a single
 * line; more are a group, closed by default, whose summary names how many
 * steps it holds and the latest one, as the Board cards word it.
 */
export const ConversationToolSteps: FC<ConversationToolStepsProps> = ({
  steps,
}) => {
  const latest = steps.at(-1);
  if (!latest) {
    return null;
  }
  return (
    <Box asChild alignSelf="flex-start" maxInlineSize="full">
      <li data-side="start">
        {steps.length === 1 ? (
          <Step entry={latest} />
        ) : (
          <details>
            <Box asChild className={styles.summary}>
              <summary>
                <Inline gap={1} alignY="center">
                  <span className={styles.chevron}>
                    <Icon name="chevron-right" size="small" />
                  </span>
                  <Text fontSize="small" color="muted">
                    {`${steps.length} steps · ${toolPhrase(latest)}`}
                  </Text>
                </Inline>
              </summary>
            </Box>
            <Stack gap={2} paddingBlockStart={1} paddingInlineStart={4}>
              {steps.map((entry) => (
                <Step key={entry.id} entry={entry} />
              ))}
            </Stack>
          </details>
        )}
      </li>
    </Box>
  );
};
