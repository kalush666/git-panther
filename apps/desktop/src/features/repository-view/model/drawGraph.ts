import { LANE_COLOR_COUNT } from '@git-panther/design-tokens';

import type { GraphRowDto } from '../../../shared/ipc';
import { DOT_RADIUS, ROW_HEIGHT, laneX, paletteIndex, rowLines } from './graphGeometry';

export interface GraphPalette {
  lanes: string[];
  background: string;
}

/** Reads the lane colors of the active theme from the design tokens. */
export function readPalette(element: Element): GraphPalette {
  const style = getComputedStyle(element);
  return {
    lanes: Array.from({ length: LANE_COLOR_COUNT }, (_, lane) =>
      style.getPropertyValue(`--gp-lane-${lane}`).trim(),
    ),
    background: style.getPropertyValue('--gp-bg-canvas').trim(),
  };
}

export interface VisibleRow {
  index: number;
  row: GraphRowDto;
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
  context.lineWidth = 2;
  context.lineCap = 'round';

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

  for (const { index, row } of rows) {
    const x = laneX(row.lane);
    const y = index * ROW_HEIGHT - scrollTop + ROW_HEIGHT / 2;
    context.beginPath();
    context.arc(x, y, DOT_RADIUS + 1.5, 0, Math.PI * 2);
    context.fillStyle = palette.background;
    context.fill();
    context.beginPath();
    context.arc(x, y, DOT_RADIUS, 0, Math.PI * 2);
    context.fillStyle = color(row.color);
    context.fill();
  }
}
