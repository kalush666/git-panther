import { describe, expect, it } from 'vitest';

import {
  LANE_WIDTH,
  MAX_VISIBLE_LANES,
  ROW_HEIGHT,
  graphColumnWidth,
  isMergeRow,
  laneX,
  pagesForRange,
  paletteIndex,
  rowLines,
} from './graphGeometry';

describe('graph geometry', () => {
  it('spaces lanes evenly', () => {
    expect(laneX(1) - laneX(0)).toBe(LANE_WIDTH);
  });

  it('clips very wide graphs', () => {
    expect(graphColumnWidth(100)).toBe(graphColumnWidth(MAX_VISIBLE_LANES));
    expect(graphColumnWidth(0)).toBe(graphColumnWidth(1));
  });

  it('draws top segments in the upper half and bottom segments in the lower half', () => {
    const lines = rowLines(
      {
        lane: 0,
        color: 0,
        width: 2,
        top: [{ from: 1, to: 0, color: 3 }],
        bottom: [{ from: 0, to: 0, color: 0 }],
      },
      100,
    );
    expect(lines).toEqual([
      { x1: laneX(1), y1: 100, x2: laneX(0), y2: 100 + ROW_HEIGHT / 2, color: 3 },
      { x1: laneX(0), y1: 100 + ROW_HEIGHT / 2, x2: laneX(0), y2: 100 + ROW_HEIGHT, color: 0 },
    ]);
  });

  it('recognises merges by their extra parent lines', () => {
    const base = { lane: 0, color: 0, width: 2, top: [] };
    expect(
      isMergeRow({
        ...base,
        bottom: [
          { from: 0, to: 0, color: 0 },
          { from: 0, to: 1, color: 1 },
        ],
      }),
    ).toBe(true);
    expect(
      isMergeRow({
        ...base,
        bottom: [
          { from: 0, to: 0, color: 0 },
          { from: 1, to: 1, color: 1 },
        ],
      }),
    ).toBe(false);
  });

  it('wraps colors onto the palette', () => {
    expect(paletteIndex(9)).toBe(1);
  });

  it('lists every page a range touches', () => {
    expect(pagesForRange(0, 10, 200)).toEqual([0]);
    expect(pagesForRange(190, 410, 200)).toEqual([0, 1, 2]);
    expect(pagesForRange(-5, -1, 200)).toEqual([0]);
  });
});
