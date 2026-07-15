import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

// Bug 119: the standalone runtime bundles the shared core, which references Obsidian's window-aware
// globals `activeDocument` / `activeWindow`. Off-Obsidian those don't exist, so the runtime ENTRY
// must SHIM them (bind to this page's document/window) BEFORE the first hydrate, or the first claimed
// image throws a ReferenceError. This guards that the shim stays present AND stays ahead of hydrate —
// it also pre-covers Feature 39's future `window` → `activeWindow` use in the shared core (AD9
// runtime exception). The runtime is browser-only (not importable in jsdom), so this is a source-text
// assertion like runtime-style-injection.test.ts.
describe("runtime shims Obsidian's window globals before hydrate (Bug 119)", () => {
  const raw = readFileSync(new URL("../../src/runtime.ts", import.meta.url), "utf8");
  // Strip comments — the file's own comments legitimately NAME the globals to explain the shim.
  const code = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("binds activeDocument to the page document", () => {
    expect(code).toMatch(/activeDocument:\s*document/);
  });

  it("binds activeWindow to the page window", () => {
    expect(code).toMatch(/activeWindow:\s*window/);
  });

  it("sets the shim before the first hydrate", () => {
    const shim = code.search(/Object\.assign\(\s*globalThis/);
    const hydrate = code.indexOf("hydrate(document)");
    expect(shim).toBeGreaterThanOrEqual(0);
    expect(hydrate).toBeGreaterThan(shim);
  });
});
