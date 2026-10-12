// The dye looks: styles, the palette, and what each style starts with.
// Pure — no React, no three — so it is tested in looks.test.ts.
//
// A look is a style plus up to three colours. Each style remembers its own
// colours, so trying another style and coming back keeps what you picked.

export type StyleId =
  | "solid"
  | "ombre"
  | "tritone"
  | "split"
  | "rainbow"
  | "highlights"
  | "holo"
  | "neon"
  | "galaxy"
  | "glitch";

export type Style = {
  id: StyleId;
  name: string;
  /** Shader switch (see HairDye.tsx). */
  index: number;
  /** Colour slots shown in the HUD; rainbow has none. */
  slots: number;
  /** What each slot does, for the slot buttons' labels. */
  slotNames: readonly string[];
  /** Starting colours (palette hexes). */
  colors: readonly string[];
};

export const STYLES: readonly Style[] = [
  {
    id: "solid",
    name: "Solid",
    index: 0,
    slots: 1,
    slotNames: ["Colour"],
    colors: ["#ff3d9a"],
  },
  {
    id: "ombre",
    name: "Ombré",
    index: 1,
    slots: 2,
    slotNames: ["Roots", "Tips"],
    colors: ["#7b2ff7", "#f7a8c8"],
  },
  {
    id: "tritone",
    name: "Tri-tone",
    index: 2,
    slots: 3,
    slotNames: ["Roots", "Middle", "Tips"],
    colors: ["#b3122e", "#ff7a1a", "#f2c53d"],
  },
  {
    id: "split",
    name: "Split dye",
    index: 3,
    slots: 2,
    slotNames: ["Left", "Right"],
    colors: ["#1f6bff", "#ff3d9a"],
  },
  {
    id: "rainbow",
    name: "Rainbow",
    index: 4,
    slots: 0,
    slotNames: [],
    colors: [],
  },
  {
    id: "highlights",
    name: "Highlights",
    index: 5,
    slots: 2,
    slotNames: ["Base", "Streaks"],
    colors: ["#c4612b", "#d9a456"],
  },
  {
    id: "holo",
    name: "Holographic",
    index: 6,
    slots: 2,
    slotNames: ["Tint A", "Tint B"],
    colors: ["#b59cf0", "#8af0c0"],
  },
  {
    id: "neon",
    name: "Neon",
    index: 7,
    slots: 2,
    slotNames: ["Core", "Glow"],
    colors: ["#1f6bff", "#ff3d9a"],
  },
  {
    id: "galaxy",
    name: "Galaxy",
    index: 8,
    slots: 2,
    slotNames: ["Space", "Nebula"],
    colors: ["#7b2ff7", "#12b5a5"],
  },
  {
    id: "glitch",
    name: "Glitch",
    index: 9,
    slots: 2,
    slotNames: ["Colour A", "Colour B"],
    colors: ["#12b5a5", "#ff3d9a"],
  },
];

/** Dye shades for the colour picker, in ring order. */
export const PALETTE: readonly { hex: string; name: string }[] = [
  { hex: "#e8e4dc", name: "Platinum" },
  { hex: "#d9a456", name: "Honey blonde" },
  { hex: "#f2c53d", name: "Gold" },
  { hex: "#ff7a1a", name: "Sunset orange" },
  { hex: "#c4612b", name: "Copper" },
  { hex: "#b3122e", name: "Cherry red" },
  { hex: "#ff3d9a", name: "Hot pink" },
  { hex: "#f7a8c8", name: "Pastel pink" },
  { hex: "#b59cf0", name: "Lilac" },
  { hex: "#7b2ff7", name: "Violet" },
  { hex: "#1f6bff", name: "Electric blue" },
  { hex: "#9fb6d6", name: "Silver blue" },
  { hex: "#12b5a5", name: "Teal" },
  { hex: "#8af0c0", name: "Mint" },
  { hex: "#b6f03a", name: "Lime" },
  { hex: "#24202a", name: "Jet black" },
];

