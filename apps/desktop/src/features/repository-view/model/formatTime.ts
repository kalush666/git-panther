const shortFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const longFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeStyle: 'long' });

/** Unix seconds as a compact local date and time, e.g. "Nov 3, 2026, 7:28 PM". */
export function formatCommitTime(unixSeconds: number): string {
  return shortFormat.format(unixSeconds * 1000);
}

/** Unix seconds with weekday and time zone, for the details panel. */
export function formatCommitTimeLong(unixSeconds: number): string {
  return longFormat.format(unixSeconds * 1000);
}
