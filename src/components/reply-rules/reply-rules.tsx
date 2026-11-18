import { Heading, Stack, Text } from '@blockle/blocks';
import { type FC, useId } from 'react';

import { AppLink } from '../app-link/app-link';

export type ReplyRulesProps = {
  /** The Project's Reply rules; null for none. */
  rules: string | null;
  /** Where they are edited, on Settings. */
  settingsHref: string;
};

/**
 * The Reply rules Auto-reply follows on top of its defaults (ADR 0054), as
 * Flow shows them under its switch. Only Settings edits them.
 */
export const ReplyRules: FC<ReplyRulesProps> = ({ rules, settingsHref }) => {
  const id = useId();
  return (
    <Stack gap={1} aria-labelledby={id} asChild>
      <section>
        <Heading level={3} id={id}>
          Reply rules
        </Heading>
        <Text tag="p" whiteSpace="pre-wrap">
          {rules ?? 'None: Auto-reply follows its defaults.'}
        </Text>
        <Text tag="p" fontSize="small">
          <AppLink href={settingsHref}>Edit in Settings</AppLink>
        </Text>
      </section>
    </Stack>
  );
};
