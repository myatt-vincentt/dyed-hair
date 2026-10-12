// Tuning for the dye layer and the radial HUD.

export const DYE = {
  /** Hair segmenter resolution; "medium" keeps phones smooth. */
  quality: "medium" as "low" | "medium" | "high",
  /** Edge softening radius, in mask texels. */
  feather: 2.5,
  /** Below this share of the frame, the mask is treated as "no hair". */
  minCover: 0.004,
  /** How fast the hair box follows the head (per second). */
  boxEase: 6,
  /** How fast the dye fades in / out for compare (per second). */
  fade: 9,
  /** Seconds without hair before the HUD asks you to show it. */
  missingHint: 1.5,
};

export const HUD = {
  /** Main bubble diameter (px). */
  bubble: 68,
  /** Distance of the bubble's centre from the bottom edge (px). */
  bottom: 84,
  /** Outer ring (styles / palette) radius and item size (px). */
  outerRadius: 142,
  styleSize: 46,
  swatchSize: 30,
  /** Inner ring (colour slots and tools) radius and item size (px). */
  innerRadius: 86,
  toolSize: 40,
  /** Rings span this arc over the bubble, in degrees (left → right). */
  arcFrom: 190,
  arcTo: -10,
};
