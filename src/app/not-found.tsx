import { Box, Heading, Stack, Text } from '@blockle/blocks';
import type { Metadata } from 'next';
import type { FC } from 'react';

import * as styles from './not-found.css';

export const metadata: Metadata = { title: 'Page not found' };

const NotFound: FC = () => {
  return (
    <Box
      asChild
      backgroundColor="background-200"
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
              color="text-800"
              fontSize="display"
              letterSpacing="tight"
              level={1}
              lineHeight="display"
              marginBlock={2}
            >
              Page not found
            </Heading>
            <Text color="text-600" fontSize="large">
              We compared your URL against every route. No match.
            </Text>
          </header>
        </Stack>
      </main>
    </Box>
  );
};

export default NotFound;
