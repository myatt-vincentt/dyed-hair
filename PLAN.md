# Plan — Dyed Hair

Recolour the user's hair live with ten dye looks, controlled from a floating radial
glassmorphism HUD.

## Decisions (from the creator)

- Styles: solid + ombré, multi-colour (tri-tone, split, rainbow), sci-fi (holographic, neon,
  galaxy, glitch), highlights.
- HUD: one radial glass bubble that fans out into rings (not a bottom dock or side panel).
- Look: "real dye": keep the hair's strand detail, not flat cartoon colour.
- Extras: hold to compare with natural hair, shuffle, animated sci-fi / multi-colour looks.

## How it works

- `src/dye/HairDye.tsx`: `useHairMask` (MediaPipe Hair Segmenter, `medium` quality) gives a
  `bg` / `hair` class mask in feed space. Its GPU copy (`useSemanticMaskTexture`) is switched to
  linear filtering, so `r × 255` reads as fractional hair coverage. One full-screen quad just
  above the camera picture samples that mask (a ring of taps for soft edges, grown slightly so
  the outer strands are dyed) and the camera:
  - Shading: each pixel's brightness against its neighbourhood, relative to that
    neighbourhood, scales the dye colour. Dark hair keeps its strands, and bright strands add
    a sheen. Bright pixels on the soft edge (skin or background) are skipped, so there's no
    halo.
  - Each style is a branch of the shader. Neon also samples coverage just inside (for the rim)
    and just outside (for the halo) the edge.
  - Compare and the first mask fade the layer in and out.
- `src/dye/bounds.ts` (pure): the hair's box from the CPU mask (3rd–97th percentiles per axis,
  eased over time). Gradients run root → tip down the box, split dye splits at its middle, and
  patterns use box-relative pixels so they ride along with the head.
- `src/dye/looks.ts` (pure): styles (slots, slot names, starting colours), the 16-shade
  palette, strengths, per-style colour memory, shuffle, and CSS previews for the HUD.
- `src/dye/Hud.tsx`: drei `Html` over the scene. Outer ring: styles, or the palette while a
  colour slot is picked. Inner ring: compare (hold), slots, strength, shuffle. Plus a status
  pill (loading / show your hair / first-time hint) and a toast naming each pick.
- `src/dye/state.ts`: a tiny `useSyncExternalStore` store for the look and compare, plus the
  hair status the layer reports to the HUD.
- Tests: `looks.test.ts`, `bounds.test.ts`.
