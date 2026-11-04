import type { DragEvent } from 'react';

/** Drag-and-drop payload: the dragged branch's name. */
const BRANCH_DRAG_TYPE = 'application/x-git-panther-branch';

/** Starts dragging `branch` (from the branch list or a graph label). */
export function startBranchDrag(event: DragEvent, branch: string) {
  event.dataTransfer.setData(BRANCH_DRAG_TYPE, branch);
  // Some engines hide custom types until drop; plain text keeps `types` honest.
  event.dataTransfer.setData('text/plain', branch);
  event.dataTransfer.effectAllowed = 'link';
}

/** Whether a branch is being dragged over `event`'s target. */
export function isBranchDrag(event: DragEvent): boolean {
  return event.dataTransfer.types.includes(BRANCH_DRAG_TYPE);
}

/** The dragged branch, once dropped. */
export function droppedBranch(event: DragEvent): string | null {
  return event.dataTransfer.getData(BRANCH_DRAG_TYPE) || null;
}

/**
 * Drop handlers for a branch label: highlights while a different branch is
 * over it, then reports `source` dropped on `target` at the pointer.
 */
export function branchDropHandlers(
  target: string,
  setOver: (over: boolean) => void,
  onDrop: (source: string, target: string, x: number, y: number) => void,
) {
  return {
    onDragOver: (event: DragEvent) => {
      if (!isBranchDrag(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'link';
      setOver(true);
    },
    onDragLeave: () => {
      setOver(false);
    },
    onDrop: (event: DragEvent) => {
      setOver(false);
      const source = droppedBranch(event);
      if (!source || source === target) return;
      event.preventDefault();
      event.stopPropagation();
      onDrop(source, target, event.clientX, event.clientY);
    },
  };
}
