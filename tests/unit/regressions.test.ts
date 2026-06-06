import { describe, it, expect } from "vitest";
import { rewriteWidth, reduceReveal, URL_CLASS, URL_BRACE_CLASS } from "../../src/live-preview-logic";
import type { RevealState, RevealEvents } from "../../src/live-preview-logic";
import { parseAltText, serializeTransform, setWidthPx, isCrop, getRotation } from "../../src/transforms";
import { nativeBoxWidth } from "../../src/renderer-logic";

// Regression registry (test-plan §5.1). Each fixed bug is pinned at the level that catches it.
//
// Bug 56 (the bare-key WRITE PATH) is FIXED and guarded HERE in the suite by the §2.8 per-op
// persistence units (tests/transforms.test.ts → "per-operation persistence") AND, at the
// integration level, by the runnable write-path matrix `scripts/verify-write-path.mjs` (the
// read-source-back CDP check, including the duplicate-image case that exposed the root cause:
// findImageInSource resolved by basename → first occurrence; the fix resolves the line from the
// rendered image's DOM position). That CDP check is not a vitest unit (it needs Obsidian, Lesson 6).
//
// Submodal ACCEPT/CANCEL + ONE-ACTIVE-REGION rework (F14/AD8/D6 — restored ✓/✗ icons without
// changing auto-persist-on-leave; image+toolbar+panel = one hover/active region). The PURE crux —
// the host routing the EXIT reason (commit / cancel / silent) to the right owner callback — is
// `submenuExitEffect`, pinned in tests/anchored-submenu-logic.test.ts. The DOM/interactive halves
// are read-DOM-back CDP scripts (Lesson 6): `scripts/verify-submodal-icons.mjs` (✓ persists the `{…}`,
// ✗ writes nothing AND restores the live DOM, one undo step, leaving still persists) and
// `scripts/verify-submodal-region.mjs` (the toolbar+panel share one region: the image→panel travel
// grace keeps it, leaving anywhere hides both together, re-entering via image/toolbar/panel restores).
//
// The bugs below are FIXED; each is pinned at the level that catches it — the PURE, autonomously-
// verifiable half as a vitest unit here, the obsidian/CM-coupled (DOM/interactive) half as a
// read-the-real-DOM CDP script (Lesson 6), never assumed.
// Bug 51 — crop editor migrated to the live 3-layer model. The PURE, autonomously-verifiable half:
//   • A (no centre/top-left drift): the parse∘serialize round-trip in tests/crop-editor-logic.test.ts.
//   • Edge handles (D8 single-axis): the scale(sx, sy) serialization, same file.
//   • G (a width resize PRESERVES the crop): the two width-write paths below.
// The DOM/interactive half (handles bound to the inner <img>, the frame/box fixed during a drag, no
// document.body clone, native handle hidden in BOTH views, no reflow on enter/exit, the dim ghost,
// one undo step per session) is the STRUCTURAL CDP check `scripts/verify-crop.mjs` (read-DOM-back,
// per test-plan §3); `scripts/verify-crop-teardown.mjs` additionally proves the editor restores
// EVERY transient override (esp. the lifted host `contain:paint`) on EVERY exit path (a leak would
// permanently break LP paint-containment); `scripts/verify-crop-pan.mjs` proves the pan GRIP is the
// WHOLE visible image — the dim ghost img is the pan hit-surface (`pointer-events:auto`), so a drag
// started OUTSIDE the cut frame pans too (real `elementFromPoint` hit-test), while the handles still
// win their own hits. Plus the manual drag-haptics checklist — the editor is obsidian/layout-coupled,
// so these are CDP scripts, not vitest units (Lesson 6, like verify-write-path.mjs).
describe("Bug 51 G — a width edit preserves the crop (both write paths keep transform=/aspect-ratio=)", () => {
  // A cropped embed: placement on the <img>, the cut shape as aspect-ratio, the cut-frame width.
  const cropped = `![a](b.png){transform="translate(10%, 5%) rotate(0deg) scale(1.2)" aspect-ratio=4/3 width=200}`;

  it("the LP resize handle (rewriteWidth) keeps the crop placement + cut shape", () => {
    const out = rewriteWidth(cropped, 320);
    expect(out).not.toBeNull();
    const t = parseAltText((out!.match(/\{([^}]*)\}/)?.[1]) ?? "");
    expect(t.transform).toBe("translate(10%, 5%) rotate(0deg) scale(1.2)"); // crop placement intact
    expect(t.aspectRatio).toBe("4/3");                                       // cut shape intact
    expect(t.width).toBe("320px");                                          // only the width changed
    expect(isCrop(t)).toBe(true);                                          // still a crop
  });

  it("the toolbar custom-size / preset path (field-additive set width) keeps the crop", () => {
    // The customSize commit / applyPreset re-parse the source and set only width/height, leaving
    // transform=/aspect-ratio= untouched (main.ts modifyTransform is field-additive).
    const t = parseAltText(cropped.match(/\{([^}]*)\}/)![1]!);
    setWidthPx(t, 320);
    t.height = undefined;
    const round = parseAltText(serializeTransform(t));
    expect(round.transform).toBe("translate(10%, 5%) rotate(0deg) scale(1.2)");
    expect(round.aspectRatio).toBe("4/3");
    expect(round.width).toBe("320px");
    expect(isCrop(round)).toBe(true);
  });
});

