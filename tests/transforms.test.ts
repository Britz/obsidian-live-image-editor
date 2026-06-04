import { describe, it, expect } from "vitest";
import {
  parseAltText, serializeTransform, ImageTransform,
  getRotation, setRotation, getFlipH, getFlipV, toggleFlipH, toggleFlipV, isCrop,
  getFilter, setFilter, filterToCss, parseFilterCss,
  getWidthPx, getPreset, setPresetWidth, setWidthPx,
  temperatureAdjust,
} from "../src/transforms";

describe("temperatureAdjust (F11 — virtual control nudging other sliders)", () => {
  const base = { hueRotate: 0, saturate: 1, brightness: 1 };
  it("is a no-op at temperature 0", () => {
    expect(temperatureAdjust(base, 0)).toEqual({ hueRotate: 0, saturate: 1, brightness: 1 });
  });
  it("warms (positive): rotates hue, lifts saturation and brightness", () => {
    const r = temperatureAdjust(base, 100);
    expect(r.hueRotate).toBe(30);
    expect(r.saturate).toBeGreaterThan(1);
    expect(r.brightness).toBeGreaterThan(1);
  });
  it("cools (negative): wraps hue the other way, lowers sat/brightness", () => {
    const r = temperatureAdjust(base, -100);
    expect(r.hueRotate).toBe(330);
    expect(r.saturate).toBeLessThan(1);
    expect(r.brightness).toBeLessThan(1);
  });
  it("clamps to the slider ranges", () => {
    const hot = temperatureAdjust({ hueRotate: 350, saturate: 3, brightness: 2 }, 100);
    expect(hot.saturate).toBeLessThanOrEqual(3);
    expect(hot.brightness).toBeLessThanOrEqual(2);
    expect(hot.hueRotate).toBeGreaterThanOrEqual(0);
    expect(hot.hueRotate).toBeLessThan(360);
  });
});

describe("parseAltText (bare-key attr_list block, T2.3)", () => {
  it("parses empty string", () => {
    expect(parseAltText("")).toEqual({ classes: [] });
  });
  it("parses width / height attrs as px lengths", () => {
    const r = parseAltText("width=300 height=200");
    expect(r.width).toBe("300px");
    expect(r.height).toBe("200px");
  });
  it("parses bare orientation keys to the orientation FIELDS (inner-frame)", () => {
    const r = parseAltText("rotate=90 flip=horizontal");
    expect(r.rotate).toBe(90);
    expect(r.flipH).toBe(true);
    expect(r.flipV).toBeUndefined();
    expect(r.transform).toBeUndefined(); // orientation is NOT the img transform
  });
  it("parses flip=both / two flip tokens", () => {
    expect(parseAltText("flip=both")).toMatchObject({ flipH: true, flipV: true });
    expect(parseAltText("flip=horizontal flip=vertical")).toMatchObject({ flipH: true, flipV: true });
  });
  it("routes the bare transform/filter to the img verbatim (crop placement)", () => {
    const r = parseAltText('transform="translate(-25%, -10%) scale(1.8)" filter="brightness(1.2)"');
    expect(r.transform).toBe("translate(-25%, -10%) scale(1.8)");
    expect(r.filter).toBe("brightness(1.2)");
  });
  it("keeps a bare transform's own rotate as CONTENT (no decompose)", () => {
    // A bare transform= is the verbatim crop placement; a rotate inside it is the
    // content-rotate (stays on the img), distinct from the bare rotate= orientation.
    const r = parseAltText('transform="translate(0%, 0%) rotate(12deg) scale(1.5)"');
    expect(r.transform).toContain("rotate(12deg)");
    expect(r.rotate).toBeUndefined();
  });
  it("parses bare aspect-ratio (cut-frame shape → outer)", () => {
    expect(parseAltText("aspect-ratio=4/3").aspectRatio).toBe("4/3");
    expect(parseAltText('aspect-ratio="3 / 2"').aspectRatio).toBe("3 / 2");
  });
  it("back-compat: a legacy style= orientation decomposes into the fields", () => {
    const r = parseAltText('.lie-img style="transform: rotate(90deg) scaleX(-1); filter: brightness(1.2)"');
    expect(r.rotate).toBe(90);
    expect(r.flipH).toBe(true);
    expect(r.transform).toBeUndefined(); // pure orientation → no leftover img transform
    expect(r.filter).toBe("brightness(1.2)");
  });
  it("back-compat: a legacy style= crop placement stays whole on the img", () => {
    const r = parseAltText('style="transform: translate(-25%, -10%) rotate(12deg) scale(1.8)"');
    expect(r.transform).toBe("translate(-25%, -10%) rotate(12deg) scale(1.8)");
    expect(r.rotate).toBeUndefined();
  });
  it("routes width / height / aspect-ratio to the outer; unknown props to box passthrough", () => {
    const r = parseAltText('style="width: 320px; height: 240px; aspect-ratio: 4/3; --x: 1"');
    expect(r.width).toBe("320px");
    expect(r.height).toBe("240px");
    expect(r.aspectRatio).toBe("4/3");
    expect(r.box).toEqual({ "--x": "1" });
  });
  it("parses the inline class and ignores the marker class", () => {
    const r = parseAltText(".lie-img .lie-inline .my-custom");
    expect(r.inline).toBe(true);
    expect(r.classes).toEqual(["my-custom"]);
  });
  it("parses align= to the field; legacy .lie-left/center/right class → field (back-compat)", () => {
    expect(parseAltText("align=right").align).toBe("right");
    expect(parseAltText("align=center").align).toBe("center");
    const legacy = parseAltText('.lie-left style="width: 180px"');
    expect(legacy.align).toBe("left");            // class mapped to the field
    expect(legacy.classes).not.toContain("lie-left"); // not kept as a class
    expect(legacy.width).toBe("180px");
  });
  it("brace-stripping contract (T-L9): braces left on drop the leading .class", () => {
    // The model's entry point expects brace-LESS content; with braces the first token
    // is `{.rounded` (starts with `{`, not `.`) and is dropped — guarding the pitfall.
    const withBraces = parseAltText('{.rounded style="width: 180px"}');
    expect(withBraces.classes).not.toContain("rounded");
    const braceless = parseAltText('.rounded style="width: 180px"');
    expect(braceless.classes).toContain("rounded");
  });
});

