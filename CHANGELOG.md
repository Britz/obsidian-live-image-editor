# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); version numbers use
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) notation but are bumped **patch-only**
during 0.x (each release `+0.0.1`; no minor/major jumps).

Every entry is numbered in one global per-category sequence — **Decision**, **Change**, **Feature**,
**Bug** — and split across the version it shipped in. Within a version the list is sorted
Decision › Change › Feature › Bug, each category newest-first (highest number on top). Numbers are
never reused. (Open/unsolved items and the hard-won lessons live in `docs/development/issues.md`.)

## [0.6.14] - 2026-07-22

The embed grammar completed by design — a hand-written scanner replaces every embed regex in the project, so reading an embed matches everything Obsidian's own parser accepts within Markdown syntax and writing emits only Obsidian's canonical form; the auto-normalizer's own size-fold path rides the same grammar round-trip. Verified live (CDP); `npm test` 342.

- **Change 54 — The md native-size fold rides the ONE grammar round-trip; a conflicting `width=`/`height=` block key is replaced, not duplicated.** _What:_ the auto-normalizer's fold (`normalizeNativeSizes`, [main.ts](src/main.ts)) drops its own embed regex (incl. its private `\|` table-escape knowledge) and `parseAltText`/`serializeTransform` rebuild — per line it now rides the same `parseEmbedLine` → `buildEmbed` round-trip as every other rewrite (only an md embed with a native size folds; a wikilink's native size stays in place, F5/F6). `foldSizeIntoBlock` ([link-format.ts](src/link-format.ts)) now REPLACES a `width=`/`height=` key already in the block for each axis the native size sets (the native pipe size wins) instead of appending a duplicate key — quote-aware, every other token keeps its place. _Why:_ R0/DRY — the same fold existed twice, with duplicated escape knowledge outside the one grammar source. Unit-tested (conflict replacement, height axis, foreign-token order) in [link-format.test.ts](tests/unit/link-format.test.ts); `implementation-plan.md` updated (gated).
- **Bug 120 — The embed grammar ignored Markdown's escape/encoding layer — table embeds were destroyed on open (normalizer data loss), size/crop submenus muted, `\|<size>` unfoldable, and paths like `Screenshot (1).png` unparseable.** The trigger was the table-escaped pipe: in a table row a content pipe is written `\|`, but the grammar split the wiki inner at the first RAW pipe, so `![[p\|90]]` parsed with path `p\` — merely opening a note let the auto-normalizer rewrite the row to a broken `![](p\){width=90}` (no image, raw attr text, deterministic data loss), `locateActiveImage` never matched such embeds (size/crop submenus silently dead on those rows), and a resize couldn't remove the native `\|90`. The insight is general — Markdown links carry a whole escape/encoding layer, and any editor may write it — so the fix is the LAYER, by design, at the one grammar source (link-format): a hand-written scanner replaces every embed regex in the project (the resolver's and live-preview-logic's included). READ accepts what Obsidian's parser reads within Markdown syntax (verified live against `metadataCache`): a wiki inner to the first `]]` (single `[`/`]` legal), the table layer stripped (`\|` ≙ `|`), the alias at the first pipe, a `#`/`^` subpath split off for resolution; an md alt with CommonMark backslash-escapes; an md destination bare with arbitrary-depth balanced or `\(\)`-escaped parens (unbalanced → not an embed), as `<…>` angle form, or with a trailing `"…"` title (recognized, discarded); `%`-decoding for comparisons. WRITE emits only Obsidian's canonical form: md destinations percent-encode exactly Obsidian's set (space/backslash/control), the angle form is never newly produced, wiki stays raw, and into a table row every pipe goes out escaped (`escapePipe`, carried via `ImageLocation.inTable`). Verified live (CDP): opening no longer rewrites `\|` rows destructively (wiki mode leaves them byte-identical; md mode folds them into valid `{width=…}` embeds), the size submenu opens on `\|` rows, and a width commit folds `\|90` → `{width=75}` cleanly.

## [0.6.13] - 2026-07-15

Hotfix for the standalone runtime: `lie-runtime.js` crashed on every foreign page since 0.6.9 because the Change 40 sweep leaked the Obsidian-only `activeDocument` global into the shared core the runtime bundles. Verified: `npm test` 306 (incl. the new 3-case shim guard), `npm run build` green, built `lie-runtime.js` contains the shim.

- **Bug 119 — Standalone runtime threw `ReferenceError: activeDocument is not defined` on every claimed image (broken since 0.6.9).** _Cause:_ Change 40's eslint-driven `document` → `activeDocument` sweep (0.6.9) deliberately skipped `runtime.ts` but converted the exact flagged positions in the SHARED core too — `ensureLayers` in [render-core.ts](src/render-core.ts) and `createCaptionEl`/`mountCaption` in [caption-dom.ts](src/caption-dom.ts) — which the runtime bundle also pulls in; off-Obsidian the `activeDocument` global does not exist, so the first hydrate crashed and no image rendered. No test covered the DOM path (the render-core unit test only asserts `CLAIM_SELECTOR`). _Fix:_ the runtime ENTRY ([runtime.ts](src/runtime.ts)) now SHIMS the Obsidian-only globals — `Object.assign(globalThis, { activeDocument: document, activeWindow: window })` at the top of `run()`, before the first hydrate. This is AD9's runtime-exception clause: off-Obsidian the runtime supplies the missing platform binding itself, exactly as it supplies its own inline-Markdown renderer. The shared core keeps referencing `activeDocument` unchanged, so both callers stay identical AND Feature 39's still-open `window` → `activeWindow` half is safe in the runtime too. A source-text guard [runtime-global-shim.test.ts](tests/unit/runtime-global-shim.test.ts) asserts the shim stays in the entry and ahead of hydrate. Pitfall recorded in `implementation-plan.md` (gated).

## [0.6.12] - 2026-07-02

Closes out the reveal/dismiss rework by removing the last behaviour **forks**: the `<>` dismiss becomes **per-embed and link-only** (two embeds on one line dismiss independently, inline embeds included), the editing toolbar is unified into **one definition shown in two presentations** (in-chrome + floating) so the `<>` and every control behave identically everywhere, and **clicking any image** — body or resize handle — moves the caret onto that embed uniformly (pure hover never does). Closes Bug 104. Verified: `npm test` 303, `verify-reveal-matrix` 25/25, `verify-resize-affordance` 9/9, `verify-reveal` 5/5, `verify-optical-chrome` 9/9, `verify-crop` 19/19.

- **Change 53 — The editing toolbar is ONE definition shown in two presentations; the `<>` reveal is a shared item (closes Bug 104).** _What:_ `buildToolbarElement` renders the bar from the shared `ToolbarItem[]` for BOTH the in-chrome presentation (hosted by the `EmbedWidget` on the image box) and the floating one (`ImageToolbar` on `body`) — identical buttons, order and behaviour, only the host and a `lie-toolbar-in-image` / `-floating` class differ ([toolbar.ts](src/toolbar.ts), [live-preview.ts](src/live-preview.ts)). The `<>` reveal, previously built OUT of the item model by `makeRevealButton` and prepended ONLY in-chrome, is now a normal leftmost `ToolbarItem` built in `toolbarItemsForImage` ([main.ts](src/main.ts)): its action is the exported `toggleEmbedReveal(img)` (which recovers the editor via `EditorView.findFromDOM` and toggles the per-embed key), and its per-show `is-off` + label flip read the wrapper's `.lie-dismissed` class (a plain DOM signal set in the widget). `makeRevealButton` + the manual prepend/separator are gone; `ToolbarButton` gains an optional `className`. _Why:_ the old fork meant a floated / inline (`.lie-float`) image — whose in-chrome bar is hidden — had NO reachable `<>` at all (Bug 104). One toolbar model makes the control present and identical in both views. Aligns the code with the already-recorded AB10 ("Toolbar", one) and D1.1 ("show the SAME bar floating"); `implementation-plan.md` updated (gated).
- **Change 52 — The `<>` dismiss is now per-EMBED and link-only, superseding the per-line suppress (Bug 65 / Change 48).** _What:_ the dismiss is keyed by the embed's document position (`e.attrEnd`), NOT the line, so two embeds on one line dismiss independently and an **inline** embed dismisses too (the old `e.mode !== "inline"` exclusion is removed). Suppression is **link-only**: a per-embed `lie-suppress-native` **MARK** over the body span (`e.from…e.embedEnd`) hides only THAT embed's native raw link — no whole-line `.lie-dismissed` class, no `!important` — while the stand-in + `{…}` hide via their own withheld `lie-show`, so a sibling embed or surrounding text on the line is untouched. `reduceReveal` gains a `lineOf` mapper so the per-mode auto-clear maps each dismissed embed key back to its line ([live-preview-logic.ts](src/live-preview-logic.ts), [live-preview.ts](src/live-preview.ts), [styles.css](styles.css)). _Why:_ Bug 65 / Change 48 suppressed the WHOLE cm-line, which couldn't target one of two embeds on a line and skipped inline embeds; keying per embed span realizes AD11 ("the plugin owns source-link visibility per embed span") faithfully. The `.lie-dismissed` class now rides the WRAPPER as a plain per-show DOM signal for the toolbar (no suppression).
- **Bug 118 — Clicking an inline (mid-text) image didn't move the caret onto its source.** _Cause:_ two standalone-centric assumptions. (1) The click target was the LINE START (`lineAt(posAtDOM(wrapper)).from`) — for a standalone the embed IS the line start, but for a mid-text inline image the line start is other text, not the link. (2) The resize handle (a fixed-size marker half over the image corner) fully COVERS a tiny inline image, and the mousedown handler skips `.image-resize-corner`, so the click was swallowed and the caret didn't move at all. _Fix:_ a shared `moveCaretToEmbed(view, wrapper)` lands the caret on the EMBED span (`posAtDOM(wrapper)`) uniformly for every mode, driven on the CLICK (`pointerdown` / `mousedown`) of BOTH the image body and the resize handle — so every active interaction moves the caret while pure hover moves nothing, and a plain click on the handle no longer resizes (a >2px drag threshold distinguishes a resize from a click) ([live-preview.ts](src/live-preview.ts)). CDP-verified: standalone + inline clicks land on the embed and reveal; the resize drag still rewrites the width.

## [0.6.11] - 2026-06-27

The **raw-link reveal rework** — an image's source reveal/dismiss now derives from Obsidian's OWN parse (AB16b / D16 / D17) instead of a parallel regex or DOM guesswork, with a single **native / auto / always** reveal-mode dropdown (Feature 33) replacing the old boolean; the bare/inline embeds are unified onto the one uniform render, a reveal flip no longer rebuilds the image+caption (no flicker), the floating toolbar is reachable on cropped/short images, and **inline** is clarified as the vertical-alignment layout axis. Closes Bug 65 / 86 / 114. Verified: `npm test` 301, `verify-reveal-matrix` 25/25, `verify-resize-affordance` 9/9, plus the existing suite green.

