import { describe, expect, it } from 'vitest';
import { PRIME, ev, run } from './fixtures.ts';

describe('UT-13 determinism and independence', () => {
  const prime = PRIME();
  const facts = () => [
    ...prime,
    ev('EV-01', '2026-10-08', { id: 'e1' }),
    ev('EV-02', '2026-10-08', { id: 'e2' }),
    ev('EV-04', '2026-11-07', { id: 'e3' }),
    ev('EV-07', '2026-09-18', { id: 'e4' }),
    ev('EV-17', null, { id: 'e5' }),
    ev('EV-18', '2026-09-15', { id: 'e6' }),
  ];

  it('same facts in shuffled order give identical outputs and inputs_hash', () => {
    const a = run(facts());
    const shuffled = facts().reverse();
    const b = run([shuffled[3]!, ...shuffled.slice(0, 3), ...shuffled.slice(4)]);
    expect(b.inputsHash).toBe(a.inputsHash);
    expect(JSON.stringify(b.results)).toBe(JSON.stringify(a.results));
  });

  it('a flag on one clock (late Form 1.3, L-05) leaves every other clock unchanged', () => {
    const a = run(facts());
    const b = run([...facts(), ev('EV-05', '2026-11-20', { noticeForm: '1.3', id: 'e7', receivedOn: '2026-11-20' })]);
    expect(b.inputsHash).not.toBe(a.inputsHash);
    const changed = b.results.filter((r) => JSON.stringify(r) !== JSON.stringify(a.results.find((x) => x.clockCode === r.clockCode && x.variant === r.variant && x.invoiceId === r.invoiceId)));
    expect(new Set(changed.map((r) => r.clockCode))).toEqual(new Set(['CLK-17', 'CLK-16']));
    for (const code of ['CLK-09', 'CLK-10', 'CLK-11', 'CLK-04']) {
      expect(JSON.stringify(b.results.filter((r) => r.clockCode === code))).toBe(JSON.stringify(a.results.filter((r) => r.clockCode === code)));
    }
  });

  it('computed results never carry missing facts or a no_later_than bound (schema check mirrored)', () => {
    const out = run(facts());
    for (const r of out.results) {
      if (r.state === 'computed') {
        expect(r.missingFacts).toEqual([]);
        expect(r.bound).toBe('exact');
        expect(r.statutoryDate).not.toBeNull();
      }
      if (r.bound === 'no_later_than') expect(r.state).toBe('provisional');
    }
  });
});
