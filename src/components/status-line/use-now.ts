import { useEffect, useState } from 'react';

const minute = 60_000;

/** The current time in milliseconds, renewed once a minute. */
export const useNow = (): number => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), minute);
    return () => clearInterval(timer);
  }, []);

  return now;
};
