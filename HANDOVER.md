# HANDOVER — Live-Preview link-reveal rethink (AD10–AD12, AB16)

**Date:** 2026-06-27 (updated, session 2) · **Plugin:** Live Image Editor (`live-image-editor`) · **Branch:** main
**Status:** DOCS DONE — requirements + architecture + **test-plan** + **implementation-plan §3.3** all
written for this cluster. **Code STARTED on the user's explicit "go" (session 3).** Building ground-up:
the pure logic first (`isEngaged` AD12, then the `reduceReveal` three-mode/engaged fix + the
`defaultRevealState`/`renderImagesInCodeBlocks` settings), then the framework wiring (the `syntaxTree`
gate, the StateField reveal, the CSS) — the reveal **no-flicker mechanism is CDP-verified before commit**.

This file is self-contained: it does **not** rely on chat memory or any prior session. Read it top to bottom.

---

## 0. Hard rules you must obey (non-negotiable)

- **Altitude / doc-before-code gate.** Code may change **at most** `docs/development/implementation-plan.md`
  and the source it maps. The four higher artifacts are **inviolable — only the user may decide to change one:**
  `methodology.md`, `requirements.md` (F/D/T), `architecture.md` (AD/AB), `test-plan.md`. Work **top-down**:
  change the **doc first** (with the required ask for anything above `implementation-plan.md`), **then** code.
- **Architecture is top-down and codebase-unspecific.** `architecture.md` knows **nothing** that lies logically
  below it — no CSS, no class names, no "current realization", no mechanism. It states *what/why*. The
  CSS/`syntaxTree`/`cm-line` specifics belong in `implementation-plan.md`.
- **Docs are written in ENGLISH** (German is only the chat/UI-label language).
- **Chat style (persist this):** short, **natural idiomatic German** — *no* word-for-word translations of
  English idioms (e.g. not "einfalten" for *fold in* → use "mit reinnehmen"; no niche loanwords like "Calque"
  in a German sentence). IT jargon is fine. Don't charge ahead; surface the decision in a sentence or two and
  wait. The user works in **parallel sessions** — expect concurrent uncommitted edits in `src/`. (All in
  CLAUDE.md now.)
- **Git:** the **user makes ALL commits.** You only remind. **Never** a `Co-Authored-By` trailer. Version
  bumps are **patch only**. **Documentation-only changes do NOT bump the version.**
- **PROCESS LESSON from this session (heed it):** do **not** fragment a doc change into half-thought pieces
  that need serial correction. Think the whole change through **once**, **ground it strictly in the
  already-written artifacts** (AD/AB/D — derive, don't re-improvise), then write. This session burned hours
  going in circles because edits were sketched before the model was settled.

---

## 1. The mission (unchanged)

The plugin kept a **parallel representation** of "is this line an image embed, and is its link shown?" in Live
Preview (a regex `EMBED_LINE` + its own block-promotion + its own fake-link + a CSS heuristic
`.cm-line:has(> .cm-formatting)` that *guesses* when Obsidian reveals its native source). That root produces a
**cluster** of bugs. The goal: **one robust rethink** that derives from **Obsidian's own logic** (the WHY, not
the WHEN) so no variant slips through. This is now settled at the architecture altitude (§2).

---

## 2. What was decided this session — the SETTLED MODEL (do not re-derive)

All of this is now written into the artifacts. Summarised here so the next session need not reconstruct it.

### 2.1 The single source of truth (AD10)
In Live Preview, **derive whether/where a line holds an image embed from Obsidian's own parse**, not the
plugin's regex. Live source = the editor **`syntaxTree`**; its cached equivalent = `metadataCache.embeds`
(position-precise, link + span). **Code-block embeds are excluded by construction** — the parse does not list a
fenced `![](…)` as an embed (CDP-confirmed, §4). The "render images in code blocks" setting (F20) is the lone
override.

