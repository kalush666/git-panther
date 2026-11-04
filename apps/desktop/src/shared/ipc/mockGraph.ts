import type {
  BlameLineDto,
  CommitDetailsDto,
  CommitSummaryDto,
  GraphEntryDto,
  GraphPageDto,
  GraphRowDto,
} from './bindings';

/** Commits in every mock repository's history. */
export const MOCK_HISTORY_LENGTH = 5_000;
const MOCK_START_TIME = 1_760_000_000;
const AUTHORS = ['Ada Byron', 'Grace Hopper', 'Linus T.', 'Margaret H.'];

/**
 * A repeating five-row pattern: a merge opens lane 1, which carries one topic
 * commit and rejoins lane 0 two rows later.
 */
const ROW_PATTERN: readonly Omit<GraphRowDto, 'color'>[] = [
  {
    lane: 0,
    width: 2,
    top: [{ from: 0, to: 0, color: 0 }],
    bottom: [
      { from: 0, to: 0, color: 0 },
      { from: 0, to: 1, color: 1 },
    ],
  },
  {
    lane: 1,
    width: 2,
    top: [
      { from: 0, to: 0, color: 0 },
      { from: 1, to: 1, color: 1 },
    ],
    bottom: [
      { from: 0, to: 0, color: 0 },
      { from: 1, to: 1, color: 1 },
    ],
  },
  {
    lane: 0,
    width: 2,
    top: [
      { from: 0, to: 0, color: 0 },
      { from: 1, to: 1, color: 1 },
    ],
    bottom: [
      { from: 0, to: 0, color: 0 },
      { from: 1, to: 1, color: 1 },
    ],
  },
  {
    lane: 0,
    width: 2,
    top: [
      { from: 0, to: 0, color: 0 },
      { from: 1, to: 0, color: 1 },
    ],
    bottom: [{ from: 0, to: 0, color: 0 }],
  },
  {
    lane: 0,
    width: 1,
    top: [{ from: 0, to: 0, color: 0 }],
    bottom: [{ from: 0, to: 0, color: 0 }],
  },
];

const INDEX_DIGITS = 32;

/** A hash-looking id: 8 scrambled hex digits, then the row index. */
function commitId(index: number): string {
  const scrambled = (Math.imul(index + 1, 2_654_435_761) >>> 0).toString(16).padStart(8, '0');
  return scrambled + index.toString(16).padStart(INDEX_DIGITS, '0');
}

function indexOf(id: string): number {
  return Number.parseInt(id.slice(-INDEX_DIGITS), 16);
}

function graphRow(index: number): GraphRowDto {
  const pattern = ROW_PATTERN[index % ROW_PATTERN.length];
  if (!pattern) {
    throw new Error('the modulo keeps the index inside ROW_PATTERN');
  }
  const isFirst = index === 0;
  const isLast = index === MOCK_HISTORY_LENGTH - 1;
  return {
    ...pattern,
    color: pattern.lane,
    top: isFirst ? [] : pattern.top,
    bottom: isLast ? [] : pattern.bottom,
  };
}

function entry(index: number): GraphEntryDto {
  const isMerge = index % ROW_PATTERN.length === 0;
  const id = commitId(index);
  return {
    id,
    shortId: id.slice(0, 7),
    summary: isMerge ? `Merge topic ${index}` : `Change number ${MOCK_HISTORY_LENGTH - index}`,
    bodyPreview: isMerge ? '' : 'Explains why the change was made.',
    author: {
      name: AUTHORS[index % AUTHORS.length] ?? 'Dev',
      email: 'dev@example.invalid',
      time: MOCK_START_TIME - index * 3_600,
    },
    refs:
      index === 0
        ? [
            { name: 'main', kind: 'localBranch', isHead: true },
            { name: 'origin/main', kind: 'remoteBranch', isHead: false },
          ]
        : index === 12
          ? [{ name: 'v1.0.0', kind: 'tag', isHead: false }]
          : [],
    graph: graphRow(index),
  };
}

export function mockGraphPage(offset: number, limit: number): GraphPageDto {
  const start = Math.min(offset, MOCK_HISTORY_LENGTH);
  const end = Math.min(start + limit, MOCK_HISTORY_LENGTH);
  return {
    total: MOCK_HISTORY_LENGTH,
    offset: start,
    entries: Array.from({ length: end - start }, (_, position) => entry(start + position)),
  };
}

export function mockCommitDetails(id: string): CommitDetailsDto | null {
  const index = indexOf(id);
  if (!Number.isInteger(index) || index < 0 || index >= MOCK_HISTORY_LENGTH) {
    return null;
  }
  const row = entry(index);
  return {
    id,
    parents: index + 1 < MOCK_HISTORY_LENGTH ? [commitId(index + 1)] : [],
    message: `${row.summary}\n\nExplains why the change was made.`,
    author: row.author,
    committer: row.author,
    changes: [
      { kind: 'modified', path: `src/file${index % 10}.ts` },
      { kind: 'added', path: `docs/note${index}.md` },
    ],
  };
}

/** Rows whose message, author or SHA contains `query`, like the real search. */
export function mockSearch(query: string): number[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return [];
  return mockGraphPage(0, MOCK_HISTORY_LENGTH)
    .entries.map((entry, row) => ({ entry, row }))
    .filter(
      ({ entry }) =>
        entry.summary.toLowerCase().includes(needle) ||
        entry.author.name.toLowerCase().includes(needle) ||
        entry.id.startsWith(needle),
    )
    .map(({ row }) => row);
}

/** A file's history: a handful of the newest non-merge commits. */
export function mockFileHistory(): CommitSummaryDto[] {
  return mockGraphPage(0, 12)
    .entries.filter((entry) => !entry.summary.startsWith('Merge'))
    .slice(0, 5)
    .map(({ id, shortId, summary, author }) => ({ id, shortId, summary, author }));
}

/** Twelve lines attributed to two alternating commits. */
export function mockBlame(file: string): BlameLineDto[] {
  const commits = mockFileHistory();
  return Array.from({ length: 12 }, (_, index) => {
    const commit = commits[Math.floor(index / 4) % commits.length] ?? commits[0];
    return {
      line: index + 1,
      commit: commit?.id ?? '',
      shortId: commit?.shortId ?? '',
      author: commit?.author.name ?? '',
      time: commit?.author.time ?? 0,
      summary: commit?.summary ?? '',
      content: index === 0 ? `// ${file}` : `const line${index + 1} = ${index + 1};`,
    };
  });
}
