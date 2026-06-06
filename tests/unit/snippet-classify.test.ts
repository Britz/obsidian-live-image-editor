import { describe, it, expect } from "vitest";
import {
  parseImgRules, classifyBundledFile, restoreClassInCss, findCollisions, isBundledFileModified,
} from "../../src/snippet-classify";
import { BUNDLED_SNIPPET_CSS } from "../../src/bundled-snippet";

describe("parseImgRules", () => {
  it("extracts img.NAME rules with normalized bodies", () => {
    const rules = parseImgRules("img.rounded { border-radius: 8px; }\nimg.shadow{box-shadow:0 0 1px}");
    expect(rules.get("rounded")).toBe("border-radius:8px");
    expect(rules.get("shadow")).toBe("box-shadow:0 0 1px");
  });

  it("treats whitespace/trailing-semicolon differences as identical (normalized)", () => {
    expect(parseImgRules("img.a{b:1;}").get("a")).toBe(parseImgRules("img.a {  b: 1  }").get("a"));
  });

  it("ignores rules inside comments (Bug 34 family)", () => {
    const rules = parseImgRules("/* img.fake { x: 1 } */ img.real { y: 2; }");
    expect(rules.has("fake")).toBe(false);
    expect(rules.has("real")).toBe(true);
  });
});

describe("classifyBundledFile", () => {
  it("marks an untouched file's classes all unchanged", () => {
    const result = classifyBundledFile(BUNDLED_SNIPPET_CSS, BUNDLED_SNIPPET_CSS);
    expect(result.every((c) => c.status === "unchanged")).toBe(true);
    expect(result.map((c) => c.className).sort()).toEqual(["bordered", "circle", "rounded", "shadow"]);
  });

  it("detects a changed body and a deleted class against the shipped default", () => {
    const edited = BUNDLED_SNIPPET_CSS
      .replace("img.rounded { border-radius: 8px; }", "img.rounded { border-radius: 20px; }")
      .replace("img.shadow { box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15); }", "");
    const byName = new Map(classifyBundledFile(edited, BUNDLED_SNIPPET_CSS).map((c) => [c.className, c.status]));
    expect(byName.get("rounded")).toBe("changed");
    expect(byName.get("shadow")).toBe("deleted");
    expect(byName.get("bordered")).toBe("unchanged");
    expect(byName.get("circle")).toBe("unchanged");
  });
});

describe("restoreClassInCss", () => {
  it("replaces a changed rule in place", () => {
    const edited = BUNDLED_SNIPPET_CSS.replace("border-radius: 8px;", "border-radius: 99px;");
    const restored = restoreClassInCss(edited, "rounded", BUNDLED_SNIPPET_CSS);
    expect(restored).toContain("img.rounded { border-radius: 8px; }");
    expect(restored).not.toContain("99px");
  });

  it("re-appends a deleted rule", () => {
    const edited = BUNDLED_SNIPPET_CSS.replace("img.circle { border-radius: 50%; object-fit: cover; aspect-ratio: 1; }", "");
    expect(parseImgRules(edited).has("circle")).toBe(false);
    const restored = restoreClassInCss(edited, "circle", BUNDLED_SNIPPET_CSS);
    expect(parseImgRules(restored).get("circle")).toBe(parseImgRules(BUNDLED_SNIPPET_CSS).get("circle"));
  });

  it("leaves content untouched for a non-shipped class name", () => {
    const css = "img.custom { color: red; }";
    expect(restoreClassInCss(css, "custom", BUNDLED_SNIPPET_CSS)).toBe(css);
  });

  it("re-adds a class 'deleted' by COMMENTING IT OUT (append, not replace-inside-the-comment)", () => {
    const commented = BUNDLED_SNIPPET_CSS.replace(
      "img.circle { border-radius: 50%; object-fit: cover; aspect-ratio: 1; }",
      "/* img.circle { border-radius: 50%; object-fit: cover; aspect-ratio: 1; } */"
    );
    // Detection sees a commented-out class as deleted (comments are stripped first)…
    expect(classifyBundledFile(commented, BUNDLED_SNIPPET_CSS).find((c) => c.className === "circle")?.status)
      .toBe("deleted");
    // …so restore must bring it back as a REAL (uncommented) rule, not edit the text in the comment.
    const restored = restoreClassInCss(commented, "circle", BUNDLED_SNIPPET_CSS);
    expect(parseImgRules(restored).get("circle")).toBe(parseImgRules(BUNDLED_SNIPPET_CSS).get("circle"));
  });
});

describe("isBundledFileModified", () => {
  it("is false for the pristine shipped file (incl. cosmetic reformat)", () => {
    expect(isBundledFileModified(BUNDLED_SNIPPET_CSS, BUNDLED_SNIPPET_CSS)).toBe(false);
    expect(isBundledFileModified(BUNDLED_SNIPPET_CSS.replace("border-radius: 8px;", "border-radius:8px"), BUNDLED_SNIPPET_CSS)).toBe(false);
  });

  it("is true when a shipped class is changed, deleted, or an extra class is added", () => {
    expect(isBundledFileModified(BUNDLED_SNIPPET_CSS.replace("8px", "20px"), BUNDLED_SNIPPET_CSS)).toBe(true);
    expect(isBundledFileModified(BUNDLED_SNIPPET_CSS.replace("img.circle { border-radius: 50%; object-fit: cover; aspect-ratio: 1; }", ""), BUNDLED_SNIPPET_CSS)).toBe(true);
    expect(isBundledFileModified(BUNDLED_SNIPPET_CSS + "\nimg.custom { color: red; }", BUNDLED_SNIPPET_CSS)).toBe(true);
  });
});

describe("findCollisions", () => {
  it("flags a class active in two different files", () => {
    const collisions = findCollisions([
      { fileName: "a.css", classNames: ["rounded", "fancy"] },
      { fileName: "b.css", classNames: ["fancy"] },
    ]);
    expect(collisions.has("fancy")).toBe(true);
    expect(collisions.has("rounded")).toBe(false);
  });

  it("does not flag a name that only appears in one file", () => {
    expect(findCollisions([{ fileName: "a.css", classNames: ["x", "y"] }]).size).toBe(0);
  });
});
