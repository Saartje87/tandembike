import { Box, Heading, Inline, Stack, Tag, Text } from '@blockle/blocks';
import { type FC, type ReactNode, useId } from 'react';

import { AppLink } from '../app-link/app-link';
import * as styles from './flow-step.css';

/** Who acts at a step of a Flow diagram. */
export type FlowActor = 'You' | 'Agent' | 'Autopilot';

export type FlowStepProps = {
  title: string;
  /** Who acts there. */
  actors: FlowActor[];
  /** Where it shows, such as "Board: Needs you → Intake"; left out where it shows nowhere. */
  section?: string;
  /**
   * How many Tickets are there now and where they show; `href` null when
   * there is no Board to show them on.
   */
  count?: { count: number; href: string | null; noun?: string };
  /** What else to know about the step. */
  children?: ReactNode;
};

const ticketsText = (count: number, noun = 'Ticket') =>
  `${count} ${count === 1 ? noun : `${noun}s`}`;

/** One step of a Flow diagram: what happens there, who acts and how many are there. */
export const FlowStep: FC<FlowStepProps> = ({
  title,
  actors,
  section,
  count,
  children,
}) => {
  const headingId = useId();
  return (
    <Box asChild className={styles.step} padding={3}>
      <section aria-labelledby={headingId}>
        <Stack gap={1}>
          <Inline gap={2} alignY="center">
            <Heading level={3} fontSize="medium" id={headingId}>
              {title}
            </Heading>
            {actors.map((actor) => (
              <Tag key={actor} intent={actor === 'You' ? 'warning' : undefined}>
                {actor}
              </Tag>
            ))}
            {count &&
              (count.href === null ? (
                <Text fontSize="small" color="muted">
                  {ticketsText(count.count, count.noun)}
                </Text>
              ) : (
                <Text fontSize="small">
                  <AppLink href={count.href}>
                    {ticketsText(count.count, count.noun)}
                  </AppLink>
                </Text>
              ))}
          </Inline>
          {section && (
            <Text tag="p" fontSize="small" color="muted">
              {section}
            </Text>
          )}
          {children && (
            <Text tag="p" fontSize="small">
              {children}
            </Text>
          )}
        </Stack>
      </section>
    </Box>
  );
};
