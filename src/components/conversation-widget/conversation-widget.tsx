'use client';

import { Stack, Text } from '@blockle/blocks';
import { type FC, useEffect } from 'react';

import type {
  Widget,
  WidgetAnswer,
  WidgetEntry,
} from '../../conversations/widget';
import { ChoiceWidget } from '../choice-widget/choice-widget';
import { useKeptConversation } from '../conversation-dialog-provider/kept-conversations';
import { RankWidget } from '../rank-widget/rank-widget';
import { ScaleWidget } from '../scale-widget/scale-widget';

export type ConversationWidgetProps = {
  conversationId: number;
  entryId: number;
  entry: WidgetEntry;
};

/** The User's answer to a settled Widget, in words. */
const answerLines = (widget: Widget, answer: WidgetAnswer): string[] => {
  if ('skipped' in answer) {
    return ['Skipped'];
  }
  if ('expired' in answer) {
    return ['Expired'];
  }
  if ('other' in answer) {
    return [`Other: ${answer.other}`];
  }
  if ('selected' in answer) {
    return answer.selected;
  }
  if ('order' in answer) {
    return answer.order.map((item, index) => `${index + 1}. ${item}`);
  }
  if ('values' in answer && widget.kind === 'scale') {
    return answer.values.map(
      ({ item, value }) => `${item}: ${value} of ${widget.max}`,
    );
  }
  return [];
};

/**
 * A Widget of the Agent in the chat (ADR 0045), in any Conversation: the
 * form for its kind while the run waits on it; once answered, read-only with
 * the answer; once its run ended unanswered, marked expired.
 */
export const ConversationWidget: FC<ConversationWidgetProps> = ({
  conversationId,
  entryId,
  entry: { widget, answer, expired },
}) => {
  const kept = useKeptConversation();
  const settled = answer !== null || expired;

  // A settled Widget drops its unsent draft.
  useEffect(() => {
    if (settled) {
      kept?.widgets.delete(entryId);
    }
  }, [kept, entryId, settled]);

  if (settled) {
    return (
      <Stack gap={1}>
        <Text tag="p" fontWeight="strong">
          {widget.prompt}
        </Text>
        <Stack gap={0} listStyle="none" role="list" asChild>
          <ul aria-label="Answer">
            {answer === null ? (
              <Text fontSize="small" color="muted" asChild>
                <li>Expired: the run ended before an answer.</li>
              </Text>
            ) : (
              answerLines(widget, answer).map((line) => (
                <Text key={line} asChild>
                  <li>{line}</li>
                </Text>
              ))
            )}
          </ul>
        </Stack>
      </Stack>
    );
  }
  switch (widget.kind) {
    case 'choice':
      return (
        <ChoiceWidget
          conversationId={conversationId}
          entryId={entryId}
          widget={widget}
        />
      );
    case 'rank':
      return (
        <RankWidget
          conversationId={conversationId}
          entryId={entryId}
          widget={widget}
        />
      );
    case 'scale':
      return (
        <ScaleWidget
          conversationId={conversationId}
          entryId={entryId}
          widget={widget}
        />
      );
  }
};
