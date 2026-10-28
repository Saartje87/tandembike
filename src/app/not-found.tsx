import { Box, Heading, Stack, Text } from '@blockle/blocks';
import type { Metadata } from 'next';
import type { FC } from 'react';

import * as styles from './not-found.css';

export const metadata: Metadata = { title: 'Page not found' };

// `neutral-100` is surface.sunken's light value: atoms take no Color roles
// (T338).
const NotFound: FC = () => {
  return (
    <Box
      asChild
      backgroundColor="neutral-100"
      className={styles.page}
      paddingBlock={[5, 6]}
      paddingInline={[4, 5]}
    >
      <main>
        <Stack className={styles.content} gap={5} marginInline="auto">
          <header>
            <Text
              color="primary-600"
              fontFamily="mono"
              fontSize="xsmall"
              fontWeight="bold"
              letterSpacing="wider"
            >
              ERROR 404
            </Text>
            <Heading
              color="default"
              fontSize="display"
              letterSpacing="tight"
              level={1}
              lineHeight="compact"
              marginBlock={2}
            >
              Page not found
            </Heading>
            <Text color="muted" fontSize="large">
              We compared your URL against every route. No match.
            </Text>
          </header>
        </Stack>
      </main>
    </Box>
  );
};

export default NotFound;