// Bug 78/79 — the R0/AD3 box-sizing invariant (the box is NEVER emptied to a naked img; the
// no-explicit-width case is ALWAYS routed through the native box-sizing cap, cropped or not).
//   • Bug 79 (clearStaleTransform): a reused embed whose source dropped its {…} re-renders the
//     3-layer box with the EMPTY transform (== reset()) instead of unwrapping to a naked img.
//     The DOM half (box survives, no naked img) is obsidian/cache-coupled → not a vitest unit
//     (Lesson 6); the PURE crux is that the cleared image then sizes through the SAME native cap
//     as a fresh native image — `nativeBoxWidth` (the non-crop branch's default width).
//   • Bug 78 (cropped, width removed): the no-width cropped box must NOT collapse to 0 — it falls
//     back to the SAME native cap, so the no-width decision is identical for cropped and non-cropped.
describe("Bug 78/79 — no-explicit-width box sizing is the native cap (cropped OR not, one decision)", () => {
  // A cropped embed whose width has been REMOVED: placement on the <img> + cut shape, NO width.
  const croppedNoWidth = `![a](b.png){transform="translate(10%, 5%) scale(1.2)" aspect-ratio=4/3}`;
  // A plain native-default image (what clearStaleTransform re-renders to: the empty transform).
  const nativeDefault = `![a](b.png)`;

  it("a cropped image with NO width is still a crop but carries no width source → must use the cap", () => {
    const t = parseAltText(croppedNoWidth.match(/\{([^}]*)\}/)![1]!);
    expect(isCrop(t)).toBe(true);
    expect(t.width).toBeUndefined();              // nothing to size the box from → would collapse (Bug 78)
    // The fallback the renderer applies is the native cap on the rotation-correct axis.
    expect(nativeBoxWidth(800, 600, getRotation(t))).toBe(800);   // 0° → original width
  });

  it("the native-default image (Bug 79 cleared state) routes through the SAME cap", () => {
    const t = parseAltText(nativeDefault.replace(/^!\[a\]\(b\.png\)/, "") || "");
    expect(t.width).toBeUndefined();
    expect(isCrop(t)).toBe(false);
    expect(nativeBoxWidth(800, 600, getRotation(t))).toBe(800);   // identical decision, no special case
  });

  it("a no-width box quarter-turned caps on the ORIGINAL HEIGHT (axis swap survives the crop path)", () => {
    expect(nativeBoxWidth(800, 600, 90)).toBe(600);
    expect(nativeBoxWidth(800, 600, 270)).toBe(600);
  });
});

// Bug 53–55 — the LP reveal / source-rendering cluster — SOLVED (see issues.md → "Resolved by the
// LP reveal cluster fix"). The LIVE-DOM facts are obsidian/CM-coupled and pinned by the read-the-
// real-DOM CDP guard `scripts/verify-reveal.mjs` (Bug 53: the toolbar reveal SVG is `lucide-code`,
// not an eye; Bug 54: a `<>` dismiss computes `display:none` on BOTH `.lie-fake-link` AND
// `.lie-attr`; Bug 55: the revealed `{…}` carries `cm-url` tokens) — structural checks, not vitest
// units (Lesson 6, like verify-write-path/verify-crop). What IS purely verifiable is pinned below: the
// Bug-46 dismiss/auto-clear STATE MACHINE (`reduceReveal`) and the Bug-47 highlight CLASS invariant.

