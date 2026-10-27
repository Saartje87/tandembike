import { Heading, Stack, Text } from '@blockle/blocks';
import type { Metadata } from 'next';
import { type FC, Suspense } from 'react';

import { ArchivedProjectNotice } from '../../../../components/archived-project-notice/archived-project-notice';
import { PageLoading } from '../../../../components/page-loading/page-loading';
import { ProjectFrame } from '../../../../components/project-frame/project-frame';
import { ReferenceTemplateEditor } from '../../../../components/reference-template-editor/reference-template-editor';
import { appTickets } from '../../../../tickets/app-tickets';
import { loadProject, type ProjectPageProps } from '../project-data';

export async function generateMetadata({
  params,
}: ProjectPageProps): Promise<Metadata> {
  const project = await loadProject(params);
  return { title: `Settings · ${project.name}` };
}

async function settingsTab(params: ProjectPageProps['params']) {
  const project = await loadProject(params);
  if (project.archived) {
    return <ArchivedProjectNotice project={project} />;
  }
  const tickets = appTickets('user');
  return (
    <ProjectFrame
      project={project}
      cycles={tickets.listCycles(project.id)}
      current="settings"
    >
      <Stack gap={3} tag="section" aria-labelledby="reference-templates">
        <Stack gap={1}>
          <Heading level={2} id="reference-templates">
            Reference templates
          </Heading>
          <Text tag="p" fontSize="small" color="text-600">
            Link External reference keys, such as #55 or ABC-33: a key starting
            with a prefix opens the URL, with {'{n}'} replaced by the rest of
            the key. The first matching template applies.
          </Text>
        </Stack>
        <ReferenceTemplateEditor
          projectId={project.id}
          templates={tickets.listReferenceTemplates(project.id)}
        />
      </Stack>
    </ProjectFrame>
  );
}

/**
 * A Project's Settings tab: its Reference templates. It streams in behind its
 * own boundary, as the Backlog tab does.
 */
const SettingsPage: FC<ProjectPageProps> = ({ params }) => (
  <Suspense fallback={<PageLoading />}>{settingsTab(params)}</Suspense>
);

export default SettingsPage;
