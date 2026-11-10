import { describe, expect, it } from 'vitest';
import { clock, ev, run } from './fixtures.ts';

describe('T-3.1.2 UT-08 rule-version selection', () => {
  it('EV-11 2019-09-30 (procurement 2019-06-03) gives ON-NOPP: lien clocks only', () => {
    const out = run([ev('EV-11', '2019-09-30'), ev('EV-12', '2019-06-03'), ev('EV-07', '2026-09-18'), ev('EV-01', '2026-10-08')]);
    expect(out.regime.family).toBe('ON-NOPP');
    expect(clock(out, 'CLK-09', 'b').ruleVersionCode).toBe('ON-NOPP');
    expect(clock(out, 'CLK-09', 'b').statutoryDate).toBe('2026-11-17');
    expect(clock(out, 'CLK-04').state).toBe('not_applicable');
    expect(clock(out, 'CLK-17').state).toBe('not_applicable');
    expect(clock(out, 'CLK-11').state).toBe('not_applicable');
  });

  it('EV-11 2019-10-01 with EV-12 2019-09-15 gives ON-NOPP', () => {
    const out = run([ev('EV-11', '2019-10-01'), ev('EV-12', '2019-09-15')]);
    expect(out.regime.family).toBe('ON-NOPP');
  });

  it('EV-11 2018-06-30 gives ON-LEGACY, not computed, L-06', () => {
    const out = run([ev('EV-11', '2018-06-30'), ev('EV-07', '2026-09-18'), ev('EV-01', '2026-10-08')]);
    expect(out.regime.family).toBe('ON-LEGACY');
    for (const r of out.results) {
      expect(r.state).toBe('not_computable');
      expect(r.statutoryDate).toBeNull();
      expect(r.flags).toContain('L-06');
    }
  });

  it('EV-12 unknown gives not_computable + L-06 on every clock, never a default', () => {
    const out = run([ev('EV-11', '2026-02-10'), ev('EV-12', null), ev('EV-07', '2026-09-18'), ev('EV-01', '2026-10-08')]);
    expect(out.regime.family).toBeNull();
    expect(out.results.length).toBeGreaterThan(0);
    for (const r of out.results) {
      expect(r.state).toBe('not_computable');
      expect(r.missingFacts).toContain('EV-12');
      expect(r.flags).toContain('L-06');
    }
  });

  it('EV-12 not recorded at all is treated the same as unknown', () => {
    const out = run([ev('EV-11', '2026-02-10')]);
    expect(out.regime.family).toBeNull();
    expect(out.regime.missingFacts).toEqual(['EV-12']);
  });

  it('EV-11 2026-02-10 with EV-12 2025-11-03 gives ON-2026-01; clock version by governing date', () => {
    const out = run([ev('EV-11', '2026-02-10'), ev('EV-12', '2025-11-03'), ev('EV-01', '2026-10-08')]);
    expect(out.regime.family).toBe('POST-2019');
    expect(clock(out, 'CLK-04').ruleVersionCode).toBe('ON-2026-01');
    // A trigger in 2025 is governed by ON-2019-10 (selection by the clock's governing date, not today).
    const old = run([ev('EV-11', '2025-01-10'), ev('EV-12', '2024-11-03'), ev('EV-01', '2025-10-08')]);
    expect(clock(old, 'CLK-04').ruleVersionCode).toBe('ON-2019-10');
    expect(clock(old, 'CLK-04').statutoryDate).toBe('2025-11-12');
  });

  it('leased premises: unknown lease facts in the 2018 window give L-06; an early lease gives ON-LEGACY', () => {
    const facts = [ev('EV-11', '2018-08-01'), ev('EV-12', '2018-07-15')];
    const unknownLease = run(facts, { project: { premisesLeased: 'unknown', leaseFirstEnteredOn: null, municipalInterest: 'no' } });
    expect(unknownLease.regime.family).toBeNull();
    expect(unknownLease.regime.flags).toContain('L-06');
    const early = run(facts, { project: { premisesLeased: 'yes', leaseFirstEnteredOn: '2017-01-01' as never, municipalInterest: 'no' } });
    expect(early.regime.family).toBe('ON-LEGACY');
    const notLeased = run(facts);
    expect(notLeased.regime.family).toBe('ON-NOPP');
  });

  it('every computed deadline names its rule version and carries L-01 while the version is unsigned', () => {
    const out = run([ev('EV-11', '2026-02-10'), ev('EV-12', '2025-11-03'), ev('EV-01', '2026-10-08'), ev('EV-07', '2026-09-18')]);
    for (const r of out.results.filter((x) => x.state === 'computed' || x.state === 'provisional')) {
      expect(r.ruleVersionCode).not.toBeNull();
      expect(r.flags).toContain('L-01');
    }
  });
});
