import type { FC, ReactNode } from 'react';

type ProjectLayoutProps = {
  children: ReactNode;
  ticket: ReactNode;
};

const ProjectLayout: FC<ProjectLayoutProps> = ({ children, ticket }) => (
  <>
    {children}
    {ticket}
  </>
);

export default ProjectLayout;