describe("serializeTransform (bare keys, T2.3)", () => {
  it("serializes an empty transform to an empty string (no marker)", () => {
    expect(serializeTransform({ classes: [] })).toBe("");
  });
  it("serializes a px width as the bare width=N key (a real HTML attr → faithful)", () => {
    expect(serializeTransform({ width: "320px", classes: [] })).toBe("width=320");
  });
  it("serializes align as the bare align= key, not a class", () => {
    expect(serializeTransform({ align: "right", width: "240px", classes: [] })).toBe("align=right width=240");
    expect(serializeTransform({ align: "center", classes: [] })).toBe("align=center");
  });
  it("keeps a non-px width (preset var / %) in the style= escape", () => {
    expect(serializeTransform({ width: "var(--lie-size-medium)", classes: [] })).toBe('style="width: var(--lie-size-medium)"');
    expect(serializeTransform({ width: "50%", classes: [] })).toBe('style="width: 50%"');
  });
  it("serializes orientation as bare rotate=/flip=, not the img transform", () => {
    expect(serializeTransform({ rotate: 90, flipH: true, classes: [] })).toBe("rotate=90 flip=horizontal");
    expect(serializeTransform({ flipH: true, flipV: true, classes: [] })).toBe("flip=horizontal flip=vertical");
  });
  it("serializes a crop: bare transform= (placement) + aspect-ratio= + width=N", () => {
    expect(serializeTransform({ transform: "translate(-25%, -10%) scale(1.8)", aspectRatio: "4/3", width: "320px", classes: [] }))
      .toBe('transform="translate(-25%, -10%) scale(1.8)" aspect-ratio=4/3 width=320');
  });
  it("serializes filter + a non-px preset var size", () => {
    expect(serializeTransform({ rotate: 90, filter: "sepia(0.8)", width: "var(--lie-size-medium)", classes: [] }))
      .toBe('rotate=90 filter="sepia(0.8)" style="width: var(--lie-size-medium)"');
  });
  it("serializes snippet classes (no marker)", () => {
    expect(serializeTransform({ classes: ["rounded", "shadow"] })).toBe(".rounded .shadow");
  });
  it("serializes inline", () => {
    expect(serializeTransform({ inline: true, classes: [] })).toBe(".lie-inline");
  });
});

describe("rotate / flip helpers (orientation fields → inner-frame)", () => {
  it("reads and sets the orientation rotation as a field", () => {
    const t: ImageTransform = { classes: [] };
    expect(getRotation(t)).toBe(0);
    setRotation(t, 90);
    expect(t.rotate).toBe(90);
    expect(getRotation(t)).toBe(90);
    setRotation(t, 0);
    expect(t.rotate).toBeUndefined();
  });
  it("Bug 25: rotating a CROP never touches the img's crop placement", () => {
    const t: ImageTransform = { classes: [], transform: "translate(-10%, -5%) scale(1.5)" };
    setRotation(t, 90);
    expect(t.rotate).toBe(90);                                  // orientation → inner-frame
    expect(t.transform).toBe("translate(-10%, -5%) scale(1.5)"); // placement UNTOUCHED
  });
  it("toggles horizontal / vertical flip as fields", () => {
    const t: ImageTransform = { classes: [] };
    toggleFlipH(t);
    expect(getFlipH(t)).toBe(true);
    expect(t.flipH).toBe(true);
    expect(t.transform).toBeUndefined(); // flip is orientation, not the img transform
    toggleFlipH(t);
    expect(getFlipH(t)).toBe(false);
    toggleFlipV(t);
    expect(getFlipV(t)).toBe(true);
  });
});

describe("isCrop (the case with an explicit pan/zoom)", () => {
  it("is true when the transform carries translate or scale", () => {
    expect(isCrop({ classes: [], transform: "translate(-10%, 0%) rotate(0deg) scale(1.2)" })).toBe(true);
  });
  it("is false for a plain rotate/flip", () => {
    expect(isCrop({ classes: [], transform: "rotate(90deg) scaleX(-1)" })).toBe(false);
    expect(isCrop({ classes: [] })).toBe(false);
  });
});

