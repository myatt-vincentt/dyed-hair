// Where the hair is on screen, from the hair mask. Pure; see bounds.test.ts.
//
// Gradients run from the roots (top of the hair) to the tips (bottom), and the
// split dye splits at the hair's middle, so the shader needs the hair's box.
// A plain min/max would jump with every stray pixel, so the box is the 3rd to
// 97th percentile of the hair pixels on each axis, then eased over time.

/** The hair's box in screen UV (v up), plus how much of the frame is hair. */
export type HairBox = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Fraction of the frame that is hair (0–1). */
  cover: number;
};

/** Index of the first bin where the running total reaches `target`. */
const quantile = (bins: Uint32Array, target: number): number => {
  let sum = 0;
  for (let i = 0; i < bins.length; i++) {
    sum += bins[i];
    if (sum >= target) return i;
  }
  return bins.length - 1;
};

/**
 * Measure the hair box of a class-index mask (row 0 at the top, like the
 * SDK's feed-space masks). Samples every `stride`-th pixel; returns null when
 * there is too little hair to trust.
 */
export const measureHair = (
  indices: Uint8Array,
  width: number,
  height: number,
  hairIndex: number,
  stride = 3,
  tail = 0.03,
): HairBox | null => {
  const cols = new Uint32Array(width);
  const rows = new Uint32Array(height);
  let count = 0;
  let samples = 0;
  for (let y = 0; y < height; y += stride) {
    const row = y * width;
    for (let x = 0; x < width; x += stride) {
      samples++;
      if (indices[row + x] === hairIndex) {
        cols[x]++;
        rows[y]++;
        count++;
      }
    }
  }
  if (count < 12) return null;
  const lo = Math.max(1, count * tail);
  const hi = count * (1 - tail);
  const left = quantile(cols, lo);
  const right = quantile(cols, hi);
  const top = quantile(rows, lo);
  const bottom = quantile(rows, hi);
  return {
    x0: left / width,
    x1: (right + 1) / width,
    // Rows count down from the top; screen v counts up from the bottom.
    y0: 1 - (bottom + 1) / height,
    y1: 1 - top / height,
    cover: count / samples,
  };
};

/** Ease `box` toward `target` (rate per second), in place. */
export const easeBox = (
  box: HairBox,
  target: HairBox,
  dt: number,
  rate = 6,
): HairBox => {
  const k = 1 - Math.exp(-rate * dt);
  box.x0 += (target.x0 - box.x0) * k;
  box.x1 += (target.x1 - box.x1) * k;
  box.y0 += (target.y0 - box.y0) * k;
  box.y1 += (target.y1 - box.y1) * k;
  box.cover += (target.cover - box.cover) * k;
  return box;
};
