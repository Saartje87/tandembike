import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import type { FC } from 'react';

import { FirstRun } from '../components/first-run/first-run';
import { appTickets } from '../tickets/app-tickets';
import { homeRedirect } from './lib/home-redirect';

export const metadata: Metadata = { title: 'Welcome' };

/** With Projects, go to the first one's Board; otherwise ask for one. */
const HomePage: FC = async () => {
  await connection();
  const path = homeRedirect(appTickets('user').listProjects());
  if (path) {
    redirect(path);
  }
  return <FirstRun />;
};

export default HomePage;