- **Decision 34 — Inline redefined as the VERTICAL-alignment axis, orthogonal to the five horizontal layout states and to size (doc-only).** _What:_ Clarifies the layout model in [requirements.md](docs/development/requirements.md): F15 and the retitled F17 ("Inline = the VERTICAL-alignment layout state") recast **inline** as the sole VERTICAL axis — it governs only an in-line image's vertical position on the line — orthogonal to the five HORIZONTAL block-left/centre/right · float-left/right states (which place an image taking its own block space) and orthogonal to SIZE (F24). The six F15 states therefore present as one mutually-exclusive choice while operating on two different axes (five horizontal, one vertical). F24 is clarified so `icon` sets the **icon width** (the smallest preset width), dropping the stale "sets the inline size (F17)" phrasing; the implementation-plan AB14 row for [size-submenu-logic.ts](src/size-submenu-logic.ts) is synced to describe `icon` = a line-height `height` and to drop the retired `inline` field from `SizePreset`, stating SIZE is orthogonal to layout. _Why:_ Documentation catching up to the already-shipped "decouple size from layout" refactor (commit ba2dfa4) so the F-items and the plan match the code. **Doc-only — no behaviour change:** no layout-state mapping or size-preset code changed in this batch (the `icon` = line-height-height / `SizePreset` decoupling already shipped).
- **Decision 33 — One engagement predicate `isEngaged` centralizes every "is this image active?" check (AD12).** Added the single pure predicate `isEngaged` ([toolbar-region-logic.ts](src/toolbar-region-logic.ts)) — the union of cursor-on-line ∪ hover ∪ selected/active ∪ panel-open ∪ crop-active — that every cross-cutting decision now reads instead of a fresh per-site `filterPanel || classPanel || submenu || cropEditor` chain. [main.ts](src/main.ts) replaces those scattered chains in the click / overlay-mutation / Escape / hover-leave / float-region paths with `anyPanelOpen()` (filter/class/sub-menu subset, excludes crop) and `anySurfaceOpen()` (the full plugin-surface union the Esc / overlay-dismiss / hover-leave / float-region paths consult), both routed through `isEngaged`. The hover/cursor/selection inputs are gathered live by callers; only the union is pure. Routing the same cross-cutting decision through one predicate keeps the reveal pin (Bug 86), the floating-region dismiss and the overlay/Esc dismiss consistent. Realizes the pre-recorded AD12; `implementation-plan.md` updated (gated) ([toolbar-region-logic.ts](src/toolbar-region-logic.ts), [main.ts](src/main.ts)).
- **Decision 32 — Raw-link reveal derives from Obsidian's own parse via one pure decision `resolveLinkReveal` (AB16b / D16 / D17).** The headline of the rework, on the model side: the reveal/dismiss of an image's raw markdown link no longer reacts to the DOM or a parallel regex — it is DRIVEN top-down from Obsidian's own parse spans (is the cursor within the body `![](…)` span? within the `{…}` span?) plus the mode/dismiss/engaged state. A single pure, unit-tested function `resolveLinkReveal` ([live-preview-logic.ts](src/live-preview-logic.ts)) computes the whole-link outcome: the body shows as EITHER the native raw link OR the plugin's display-only stand-in (fake link), **mutually exclusive by construction** (D16 — cursor-in-body ⇒ native carries it and the stand-in hides, otherwise the stand-in carries it), and the trailing `{…}` shows/hides **as one whole with the body** (D17). It returns `showStandIn` / `reserveStandIn` / `showAttr` / `suppressNative`; the StateField turns this into a top-down line marker class the CSS keys on with plain parent→child selectors (no `:has`). This realizes the already-recorded AB16b/D16/D17/AD10 architecture (architecture.md unchanged — it predates this code); `implementation-plan.md` updated to the `resolveLinkReveal`-driven model (gated). No behaviour-defining doc above the plan changed.
- **Change 51 — Embed detection is now Obsidian's own parse (`syntaxTree`), not a parallel regex (AD10).** _What:_ the new `collectEmbeds` in [live-preview.ts](src/live-preview.ts) **enumerates** embeds from the editor `syntaxTree` — a markdown embed starts at an `image-marker` node, a wikilink embed at a `formatting-embed` node — and the regex now only **parses the span the parse located** (the `![…](…)`/`![[…]]` body plus the trailing plain-text `{…}`), with placement (standalone / bare-block / inline) read from the surrounding line. _Why:_ a code-block `![](…)` carries neither marker node (only `hmd-codeblock`), so it is **excluded by construction** — no separate code-block check — while F43 "render in code blocks" re-includes those via a regex pass. `ensureSyntaxTree` forces the parse to document end so lower-line embeds appear in the same build; a parse timeout/failure **fails open** to a full regex scan so embeds never vanish; and a guarded `updateListener` dispatches a refresh when the background parser advances so newly-parsed regions render.
- **Change 50 — The inline render-fork is dissolved — inline embeds use the same uniform chrome as standalone/block.** _What:_ [live-preview.ts](src/live-preview.ts) drops the separate `inlineEmbeds` path (and the `EMBED_LINE`/`inlineEmbeds` imports); the early `if (this.mode === "inline")` minimal-render branch in `EmbedWidget.toDOM` is gone, so the chrome assembly is **one uniform path for all three modes** — only the wrapper class differs (for CSS placement) and `lie-float` just routes a too-small icon to the floating toolbar. Inline embeds now flow through the same `collectEmbeds` + per-embed reveal decision as standalone and bare, getting the same `lie-show` stand-in and `{…}` mark. _Why:_ a single mechanism for every embed (R0/uniform-rendering, AD3) — removes the divergent inline minimal path that caused the inline reveal glitches.
- **Change 49 — A reveal flip updates the block stand-in in place — no image/caption rebuild (kills caption flicker + the resize-affordance 1c regression).** _What:_ the [EmbedWidget](src/live-preview.ts) signature now splits into a `structuralSig()` (everything that needs a full rebuild) and the reveal state (`showStandIn`/`reserveStandIn`); a new `updateDOM` mutates **only the hosted block stand-in's reserve-triad class in place** (via `blockFakeClass()`, keyed off a `data-lie-struct` stamp on the wrapper) and returns `false` only on a real structural change. _Why:_ previously a reveal flip made `eq()` false, so CodeMirror destroyed and rebuilt the whole widget — re-creating the image and its **async** caption, which produced a visible caption flicker and the resize-affordance 1c regression. Now the image and caption DOM survive a reveal change untouched.
- **Change 48 — Reveal/suppress/reserve CSS reworked onto plugin-owned markers (AB16b) — no `:has`, no `!important`.** _What:_ the reveal block in [styles.css](styles.css) is rebuilt to key on plain parent→child selectors over line/element markers the StateField **owns and sets in the same transaction**, instead of guessing the cursor line from Obsidian's DOM: per-element `.lie-fake-link.lie-show` / `.lie-attr.lie-show` (driven by the AB16b decision), a new RESERVE TRIAD for the bare/raw-link BLOCK stand-in — `.lie-fake-link-block.lie-reserve` (an empty placeholder holding a line of height above the image, `display:block; visibility:hidden`) and `.lie-fake-link-block.lie-reserve.lie-show` (paints it, flipping only `visibility` — so reserve↔reveal is a pure paint swap with no reflow; standalone/inline embeds keep the legacy collapse/show), and a line-level `.lie-suppress-native` that hides Obsidian's revealed body tokens (`.cm-line.lie-suppress-native > .cm-image`, `> .cm-url:not(.lie-attr)`) on a `<>`-dismissed line. The old mode classes (`lie-rev-auto`/`lie-rev-always`), the `.cm-active` + `.cm-line:has(> .cm-formatting-*)` reveal-slave selectors and the `.lie-dismissed … display:none !important` overrides are removed. _Why:_ mutual exclusion of native-vs-stand-in is now **by construction** (D16 — the StateField withholds `lie-show` when the cursor is in the body, so Obsidian's native source carries it) and the trailing `{…}` shows/hides as one whole with the body (D17), so the brittle `:has`/`.cm-active`/`!important` machinery is gone and the dismiss can suppress even Obsidian's own active-line reveal (Bug 65's render half).
- **Change 47 — `reduceReveal` generalized to three modes with a per-mode dismiss auto-clear.** _What + why:_ the transient `<>` dismiss/hover state reducer `reduceReveal` ([live-preview-logic.ts](src/live-preview-logic.ts)) now takes the three-valued `mode` (native/auto/always) instead of the old `alwaysShow` boolean, and its auto-clear ("a dismiss clears when you LEAVE the image, not sticky across visits") follows the mode: NATIVE clears off the active/cursor line; AUTO additionally keeps a dismiss on the hovered line; ALWAYS never auto-clears (a dismiss persists until toggled/reload). A line freshly toggled in the same transaction stays exempt, so a `<>` dismiss takes effect in its own transaction and only auto-clears on a later leave/cursor-move — holding for both the mouse and the `:focus-within`/keyboard path. The broader AD12 engaged pin is a display freeze layered on top and only ever keeps a dismiss longer.
- **Change 46 — Migrate the legacy boolean `alwaysShowLink` to the three-state `defaultRevealState` on load.** _What:_ `loadSettings` now migrates a stored `alwaysShowLink` boolean to the new `defaultRevealState` reveal mode that supersedes it — `true → "always"`, `false → "auto"` (the old `false` meant "auto / on-hover") — only when the new key was not already persisted, then deletes the stale key; the plugin also now reads `() => this.settings.defaultRevealState` (in place of `alwaysShowLink`) when constructing the LP extension. _Why:_ the reveal-source setting was reworked into a single combined dropdown (the Feature 33 UI lives in settings.ts); `Object.assign` over `DEFAULT_SETTINGS` won't translate the old boolean, so existing vaults need this explicit one-time mapping to keep their prior preference ([main.ts](src/main.ts)).
- **Change 45 — Settings that affect the LP render now force an immediate live re-render of the open editor.** _What + why:_ `refreshLivePreviewDecorations()` is made public on [main.ts](src/main.ts) and forces a re-render of every open MarkdownView's LP decorations; it is now called from the settings tab after toggling reveal mode, captions, the new code-block render and the toolbar — and from each editing-surface `onClose` (filter/class/size/crop). Otherwise the open editor kept its old decorations until an unrelated edit, so a setting change (e.g. switching reveal to auto/always) looked like it "didn't take" because hover still behaved by the old decorations until the user typed; forcing the refresh applies the new render immediately.
- **Change 44 — Redraw the inline layout icon to signal the vertical alignment axis.** _What:_ The two text strokes of the **inline** layout icon moved from the box foot (`y=16.5`) to the box **vertical middle** (`y=12`) in both the source artwork [layout-icons.ts](src/layout-icons.ts) and the synced preview [layout-icons-preview.html](layout-icons-preview.html); the file's leading doc-comment was rewritten to explain the new framing. _Why:_ With `inline` redefined as the lone VERTICAL-alignment axis (vertical-align of an in-line image), the icon now depicts the text line meeting the box at its vertical middle rather than sitting at its foot — visually distinguishing it from the five HORIZONTAL block/float states. Artwork-only change; the layout-state behaviour and mapping are untouched.
- **Change 43 — A "Syntax & info" settings card: full `{…}`-syntax help, editor-style highlighting + a self-info link.** A new card at the bottom of the settings documents how edits are stored. Its heading carries a native `book-open` Lucide icon on the left (D12-coherent — chosen over an emoji, which would also clash with our no-`innerHTML`/no-runtime-`<style>` constraints) and a **"More info"** CTA on the right — prefixed with Obsidian's `external-link` glyph — that opens **this plugin's own page** in Obsidian's community-plugin browser (`obsidian://show-plugin?id=<manifest.id>`, via the existing `openPluginStore` helper). Above the framed list (in normal body text, outside `.setting-items`): an intro line, then a **copyable** code sample in a native **"example" callout** (`data-callout="example"`, via a shared `renderCallout` helper), then a prose hint that `width`+`height` together distort and that one dimension + `aspect-ratio` is the responsive-friendly choice (keyword mentions as inline `<code>`). The sample is highlighted across the **whole** `![…](…){…}` link, not just the `{…}` block — link text/target in accent (`.lie-syntax-link`), punctuation muted (`.lie-syntax-punct`), each `{…}` attribute its own underlined token (`.lie-syntax-token`), tokenized by `renderEmbedPrefix`/`renderExampleLine` and built from spans since the card is outside CodeMirror (no `.cm-*`); it **wraps** instead of scrolling and is selectable to copy. The framed list itself is **one native `Setting` row per keyword** (the literal token with its possible values as the row name in `<code>`, the explanation as its desc, also selectable), grouped size → layout → orientation/crop → appearance → classes/raw/marker and covering the **full** writer vocabulary (§2.3): `width=`/`height=` (CSS length — a bare number is px, a unit also works), `aspect-ratio=`, `align=` (float vs block, each value explained), `rotate=`, `flip=` (each value explained), `transform=` (crop placement), `filter=`, `.classname`, `style=` (raw-CSS escape) and the optional `.lie` **claim marker** (the plugin no longer emits it, but `CLAIM_SELECTOR` still honours it so a user can force export / standalone-runtime pickup). All localized (DE/EN) with the literal tokens kept as code; styling stays in `styles.css` (no runtime style injection). Documented in `implementation-plan.md` under the F20 Settings umbrella (no requirements change — in-app help) ([settings.ts](src/settings.ts), [styles.css](styles.css), [src/i18n/](src/i18n/)).

- **Feature 43 — New "Render images in code blocks" setting (Live Preview only, default off) — the lone AD10 override.** _What + why:_ added the `renderImagesInCodeBlocks` boolean setting ([settings.ts](src/settings.ts), default off, threaded through to the LP extension in [main.ts](src/main.ts)) with DE/EN strings. Off (the default) defers to AD10 — an image embed inside a fenced or inline code block stays literal code, matching Obsidian's parse, which treats a code-block embed as not-an-embed. On, the plugin renders it as an image anyway; this is the single documented override of AD10's "defer to Obsidian's parse". Surfaced under F20 in the General settings card.
- **Feature 33 — Reveal-source setting is now ONE combined dropdown (native / auto / always) replacing the boolean `alwaysShowLink`.** _What:_ the old _Always show the link source_ toggle (auto/always) becomes a single three-state dropdown — **native** (source on the active/cursor line only, the new default), **auto** (additionally on hover), **always** (everywhere) — surfaced in the General settings card with new DE/EN strings. The setting key changes from the boolean `alwaysShowLink` to `defaultRevealState: RevealMode` ([settings.ts](src/settings.ts)), with the new `RevealMode = "native" | "auto" | "always"` type added in [live-preview-logic.ts](src/live-preview-logic.ts); a `loadSettings` migration in [main.ts](src/main.ts) translates a stored legacy `alwaysShowLink` (see Change 46). _Why:_ Feature 33 asked to merge the scattered reveal toggles into one ordered choice. The no-reflow-on-reveal behaviour that Feature 33's spec splits into separate "Auto — Höhe sichtbar" vs "Auto" options is instead baked into the model for ALL modes via `resolveLinkReveal`'s `reserveStandIn` (the stand-in holds the source box as an invisible placeholder unless the native carries it), so the image never jumps on reveal without needing a fourth option; the explicit "Hidden" option is the per-image `<>` dismiss, not a mode.
- **Bug 117 — Floating bar for inline-icon / short-block images dismissed before it could be reached.** _Cause:_ the floating hover bar sits ABOVE the image with an 8px gap, but dismiss was an immediate-on-leave check in the delegated `mouseover` handler — moving the pointer image→bar crossed that gap, left the image, and dismissed the bar before it could be reached (acute for a tiny inline icon). _Fix:_ the floating bar now rides the SAME `bindRegionHover` active region (D6) as the panels: a new `bindFloatRegion` binds the image wrapper + the `.lie-toolbar-floating` element as ONE region with the shared 160ms travel-grace, and dismiss fires only when the WHOLE region is left (and no panel/palette/surface governs it). The region cleanup (`floatRegionCleanup`) is unbound on open of a new image and on `dismissToolbar` ([main.ts](src/main.ts)).
- **Bug 116 — Floating toolbar flung far above a cropped/scaled image, detached and unreachable.** _Cause:_ `positionAbove` anchored the floating bar to `img.getBoundingClientRect()`, but a cropped/scaled image's own `<img>` rect overflows its visible frame (the `.lie-image-area` clips it), so the bar was placed above the raw (oversized) image top rather than the box the user sees — landing far above the visible image, detached and unhoverable. _Fix:_ anchor to the visible box instead — `(img.closest(".lie-image-area") ?? img).getBoundingClientRect()` — so the bar sits a gap above what the user actually sees and hovers; falls back to `img` when no image-area is present ([toolbar.ts](src/toolbar.ts)).
- **Bug 115 — An INLINE embed's `{…}` attribute list is now highlighted as link syntax in Source mode.** _Cause:_ in Source mode `lineDecorations` matched only the whole-line `EMBED_LINE`, so a `{…}` attached to an embed that had text or a trailing character around it on the line (an inline embed, not a standalone) was skipped and left un-highlighted. _Fix:_ Source mode now scans the whole line with a new `EMBED_WITH_ATTR` regex (every embed that carries a required `{…}`, standalone AND inline) and emits the brace/url-string marks for each match ([live-preview-logic.ts](src/live-preview-logic.ts)). The LP-branch (standalone widget) path is unchanged.
- **Bug 114 — A bare embed's markdown/wikilink source never revealed on hover in Live Preview.** _Cause:_ a **bare** embed (`![](…)` / `![[…]]` with no `{…}`) is block-promoted by Obsidian into a cm-line-less `.cm-content` child, which **swallows** an inline stand-in decoration — so the plugin's `block:true` widget rendered the image but carried **no `.lie-fake-link`** at all, leaving the F8 reveal nothing to show. _Fix:_ the block-mode [EmbedWidget](src/live-preview.ts) now **hosts the stand-in raw link inside its own DOM** (a `.lie-fake-link-block` span built in `toDOM`, the source for it carried by the per-embed `reveal.showStandIn`/`reserveStandIn`), so cursor / hover / always-mode / the `<>` dismiss all drive the bare source exactly like a standalone embed. Confirmed by the new `bare`/`wikilink` rows of [verify-reveal-matrix.mjs](tests/cdp/verify-reveal-matrix.mjs) (real-pointer hover, cursor-on-line, dismiss, engaged-pin).
- **Bug 86 — Link-reveal flipped during a crop / panel interaction, making the image jump.** _Cause:_ the raw-link reveal followed the live cursor/hover state, so while a crop (or filter/class/size panel) held an image the reveal could toggle as the pointer or caret moved on/off the image's line — reflowing the line and shifting the image mid-interaction. _Fix:_ an engagement-keyed reveal PIN (AD12 / AB16b) plus a no-reflow stand-in. (Model) `resolveLinkReveal` treats `engaged` as a natural-show with `suppressNative:false` so the link stays visible and does not flip ([live-preview-logic.ts](src/live-preview-logic.ts)); a new `engagedImagePos()` in [main.ts](src/main.ts) resolves the exact document position of the engaged embed (via `posAtDOM` on the active image's `.lie-wrapper`, gated on `anySurfaceOpen()` + a connected active image, read through the pure `isEngaged` predicate — see Decision 33) and is passed into `createLivePreviewExtension`, so the StateField pins THAT exact embed precisely — a standalone occupies its whole line, an inline embed only its own span, so a sibling inline embed on the same line is not over-pinned, and it returns null when no surface is open or the active image can't be resolved. (Render) `build` reads `getEngagedPos()` and passes `engaged` into the per-embed decision so the reveal is pinned and cannot flip ([live-preview.ts](src/live-preview.ts)), while the block stand-in sits on its **own reserved placeholder line above the image** — a RESERVE TRIAD in [styles.css](styles.css) (`.lie-fake-link-block.lie-reserve` is `display:block; visibility:hidden`, `.lie-reserve.lie-show` flips only `visibility`) — so reveal↔hide is a pure paint swap with no reflow and the image never jumps. The auto-clear is also engaged-aware: since ENGAGED ⊇ cursor∪hover it only ever keeps a dismiss longer, never clears one earlier. The `engaged`-pin case is covered by the `bare engaged-pin off-line` row of [verify-reveal-matrix.mjs](tests/cdp/verify-reveal-matrix.mjs).
- **Bug 65 — A `<>` dismiss now suppresses Obsidian's native raw link even on the cursor line.** _Cause:_ on the active/cursor line Obsidian reveals its OWN editable raw-link tokens (the real `![…](…)` document text); the old `<>` dismiss hid only the plugin's overlay (`.lie-fake-link` + `.lie-attr` via `.lie-dismissed`), so it lost the fight with the native reveal and the front of the link stayed visible. _Fix:_ AB16b makes the StateField the single authority. (Model) `resolveLinkReveal` returns `suppressNative:true` on a dismiss (`{ showStandIn:false, reserveStandIn:false, showAttr:false, suppressNative:true }`) so the plugin overrides even where Obsidian would natively reveal, and collapses the reserve box (the user explicitly cleared the source, so no placeholder gap is left) ([live-preview-logic.ts](src/live-preview-logic.ts)). (Render) the StateField stamps the line marker `lie-suppress-native`, and CSS hides Obsidian's revealed body tokens scoped to that line (`.cm-line.lie-suppress-native > .cm-image`, `> .cm-url:not(.lie-attr)`) using plain parent→child + `:not`, no `:has`, no `!important` — the native text stays in the document and editable, only the on-screen reveal is suppressed (Lesson 11/12). CDP-verified ([styles.css](styles.css)).

## [0.6.10] - 2026-06-25

Crop-overflow rework — Obsidian 1.12.7 raised the specificity of its block-widget `contain:paint`, which silently defeated the crop editor's `contain:none` lift, so the croppable surround and the resize frame/corner were clipped at the cut window. Replaced the brittle lift with a body-portal model that stops fighting containment. This release also lands a **black-box / optical + functional CDP test layer** (Change 41) — pixel + pointer-hit-test checks that observe the painted result instead of reading CSS properties, with a one-command runner — plus an honesty pass removing false-greens and un-runnable false-reds from the existing checks (Change 42); exactly the layer whose absence let this regression ship unseen. It also makes the hover **resize marker** mirror Obsidian's native handle exactly and stops it being clipped on block-layout images (Bug 112) — a padding-only reserve, no `contain:none` — with new optical coverage (block marker not clipped, caption anchor). Verified live via CDP on 1.12.7 (the full `verify-all` suite now **15/15**, incl. `verify-resize-affordance` 9/9 with the block/caption marker checks and `verify-crop` 19/19) plus `npm test` green (283), `npm run build` / `lint` / `lint:css` clean and `lint:obsidian` 0 errors.

- **Change 42 — Test honesty pass: false-greens and un-runnable false-reds removed from the CDP checks.** A green on a broken feature and an always-red check that can't drive what it asserts both make the suite lie, so the existing checks were corrected against the current behaviour: `verify-render-gaps` now expects the **icon** size preset to persist a line-height `height=`, **not** `.lie-inline` (Change 38 decoupled size from layout — icon is a height, inline is a separate layout state); `verify-write-path` drives the current `applyLayout("float-left")` / `applyLayout("inline")` instead of the removed `applyAlignment` / `toggleInline` (Decision 30); `verify-crop` drops the inline `transform-origin` read (empty **by design** — the centre pivot lives in CSS, so the read was always-red regardless of behaviour; the pivot is covered behaviourally by *preview == committed*); and `verify-submodal-region` is re-driven by a **real CDP pointer** (synthetic `MouseEvent`s can't drive the binder's real `:hover` / `pointer-events` path — they false-RED the leave checks AND false-GREEN the "still active" ones, since the region never actually moved). *(`test-plan.md` records the visibility / "never assume" rules behind this — gated, user-approved.)* ([tests/cdp/](tests/cdp/)).
- **Change 41 — Black-box / optical + functional CDP test layer (observe the painted result, not CSS).** A regression layer that verifies the running plugin the way a user sees it — sampling rendered **pixels** (region screenshots decoded to RGBA) and **pointer hit-tests** (`elementFromPoint`, a REAL CDP `:hover` via `Input.dispatchMouseEvent`) instead of reading CSS properties, so checks survive CSS refactors **and** Obsidian updates (the gap that let Bug 111 ship unseen). It adds a reusable client `tests/cdp/_optical.mjs` (evaluate / real hover / screenshot → RGBA PNG decode); `verify-optical-render` (geometry — rotate/flip footprint, column cap, caption below+within-width, block/float/inline, both views), `verify-optical-pixels` (rotate/flip content + grayscale, sampled), `verify-optical-chrome` (toolbar / sub-menu / handle **visibility**, not mere presence); `verify-functional` drives the size modal as a user and reads the rendered width **and** the persisted `{…}` source back; and a one-command runner `verify-all.mjs` that runs every `verify-*.mjs` and sums pass/fail ("test a new Obsidian version" in one go). *(`test-plan.md` extended to the optical / functional / visibility model — gated, user-approved.)* ([tests/cdp/](tests/cdp/), [docs/development/test-plan.md](docs/development/test-plan.md)).
- **Bug 112 — On a block-layout image the native resize marker was clipped by the block widget's `contain:paint`.** _Cause:_ the plugin's resize marker deliberately deviated from Obsidian's native handle — it sat **centred on the corner tip, half outside the image** — so on a `block:true` widget (tall-float / bare embed), which Obsidian paint-contains (`.cm-content > [contenteditable="false"] { contain:paint }`), the outside half was cut off where the image edge met the widget edge (the same root as Bug 111, but for the always-on hover marker, not the crop chrome). _Fix:_ make the marker **mirror Obsidian's native handle exactly** (D4 — now a fixed requirement that also rules out "just nudge it inside") — the dot sits flush in the corner with only its `2px` accent outline bleeding out, matching app.css `div.image-embed .image-resize-corner` (box `-3px`, marker `+3px`) — and reserve that 2px **inside** the clip with a **padding-only** reserve on `.lie-wrapper-block` (`padding-inline-end` + `padding-bottom`). The block widget is over-constrained, so a compensating negative margin is _dropped_ by the engine (verified — even `!important` resolves to `0`); the padding is absorbed by shrinking the content, so a full-width block image gives up 2px (0.3 %, D3-safe, **no overflow**; standalone images carry no containment, untouched). **No `contain:none` override** — that brittle pattern is exactly what Bug 111 retired; a body portal for the marker stays the documented alternative if the 2px ever matters. Regression-guarded by the optical layer: `verify-resize-affordance` now checks the native marker on a **block** image is fully painted (both the right and bottom 2px bleeds survive the clip — proven by removing the reserve → red) and that with a **caption** the handle anchors to the image corner, not the caption's bottom (closes the **Bug 99 / Bug 107** coverage gap); `verify-optical-chrome`'s marker check was re-tuned to the native geometry. `requirements.md` (D4), `test-plan.md` and `implementation-plan.md` (AD3) updated (gated; user-approved) ([styles.css](styles.css), [tests/cdp/](tests/cdp/)).
- **Bug 111 — Obsidian 1.12.7's `contain:paint` specificity bump broke crop overflow; the resize frame / corner was clipped.** _Cause:_ the in-place crop editor lifted the Live-Preview block-widget host's `contain:paint` with a doubled-class `contain:none !important` so the dim ghost + handle chrome could overflow the cut window; Obsidian 1.12.7 raised the host rule's specificity, so the lift lost and the host re-clipped everything to the footprint — the croppable surround vanished and the resize frame/corner were cut off. _Fix:_ stop fighting containment (Variante B) — the host's `contain:paint` is now **honoured** and the in-host **result image** stays clipped as the footprint; everything that must extend past it (the dim **ghost** showing the croppable surround + the handle **chrome**) moves to a **body portal** anchored to the in-host frame's rect (re-anchored on scroll/resize), with a `clip-path` hole over the result so the in-host result shows through. The hole is `path(evenodd, "<outer rect> <hole rect>")` — two contours making a true frame; a single `polygon()` joins the rects with diagonal edges that slice triangular artifacts into the surround (caught + regression-guarded by the new optical pixel check). Pan works on both surfaces (the in-host result through the hole, the portal ghost outside); teardown removes the portal and its scroll/resize listeners on every exit path. `architecture.md` (AB12), `implementation-plan.md` and `test-plan.md` were updated to the portal model (gated; user-approved) ([crop-editor.ts](src/crop-editor.ts), [styles.css](styles.css)).

## [0.6.9] - 2026-06-16

Re-release after the community-plugin review failed v0.6.8: fixes the one review-failing error and clears the largest warning class. Verified `npm test` green (283), `npm run build` / `lint` clean, `lint:obsidian` 0 errors (17 documented warnings, down from 101).

- **Change 40 — `document` → `activeDocument` across the in-Obsidian plugin source — the first part of Feature 39 (popout support).** This is one half of the still-open **Feature 39**; it lands the `activeDocument` conversion only (the `window` → `activeWindow` half and popout-reachability verification remain open under Feature 39). The review bot flags `obsidianmd/prefer-active-doc` as a WARNING on every bare `document` reference, and the rating counts per occurrence — ~95 hits dragged it down. All global `document` references in the in-Obsidian plugin source were converted to Obsidian's window-aware `activeDocument` (popout-correct; identical to `document` when there is no popout, so no behaviour change in the common case). The standalone runtime (`runtime.ts`) keeps raw `document` — that off-Obsidian bundle imports no `obsidian`, so the `activeDocument` global does not exist there (same exception class as its raw `instanceof`); its 6 flags stay documented warnings. Done by replacing only the exact eslint-flagged code positions (not a blind text sweep, so comments/strings naming "the document" are untouched). `lint:obsidian`'s `prefer-active-doc` rule is now `warn` (was deliberately `off`) so a regression resurfaces. This is the `activeDocument` portion only; the remaining Feature 39 work (`window` → `activeWindow`, and confirming popout reachability) stays open ([eslint.obsidian.config.mjs](eslint.obsidian.config.mjs), plugin source).
- **Bug 110 — The standalone runtime's caption renderer assigned `innerHTML`, failing the community review.** _Cause:_ v0.6.8's new off-Obsidian caption renderer (Feature 41) set `caption.innerHTML = renderInlineMarkdown(...)`, which the review bot rejects (`Unsafe assignment to innerHTML`) — the single error that failed the v0.6.8 review. _Fix:_ `renderInlineMarkdown` still returns its already-escaped, href-sanitised HTML string (kept a pure string→string unit, its 6 tests unchanged), but the runtime now parses it via `DOMParser` and grafts the nodes in with `replaceChildren` instead of writing `innerHTML` — the parse runs in a detached document (no script execution) so, with the upstream escaping, the result is inert ([runtime.ts](src/runtime.ts), [runtime-markdown.ts](src/runtime-markdown.ts)).

## [0.6.8] - 2026-06-13

Captions, crop and resizing fixes — the standalone runtime (`lie-runtime.js`) now renders image captions off-Obsidian (with inline Markdown); the resize handle anchors to the image corner even with a caption; resizing on hover no longer breaks undo; and the link-source reveal stays put during a crop. Verified `npm test` green (283), `npm run build` / `lint` / `lint:css` clean.

- **Decision 31 — Off-Obsidian the runtime carries its OWN minimal inline-Markdown caption renderer (an explicit AD9 exception).** AD9 ("reuse the platform, never a parallel reimplementation") binds only where the platform actually provides the capability. On a foreign page the standalone runtime has no Obsidian and no `MarkdownRenderer`, so it may carry a small **runtime-only** inline renderer (bold / italic / code / link) for captions — that is not a parallel reimplementation of a platform capability (there is none to reuse here), and the plugin's caption path keeps using `MarkdownRenderer` unchanged. Full fidelity stays bounded by the **lossy `alt` attribute** (e.g. python-markdown strips code-span backticks before the runtime sees the alt). Recorded as the AD9 "runtime exception" in [architecture.md](docs/development/architecture.md).
- **Feature 41 — The standalone runtime now renders image captions off-Obsidian.** _Previously_ `lie-runtime.js` built the 3-layer image but never the caption, so captions worked only inside Obsidian (the reported "standalone captions don't work"). The runtime now reads a claimed image's `alt`, derives the caption text with the plugin's own `captionFromAlt` (native size token stripped) and wraps the image in a `.lie-has-caption` shrink-wrap host — the off-Obsidian stand-in for the plugin's `.lie-box` — sized to the image width by CSS alone (D9, no JS width-sync). The caption shell + host builder live in a new shared, Obsidian-free `caption-dom.ts` reused by **both** the plugin and the runtime; the text is rendered with the runtime's own inline-Markdown renderer (Decision 31). A claim trigger is required, so the width-only caption examples in the example vault carry a `.lie` marker ([caption-dom.ts](src/caption-dom.ts), [runtime.ts](src/runtime.ts), [runtime-markdown.ts](src/runtime-markdown.ts), [render-core.ts](src/render-core.ts)).
- **Bug 109 — While cropping, the link-source reveal flipped as the mouse left the image.** _Cause:_ the crop chrome (rotate handle etc.) extends beyond the image / crop-frame, so dragging the pointer onto it leaves the `.cm-line`, and the auto reveal is keyed on `.cm-line:hover` — so the source link popped in and out mid-crop. _Fix:_ suppress the hover reveal on a cropping line (`.cm-line:not(:has(.lie-cropping))`); during a crop the source follows ONLY the stable signals (`.cm-active`, always-mode, the `<>` dismiss), so an off source (auto-mode resting state or dismissed) stays off and an always-shown one stays shown, regardless of where the crop drags the mouse ([styles.css](styles.css)).
- **Bug 108 — Resizing via the hover handle without first clicking the image sent cmd+Z to the document top.** _Cause:_ the resize handle is reachable on hover, so the caret may sit at offset 0; the resize write did not pass the D11 cursor, so undo restored the offset-0 selection and scrolled to the document top. _Fix:_ the resize write now passes the resized image's line as the cursor (D11), seeding the change transaction's `startSelection` so cmd+Z stays on the image ([live-preview.ts](src/live-preview.ts)).
- **Bug 107 — With a caption the resize handle sat at the caption's bottom-right, not the image corner.** _Cause:_ the handle is `position:absolute; bottom:0` against `.lie-box`, which a caption (a sibling flex item, D9) extends below the image — so `bottom:0` anchored to the caption's bottom. _Fix:_ wrap the image and the handle in a non-clipping `.lie-image-host` that shrink-wraps the image only, so `bottom:0` anchors to the image corner; the box stays the caption shrink-host (D9), and the corner marker keeps its centred-on-the-corner position because the host has no `overflow:hidden` (unlike the image-area, RENDER_CSS) ([live-preview.ts](src/live-preview.ts), [styles.css](styles.css)).

## [0.6.7] - 2026-06-12

Inline and in-list/callout image embeds now reveal their link source exactly like a standalone image — fixing the long-standing "the link shows without its `{…}`" / "stray `{…}` with no link" glitches when the cursor is on the line. The inline decoration path was rebuilt onto the standalone reveal machinery and the reveal heuristic was narrowed; verified live via CDP across standalone / inline / list / markdown-link / native-size embeds, `npm test` green (277), `npm run build` / `lint` clean.

- **Bug 106 — List/callout image showed the `{…}` PERMANENTLY as stray text, the link never revealed.** _Cause:_ the reveal heuristic `.cm-line:has(> .cm-formatting)` (hide the fake link when Obsidian natively reveals the source; show the `{…}`) matched ANY direct `cm-formatting` child — a list bullet (`cm-formatting-list`) or a callout/quote marker — so on a list/callout image line it fired in EVERY state: the fake link was always hidden and the `{…}` always shown (a stray attr with no link). _Fix:_ narrow the selector to the embed's OWN link/image tokens (`cm-formatting-link` for a wikilink, `cm-formatting-image` + `cm-formatting-link-string` for a markdown link), which a structural list/quote marker never carries ([styles.css](styles.css)).
- **Bug 100 — Inline (mid-text) image: the LINK wasn't shown, only the `{…}`, and the `{…}` had no syntax highlighting.** _Cause:_ the inline path replaced the whole `![…]{…}` with a cursor-skipped `Decoration.replace` and gave the `{…}` none of the standalone path's fake-link/`.lie-attr` treatment; with the cursor on the line the replace was dropped entirely, so the native image (uniformly CSS-suppressed) vanished and the bare `{…}` was left as stray text with no link. _Fix:_ the inline path now mirrors the standalone path (architecture AB16 — "inline embeds get the same widget; only chrome placement differs"): a display-only fake link paints the source for the reveal-for-looking, the `{…}` is a marked + url-string-highlighted native text, and the plugin draws its own inline image widget; no more cursor-skipped replace ([live-preview.ts](src/live-preview.ts)).
- **Bug 96 — Link shown DOUBLED in Live Preview (Doppellink).** _Cause:_ the reported "standalone double" was an INLINE image with the cursor on its link — the cursor-skipped inline replace (Bug 100) fell back to Obsidian's native (image-suppressed) embed with no coordinated fake link, so the source could surface alongside the painted artifacts. _Fix:_ resolved by the same inline rework — the fake link now yields to a GENUINE native reveal via the narrowed `:has` selector (Bug 106), so the link is never shown twice ([live-preview.ts](src/live-preview.ts), [styles.css](styles.css)).

## [0.6.6] - 2026-06-10

A six-state layout rework (block/float/inline), a native-size wikilink fix and several smaller fixes — verified `npm test` green (277), `npm run build` / `lint` / `lint:css` / `lint:obsidian` clean.

- **Decision 30 — Layout is ONE flat six-state choice (block-left/center/right · float-left/right ·
  inline), not two conflated axes; serialized back-compat + HTML-faithful.** The old model overloaded
  `align=left|right` to mean *float* and kept `inline` as a separate boolean, so "block-left/right"
  (aligned, no wrap) was impossible and the toolbar couldn't show which state was active. The rework
  makes the six valid states a single `layout` field (the impossible combinations — float-center,
  inline-with-position — simply don't exist), surfaced as six radio buttons (exactly one active). On
  disk: **float stays the genuinely HTML-faithful `align=left|right`** (a browser floats `<img
  align=left>`), **block uses the `align=block-left|block-center|block-right` keys**, **inline the
  `.lie-inline` class**; legacy `align=center` and `.lie-left|right|center` classes still READ
  (migrate on next save). Chosen over the symmetric `align=left=block` scheme because that would have
  silently reinterpreted every existing float note AND dropped the float HTML-fidelity. The earlier
  "click-cycles, hover-opens-submenu" idea was dropped for the simpler flat six-button set (no invalid
  combinations, nothing to gray out). Icons are hand-drawn (Lucide has none for image-to-text
  layout; a `gallery-vertical` family — frame + box / box + side-lines / box-in-a-line), since icon
  artwork is design-patent/copyright territory only for a specific drawing, not the generic concept.
- **Change 39 — The editing-toolbar submenu now inserts in the MIDDLE of the bar, not the left edge.**
  The original slot (right after a leading undo/redo run) put our entry at the far left, where its
  expand-on-click row reaches off the right window edge on a wide bar ("ragt aus dem Fenster", per the
  user). `insertIndexFor` now returns `floor(list.length / 2)`. We still only set the INITIAL slot — a
  re-add never reorders an existing, correctly-formed entry, so a user's manual placement is kept.
- **Change 38 — `height=` serializes as a bare key (round-trip); size is decoupled from layout.** The
  parser already read a bare `height=` (`applyKey`), but `serializeTransform` always normalized it to
  the `style="height:…"` escape, so `{… height=1.4em}` didn't round-trip. It now emits `height=N` as a
  bare key for every unit (a pure px value drops the unit, mirroring `width=N`). Separately, the size
  sub-menu's `SizeState`/presets no longer carry an `inline` flag — the `icon` preset sets only a
  line-height height; the inline rendering is the `inline` *layout* state, chosen independently.
- **Feature 40 — The six-state Layout group: radio buttons + active highlight + custom icons +
  hover animations.** The Layout toolbar group is six buttons (block-left/center/right,
  float-left/right, inline), exactly one highlighted to match the image's current state (computed per
  show in `toolbarItemsForImage`; the `.lie-toolbar-btn.is-active` accent rule — the first toolbar
  active-state, mirroring `.lie-class-item.is-active`). Each carries a custom `addIcon` icon
  (`layout-icons.ts`) and a fitting hover micro-animation (block = directional nudge, float = a
  sideways "wrap" drift, inline = a bob into the line). The same six states drive the command palette,
  the editing-toolbar submenu and the keyboard commands. CSS: float floats the host, block uses
  `text-align` on a full-width host (block-left/right are new), inline keeps the direct
  `vertical-align` rule; the standalone runtime mirrors all of it with direct selectors.
- **Bug 94 — A native wikilink/markdown size was ignored when rendering.** Every render path built
  the transform from the `{…}` block alone (`parseAltText(params)`), so a raw `![[img|160]]` or
  `![[img|160 "Caption"]]` — size in the link, not the block — rendered at the default column size
  (the caption already parsed, only the size was dropped). The native size token (already extracted by
  link-format's `splitTail`) is now folded into the transform's `width`/`height` on read in BOTH the
  reading-view post-processor (`processBlock` / `reconcileFromSource`) and the live-preview widget,
  via the new pure `applyNativeSize` (the explicit `{…}` block always wins — same precedence as the
  write path). EVERY pipe variant is covered: bare `300`, `300x200`, the `auto`-axis forms, a size
  with a caption in either order, the legacy `caption|300` suffix, and the markdown `![alt|300](p)`
  form — in both link forms. Live preview reads the raw source; reading view uses a priority chain
  (raw source alias → `img.alt` token → the `width`/`height` attributes Obsidian sets for a pure
  native size, where it strips the size from the alt) so no variant slips through (`foldNativeSize`). On an actual EDIT the size is normalized into the block and stripped from the link head
  (`writeTransform` rebuilds the embed via `buildEmbed`; `modifyTransform`/the size, crop and filter
  panels read the current size through the shared `locationTransform`), keeping the design invariant
  that size lives in the block, never the pipe (F6/T2). A plain caption-only embed is untouched.
- **Bug 79 — The editing-toolbar submenu could keep stale pre-rework layout entries.** The load-time
  self-heal that migrates our submenu to the current command set (here: the six new layout entries,
  replacing the old `class-left|center|right` / `toggle-inline`) shared one `await` chain with the
  snippet scan in `onLayoutReady` — `await this.refreshSnippets(); await ensureEditingToolbarButtons(…)`.
  A `refreshSnippets()` throw (a vault read error) skipped the migration entirely, freezing the submenu
  at its previous shape until the next clean reload (observed live). The two are now independent: the
  scan is wrapped in its own try/catch so it can never block the migration.
- **Bug 78 — A block-aligned image (`align=block-*` / legacy `align=center`) broke its source line
  onto two lines in live preview.** The block layout rules styled both the plugin's `.lie-wrapper`
  widget AND the native `.image-embed` with `display:block; width:100%`. In reading view `.image-embed`
  IS the image container, so that is correct; but in live preview it is the SUPPRESSED native embed
  sitting inline in the editable source line, and forcing it full-width block pushed the `{…}` block
  onto a second visual line below the `![](…)` link, even with ample width. The `.image-embed` half of
  the block rules is now reading-view-scoped (`.markdown-reading-view` / `.markdown-preview-view`); in
  live preview the standalone `.lie-wrapper` widget alone carries the block layout (it already centers
  the image), and the native embed stays inline. Float rules are untouched.
- **Bug 77 — Undo after a toolbar edit jumped the view to the document top.** Plugin edits were
  written without a selection (old D11 — "never move the cursor"), so the edit transaction's
  `startSelection` stayed at offset 0; CM6 restores that selection — with `scrollIntoView` — on undo,
  hurling the view to the top of the note. D11 is **revised**: a single-image edit now places the
  caret on its image's line (like Obsidian's own embeds), but only on an actual edit, never on hover.
  Mechanically, `writeSource` takes an optional `cursor` and, when given, dispatches a **prior**
  selection-only transaction (`addToHistory: false`) so the caret sits on the image *before* the
  change — making that position the change's `startSelection`, which undo then restores. (Setting the
  selection *on* the change transaction would not help: undo uses the selection from before the
  change.) Bulk writers — multi-select edits, link normalization — omit the cursor and are unchanged.
