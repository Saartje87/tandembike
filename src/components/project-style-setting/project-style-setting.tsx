'use client';

import { type FC, useOptimistic, useState, useTransition } from 'react';

import { callAction } from '../../app/lib/call-action';
import { styleProject } from '../../app/projects/actions';
import type { Project, StyleProjectInput } from '../../tickets/tickets';
import { ProjectStylePicker } from '../project-style-picker/project-style-picker';

export type ProjectStyleSettingProps = {
  project: Pick<Project, 'id' | 'color' | 'icon'>;
};

type Style = Pick<Project, 'color' | 'icon'>;

const applyPick = (style: Style, pick: StyleProjectInput): Style => ({
  ...style,
  ...pick,
});

/**
 * A Project's colour and icon picker on its Settings, saving each pick at
 * once (ADR 0053). A pick shows at once and goes back, with the reason in
 * the picker, when it is refused.
 */
export const ProjectStyleSetting: FC<ProjectStyleSettingProps> = ({
  project,
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
      const result = await callAction(
        () => styleProject({ projectId: project.id, ...change }),
        'The colour and icon could not be saved. Try again.',
      );
      if (!result.ok) {
        setError(result.error);
      }
    });
  };

  return <ProjectStylePicker style={style} onPick={pick} error={error} />;
};
