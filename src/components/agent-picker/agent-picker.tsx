'use client';

import { Inline, Label, Select, Stack, Text } from '@blockle/blocks';
import { type FC, useEffect, useId, useState } from 'react';

import {
  type AgentChoices,
  loadAgentChoices,
} from '../../app/conversations/actions';
import { callAction } from '../../app/lib/call-action';
import type { AgentKind } from '../../tickets/agent-kind';

export type AgentPickerProps = {
  /** The Project the start is in, or the Ticket it is about. */
  scope: { projectId: number } | { ticketNumber: number };
  /** The kind picked; left out, the Project's default shows picked. */
  value: AgentKind | undefined;
  onChange: (kind: AgentKind) => void;
};

/**
 * The agent picker of a manual start (T1368, ADR 0051): the Agent kinds the
 * start can run on, the Project's default first picked. A kind that cannot
 * run shows disabled, its reason below. It shows nothing while only one kind
 * is registered, and the start then runs on the default.
 */
export const AgentPicker: FC<AgentPickerProps> = ({
  scope,
  value,
  onChange,
}) => {
  const id = useId();
  const reasonsId = useId();
  const [choices, setChoices] = useState<AgentChoices>(null);
  const projectId = 'projectId' in scope ? scope.projectId : undefined;
  const ticketNumber = 'ticketNumber' in scope ? scope.ticketNumber : undefined;

  useEffect(() => {
    let current = true;
    // Without choices the start runs on the Project's default.
    void callAction(
      () =>
        loadAgentChoices(
          ticketNumber === undefined
            ? { projectId: projectId as number }
            : { ticketNumber },
        ),
      'The agents could not be loaded.',
    ).then((result) => {
      if (current && result.ok) {
        setChoices(result.choices);
      }
    });
    return () => {
      current = false;
    };
  }, [projectId, ticketNumber]);

  if (choices === null) {
    return null;
  }
  const reasons = choices.kinds.flatMap((choice) =>
    choice.available ? [] : [{ kind: choice.kind, reason: choice.reason }],
  );
  return (
    <Stack gap={1}>
      <Inline gap={2} alignY="center">
        <Label htmlFor={id}>Agent</Label>
        <Select
          id={id}
          size="small"
          value={value ?? choices.defaultKind}
          onChange={(event) => onChange(event.target.value as AgentKind)}
          aria-describedby={reasons.length > 0 ? reasonsId : undefined}
        >
          {choices.kinds.map((choice) => (
            <option
              key={choice.kind}
              value={choice.kind}
              disabled={!choice.available}
            >
              {!choice.available
                ? `${choice.label}: cannot run`
                : choice.kind === choices.defaultKind
                  ? `${choice.label} (default)`
                  : choice.label}
            </option>
          ))}
        </Select>
      </Inline>
      {reasons.length > 0 && (
        <Stack gap={0} id={reasonsId}>
          {reasons.map(({ kind, reason }) => (
            <Text key={kind} tag="p" fontSize="small" color="muted">
              {reason}
            </Text>
          ))}
        </Stack>
      )}
    </Stack>
  );
};
