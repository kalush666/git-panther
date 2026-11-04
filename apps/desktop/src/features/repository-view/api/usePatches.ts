import { useQueryClient } from '@tanstack/react-query';

import { ipc, unwrap } from '../../../shared/ipc';
import { repositoryQueryKey } from './useRepository';
import type { Report } from '../ui/useBranchActions';

export interface PatchActions {
  /** Copies commit `id` as a patch to the clipboard. */
  copy: (id: string, label: string) => void;
  /** Applies a .patch / .diff file the user picks. */
  applyFile: () => void;
  /** Applies the patch on the clipboard, e.g. pasted from a mail. */
  applyClipboard: () => void;
}

/** Copying commits as patches and applying patches, reported in the banner. */
export function usePatches(path: string, report: Report): PatchActions {
  const queryClient = useQueryClient();
  const attempt = async (work: () => Promise<string | null>) => {
    try {
      const done = await work();
      if (done) {
        report('done', done);
        await queryClient.invalidateQueries({ queryKey: repositoryQueryKey(path) });
      }
    } catch (error) {
      report('error', error instanceof Error ? error.message : String(error));
    }
  };

  return {
    copy: (id, label) => {
      void attempt(async () => {
        const patch = unwrap(await ipc.commitPatch(path, id));
        await navigator.clipboard.writeText(patch);
        return `Copied ${label} as a patch`;
      });
    },
    applyFile: () => {
      void attempt(async () => {
        const file = await ipc.pickPatchFile('Apply a patch');
        if (!file) return null;
        unwrap(await ipc.applyPatchFile(path, file));
        return `Applied ${file.split(/[\\/]/).pop() ?? file} to your changes`;
      });
    },
    applyClipboard: () => {
      void attempt(async () => {
        const text = await navigator.clipboard.readText();
        unwrap(await ipc.applyPatch(path, text));
        return 'Applied the patch from the clipboard to your changes';
      });
    },
  };
}
