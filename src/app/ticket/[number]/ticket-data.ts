import { notFound } from 'next/navigation';
import { connection } from 'next/server';

import { appTickets } from '../../../tickets/app-tickets';
import { NotFoundError } from '../../../tickets/errors';

/** The Ticket for a number-only URL, or the not-found page. */
export async function loadTicketByNumber(rawNumber: string) {
  await connection();
  const number = Number(rawNumber);
  if (!Number.isSafeInteger(number)) {
    notFound();
  }
  try {
    return appTickets('user').getTicket(number);
  } catch (error) {
    if (error instanceof NotFoundError) {
      notFound();
    }
    throw error;
  }
}