### 2.2 The link as one unit (D16, D17 — new requirements)
A link = **body** (`![](…)` / `![[…]]`, which has **two faces**: Obsidian's **native raw link** vs the
plugin's **display-only stand-in** / "fake" raw link) **+** an optional trailing **`{…}` attribute list**
(native editable text).
- **D16 — never doubled:** the two body faces are **mutually exclusive** — never both on screen at once;
  the switch is **atomic**, no in-between frame, no flicker.
- **D17 — one whole:** the body and its `{…}` **always show/hide together**; a shown link whose `{…}` is
  hidden (or the reverse) is a **bug** (unless there is no `{…}`).

### 2.3 Who drives the reveal, when (AB16b — the driver model)
The driver is **not fixed**:
- **Obsidian** drives the **native raw link** — cursor-driven: shown while the cursor is **within the body**,
  hidden otherwise. The plugin **cannot force Obsidian to reveal** it (that is *why* a stand-in exists).
- The **plugin** drives the **stand-in**: shown *for looking* (per the reveal state) whenever the native raw
  link is **not** revealed, hidden when it **is** → mutual exclusion (D16).
- The **`{…}`** is native editable text; **the plugin drives its visibility in lockstep with the link**, and
  it **partly drives the stand-in** (propagation chain **native raw link → `{…}` → stand-in**).
- **Whole link visible whenever the cursor is anywhere on it** (body **or** `{…}`). Cursor on `{…}` ⇒ Obsidian
  hides the native raw link (cursor past the body) ⇒ the **stand-in carries the body** while the `{…}` is
  edited natively. The native↔stand-in swap at the body/`{…}` boundary is **seamless** — the user never sees
  the fake differ from the real source. **(This is the LEIT-TESTFALL.)**
- On the **`<>` dismiss** the plugin **actively hides** the link, **suppressing the native raw link** too, so
  it stays hidden even where Obsidian would reveal it (**Bug 65**).
- While the plugin is **engaged with the image** (**AD12** — a crop, or an open filter/class/sub-menu panel)
  the reveal state is **pinned**: it does not flip mid-interaction, whatever the cursor does (**Bug 86**; crop
  is just one case).
- Net: the plugin is the **final authority over the outcome** — it can always override Obsidian by suppressing
  or pinning. Obsidian drives only the *default* trigger.

### 2.4 One engagement predicate (AD12 — new)
"The plugin is **engaged** with an image" = a **single predicate**: the union of cursor-on-its-line, hover,
selected/active, editor-focused, and any plugin surface open for it (crop / filter / class / sub-menu). Every
cross-cutting "is this image active?" decision — the reveal **pin** (AB16b), the `<>` dismiss **auto-clear**
(fires only on full **dis**engagement), the toolbar greyed/active state — reads **this one predicate**, never a
per-surface ad-hoc check. (Replaces the scattered `filterPanel || classPanel || submenu || cropEditor` chain.)

### 2.5 Mechanism is NOT mandated to be CSS — **the no-`:has` deterministic mechanism is now CDP-VERIFIED ✅ (2026-06-28)**

The old code couples `{…}`+fake to Obsidian's native raw-link reveal **in CSS** (timing-safe, atomic) — that
was the *solution*, **not a hard requirement**. The hard requirements are the **invariants D16/D17** (atomic,
no flicker, one whole). A deterministic same-transaction approach (mirror Obsidian's reveal **condition** —
cursor within the parse-given span — instead of observing its DOM) is allowed **iff** it provably has no
flicker frame.

> **VERIFIED LIVE (CDP, 2026-06-28, standalone + inline, `native` mode).** The deterministic,
> **no-`:has`** approach works and is now **uniform per-embed**: the StateField computes the reveal from
> the parse-given body/`{…}` spans via the pure `resolveLinkReveal` and stamps a **per-element `lie-show`**
> class on the stand-in widget + the `{…}` mark (CM applies it synchronously in the SAME transaction as
> the selection change — no flicker frame); the CSS keys on it with plain `.lie-fake-link.lie-show` /
> `.lie-attr.lie-show` selectors (no `:has`, no `!important`). The SAME mechanism drives **standalone AND
> inline** — on a line with two inline embeds, only the one the cursor is inside yields its body to
> Obsidian's native reveal (per-embed D16); the others carry their own stand-in (CDP-verified). Measured
> standalone settled states (head == requested offset → no clamping):
> - cursor **in the body** (`![](…)`) → Obsidian reveals the **native** raw link, the **stand-in is
>   hidden** → exactly one rendering (**D16 by construction**);
> - cursor **in the `{…}`** → native gone (cursor past the body), the **stand-in carries the body**,
>   whole link stays visible (**D17 seamless swap**);
> - **off the line** → all hidden (native mode). No doubling, no gap in any settled state; the swap is
>   single-transaction so there is no flicker frame. **`resolveLinkReveal`'s `showStandIn = !cursorInBody`
>   is correct — no change needed.** This CONFIRMS AB16b's premise (Obsidian *does* reveal native while
>   the cursor is within the body).
>
> **TEST METHODOLOGY — this is load-bearing, do NOT repeat the earlier mistakes:** the reveal is
> **focus-gated**, so the probe MUST send **`Emulation.setFocusEmulationEnabled {enabled:true}`** first
> (a `--eval` one-shot can't — use a WS script like `tests/cdp/_optical.mjs`; the working probe is
> `scratchpad/test-reveal3.mjs`). And do **NOT** `setCursor` into the middle of the body: in LP the
> `![](…)` is a widget, so a mid-body offset isn't a reachable position and CM clamps it — enter at the
> line/embed start and step through. An earlier probe that skipped BOTH wrongly "found" that Obsidian
> never reveals native and the body vanished — a pure test artifact, retracted.

