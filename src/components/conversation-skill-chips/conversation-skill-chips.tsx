'use client';

import { Button, Inline, Text } from '@blockle/blocks';
import { type FC, useEffect, useState } from 'react';

import { loadProjectSkills } from '../../app/projects/actions';
import * as styles from './conversation-skill-chips.css';

export type ConversationSkillChipsProps = {
  /** Skill commands, such as `/mattpocock-skills:grilling`, in order. */
  skills: string[];
  onChoose: (command: string) => void;
};

/** `grilling` for `/mattpocock-skills:grilling`, `plan` for `/plan`. */
export const skillName = (command: string) =>
  command.slice(command.lastIndexOf(':') + 1).replace(/^\//, '');

/**
 * A chip per Skill of the Project, above a Conversation's message input
 * (T620). Quieter than the Agent's option chips: a click only prepares the
 * message.
 */
export const ConversationSkillChips: FC<ConversationSkillChipsProps> = ({
  skills,
  onChoose,
}) =>
  skills.length === 0 ? null : (
    <Inline gap={1} alignY="center" role="group" aria-label="Skills">
      <Text fontSize="small" color="muted">
        Skills
      </Text>
      {skills.map((command) => (
        <Button
          key={command}
          type="button"
          size="small"
          variant="ghost"
          className={styles.chip}
          aria-label={command}
          title={command}
          onClick={() => onChoose(command)}
        >
          {skillName(command)}
        </Button>
      ))}
    </Inline>
  );

/**
 * The Skills of a Project, or of a Ticket's Project, loaded once; none while
 * loading or when the load is refused.
 */
export const useProjectSkills = (
  of: { projectId: number } | { ticketNumber: number } | undefined,
): string[] => {
  const [skills, setSkills] = useState<string[]>([]);
  const projectId = of && 'projectId' in of ? of.projectId : undefined;
  const ticketNumber = of && 'ticketNumber' in of ? of.ticketNumber : undefined;

  useEffect(() => {
    if (projectId === undefined && ticketNumber === undefined) {
      return;
    }
    let current = true;
    loadProjectSkills(
      projectId === undefined ? { ticketNumber } : { projectId },
    )
      .then((result) => {
        if (current && result.ok) {
          setSkills(result.skills);
        }
      })
      .catch(() => {
        // No chips; the input works without them.
      });
    return () => {
      current = false;
    };
  }, [projectId, ticketNumber]);

  return skills;
};
