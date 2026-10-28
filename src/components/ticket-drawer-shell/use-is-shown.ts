import { useLayoutEffect, useState } from 'react';

/**
 * Whether a drawer is on screen: `false` on the server, during hydration
 * and while Next.js keeps the route hidden in an `<Activity>` after the User
 * navigates away; `true` otherwise. Effects run only for a visible route, so
 * the layout effect turns it on and its cleanup turns it off.
 *
 * Blocks' `Drawer` opens with `showModal()`, which throws on a dialog that is
 * already open, and it neither closes on hide nor accepts a server-rendered
 * `<dialog open>`. Rendering it only while shown gives every reveal a fresh
 * dialog and takes a hidden one out of the top layer.
 */
export const useIsShown = (): boolean => {
  const [shown, setShown] = useState(false);
  useLayoutEffect(() => {
    setShown(true);
    return () => setShown(false);
  }, []);
  return shown;
};
