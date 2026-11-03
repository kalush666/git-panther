import { LANE_COLOR_COUNT } from '@git-panther/design-tokens';

import type { GraphRowDto } from '../../../shared/ipc';
import {
  MERGE_DOT_RADIUS,
  NODE_RADIUS,
  ROW_HEIGHT,
  isMergeRow,
  laneX,
  paletteIndex,
  rowLines,
} from './graphGeometry';

const LINE_WIDTH = 2.5;
const RING_WIDTH = 2;
const NODE_FILL_ALPHA = 0.22;
const HEAD_HALO = 4;

export interface GraphPalette {
  lanes: string[];
  background: string;
  text: string;
  font: string;
}

/** Reads the lane colors and fonts of the active theme from the design tokens. */
export function readPalette(element: Element): GraphPalette {
  const style = getComputedStyle(element);
  const token = (name: string) => style.getPropertyValue(`--gp-${name}`).trim();
  return {
    lanes: Array.from({ length: LANE_COLOR_COUNT }, (_, lane) => token(`lane-${lane}`)),
    background: token('bg-canvas'),
    text: token('text-primary'),
    font: token('font-ui'),
  };
}

export interface VisibleRow {
  index: number;
  row: GraphRowDto;
  initials: string;
  /** The row has branch or tag labels, joined to the node by a connector. */
  hasRefs: boolean;
  isHead: boolean;
}

/**
 * Draws the visible rows. `scrollTop` is the scroll offset of the list, so
 * row `index` is drawn at `index * ROW_HEIGHT - scrollTop`.
 */
export function drawGraph(
  context: CanvasRenderingContext2D,
  rows: readonly VisibleRow[],
  scrollTop: number,
  palette: GraphPalette,
): void {
  const color = (index: number) => palette.lanes[paletteIndex(index)] ?? palette.lanes[0] ?? '';
  const centreY = (index: number) => index * ROW_HEIGHT - scrollTop + ROW_HEIGHT / 2;

  context.lineCap = 'round';
  context.lineWidth = LINE_WIDTH;
  for (const { index, row } of rows) {
    for (const line of rowLines(row, index * ROW_HEIGHT - scrollTop)) {
      context.strokeStyle = color(line.color);
      context.beginPath();
      context.moveTo(line.x1, line.y1);
      if (line.x1 === line.x2) {
        context.lineTo(line.x2, line.y2);
      } else {
        // Ease into the new lane so merges read as curves, not kinks.
        const bend = (line.y1 + line.y2) / 2;
        context.bezierCurveTo(line.x1, bend, line.x2, bend, line.x2, line.y2);
      }
      context.stroke();
    }
  }

  for (const visible of rows) {
    if (visible.hasRefs) {
      drawConnector(context, visible, centreY(visible.index), color(visible.row.color));
    }
  }

  for (const visible of rows) {
    const x = laneX(visible.row.lane);
    const y = centreY(visible.index);
    const laneColor = color(visible.row.color);
    if (isMergeRow(visible.row)) {
      drawMergeDot(context, x, y, laneColor, palette);
    } else {
      drawCommitNode(context, x, y, laneColor, visible, palette);
    }
  }
}

/** A line from the label column to the node, so labels point at their commit. */
function drawConnector(
  context: CanvasRenderingContext2D,
  { row }: VisibleRow,
  y: number,
  laneColor: string,
): void {
  context.save();
  context.globalAlpha = 0.7;
  context.lineWidth = 1.5;
  context.strokeStyle = laneColor;
  context.beginPath();
  context.moveTo(0, y);
  context.lineTo(laneX(row.lane) - NODE_RADIUS, y);
  context.stroke();
  context.restore();
}

function drawMergeDot(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  laneColor: string,
  palette: GraphPalette,
): void {
  context.beginPath();
  context.arc(x, y, MERGE_DOT_RADIUS + RING_WIDTH, 0, Math.PI * 2);
  context.fillStyle = palette.background;
  context.fill();
  context.beginPath();
  context.arc(x, y, MERGE_DOT_RADIUS, 0, Math.PI * 2);
  context.fillStyle = laneColor;
  context.fill();
}

/** A lane-colored ring around the author's initials; the checked-out commit gets a halo. */
function drawCommitNode(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  laneColor: string,
  { initials, isHead }: VisibleRow,
  palette: GraphPalette,
): void {
  if (isHead) {
    context.save();
    context.globalAlpha = 0.35;
    context.beginPath();
    context.arc(x, y, NODE_RADIUS + HEAD_HALO, 0, Math.PI * 2);
    context.fillStyle = laneColor;
    context.fill();
    context.restore();
  }
  context.beginPath();
  context.arc(x, y, NODE_RADIUS, 0, Math.PI * 2);
  context.fillStyle = palette.background;
  context.fill();
  context.save();
  context.globalAlpha = NODE_FILL_ALPHA;
  context.fillStyle = laneColor;
  context.fill();
  context.restore();
  context.lineWidth = RING_WIDTH;
  context.strokeStyle = laneColor;
  context.stroke();

  context.fillStyle = palette.text;
  context.font = `600 8.5px ${palette.font}`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(initials, x, y + 0.5);
}
