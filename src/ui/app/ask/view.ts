/**
 * Ask-mode view. Renders the question flow into a root element, re-rendering the
 * body + footer on structural changes (selection, navigation) while leaving the
 * note textarea and hider drawers alone so typing/animation aren't disturbed.
 */
import { CFG } from "../config.ts";
import { applyTheme, toggleTheme } from "../theme.ts";
import { stopHeartbeat } from "../finalize.ts";
import type { AskQuestion, AskOption } from "../../../ask-spec.ts";
import { ask, isAnswered, resetAsk } from "./state.ts";
import { buildDecisionBrief } from "./brief.ts";

const MODE_LABEL: Record<AskQuestion["mode"], string> = {
  single: "Pick one",
  multi: "Pick several",
  rank: "Rank",
  compare: "Compare",
  text: "Write it out",
};

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

let rootEl: HTMLElement | null = null;
let submitted = false;
let dragFrom: number | null = null;

/** Mount the Ask UI and render the first question. Call once at boot. */
export function renderAsk(root: HTMLElement): void {
  rootEl = root;
  const s = ask.spec;
  root.innerHTML = `
    <div class="ask-root">
      <div class="ask-win">
        <div class="ask-bar">
          <span class="ask-dots"><i></i><i></i><i></i></span>
          <span class="ask-brand"><span class="ask-bdot"></span> Pinpoint Ask</span>
          <span class="ask-sp"></span>
          <span class="ask-pill" data-role="ask-pill">ASK</span>
          <button type="button" class="ask-ico" data-role="theme-toggle" title="Toggle theme" aria-label="Toggle theme"><span data-role="theme-icon">🌙</span></button>
        </div>
        ${s.title || s.intro ? `<div class="ask-lead">${s.title ? `<div class="ask-lead-t">${esc(s.title)}</div>` : ""}${s.intro ? `<div class="ask-lead-i">${esc(s.intro)}</div>` : ""}</div>` : ""}
        <div class="ask-main" data-role="ask-main"></div>
        <div class="ask-foot" data-role="ask-foot"></div>
      </div>
      <div class="ask-shortcuts">shortcuts — <b>1–9</b> select · <b>⌘↵</b> next / send · click <b>Reveal details</b> for the hider</div>
    </div>`;
  root.querySelector('[data-role="theme-toggle"]')?.addEventListener("click", () => toggleTheme());
  applyTheme();
  wireKeyboard();
  update();
}

function q(sel: string): HTMLElement | null {
  return rootEl?.querySelector<HTMLElement>(sel) ?? null;
}

/** Re-render the body + footer from current state. */
function update(): void {
  const main = q('[data-role="ask-main"]');
  const foot = q('[data-role="ask-foot"]');
  const pill = q('[data-role="ask-pill"]');
  if (!main || !foot) return;
  if (pill) pill.textContent = ask.phase === "sent" ? "SENT" : "ASK";
  if (ask.phase === "answer") {
    renderQuestion(main, foot);
  } else if (ask.phase === "review") {
    renderReview(main, foot);
  } else {
    renderSent(main, foot);
  }
}

/* ---------------- answer phase ---------------- */

