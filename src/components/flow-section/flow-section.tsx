import { Heading, Stack, Text } from '@blockle/blocks';
import type { FC, ReactNode } from 'react';

export type FlowSectionProps = {
  /** The heading's id, which names the section. */
  id: string;
  title: string;
  /** One or two sentences on what the section shows. */
  intro: string;
  children: ReactNode;
};

/** One section of a Project's Flow page: a heading, a short intro and its content. */
export const FlowSection: FC<FlowSectionProps> = ({
  id,
  title,
  intro,
  children,
}) => (
  <Stack gap={3} aria-labelledby={id} asChild>
    <section>
      <Stack gap={1}>
        <Heading level={2} id={id}>
          {title}
        </Heading>
        <Text tag="p" fontSize="small" color="muted">
          {intro}
        </Text>
      </Stack>
      {children}
    </section>
  </Stack>
);
