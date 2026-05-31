import { describe, it, expect } from "vitest";
import { parseAltText, serializeTransform, ImageTransform } from "../src/transforms";

describe("parseAltText", () => {
  it("parses empty string", () => {
    const result = parseAltText("");
    expect(result).toEqual({ classes: [] });
  });

  it("parses width only", () => {
    const result = parseAltText("300");
    expect(result.width).toBe(300);
    expect(result.height).toBeUndefined();
  });

  it("parses width x height", () => {
    const result = parseAltText("300x200");
    expect(result.width).toBe(300);
    expect(result.height).toBe(200);
  });

  it("parses rotation", () => {
    const result = parseAltText("rotate:45");
    expect(result.rotate).toBe(45);
  });

  it("parses flipH and flipV", () => {
    const result = parseAltText("flipH flipV");
    expect(result.flipH).toBe(true);
    expect(result.flipV).toBe(true);
  });

  it("parses inline", () => {
    const result = parseAltText("inline");
    expect(result.inline).toBe(true);
  });

  it("parses crop data", () => {
    const result = parseAltText("crop:10,20,300,200,15,1.5");
    expect(result.crop).toEqual({
      x: 10, y: 20, w: 300, h: 200, rotate: 15, scale: 1.5,
    });
  });

  it("parses filter values", () => {
    const result = parseAltText("brightness:1.2 contrast:0.8 saturate:1.5 hue:90 blur:2 grayscale:0.5 sepia:0.3");
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

  it("parses CSS classes", () => {
    const result = parseAltText("lie-small lie-center my-custom");
    expect(result.classes).toEqual(["lie-small", "lie-center", "my-custom"]);
  });

  it("parses combined parameters", () => {
    const result = parseAltText("400x300 rotate:90 flipH lie-shadow inline brightness:1.1");
    expect(result.width).toBe(400);
    expect(result.height).toBe(300);
    expect(result.rotate).toBe(90);
    expect(result.flipH).toBe(true);
    expect(result.inline).toBe(true);
    expect(result.classes).toEqual(["lie-shadow"]);
    expect(result.filter?.brightness).toBe(1.1);
  });
});

describe("serializeTransform", () => {
  it("serializes empty transform", () => {
    const result = serializeTransform({ classes: [] });
    expect(result).toBe("");
  });

  it("serializes width only", () => {
    const result = serializeTransform({ width: 300, classes: [] });
    expect(result).toBe("300");
  });

  it("serializes width x height", () => {
    const result = serializeTransform({ width: 300, height: 200, classes: [] });
    expect(result).toBe("300x200");
  });

  it("serializes rotation", () => {
    const result = serializeTransform({ rotate: 45, classes: [] });
    expect(result).toBe("rotate:45");
  });

  it("serializes flip", () => {
    const result = serializeTransform({ flipH: true, flipV: true, classes: [] });
    expect(result).toBe("flipH flipV");
  });

  it("serializes crop", () => {
    const result = serializeTransform({
      crop: { x: 10, y: 20, w: 300, h: 200, rotate: 15, scale: 1.5 },
      classes: [],
    });
    expect(result).toBe("crop:10,20,300,200,15,1.5");
  });

  it("serializes filters (skips defaults)", () => {
    const result = serializeTransform({
      filter: { brightness: 1.2, contrast: 1, saturate: 1 },
      classes: [],
    });
    expect(result).toBe("brightness:1.2");
  });

  it("serializes classes", () => {
    const result = serializeTransform({ classes: ["lie-small", "custom"] });
    expect(result).toBe("lie-small custom");
  });

  it("serializes combined", () => {
    const result = serializeTransform({
      width: 400,
      rotate: 90,
      flipH: true,
      inline: true,
      classes: ["lie-center"],
    });
    expect(result).toBe("400 rotate:90 flipH inline lie-center");
  });
});

describe("roundtrip", () => {
  it("parse then serialize preserves data", () => {
    const original = "400x300 rotate:45.5 flipH crop:10,20,280,180,15,1.2 brightness:1.1 lie-shadow";
    const parsed = parseAltText(original);
    const serialized = serializeTransform(parsed);
    const reparsed = parseAltText(serialized);

    expect(reparsed.width).toBe(parsed.width);
    expect(reparsed.height).toBe(parsed.height);
    expect(reparsed.rotate).toBe(parsed.rotate);
    expect(reparsed.flipH).toBe(parsed.flipH);
    expect(reparsed.crop).toEqual(parsed.crop);
    expect(reparsed.filter?.brightness).toBe(parsed.filter?.brightness);
    expect(reparsed.classes).toEqual(parsed.classes);
  });

  it("empty roundtrip", () => {
    const parsed = parseAltText("");
    const serialized = serializeTransform(parsed);
    expect(serialized).toBe("");
  });

  it("quantization rounds properly", () => {
    const transform: ImageTransform = {
      crop: { x: 10.7, y: 20.3, w: 300.9, h: 200.1, rotate: 15.15, scale: 1.2345 },
      classes: [],
    };
    const serialized = serializeTransform(transform);
    const reparsed = parseAltText(serialized);
    expect(reparsed.crop?.x).toBe(11);
    expect(reparsed.crop?.y).toBe(20);
    expect(reparsed.crop?.w).toBe(301);
    expect(reparsed.crop?.h).toBe(200);
    expect(reparsed.crop?.rotate).toBe(15.2);
    expect(reparsed.crop?.scale).toBe(1.235);
  });
});
