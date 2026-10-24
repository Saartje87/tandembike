import type { FC } from 'react';

// A navigation within the app keeps a slot's last page when the new URL has
// no match in it, so every other route clears the trail here.
const NoBreadcrumbs: FC = () => null;

export default NoBreadcrumbs;
