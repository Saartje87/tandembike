const second = 1000;
const minute = 60 * second;
const hour = 60 * minute;
const day = 24 * hour;

/** A duration compactly: "45s", "3m", "1h 12m", "2d". Negative counts as 0. */
export function formatElapsed(milliseconds: number): string {
  const ms = Math.max(0, milliseconds);
  if (ms < minute) {
    return `${Math.floor(ms / second)}s`;
  }
  if (ms < hour) {
    return `${Math.floor(ms / minute)}m`;
  }
  if (ms < day) {
    const minutes = Math.floor((ms % hour) / minute);
    return `${Math.floor(ms / hour)}h${minutes ? ` ${minutes}m` : ''}`;
  }
  return `${Math.floor(ms / day)}d`;
}
