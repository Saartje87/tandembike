import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import '@blockle/blocks/reset';
import { BlocksProvider } from '@blockle/blocks';
import { momotaro } from '@blockle/blocks-theme-momotaro';
import { type FC, type ReactNode, Suspense } from 'react';

import { AppShell } from '../components/app-shell/app-shell';
import { LiveUpdates } from '../components/live-updates/live-updates';
import { ProjectNavLoader } from '../components/project-nav-loader/project-nav-loader';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: { default: 'Tandembike', template: '%s | Tandembike' },
  description: 'A personal ticket tracker for you and your Agents.',
};

export type RootLayoutProps = {
  children: ReactNode;
  /** The `@breadcrumbs` slot: the current page's trail for the header. */
  breadcrumbs: ReactNode;
};

// The side navigation in the header's drawer reads the database at request
// time, so it streams in behind a Suspense boundary (Cache Components).
// Pages get theirs from `loading.tsx`. `LiveUpdates` keeps one change
// listener per tab here, where it stays mounted across navigation.
// The app is light-only: `BlocksProvider` pins the Color mode, but writes it
// on `<html>` only once it mounts, so the server HTML sets it too, or a
// dark-OS User would see a dark first paint.
const RootLayout: FC<RootLayoutProps> = ({ children, breadcrumbs }) => {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable}`}
      data-color-mode="light"
    >
      <body>
        <BlocksProvider theme={momotaro} colorMode="light">
          <LiveUpdates>
            <AppShell
              breadcrumbs={breadcrumbs}
              nav={
                <Suspense>
                  <ProjectNavLoader />
                </Suspense>
              }
            >
              {children}
            </AppShell>
          </LiveUpdates>
        </BlocksProvider>
      </body>
    </html>
  );
};

export default RootLayout;