### 2.6 Where it now lives (all written, uncommitted)
- `requirements.md`: **D16**, **D17** added (after D15); **F8 rewritten by the user** → three modes
  **native** (default; active/cursor line only) / **auto** (+ hover) / **always** (everywhere); the `<>`
  dismiss auto-clears in native & auto.
- `architecture.md`: **AD10** sharpened (derive from the parse; code-block exclusion; F20 override); **AD11**
  generalised ("a pinned crop" → "while engaged with the image (pinned, AD12)"); **AD12** new; **AB16** (Link
  reveal — whole-link logic), **AB16a** (Raw-link stand-in & edit), **AB16b** (Who drives the reveal, when)
  rewritten; traceability rows **F8/F9** updated and **D12–D15** added.
- `issues.md`: **Bug 114** written (bare-embed link never reveals — block widget has no fake-link / no
  reveal path); bug counter → **114**.
- `CLAUDE.md`: natural-German rule; "keep per-category counters in sync"; CDP
  `Emulation.setFocusEmulationEnabled {enabled:true}` focus-emulation gotcha.

### 2.7 Code-block render mode (F20) — the deliberate exception to AD10
A setting **"render images in code blocks"** (F20 — **Live Preview only, default off**) is a deliberate mode
that **DOES render the image inside a fenced code section** — the one case that intentionally **overrides**
AD10. It is the exception to "defer to the parse": since Obsidian's parse **excludes** code-block embeds (§4),
when F20 is **on** the plugin **cannot** get those embeds from the parse and must **additionally detect them
inside code sections itself** (its own scan / the *inverse* of the `syntaxTree` code-node check) and render
them anyway. So the realization has **two detection inputs**: the parse (default — code blocks excluded),
**plus**, only when F20 is on, a fallback that re-includes code-section embeds. Reading view is unaffected (it
renders nothing in code blocks — correct, confirmed). **Open design point for §3.3:** how the reveal/stand-in
model (AB16/16b) applies when the embed's "source" is literal code text (the `![](…)` is always shown as code)
— likely no stand-in / no reveal there, just the rendered image; decide it explicitly, don't let it fall
through.

---

## 3. The bug cluster — how each is now addressed

