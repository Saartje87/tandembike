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
import { ProjectStylePicker } from '../project-style-picker/project-style-picker';
import { RenameProjectInlineEdit } from '../rename-project-inline-edit/rename-project-inline-edit';

export type ProjectHeaderProps = {
  project: Project;
  /** Shown under the name, inside the band: the Project's tabs. */
  children?: ReactNode;
};

type Style = Pick<Project, 'color' | 'icon'>;

const applyPick = (style: Style, pick: StyleProjectInput): Style => ({
  ...style,
  ...pick,
});

/**
 * A Project's header on its Board and History pages: its icon, which opens
 * the colour and icon picker, its name, and `children`, on a soft band of
 * its colour when it has one. A pick shows at once and goes back, with the
 * reason in the picker, when it is refused.
 */
export const ProjectHeader: FC<ProjectHeaderProps> = ({
  project,
  children,
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
      padding={style.color ? 4 : 0}
      className={style.color ? tintBackground[style.color] : undefined}
    >
      <section aria-label={project.name} data-color={style.color ?? undefined}>
        <Stack gap={4}>
          <Inline gap={1} alignY="center" flexWrap="nowrap">
            <ProjectStylePicker style={style} onPick={pick} error={error} />
            <RenameProjectInlineEdit key={project.id} project={project} />
          </Inline>
          {children}
        </Stack>
      </section>
    </Box>
  );
};
