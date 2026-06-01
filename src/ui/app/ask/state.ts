/**
 * Ask-mode state. A small mutable singleton, mirroring the rest of the app's
 * `state` convention. Kept free of DOM/`window` so the answer model and brief
 * builder stay unit-testable.
 */
import type { AskSpec } from "../../../ask-spec.ts";

export type AskPhase = "answer" | "review" | "sent";

/** One question's answer. Fields are populated per the question's mode. */
export interface AnswerValue {
  /** single | compare */
  choiceId: string | null;
  /** multi */
  choiceIds: string[];
  /** rank — option ids in priority order (top first) */
  order: string[];
  /** text */
  text: string;
  /** optional free-text note (single | multi | compare) */
  note: string;
}

export type AnswerMap = Record<string, AnswerValue>;

export interface AskState {
  spec: AskSpec;
  idx: number;
  phase: AskPhase;
  answers: AnswerMap;
  /** keys "<questionId>:<optionId>" whose hider drawer is open */
  openHiders: Set<string>;
}

/** Build the initial answer map from a spec (rank starts in given option order). */
export function initAnswers(spec: AskSpec): AnswerMap {
  const map: AnswerMap = {};
  for (const q of spec.questions) {
    map[q.id] = {
      choiceId: null,
      choiceIds: [],
      order: q.mode === "rank" && q.options ? q.options.map((o) => o.id) : [],
      text: "",
      note: "",
    };
  }
  return map;
}

/** The live Ask session. `spec` is replaced at boot from the injected config. */
export const ask: AskState = {
  spec: { questions: [] },
  idx: 0,
  phase: "answer",
  answers: {},
  openHiders: new Set<string>(),
};

/** Reset to a fresh session for the given spec (used at boot and on "Start over"). */
export function resetAsk(spec: AskSpec): void {
  ask.spec = spec;
  ask.idx = 0;
  ask.phase = "answer";
  ask.answers = initAnswers(spec);
  ask.openHiders = new Set<string>();
}

/** Has the question at index `i` been answered (vs skipped)? */
export function isAnswered(spec: AskSpec, answers: AnswerMap, i: number): boolean {
  const q = spec.questions[i];
  if (!q) return false;
  const a = answers[q.id];
  if (!a) return false;
  if (q.mode === "single" || q.mode === "compare") return a.choiceId != null;
  if (q.mode === "multi") return a.choiceIds.length > 0;
  if (q.mode === "text") return a.text.trim().length > 0;
  return true; // rank always has an order
}
