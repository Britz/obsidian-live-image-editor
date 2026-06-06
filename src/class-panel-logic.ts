// Pure search/filter logic for the CSS-classes sub-panel (T-items: pure `*-logic.ts`, unit-tested,
// no Obsidian imports). The panel shows a search box over a scrollable class list; this is the
// case-insensitive substring filter that narrows the list as the user types.

/**
 * Filter `classes` down to those whose name contains `query` (case-insensitive substring).
 * An empty / whitespace-only query returns the list unchanged (order preserved). Trimming the
 * query keeps a stray leading/trailing space from hiding everything.
 */
export function filterClasses(classes: string[], query: string): string[] {
  const q = query.trim().toLowerCase();
  if (q === "") return classes.slice();
  return classes.filter((c) => c.toLowerCase().includes(q));
}
