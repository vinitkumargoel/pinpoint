import { describe, it, expect } from "bun:test";
import { parseAndValidateAskSpec, AskSpecError } from "../src/ask-spec.ts";

const ok = (obj: unknown) => parseAndValidateAskSpec(JSON.stringify(obj));
const bad = (obj: unknown) => () => parseAndValidateAskSpec(JSON.stringify(obj));

describe("parseAndValidateAskSpec", () => {
  it("parses a minimal single-choice spec", () => {
    const spec = ok({
      questions: [{ id: "q1", mode: "single", title: "Pick", options: [{ id: "a", name: "A" }] }],
    });
    expect(spec.questions).toHaveLength(1);
    expect(spec.questions[0]!.options![0]!.name).toBe("A");
  });

  it("keeps optional title and intro", () => {
    const spec = ok({ title: "T", intro: "I", questions: [{ id: "q", mode: "text", title: "Why?" }] });
    expect(spec.title).toBe("T");
    expect(spec.intro).toBe("I");
  });

  it("rejects non-JSON", () => {
    expect(() => parseAndValidateAskSpec("{not json")).toThrow(AskSpecError);
  });

  it("rejects an empty questions array", () => {
    expect(bad({ questions: [] })).toThrow(/non-empty array/);
  });

  it("rejects a missing questions array", () => {
    expect(bad({ title: "x" })).toThrow(/questions must be a non-empty array/);
  });

  it("rejects a duplicate question id", () => {
    expect(
      bad({
        questions: [
          { id: "dup", mode: "text", title: "a" },
          { id: "dup", mode: "text", title: "b" },
        ],
      }),
    ).toThrow(/duplicated/);
  });

  it("rejects an invalid mode", () => {
    expect(bad({ questions: [{ id: "q", mode: "slider", title: "t" }] })).toThrow(/mode .* is invalid/);
  });

  it("rejects a question with no title", () => {
    expect(bad({ questions: [{ id: "q", mode: "text" }] })).toThrow(/title is required/);
  });

  it("requires options for single/multi/rank/compare", () => {
    for (const mode of ["single", "multi", "rank", "compare"]) {
      expect(bad({ questions: [{ id: "q", mode, title: "t" }] })).toThrow(/options must be a non-empty array/);
    }
  });

  it("does NOT require options for text mode", () => {
    const spec = ok({ questions: [{ id: "q", mode: "text", title: "Anything else?" }] });
    expect(spec.questions[0]!.options).toBeUndefined();
  });

  it("rejects an option missing id or name", () => {
    expect(bad({ questions: [{ id: "q", mode: "single", title: "t", options: [{ name: "A" }] }] })).toThrow(/id is required/);
    expect(bad({ questions: [{ id: "q", mode: "single", title: "t", options: [{ id: "a" }] }] })).toThrow(/name is required/);
  });

  it("rejects a duplicate option id within a question", () => {
    expect(
      bad({
        questions: [{ id: "q", mode: "single", title: "t", options: [{ id: "a", name: "A" }, { id: "a", name: "B" }] }],
      }),
    ).toThrow(/duplicated within its question/);
  });

  it("rejects more than 20 questions", () => {
    const questions = Array.from({ length: 21 }, (_, i) => ({ id: `q${i}`, mode: "text", title: "t" }));
    expect(bad({ questions })).toThrow(/keep it to 20 or fewer/);
  });

  it("rejects more than 50 options in a question", () => {
    const options = Array.from({ length: 51 }, (_, i) => ({ id: `o${i}`, name: "n" }));
    expect(bad({ questions: [{ id: "q", mode: "single", title: "t", options }] })).toThrow(/keep it to 50 or fewer/);
  });

  it("normalizes detail rows to [label, value] string pairs", () => {
    const spec = ok({
      questions: [
        {
          id: "q",
          mode: "single",
          title: "t",
          options: [{ id: "a", name: "A", detail: [["Cost", "Low"], ["Speed", 9]] }],
        },
      ],
    });
    expect(spec.questions[0]!.options![0]!.detail).toEqual([["Cost", "Low"], ["Speed", "9"]]);
  });
});
