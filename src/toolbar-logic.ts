// Pure overflow planning for the grouped toolbar (D3). When the toolbar is wider
// than the space available, collapsible groups fold into a single trigger button
// (which opens a submenu) instead of wrapping or being clipped. DOM-free so the
// decision is unit testable (T-L6).

export interface CollapsibleGroup {
  id: string;
  // Width the group occupies fully expanded (all its buttons inline).
  expandedWidth: number;
  // Width of the single trigger button it folds into.
  triggerWidth: number;
}

/**
 * Decide which collapsible groups must fold so the toolbar fits `available`.
 * `base` is the width of everything that never folds (standalone buttons,
 * always-collapsed groups, gaps). Groups are folded in the order given (highest
 * priority to KEEP expanded last), each fold freeing `expandedWidth-triggerWidth`.
 * Returns the set of folded group ids. If it still doesn't fit once all are
 * folded, they simply all stay folded (never clipped — the toolbar may scroll the
 * page column, but groups never wrap).
 */
export function planOverflow(
  available: number,
  base: number,
  groups: CollapsibleGroup[]
): Set<string> {
  const folded = new Set<string>();
  let total = base + groups.reduce((sum, g) => sum + g.expandedWidth, 0);
  if (total <= available) return folded;

  for (const g of groups) {
    folded.add(g.id);
    total -= g.expandedWidth - g.triggerWidth;
    if (total <= available) break;
  }
  return folded;
}
