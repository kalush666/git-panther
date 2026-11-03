import { LANE_COLOR_COUNT, scaleTokens } from '@git-panther/design-tokens';

import type { GraphRowDto } from '../../../shared/ipc';

/** Height of one commit row, shared by the DOM list and the canvas. */
export const ROW_HEIGHT = Number.parseInt(scaleTokens['commit-row-height'], 10);
export const LANE_WIDTH = 22;
/** Commit nodes are large enough to hold the author's initials. */
export const NODE_RADIUS = 10;
/** Merge commits are drawn as small dots so they read as joins, not work. */
export const MERGE_DOT_RADIUS = 4;
const GRAPH_PADDING = 8;
/** Wider graphs are clipped so the message column stays readable. */
export const MAX_VISIBLE_LANES = 12;

export interface GraphLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: number;
}

/** Horizontal centre of `lane` within the graph column. */
export function laneX(lane: number): number {
  return GRAPH_PADDING + lane * LANE_WIDTH + LANE_WIDTH / 2;
}

export function graphColumnWidth(lanes: number): number {
  return GRAPH_PADDING * 2 + Math.min(Math.max(lanes, 1), MAX_VISIBLE_LANES) * LANE_WIDTH;
}

/** Lines for one row whose top edge is at `top` (in canvas pixels). */
export function rowLines(row: GraphRowDto, top: number): GraphLine[] {
  const middle = top + ROW_HEIGHT / 2;
  const bottom = top + ROW_HEIGHT;
  return [
    ...row.top.map((segment) => ({
      x1: laneX(segment.from),
      y1: top,
      x2: laneX(segment.to),
      y2: middle,
      color: segment.color,
    })),
    ...row.bottom.map((segment) => ({
      x1: laneX(segment.from),
      y1: middle,
      x2: laneX(segment.to),
      y2: bottom,
      color: segment.color,
    })),
  ];
}

/** Maps an unbounded color index onto the lane palette. */
export function paletteIndex(color: number): number {
  return color % LANE_COLOR_COUNT;
}

/** Page numbers needed to show rows `first..=last`. */
export function pagesForRange(first: number, last: number, pageSize: number): number[] {
  const firstPage = Math.floor(Math.max(first, 0) / pageSize);
  const lastPage = Math.floor(Math.max(last, first, 0) / pageSize);
  return Array.from({ length: lastPage - firstPage + 1 }, (_, offset) => firstPage + offset);
}

/** A merge commit connects down to more than one lane. */
export function isMergeRow(row: GraphRowDto): boolean {
  return (
    row.bottom.filter((segment) => segment.from === row.lane && segment.to !== row.lane).length > 0
  );
}
