import { describe, expect, it } from "vitest";

import { easeBox, measureHair } from "./bounds";

/** A w×h mask with hair (1) in the given pixel rectangle. */
const maskWith = (
  w: number,
  h: number,
  rect: [number, number, number, number],
) => {
  const m = new Uint8Array(w * h);
  const [x0, y0, x1, y1] = rect;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) m[y * w + x] = 1;
  return m;
};

describe("measureHair", () => {
  it("finds the hair box in screen UV with v up", () => {
    // Hair in the top-left quarter: columns 0–49, rows 0–49 of 100×100.
    const box = measureHair(
      maskWith(100, 100, [0, 0, 50, 50]),
      100,
      100,
      1,
      1,
      0,
    );
    expect(box).not.toBeNull();
    expect(box!.x0).toBeCloseTo(0, 2);
    expect(box!.x1).toBeCloseTo(0.5, 2);
    expect(box!.y1).toBeCloseTo(1, 2);
    expect(box!.y0).toBeCloseTo(0.5, 2);
    expect(box!.cover).toBeCloseTo(0.25, 2);
  });

  it("ignores a few stray pixels", () => {
    const m = maskWith(120, 120, [30, 30, 90, 90]);
    m[0] = 1;
    m[119 * 120 + 119] = 1;
    const box = measureHair(m, 120, 120, 1, 3);
    expect(box!.x0).toBeGreaterThan(0.2);
    expect(box!.x1).toBeLessThan(0.8);
  });

  it("returns null without hair", () => {
    expect(measureHair(new Uint8Array(64 * 64), 64, 64, 1)).toBeNull();
  });
});

describe("easeBox", () => {
  it("moves toward the target and settles", () => {
    const box = { x0: 0, y0: 0, x1: 1, y1: 1, cover: 0 };
    const target = { x0: 0.2, y0: 0.3, x1: 0.6, y1: 0.9, cover: 0.1 };
    easeBox(box, target, 1 / 60);
    expect(box.x0).toBeGreaterThan(0);
    expect(box.x0).toBeLessThan(0.2);
    for (let i = 0; i < 300; i++) easeBox(box, target, 1 / 60);
    expect(box.x0).toBeCloseTo(0.2, 3);
    expect(box.y1).toBeCloseTo(0.9, 3);
  });
});
