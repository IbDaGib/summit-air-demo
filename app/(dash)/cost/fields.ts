/**
 * How the calculator's text fields become numbers for computeRoi. Pure and
 * tested here because the component cannot be: there is no DOM in the test
 * runner, and the policy — what an emptied or negative field means — is the
 * kind of thing that quietly drifts when it lives inline in an onChange.
 *
 * Percent fields are shown 0–100 and stored 0–1; counts and dollars are
 * stored as typed.
 */

export type FieldKind = "count" | "percent" | "usd";

/** 0.25 → 25; 0.07 → 7 (not 7.000000000000001). One decimal of percent survives. */
export const toPercent = (rate: number): number => Math.round(rate * 1000) / 10;

/** 25 → 0.25, clamped to 0–100 first so a stray keystroke cannot exceed 100%. */
export const fromPercent = (p: number): number => Math.min(Math.max(p, 0), 100) / 100;

/**
 * The raw text of a field → the number the model runs on.
 *
 * An emptied or unparseable field is zero, never "keep the old value", which
 * would hide the edit. Negatives clamp to zero: nothing here can be owed.
 * "12." mid-typing is 12, so the decimal point does not zero the field.
 */
export function parseFieldValue(kind: FieldKind, raw: string): number {
  const parsed = Number(raw); // "" → 0, "12." → 12, "abc" → NaN
  const n = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  return kind === "percent" ? fromPercent(n) : n;
}

/** Integer when whole, one decimal when fractional — "83" or "82.5". Display only. */
export function tenth(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 1 });
}