| # | Symptom | Status after this session |
|---|---|---|
| **2a / Bug 114** | bare embed's LINK never reveals on hover (block widget, no fake-link, no cm-line) | Numbered (Bug 114). Fixed by AD10 (uniform parse-derived detection) + AB16b (every embed gets the reveal machinery / stand-in). |
| **2b** | code-block doubling (`EMBED_LINE` matches inside a fence) | Fixed by AD10 — the parse excludes code-block embeds **by construction** (CDP-confirmed, §4). F20 is the override. |
| **2c / Bug 65** | `<>` dismiss doesn't hide Obsidian's NATIVE source tokens | Decided: AB16b — on dismiss the plugin **actively suppresses** the native raw link (Lesson 11/12: without breaking native editing). |
| **2d / Bug 86** | reveal not pinned during crop (arrow-key path) | Decided: AB16b + AD12 — reveal **pinned while engaged** (crop is one case). |
| **Bug 113** | crop button dead on first click (cursor off the embed line) | Already documented in `issues.md`; cause unconfirmed. **Distinct** — track separately. |

---

## 4. CDP findings that ground the model (2026-06-27, verified live)

Against the running `vault-image-toolbar` via `CDP_PORT=9223 CDP_TARGET=vault-image-toolbar node scripts/obsidian-debug.mjs`.
- **`app.embedRegistry.embedByExtension`** lists the embeddable types (png/jpg/svg/…): Obsidian's "image plugin".
- **`app.metadataCache.getFileCache(file).embeds`** = the parsed embed list, each with an exact position; the
  span covers **only** `![](…)`, **not** the `{…}`.
- **Code-block exclusion confirmed:** in `05 — Layout, float & wrap.md` the raw text has 8 `![](…)` lines but
  the parse lists only **7** — the fenced one (line 99) is **excluded**, and `cache.sections` types it as
  `"code"`. So AD10's single source solves Bug 2b with no special-case.
- **Bare embed (`02 — Crop.md` line ~24):** block-promoted into a `.cm-content` child with **no `.cm-line`**,
  **no `.lie-fake-link`** — even with focus + cursor on it, **no native reveal, no `.cm-active`**. That is the
  Bug 114 root.
