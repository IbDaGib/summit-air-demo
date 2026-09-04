/**
 * Money, count, percent and duration formatters shared by every dashboard page.
 *
 * The signatures are a contract: other pages import these by name, so change
 * behaviour here with a test, never the shape. Every formatter accepts
 * `null | undefined` and answers with an em dash, so a card with no data reads
 * as "—" rather than "$0.00" pretending to be a measurement.
 *
 * All output is en-US. Nothing here is locale-aware on purpose: the dashboard
 * is screen-shared, and the same number must read the same on every machine.
 */

const DASH = "—";

const money = (opts: Intl.NumberFormatOptions) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", ...opts });

/** "$0.10", "$1.04", "$99.50" — sub-$100 amounts keep their cents. */
const cents = money({ minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** "$100", "$1,040" — at $100 and up, cents are noise. */
const whole = money({ minimumFractionDigits: 0, maximumFractionDigits: 0 });
/** "$0.078" — unit rates below a dollar need the third decimal to differ. */
const mills = money({ minimumFractionDigits: 3, maximumFractionDigits: 3 });
/** "1.0", "12.5" — the mantissa of a compact figure. */
const oneDecimal = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const isMissing = (n: number | null | undefined): n is null | undefined =>
  n == null || !Number.isFinite(n);

/**
 * usd(0.1036) → "$0.10"; usd(1040) → "$1,040"; usd(1040, {compact:true}) → "$1.0k".
 * Two decimals below $100, whole dollars from $100 up. Compact abbreviates
 * thousands and millions to one decimal and leaves smaller amounts alone.
 */
export function usd(n: number | null | undefined, opts?: { compact?: boolean }): string {
  if (isMissing(n)) return DASH;
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (opts?.compact && abs >= 1_000_000) return `${sign}$${oneDecimal.format(abs / 1_000_000)}M`;
  if (opts?.compact && abs >= 1_000) return `${sign}$${oneDecimal.format(abs / 1_000)}k`;
  return abs < 100 ? cents.format(n) : whole.format(n);
}

/** usdPerUnit(0.0781, "min") → "$0.078 / min". Three decimals below a dollar, else as usd. */
export function usdPerUnit(n: number | null | undefined, unit: string): string {
  if (isMissing(n)) return DASH;
  const amount = Math.abs(n) < 1 ? mills.format(n) : usd(n);
  return `${amount} / ${unit}`;
}

/** count(4250) → "4,250"; count(82.5) → "83". A whole-number tally, thousands grouped. */
export function count(n: number | null | undefined): string {
  if (isMissing(n)) return DASH;
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

/** pct(100) → "100%"; pct(7.5) → "7.5%"; pct(0) → "0%". One decimal only below ten. */
export function pct(n: number | null | undefined): string {
  if (isMissing(n)) return DASH;
  const digits = Math.abs(n) < 10 ? 1 : 0;
  return `${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: digits })}%`;
}

/** duration(80) → "1m 20s"; duration(45) → "45s"; duration(3600) → "1h 0m". */
export function duration(seconds: number | null | undefined): string {
  if (isMissing(seconds)) return DASH;
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}
