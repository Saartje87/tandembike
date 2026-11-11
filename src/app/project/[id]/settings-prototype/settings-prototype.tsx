'use client';

// PROTOTYPE (T1431): three variants of the Settings page, switchable via
// `?variant=A|B|C` and the floating bar (← → keys). Fake data, no saving.

import { Button, Heading, Inline, Stack, Text } from '@blockle/blocks';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type FC, useEffect } from 'react';

import { usePrototypeState } from './prototype-state';
import { VariantA, VariantB, VariantC } from './prototype-variants';
import * as styles from './settings-prototype.css';

const variants = [
  { key: 'A', name: 'Side nav, open sections', Component: VariantA },
  { key: 'B', name: 'Chip nav, cards', Component: VariantB },
  { key: 'C', name: 'Side nav, label | control rows', Component: VariantC },
];

export const SettingsPrototype: FC = () => {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const state = usePrototypeState();
  const index = Math.max(
    0,
    variants.findIndex(({ key }) => key === params.get('variant')),
  );
  const current = variants[index];

  const go = (step: number) => {
    const next = variants[(index + step + variants.length) % variants.length];
    router.replace(`${pathname}?variant=${next.key}`, { scroll: false });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable]')) return;
      if (event.key === 'ArrowLeft') go(-1);
      if (event.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const Variant = current.Component;
  return (
    <Stack gap={5} paddingBlockEnd={8}>
      <Heading level={1} fontSize="large">
        Settings
      </Heading>
      <Variant state={state} />
      {process.env.NODE_ENV !== 'production' && (
        <div className={styles.switcher}>
          <Inline gap={2} alignY="center" flexWrap="nowrap">
            <Button
              type="button"
              size="small"
              variant="ghost"
              intent="inherit"
              aria-label="Previous variant"
              onClick={() => go(-1)}
            >
              ←
            </Button>
            <Text tag="span" fontSize="small" color="inverse">
              {current.key} ({current.name})
            </Text>
            <Button
              type="button"
              size="small"
              variant="ghost"
              intent="inherit"
              aria-label="Next variant"
              onClick={() => go(1)}
            >
              →
            </Button>
            <Button
              type="button"
              size="small"
              variant="outline"
              intent="inherit"
              onClick={state.toggleRepository}
            >
              {state.hasRepository ? 'Clear repository' : 'Set repository'}
            </Button>
          </Inline>
        </div>
      )}
    </Stack>
  );
};
