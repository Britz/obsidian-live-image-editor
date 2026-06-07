// The DEFAULT image-decoration class stack — the SINGLE source for two consumers (DRY, like
// render-core's RENDER_CSS): the plugin ships it as an installable Obsidian snippet (F16.1), and
// the standalone runtime injects it so a foreign (no-Obsidian) page renders class-styled images
// the SAME way Obsidian does. This module is Obsidian-FREE (no imports) so the portable runtime
// bundles it without pulling the plugin framework — the same constraint render-core.ts satisfies.
//
// In Obsidian the user can EDIT their installed copy (and "Reset" restores this shipped version);
// the runtime always ships THIS default version. Shipping the user's MODIFIED in-vault copy with
// the runtime is a future extension (see docs/development/issues.md → Planned features).
export const BUNDLED_SNIPPET_FILE = "live-image-editor.css";
export const BUNDLED_SNIPPET_CSS = `/* Live Image Editor — example image decoration classes.
   Installed from the plugin settings (opt-in). Edit freely; "Reset" in settings restores this
   shipped version. Apply a class in the image's trailing block, e.g. {shadow} or {rounded shadow}.
   The class lands on the image's OUTER box (which controls size + layout), so a plain ".name"
   styles the whole image — and box effects (shadow / border / rounding) are no longer clipped.
   Reach the pixels with ".name img" (e.g. object-fit). ".name" also matches a bare exported
   <img class="name">; "img.name" is the export fallback so object-fit reaches the image itself.
   Colours derive from the text colour so they adapt to light / dark themes. */
.rounded { border-radius: 8px; }
.shadow { box-shadow: 0 4px 14px color-mix(in srgb, var(--text-normal) 70%, transparent); }
.bordered { border: 2px solid var(--text-normal); box-sizing: border-box; }
.circle { border-radius: 50%; aspect-ratio: 1; }
.circle img, img.circle { object-fit: cover; }
`;
