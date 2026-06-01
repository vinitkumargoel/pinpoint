import { describe, it, expect } from "bun:test";
import type { AskSpec } from "../src/ask-spec.ts";
import { initAnswers } from "../src/ui/app/ask/state.ts";
import { buildDecisionBrief } from "../src/ui/app/ask/brief.ts";

const SPEC: AskSpec = {
  questions: [
    { id: "storage", mode: "single", title: "Storage?", allowNote: true, options: [{ id: "object", name: "Object" }, { id: "db", name: "Database" }] },
    { id: "empty", mode: "compare", title: "Empty state?", options: [{ id: "illus", name: "Illustration" }, { id: "zero", name: "Zero" }] },
    { id: "sprint", mode: "rank", title: "Sprint order?", options: [{ id: "a", name: "Alpha" }, { id: "b", name: "Beta" }] },
    { id: "integ", mode: "multi", title: "Integrations?", options: [{ id: "slack", name: "Slack" }, { id: "gh", name: "GitHub" }] },
    { id: "notes", mode: "text", title: "Anything else?" },
  ],
};

function answeredFixture() {
  const a = initAnswers(SPEC);
  a.storage.choiceId = "object";
  a.storage.note = "keep a local fallback";
  a.empty.choiceId = "illus";
  a.sprint.order = ["b", "a"]; // reordered
  a.integ.choiceIds = ["slack", "gh"];
  a.notes.text = "ship by Friday";
  return a;
}

function jsonBlock(brief: string): Record<string, any> {
  const m = brief.match(/```json\n([\s\S]*?)\n```/);
  if (!m) throw new Error("no json block in brief");
  return JSON.parse(m[1]!);
}

describe("buildDecisionBrief", () => {
  it("renders a human-readable section per question", () => {
    const brief = buildDecisionBrief(SPEC, answeredFixture());
    expect(brief).toContain("# Pinpoint Ask — decision");
    expect(brief).toContain("**Chosen:** Object  `object`");
    expect(brief).toContain("**Note:** keep a local fallback");
    expect(brief).toContain("**Chosen:** Illustration  `illus`");
    expect(brief).toContain("1. Beta  `b`");
    expect(brief).toContain("2. Alpha  `a`");
    expect(brief).toContain("Slack `slack`, GitHub `gh`");
    expect(brief).toContain("ship by Friday");
  });

  it("embeds a machine-parseable JSON decision keyed by question id", () => {
    const decision = jsonBlock(buildDecisionBrief(SPEC, answeredFixture()));
    expect(decision.storage).toMatchObject({ mode: "single", chosen_id: "object", chosen: "Object", note: "keep a local fallback" });
    expect(decision.empty).toMatchObject({ mode: "compare", chosen_id: "illus", chosen: "Illustration" });
    expect(decision.sprint).toMatchObject({ mode: "rank", ranked_ids: ["b", "a"], ranked: ["Beta", "Alpha"] });
    expect(decision.integ).toMatchObject({ mode: "multi", chosen_ids: ["slack", "gh"], chosen: ["Slack", "GitHub"] });
    expect(decision.notes).toMatchObject({ mode: "text", text: "ship by Friday" });
  });

  it("marks skipped questions in the JSON", () => {
    const empty = initAnswers(SPEC); // nothing answered
    const decision = jsonBlock(buildDecisionBrief(SPEC, empty));
    expect(decision.storage.skipped).toBe(true);
    expect(decision.integ.skipped).toBe(true);
    expect(decision.notes.skipped).toBe(true);
    // rank is never "skipped" — it always has an order
    expect(decision.sprint.ranked_ids).toEqual(["a", "b"]);
  });
});
