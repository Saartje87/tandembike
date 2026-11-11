import { Text } from '@blockle/blocks';
import type { Metadata } from 'next';
import { type FC, Suspense } from 'react';

import { AgentCommandsForm } from '../../../../components/agent-commands-form/agent-commands-form';
import { AgentSettings } from '../../../../components/agent-settings/agent-settings';
import { AutomationSettings } from '../../../../components/automation-settings/automation-settings';
import { GeneralSettings } from '../../../../components/general-settings/general-settings';
import { PageLoading } from '../../../../components/page-loading/page-loading';
import { ProjectSettings } from '../../../../components/project-settings/project-settings';
import { ReferenceTemplateEditor } from '../../../../components/reference-template-editor/reference-template-editor';
import { RepositorySettings } from '../../../../components/repository-settings/repository-settings';
import { SettingsSection } from '../../../../components/settings-section/settings-section';
import { appConversations } from '../../../../conversations/app-conversations';
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
  const tickets = appTickets('user');
  const settings = tickets.getProjectAgentSettings(project.id);
  const agentKinds = await appConversations().agentKinds();
  const latestSetup =
    appConversations()
      .list({ projectId: project.id })
      .find(({ intent }) => intent === 'setup') ?? null;
  return (
    <ProjectSettings
      hasRepository={settings.repositoryPath !== null}
      panels={{
        general: <GeneralSettings project={project} />,
        repository: (
          <RepositorySettings
            projectId={project.id}
            settings={settings}
            latestSetup={latestSetup}
          />
        ),
        agent: (
          <AgentSettings
            projectId={project.id}
            settings={settings}
            latestSetup={latestSetup}
            agentKinds={agentKinds}
          />
        ),
        automation: (
          <AutomationSettings
            projectId={project.id}
            settings={settings}
            agentKinds={agentKinds}
          />
        ),
        commands: (
          <AgentCommandsForm
            projectId={project.id}
            commands={tickets.getProjectAgentCommands(project.id)}
          />
        ),
        references: (
          <SettingsSection
            section="references"
            title="References"
            description="Turn External reference keys such as #55 into links."
            help={
              <Text tag="p" fontSize="small" color="muted">
                A key starting with a prefix opens the URL, with {'{n}'}{' '}
                replaced by the rest of the key. The first matching template
                applies.
              </Text>
            }
          >
            <ReferenceTemplateEditor
              projectId={project.id}
              templates={tickets.listReferenceTemplates(project.id)}
            />
          </SettingsSection>
        ),
      }}
    />
  );
}

/**
 * A Project's Settings tab: one tab per section, each saving on its own
 * (ADR 0053), under the Project's layout. It streams in behind its own
 * boundary, as the Backlog tab does.
 */
const SettingsPage: FC<ProjectPageProps> = ({ params }) => (
  <Suspense fallback={<PageLoading />}>{settingsTab(params)}</Suspense>
);

export default SettingsPage;