function renderQuestion(main: HTMLElement, foot: HTMLElement): void {
  const i = ask.idx;
  const qn = ask.spec.questions[i]!;
  const a = ask.answers[qn.id]!;
  const N = ask.spec.questions.length;

  let body = "";
  if (qn.mode === "compare") {
    body = `<div class="ask-cmp">${qn.options!.map((o) => compareCard(qn, o, a.choiceId === o.id)).join("")}</div>`;
  } else if (qn.mode === "rank") {
    body = `<div class="ask-rank">${a.order.map((id, k) => rankRow(qn, id, k, a.order.length)).join("")}</div>`;
  } else if (qn.mode === "text") {
    body = `<textarea class="ask-text" data-role="ask-textarea" placeholder="${esc(qn.placeholder ?? "Type your answer…")}">${esc(a.text)}</textarea>`;
  } else {
    body = qn.options!.map((o) => optionRow(qn, o, a.choiceId === o.id || a.choiceIds.includes(o.id))).join("");
  }

  const note =
    qn.allowNote && qn.mode !== "rank" && qn.mode !== "text"
      ? `<div class="ask-note"><label>Add a note (optional)</label><textarea data-role="ask-note" placeholder="A condition, a caveat, the “but only if…”">${esc(a.note)}</textarea></div>`
      : "";

  main.innerHTML = `
    <div class="ask-q">
      <div class="ask-step">Question ${i + 1} of ${N} <span class="ask-modetag">${MODE_LABEL[qn.mode]}</span></div>
      <div class="ask-title">${esc(qn.title)}</div>
      ${qn.context ? `<div class="ask-ctx"><b>Claude:</b> ${esc(qn.context)}</div>` : ""}
      <div class="ask-body">${body}</div>
      ${note}
    </div>`;

  // wiring
  main.querySelectorAll<HTMLElement>("[data-pick]").forEach((el) => {
    el.addEventListener("click", () => pick(qn, el.dataset.pick!));
  });
  main.querySelectorAll<HTMLElement>("[data-hider]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleHider(qn.id, el.dataset.hider!, el.closest(".ask-opt"));
    });
  });
  main.querySelectorAll<HTMLElement>("[data-rank-up]").forEach((el) =>
    el.addEventListener("click", () => moveRank(qn.id, +el.dataset.rankUp!, -1)),
  );
  main.querySelectorAll<HTMLElement>("[data-rank-down]").forEach((el) =>
    el.addEventListener("click", () => moveRank(qn.id, +el.dataset.rankDown!, +1)),
  );
  wireRankDnd(main, qn.id);
  main.querySelector<HTMLTextAreaElement>('[data-role="ask-textarea"]')?.addEventListener("input", (e) => {
    ask.answers[qn.id]!.text = (e.target as HTMLTextAreaElement).value;
    renderFoot(foot); // text answered-state can change Next label
  });
  main.querySelector<HTMLTextAreaElement>('[data-role="ask-note"]')?.addEventListener("input", (e) => {
    ask.answers[qn.id]!.note = (e.target as HTMLTextAreaElement).value;
  });

  renderFoot(foot);
}

function optionRow(qn: AskQuestion, o: AskOption, sel: boolean): string {
  const open = ask.openHiders.has(qn.id + ":" + o.id);
  const ctrl = qn.mode === "multi" ? "ask-check" : "ask-radio";
  const hider = o.detail || o.code ? hiderBlock(qn, o, open) : "";
  return `<div class="ask-opt${sel ? " sel" : ""}${open ? " open" : ""}">
    <div class="ask-opt-head" data-pick="${esc(o.id)}">
      <span class="${ctrl}"></span>
      <span class="ask-opt-main"><span class="ask-opt-name">${esc(o.name)}</span>${o.desc ? `<span class="ask-opt-desc">${esc(o.desc)}</span>` : ""}</span>
      ${o.tag ? `<span class="ask-chip">${esc(o.tag)}</span>` : ""}
    </div>${hider}</div>`;
}

function hiderBlock(qn: AskQuestion, o: AskOption, open: boolean): string {
  const grid = o.detail?.length
    ? `<div class="ask-hgrid">${o.detail.map(([k, v]) => `<div class="ask-hcell"><div class="ask-hk">${esc(k)}</div><div class="ask-hv">${esc(v)}</div></div>`).join("")}</div>`
    : "";
  const code = o.code ? `<pre class="ask-code">${esc(o.code)}</pre>` : "";
  return `<div class="ask-hider-tog" data-hider="${esc(o.id)}"><span class="ask-chev">⌄</span> ${open ? "Hide details" : "Reveal details"}</div>
    <div class="ask-hider"><div class="ask-hinner">${grid}${code}</div></div>`;
}

function compareCard(_qn: AskQuestion, o: AskOption, sel: boolean): string {
  const prev = o.preview ? `<pre class="ask-prev">${esc(o.preview)}</pre>` : `<div class="ask-prev ask-prev-empty"></div>`;
  return `<div class="ask-cmp-card${sel ? " sel" : ""}" data-pick="${esc(o.id)}">
    ${prev}
    <div class="ask-cmp-name"><span class="ask-cmp-radio"></span>${esc(o.name)}</div>
    ${o.desc ? `<div class="ask-cmp-desc">${esc(o.desc)}</div>` : ""}
  </div>`;
}

function rankRow(qn: AskQuestion, id: string, k: number, total: number): string {
  const name = qn.options?.find((o) => o.id === id)?.name ?? id;
  return `<div class="ask-rank-item" draggable="true" data-idx="${k}">
    <span class="ask-rhandle">⋮⋮</span>
    <span class="ask-rpos">${k + 1}</span>
    <span class="ask-rname">${esc(name)}</span>
    <span class="ask-rbtns">
      <button type="button" data-rank-up="${k}" ${k === 0 ? "disabled" : ""} aria-label="Move up">↑</button>
      <button type="button" data-rank-down="${k}" ${k === total - 1 ? "disabled" : ""} aria-label="Move down">↓</button>
    </span></div>`;
}

