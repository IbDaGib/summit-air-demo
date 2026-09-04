import type { CallVolume } from "../_data/metrics";

/** Booked over calls that reached an outcome. Unresolved calls are not failures to book; they never got that far. */
export function bookingRate(v: CallVolume): number {
  const resolved = v.booked + v.escalated + v.callback;
  return resolved === 0 ? 0 : v.booked / resolved;
}

export function escalationRate(v: CallVolume): number {
  return v.total === 0 ? 0 : v.escalated / v.total;
}
