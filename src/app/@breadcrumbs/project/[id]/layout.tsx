import { type FC, type ReactNode, Suspense } from 'react';

import {
  ProjectBreadcrumbs,
  type ProjectBreadcrumbsProps,
} from '../../../../components/project-breadcrumbs/project-breadcrumbs';

type ProjectBreadcrumbsLayoutProps = ProjectBreadcrumbsProps & {
  children: ReactNode;
};

// The trail lives in this layout, not the pages under it, so it stays mounted
// while a Ticket's drawer opens and closes over the Board.
const ProjectBreadcrumbsLayout: FC<ProjectBreadcrumbsLayoutProps> = ({
  params,
  children,
}) => (
  <>
    <Suspense fallback={null}>
      <ProjectBreadcrumbs params={params} />
    </Suspense>
    {children}
  </>
);

export default ProjectBreadcrumbsLayout;
