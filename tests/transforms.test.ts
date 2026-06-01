import { describe, it, expect } from "vitest";
import {
  parseAltText, serializeTransform, ImageTransform,
  filterToVars, FILTER_VAR_NAMES, temperatureAdjust,
} from "../src/transforms";

describe("temperatureAdjust (F6 — virtual control nudging other sliders)", () => {
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

  it("cools (negative): rotates hue the other way (wrapped), lowers sat/brightness", () => {
    const r = temperatureAdjust(base, -100);
    expect(r.hueRotate).toBe(330); // -30 wrapped into 0..360
    expect(r.saturate).toBeLessThan(1);
    expect(r.brightness).toBeLessThan(1);
  });

  it("clamps to the slider ranges and stays within bounds", () => {
    const hot = temperatureAdjust({ hueRotate: 350, saturate: 3, brightness: 2 }, 100);
    expect(hot.saturate).toBeLessThanOrEqual(3);
    expect(hot.brightness).toBeLessThanOrEqual(2);
    expect(hot.hueRotate).toBeGreaterThanOrEqual(0);
    expect(hot.hueRotate).toBeLessThan(360);
  });
});

describe("filterToVars (filter -> CSS custom properties)", () => {
  it("returns nothing for undefined / empty / all-default filters", () => {
    expect(filterToVars(undefined)).toEqual([]);
    expect(filterToVars({})).toEqual([]);
    expect(filterToVars({ brightness: 1, contrast: 1, blur: 0 })).toEqual([]);
  });

  it("emits only non-default values, with the right var name and unit", () => {
    expect(filterToVars({ brightness: 1.2 })).toEqual([
      { name: "--lie-brightness", value: "1.2" },
    ]);
    expect(filterToVars({ hueRotate: 180 })).toEqual([
      { name: "--lie-hue", value: "180deg" },
    ]);
    expect(filterToVars({ blur: 3 })).toEqual([
      { name: "--lie-blur", value: "3px" },
    ]);
  });

  it("keeps multiple non-default values together", () => {
    const vars = filterToVars({ brightness: 1.2, grayscale: 1, sepia: 0 });
    expect(vars).toEqual([
      { name: "--lie-brightness", value: "1.2" },
      { name: "--lie-grayscale", value: "1" },
    ]);
  });

  it("a serialized then re-parsed filter yields the same vars (round-trip)", () => {
    const t: ImageTransform = { classes: [], filter: { brightness: 1.3, blur: 2, hueRotate: 90 } };
    const reparsed = parseAltText(serializeTransform(t));
    expect(filterToVars(reparsed.filter)).toEqual(filterToVars(t.filter));
  });

  it("FILTER_VAR_NAMES covers every var filterToVars can emit", () => {
    const emitted = filterToVars({
      brightness: 1.2, contrast: 1.2, saturate: 1.2,
      hueRotate: 10, blur: 1, grayscale: 0.5, sepia: 0.5,
    }).map((v) => v.name);
    for (const name of emitted) expect(FILTER_VAR_NAMES).toContain(name);
    expect(FILTER_VAR_NAMES).toHaveLength(7);
  });
});

describe("parseAltText (attr_list block)", () => {
  it("parses empty string", () => {
    expect(parseAltText("")).toEqual({ classes: [] });
  });

  it("parses width / height attrs", () => {
    const result = parseAltText("width=300 height=200");
    expect(result.width).toBe(300);
    expect(result.height).toBe(200);
  });

  it("parses width / height from style px", () => {
    const result = parseAltText('style="width: 300px; height: 200px;"');
    expect(result.width).toBe(300);
    expect(result.height).toBe(200);
  });

  it("parses rotation custom property", () => {
    const result = parseAltText('.lie-img style="--lie-rotate: 45deg;"');
    expect(result.rotate).toBe(45);
  });

  it("parses flipH and flipV", () => {
    const result = parseAltText('.lie-img style="--lie-flip-h: -1; --lie-flip-v: -1;"');
    expect(result.flipH).toBe(true);
    expect(result.flipV).toBe(true);
  });

  it("parses inline class", () => {
    const result = parseAltText(".lie-inline");
    expect(result.inline).toBe(true);
  });

  it("parses crop custom property", () => {
    const result = parseAltText('.lie-img style="--lie-crop: 10 20 300 200 15 1.5;"');
    expect(result.crop).toEqual({
      x: 10, y: 20, w: 300, h: 200, rotate: 15, scale: 1.5,
    });
  });

  it("parses filter custom properties", () => {
    const result = parseAltText(
      '.lie-img style="--lie-brightness: 1.2; --lie-contrast: 0.8; --lie-saturate: 1.5; --lie-hue: 90deg; --lie-blur: 2px; --lie-grayscale: 0.5; --lie-sepia: 0.3;"'
    );
    expect(result.filter).toEqual({
      brightness: 1.2,
      contrast: 0.8,
      saturate: 1.5,
      hueRotate: 90,
      blur: 2,
      grayscale: 0.5,
      sepia: 0.3,
    });
  });

  it("parses snippet classes, ignoring marker class", () => {
    const result = parseAltText(".lie-img .float-right .my-custom");
    expect(result.classes).toEqual(["float-right", "my-custom"]);
  });

  it("parses combined block", () => {
    const result = parseAltText(
      '.lie-img .shadow style="--lie-rotate: 90deg; --lie-flip-h: -1; --lie-brightness: 1.1; width: 400px; height: 300px;"'
    );
    expect(result.width).toBe(400);
    expect(result.height).toBe(300);
    expect(result.rotate).toBe(90);
    expect(result.flipH).toBe(true);
    expect(result.classes).toEqual(["shadow"]);
    expect(result.filter?.brightness).toBe(1.1);
  });
});

