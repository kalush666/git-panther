/** The main branch names, most common first. */
const MAIN_BRANCHES = ['main', 'master'];
/** Branch prefixes that git flow merges into develop. */
const DEVELOP_PREFIXES = ['feature/', 'bugfix/'];

/**
 * The branch `current` will most likely be merged into: develop for feature
 * work when there is one, otherwise main; `null` for main itself.
 */
export function mergeTarget(current: string, localBranches: readonly string[]): string | null {
  const main = MAIN_BRANCHES.find((name) => localBranches.includes(name)) ?? null;
  if (main === null || current === main) return null;
  const toDevelop =
    localBranches.includes('develop') &&
    current !== 'develop' &&
    DEVELOP_PREFIXES.some((prefix) => current.startsWith(prefix));
  return toDevelop ? 'develop' : main;
}
