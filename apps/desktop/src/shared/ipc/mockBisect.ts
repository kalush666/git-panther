import type { BisectStatusDto, BisectVerdictDto } from './bindings';
import { mockGraphPage } from './mockGraph';

/** How far back a mock bisect may start. */
const SEARCHABLE_ROWS = 200;
/** The mock history's first bad commit: rows up to here are bad, older ones good. */
const FIRST_BAD_ROW = 3;

const IDLE: BisectStatusDto = {
  active: false,
  testing: null,
  stepsLeft: null,
  firstBad: null,
  good: [],
  bad: [],
};

/**
 * A bisect over the mock graph's rows (row 0 is HEAD, newer rows first),
 * where every row up to {@link FIRST_BAD_ROW} is bad.
 */
export function createMockBisect() {
  const ids = mockGraphPage(0, SEARCHABLE_ROWS).entries.map((entry) => entry.id);
  /** The newest known bad row and the oldest known good row. */
  let range: { bad: number; good: number } | null = null;
  let tested: { good: string[]; bad: string[] } = { good: [], bad: [] };

  const status = (): BisectStatusDto => {
    if (!range) return IDLE;
    const found = range.good - range.bad <= 1;
    const middle = Math.floor((range.bad + range.good) / 2);
    return {
      active: true,
      testing: found ? null : (ids[middle] ?? null),
      stepsLeft: found ? 0 : Math.max(0, Math.ceil(Math.log2(range.good - range.bad)) - 1),
      firstBad: found ? (ids[range.bad] ?? null) : null,
      ...tested,
    };
  };

  return {
    status,
    start: (bad: string, good: string): BisectStatusDto | null => {
      const badRow = bad === 'HEAD' ? 0 : ids.indexOf(bad);
      const goodRow = ids.indexOf(good);
      if (badRow < 0 || goodRow <= badRow) return null;
      range = { bad: badRow, good: goodRow };
      tested = { good: [good], bad: [ids[badRow] ?? bad] };
      return status();
    },
    mark: (verdict: BisectVerdictDto): BisectStatusDto | null => {
      if (!range) return null;
      const middle = Math.floor((range.bad + range.good) / 2);
      const id = ids[middle] ?? '';
      const bad = verdict === 'skip' ? middle <= FIRST_BAD_ROW : verdict === 'bad';
      if (bad) {
        range = { ...range, bad: middle };
        tested = { ...tested, bad: [...tested.bad, id] };
      } else {
        range = { ...range, good: middle };
        tested = { ...tested, good: [...tested.good, id] };
      }
      return status();
    },
    reset: () => {
      range = null;
      tested = { good: [], bad: [] };
    },
  };
}
