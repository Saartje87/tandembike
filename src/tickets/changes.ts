/**
 * What changed, enough for a client to know what to refetch: a Project by
 * id, a Ticket by Ticket number, or several Tickets changed in one batch.
 */
export type Change =
  | { type: 'project'; id: number }
  | { type: 'ticket'; number: number }
  | { type: 'tickets'; numbers: number[] };

export type ChangeListener = (change: Change) => void;

export type ChangeChannel = {
  publish(change: Change): void;
  /** Returns a function that stops delivery to `listener`. */
  subscribe(listener: ChangeListener): () => void;
};

export function createChangeChannel(): ChangeChannel {
  const listeners = new Set<ChangeListener>();

  return {
    publish(change) {
      for (const listener of [...listeners]) {
        listener(change);
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const globalKey = Symbol.for('ticket.changeChannel');
type GlobalWithChannel = typeof globalThis & {
  [globalKey]?: ChangeChannel;
};

/**
 * The one in-process channel the app uses. It lives on `globalThis`, so
 * Server Actions and route handlers share it and it survives dev-mode module
 * reloads.
 */
export function appChangeChannel(): ChangeChannel {
  const global = globalThis as GlobalWithChannel;
  global[globalKey] ??= createChangeChannel();
  return global[globalKey];
}
