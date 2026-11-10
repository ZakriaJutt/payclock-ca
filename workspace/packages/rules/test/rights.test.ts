import { describe, expect, it } from 'vitest';
import { addDays, civil, RULE_VERSIONS, type CivilDate } from '../src/index.ts';
import { PRIME, clock, ev, run } from './fixtures.ts';

describe('T-3.1.4 lien (CLK-09/10) and adjudication (CLK-11)', () => {
  it('UT-10: no certificate; EV-07 2026-09-30 -> CLK-09b 2026-11-29 un-extended, act-by 2026-11-19, CLK-10 2027-02-27', () => {
    const out = run([...PRIME(), ev('EV-07', '2026-09-30')]);
    expect(clock(out, 'CLK-09', 'a').state).toBe('not_applicable');
    const b = clock(out, 'CLK-09', 'b');
    expect(b).toMatchObject({ state: 'computed', bound: 'exact', statutoryDate: '2026-11-29', actByDate: '2026-11-19' });
    // 2026-11-29 is a Sunday: the extended day depends on L-09 and is withheld, never output.
    expect(b.withheld).toContainEqual({ output: 'extended_date', question: 'L-09' });
    expect(b.flags).toEqual(expect.arrayContaining(['L-04', 'L-09']));
    expect(JSON.stringify(b)).not.toContain('2026-11-30');
    const p = clock(out, 'CLK-10', 'b');
    expect(p).toMatchObject({ state: 'computed', statutoryDate: '2027-02-27' });
  });

  it('UT-10: corrected EV-07 2026-09-18 -> 2026-11-17, act-by 2026-11-07, CLK-10 2027-02-15 (Family Day, un-extended, withheld)', () => {
    const out = run([...PRIME(), ev('EV-07', '2026-09-18')]);
    expect(clock(out, 'CLK-09', 'b')).toMatchObject({ statutoryDate: '2026-11-17', actByDate: '2026-11-07' });
    const p = clock(out, 'CLK-10', 'b');
    expect(p.statutoryDate).toBe('2027-02-15');
    expect(p.withheld).toContainEqual({ output: 'extended_date', question: 'L-09' });
    expect(JSON.stringify(p)).not.toContain('2027-02-16');
  });

  it('UT-10: EV-08 unknown -> provisional, no_later_than, missing EV-08', () => {
    const out = run([...PRIME(), ev('EV-07', '2026-09-18'), ev('EV-08', null)]);
    const b = clock(out, 'CLK-09', 'b');
    expect(b).toMatchObject({ state: 'provisional', bound: 'no_later_than', statutoryDate: '2026-11-17' });
    expect(b.missingFacts).toContain('EV-08');
    expect(clock(out, 'CLK-10', 'b')).toMatchObject({ state: 'provisional', bound: 'no_later_than' });
  });

  it('UT-11: EV-07 2026-09-18 -> CLK-11 2026-12-17; holdback Form 6 by 2027-02-24, window 2027-04-23..2027-05-07; pre-2026 contract L-07', () => {
    const out = run([...PRIME(), ev('EV-07', '2026-09-18'), ev('EV-13', '2027-02-22')]);
    expect(clock(out, 'CLK-11')).toMatchObject({ state: 'computed', statutoryDate: '2026-12-17' });
    expect(clock(out, 'CLK-13', 'form6')).toMatchObject({ state: 'computed', statutoryDate: '2027-02-24' });
    expect(clock(out, 'CLK-13', 'pay')).toMatchObject({ state: 'computed', statutoryDate: '2027-04-23', windowEndDate: '2027-05-07' });
    const pre = run([ev('EV-11', '2025-05-01'), ev('EV-12', '2025-01-15'), ev('EV-13', '2027-02-22')]);
    for (const v of ['form6', 'pay']) {
      const r = clock(pre, 'CLK-13', v);
      expect(r.state).toBe('not_computable');
      expect(r.statutoryDate).toBeNull();
      expect(r.flags).toContain('L-07');
    }
  });

  it('CLK-14: contractor pays sub holdback 14 days after EV-14', () => {
    const out = run([...PRIME(), ev('EV-14', '2027-05-03')]);
    expect(clock(out, 'CLK-14').statutoryDate).toBe('2027-05-17');
  });

  it('UT-15: EV-17 2026-09-10, EV-18 2026-09-15 in time, EV-07 2026-09-16: CLK-09b from publication, CLK-11 from termination', () => {
    const out = run([...PRIME(), ev('EV-17', '2026-09-10'), ev('EV-18', '2026-09-15'), ev('EV-07', '2026-09-16')]);
    expect(clock(out, 'CLK-09', 'b')).toMatchObject({ state: 'computed', statutoryDate: '2026-11-14' });
    expect(clock(out, 'CLK-11')).toMatchObject({ state: 'computed', statutoryDate: '2026-12-09' });
    expect(clock(out, 'CLK-09', 'b').flags).not.toContain('L-11');
  });

  it('UT-15: Form 8 published late (2026-09-21): CLK-09b 2026-11-09 with L-11; CLK-11 unchanged', () => {
    const out = run([...PRIME(), ev('EV-17', '2026-09-10'), ev('EV-18', '2026-09-21'), ev('EV-07', '2026-09-16')]);
    const b = clock(out, 'CLK-09', 'b');
    expect(b.statutoryDate).toBe('2026-11-09');
    expect(b.flags).toContain('L-11');
    expect(clock(out, 'CLK-11').statutoryDate).toBe('2026-12-09');
  });

  it('UT-15 ceiling rule: EV-17 unknown, EV-18 2026-09-15, EV-07 2026-09-16 -> CLK-11 no later than 2026-12-14, never 2026-12-15', () => {
    const out = run([...PRIME(), ev('EV-17', null), ev('EV-18', '2026-09-15'), ev('EV-07', '2026-09-16')]);
    const adj = clock(out, 'CLK-11');
    expect(adj).toMatchObject({ state: 'provisional', bound: 'no_later_than', statutoryDate: '2026-12-14' });
    expect(adj.statutoryDate).not.toBe('2026-12-15');
    expect(JSON.stringify(adj)).not.toContain('2026-12-15');
    expect(adj.missingFacts).toContain('EV-17');
    expect(adj.flags).toContain('L-11');
    const b = clock(out, 'CLK-09', 'b');
    expect(b).toMatchObject({ state: 'provisional', bound: 'no_later_than', statutoryDate: '2026-11-14' });
    expect(b.missingFacts).toContain('EV-17');
    expect(b.flags).toContain('L-11');
  });

  it('UT-15 ceiling rule also applies when EV-17 is simply not recorded but Form 8 is', () => {
    const out = run([...PRIME(), ev('EV-18', '2026-09-15'), ev('EV-07', '2026-09-16')]);
    expect(clock(out, 'CLK-11')).toMatchObject({ bound: 'no_later_than', statutoryDate: '2026-12-14', state: 'provisional' });
  });

  it('UT-15: no exact CLK-11 date ever results from EV-18 (any EV-18, EV-17 unknown)', () => {
    for (let i = 0; i < 40; i++) {
      const pub = addDays(civil('2026-08-01'), i);
      const out = run([...PRIME(), ev('EV-17', null), ev('EV-18', pub)]);
      const adj = clock(out, 'CLK-11');
      expect(adj.bound).toBe('no_later_than');
      expect(adj.state).toBe('provisional');
    }
  });

  it('safety sweep: the ceiling is never later than the true date for any termination on or before publication', () => {
    const pub = civil('2026-09-15');
    const supply = civil('2026-09-16');
    const ceiling = run([...PRIME(), ev('EV-17', null), ev('EV-18', pub), ev('EV-07', supply)]);
    const c11 = clock(ceiling, 'CLK-11').statutoryDate!;
    const c09 = clock(ceiling, 'CLK-09', 'b').statutoryDate!;
    for (let back = 0; back <= 120; back++) {
      const t: CivilDate = addDays(pub, -back);
      const truth = run([...PRIME(), ev('EV-17', t), ev('EV-18', pub), ev('EV-07', supply)]);
      expect(clock(truth, 'CLK-11').statutoryDate! <= c11).toBe(true);
      expect(clock(truth, 'CLK-09', 'b').statutoryDate! <= c09).toBe(true);
    }
  });

  it('safety sweep: with EV-08 unknown, the lien date is never later than with any actual publication date', () => {
    const supply = civil('2026-10-15');
    const unknown = clock(run([...PRIME(), ev('EV-08', null), ev('EV-07', supply)]), 'CLK-09', 'b').statutoryDate!;
    for (let i = 0; i < 90; i++) {
      const pubDate = addDays(civil('2026-08-01'), i);
      const sp = addDays(pubDate, -5);
      const out = run([...PRIME(), ev('EV-08', pubDate), ev('EV-19', sp), ev('EV-07', supply)]);
      for (const v of ['a', 'b']) {
        const r = clock(out, 'CLK-09', v);
        if (r.statutoryDate) expect(r.statutoryDate <= unknown).toBe(true);
      }
    }
  });

  it('termination event types are never substituted: EV-09 completion is its own trigger', () => {
    const out = run([...PRIME(), ev('EV-09', '2026-09-05'), ev('EV-07', '2026-09-16')]);
    expect(clock(out, 'CLK-11').statutoryDate).toBe(addDays(civil('2026-09-05'), 90));
    expect(clock(out, 'CLK-09', 'b').statutoryDate).toBe(addDays(civil('2026-09-05'), 60));
    // EV-18 without EV-17 must never be read as EV-09 or as an exact termination.
    const pubOnly = run([...PRIME(), ev('EV-18', '2026-09-01')]);
    expect(clock(pubOnly, 'CLK-11').bound).toBe('no_later_than');
  });

  it('Form 8 published before 2026-01-01: old s. 31(6)-(7) not encoded -> CLK-09 not computed with L-11', () => {
    const out = run([ev('EV-11', '2025-03-01'), ev('EV-12', '2025-01-15'), ev('EV-17', '2025-12-20'), ev('EV-18', '2025-12-22'), ev('EV-07', '2026-01-05')]);
    const b = clock(out, 'CLK-09', 'b');
    expect(b.state).toBe('not_computable');
    expect(b.flags).toContain('L-11');
  });

  it('UT-16: two liens: CLK-09a 2026-10-31, CLK-09b 2026-12-14; unknown publication -> one date no later than 2026-12-14', () => {
    const out = run([...PRIME(), ev('EV-19', '2026-08-25'), ev('EV-08', '2026-09-01'), ev('EV-07', '2026-10-15')]);
    expect(clock(out, 'CLK-09', 'a')).toMatchObject({ state: 'computed', statutoryDate: '2026-10-31' });
    expect(clock(out, 'CLK-09', 'b')).toMatchObject({ state: 'computed', statutoryDate: '2026-12-14' });

    const unknown = run([...PRIME(), ev('EV-19', null), ev('EV-08', null), ev('EV-07', '2026-10-15')]);
    const dated = unknown.results.filter((r) => r.clockCode === 'CLK-09' && r.statutoryDate !== null);
    expect(dated).toHaveLength(1);
    expect(dated[0]).toMatchObject({ variant: 'b', state: 'provisional', bound: 'no_later_than', statutoryDate: '2026-12-14' });
    expect(dated[0]!.notes.join(' ')).toMatch(/may be earlier/);
    expect(dated[0]!.suggestedActions).toContain('s39_4_publication_request');
    expect(clock(unknown, 'CLK-09', 'a').state).toBe('not_computable');
  });

  it('variant b does not apply when all supply was on or before substantial performance', () => {
    const out = run([...PRIME(), ev('EV-19', '2026-09-20'), ev('EV-08', '2026-09-25'), ev('EV-07', '2026-09-10')]);
    expect(clock(out, 'CLK-09', 'a').statutoryDate).toBe('2026-11-09');
    expect(clock(out, 'CLK-09', 'b').state).toBe('not_applicable');
  });

  it('nothing recorded: rights clocks are not computable naming EV-07, never "OK"', () => {
    const out = run([...PRIME()]);
    expect(clock(out, 'CLK-09', 'b')).toMatchObject({ state: 'not_computable', missingFacts: ['EV-07'] });
    expect(clock(out, 'CLK-11')).toMatchObject({ state: 'not_computable', missingFacts: ['EV-07'] });
    expect(clock(out, 'CLK-09', 'b').flags).toContain('L-04');
  });

  it('Decision 4.5: EV-07 2026-09-30 -> 2026-09-18 moves CLK-11 2026-12-29 -> 2026-12-17', () => {
    expect(clock(run([...PRIME(), ev('EV-07', '2026-09-30')]), 'CLK-11').statutoryDate).toBe('2026-12-29');
    expect(clock(run([...PRIME(), ev('EV-07', '2026-09-18')]), 'CLK-11').statutoryDate).toBe('2026-12-17');
  });

  it('rights rows are un-extended, carry L-09 and a 10-day act-by buffer in every computed version', () => {
    for (const v of RULE_VERSIONS) {
      for (const c of v.clocks.filter((x) => ['CLK-09', 'CLK-10', 'CLK-11'].includes(x.clockCode))) {
        expect(c.extendOnHoliday).toBe(false);
        expect(c.pendingQuestion).toBe('L-09');
        expect(c.actByBufferDays).toBe(10);
      }
    }
  });
});
