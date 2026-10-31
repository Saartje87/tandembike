import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import '@blockle/blocks/reset';
import { type FC, type ReactNode, Suspense } from 'react';

import { AppShell } from '../components/app-shell/app-shell';
import { ColorModeProvider } from '../components/color-mode-provider/color-mode-provider';
import { ConversationActivityProvider } from '../components/conversation-activity/conversation-activity';
import { LiveUpdates } from '../components/live-updates/live-updates';
import { ProjectNavLoader } from '../components/project-nav-loader/project-nav-loader';
import { colorModeScript } from './lib/color-mode';

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
// The Color mode this browser stored is in `localStorage`, not a cookie, so
// the layout stays static (ADR 0017): the `<head>` script puts it on
// `<html>` before the first paint, which `suppressHydrationWarning` lets
// React keep.
const RootLayout: FC<RootLayoutProps> = ({ children, breadcrumbs }) => {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: a fixed script built from constants.
          dangerouslySetInnerHTML={{ __html: colorModeScript }}
        />
      </head>
      <body>
        <ColorModeProvider>
          <LiveUpdates>
            <ConversationActivityProvider>
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
            </ConversationActivityProvider>
          </LiveUpdates>
        </ColorModeProvider>
      </body>
    </html>
  );
};

export default RootLayout;
