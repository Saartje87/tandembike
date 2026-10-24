import type { Project } from '../../tickets/tickets';
import { projectPath } from './paths';

/**
 * Where the home page sends the User: the first Project's Board, or nowhere
 * (`undefined`) so it can ask for a first Project.
 */
export function homeRedirect(projects: Project[]): string | undefined {
  const [first] = projects;
  return first ? projectPath(first.id) : undefined;
}
