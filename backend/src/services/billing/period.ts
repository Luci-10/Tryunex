// Allowance periods run on calendar months in Asia/Kolkata, which is where
// the product is priced and sold. Stored as UTC instants either side.

const TZ_OFFSET_MINUTES = 5 * 60 + 30; // IST has no DST

function toIst(d: Date) {
  return new Date(d.getTime() + TZ_OFFSET_MINUTES * 60_000);
}

/** [start, end) of the calendar month `now` falls in, as UTC instants. */
export function monthPeriod(now = new Date()): { start: Date; end: Date } {
  const ist = toIst(now);
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth();
  // Midnight IST on the 1st == 18:30 UTC on the last day of the prior month.
  const startUtc = Date.UTC(y, m, 1) - TZ_OFFSET_MINUTES * 60_000;
  const endUtc = Date.UTC(y, m + 1, 1) - TZ_OFFSET_MINUTES * 60_000;
  return { start: new Date(startUtc), end: new Date(endUtc) };
}

/** Stable key for the current month, used in idempotency keys. */
export function monthKey(now = new Date()): string {
  const ist = toIst(now);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}`;
}
