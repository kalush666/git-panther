import type { RefLabelDto } from '../../../shared/ipc';

/** One label in the Branch / Tag column. */
export interface RefPill {
  name: string;
  kind: 'branch' | 'tag';
  /** A local branch with this name exists. */
  isLocal: boolean;
  /** Remotes (e.g. `origin`) whose branch of the same name is on this commit. */
  remotes: string[];
  isHead: boolean;
}

function splitRemote(name: string): { remote: string; branch: string } {
  const slash = name.indexOf('/');
  return slash === -1
    ? { remote: '', branch: name }
    : { remote: name.slice(0, slash), branch: name.slice(slash + 1) };
}

/**
 * Folds `origin/main` into `main` when both point at the same commit, so a
 * commit shows one label per branch. Order: the checked-out branch, other
 * branches, then tags.
 */
export function groupRefs(refs: readonly RefLabelDto[]): RefPill[] {
  const branches = new Map<string, RefPill>();
  const tags: RefPill[] = [];

  for (const ref of refs) {
    if (ref.kind === 'tag') {
      tags.push({ name: ref.name, kind: 'tag', isLocal: false, remotes: [], isHead: false });
      continue;
    }
    const { remote, branch } =
      ref.kind === 'remoteBranch' ? splitRemote(ref.name) : { remote: '', branch: ref.name };
    const pill = branches.get(branch) ?? {
      name: branch,
      kind: 'branch' as const,
      isLocal: false,
      remotes: [],
      isHead: false,
    };
    if (ref.kind === 'localBranch') {
      pill.isLocal = true;
      pill.isHead ||= ref.isHead;
    } else {
      pill.remotes.push(remote);
    }
    branches.set(branch, pill);
  }

  const ordered = [...branches.values()].sort(
    (a, b) => Number(b.isHead) - Number(a.isHead) || Number(b.isLocal) - Number(a.isLocal),
  );
  return [...ordered, ...tags];
}

/** Up to two initials from a person's name, e.g. "Ada Byron" → "AB". */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0], words.at(-1)] : [words[0]];
  return letters.map(firstCharacter).join('').toUpperCase();
}

/** The first character, keeping surrogate pairs (e.g. emoji) intact. */
function firstCharacter(word: string | undefined): string {
  const codePoint = word?.codePointAt(0);
  return codePoint === undefined ? '' : String.fromCodePoint(codePoint);
}
