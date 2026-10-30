import { Text } from '@blockle/blocks';
import type { FC } from 'react';

import { modeColors } from '../../app/lib/mode-colors';

export type FieldErrorProps = {
  /** For the field's `aria-describedby`. */
  id: string;
  /** Why the field's value was refused; nothing shows without one. */
  reason?: string;
};

/** The Tickets module's reason a form field was refused, under the field. */
export const FieldError: FC<FieldErrorProps> = ({ id, reason }) =>
  reason ? (
    <Text id={id} tag="p" fontSize="small" color={modeColors.danger}>
      {reason}
    </Text>
  ) : null;
