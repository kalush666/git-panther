import { useQueries, useQuery } from '@tanstack/react-query';

import { ipc, unwrap, type GraphEntryDto } from '../../../shared/ipc';
import { pagesForRange } from '../model/graphGeometry';
import { useHiddenRefs } from '../model/hiddenRefs';
import { repositoryQueryKey } from './useRepository';

export const GRAPH_PAGE_SIZE = 200;

// Graph keys live under the repository key, so the file watcher's
// invalidation of a repository refreshes its graph too.
const graphPageKey = (path: string, hidden: readonly string[], page: number) =>
  [...repositoryQueryKey(path), 'graph', hidden.join(','), page] as const;

const commitDetailsKey = (path: string, id: string) =>
  [...repositoryQueryKey(path), 'commit', id] as const;

/** Loads the pages covering rows `first..=last` (always including the first page for the total). */
export function useGraphPages(path: string, first: number, last: number) {
  const hidden = useHiddenRefs(path);
  const pages = [...new Set([0, ...pagesForRange(first, last, GRAPH_PAGE_SIZE)])];
  const results = useQueries({
    queries: pages.map((page) => ({
      queryKey: graphPageKey(path, hidden, page),
      queryFn: async () =>
        unwrap(await ipc.loadGraphPage(path, page * GRAPH_PAGE_SIZE, GRAPH_PAGE_SIZE, [...hidden])),
      staleTime: Infinity,
    })),
  });

  const entries = new Map<number, GraphEntryDto>();
  for (const result of results) {
    result.data?.entries.forEach((entry, position) => {
      entries.set(result.data.offset + position, entry);
    });
  }
  const firstPage = results[0];
  return {
    total: firstPage?.data?.total,
    error: results.find((result) => result.error)?.error ?? null,
    entryAt: (index: number) => entries.get(index),
  };
}

export function useCommitDetails(path: string, id: string | null) {
  return useQuery({
    queryKey: commitDetailsKey(path, id ?? ''),
    queryFn: async () => unwrap(await ipc.commitDetails(path, id ?? '')),
    enabled: id !== null,
    staleTime: Infinity,
  });
}

/** Graph rows matching `query`; empty while the query is blank. */
export function useCommitSearch(path: string, query: string) {
  const hidden = useHiddenRefs(path);
  const trimmed = query.trim();
  return useQuery({
    queryKey: [...repositoryQueryKey(path), 'search', hidden.join(','), trimmed],
    queryFn: async () => unwrap(await ipc.searchCommits(path, trimmed, [...hidden])),
    enabled: trimmed !== '',
    staleTime: Infinity,
  });
}

export function useFileHistory(path: string, file: string) {
  return useQuery({
    queryKey: [...repositoryQueryKey(path), 'fileHistory', file],
    queryFn: async () => unwrap(await ipc.fileHistory(path, file)),
  });
}

/** Where HEAD pointed recently, for recovering lost commits. */
export function useReflog(path: string) {
  return useQuery({
    queryKey: [...repositoryQueryKey(path), 'reflog'],
    queryFn: async () => unwrap(await ipc.reflog(path)),
  });
}

export function useBlame(path: string, file: string) {
  return useQuery({
    queryKey: [...repositoryQueryKey(path), 'blame', file],
    queryFn: async () => unwrap(await ipc.blameFile(path, file)),
  });
}