- **Focus-gated behaviour needs the focus-emulation trick:** programmatic `cm.focus()` does **not** take while
  the OS window is unfocused; bridge it with CDP **`Emulation.setFocusEmulationEnabled {enabled:true}`** (the
  `--eval` one-shot can't send that domain — use a small WS script like `tests/cdp/_optical.mjs`). Real CSS
  `:hover` still needs a real `Input.dispatchMouseEvent` (synthetic events don't fire `:hover`).

---

## 5. Regression leitplanken — what the IMPLEMENTATION must not re-break

From an audit of requirements / changelog / lessons against AD10–AD12 (verify exact entries when coding):
- **Lesson 11 / 12:** render **alongside** the native embed, **never replace the line**; on the active line the
  embed stays rendered, only the source/`{…}` becomes editable. Suppression must be scoped to the tokens and
  keep native editing working.
- **Bug 31:** Obsidian's native `<>` edit-block icon must stay hidden (no leak).
- **Bug 106:** reveal keyed to the embed's **own** tokens — don't re-introduce the list/callout over-match
  (now deterministic via the span, not a `:has` guess).
- **Bug 96 / 52 / 54 / 109:** dismiss hides fake **and** `{…}` atomically; crop/engaged suppresses; fake and
  native never both visible → no doubled link.
- **Bug 100 / Feature 19:** inline (mid-text) embeds — multiple per line — classified inline from the parse.
- **Bug 78 / 79:** never unwrap to a bare `<img>`; parse detection must be **≥** the regex coverage (escaping,
  braces — Bug 24).
- **Bug 67 / F2:** rebuild the LP decoration field on the right editor signals (live `syntaxTree`, not a stale
  cache).
- The current `cm-formatting`-avoidance hack and the `:has(> .cm-formatting)` heuristic become **obsolete** —
  remove them as part of the rework, don't leave them as conflicting altlast.

---

## 6. Still open (in order)

- [x] **Test-Plan** — DONE (session 3): AD1–AD12 range bump; §2.2 parse-gate + `reduceReveal` + the
  engagement predicate as pure units; §3 AD10/AD11/AD12 integration tests + AD5 reveal clause updated
  (`:has` heuristic retired); §4 new "Raw-link reveal" area incl. the LEIT-TESTFALL; §5 96/106/109
  generalised + open cluster (65/86/114) noted forward-looking.
- [x] **§3.3 Implementation-Plan** — DONE (session 3): AD10 (parse-gate, code-block exclusion, F20
  fallback), AD11/AD12 (per-span authority + the one `isEngaged` predicate replacing the scattered
  chain), AB16b reveal (two drivers, three modes native/auto/always, the seamless body↔`{…}` swap, the
  §2.5 no-flicker CDP gate), `reduceReveal` extended ("active"=engaged); plus consistency edits to §1
  (module map: `RevealMode native|auto|always`, `isEngaged` in `toolbar-region-logic.ts`,
  `defaultRevealState`/`renderImagesInCodeBlocks` settings, `reduceReveal`), §2.4 (CSS reveal rules) and
  §4 (new AD10/AD11/AD12 pitfalls). **Three points deliberately left OPEN for in-app/CDP, not invented:**
  (a) the **bare/block-promoted native-EDIT** path (Bug 114 — Obsidian gives no `.cm-line`/no reveal
  there; stand-in restores *looking*, but whether the source is natively editable needs CDP);
  (b) the **reveal mechanism** (deterministic same-transaction vs pure-CSS fallback — pick by the CDP
  no-flicker test, §2.5); (c) **F20 code-block source** decided explicitly: literal code, **no stand-in,
  no reveal**.
- [x] **CODE — pure logic + safe wiring DONE (session 3, build+lint+test all green, 289/289):**
  - [x] **`isEngaged`** (AD12) in `toolbar-region-logic.ts` + 5 unit tests — the pure union.
  - [x] **`reduceReveal` three modes** in `live-preview-logic.ts` — `RevealMode native|auto|always`
    (replaced the `alwaysShow` boolean), native = active-line-only / auto = +hover / always = everywhere;
    auto-clear keyed on the mode's NaturalReveal + 4 new unit tests. *(The broader AD12 engaged-pin —
    keeping a dismiss while a panel/crop holds the image — is the reveal-DISPLAY freeze below, CDP-gated;
    ENGAGED ⊇ cursor∪hover so it only KEEPS longer, never clears earlier than this — so this is a correct
    floor, not wrong.)*
  - [x] **Settings** — `defaultRevealState` (dropdown native/auto/always, default native) replaces the
    boolean `alwaysShowLink` (**migrated** in `main.ts loadSettings`: true→always, false→auto); new
    `renderImagesInCodeBlocks` toggle (LP-only, default off); i18n en+de; both threaded into
    `createLivePreviewExtension`.
  - [x] **AD10 `syntaxTree` gate** — `isInCodeNode()` walks the parse ancestors (`/code/i`), gates the
    standalone + inline embed paths; F20 (`renderInCode`) overrides. **npm install was BLOCKED (sandbox)**,
    so the `@codemirror/language` types come from a minimal **ambient decl in `src/env.d.ts`** (the same
    pattern as `@codemirror/commands`) — when network is available, `npm i -D @codemirror/language` can
    replace it. **CDP-TO-VERIFY:** the exact code node NAMES (matched loosely as `/code/i`) — **fail-safe**:
    a miss renders the embed as before (no regression, Bug 2b just persists until confirmed in-app).
  - [x] **`main.ts` engagement centralization** — the `filterPanel||classPanel||submenu||cropEditor` chain
    (×4 sites) collapsed onto `anyPanelOpen()` / `anySurfaceOpen()` (the latter routes through `isEngaged`).
  - [x] **Native reveal mode CSS** — `.cm-active .lie-fake-link.lie-rev-native` added; the existing
    **narrowed** `:has(> .cm-formatting-link/image/link-string)` mutual-exclusion coupling **kept** (it is
    the §2.5-sanctioned, list/callout-safe CSS fallback — NOT the retired bare-`cm-formatting` heuristic).
- **SPEC-DRIVEN REVEAL REWORK — built to AB16b/AD12, each CDP-verified (2026-06-28). Bugs fall out as
  consequences, not targeted individually:**
  - [x] **Bug 65 — DONE/VERIFIED.** The `<>` dismiss now actively suppresses Obsidian's OWN native body
    via a top-down `lie-suppress-native` line class + CSS (`.cm-line.lie-suppress-native > .cm-image / >
    .cm-url:not(.lie-attr)` → none). CDP: `nativeBody inline → none` on dismiss, `docText` intact (no
    `:has`, no `!important`, source not replaced — Lesson 11/12 held).
  - [x] **Bug 86 — DONE/VERIFIED.** The engaged-pin: `main.ts.engagedImageLine()` (the AD12 surface state)
    feeds `resolveLinkReveal.engaged`; the reveal stays shown while a panel/crop holds the image, whatever
    the cursor does. CDP: cursor off the line → hidden when NOT engaged, **stays shown when engaged**.
    `refreshLivePreviewDecorations()` added to every surface `onClose` so it un-pins on close.
  - [x] **Bug 114 — DONE/VERIFIED.** The uniform per-embed reveal now hosts the stand-in INSIDE the block
    widget too (`EmbedWidget` block mode, `lie-fake-link-block.lie-show`). CDP (focus-emulated): native →
    Obsidian reveals the source on the bare line + stand-in hidden (D16); always → block stand-in shown
    off-cursor; auto → shown on a real-pointer hover. The earlier "bare never reveals" was a focus-less
    test artifact — with focus emulation the bare line DOES reveal natively on the cursor line.
  - [x] **No-flicker — DONE/VERIFIED (2026-06-28, §2.5).** The no-`:has` deterministic same-transaction
    mechanism is CDP-verified. The `:has` reveal coupling is **replaced** with a per-element `lie-show`
    class (`.lie-fake-link.lie-show` / `.lie-attr.lie-show`) computed by `resolveLinkReveal` (pure,
    unit-tested), uniform across standalone / inline / bare. Mutual exclusion D16, seamless swap D17,
    single transaction → no flicker frame.
- **AD10 DETECTION REWRITE — DONE/VERIFIED (2026-06-28). Detection IS Obsidian's OWN logic:**
  - [x] `collectEmbeds(state)` ENUMERATES embeds from the editor `syntaxTree` (markdown begins at an
    `image-marker` node, wikilink at a `formatting-embed` node — CDP-grounded against Obsidian's real node
    names, see `scratchpad/probe-tree`), NOT a parallel regex. The regex only PARSES each located span
    (`EMBED_AT`). A code-block `![](…)` carries `hmd-codeblock` (no image/embed node) → excluded BY
    CONSTRUCTION; **F20** re-includes via a regex fallback. `ensureSyntaxTree` forces the full-doc parse
    and an `updateListener` rebuilds on parse-progress so off-viewport embeds land in the RangeSet (CM
    only PAINTS the viewport — that is normal, not a bug). CDP-verified: all 4 types (md standalone/bare/
    inline, wikilink) enumerated; the reveal preserved; full CDP suite 15/15.
  - Minor leftovers: `inlineEmbeds` (live-preview-logic) is now unused by the build (still exported +
    unit-tested) — a future tidy. The whole-doc tree walk per build is O(doc) (same order as the old
    per-line scan); a viewport-scoped optimisation is possible later if large docs feel heavy.
- [ ] **On shipping:** version is **already 0.6.12** (parallel session) and the last commit is 0.6.11 →
  this code rides the pending 0.6.12, **no extra bump** ("one batch = one patch"). **CHANGELOG.md is being
  edited by the parallel session** — add the reveal-rework entries in coordination, don't clobber. **Remind
  the user to commit** (user commits, no `Co-Authored-By`).

> Done this session: Bug 114 numbered; D16/D17; AD10 sharpened; AD11 generalised; AD12 new; AB16/16a/16b
> rewritten; traceability F8/F9 + D12–D15; counters; the three CLAUDE.md rules.

---

## 7. Key code locations (for the eventual implementation)

- `src/live-preview-logic.ts` — `EMBED_LINE` (line 5), `INLINE_EMBED`, `inlineEmbeds`, `lineDecorations`,
  `reduceReveal` (122–147, incl. the auto-clear block 139–145), `rewriteWidth`.
- `src/live-preview.ts` — `createLivePreviewExtension` build loop (context-blind `for i=1..doc.lines`),
  `FakeLinkWidget` (the stand-in; `highlightEmbed` reproduces Obsidian's token classes — the pixel-identity),
  `EmbedWidget` (WidgetMode `block`/`standalone`/`inline`), `DISMISSED_LINE` line decoration, the
  `mouseenter/leave → setHover` wiring, `makeRevealButton` (`<>`), the StateField `update` rebuild triggers.
- `src/main.ts` — `crop()`, `registerToolbarDismissHandlers`, the scattered engagement chain
  `filterPanel || classPanel || submenu || cropEditor` (~504; → AD12's one predicate), delegated `mouseover`.
- `styles.css` — the reveal gate (`.lie-toolbar-in-image` opacity), the `.cm-line:has(> .cm-formatting)`
  yield heuristic + the `cm-formatting`-avoidance on the `{…}` mark (both to be retired), `.lie-dismissed`,
  the `.cm-line:not(:has(.lie-cropping))` crop suppress (Bug 109).
- `esbuild.config.mjs` — externals include `@codemirror/language`, `@lezer/common`.
- `package.json` — devDeps currently only `@codemirror/state` + `@codemirror/view` (need
  `@codemirror/language` for `syntaxTree` types).

---

## 8. Build / test / CDP — self-contained recipe

All commands run **inside the devcontainer** (podman); never build on the host.

```bash
npm run build      # tsc -noEmit + esbuild production
npm run lint       # eslint src/ — the SHIPPED gate, kept as-is
npm test           # vitest run
npm run dev:vault  # esbuild watch -> writes into vault-image-toolbar/ plugin dir (auto-reload)
```

**CDP live debugging** (how the §4 findings were made):
- On the HOST: `scripts/obsidian-dev.command` (macOS) launches Obsidian with
  `--remote-debugging-port=9223 --remote-allow-origins=*`; then `npm run dev:vault` (a **dev build** runs the
  in-plugin relay).
- From the devcontainer:
  ```bash
  CDP_PORT=9223 CDP_TARGET=vault-image-toolbar node scripts/obsidian-debug.mjs --list
  CDP_PORT=9223 CDP_TARGET=vault-image-toolbar node scripts/obsidian-debug.mjs --eval '<expr>'
  ```
  Use **9223** (survives `location.reload()`); the 9222 relay flaps after a plugin reload.
- Gotchas: an **async** `--eval` resolves to `{}` over the bridge (stash to `window.__X`, poll a sync read);
  an un-invoked arrow returns `{}` (`JSON.stringify` your result); **focus-gated** behaviour needs
  `Emulation.setFocusEmulationEnabled` (§4); real `:hover` needs a real `Input.dispatchMouseEvent` via
  `tests/cdp/_optical.mjs`. **Never** `disablePlugin`/`enablePlugin` — use `location.reload()`.

---

## 9. Parallel-session caveat

The working tree may carry **uncommitted `src/` changes from a different (parallel) session** (earlier: a
"Syntax & info" settings help-card). Leave foreign `src/` edits alone. The `docs/development/*`, `CLAUDE.md`,
`HANDOVER.md` and `issues.md` changes described above **are** this cluster's work.

---

## 10. One-paragraph "start here" for the next session

Round-2 **all docs are done** (requirements D16/D17 + F8; architecture AD10–AD12, AB16/16a/16b; Bug 114;
**test-plan** + **implementation-plan §3.3**). The settled model is §2 — **read it, don't re-derive it.**
The user gave the **"go"**: **CODE is in progress (session 3)**, built **ground-up** — the pure logic
first (`isEngaged`, then `reduceReveal` + the settings), then the framework wiring (`syntaxTree` gate,
StateField reveal, CSS). The live checklist is **§6**. The hard invariants are **D16/D17** (atomic, no
flicker, one whole); the **reveal mechanism's no-flicker MUST be CDP-verified before you commit it** (§2.5)
— and the three OPEN points in §6 (bare-embed native-edit, the mechanism choice, F20 code-source) are
settled in-app/CDP, **not** guessed. Keep replies short and in natural German; **think each change through
once**. The user makes all commits (no `Co-Authored-By`); version bump is patch-only, on shipping code.
