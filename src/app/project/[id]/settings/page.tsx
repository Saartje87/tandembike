import { Heading, Stack, Text } from '@blockle/blocks';
import type { Metadata } from 'next';
import { type FC, Suspense } from 'react';

import { PageLoading } from '../../../../components/page-loading/page-loading';
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
  return (
    <Stack gap={3} tag="section" aria-labelledby="reference-templates">
      <Stack gap={1}>
        <Heading level={2} id="reference-templates">
          Reference templates
        </Heading>
        <Text tag="p" fontSize="small" color="muted">
          Link External reference keys, such as #55 or ABC-33: a key starting
          with a prefix opens the URL, with {'{n}'} replaced by the rest of the
          key. The first matching template applies.
        </Text>
      </Stack>
      <ReferenceTemplateEditor
        projectId={project.id}
        templates={appTickets('user').listReferenceTemplates(project.id)}
      />
    </Stack>
  );
}

/**
 * A Project's Settings tab: its Reference templates, under the Project's
 * layout. It streams in behind its own boundary, as the Backlog tab does.
 */
const SettingsPage: FC<ProjectPageProps> = ({ params }) => (
  <Suspense fallback={<PageLoading />}>{settingsTab(params)}</Suspense>
);

export default SettingsPage;
