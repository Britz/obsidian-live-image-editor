// The plugin's brand mark — a tilted framed photo (a "funke" + two mountains, one with a clipped
// plateau) inside Lucide-weight corner brackets. Registered via `addIcon` in onload so it is usable
// anywhere `setIcon` is (the editing-toolbar submenu, the settings header, …). The same artwork
// ships as `docs/img/logo.svg` for the README / docs / GitHub-Pages favicon — keep the two in sync.
export const BRAND_ICON_ID = "live-image-editor";

// Content for Obsidian's `addIcon`, which wraps it in `<svg viewBox="0 0 100 100">` — so the 24-grid
// artwork is scaled by 100/24. Photo = ONE `evenodd` fill path (rounded frame with the funke + the
// two mountains punched out as holes); brackets = 2px stroked Ls (the Lucide line weight). Everything
// is `currentColor`, so the mark follows the surrounding UI colour.
export const BRAND_ICON_SVG =
  '<g transform="scale(4.16667)">' +
    '<g transform="rotate(-16 12 12) translate(12 12) scale(1.15) translate(-12 -12)">' +
      '<path fill="currentColor" fill-rule="evenodd" d="M9.2 7.6 H14.8 A1.6 1.6 0 0 1 16.4 9.2 V14.8 A1.6 1.6 0 0 1 14.8 16.4 H9.2 A1.6 1.6 0 0 1 7.6 14.8 V9.2 A1.6 1.6 0 0 1 9.2 7.6 Z M13.4 10.5 L11.38 10.02 L10.9 8 L10.42 10.02 L8.4 10.5 L10.42 10.98 L10.9 13 L11.38 10.98 Z M8.3 15.9 L9.5 14.3 L12.5 14.3 L14.4 11.9 L15.7 13.7 L15.7 15.4 Q15.7 15.9 15.2 15.9 Z"/>' +
    '</g>' +
    '<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M7 3 L3 3 L3 7"/><path d="M17 3 L21 3 L21 7"/><path d="M21 17 L21 21 L17 21"/><path d="M3 17 L3 21 L7 21"/>' +
    '</g>' +
  '</g>';