- **Bug 76 — A non-native layout now CLAIMS, so block / center / inline render on a published page.**
  `CLAIM_SELECTOR` claimed an image only on a runtime-only key; `align=center` (and now
  `align=block-*` / `.lie-inline`) have no faithful HTML rendering, so off-Obsidian they showed
  unstyled. They are added to the claim selector (`[align="center"]`, `[align^="block-"]`,
  `.lie-inline` + `data-` variants); `align=left|right` (float) stays unclaimed — a browser floats it
  natively. `readTransform` also now reads a `height=` attribute.

## [0.6.3] - 2026-06-07

A one-bug fix to localization: the plugin now follows Obsidian's UI language faithfully, including
when Obsidian is set to English. Verified: `npm test` green (272), `npm run build` succeeds.

- **Bug 93 — The plugin ignored Obsidian's language whenever Obsidian was set to English.**
  `detectLocale()` returned `navigator.language` (the OS/browser locale) whenever `getLanguage()`
  was `"en"`, so on a German OS the toolbar/menus showed **German even with Obsidian set to English**
  — the opposite of F21 ("follow Obsidian's locale, no language setting of our own"). `getLanguage()`
  is documented to return the configured app language and **default to `"en"`**, so the `!== "en"`
  branch made the plugin prefer the system locale over Obsidian's actual setting. Fixed: `detectLocale()`
  now mirrors `getLanguage()` verbatim (`getLanguage() || navigator.language || "en"`); the browser
  locale stays only as a last-ditch guard for an (per the API, impossible) empty return.

