'use client';

import { Box, Inline, Stack } from '@blockle/blocks';
import {
  type FC,
  type ReactNode,
  useOptimistic,
  useState,
  useTransition,
} from 'react';

import { styleProject } from '../../app/projects/actions';
import type { Project, StyleProjectInput } from '../../tickets/tickets';
import { tintBackground } from '../palette/palette.css';
import {
  type ProjectConversationItem,
  ProjectConversations,
} from '../project-conversations/project-conversations';
import { ProjectStylePicker } from '../project-style-picker/project-style-picker';
import { RenameProjectInlineEdit } from '../rename-project-inline-edit/rename-project-inline-edit';

export type ProjectHeaderProps = {
  project: Project;
  /** Shown under the name, inside the band: the Project's tabs. */
  children?: ReactNode;
  /** The Project's open Conversations, for the Conversations button. */
  conversations?: ProjectConversationItem[];
};

type Style = Pick<Project, 'color' | 'icon'>;

const applyPick = (style: Style, pick: StyleProjectInput): Style => ({
  ...style,
  ...pick,
});

/**
 * A Project's header above each of its tabs: its icon, which opens
 * the colour and icon picker, its name, and `children`, on a soft band of
 * its colour when it has one. Its padding does not depend on the colour, so
 * a pick changes only the background. A pick shows at once and goes back,
 * with the reason in the picker, when it is refused.
 */
export const ProjectHeader: FC<ProjectHeaderProps> = ({
  project,
  children,
  conversations,
}) => {
  const [style, showPick] = useOptimistic<Style, StyleProjectInput>(
    { color: project.color, icon: project.icon },
    applyPick,
  );
  const [error, setError] = useState<string>();
  const [, startTransition] = useTransition();

  const pick = (change: StyleProjectInput) => {
    setError(undefined);
    startTransition(async () => {
      showPick(change);
      const result = await styleProject({ projectId: project.id, ...change });
      if (!result.ok) {
        setError(result.error);
      }
    });
  };

  return (
    <Box
      asChild
      borderRadius={3}
      paddingBlock={2}
      paddingInline={3}
      className={style.color ? tintBackground[style.color] : undefined}
    >
      <section aria-label={project.name} data-color={style.color ?? undefined}>
        <Stack gap={4}>
          <Inline gap={1} alignY="center" flexWrap="nowrap">
            <ProjectStylePicker style={style} onPick={pick} error={error} />
            <RenameProjectInlineEdit key={project.id} project={project} />
            {conversations && (
              <ProjectConversations
                projectId={project.id}
                items={conversations}
              />
            )}
          </Inline>
          {children}
        </Stack>
      </section>
    </Box>
  );
};
