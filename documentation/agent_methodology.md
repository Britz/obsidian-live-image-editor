# Agent Methodology

The operational form of `methodology.md` for the agent. `methodology.md` defines the model;
this document defines how the agent applies it so that artifacts stay at their altitude and
work does not collapse into a single document. Read both before acting; this one is the
working checklist.

---

## Abstraction levels: concept vs. artifact (the prime rule)

An abstraction level is a **concept**, not an artifact. Each concept **prescribes and bounds
what belongs in its resulting artifact** (a document/deliverable) and what does not. An
artifact is produced *from* its concept; the concept is the understanding that keeps the
artifact at its altitude — it is not the file itself.

**All** concepts must be internalized before any artifact is worked on. Knowing only what
goes into the implementation plan, for example, leads to everything being written there —
straight back to chaos. The boundaries between the concepts are what keep each artifact
clean. An artifact is correct only when every statement in it belongs to that concept's
altitude.

The concepts (the abstraction level is noted alongside, only as orientation):

- **Requirements** — High level (umbrella; specialized into Technical, Functional, Design)
- **Architecture** — Mid level
- **Test Plan** — Mid & Low level (verifies architecture decisions as well as the implementation)
- **Implementation Plan** — Low level

---

## Sorting test — which artifact does a statement belong to?

Before writing a statement anywhere, classify it:

- *What* it does → **Functional Requirement**.
- *How it looks / feels* → **Design Requirement**.
- A build/runtime constraint, convention or invariant → **Technical Requirement**.
- Conceptual structure, or a chosen algorithm/approach **as a concept** (modules,
  responsibilities, interaction, key decision) → **Architecture**.
- The concrete realization — files, functions, names, data representation, and **which
  implementation of an algorithm/decision is chosen and why** (the algorithm itself is not
  here) → **Implementation Plan**.
- A check that something holds → **Test Plan**.

If a statement fits two artifacts, **split it**: the behaviour stays in the requirement, the
form in design, the structure in architecture, the code in the implementation plan, the
verification in the test plan. Code internals appear above the implementation level **only**
where the framework (Obsidian / JavaScript / HTML / CSS) forces them — and that is stated explicitly.

---

## Workflow (derive each artifact from the one above)

1. **Requirements** (Technical / Functional / Design) — at the High level, no code internals.
2. **Architecture** — derived from the requirements: modules, responsibilities,
   interactions, key decisions/patterns.
3. **Implementation Plan and Test Plan (in parallel)** — derived from the architecture: code
   internals and verification, produced together.
4. **Code** — written only after the implementation plan.

Each step is validated against the one above before proceeding. A change at a higher level
may (and should) force large changes below.

---

## Bug protocol (back to the drawing board)

1. **Diagnose low-level** to understand the trigger. A band-aid is permitted **only** to
   understand it; it is temporary, never the fix.
2. **Return all the way to the top** (requirements) and re-walk top-down — requirements →
   architecture → implementation — to find where the bug actually originates: a missing or
   wrong requirement? a flawed architecture? only then the implementation.
3. **Fix at the origin and re-derive downward.** Remove the band-aid. A special case that
   survives the top-down review was a hidden requirement; one that does not is removed by
   the correction higher up.

Never leave a low-level patch as the final fix. Always start at the highest level.

---

## Per-artifact filter (put in / keep out)

- **Requirements** (umbrella — the *what* and the guardrails; specializes into the three
  below; out: how it is coded):
  - **Technical** — in: build/runtime constraints, conventions, invariants. out: features,
    looks, code.
  - **Functional** — in: capabilities/behaviour (a feature's presence). out: form, build, code.
  - **Design** — in: appearance, layout, user experience. out: feature presence, build, code.
- **Architecture** — in: modules, responsibilities, interactions, decisions, chosen
  algorithms/approaches as concepts. out: code internals (unless framework-forced),
  requirement statements.
- **Implementation Plan** — in: files/functions/classes, names, data representation, the
  chosen realization of an algorithm/decision and why this one (the *target state*, what is
  implemented). out: re-deciding above, the algorithm/model itself (that is
  Architecture/Requirements), a sequence of edits / change plan, test specs.
- **Test Plan** — in: test cases by level — unit (implementation), integration (architecture
  decisions), behaviour (requirements) — plus a regression per fixed bug. out: detail beyond
  what is verified.

---

## Where artifacts live in this repo

- Requirements (Technical, Functional, Design): **`requirements.md`**. Architecture (incl. the
  past lessons embedded as guards): **`architecture.md`**. Hard lessons, known bugs &
  live-debugging: **`../CLAUDE.md`** (the project's single source of truth).
- The methodology model: **`methodology.md`**; its agent-facing form: **this file**. All four
  plan documents live together under **`documentation/`**.
- Pure decision logic for unit tests: **`../src/*-logic.ts`** + **`../tests/*`** (vitest).
  Behaviour verification: in the running **Obsidian** app via the **Chrome DevTools Protocol**
  (see `../CLAUDE.md` → "Live debugging").

---

## Conduct (pointers; full text in `../CLAUDE.md` / `methodology.md`)

- **DRY / KISS** govern every decision: the same logic only once; one path; no special
  cases. The same result reached two different ways is a violation. KISS means *as simple as
  possible, but not simpler* — never quick-and-dirty: keep necessary distinctions, prefer
  readability over a clever one-liner, and accept an initially-more-involved solution
  (abstraction/pattern) when it is the genuinely simpler one long-term.
- **Think first, then act**: research framework/API internals into a verified model before
  trial-and-error.
- Project documents in an **impersonal, professional register** (no "we"/"you").
- Confirm before irreversible or outward-facing actions; the user makes the git commits.
