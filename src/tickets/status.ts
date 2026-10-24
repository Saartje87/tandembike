/** The Statuses a Ticket can have, in Board column order. */
export const statuses = ['Todo', 'In progress', 'Done'] as const;

export type Status = (typeof statuses)[number];

/** Whether `value` is one of the Statuses, for input from outside. */
export function isStatus(value: unknown): value is Status {
  return (statuses as readonly unknown[]).includes(value);
}

/** Why a value that is not a Status was refused. */
export const statusRule = 'Choose a Status: Todo, In progress or Done.';
