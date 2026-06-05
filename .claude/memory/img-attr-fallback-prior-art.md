---
name: img-attr-fallback-prior-art
description: "How python-markdown/Pandoc/kramdown handle the `{…}` image attr-list — validates the plugin's style/class/custom-attr fallback split, with the kramdown-colon and Pandoc-px caveats"
metadata: 
  node_type: memory
  type: reference
  originSessionId: 025352f9-da70-4fb2-b9c2-74c5ad3df12a
---

Deep-research + adversarial verification (2026-06-04) on cross-renderer fallback of the plugin's `![](url){.class style="…" attr="…"}` representation. Sources: python-markdown attr_list docs, Pandoc MANUAL (Images/link_attributes), kramdown syntax.html, Material-for-MkDocs images ref, W3C CSS Transforms L1.

**Brace syntax — the ONE hard incompatibility:** python-markdown (attr_list) and Pandoc (link_attributes) both use the BARE brace `{…}` directly after the image (no space). kramdown REQUIRES the colon form `{:…}` — verified 3-0 (kramdown syntax.html: span IAL "same structure as block IAL" → all examples `{:…}`; maintainer declined bare-brace in gettalong/kramdown#176). So the plugin's bare brace attaches in python-markdown + Pandoc but NOT kramdown → in Jekyll/GitHub-Pages the `{.lie-left …}` renders as LITERAL TEXT after the image (worst fallback). No single brace string is valid in both families.

**No allow-list anywhere** (verified): all three route classes/#id/key=value onto the `<img>` itself (no wrapper). python-markdown emits arbitrary keys verbatim (hyphens OK; XML-invalid chars → `_`). Brace must abut the element with no space.

**Per-attr-type fallback:**
- `style="…"` (size/filter): passed through verbatim onto `<img>` in all three (style is a known HTML5 attr). filter + size are layout-neutral → applied, safe.
- unknown class `.lie-rot-90`: appended to class list, inert without CSS. Clean.
- custom attr (crop): python-markdown emits VERBATIM (`lie-crop="…"`); Pandoc HTML5 prepends `data-` → `data-lie-crop` (verified 3-0, MANUAL "Unknown attributes are passed through as custom attributes, with data- prepended"). Both inert (browsers ignore). → RECOMMEND naming it `data-lie-crop` so it's valid HTML5 + consistent.
- `transform: rotate()`: W3C CSS Transforms L1 — "the transform property does not affect the flow of the content surrounding the transformed element" (verified 3-0). So rotate-in-`style=` does NOT reflow but DOES overflow/overlap visually. → rotate-as-CLASS (inert) is the CLEANER fallback than rotate-in-style. Validates moving rotate out of style into a class.

**CORRECTIONS to the first research pass (re-verified):**
- Pandoc px width/height → emits HTML `width=`/`height=` ATTRIBUTES, only NON-pixel units (%, em) → `style` (verified 3-0 refute of "px→style", gettalong/pandoc#8047). Irrelevant to us since we use `style="width:…"` not `width=` keys — and using `style=` AVOIDS Pandoc's width/height special path.
- Material-for-MkDocs aligns via key=value `{ align=left }` / `{ align=right }`, NOT a `.align-left` class (verified). And legacy HTML `align="left"`/`"right"` is still browser-honored (faithful float fallback). → our align-as-class diverges from prior art; `align=left/right` would float faithfully in ALL renderers (no center value though).

**Verdict on the plugin's split:** size/filter→style ✓ validated; rotate→class ✓ validated (cleaner than style); crop→custom-attr ✓ safe (use `data-` prefix). align→class is clean-but-inert; `align=left/right` key=value is the established convention + faithful fallback for L/R. kramdown-colon is the unavoidable caveat.
