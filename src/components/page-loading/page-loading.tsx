import { Spinner } from '@blockle/blocks';
import type { FC } from 'react';

/** Fallback for a page while its data streams in (used by `loading.tsx`). */
export const PageLoading: FC = () => (
  <Spinner role="status" aria-label="Loading" />
);
