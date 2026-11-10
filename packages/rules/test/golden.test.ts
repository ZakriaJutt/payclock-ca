import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { runGolden, type GoldenFile } from '../golden/run.ts';

describe('T-3.1.7 golden-case runner (UT-12 mechanism, catalogue cases only)', () => {
  it('every synthetic catalogue case reproduces exactly', () => {
    const file = JSON.parse(readFileSync(new URL('../golden/catalogue-cases.json', import.meta.url), 'utf8')) as GoldenFile;
    const { passed, failures } = runGolden(file);
    expect(failures).toEqual([]);
    expect(passed).toBe(file.cases.length);
  });

  it('the runner reports a mismatch (a deliberately wrong expectation fails)', () => {
    const { failures } = runGolden({
      source: 'test',
      base_events: [{ type: 'EV-11', on: '2026-02-10' }, { type: 'EV-12', on: '2025-11-03' }],
      cases: [{ id: 'wrong', events: [{ type: 'EV-01', on: '2026-10-08' }], expect: [{ clock: 'CLK-04', date: '2026-11-13' }] }],
    });
    expect(failures).toHaveLength(1);
  });
});
