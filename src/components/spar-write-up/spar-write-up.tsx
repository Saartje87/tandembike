'use client';

import { Heading, Stack } from '@blockle/blocks';
import { type FC, useOptimistic, useTransition } from 'react';

import { fieldRefusal, rootRefusal } from '../../app/lib/action-result';
import { callAction } from '../../app/lib/call-action';
import { updateSparWriteUp } from '../../app/spars/actions';
import type { WriteUp } from '../../spars/spars';
import { InlineEdit } from '../inline-edit/inline-edit';
import { Markdown } from '../markdown/markdown';

export type SparWriteUpProps = {
  sparId: number;
  writeUp: WriteUp;
  /** A closed Spar: shown, never edited. */
  readOnly?: boolean;
};

const sections: { key: keyof WriteUp; title: string; empty: string }[] = [
  { key: 'decisions', title: 'Decisions', empty: 'No decisions yet' },
  {
    key: 'openQuestions',
    title: 'Open questions',
    empty: 'No open questions yet',
  },
  { key: 'nextSteps', title: 'Next steps', empty: 'No next steps yet' },
];

/**
 * A Spar's Write-up (GLOSSARY): Decisions, Open questions and Next steps, in
 * Markdown, which build up as the Spar goes. The Agent updates it; the User
 * edits each section in place, shown at once, and a refusal reopens the
 * section with the reason.
 */
export const SparWriteUp: FC<SparWriteUpProps> = ({
  sparId,
  writeUp,
  readOnly = false,
}) => {
  const [shown, showEdit] = useOptimistic(
    writeUp,
    (current, edit: Partial<WriteUp>) => ({ ...current, ...edit }),
  );
  const [, startEdit] = useTransition();

  const save = (key: keyof WriteUp) => (text: string) =>
    new Promise<string | undefined>((resolve) => {
      startEdit(async () => {
        showEdit({ [key]: text });
        const result = await callAction(
          () => updateSparWriteUp({ sparId, writeUp: { [key]: text } }),
          'The Write-up could not be saved. Try again.',
        );
        resolve(fieldRefusal(result, key) ?? rootRefusal(result));
      });
    });

  return (
    <Stack gap={3}>
      <Heading level={2} fontSize="medium">
        Write-up
      </Heading>
      {sections.map(({ key, title, empty }) => (
        <Stack key={key} gap={1}>
          <Heading level={3} fontSize="small">
            {title}
          </Heading>
          <InlineEdit
            value={shown[key]}
            label={title}
            multiline
            rows={6}
            readOnly={readOnly}
            placeholder={empty}
            renderContent={(text) => (
              <Markdown headingLevel={4} breaks>
                {text}
              </Markdown>
            )}
            onSave={save(key)}
          />
        </Stack>
      ))}
    </Stack>
  );
};
