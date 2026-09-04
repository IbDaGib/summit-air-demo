/** Shared eval types. */

/**
 * A fact the persona holds. `asks` is the question that unlocks it: the caller
 * reveals a fact only when the agent asks for it, which is the whole point of
 * the simulated caller.
 */
export interface PersonaFact {
  key: string;
  /** What the caller says when the agent asks. */
  value: string;
  /** Matches the agent's question that would reveal this fact. */
  asks: RegExp;
  /** Rare: stated unprompted, e.g. as part of the opening line. */
  volunteered?: boolean;
}

export type Difficulty = "easy" | "normal" | "hard";

export interface Persona {
  callerName: string;
  phone: string;
  /** Spoken verbatim as the caller's first turn. */
  opening: string;
  facts: PersonaFact[];
  difficulty: Difficulty;
  /** Extra colour for the caller model: mood, speech habits, what they care about. */
  notes?: string;
  /**
   * Lines the caller must deliver on a given turn regardless of what the agent
   * said — used for the adversarial pressure and the injection attempt.
   * Keyed by caller turn index (1 = the turn after the opening).
   */
  scriptedTurns?: Record<number, string>;
}

export interface Assertion {
  name: string;
  pass: boolean;
  detail: string;
}

export interface ToolCallRecord {
  name: string;
  args: Record<string, unknown>;
  result: unknown;
  /** Set when the deterministic backstop rewrote this call into an escalation. */
  forcedFrom?: string;
  /** Fields the runtime injected that the model did not supply. */
  injected?: Record<string, unknown>;
  error?: string;
  ms: number;
}

export interface TranscriptTurn {
  role: "agent" | "caller";
  text: string;
}

export type EndedBy = "end_call" | "turn_budget" | "caller_hung_up" | "error";

export interface CallRecording {
  transcript: TranscriptTurn[];
  toolCalls: ToolCallRecord[];
  endedBy: EndedBy;
  endOutcome?: string;
  callerTurns: number;
  usage: Record<string, { calls: number; inputTokens: number; outputTokens: number }>;
  error?: string;
}

export interface ScenarioContext {
  now: Date;
  outdoorTempF?: number;
}

export interface Scenario {
  id: string;
  title: string;
  /** Given to the judge so it knows what a good call looked like. */
  intent: string;
  persona: Persona;
  context: ScenarioContext;
  /** Maximum caller turns before the call is cut off as a failure to close. */
  turnBudget: number;
  assert(call: CallRecording): Assertion[];
}

export interface JudgeScores {
  naturalness: number;
  efficiency: number;
  informationAccuracy: number;
  safetyAdherence: number;
}

export interface JudgeResult extends JudgeScores {
  notes: Record<keyof JudgeScores, string>;
  summary: string;
}

export interface RunResult {
  scenarioId: string;
  runIndex: number;
  call: CallRecording;
  assertions: Assertion[];
  judge: JudgeResult | null;
  judgeSkippedBecause?: string;
}
