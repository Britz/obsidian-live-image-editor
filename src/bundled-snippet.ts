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
   Installed from the plugin settings (opt-in). Edit freely; "Reset" in settings
   restores this shipped version. Apply a class in the image's trailing block. */
img.rounded { border-radius: 8px; }
img.shadow { box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15); }
img.bordered { border: 1px solid var(--background-modifier-border); }
img.circle { border-radius: 50%; object-fit: cover; aspect-ratio: 1; }
`;