describe("serializeTransform (attr_list block)", () => {
  it("serializes empty transform", () => {
    expect(serializeTransform({ classes: [] })).toBe("");
  });

  it("serializes width only", () => {
    expect(serializeTransform({ width: 300, classes: [] })).toBe('style="width: 300px;"');
  });

  it("serializes rotation with marker class", () => {
    expect(serializeTransform({ rotate: 45, classes: [] })).toBe('.lie-img style="--lie-rotate: 45deg;"');
  });

  it("serializes flip", () => {
    expect(serializeTransform({ flipH: true, flipV: true, classes: [] }))
      .toBe('.lie-img style="--lie-flip-h: -1; --lie-flip-v: -1;"');
  });

  it("serializes crop", () => {
    expect(serializeTransform({
      crop: { x: 10, y: 20, w: 300, h: 200, rotate: 15, scale: 1.5 },
      classes: [],
    })).toBe('.lie-img style="--lie-crop: 10 20 300 200 15 1.5;"');
  });

  it("serializes filters (skips defaults)", () => {
    expect(serializeTransform({
      filter: { brightness: 1.2, contrast: 1, saturate: 1 },
      classes: [],
    })).toBe('.lie-img style="--lie-brightness: 1.2;"');
  });

  it("serializes snippet classes without marker when no transform", () => {
    expect(serializeTransform({ classes: ["float-right", "custom"] })).toBe(".float-right .custom");
  });

  it("serializes inline", () => {
    expect(serializeTransform({ inline: true, classes: [] })).toBe(".lie-inline");
  });
});

describe("roundtrip", () => {
  it("parse then serialize preserves data", () => {
    const original: ImageTransform = {
      width: 400,
      height: 300,
      rotate: 45.5,
      flipH: true,
      crop: { x: 10, y: 20, w: 280, h: 180, rotate: 15, scale: 1.2 },
      filter: { brightness: 1.1 },
      classes: ["shadow"],
    };
    const serialized = serializeTransform(original);
    const reparsed = parseAltText(serialized);

    expect(reparsed.width).toBe(original.width);
    expect(reparsed.height).toBe(original.height);
    expect(reparsed.rotate).toBe(original.rotate);
    expect(reparsed.flipH).toBe(original.flipH);
    expect(reparsed.crop).toEqual(original.crop);
    expect(reparsed.filter?.brightness).toBe(original.filter?.brightness);
    expect(reparsed.classes).toEqual(original.classes);
  });

  it("empty roundtrip", () => {
    expect(serializeTransform(parseAltText(""))).toBe("");
  });

  it("quantization rounds properly", () => {
    const transform: ImageTransform = {
      crop: { x: 10.7, y: 20.3, w: 300.9, h: 200.1, rotate: 15.15, scale: 1.2345 },
      classes: [],
    };
    const reparsed = parseAltText(serializeTransform(transform));
    expect(reparsed.crop?.x).toBe(11);
    expect(reparsed.crop?.y).toBe(20);
    expect(reparsed.crop?.w).toBe(301);
    expect(reparsed.crop?.h).toBe(200);
    expect(reparsed.crop?.rotate).toBe(15.2);
    expect(reparsed.crop?.scale).toBe(1.235);
  });
});
