import type { Project } from '../../tickets/tickets';
import { projectPath, projectsPath } from './paths';

/**
 * Where the home page sends the User: the first active Project's Board, the
 * Projects page when every Project is archived, or nowhere (`undefined`) so
 * it can ask for a first Project.
 */
export function homeRedirect(projects: Project[]): string | undefined {
  const first = projects.find((project) => !project.archived);
  if (first) {
    return projectPath(first.id);
  }
  return projects.length > 0 ? projectsPath() : undefined;
}
