/**
 * Turn the user's answers into the decision brief returned to Claude Code on
 * stdout. Pure (no DOM) so it is unit-tested directly. The brief is human-
 * readable Markdown followed by a machine-parseable ```json block keyed by
 * question id, so the receiving session can act on it either way.
 */
import type { AskSpec, AskQuestion } from "../../../ask-spec.ts";
import type { AnswerMap } from "./state.ts";

const nameOf = (q: AskQuestion, id: string): string =>
  q.options?.find((o) => o.id === id)?.name ?? id;

/** Per-question structured result, keyed by question id, embedded as JSON. */
interface DecisionEntry {
  mode: string;
  chosen_id?: string | null;
  chosen?: string | string[] | null;
  chosen_ids?: string[];
  ranked?: string[];
  ranked_ids?: string[];
  text?: string;
  note?: string;
  skipped?: boolean;
}

function entryFor(q: AskQuestion, answers: AnswerMap): DecisionEntry {
  const a = answers[q.id];
  const e: DecisionEntry = { mode: q.mode };
  if (!a) return { mode: q.mode, skipped: true };

  if (q.mode === "single" || q.mode === "compare") {
    e.chosen_id = a.choiceId;
    e.chosen = a.choiceId ? nameOf(q, a.choiceId) : null;
    if (!a.choiceId) e.skipped = true;
    if (a.note.trim()) e.note = a.note.trim();
  } else if (q.mode === "multi") {
    e.chosen_ids = a.choiceIds;
    e.chosen = a.choiceIds.map((id) => nameOf(q, id));
    if (!a.choiceIds.length) e.skipped = true;
    if (a.note.trim()) e.note = a.note.trim();
  } else if (q.mode === "rank") {
    e.ranked_ids = a.order;
    e.ranked = a.order.map((id) => nameOf(q, id));
  } else if (q.mode === "text") {
    e.text = a.text.trim();
    if (!a.text.trim()) e.skipped = true;
  }
  return e;
}

/** Build the full Markdown + JSON decision brief. */
export function buildDecisionBrief(spec: AskSpec, answers: AnswerMap): string {
  const L: string[] = [];
  L.push("# Pinpoint Ask — decision");
  L.push("");
  L.push("> The user answered in the browser. Each section below is one question; the JSON block at the end is the machine-readable decision keyed by question id.");
  L.push("");

  const decision: Record<string, DecisionEntry> = {};

  for (const q of spec.questions) {
    const e = entryFor(q, answers);
    decision[q.id] = e;
    L.push(`## ${q.title}  \`(${q.id})\``);
    L.push("");

    if (q.mode === "single" || q.mode === "compare") {
      L.push(e.chosen ? `**Chosen:** ${e.chosen}  \`${e.chosen_id}\`` : "**Chosen:** _(skipped)_");
    } else if (q.mode === "multi") {
      const ids = answers[q.id]?.choiceIds ?? [];
      L.push(
        ids.length
          ? `**Chosen:** ${ids.map((id) => `${nameOf(q, id)} \`${id}\``).join(", ")}`
          : "**Chosen:** _(none)_",
      );
    } else if (q.mode === "rank") {
      L.push("**Ranked (top first):**");
      L.push("");
      (answers[q.id]?.order ?? []).forEach((id, i) => {
        L.push(`${i + 1}. ${nameOf(q, id)}  \`${id}\``);
      });
    } else if (q.mode === "text") {
      const t = (answers[q.id]?.text ?? "").trim();
      L.push(t ? t.split("\n").map((line) => `> ${line}`).join("\n") : "> _(no answer)_");
    }

    if (e.note) {
      L.push("");
      L.push(`**Note:** ${e.note}`);
    }
    L.push("");
  }

  L.push("---");
  L.push("");
  L.push("```json");
  L.push(JSON.stringify(decision, null, 2));
  L.push("```");
  return L.join("\n");
}