## [0.6.2] - 2026-06-07

A follow-up to the v0.6.1 community-plugin-review compliance pass. The automated **re-review of
v0.6.1** (`review-0.6.1.md`) still **failed** — now on a single error: the standalone runtime's
`createElement("style")` (`runtime.ts:32`). v0.6.1 had documented that file as a "false positive"
and EXCLUDED it from the local recreation, but the real review bot scans it anyway, so the exclusion
only hid the failure instead of resolving it. This release fixes it at the source — the runtime now
injects its CSS via a constructable stylesheet (`adoptedStyleSheets`), not a `<style>` element — and
makes the recreation **bot-faithful**: `npm run lint:obsidian` now scans all of `src/` (incl. the
runtime + dev-bridge non-plugin bundles) and mirrors the bot's severities, so the gate's error set
equals the bot's and would catch this class before the bot does. Everything else the review flags is
a documented warning/recommendation (Decision 26), none of which fails the review. Verified: `npm run
lint:obsidian` 0 errors (11 documented warnings), `npm run lint` clean (T9), `npm test` green (272),
`npm run build` succeeds.

- **Decision 29 — The review recreation must SCAN everything the bot scans and MATCH its severities;
  non-plugin false-positives are fixed at the source or kept as documented warnings, never hidden by
  exclusion (supersedes the exclusion clause of Decision 25).** Decision 25 excluded the standalone
  runtime (`runtime.ts` → `lie-runtime.js`) and the dev-only CDP bridge (`dev-bridge.ts`) from
  `lint:obsidian` as "false positives for the shipped plugin" — but the bot scans the whole repo, so
  the runtime's `<style>` kept **failing the real review** while our local gate stayed green (the
  drift that produced `review-0.6.1.md`). Corrected: `eslint.obsidian.config.mjs` no longer ignores
  those two files, and rules the bot reports as WARNINGS are set to `warn` locally (the recommended
  ruleset makes `import/no-nodejs-modules` and `obsidianmd/prefer-instanceof` hard errors; the bot —
  like our `no-deprecated` handling — shows them as warnings) so "0 errors locally" ⟺ "review won't
  fail". The genuine off-Obsidian/dev-only false positives are kept as documented warnings (runtime
  raw `instanceof` — no `obsidian` import, so no `instanceOf()` helper; dev-bridge `net` — tree-shaken
  from production) rather than silenced with inline disables that would break the shipped linter (T9 /
  Lesson 17). `prefer-active-doc` (the bot's `document` → `activeDocument` warnings) is large,
  popout-only churn with no review-failing impact and is deferred to **Feature 39**, kept off in the
  gate by deliberate decision (not suppression). → **Lesson 18**.
- **Change 37 — The runtime injects CSS via `adoptedStyleSheets` instead of a `<style>` element;
  `lint:obsidian` made bot-faithful.** `runtime.ts`'s `inject()` no longer does
  `document.createElement("style")` + `head.appendChild`; it builds a `new CSSStyleSheet()`,
  `replaceSync(css)`, and appends it to `document.adoptedStyleSheets` (same effect on a foreign page,
  no forbidden element — the Obsidian-review `no-forbidden-elements` error class is gone at the
  source). A module-level `Set` keeps the per-id dedupe the old `getElementById` guard provided.
  `eslint.obsidian.config.mjs` drops the `runtime.ts`/`dev-bridge.ts` ignores, downgrades
  `import/no-nodejs-modules` + `obsidianmd/prefer-instanceof` to `warn` (bot severities), declares the
  `NodeJS` + `__LIE_DEV__` ambients so `no-undef` doesn't fire on recreation artifacts, and relaxes
  the no-console wrapper for the dev-only bridge. A new guard test
  (`tests/unit/runtime-style-injection.test.ts`) fails the moment a `<style>` element creeps back into
  the runtime (source-text assertion — the runtime is browser-only and can't load in jsdom). 272 tests
  green. No behaviour change for users (the runtime renders identically; the plugin proper was already
  `<style>`-free since Change 33).

## [0.6.1] - 2026-06-06

An Obsidian community-plugin-review compliance pass. The automated review (`eslint-plugin-obsidianmd`
+ a CSS scan + a behaviour scan) **failed** on two error classes — inline static styles and a
runtime-injected `<style>` element. Both are resolved with the smallest faithful change: static
styles move to CSS, dynamic per-image values stay inline, and the plugin no longer hand-injects CSS.
The review is now reproducible locally (`npm run lint:obsidian` / `lint:css`) **without** touching
the shipped linter (T9). Independently of the review, this release also fixes a footprint bug when
rotating explicitly-sized images (Bug 90). Verified: `npm run lint:obsidian` reports 0 errors (6
documented deprecation warnings), `npm run lint` stays clean, `npm test` is green (270), `npm run
build` succeeds.

- **Decision 28 — `:has()` is reserved for reacting to Obsidian's own DOM; self-set markers/classes
  ride the element they style (the outer).** Reaffirms AD2/AD3: everything the user's `{…}` block
  carries — `.class`, `style`, the align marker — belongs on the **outer `.lie-image-area`** (the
  size/layout element), never the inner `<img>`. Adds the discipline that since the plugin BUILDS the
  outer (and the LP `.lie-wrapper`), every class/marker it sets is placed on the element that must
  react and selected DIRECTLY (`.lie-image-area.lie-left`) — `:has()` is used ONLY where the plugin
  must react to Obsidian's own, uncontrolled DOM (the source-reveal slaving
  `.cm-line:has(> .cm-formatting)`), never `:has(img.lie-*)` for our own classes. The code previously
  violated this (classes/markers on the `<img>`, alignment via `:has(img.lie-*)`) — the root of the
  decoration-clipping the reverted shadow/border workaround papered over — now FIXED in **Change 36 /
  Bug 91** (markers on the outer; runtime `:has`-free; the plugin's host float `:has` reads the outer's
  marker, the tolerated CM case). Snippet contract: with the class on the outer, an
  example/vault snippet is authored as a plain `.classname` (+ `.classname img` for pixel effects like
  `circle`'s `object-fit`), never the internal `.lie-*` structure. Recorded in architecture.md (AD3
  note + AB20 + the F18 row).
- **Decision 27 — Adopt GitHub build-provenance attestations for the release binaries.** The release
  workflow now runs `actions/attest-build-provenance` on `main.js` / `styles.css` (permissions
  `id-token: write` + `attestations: write`), so a CI-cut release is cryptographically tied to this
  repo+commit (verify with `gh attestation verify <file> -R <owner>/<repo>`). Caveat recorded:
  attestation only happens inside GitHub Actions (OIDC/Sigstore) — there is no purely-local path, so
  the `/release` skill's local `gh release create` stays unattested; making CI the sole publisher is a
  separate future decision.
- **Decision 26 — Keep the justified CSS-scan warnings and the 1.12.7-floor deprecations (documented,
  not removed).** The remaining `:has()` warnings are unavoidable: alignment/float/reveal must style a
  flow-participant ANCESTOR (the embed / `.cm-line`) from a marker on a DESCENDANT (the outer box, or
  Obsidian's own `.cm-formatting`) — the only CSS-only mechanism (Bug 10/27; AD5 forbids reactive JS).
  The removable `:has` (inline, embed shrink-wrap) were dropped in Change 36; the runtime is `:has`-free.
  The `!important` warnings override Obsidian core / dynamically-gated rules (the crop `contain:none`
  beating app.css `contain: paint !important`, the tall-float cap, the dismissed-reveal) — audited in
  Change 36, the one removable defensive `!important` dropped. `PluginSettingTab.display()`
  + `ButtonComponent.setWarning()` are deprecated since 1.13.0, but their replacements
  (`getSettingDefinitions` / `setDestructive`) are 1.13.0-only and `minAppVersion` is **1.12.7**
  (`display()` is the officially-sanctioned <1.13.0 fallback) — kept; `no-deprecated` set to *warn* in
  the recreation. All are warnings, not the errors that fail the review. The review's "Vault
  Enumeration" behaviour flag (`vault.getFiles()` in `replace-picker`) is likewise justified and left
  as-is: it backs the F26 Replace-image fuzzy picker (a `FuzzySuggestModal` needs the full image
  candidate set up front), is already filtered to image extensions, and has no narrower public API.
- **Decision 25 — Recreate the review as a SEPARATE dev-only lint pass; the shipped linter is kept
  exactly as-is (T9).** Added `eslint-plugin-obsidianmd` (recommended) behind `npm run lint:obsidian`
  (a new `eslint.obsidian.config.mjs`) and a stylelint `npm run lint:css` (`stylelint.config.mjs`) that
  reproduces the bot's `:has`/`!important` CSS scan — neither touches `eslint.config.mjs` / `npm run
  lint`. The standalone runtime (`runtime.ts` → `lie-runtime.js`) and the dev-only CDP bridge
  (`dev-bridge.ts`, tree-shaken via `__LIE_DEV__`) are excluded from the pass: off-Obsidian / in dev
  they legitimately need `createElement("style")` / raw `instanceof` / a `net` import, so the bot's
  flags on them are FALSE POSITIVES for the shipped plugin. They are excluded rather than silenced
  with inline `eslint-disable` comments because those would name obsidianmd rules the shipped linter
  doesn't know and would break `npm run lint` (→ Lesson 17).
- **Change 36 — Everything the `{…}` block carries now rides the OUTER box, not the `<img>`
  (Decision 28 / Bug 91).** `render-core`'s `applyClasses` puts the user's `.class` list (incl. the
  built-in `rounded`/`shadow`/`bordered`/`circle` and any vault-snippet class) AND the
  `lie-left/right/center` / `lie-tall` / `lie-inline` markers on the OUTER `.lie-image-area` (one
  tracked set, `data-lie-classes`). This fixes the real defect behind the reverted shadow/border workaround: a decoration
  class now styles the un-clipped footprint box, so `box-shadow` / outset `border` are no longer clipped
  by the wrapper's `overflow:hidden`. The bundled snippet moves to the clean public contract — plain
  `.rounded` / `.shadow` / `.bordered` / `.circle` (no internal `.lie-*`), `.circle img, img.circle {
  object-fit:cover }` (the `img.circle` fallback for a bare/exported image), and theme-adaptive colours
  (`var(--text-normal)` border, a `color-mix` text-colour shadow). `snippet-classify` parses the new
  `.NAME` form (legacy `img.NAME` still accepted so an installed copy migrates; the auxiliary
  `.circle img` rule is not mis-counted), and `resetLieState` clears a reused img's legacy
  classes-on-img. Then the REMOVABLE `:has` went away: the inline `:has(img.lie-inline)` became the
  direct `.lie-image-area.lie-inline`, and the reading-view embed shrink-wrap `:has(> .lie-image-area)`
  became a `.lie-embed` class the post-processor sets on the host that holds the box. The **standalone
  runtime is now `:has`-free** — with the align marker on the outer (= the flow participant off
  Obsidian) it floats via a direct `.lie-image-area.lie-left`. The only `:has` left are the reveal
  (Obsidian's own `.cm-line`/`.cm-formatting` DOM) and the plugin's alignment-float family, now
  `.host:has(.lie-image-area.lie-…)` (reacting to the outer's marker) — the tolerated CM-context case
  where the plugin can't class the host it doesn't own. Exactly per Decision 28. **BREAKING for snippets:** a snippet (or
  installed bundled copy) targeting `img.myclass` no longer matches — Reset the bundled snippet in
  settings, and update hand-written vault snippets to `.myclass` / `.myclass img`. NOTE: the box-effect
  visuals + the inline/shrink-wrap layout are not headless-verifiable — verify in Obsidian.
- **Change 35 — API-correctness / lint cleanups across the plugin (no behaviour change).**
  `instanceof HTMLElement` → `node.instanceOf(HTMLElement)` (cross-window safe, main.ts); bare
  `setTimeout` → `window.setTimeout` (toolbar.ts); promise-returned-where-void-expected fixed with
  `void` / a threaded reject (main.ts export button, settings `ConfirmModal` — its `onConfirm` widened
  to `() => void | Promise<void>`); five redundant type assertions removed (main.ts, render-core
  `align`); `loadData()` laundered with `as Partial<LieSettings>`; the post-processor `.bind(this)`
  replaced with a typed arrow; the two English notices dropped their redundant "Live Image Editor:"
  prefix (sentence-case); `localStorage["language"]` replaced with Obsidian's `getLanguage()` (F21,
  `prefer-get-language`); `@codemirror/state` + `@codemirror/view` declared as **devDependencies**
  (Obsidian-provided externals — declared, not bundled, so T1 "no runtime deps" holds).
- **Change 34 — Static inline styles → CSS classes (`no-static-styles-assignment`).** The 3-layer
  centring/sizing literals move into `RENDER_CSS` (`.lie-frame`/`.lie-frame > img`, with a `lie-crop-fit`
  marker for the crop `height:auto`); crop-editor, anchored-submenu, toolbar and export static literals
  move to `styles.css` classes (`.lie-crop-img`, `.lie-crop-frame-box`, `.lie-measuring`,
  `.lie-submenu-hidden`, position/z-index on `.lie-group-popup` / `.lie-toolbar-floating`,
  `.lie-export-path-input`); the crop host `contain:none` override moves from inline-`!important` to a
  doubled-class `styles.css` rule (the same beat-app.css device as `.lie-toolbar-btn.lie-toolbar-btn`).
  Per-image DYNAMIC values (the crop placement `transform`, `filter`, computed widths/positions, the
  panel coordinates) stay inline — the rule only flags STATIC literals, so they need no change.
- **Change 33 — Eliminate the plugin's runtime-injected `<style>` element (`no-forbidden-elements`).**
  `styles-injector` no longer creates a `<style>`: the static `RENDER_CSS` layer rules and the built-in
  align/inline classes live in `styles.css` (Obsidian loads it), the preset-width vars are set on
  `<body>` via `style.setProperty`, and a disabled built-in class is a `body.lie-cls-off-NAME` marker
  the `body:not(.lie-cls-off-NAME)` rules react to — the same body-class device as
  `applyTallFloatClass`/`applyButtonOutlines`. `RENDER_CSS` stays the single source the standalone
  runtime injects; a new unit test (`styles-render-css.test.ts`) asserts `styles.css` carries it
  verbatim so the two never drift (R0). The runtime (a non-Obsidian bundle) keeps its own `<style>`.
- **Bug 92 — A long-press on an image opened the editing toolbar everywhere, including reading view.**
  A 500 ms `touchstart` handler called `onImageSelected` for ANY `<img>` with no view gate, so on touch
  a long-press in **reading view** raised the toolbar (and from there the in-place crop on the
  `.image-embed` host) — a double violation of F5/F7 (editing is live-preview only; "no explicit
  platform-specific trigger"). The click/hover entries were already `.markdown-source-view`-gated; only
  this path leaked. Fixed by **removing the long-press handler entirely** — a plain tap fires a `click`,
  which the existing handler already selects in live preview (F7), so touch keeps working. With editing
  now provably LP-only, the dead reading-view scaffolding it had justified is gone too: the crop host
  drops its `.image-embed` branch (always `.lie-wrapper`), the filter/class panels' pane lookup drops
  `.markdown-reading-view`, and the related comments (incl. the native-handle CSS, Bug-32 G) are
  corrected. No behaviour change in live preview.
- **Bug 91 — Decoration / snippet classes + the inline marker rode the `<img>`, not the outer (the
  code violated AD2/AD3).** `render-core`'s `applyClasses` put the user `.class` list + the `lie-inline`
  marker on the `<img>`, which sits inside the wrapper's `overflow:hidden` — so a decoration class's
  `box-shadow` / outset `border` was clipped (the real defect behind the reverted shadow/border
  workaround), and the styling needed `:has(img.lie-*)`. Fixed by Decision 28 + Change 36: the user
  `.class` list AND the `lie-left/right/center` / `lie-tall` / `lie-inline` markers now ride the OUTER
  `.lie-image-area` (box effects no longer clipped). The inline + embed-shrink-wrap `:has` are gone
  (direct selectors); the standalone runtime is `:has`-free; the plugin's alignment-float `:has` now
  reads the outer's marker (`.host:has(.lie-image-area.lie-…)`) — the tolerated CM-context case
  (Decision 28, the plugin can't class the host it doesn't own), not a leftover defect.
- **Bug 90 — Rotating an explicitly-sized image stretched the height instead of swapping the
  footprint.** The toolbar's rotate only flips the `rotate` field (±90°); the footprint must be
  derived from `rotate` + the stored size — which the **crop** path did (`rotatedAabb`) but the
  **non-crop** path did not. So a `width=400` image (height 200 via the intrinsic ratio) kept
  `width=400` on a quarter-turn while the swapped aspect-ratio ballooned the height to 800, instead of
  becoming `width=200 / height=400`; same for an explicit `width=400 height=200`. Pre-existing (the
  `routeBoxStyle` / no-explicit-width logic was unchanged by the v0.6.1 review work). Fixed with a
  pure, unit-tested `rotatedFootprint()` (renderer-logic) that the non-crop sizing now uses: explicit
  width+height swap via `rotatedAabb`; width-only / height-only rotate the base footprint using the
  intrinsic ratio (the other axis follows the swapped `--lie-auto-aspect`); an explicit `aspect-ratio`
  swaps too. 0°/180° are unchanged; non-px values (e.g. a preset `var(--lie-size-…)`) pass through.
- **Bug 89 — A failed/denied vault write during Export was silently swallowed.** The Export fallback
  modal passed an `async` callback into a `() => void` slot, so a rejected `adapter.writeBinary`
  (e.g. a permission-denied or invalid path, the Bug 72/R26 write path) was an unobserved rejection —
  no error surfaced. The callback is now synchronous and threads the write into the outer Promise, so a
  failure rejects and is caught by `exportImage`'s `try/catch` → the "Export failed" notice.

## [0.6.0] - 2026-06-06

A visual-identity milestone: a refreshed icon set, a new brand mark, hover micro-animations, replace
and accessibility features, plus a batch of resolved design decisions. This is a **deliberate minor
bump** (0.5.4 → 0.6.0) — a one-off user decision for this milestone that overrides the project's
usual patch-only policy.

- **Decision 24 — Crop edge/corner handles should reshape the window from the grabbed side.** D8
  clarified: the grabbed corner/edge moves while the opposite side stays anchored — **corners** keep
  the aspect ratio (aspect-locked), **edges** are single-axis. The current code stretches the whole
  image instead, recorded as **Bug 80** (deferred — to be batched with future crop-component work).
- **Decision 23 — The filter histogram should reflect the LIVE filter (and the panel works on `filter=`).**
  The panel reads/writes the inner-image `filter=` attribute (a `{style="filter:…"}` on the outer box is
  an expert edge case the editor doesn't author — and the export doesn't bake it, Bug 82). The histogram,
  though, currently samples the ORIGINAL image — `updateHistogram` draws the img with no `ctx.filter`, so
  the CSS filter (a render effect, not pixel data) never reaches `getImageData` and the chart never changes
  as you tune the filter. That's wrong — it should track the live-filtered result → **Bug 83**.
- **Decision 22 — A Reading-view click opens no toolbar — confirmed intended.** Reading view is
  read-only; editing needs the source / Live-Preview editor (the click handler is scoped to
  `.markdown-source-view`). Pinned in F7 so it isn't read as a gap.
- **Decision 21 — Wikilinks DO carry a caption; link-form parsing must split caption vs. size.** A
  wikilink alias is the markdown-alt equivalent, and `|size` (now incl. `auto` and `WxH`, optionally
  alongside a delimited caption) shares that slot. On md→wiki the native size folds into the `{…}`
  block 1-to-1 (not the pipe) and the caption is preserved; the old code dropped the alias caption —
  fixed as **Bug 81**.
- **Decision 20 — Shared sub-menu host (`AnchoredSubmenu`) API documented as shipped.** No behaviour
  change: the placement modes (under-toolbar / beside-image / centered), `allowFlip` + the pane-bound,
  the body-builder contract and the ✓/✗/Esc + auto-persist lifecycle are now spelled out in D6/F14.
- **Decision 19 — `reset()` vs. `clearStaleTransform` both broke the box invariant.** Verdict: both
  were wrong. The 3-layer DOM — wrapper (size/ratio/layout) → inner frame (rotate/flip) → img
  (filter/crop) — is **always** present and at least parametrized with native defaults; the box is
  never empty (or the image vanishes) and the img is never bare (never without a box), only the
  parametrization varies. So `reset()` must not leave an empty box (→ Bug 78 facet) and
  `clearStaleTransform` must not unwrap to a bare img (→ Bug 79).
- **Decision 18 — T2.3 "never width + height together" vs. custom-size emitting both.** Resolved by
  making T2.3 precise rather than changing code. Explicit width + height from the custom-size path is
  allowed (D6.1/F24); the old "height → aspect-ratio for responsive" idea is moot there because a
  fixed px width sits alongside the height. T2.3 now reads: presets / auto never co-emit width +
  height; the explicit custom-size path may.
- **Decision 17 — Filter panel always-right vs. D7 "the side with more room".** Closed: D7 as written
  is the wanted behaviour. The panel hard-coded `allowFlip: false`, contradicting D7 — recorded as
  Bug 77 rather than reworded.
- **Decision 16 — `data-` prefix on write.** Closed: keep bare keys, by design. Pandoc prepends
  `data-` itself (HTML5-conformant), the brace-stripper likewise; `data-` inside `{…}` would be long,
  unreadable and glightbox-incompatible. **Verified** the standalone runtime reads both spellings
  (bare and `data-`) via `render-core.ts` and shared `runtime.ts` — requirement already met, no bug.
- **Decision 15 — F14 listing Export among the live panels.** Reworded: Crop / Filter / Resize use the
  AnchoredSubmenu, but Export is the native OS save dialog (desktop, `@electron/remote`) / a vault-path
  modal (mobile, `adapter.writeBinary`) — Export is **not** a live panel.
- **Decision 14 — Enter = accept globally while a panel is open.** Closed by design — confirmed it
  feels right and fits the modal / active-region model (panel = focus, Enter ↔ ✓, Esc ↔ ✗).
- **Decision 13 — Residual display-mode coupling (AD3).** Closed by design. Alignment necessarily
  couples `display` (center = block + centred, inline = inline) and the explicit px width keeps the
  footprint identical; documented in AD3 as intended, no refactor.
- **Change 32 — Hover micro-animations.** Subtle CSS micro-interactions on icon hover/click —
  rotate-cw winds up, flip tips over, crop snaps, the eraser wiggles, image-down bounces — all gated
  by `prefers-reduced-motion`. The reset (`eraser`) and reset-all (`copy-x`) share the wiggle so they
  read as one reset family.
- **Change 31 — New brand / plugin icon.** A filled mark: a large spark (replacing the sun) over two
  mountains — left with a plateau (clipped peak, gentle slope), right taller and clipped at the edge,
  slightly tilted with corner brackets. Wired centrally from `docs/img/logo.svg` (fixed colour) and
  `src/brand-icon.ts` (`addIcon`, currentColor) into the editing-toolbar submenu, the README, MkDocs
  (logo + favicon) and the docs index. (No settings-tab header — that would re-introduce the R22
  plugin-name heading the project removed in Bug 68. No settings-sidebar nav icon either: community
  plugins conventionally don't carry one, so adding it would stand out rather than fit in.)
- **Change 30 — Icon redesign across the toolbar and editing-toolbar.** A refreshed Lucide set: filter
  `sliders-horizontal → blend`, custom-size `maximize → image-upscale`, export `download → image-down`,
  CSS-classes `chevron-down → braces`, inline/block `gallery-horizontal-end → wrap-text`, the layout
  trigger `layout-list → text-quote`, and reset / reset-all to `eraser` / `copy-x`. Newer glyphs carry
  fallbacks (image-upscale → maximize, image-down → download, wrap-text → align-justify, eraser →
  x-circle).
- **Feature 36 — "Button outlines" accessibility setting (Auto / Always / Never).** Controls the icon
  button outlines; **Auto** keys off `prefers-contrast` / `forced-colors`.
- **Feature 35 — Replace image / Replace all.** Swap the underlying image file for another — a single
  embed, plus an "all occurrences / whole note" variant; the `replace` / `replace-all` icons mirror the
  reset / reset-all naming. Available as a command and in the editing-toolbar.
- **Bug 88 — The CSS-classes picker was a bare absolute-positioned dropdown, not a panel.** It was
  hand-built chrome (a positioned menu / a centered multi-image list), so it shared none of the panel
  lifecycle. It is now a proper `AnchoredSubmenu` subpanel (`ClassPanel`, mirroring `FilterPanel`):
  a search box on top + a scrollable class list below, `beside-image` placement with the toolbar-top
  anchor (Bug 87) and pane-bound flip (Bug 77), the greyed toolbar, and accept/cancel/Esc + auto-persist.
  Toggling still writes immediately (the old semantics); multi-image opens the same panel centered and
  re-resolves locations live per toggle. Search lives in a pure `filterClasses` (8 new unit tests).
- **Bug 87 — Filter panel opened too high / could overlap the window top.** In `beside-image` placement
  the panel's top was the IMAGE top, then clamped to the panel height — so a tall panel (histogram +
  presets + sliders) got shoved UP, above the image and even off the window near the top edge. It now
  anchors its top to the **toolbar** (a fixed reference just above the image, so the two share a top edge)
  via a new `topAnchorTop` arg to `placeSubmenu`; it slides up ONLY on a window-bottom overflow and snaps
  back on the next reposition (sticky at toolbar height) — no scrolling, the panel stays whole. Only the
  filter panel uses `beside-image`; size/crop (`under-toolbar`) + the centered multi-image panel are unaffected.
- **Bug 85 — Toolbar buttons showed Obsidian's default button frame (a 1px shadow ring + white fill).**
  Obsidian styles a raw `<button>` via `button:not(.clickable-icon)` (its background + the `--input-shadow`
  inset ring), which out-specified our single-class `.lie-toolbar-btn` flat rule — so even `background:
  transparent` lost and a frame showed. The flat-button rules now repeat the class
  (`.lie-toolbar-btn.lie-toolbar-btn`, specificity 0,2,0 > 0,1,1) to kill the native background + shadow,
  with hover/active bumped to match — the buttons read flat again, as the preview always did.
- **Bug 83 — The filter histogram never changed as you tuned the filter.** `updateHistogram` drew the
  `<img>` to a sampling canvas with no `ctx.filter`, so the CSS filter (a render effect, not pixel data)
  never reached `getImageData` — the chart always showed the ORIGINAL image (pointless feedback). It now
  sets the working filter on the sampling context (`tempCtx.filter = filterToCss(currentFilter())`) before
  `drawImage`, so the RGB histogram tracks the sliders live (Decision 23). (The crop half — the histogram
  should also reflect the cut region — is tracked as Bug 84.)
- **Bug 81 — Link-form conversion dropped the wikilink caption and mis-routed the native size.** The
  parser hardcoded `caption: ""` for wikilinks and read only a numeric tail as size; conversion put the
  size in the pipe and dropped the caption. Now one shared `splitTail` parses the alias/alt into a caption and a size — the size
  grammar follows the `obsidian_image_caption` convention (`WxH` with `auto`, e.g.
  `autox200`), and a quoted (`"…"`) caption may sit alongside it. md→wiki folds the native size into the
  `{…}` block 1-to-1 (never the pipe) and preserves the caption; captions, Replace and the conversion all
  share the one parser. (The caption delimiter `"` is hardcoded for now — a candidate future setting.)
- **Bug 79 — `clearStaleTransform` stripped the 3-layer box.** It called `unwrapBox`, violating the box
  invariant "the DOM structure is always present, only the parameters change" (Decision 19). It now
  falls back to native default parameters — the box and the img wrapper stay — instead of unwrapping to
  a bare img; likely shares a root cause with Bug 78.
- **Bug 78 — A cropped image without a `width` vanished** instead of falling back to native sizing.
  Removing the width of a cropped image collapsed the box. The outer box now follows the same rules as
  any image — max document width, capped to the original intrinsic size (height or width depending on
  the box rotation), aspect-ratio derived natively. Crop is not a special case: it only affects the
  inner `<img>`, never the box-sizing rules (AD3/R0). The no-width cropped path is now routed through
  the same native sizing path in `buildLayers`.
- **Bug 77 — The filter panel always docked on the right, not the side with more room (D7).** The
  guided flip was re-enabled: `placeSubmenu` takes an optional pane bound (default = viewport, so other
  callers are unchanged), and in beside-image mode it now decides right/left by space within the editor
  pane (`.markdown-source-view` / `.markdown-reading-view`, sidebar excluded), flipping only if the
  panel fits there — so it never spills over the file explorer (the Bug-56 concern is preserved).
- **Bug 66 — Crop handles were hardcoded white (`#fff`), invisible in light mode.** The crop frame, the
  corner/edge handle squares and the rotate knob + stem are now `var(--interactive-accent)` (theme-
  adaptive, so they read in light *and* dark); the frame is **dashed** to signal the crop layer (distinct
  from the solid native resize handle), and the squares carry a `--background-primary` contrast ring so
  they stay legible on any image.

## [0.5.4] - 2026-06-06

Editing-toolbar integration now actually shows up — as the wanted horizontal icon row.

- **Change 29 — Reset command renamed and re-iconed.** The single-image reset read "Reset all" with
  an `undo-2` icon — easily confused with the page-scope "Reset all images on this page", and the icon
  looked like Undo (right next to the real Undo in the editing-toolbar). It's now **"Reset image"**
  ("Bild zurücksetzen") with an `undo` icon, across the hover toolbar, the editing-toolbar submenu and
  the command palette. (The sub-panel's own "reset this" button keeps `undo-2`.)
- **Bug 75 — Editing-toolbar integration showed nothing.** Three causes: the entry used
  `menuType: "dropdown"` (a popup, not inline icons); it was appended at the *end* of a full top
  bar where it overflowed off-screen; and the live toolbar was never rebuilt after the settings
  write. It now injects the full image toolbar as a horizontal icon submenu (`menuType: "submenu"`)
  near the left edge and forces a rebuild, so it appears immediately; on load it self-heals/migrates
  an existing entry.

## [0.5.3] - 2026-06-06

CSS-class management: restore now handles commented-out classes, and the bundled example file gets a
full install / reset / uninstall lifecycle.

- **Change 28 — Settings reuse Obsidian's own terminology.** Feature names (*CSS snippets*,
  *Appearance*) are pulled from Obsidian's own translations (`i18next`), plus a native info callout
  explaining the toggles only gate the toolbar picker; the bundled snippet is presented as a built-in
  CSS snippet, not an "example".
- **Feature 30 — Bundled-snippet file lifecycle in settings.** The example-snippet entry adapts to
  the file's state: missing → Install; modified → Reset to shipped (plus Uninstall); unchanged →
  Uninstall (confirmed first — sterner when the file carries your edits).
- **Bug 74 — Per-class restore did nothing for a class "deleted" by commenting it out.** The presence
  check matched the class text *inside* the `/* … */` comment, so it edited the rule in place (still
  commented) instead of re-adding it; it now judges presence on the comment-stripped CSS.

## [0.5.2] - 2026-06-05

Image commands now act on a whole selection of images at once.

- **Feature 29 — Standalone panels for multi-image filters / custom size / CSS classes.** These open
  as a centered "N images" panel and apply to every selected image (preview fans out live);
  crop and export stay single-image.
- **Feature 28 — Multi-image commands.** When the selection covers two or more images, a command runs
  on all of them in one undo step (rotate/flip relative per image; align/size set the same value).
  With no selection it behaves as before on the hover/cursor image; toolbar buttons stay single-image.

## [0.5.1] - 2026-06-05

Commands now actually appear in the command palette, and gain a first page-scope command.

- **Feature 27 — "Reset all images on this page" command.** A page-scope command (always available)
  that strips every `{…}` transform block in the active note in one undo step. First of the page-scope
  command category.
- **Bug 73 — Commands were invisible in the command palette.** Every command self-gated on a *hovered*
  image via `checkCallback`, which Obsidian hides when false — and opening the palette clears the
  hover. Image commands now resolve their target from the hovered image **or** the cursor line.

## [0.5.0] - 2026-06-05

Settings-panel rework: the panel is more compact up top and the CSS-classes feature gets a proper
management surface.

- **Decision 12 — Settings-panel rework forks.** "Obsidian off" = no enabled snippet (greys the master
  toggle + links to Appearance → CSS snippets); the master toggle gates the decoration-class feature
  only (alignment/inline stay); restore is per-class plus a whole-file "Reset to shipped".
- **Change 27 — CSS section reflects Obsidian state.** With no CSS snippet enabled at all, the master
  toggle greys out and an inline notice + link points to Appearance → CSS snippets.
- **Change 26 — Native grouped-card settings layout.** Related settings sit in Obsidian's own
  `setting-group` / `setting-items` cards (uniform with the core snippets & community-plugins pages).
- **Feature 26 — Editing-toolbar integration.** Adds the whole image toolbar as one submenu
  (validated against editing-toolbar 4.0.8); the settings entry adapts to not-installed /
  installed-but-disabled / enabled.
- **Feature 25 — CSS-classes management surface.** A master toggle plus a plugin-list-style overview
  (search, per-file rows, bundled classes pinned), changed/deleted detection vs the shipped snippet,
  per-class restore, and name-collision warnings.

## [0.4.2] - 2026-06-05

Community-directory release-compliance pass — closes the remaining review-checklist rules (R20–R30)
so the plugin is ready for submission. No change to image-editing behaviour.

- **Change 25 — [Release-Requirement] Community-directory compliance pass.** UI-guideline settings tab (no plugin-name
  heading, `setHeading()`, CSS class for the warning colour), sentence-case localized command names,
  `normalizePath()` on user/constructed paths, the Vault API over the adapter, manifest description,
  and README disclosures (R20–R30).
- **Bug 72 — [Release-Requirement] User/constructed paths not run through `normalizePath()`.** The export fallback's vault
  path and the constructed snippet paths now go through `normalizePath()` (R26).
- **Bug 71 — [Release-Requirement] Remaining UI headings were Title Case.** "CSS snippets" / "Editing toolbar integration"
  are sentence case (R25).
- **Bug 70 — [Release-Requirement] Command names were Title Case and bypassed i18n.** Size/align commands read
  `Size: small` / `Align: left` and route through en/de (R24).
- **Bug 69 — [Release-Requirement] Raw HTML section headings instead of `setHeading()`** (R23).
- **Bug 68 — [Release-Requirement] Plugin-name top-level heading in settings removed** (R22).

## [0.4.1] - 2026-06-05

- **Decision 11 — Docs-site stack: ProperDocs + MaterialX.** Single-version site, native version
  badge; `mike` and stock MkDocs/mkdocs-material rejected (abandoned / EOL).
- **Decision 10 — Snippets install/reset.** Install copies shipped CSS without force-overwrite; Reset
  is per-file to the shipped original; only Obsidian-enabled snippets are scanned/offered.
- **Change 24 — The standalone runtime now ships the default decoration classes** (`rounded` /
  `shadow` / `bordered` / `circle`), extracted to the Obsidian-free `src/bundled-snippet.ts` shared by
  plugin and runtime.
- **Bug 62 — Click-away now closes an open filter/size panel.** The boundary was the whole
  image+toolbar region (the image fills the canvas, so it stayed open); it now shrinks to the
  sub-panel, and clicking anywhere else closes + persists. Crop stays exempt.

## [0.4.0] - 2026-06-05

A ground-up rework of how images render and how cropping works, a cleaner toolbar / panel
interaction, a real test suite and refreshed documentation.

- **Decision 9 — Keep the `*-logic.ts` split.** Pure logic stays split from framework-coupled code so
  it's unit-testable without an obsidian/CM mock.
- **Decision 8 — Temperature retired.** The virtual-temperature control had no panel row; removed.
- **Decision 7 — Routing rule.** Image = box; everything routes to the box except `transform`/`filter`
  (→ the image); alignment/inline → the embed.
- **Decision 6 — Inline ≠ size; uniform chrome.** Inline and size are orthogonal; no "chrome skipped
  for inline" special case (R0).
- **Change 23 — Reveal default = auto** (docs aligned: `alwaysShowLink` off = reveal on hover / active
  line).
- **Change 22 — Pure DRY/KISS refactors** — shared `locateActiveImage`, single `nonDefaultFilter`,
  `BOX_CLASS`, one labelled `textButton`.
- **Change 21 — Dead-code sweep** — removed `getPreset` / `setPresetWidth` / `parseLocationTransform`
  and their tests.
- **Change 20 — Portable bare-key format fulfilled** — one format, three consumers (no-JS fallback,
  runtime, writer); runtime-only keys degrade to the original image.
- **Change 19 — Obsidian-free render core extracted** (`render-core.ts`: `buildLayers` + `RENDER_CSS`,
  injected by both plugin and runtime — one source, identical render).
- **Change 18 — Temperature filter removed** — the seven sliders + five presets remain.
- **Change 17 — Toolbar + panel are one active region.** The bar stays (greyed) as you move onto the
  panel; the accept (✓) / cancel (✗) icons are back, routed through an explicit exit reason.
- **Change 16 — Auto-persist editing.** Leaving a panel persists once as a single undo step; the
  per-panel Reset is the only in-session revert.
- **Change 15 — Crop teardown restores all transient overrides on every exit** (a single
  `exitCropMode`, no second path).
- **Change 14 — Crop serialization.** Placement = `transform=`, cut shape = `aspect-ratio=` (stored
  only when it differs); never a fixed px height.
- **Change 13 — Box rename.** The uniform image box is `.lie-image-area`, the chrome container
  `.lie-box`; `lie-rotate-box` retired.
- **Change 12 — Cleaner stored format.** Short bare keys (`{rotate=90 flip=horizontal width=300}`);
  align / width / filter are real HTML attributes so they survive in other renderers (old blocks still
  parse).
- **Change 11 — Uniform rendering model (AD3) + 3-layer DOM.** Every image renders through one
  outer / frame / image structure, identical in both views.
- **Change 10 — Ground-up rework landed.** Native CSS storage (`transform`/`filter` verbatim),
  declarative box→image sizing (no JS measure-retry loop), pure-CSS caption, LP overlay + native edit.
- **Feature 24 — Portable runtime.** A standalone script reproduces the rendering on a published page
  (MkDocs/Material); align/width/filter already render natively without it.
- **Feature 23 — Trackpad rotate gesture (macOS)** — rotate in the crop editor with a two-finger
  twist.
- **Feature 22 — In-place crop with edge handles.** Edits the image where it sits — 4 corner
  (aspect-locked) + 4 edge handles + a rotate knob; what you see is what gets committed.
- **Bug 64 — Group popups / class dropdown now couple to the active region** (kept visible, not greyed).
- **Bug 63 — Panel visibility firmly coupled to toolbar visibility** — no un-greyed flash while a
  panel is open.
- **Bug 61 — Toolbar ↔ sub-modal are one active region** — the bar no longer drops the instant the
  pointer leaves the image rect.
- **Bug 60 — Auto-persist on anchor-disconnect wrote the right occurrence of a duplicated image**
  (uses the location captured at panel-open, not a basename scan).
- **Bug 59 — The "icon" size preset now renders the image inline as an icon, not merely at icon
  height.**
- **Bug 58 — A filter-only image is now hydrated by the portable runtime** (`[filter]` added to the
  claim selector).
- **Bug 57 — Reading-view render of a duplicated image** now resolves the n-th occurrence, not the
  first.
- **Bug 56 — Toolbar/menu edits wrote to the WRONG image.** The resolver matched a basename's first
  occurrence; it now resolves the exact line by DOM position (`posAtDOM`).
- **Bug 55 — The `{…}` block regained its syntax highlighting** (marked as a `cm-url` string).
- **Bug 54 — `<>` dismiss hides the whole raw embed** (the fake link and the `{…}`).
- **Bug 53 — The reveal toggle shows the `<>` glyph again, not an eye icon.**
- **Bug 52 — Crop pan grabs the whole image** (inside and outside the cut frame).
- **Bug 51 — Crop editor migrated to the live 3-layer model** — true in-place editing, centre origin,
  edge handles, width-resize preserves the crop; preview == committed.
- **Bug 50 — rotate/flip no longer drifts an already-cropped image** (orientation rides the frame about
  its centre; the crop placement is untouched).
- **Bug 48 — Reading-view sizing of transformed images** — a transformed box caps to the column and a
  floated image's wrap text starts at the image top (matches live preview).
- **Bug 45 — Latent box-selector bug** — `previewSize` queried a non-existent class on rotated images.
- **Bug 44 — The demo notes migrated to native syntax.**
- **Bug 43 — Resize handle CSS.**
- **Bug 42 — Size "Original" / a cleared field no longer collapses the box.**
- **Bug 41 — The filter panel gained the shared per-panel reset.**
- **Bug 40 — The crop overlay is exempt from the dismiss handler.**
- **Bug 39 — The crop committed result equals the framed region.**
- **Bug 38 — Crop rebuilt: handles scale the inner image toward the frame centre.**
- **Bug 36 — Toolbar anchored to the image top via the box.**
- **Bug 35 — Captions below the image — centred, width-limited, Markdown-rendered, pure CSS.**
- **Bug 34 — Snippet "png" came from a CSS comment** — strip comments + filter file extensions.
- **Bug 33 — Rotate centred** via a `translate(-50%,-50%)` prepend.
- **Bug 32 — Reset no longer whites-out the window** — an empty class token in the CM update cycle is
  guarded.

## [0.3.0] - 2026-06-04

A live-preview rework: images can float and wrap text, mid-paragraph images become editable, and the
raw-link reveal is simpler and calmer.

- **Decision 5 — `RevealMode = auto|always` is not a retired mode cycle.** The two values derive from
  the global default-state setting; the `<>` dismiss is a separate per-line override.
- **Decision 4 — The floating toolbar and the in-image toolbar are not a duplicate.** Both build via
  `buildToolbarElement`; only host + positioning differ.
- **Decision 3 — Reveal/edit model: overlay + CSS reveal + native edit.** The LP adapter never replaces
  the line; Obsidian renders its CSS-suppressed native embed and gives the cursor-reveal, the plugin
  overlays its own image.
- **Change 9 — Standalone vs. inline placement.** An image on its own line is a block; one carrying a
  `{…}` block stays inline so it can float.
- **Change 8 — Column-capped images.** A transformed image never overflows its column; it caps to the
  text width and stays responsive.
- **Change 7 — Reveal is now pure-CSS.** The raw `{…}` link shows/hides via CSS keyed on hover and the
  cursor line, so it no longer fights the editor or churns the undo history.
- **Change 6 — Link reveal collapsed to two natural modes** (auto / always) from one setting, plus a
  transient `<>` dismiss that auto-clears — no tri-state cycle to remember.
- **Change 5 — 2026-06-02 DRY/KISS audit points dissolved** by the rework (no `canvasFilter` table,
  shared `rotatedAabb`, a single `buildSlider`, pure-CSS caption).
- **Change 4 — CLAUDE.md slimmed to a lean build/debug guide;** the duplicated
  requirements/architecture/known-bugs were removed.
- **Feature 21 — Native-look resize handle** — the resize corner matches Obsidian's native image
  handle.
- **Feature 20 — Float & text-wrap in live preview** — left/right-aligned images float and wrap text
  in LP; a tall float (>~250 px) stacks as a block.
- **Feature 19 — Inline image embeds** — a mid-paragraph image gets the same toolbar/transforms and
  flows inline.
- **Bug 49 — Inline-icon / tiny-image toolbar mis-positioned** — the floating bar now sits above the
  image and floats out by coverage.
- **Bug 47 — Tall float (>~250 px) derenders on scroll in LP — capped** (stacks as a block in safe
  mode, both views).
- **Bug 46 — Live-preview float breaks CM6 layout — resolved** via an inline non-BFC float-escape
  widget (multi-line wrap, zero height desync, image stays clickable).
- **Bug 37 — Toolbar fold-then-wrap** — a measured reflow folds groups to a submenu, then wraps at the
  dividers.
- **Bug 31 — No native `<>` edit-block icon leak** — the native edit-block button is suppressed.
- **Bug 30 — Reveal/edit sit above the image** (the AD5 overlay).
- **Bug 29 — Reveal toggles work** (the true AD5 overlay model, after a brief mis-build was reverted).
- **Bug 28 — Scroll jank; image sections rendered very late** — the block widget gained an
  `estimatedHeight` derived from a pure estimate.
- **Bug 27 — `lie-center` only centred on hover** — centre via `text-align:center` on a full-width
  block embed (no `!important` arms race).
- **Bug 26 — Inline (mid-text) image rendered native & full-size** — now the same widget in an inline
  mode.
- **Bug 25 — A resized crop left an empty band** (the caption was pushed below) — the box is
  aspect-correct when one dimension is given.
- **Bug 24 — Standalone classes lost in live preview** — the `{…}` braces were passed to the parser,
  dropping the leading `.class`; strip the braces.

## [0.2.0] - 2026-06-01

The second release: new captions and a proper export save dialog, a reworked toolbar layout, and a
round of fixes from in-Obsidian verification of the initial version.

- **Change 3 — Image spacing.** Stacked images use Obsidian's native 6px vertical spacing.
- **Change 2 — AUTO link reveal also appears when the editor cursor is on the image's line,** in
  addition to on hover.
- **Change 1 — Export fidelity.** Export renders every transform exactly as displayed — size,
  rotation, flip, crop and filters.
- **Feature 18 — Per-panel reset** — the size and crop sub-menus each get their own Reset, separate
  from the toolbar's reset-all.
- **Feature 17 — Export save dialog** — saving an export opens the OS-native save dialog at the
  original's folder, name pre-filled `{original}-{n}`; nothing is ever overwritten silently.
- **Feature 16 — Image captions** — an optional setting renders the image's alt text as a caption
  below the image (Markdown supported), off by default.
- **Bug 23 — A wikilink caption ending in a size token** (`![[img|caption|300]]`) now reads the same in
  both views.
- **Bug 22 — Exporting a filename with a literal `%` no longer fails;** the name-probe loop is bounded.
- **Bug 21 — The filter panel closes itself when its anchor leaves the DOM** (no orphaned panel /
  leaked listeners).
- **Bug 20 — Reading-view captions no longer re-render on every editor update** when the text is
  unchanged.
- **Bug 19 — The crop sub-menu's Reset restores the full image when re-cropping** an already-cropped
  image.
- **Bug 18 — Removing an alignment/decoration class takes effect immediately in reading view** (tracked
  via `data-lie-classes`, cleared on reset).
- **Bug 17 — A height-only resize now keeps its aspect ratio when exported** (no stretch).
- **Bug 16 — The custom-size live preview works on plain (un-rotated/cropped) images again** (the
  `display:contents` box had swallowed the size).
- **Bug 15 — The resize / selection frame now hugs the image** instead of sitting offset.
- **Bug 14 — An image with no explicit size no longer overflows its column.**
- **Bug 13 — The revealed link editor is borderless again.**
- **Bug 12 — Export no longer fails with "file already exists"** (superseded by the new save dialog).
- **Bug 11 — Resize affordance restored** — uses Obsidian's native handle, shown on toolbar hover,
  hidden in crop.
- **Bug 10 — Alignment classes (left / center / right) now actually float / align the image.**
- **Bug 9 — The custom-size sub-menu gained a height field** (width + height side by side).
- **Bug 8 — The temperature slider's own thumb stays put** (sliders matched by `data-key`).
- **Bug 7 — Filter-panel slider rows no longer overlap.**
- **Bug 6 — Toolbar icons grouped with dividers** (and divider-wrapping).
- **Bug 5 — The `+` / `−` size buttons were dropped** (resize via the handle + custom-size).
- **Bug 4 — The crop editor no longer breaks when the image is dragged inside it.**
- **Bug 3 — The filter panel docks beside the image, follows on scroll, hides offscreen.**
- **Bug 2 — Quarter-turn-rotated images size their reflow box correctly** (a single render path).
- **Bug 1 — AUTO link reveal now shows from the first render.**

## [0.1.0] - 2026-06-01

First public release. Non-destructive image editing for Obsidian: a hover toolbar lets you crop,
rotate, flip, resize and filter images, all live — the original file is never modified. Edits are
stored in a portable trailing `{…}` attribute block, so the same notes still render correctly when
published via MkDocs/Material.

- **Decision 2 — Crop pixel-quantization.** The cut quantizes to whole pixels + fixed angle steps live
  during the interaction.
- **Decision 1 — Export resolution.** Export renders from the original image's native resolution;
  display size never reduces it.
- **Feature 15 — Settings tab** — toggle the hover toolbar, manage detected snippet classes, optional
  (off-by-default, version-gated) editing-toolbar integration.
- **Feature 14 — Commands** — context-aware commands (active only with an image in context) for
  rotate, flip, crop, filters, sizing, alignment, add-class, reset, custom-size, toggle-inline,
  export.
- **Feature 13 — Follows Obsidian** — markdown vs. wikilink form follows the central "Use
  [[Wikilinks]]" setting; the UI follows Obsidian's locale (English fallback, German included).
- **Feature 12 — `<>` link reveal** — shows the raw link as editable text above the image and writes
  edits back live.
- **Feature 11 — Anchored sub-menus** — size, crop and filter controls share one component: the
  toolbar greys out, confirm / cancel are icons, Esc cancels.
- **Feature 10 — Hover toolbar** — native Lucide icons, grouped Edit/Layout buttons that collapse into
  an overflow sub-menu when space is tight, plus mobile long-press.
- **Feature 9 — Both views** — rotation, flip, filters, crop and sizing render identically in reading
  view and live preview.
- **Feature 8 — Vault-snippet classes** — image CSS classes discovered from `.obsidian/snippets/` and
  offered in a dropdown; each individually de-selectable, refreshed on file changes.
- **Feature 7 — Preset classes** — built-in toggleable classes for size, alignment and decoration,
  with a one-click reset.
- **Feature 6 — Export** — render all transforms and filters to a new `{original}-edited.{ext}` file
  via canvas; the original stays untouched.
- **Feature 5 — Filters** — brightness, contrast, saturation, hue-rotate, blur, grayscale and sepia
  sliders, a live RGB histogram, and the presets Sepia / B&W / Vintage / Cool / Warm.
- **Feature 4 — Resize** — drag the native corner handle (aspect kept) or open the custom-size
  sub-menu for an exact width / height and the quick sizes small / medium / large / original.
- **Feature 3 — Crop** — an in-place crop editor with a fixed, resizable frame over a movable,
  rotatable and scalable original; free rotation snaps to whole pixels + 0.1° steps, plus aspect
  presets 16:9, 4:3, 1:1.
- **Feature 2 — Rotate & flip** — quarter-turn rotation (CW / CCW) and horizontal / vertical flip;
  rotated images keep the same content width and reflow correctly.
- **Feature 1 — Non-destructive editing** — all transforms are written to a trailing `{…}` block; the
  image file, alt text, path and native `|size` are never touched.
