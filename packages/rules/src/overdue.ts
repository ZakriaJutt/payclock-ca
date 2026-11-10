import type { CivilDate } from './civil-date.ts';
import type { ClockResult, EventFact } from './types.ts';

export interface OverdueRow {
  invoiceId: string;
  variant: string;
  overdue: boolean;
  unpaidCents: number;
  reason: string;
}

/**
 * Overdue is true only when the CLK-17 portion is `computed`, an amount remains unpaid and `asOf`
 * is after the (holiday-extended) due date. The engine has no clock: `asOf` is passed in.
 * Payments the sub received (EV-06) are applied to portions in due-date order.
 */
export function overdueStatus(results: ClockResult[], events: EventFact[], asOf: CivilDate): OverdueRow[] {
  const out: OverdueRow[] = [];
  const byInvoice = new Map<string, ClockResult[]>();
  for (const r of results) {
    if (r.clockCode !== 'CLK-17' || !r.invoiceId) continue;
    byInvoice.set(r.invoiceId, [...(byInvoice.get(r.invoiceId) ?? []), r]);
  }
  for (const [invoiceId, portions] of byInvoice) {
    let received = events
      .filter((e) => e.type === 'EV-06' && e.invoiceId === invoiceId && e.occurredOn !== null && e.occurredOn <= asOf)
      .reduce((s, e) => s + (e.amountCents ?? 0), 0);
    const ordered = [...portions].sort((a, b) => (a.statutoryDate ?? '9999').localeCompare(b.statutoryDate ?? '9999'));
    for (const p of ordered) {
      const amount = p.amountCents ?? 0;
      const applied = Math.min(received, amount);
      received -= applied;
      const unpaid = amount - applied;
      let overdue = false;
      let reason: string;
      if (p.state !== 'computed' || p.statutoryDate === null) reason = `Due date is ${p.state}`;
      else if (unpaid <= 0) reason = 'Paid';
      else if (asOf > p.statutoryDate) {
        overdue = true;
        reason = `Overdue since ${p.statutoryDate}`;
      } else reason = `Due ${p.statutoryDate}`;
      out.push({ invoiceId, variant: p.variant, overdue, unpaidCents: unpaid, reason });
    }
  }
  return out;
}
