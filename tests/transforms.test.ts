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

describe("parseAltText (native-CSS attr_list block)", () => {
  it("parses empty string", () => {
    expect(parseAltText("")).toEqual({ classes: [] });
  });
  it("parses width / height attrs as px lengths", () => {
    const r = parseAltText("width=300 height=200");
    expect(r.width).toBe("300px");
    expect(r.height).toBe("200px");
  });
  it("routes native transform / filter to the img verbatim", () => {
    const r = parseAltText('.lie-img style="transform: rotate(90deg) scaleX(-1); filter: brightness(1.2)"');
    expect(r.transform).toBe("rotate(90deg) scaleX(-1)");
    expect(r.filter).toBe("brightness(1.2)");
  });
  it("routes width / height / aspect-ratio to the box; unknown props to box passthrough", () => {
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
  it("brace-stripping contract (T-L9): braces left on drop the leading .class", () => {
    // The model's entry point expects brace-LESS content; with braces the first token
    // is `{.lie-left` (starts with `{`, not `.`) and is dropped — guarding the pitfall.
    const withBraces = parseAltText('{.lie-left style="width: 180px"}');
    expect(withBraces.classes).not.toContain("lie-left");
    const braceless = parseAltText('.lie-left style="width: 180px"');
    expect(braceless.classes).toContain("lie-left");
  });
});

describe("serializeTransform", () => {
  it("serializes an empty transform to an empty string (no marker)", () => {
    expect(serializeTransform({ classes: [] })).toBe("");
  });
  it("serializes a width without any marker class", () => {
    expect(serializeTransform({ width: "320px", classes: [] })).toBe('style="width: 320px"');
  });
  it("serializes transform + filter + size", () => {
    expect(serializeTransform({ transform: "rotate(90deg)", filter: "sepia(0.8)", width: "var(--lie-size-medium)", classes: [] }))
      .toBe('style="transform: rotate(90deg); filter: sepia(0.8); width: var(--lie-size-medium)"');
  });
  it("serializes snippet classes (no marker)", () => {
    expect(serializeTransform({ classes: ["rounded", "shadow"] })).toBe(".rounded .shadow");
  });
  it("serializes inline", () => {
    expect(serializeTransform({ inline: true, classes: [] })).toBe(".lie-inline");
  });
});

describe("rotate / flip helpers (edit one function, preserve the rest)", () => {
  it("reads and sets the rotate() function", () => {
    const t: ImageTransform = { classes: [] };
    expect(getRotation(t)).toBe(0);
    setRotation(t, 90);
    expect(t.transform).toBe("rotate(90deg)");
    expect(getRotation(t)).toBe(90);
    setRotation(t, 0);
    expect(t.transform).toBeUndefined();
  });
  it("preserves a crop's translate/scale when changing rotation", () => {
    const t: ImageTransform = { classes: [], transform: "translate(-10%, -5%) rotate(0deg) scale(1.5)" };
    setRotation(t, 90);
    expect(t.transform).toContain("translate(-10%, -5%)");
    expect(t.transform).toContain("rotate(90deg)");
    expect(t.transform).toContain("scale(1.5)");
  });
  it("toggles horizontal / vertical flip", () => {
    const t: ImageTransform = { classes: [] };
    toggleFlipH(t);
    expect(getFlipH(t)).toBe(true);
    expect(t.transform).toContain("scaleX(-1)");
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
  it("preserves transform / filter / size / classes / inline", () => {
    const original: ImageTransform = {
      transform: "rotate(90deg) scaleX(-1)",
      filter: "brightness(1.1) sepia(0.8)",
      width: "400px",
      classes: ["rounded"],
      inline: true,
    };
    const reparsed = parseAltText(serializeTransform(original));
    expect(reparsed.transform).toBe(original.transform);
    expect(reparsed.filter).toBe(original.filter);
    expect(reparsed.width).toBe(original.width);
    expect(reparsed.classes).toEqual(original.classes);
    expect(reparsed.inline).toBe(true);
  });
  it("passes a power-user skew()/extra filter function through untouched (AD2)", () => {
    const original: ImageTransform = {
      transform: "rotate(45deg) skew(10deg)",
      filter: "brightness(1.1) drop-shadow(2px 2px 2px black)",
      classes: [],
    };
    const reparsed = parseAltText(serializeTransform(original));
    expect(reparsed.transform).toBe(original.transform);
    expect(reparsed.filter).toBe(original.filter);
  });
  it("preserves a crop (translate% + rotate + scale + box w/h)", () => {
    const original: ImageTransform = {
      transform: "translate(-25%, -10%) rotate(12deg) scale(1.8)",
      width: "320px",
      height: "240px",
      classes: [],
    };
    const reparsed = parseAltText(serializeTransform(original));
    expect(reparsed.transform).toBe(original.transform);
    expect(reparsed.width).toBe("320px");
    expect(reparsed.height).toBe("240px");
    expect(isCrop(reparsed)).toBe(true);
  });
  it("empty round-trips to empty; a legacy .lie-img note re-serializes without the marker", () => {
    expect(serializeTransform(parseAltText(""))).toBe("");
    expect(serializeTransform(parseAltText(".lie-img"))).toBe(""); // parse-skip keeps back-compat
  });
});
