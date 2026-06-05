<!--
  This is the Examples section landing page (URL /examples/). It is the ONE committed file in
  docs/examples/ — the feature pages (01–07) and images are copied in from example-vault/ at
  build time by scripts/mkdocs_hooks.py and removed again afterwards, so they are git-ignored.
-->
# Examples — the standalone runtime, live

This section is the plugin's demo vault, published straight to the web — and it has one job: to
**show that the [standalone runtime](../development/architecture.md) does what it should.**

Every image on these pages carries the plugin's portable `{…}` block — `{rotate=90 width=300}`,
`{filter="sepia(0.8)"}`, `{transform="…" aspect-ratio=4/3}` and so on — exactly the Markdown
Obsidian writes when you edit an image. There is **no Obsidian here**: the rotation, flip, crop,
resize and filters you see are rendered **live, in your browser**, by `lie-runtime.js` — the same
rendering core (`buildLayers` + `RENDER_CSS`) the plugin runs inside Obsidian. The site's `attr_list`
extension hands the `{…}` keys to the image; the runtime claims the image and builds the transform.

That is the whole point: an edited image stays **portable**. The bare-key block Obsidian writes
renders identically on any static site that loads the runtime — so what you see below is proof,
not a screenshot.

> The hover toolbar and in-place editing are Obsidian-only. On these pages you see the **result**
> of an edit, not the editor. To try the editing itself, open the `example-vault/` folder as a
> vault in Obsidian with the plugin enabled.

## The pages

- [[01 — Rotate & flip|Rotate & flip]] — quarter-turn rotation, horizontal / vertical flip.
- [[02 — Crop|Crop]] — pan / zoom / rotate crops via `transform` + `aspect-ratio`.
- [[03 — Size & presets|Size & presets]] — width resize and the size presets.
- [[04 — Filters|Filters]] — brightness, contrast, saturation, hue, blur, grayscale, sepia.
- [[05 — Layout, float & wrap|Layout, float & wrap]] — align left / right / center with text wrap.
- [[06 — Captions|Captions]] — alt text rendered as a caption below the image.
- [[07 — Classes & snippets|Classes & snippets]] — decoration classes (rounded, shadow, border, circle).

Without the runtime (or with the plugin disabled in Obsidian) these images still appear — the
native-faithful keys `width` / `align` survive and the original image shows for the rest. That
graceful fallback is [F25](../development/requirements.md) in the requirements.
