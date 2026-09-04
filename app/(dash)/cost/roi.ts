/**
 * The revenue-recovery model behind the ROI calculator. Pure arithmetic, no
 * I/O: the page seeds two of the inputs from measured data and the calculator
 * lets the viewer edit the rest.
 *
 * The case this makes is not labour substitution. Every missed call during a
 * cold snap is a lost ticket, and some of those tickets are install leads. The
 * agent's own cost is charged on every call it answers — not only the ones
 * that would otherwise have been missed — so the model does not flatter it.
 */

export interface RoiInputs {
  /** Inbound calls a month. Default 600 — a 40-tech shop across three counties. */
  callsPerMonth: number;
  /** Share of calls that ring out during peaks, 0–1. Default 0.25. */
  missedCallRate: number;
  /** Share of answered calls that become a booking, 0–1. Default 0.55. */
  bookingRateOnAnswered: number;
  /** Average service ticket. Default $425. */
  avgTicketUsd: number;
  /** Share of bookings that turn into an install lead, 0–1. Default 0.05. */
  installLeadRate: number;
  /** Average install. Default $9,500. */
  avgInstallUsd: number;
  /** Seeded from getCostSummary().avgPerCallUsd; the page falls back to $0.10. */
  agentCostPerCallUsd: number;
  /** Seeded from getAfterHoursShare().pct / 100, 0–1. */
  afterHoursShare: number;
}

export interface RoiOutputs {
  /** callsPerMonth × missedCallRate */
  missedCallsPerMonth: number;
  /** missedCalls × bookingRateOnAnswered */
  recoveredBookingsPerMonth: number;
  /** recoveredBookings × avgTicketUsd */
  recoveredServiceRevenueUsd: number;
  /** recoveredBookings × installLeadRate × avgInstallUsd */
  recoveredInstallRevenueUsd: number;
  /** callsPerMonth × agentCostPerCallUsd — the agent answers every call. */
  agentMonthlyCostUsd: number;
  /** service + install − agent cost */
  netMonthlyUsd: number;
  /**
   * Calls the agent must handle before one recovered ticket has paid for them:
   * ceil(avgTicketUsd / agentCostPerCallUsd). Zero when the agent costs nothing.
   */
  paybackCalls: number;
}

export const DEFAULT_ROI_INPUTS: Omit<RoiInputs, "agentCostPerCallUsd" | "afterHoursShare"> = {
  callsPerMonth: 600,
  missedCallRate: 0.25,
  bookingRateOnAnswered: 0.55,
  avgTicketUsd: 425,
  installLeadRate: 0.05,
  avgInstallUsd: 9500,
};

export function computeRoi(i: RoiInputs): RoiOutputs {
  const missedCallsPerMonth = i.callsPerMonth * i.missedCallRate;
  const recoveredBookingsPerMonth = missedCallsPerMonth * i.bookingRateOnAnswered;
  const recoveredServiceRevenueUsd = recoveredBookingsPerMonth * i.avgTicketUsd;
  const recoveredInstallRevenueUsd = recoveredBookingsPerMonth * i.installLeadRate * i.avgInstallUsd;
  const agentMonthlyCostUsd = i.callsPerMonth * i.agentCostPerCallUsd;
  const netMonthlyUsd = recoveredServiceRevenueUsd + recoveredInstallRevenueUsd - agentMonthlyCostUsd;
  return {
    missedCallsPerMonth,
    recoveredBookingsPerMonth,
    recoveredServiceRevenueUsd,
    recoveredInstallRevenueUsd,
    agentMonthlyCostUsd,
    netMonthlyUsd,
    paybackCalls: paybackCalls(i.avgTicketUsd, i.agentCostPerCallUsd),
  };
}

/**
 * A free agent pays for itself before the first call, so 0 rather than the
 * Infinity a bare division would give. The ratio is rounded to a millionth
 * before the ceiling so binary float noise (425 / 0.1 is not always exactly
 * 4250 in every arithmetic path) cannot add a phantom call.
 */
function paybackCalls(avgTicketUsd: number, agentCostPerCallUsd: number): number {
  if (agentCostPerCallUsd <= 0 || !Number.isFinite(agentCostPerCallUsd)) return 0;
  const ratio = Number((avgTicketUsd / agentCostPerCallUsd).toFixed(6));
  return Math.max(0, Math.ceil(ratio));
}
