import { Heading, Stack, Text } from '@blockle/blocks';
import type { Metadata } from 'next';
import { type FC, Suspense } from 'react';

import { AgentCommandsForm } from '../../../../components/agent-commands-form/agent-commands-form';
import { AgentSettingsForm } from '../../../../components/agent-settings-form/agent-settings-form';
import { PageLoading } from '../../../../components/page-loading/page-loading';
import { ReferenceTemplateEditor } from '../../../../components/reference-template-editor/reference-template-editor';
import { SkillsForm } from '../../../../components/skills-form/skills-form';
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
  return (
    <Stack gap={6}>
      <Stack gap={3} aria-labelledby="agent-settings" asChild>
        <section>
          <Stack gap={1}>
            <Heading level={2} id="agent-settings">
              Agents
            </Heading>
            <Text tag="p" fontSize="small" color="muted">
              The repository where Agent runs start. Only you can set these;
              Agents cannot read or change them.
            </Text>
          </Stack>
          <AgentSettingsForm
            projectId={project.id}
            settings={appTickets('user').getProjectAgentSettings(project.id)}
            latestSetup={
              appConversations()
                .list({ projectId: project.id })
                .find(({ intent }) => intent === 'setup') ?? null
            }
          />
        </section>
      </Stack>
      <Stack gap={3} aria-labelledby="skills" asChild>
        <section>
          <Stack gap={1}>
            <Heading level={2} id="skills">
              Skills
            </Heading>
            <Text tag="p" fontSize="small" color="muted">
              The Claude Code commands this Project's Conversations offer as
              chips above the message field, one per line, such as
              /mattpocock-skills:grilling. Only you can change them.
            </Text>
          </Stack>
          <SkillsForm
            projectId={project.id}
            skills={appTickets('user').getProjectSkills(project.id)}
          />
        </section>
      </Stack>
      <Stack gap={3} aria-labelledby="agent-commands" asChild>
        <section>
          <Stack gap={1}>
            <Heading level={2} id="agent-commands">
              Agent commands
            </Heading>
            <Text tag="p" fontSize="small" color="muted">
              The Claude Code commands a Ticket's Triage and Start buttons send
              before its number, such as /mattpocock-skills:implement T42. Start
              on an Epic uses the Epic command, or the Start command when that
              is blank. Blank sends a plain "Triage T42" or "Start T42".
            </Text>
          </Stack>
          <AgentCommandsForm
            projectId={project.id}
            commands={appTickets('user').getProjectAgentCommands(project.id)}
          />
        </section>
      </Stack>
      <Stack gap={3} aria-labelledby="reference-templates" asChild>
        <section>
          <Stack gap={1}>
            <Heading level={2} id="reference-templates">
              Reference templates
            </Heading>
            <Text tag="p" fontSize="small" color="muted">
              Link External reference keys, such as #55 or ABC-33: a key
              starting with a prefix opens the URL, with {'{n}'} replaced by the
              rest of the key. The first matching template applies.
            </Text>
          </Stack>
          <ReferenceTemplateEditor
            projectId={project.id}
            templates={appTickets('user').listReferenceTemplates(project.id)}
          />
        </section>
      </Stack>
    </Stack>
  );
}

/**
 * A Project's Settings tab: its agent settings, Skills, agent commands and
 * Reference templates, under the Project's layout. It streams in behind its own
 * boundary, as the Backlog tab does.
 */
const SettingsPage: FC<ProjectPageProps> = ({ params }) => (
  <Suspense fallback={<PageLoading />}>{settingsTab(params)}</Suspense>
);

export default SettingsPage;
