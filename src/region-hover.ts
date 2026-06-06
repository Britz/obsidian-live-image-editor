// The ONE active-region hover binder (D6). Several DOM elements are treated as a SINGLE hover region:
// while the pointer is over ANY of them the region is "active", and a short grace bridges the gaps
// between them (image → panel travel, toolbar → popup). The `onActiveChange` callback fires whenever
// the active state flips, so the caller drives ONE signal — never a second, competing one (the
// desync the old `:hover`-vs-JS split caused). Shared by:
//   • the modal sub-menu host (AnchoredSubmenu) — members image + toolbar + panel, the toolbar greyed;
//   • the lightweight palettes (group popup / class dropdown) — image + toolbar + popup, NOT greyed.
//
// Robust to NESTED members (the in-chrome toolbar lives INSIDE the image wrapper): a Set of the
// members the pointer is currently inside means moving from the toolbar onto the image (both inside
// the wrapper) keeps the region active — only emptying the Set (leaving every member) deactivates.
// The Set is seeded from `:hover` at bind time, so a move right after open (when no `mouseenter` has
// fired yet because the pointer was already inside) is still tracked. Synthetic events (CDP) carry no
// `:hover`, so there the Set is driven purely by the dispatched enter/leave — exactly as the
// structural checks expect.
export function bindRegionHover(
  members: (HTMLElement | null | undefined)[],
  onActiveChange: (active: boolean) => void,
  grace = 160
): () => void {
  const els = members.filter((m): m is HTMLElement => !!m);
  const inside = new Set<HTMLElement>();
  for (const m of els) {
    try { if (m.matches(":hover")) inside.add(m); } catch { /* :hover unsupported — seed empty */ }
  }
  let timer = 0;
  const handlers = els.map((m) => ({
    m,
    enter: (): void => { window.clearTimeout(timer); inside.add(m); onActiveChange(true); },
    leave: (): void => {
      inside.delete(m);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => { if (inside.size === 0) onActiveChange(false); }, grace);
    },
  }));
  for (const h of handlers) {
    h.m.addEventListener("mouseenter", h.enter);
    h.m.addEventListener("mouseleave", h.leave);
  }
  return (): void => {
    window.clearTimeout(timer);
    for (const h of handlers) {
      h.m.removeEventListener("mouseenter", h.enter);
      h.m.removeEventListener("mouseleave", h.leave);
    }
  };
}

// Couple a lightweight palette (group popup / class dropdown) to the image + toolbar active region
// (Bug 64 / D6). The palette sits on document.body (outside the `.lie-wrapper` paint box), so hovering
// it would otherwise drop the in-chrome bar's `.lie-wrapper:hover` and hide it. Mark the wrapper
// `.lie-region-hover` (the stylesheet keeps the in-chrome bar visible — NOT greyed; palettes are not
// modal) while the region is hovered, and CLOSE the palette when the WHOLE region is left, so palette
// and toolbar fade together. Returns a cleanup to run on EVERY close path (button pick / click-away /
// Esc / region-leave). For the FLOATING toolbar there is no wrapper: the bar stays via its own JS
// path (the mouseover delegate), and only the close-on-leave coupling applies here.
export function couplePaletteToRegion(
  palette: HTMLElement,
  region: { wrapper: HTMLElement | null; toolbar: HTMLElement | null },
  close: () => void
): () => void {
  region.wrapper?.classList.add("lie-region-hover");
  const unbind = bindRegionHover([region.wrapper, palette, region.toolbar], (active) => {
    if (active) region.wrapper?.classList.add("lie-region-hover");
    else close();
  });
  return (): void => {
    region.wrapper?.classList.remove("lie-region-hover");
    unbind();
  };
}
