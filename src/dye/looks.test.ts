import { describe, expect, it } from "vitest";

import {
  createLook,
  currentColors,
  hexToRgb,
  nextStrength,
  PALETTE,
  setColor,
  setStyle,
  shuffleLook,
  STRENGTHS,
  STYLES,
  swatchCss,
} from "./looks";

const seeded = (seed: number) => {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
};

describe("looks", () => {
  it("gives every style its full slot count and a unique shader index", () => {
    const look = createLook();
    STYLES.forEach((s) => {
      expect(look.colors[s.id]).toHaveLength(s.slots);
      expect(s.slotNames).toHaveLength(s.slots);
    });
    expect(new Set(STYLES.map((s) => s.index)).size).toBe(STYLES.length);
  });

  it("starts every style on palette colours", () => {
    const hexes = PALETTE.map((p) => p.hex);
    STYLES.forEach((s) => s.colors.forEach((c) => expect(hexes).toContain(c)));
  });

  it("remembers colours per style", () => {
    let look = setStyle(createLook(), "split");
    look = setColor(look, 1, "#b6f03a");
    look = setStyle(look, "solid");
    look = setStyle(look, "split");
    expect(currentColors(look)[1]).toBe("#b6f03a");
  });

  it("ignores out-of-range slots", () => {
    const look = setStyle(createLook(), "rainbow");
    expect(setColor(look, 0, "#ffffff")).toBe(look);
  });

  it("cycles strength", () => {
    let look = createLook();
    const seen = new Set<number>();
    for (let i = 0; i < STRENGTHS.length; i++) {
      look = nextStrength(look);
      seen.add(look.strength);
    }
    expect(seen.size).toBe(STRENGTHS.length);
  });

  it("shuffles to another style with distinct colours", () => {
    const random = seeded(7);
    let look = createLook();
    for (let i = 0; i < 200; i++) {
      const next = shuffleLook(look, random);
      expect(next.style).not.toBe(look.style);
      const c = currentColors(next);
      expect(new Set(c).size).toBe(c.length);
      if (next.style !== "neon" && next.style !== "galaxy")
        expect(c).not.toContain("#24202a");
      look = next;
    }
  });

  it("reads hex colours", () => {
    expect(hexToRgb("#ff8000")).toEqual([1, 128 / 255, 0]);
  });

  it("previews every style", () => {
    const look = createLook();
    STYLES.forEach((s) =>
      expect(swatchCss(s.id, look.colors[s.id])).toBeTruthy(),
    );
  });
});