/* ---------------- review + sent phases ---------------- */

function renderReview(main: HTMLElement, foot: HTMLElement): void {
  const rows = ask.spec.questions
    .map((qn, i) => {
      const a = ask.answers[qn.id]!;
      let val: string;
      let extra = "";
      if (qn.mode === "multi") {
        val = a.choiceIds.length ? a.choiceIds.map((id) => nameOf(qn, id)).join(", ") : "— none —";
      } else if (qn.mode === "rank") {
        val = "Priority order";
        extra = `<div class="ask-rev-ord">${a.order.map((id, k) => `${k + 1}. ${esc(nameOf(qn, id))}`).join("&nbsp;&nbsp; ")}</div>`;
      } else if (qn.mode === "text") {
        val = a.text.trim() || "— skipped —";
      } else {
        val = a.choiceId ? nameOf(qn, a.choiceId) : "— skipped —";
      }
      return `<div class="ask-rev">
        <div class="ask-rev-q"><span class="ask-rev-n">Q${i + 1}</span> ${esc(qn.title)}<button type="button" class="ask-rev-edit" data-edit="${i}">edit ↗</button></div>
        <div class="ask-rev-a">${esc(val)}${extra}</div>
        ${a.note.trim() ? `<div class="ask-rev-note">“${esc(a.note.trim())}”</div>` : ""}
      </div>`;
    })
    .join("");

  main.innerHTML = `<div class="ask-q">
    <div class="ask-step">Final step <span class="ask-modetag">Review</span></div>
    <div class="ask-title">Your decision, before it goes back.</div>
    <div class="ask-ctx"><b>Heads up:</b> this is exactly what Claude will receive.</div>
    ${rows}</div>`;
  main.querySelectorAll<HTMLElement>("[data-edit]").forEach((el) =>
    el.addEventListener("click", () => {
      ask.idx = +el.dataset.edit!;
      ask.phase = "answer";
      update();
    }),
  );
  renderFoot(foot);
}

function renderSent(main: HTMLElement, foot: HTMLElement): void {
  const items = ask.spec.questions
    .map((qn) => {
      const a = ask.answers[qn.id]!;
      let txt: string;
      if (qn.mode === "multi") txt = a.choiceIds.map((id) => nameOf(qn, id)).join(", ") || "none";
      else if (qn.mode === "rank") txt = a.order.map((id) => nameOf(qn, id)).join(" › ");
      else if (qn.mode === "text") txt = a.text.trim() ? "✓ written" : "skipped";
      else txt = a.choiceId ? nameOf(qn, a.choiceId) : "skipped";
      return `<li><b>${esc(qn.title.replace(/\.$/, ""))}</b> — ${esc(txt)}</li>`;
    })
    .join("");
  main.innerHTML = `<div class="ask-sent">
    <div class="ask-sent-check">✓</div>
    <h3>Decision sent to Claude Code.</h3>
    <p>You can close this tab — the chat picks up where it left off.</p>
    <ul class="ask-summary">${items}</ul>
  </div>`;
  renderFoot(foot);
}

/* ---------------- footer ---------------- */

function renderFoot(foot: HTMLElement): void {
  const N = ask.spec.questions.length;
  if (ask.phase === "sent") {
    foot.innerHTML = `<span class="ask-sp"></span><button type="button" class="ask-btn primary" data-act="restart">Start over</button>`;
    foot.querySelector('[data-act="restart"]')?.addEventListener("click", () => {
      resetAsk(ask.spec);
      submitted = false;
      update();
    });
    return;
  }
  const dots = ask.spec.questions
    .map((_, i) => `<i class="${isAnswered(ask.spec, ask.answers, i) ? "on" : ""}${i === ask.idx && ask.phase === "answer" ? " cur" : ""}"></i>`)
    .join("");
  const isReview = ask.phase === "review";
  const answeredNow = !isReview && isAnswered(ask.spec, ask.answers, ask.idx);
  const primaryLabel = isReview ? "Send decision" : ask.idx < N - 1 ? "Next" : "Review";
  foot.innerHTML = `
    <span class="ask-pdots">${dots}</span>
    <span class="ask-plabel">${isReview ? "ready" : answeredNow ? "answered" : "optional — skip ok"}</span>
    <span class="ask-sp"></span>
    <button type="button" class="ask-btn ghost" data-act="back" ${ask.idx === 0 && !isReview ? "disabled" : ""}>Back</button>
    <button type="button" class="ask-btn primary" data-act="next">${primaryLabel} <span class="ask-kbd">⌘↵</span></button>`;
  foot.querySelector('[data-act="back"]')?.addEventListener("click", goBack);
  foot.querySelector('[data-act="next"]')?.addEventListener("click", goNext);
}