/** Dye strength steps the HUD cycles through: label and shader amount. */
export const STRENGTHS: readonly { name: string; amount: number }[] = [
  { name: "Soft", amount: 0.55 },
  { name: "Rich", amount: 0.8 },
  { name: "Bold", amount: 1 },
];

export type Look = {
  style: StyleId;
  /** Colours per style; every style always has its full slot count. */
  colors: Record<StyleId, string[]>;
  strength: number;
};

export const styleOf = (id: StyleId): Style =>
  STYLES.find((s) => s.id === id) ?? STYLES[0];

export const createLook = (): Look => ({
  style: "ombre",
  colors: Object.fromEntries(
    STYLES.map((s) => [s.id, [...s.colors]]),
  ) as Record<StyleId, string[]>,
  strength: 1,
});

export const currentColors = (look: Look): string[] => look.colors[look.style];

export const setStyle = (look: Look, style: StyleId): Look => ({
  ...look,
  style,
});

/** Set one colour slot of the current style (out-of-range slots are ignored). */
export const setColor = (look: Look, slot: number, hex: string): Look => {
  const colors = [...currentColors(look)];
  if (slot < 0 || slot >= colors.length) return look;
  colors[slot] = hex;
  return { ...look, colors: { ...look.colors, [look.style]: colors } };
};

export const nextStrength = (look: Look): Look => ({
  ...look,
  strength: (look.strength + 1) % STRENGTHS.length,
});

/**
 * A random style (never the current one) with random, distinct palette
 * colours. Jet black only lands as a neon or galaxy base, where it reads.
 */
export const shuffleLook = (look: Look, random: () => number): Look => {
  const others = STYLES.filter((s) => s.id !== look.style);
  const style = others[Math.floor(random() * others.length)];
  const pool = PALETTE.map((p) => p.hex).filter(
    (hex) => hex !== "#24202a" || style.id === "neon" || style.id === "galaxy",
  );
  const colors: string[] = [];
  for (let i = 0; i < style.slots; i++) {
    const left = pool.filter((hex) => !colors.includes(hex));
    colors.push(left[Math.floor(random() * left.length)]);
  }
  return {
    ...look,
    style: style.id,
    colors: { ...look.colors, [style.id]: colors },
  };
};

/** "#rrggbb" → [r, g, b] in 0–1 (sRGB, as written). */
export const hexToRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

/** A CSS background that previews a style with the given colours. */
export const swatchCss = (id: StyleId, c: readonly string[]): string => {
  const [a = "#888", b = a, d = b] = c;
  switch (id) {
    case "solid":
      return a;
    case "ombre":
      return `linear-gradient(180deg, ${a} 15%, ${b} 85%)`;
    case "tritone":
      return `linear-gradient(180deg, ${a} 10%, ${b} 50%, ${d} 90%)`;
    case "split":
      return `linear-gradient(90deg, ${a} 50%, ${b} 50%)`;
    case "rainbow":
      return "conic-gradient(from 200deg, #ff3b3b, #ffb11f, #f5f23a, #3be37a, #2fb6ff, #8a5cff, #ff4fd2, #ff3b3b)";
    case "highlights":
      return `repeating-linear-gradient(100deg, ${a} 0 5px, ${b} 5px 8px)`;
    case "holo":
      return `linear-gradient(135deg, ${a}, #ffffff 35%, ${b} 55%, #ffd1f5 75%, ${a})`;
    case "neon":
      return `radial-gradient(circle, ${a} 0 38%, ${b} 62%, #0b0614 100%)`;
    case "galaxy":
      return `radial-gradient(circle at 70% 30%, #fff 0 1.5px, transparent 2.5px), radial-gradient(circle at 30% 65%, #fff 0 1px, transparent 2px), radial-gradient(ellipse at 40% 40%, ${b}, ${a} 55%, #07031a 100%)`;
    case "glitch":
      return `repeating-linear-gradient(180deg, ${a} 0 4px, #0b0614 4px 6px, ${b} 6px 10px)`;
    default:
      return a;
  }
};