describe("filter ↔ FilterData", () => {
  it("stringifies only non-default values with the right function + unit", () => {
    expect(filterToCss({ brightness: 1.2, contrast: 1, hueRotate: 90, blur: 2 }))
      .toBe("brightness(1.2) hue-rotate(90deg) blur(2px)");
  });
  it("parses a native filter string back to FilterData", () => {
    expect(parseFilterCss("brightness(1.2) hue-rotate(90deg) blur(2px)"))
      .toEqual({ brightness: 1.2, hueRotate: 90, blur: 2 });
  });
  it("getFilter / setFilter round-trip via the transform", () => {
    const t: ImageTransform = { classes: [] };
    setFilter(t, { brightness: 1.3, grayscale: 1 });
    expect(t.filter).toBe("brightness(1.3) grayscale(1)");
    expect(getFilter(t)).toEqual({ brightness: 1.3, grayscale: 1 });
    setFilter(t, undefined);
    expect(t.filter).toBeUndefined();
  });
});

describe("size helpers", () => {
  it("reads a literal px width, null for a preset var", () => {
    expect(getWidthPx({ classes: [], width: "320px" })).toBe(320);
    expect(getWidthPx({ classes: [], width: "var(--lie-size-medium)" })).toBeNull();
  });
  it("reads / sets a preset width via the re-themeable var", () => {
    const t: ImageTransform = { classes: [] };
    setPresetWidth(t, "large");
    expect(t.width).toBe("var(--lie-size-large)");
    expect(getPreset(t)).toBe("large");
    setPresetWidth(t, null);
    expect(t.width).toBeUndefined();
  });
  it("setWidthPx writes a px length and clears at null", () => {
    const t: ImageTransform = { classes: [] };
    setWidthPx(t, 200);
    expect(t.width).toBe("200px");
    setWidthPx(t, null);
    expect(t.width).toBeUndefined();
  });
});

describe("round-trips (the canonical block is the lossless single encoding)", () => {
  it("preserves orientation / filter / size / classes / inline", () => {
    const original: ImageTransform = {
      rotate: 90,
      flipH: true,
      filter: "brightness(1.1) sepia(0.8)",
      width: "400px",
      classes: ["rounded"],
      inline: true,
    };
    const reparsed = parseAltText(serializeTransform(original));
    expect(reparsed.rotate).toBe(90);
    expect(reparsed.flipH).toBe(true);
    expect(reparsed.filter).toBe(original.filter);
    expect(reparsed.width).toBe(original.width);
    expect(reparsed.classes).toEqual(original.classes);
    expect(reparsed.inline).toBe(true);
  });
  it("passes a power-user skew()/extra filter function through untouched (AD2)", () => {
    const original: ImageTransform = {
      transform: "translate(-5%, 0%) scale(1.2) skew(10deg)",
      filter: "brightness(1.1) drop-shadow(2px 2px 2px black)",
      classes: [],
    };
    const reparsed = parseAltText(serializeTransform(original));
    expect(reparsed.transform).toBe(original.transform);
    expect(reparsed.filter).toBe(original.filter);
  });
  it("preserves a crop (placement transform= + cut-frame aspect-ratio= + width)", () => {
    const original: ImageTransform = {
      transform: "translate(-25%, -10%) rotate(12deg) scale(1.8)",
      aspectRatio: "4/3",
      width: "320px",
      classes: [],
    };
    const reparsed = parseAltText(serializeTransform(original));
    expect(reparsed.transform).toBe(original.transform);
    expect(reparsed.aspectRatio).toBe("4/3");
    expect(reparsed.width).toBe("320px");
    expect(isCrop(reparsed)).toBe(true);
  });
  it("preserves a rotated crop (orientation field + crop placement together — Bug 25)", () => {
    const original: ImageTransform = {
      rotate: 90,
      transform: "translate(-25%, -10%) scale(1.8)",
      aspectRatio: "4/3",
      width: "320px",
      classes: [],
    };
    const reparsed = parseAltText(serializeTransform(original));
    expect(reparsed.rotate).toBe(90);
    expect(reparsed.transform).toBe(original.transform);
    expect(isCrop(reparsed)).toBe(true);
  });
  it("round-trips align + width as bare keys; a legacy align class migrates to align=", () => {
    const reparsed = parseAltText(serializeTransform({ align: "right", width: "240px", classes: ["rounded"] }));
    expect(reparsed.align).toBe("right");
    expect(reparsed.width).toBe("240px");
    expect(reparsed.classes).toEqual(["rounded"]);
    // legacy class form parses to the same model, then serializes to the new bare key.
    expect(serializeTransform(parseAltText(".lie-left width=240"))).toBe("align=left width=240");
  });
  it("empty round-trips to empty; a legacy .lie-img note re-serializes without the marker", () => {
    expect(serializeTransform(parseAltText(""))).toBe("");
    expect(serializeTransform(parseAltText(".lie-img"))).toBe(""); // parse-skip keeps back-compat
  });
});