/* ---------------- mutations + navigation ---------------- */

function nameOf(qn: AskQuestion, id: string): string {
  return qn.options?.find((o) => o.id === id)?.name ?? id;
}

function pick(qn: AskQuestion, optId: string): void {
  const a = ask.answers[qn.id]!;
  if (qn.mode === "multi") {
    a.choiceIds = a.choiceIds.includes(optId) ? a.choiceIds.filter((x) => x !== optId) : [...a.choiceIds, optId];
  } else {
    a.choiceId = optId;
  }
  update();
}

function toggleHider(qid: string, optId: string, el: Element | null): void {
  const key = qid + ":" + optId;
  const open = ask.openHiders.has(key);
  if (open) ask.openHiders.delete(key);
  else ask.openHiders.add(key);
  el?.classList.toggle("open", !open);
  const tog = el?.querySelector<HTMLElement>("[data-hider]");
  if (tog?.lastChild) tog.lastChild.textContent = open ? " Reveal details" : " Hide details";
}

function moveRank(qid: string, i: number, dir: number): void {
  const order = ask.answers[qid]!.order;
  const j = i + dir;
  if (j < 0 || j >= order.length) return;
  [order[i], order[j]] = [order[j]!, order[i]!];
  update();
}

function wireRankDnd(main: HTMLElement, qid: string): void {
  main.querySelectorAll<HTMLElement>(".ask-rank-item").forEach((el) => {
    el.addEventListener("dragstart", () => {
      dragFrom = +el.dataset.idx!;
      el.classList.add("drag");
    });
    el.addEventListener("dragend", () => {
      el.classList.remove("drag");
      dragFrom = null; // clear before any re-render can stale the index
    });
    el.addEventListener("dragover", (e) => e.preventDefault());
    el.addEventListener("drop", (e) => {
      e.preventDefault();
      const to = +el.dataset.idx!;
      if (dragFrom == null || dragFrom === to) return;
      const order = ask.answers[qid]!.order;
      const [m] = order.splice(dragFrom, 1);
      order.splice(to, 0, m!);
      dragFrom = null;
      update();
    });
  });
}

function goNext(): void {
  if (ask.phase === "review") {
    void doSend();
    return;
  }
  if (ask.idx < ask.spec.questions.length - 1) ask.idx += 1;
  else ask.phase = "review";
  update();
}

function goBack(): void {
  if (ask.phase === "review") {
    ask.phase = "answer";
    ask.idx = ask.spec.questions.length - 1;
  } else if (ask.idx > 0) {
    ask.idx -= 1;
  }
  update();
}

async function doSend(): Promise<void> {
  if (submitted) return;
  submitted = true;
  const brief = buildDecisionBrief(ask.spec, ask.answers);
  stopHeartbeat();
  try {
    await fetch(CFG.apiBase + "/finalize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "feedback", brief }),
      keepalive: true,
    });
  } catch {
    /* server already gone — the brief is in flight or the tab is closing */
  }
  ask.phase = "sent";
  update();
}

/* ---------------- keyboard ---------------- */

let keyboardWired = false;
function wireKeyboard(): void {
  if (keyboardWired) return;
  keyboardWired = true;
  window.addEventListener("keydown", (e) => {
    if (dragFrom != null) return; // don't navigate mid-drag (would stale the index)
    const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      if (ask.phase === "review") void doSend();
      else if (ask.phase === "answer") goNext();
      return;
    }
    if (tag === "textarea" || tag === "input") return;
    if (e.key === "t" || e.key === "T") {
      toggleTheme();
      return;
    }
    if (ask.phase === "answer" && /^[1-9]$/.test(e.key)) {
      const qn = ask.spec.questions[ask.idx]!;
      const o = qn.options?.[+e.key - 1];
      if (o && qn.mode !== "rank") pick(qn, o.id);
    }
  });
}
