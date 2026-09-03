/**
 * Shared domain types. Owned by main — do not edit in a workspace.
 */

export type PropertyType = "residential" | "commercial";

export type IssueKind =
  | "no_heat"
  | "no_cooling"
  | "poor_performance"
  | "noise_or_smell"
  | "maintenance"
  | "install_quote"
  | "other";

/** Life-safety hazards. Any value other than "none" forces the escalation path. */
export type Hazard = "gas_smell" | "co_alarm" | "smoke_or_burning" | "none";

export type Priority = "P0" | "P1" | "P2" | "P3";

export type County = "Gallatin" | "Park" | "Madison";

/**
 * Facts the model extracts from the conversation. The model reports facts only —
 * it never chooses the Priority. See policy/priority.ts.
 */
export interface SituationFacts {
  propertyType: PropertyType;
  issue: IssueKind;
  /** System is completely non-functional, as opposed to underperforming. */
  systemDown: boolean;
  hazard: Hazard;
  /** Elderly, infant, medically vulnerable, or oxygen-dependent occupant on site. */
  vulnerableOccupant: boolean;
  /** Free text, e.g. "grandmother, 84, lives alone". Never a medical record. */
  occupantDetail?: string;
  town?: string;
  /** Current outdoor temp for the caller's town, injected by the runtime. */
  outdoorTempF?: number;
  /** Commercial only: is the business unable to operate? */
  revenueStopped?: boolean;
}

export interface PriorityResult {
  tier: Priority;
  /** Human-readable justification. Goes on the dispatch ticket. */
  reason: string;
  /** What the agent may promise the caller. */
  responseTarget: string;
  /** True when the agent must escalate and must NOT book. */
  blockBooking: boolean;
}
