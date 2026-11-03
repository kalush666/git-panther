const shortFormat = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});
const longFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeStyle: 'long' });

/** Unix seconds as a compact local date and time, e.g. "3 Nov 26, 20:16". */
export function formatCommitTime(unixSeconds: number): string {
  return shortFormat.format(unixSeconds * 1000);
}

/** Unix seconds with weekday and time zone, for the details panel. */
export function formatCommitTimeLong(unixSeconds: number): string {
  return longFormat.format(unixSeconds * 1000);
}
