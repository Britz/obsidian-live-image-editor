import { describe, it, expect } from "vitest";
import { planOverflow, CollapsibleGroup } from "../src/toolbar-logic";

const edit: CollapsibleGroup = { id: "edit", expandedWidth: 150, triggerWidth: 30 };
const layout: CollapsibleGroup = { id: "layout", expandedWidth: 120, triggerWidth: 30 };

describe("planOverflow (D3)", () => {
  it("folds nothing when everything fits", () => {
    expect(planOverflow(1000, 200, [edit, layout])).toEqual(new Set());
  });

  it("folds the first group when slightly over", () => {
    // base 200 + 150 + 120 = 470; available 400 → fold edit frees 120 → 350 ≤ 400
    expect(planOverflow(400, 200, [edit, layout])).toEqual(new Set(["edit"]));
  });

  it("folds both groups when very narrow", () => {
    // after folding edit: 350 > 300 → fold layout too
    expect(planOverflow(300, 200, [edit, layout])).toEqual(new Set(["edit", "layout"]));
  });

  it("respects fold priority order (edit folds before layout)", () => {
    const folded = planOverflow(360, 200, [edit, layout]);
    expect(folded.has("edit")).toBe(true);
    expect(folded.has("layout")).toBe(false);
  });

  it("folds all when nothing can make it fit", () => {
    expect(planOverflow(50, 200, [edit, layout])).toEqual(new Set(["edit", "layout"]));
  });
});