describe("Bug 54 — the `<>` dismiss / auto-clear state machine (reduceReveal — auto mode is default)", () => {
  const base = (over: Partial<RevealEvents> = {}): RevealEvents =>
    ({ remap: null, toggles: [], hovers: [], activeLineFrom: -1, alwaysShow: false, ...over });
  const st = (dismissed: number[] = [], hoveredLine: number | null = null): RevealState =>
    ({ dismissed: new Set(dismissed), hoveredLine });

  it("a `<>` toggle on a hovered image dismisses its source", () => {
    const next = reduceReveal(st([], 10), base({ toggles: [10], hovers: [], activeLineFrom: 0 }));
    expect([...next.dismissed]).toEqual([10]);
  });

  it("toggling the same line again reveals it (un-dismiss)", () => {
    const next = reduceReveal(st([10], 10), base({ toggles: [10], activeLineFrom: 0 }));
    expect(next.dismissed.size).toBe(0);
  });

  it("a fresh dismiss survives its OWN transaction even when the line is NEITHER hovered NOR active "
    + "(the keyboard/`:focus-within` path where no mouseenter set hoveredLine — closes the latent edge)", () => {
    const next = reduceReveal(st([], null), base({ toggles: [10], activeLineFrom: 0 }));
    expect([...next.dismissed]).toEqual([10]);
  });

  it("the dismiss auto-clears once you LEAVE the image (no toggle this tx, neither active nor hovered)", () => {
    // Was hovered+dismissed; now a mouseleave with the cursor on another line → clears.
    const next = reduceReveal(st([10], 10), base({ hovers: [{ line: 10, on: false }], activeLineFrom: 0 }));
    expect(next.dismissed.size).toBe(0);
    expect(next.hoveredLine).toBeNull();
  });

  it("a dismiss on the ACTIVE (cursor) line persists while the cursor stays there", () => {
    const next = reduceReveal(st([10], null), base({ activeLineFrom: 10 }));
    expect([...next.dismissed]).toEqual([10]);
  });

  it("ALWAYS mode never auto-clears: a dismiss persists with neither hover nor active", () => {
    const next = reduceReveal(st([10], null), base({ activeLineFrom: 0, alwaysShow: true }));
    expect([...next.dismissed]).toEqual([10]);
  });

  it("an unrelated transaction returns the SAME dismissed reference (the StateField skips a rebuild)", () => {
    const prev = st([10], 10);
    const next = reduceReveal(prev, base({ activeLineFrom: 10 })); // 10 is active → not cleared, no mutation
    expect(next.dismissed).toBe(prev.dismissed);
  });

  it("a doc change remaps the dismissed line positions (and the hovered line)", () => {
    const next = reduceReveal(st([10], 10), base({ remap: (p) => p + 5, activeLineFrom: 15 }));
    expect([...next.dismissed]).toEqual([15]); // 10 → 15
    expect(next.hoveredLine).toBe(15);
  });
});

describe("Bug 55 — the revealed {…} highlight CLASS invariant (live DOM = verify-reveal.mjs)", () => {
  // The LP build() marks the whole {…} with `lie-attr lie-rev-<mode> ${URL_CLASS}`. The highlight
  // rides URL_CLASS; the at-origin constraint is that it must NOT carry cm-formatting.
  it("URL_CLASS highlights like a url string (carries cm-url) so the {…} is not plain text", () => {
    expect(URL_CLASS).toContain("cm-url");
  });

  it("URL_CLASS carries NO cm-formatting — a direct cm-line child with cm-formatting would match "
    + "`.cm-line:has(> .cm-formatting)` (Obsidian's native-reveal heuristic) and wrongly hide the fake link", () => {
    expect(URL_CLASS).not.toContain("cm-formatting");
    expect(URL_BRACE_CLASS).toContain("cm-formatting"); // the SOURCE-mode brace class still does (different path)
  });
});
