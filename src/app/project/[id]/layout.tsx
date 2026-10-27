import { Stack } from '@blockle/blocks';
import { type FC, type ReactNode, Suspense } from 'react';

import { ArchivedProjectNotice } from '../../../components/archived-project-notice/archived-project-notice';
import { PageLoading } from '../../../components/page-loading/page-loading';
import { ProjectHeader } from '../../../components/project-header/project-header';
import { ProjectTabs } from '../../../components/project-tabs/project-tabs';
import { appTickets } from '../../../tickets/app-tickets';
import { findProject, type ProjectPageProps } from './project-data';

type ProjectLayoutProps = ProjectPageProps & {
  children: ReactNode;
};

async function projectShell(
  params: ProjectPageProps['params'],
  children: ReactNode,
) {
  const project = await findProject(params);
  if (!project) {
    // The tab shows the not-found page, inside this segment's boundary.
    return children;
  }
  if (project.archived) {
    // Its tabs and their content are hidden until it is restored.
    return <ArchivedProjectNotice project={project} />;
  }
  return (
    <Stack gap={4}>
      <ProjectHeader project={project}>
        <ProjectTabs
          projectId={project.id}
          cycles={appTickets('user').listCycles(project.id)}
        />
      </ProjectHeader>
      {children}
    </Stack>
  );
}

/**
 * A Project's header and tabs above the tab on screen. The layout stays
 * mounted while switching tabs, so only the tab's content, behind its own
 * boundary, shows a loading state (T239). The header and tabs are
 * request-time data too, and stream in behind this boundary.
 */
const ProjectLayout: FC<ProjectLayoutProps> = ({ params, children }) => (
  <Suspense fallback={<PageLoading />}>
    {projectShell(params, children)}
  </Suspense>
);

export default ProjectLayout;
