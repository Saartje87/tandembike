import { appDatabase } from '../tickets/app-tickets';
import { createSettings, type Settings } from './settings';

/**
 * The Settings module the app uses, over the app's database. Only Server
 * Actions and the app's own reads call it: no MCP tool may.
 */
export function appSettings(): Settings {
  return createSettings(appDatabase());
}
