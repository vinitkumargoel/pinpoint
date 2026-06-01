/**
 * Shared contract for `pinpoint ask` — the new "complex question" mode.
 *
 * The caller (typically Claude Code) authors an AskSpec as JSON and hands it to
 * `pinpoint ask <spec.json>`. The Ask UI renders it; the user answers; a
 * structured decision brief comes back on stdout. This module is the single
 * source of truth for the shape, used by the CLI (validation), the server
 * (config injection) and the browser UI (types). It is intentionally free of
 * Node and DOM APIs so every layer — and the test suite — can import it.
 */

export type AskQuestionMode = "single" | "multi" | "rank" | "text" | "compare";

export const ASK_MODES: readonly AskQuestionMode[] = [
  "single",
  "multi",
  "rank",
  "text",
  "compare",
];

/** Modes that present a list of options to choose from / order. */
export const OPTION_MODES: readonly AskQuestionMode[] = ["single", "multi", "rank", "compare"];

export interface AskOption {
  /** Stable identifier returned in the decision. Required, unique within its question. */
  id: string;
  /** Short label shown on the option. Required. */
  name: string;
  /** One-line description under the name. */
  desc?: string;
  /** Small chip, e.g. "RECOMMENDED". */
  tag?: string;
  /** "The hider" — labelled detail rows revealed on demand: [label, value][]. */
  detail?: [string, string][];
  /** Optional code/text preview shown inside the hider. */
  code?: string;
  /** compare mode: a text/code preview rendered side-by-side for visual choice. */
  preview?: string;
}

export interface AskQuestion {
  /** Stable identifier; becomes the key in the returned decision. Required, unique. */
  id: string;
  mode: AskQuestionMode;
  /** The question itself. Required. */
  title: string;
  /** Claude's framing / background for the decision. */
  context?: string;
  /** Required for single | multi | rank | compare. Ignored for text. */
  options?: AskOption[];
  /** single | multi | compare: show an optional free-text note field. */
  allowNote?: boolean;
  /** text mode: placeholder for the textarea. */
  placeholder?: string;
}

export interface AskSpec {
  /** Optional headline above the question flow. */
  title?: string;
  /** Optional one-line intro. */
  intro?: string;
  /** One or more questions, asked in order. */
  questions: AskQuestion[];
}

/** Thrown by {@link parseAndValidateAskSpec} with a human-actionable message. */
export class AskSpecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AskSpecError";
  }
}

/** Sane upper bounds — keeps a pathological spec from producing an unusable, slow UI. */
const MAX_QUESTIONS = 20;
const MAX_OPTIONS = 50;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/**
 * Parse raw JSON and validate it against the AskSpec contract. Returns a clean,
 * normalized spec or throws {@link AskSpecError} with a precise message.
 */
export function parseAndValidateAskSpec(raw: string): AskSpec {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    throw new AskSpecError(`spec is not valid JSON: ${(e as Error).message}`);
  }
  if (!isPlainObject(data)) throw new AskSpecError("spec must be a JSON object");

  const questions = data.questions;
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new AskSpecError("spec.questions must be a non-empty array");
  }
  if (questions.length > MAX_QUESTIONS) {
    throw new AskSpecError(`spec.questions has ${questions.length} entries — keep it to ${MAX_QUESTIONS} or fewer`);
  }

  const seenQ = new Set<string>();
  const cleanQuestions: AskQuestion[] = questions.map((q, i) => validateQuestion(q, i, seenQ));

  return {
    title: asString((data as Record<string, unknown>).title),
    intro: asString((data as Record<string, unknown>).intro),
    questions: cleanQuestions,
  };
}

function validateQuestion(q: unknown, i: number, seen: Set<string>): AskQuestion {
  const at = `questions[${i}]`;
  if (!isPlainObject(q)) throw new AskSpecError(`${at} must be an object`);

  const id = asString(q.id);
  if (!id) throw new AskSpecError(`${at}.id is required (a non-empty string)`);
  if (seen.has(id)) throw new AskSpecError(`${at}.id "${id}" is duplicated — question ids must be unique`);
  seen.add(id);

  const mode = q.mode as AskQuestionMode;
  if (!ASK_MODES.includes(mode)) {
    throw new AskSpecError(`${at}.mode "${String(q.mode)}" is invalid — use one of: ${ASK_MODES.join(", ")}`);
  }

  const title = asString(q.title);
  if (!title) throw new AskSpecError(`${at}.title is required (the question text)`);

  let options: AskOption[] | undefined;
  if (OPTION_MODES.includes(mode)) {
    if (!Array.isArray(q.options) || q.options.length === 0) {
      throw new AskSpecError(`${at}.options must be a non-empty array for mode "${mode}"`);
    }
    if (q.options.length > MAX_OPTIONS) {
      throw new AskSpecError(`${at}.options has ${q.options.length} entries — keep it to ${MAX_OPTIONS} or fewer`);
    }
    const seenO = new Set<string>();
    options = q.options.map((o, j) => validateOption(o, `${at}.options[${j}]`, seenO));
  }

  return {
    id,
    mode,
    title,
    context: asString(q.context),
    options,
    allowNote: q.allowNote === true,
    placeholder: asString(q.placeholder),
  };
}

function validateOption(o: unknown, at: string, seen: Set<string>): AskOption {
  if (!isPlainObject(o)) throw new AskSpecError(`${at} must be an object`);
  const id = asString(o.id);
  if (!id) throw new AskSpecError(`${at}.id is required`);
  if (seen.has(id)) throw new AskSpecError(`${at}.id "${id}" is duplicated within its question`);
  seen.add(id);
  const name = asString(o.name);
  if (!name) throw new AskSpecError(`${at}.name is required`);

  let detail: [string, string][] | undefined;
  if (Array.isArray(o.detail)) {
    detail = o.detail
      .filter((row): row is unknown[] => Array.isArray(row))
      .map((row) => [String(row[0] ?? ""), String(row[1] ?? "")] as [string, string]);
  }

  return {
    id,
    name,
    desc: asString(o.desc),
    tag: asString(o.tag),
    detail,
    code: asString(o.code),
    preview: asString(o.preview),
  };
}
