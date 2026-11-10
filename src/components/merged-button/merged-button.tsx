'use client';

import { Button, Dialog, Heading, Inline, Stack, Text } from '@blockle/blocks';
import { type FC, useId } from 'react';

import type { UncheckedCriterion } from '../../tickets/errors';
import type { Ticket } from '../../tickets/tickets';

export type MergedButtonProps = {
  ticket: Pick<Ticket, 'number' | 'title'>;
  /**
   * What the click says: Merged for a PR in Review, or Done for a
   * ready-for-human Ticket with no PR (T1268). Defaults to Merged.
   */
  action?: 'Merged' | 'Done';
  /** Called on click with false, and with true once the User confirms. */
  onMerged: (confirmed: boolean) => void;
  /** Closes the confirm step without completing. */
  onCancel?: () => void;
  /**
   * The unchecked acceptance criteria the last click returned: while set,
   * the button asks the User to confirm (ADR 0043).
   */
  unchecked?: UncheckedCriterion[];
  /** Disables the button while the action runs. Defaults to false. */
  pending?: boolean;
};

/**
 * Says the Ticket's PR is merged, or that the Ticket is done (`action`), so
 * the User applies the completion rule with one click. It checks nothing on
 * GitHub. When acceptance criteria are unchecked it lists them and completes
 * only once the User confirms.
 */
export const MergedButton: FC<MergedButtonProps> = ({
  ticket,
  action = 'Merged',
  onMerged,
  onCancel = () => {},
  unchecked,
  pending = false,
}) => {
  const headingId = useId();
  const open = unchecked !== undefined && unchecked.length > 0;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="small"
        aria-label={`${action} T${ticket.number} ${ticket.title}`}
        disabled={pending}
        onClick={() => onMerged(false)}
      >
        {action}
      </Button>
      <Dialog open={open} onRequestClose={onCancel} aria-labelledby={headingId}>
        {open && (
          <Stack gap={4}>
            <Heading id={headingId} level={2}>
              {action === 'Merged' ? 'Merge' : 'Finish'} T{ticket.number} with
              unchecked criteria?
            </Heading>
            <Text tag="p">
              These acceptance criteria are not checked. Finishing anyway
              records on T{ticket.number} that you confirmed it.
            </Text>
            <Stack
              gap={1}
              aria-label="Unchecked criteria"
              listStyle="none"
              role="list"
              asChild
            >
              <ul>
                {unchecked.map(({ number, text }) => (
                  <Text key={`${number}:${text}`} asChild>
                    <li>
                      T{number}: {text}
                    </li>
                  </Text>
                ))}
              </ul>
            </Stack>
            <Inline gap={2}>
              <Button
                type="button"
                disabled={pending}
                onClick={() => onMerged(true)}
              >
                {action} anyway
              </Button>
              <Button type="button" variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
            </Inline>
          </Stack>
        )}
      </Dialog>
    </>
  );
};
