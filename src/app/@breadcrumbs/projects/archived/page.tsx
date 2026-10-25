import type { FC } from 'react';

import { Breadcrumbs } from '../../../../components/breadcrumbs/breadcrumbs';
import { projectsPath } from '../../../lib/paths';

const ArchivedProjectsBreadcrumbs: FC = () => (
  <Breadcrumbs
    ancestors={[{ label: 'Projects', href: projectsPath() }]}
    current="Archived Projects"
  />
);

export default ArchivedProjectsBreadcrumbs;
