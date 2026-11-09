'use client';

import {
  Alert,
  Box,
  Button,
  Heading,
  Inline,
  Label,
  Select,
  Stack,
  Text,
  Textarea,
} from '@blockle/blocks';
import { type FC, useId } from 'react';
import { useForm } from 'react-hook-form';

import { modeColors } from '../../app/lib/mode-colors';
import { approveTriage, rejectTriage } from '../../app/tickets/actions';
import {
  triageCategories,
  triageStates,
} from '../../tickets/triage-proposal-state';
import type { TriageProposal as Proposal } from '../../tickets/triage-proposals';
import { DateTime } from '../date-time/date-time';
import { Markdown } from '../markdown/markdown';

export type TriageProposalProps = {
  /** The Ticket's pending triage proposal. */
  proposal: Proposal;
};

type TriageValues = {
  category: Proposal['category'];
  state: Proposal['state'];
  reason: string;
};

/**
 * A Ticket's pending triage proposal: the category and state as selects set
 * to the proposed values, the reasoning as Markdown, the proposed criteria,
 * and Approve, or Reject with an optional reason. Approve applies the values
 * in the selects. A refusal shows under the buttons.
 */
export const TriageProposal: FC<TriageProposalProps> = ({ proposal }) => {
  const categoryId = useId();
  const stateId = useId();
  const reasonId = useId();
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    setError,
  } = useForm<TriageValues>({
    defaultValues: {
      category: proposal.category,
      state: proposal.state,
      reason: '',
    },
  });

  const refuse = (result: { error: string }) =>
    setError('root.server', { message: result.error });

  const approve = handleSubmit(async ({ category, state }) => {
    const result = await approveTriage({ id: proposal.id, category, state });
    if (!result.ok) {
      refuse(result);
    }
  });

  const reject = handleSubmit(async ({ reason }) => {
    const result = await rejectTriage({ id: proposal.id, reason });
    if (!result.ok) {
      refuse(result);
    }
  });

  const error = errors.root?.server?.message;

  return (
    <Box
      asChild
      backgroundColor={modeColors.sunken}
      borderRadius={2}
      paddingBlock={3}
      paddingInline={3}
    >
      <section aria-labelledby={`${categoryId}-heading`}>
        <form onSubmit={approve}>
          <Stack gap={3}>
            <Stack gap={1}>
              <Heading id={`${categoryId}-heading`} level={3} fontSize="medium">
                Triage proposal
              </Heading>
              <Text fontSize="small" color="muted">
                Proposed <DateTime date={proposal.createdAt} />. Nothing is
                applied until you approve.
              </Text>
            </Stack>
            <Inline gap={3} alignY="end">
              <Stack gap={1}>
                <Label htmlFor={categoryId}>Category</Label>
                <Select {...register('category')} id={categoryId}>
                  {triageCategories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </Select>
              </Stack>
              <Stack gap={1}>
                <Label htmlFor={stateId}>State</Label>
                <Select {...register('state')} id={stateId}>
                  {triageStates.map((state) => (
                    <option key={state} value={state}>
                      {state}
                    </option>
                  ))}
                </Select>
              </Stack>
            </Inline>
            <Markdown headingLevel={4}>{proposal.reasoning}</Markdown>
            {proposal.acceptanceCriteria && (
              <Stack gap={1}>
                <Text fontSize="small" color="muted">
                  Proposed acceptance criteria (replace the current ones)
                </Text>
                <Box asChild>
                  <ul>
                    {proposal.acceptanceCriteria.map((text) => (
                      <li key={text}>
                        <Text>{text}</Text>
                      </li>
                    ))}
                  </ul>
                </Box>
              </Stack>
            )}
            <Stack gap={1}>
              <Label htmlFor={reasonId}>Reason for rejecting (optional)</Label>
              <Textarea {...register('reason')} id={reasonId} rows={2} />
            </Stack>
            {error && <Alert intent="danger">{error}</Alert>}
            <Inline gap={2} alignY="center">
              <Button type="submit" size="small" disabled={isSubmitting}>
                Approve
              </Button>
              <Button
                type="button"
                variant="outline"
                intent="neutral"
                size="small"
                disabled={isSubmitting}
                onClick={reject}
              >
                Reject
              </Button>
            </Inline>
          </Stack>
        </form>
      </section>
    </Box>
  );
};
