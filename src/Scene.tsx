// Scene.tsx — Dyed Hair: recolour your hair live — solid, ombré, tri-tone,
// split, rainbow, highlights and sci-fi looks (holographic, neon, galaxy,
// glitch) — picked from a floating radial glass HUD. See PLAN.md.
import { lazy, Suspense } from "react";

import { ExperienceStatus } from "./dye/ExperienceStatus";
import { HairDye } from "./dye/HairDye";
import { Hud } from "./dye/Hud";

// Dev-only media switcher for previewing without a camera. Lazy and behind a
// constant esbuild folds to false in production. Two rules:
// `process.env.NODE_ENV`, not `import.meta.env.DEV` (vincentt-xr/v2-template#112);
// and write the check INSIDE the ternary — hoisted into a `const`, esbuild
// keeps the dead branch.
const DevMediaSwitcher =
  process.env.NODE_ENV !== "production"
    ? lazy(() => import("./DevMediaSwitcher"))
    : null;

export const Scene = () => (
  <>
    <ExperienceStatus />
    <HairDye />
    <Hud />
    {DevMediaSwitcher ? (
      <Suspense fallback={null}>
        <DevMediaSwitcher />
      </Suspense>
    ) : null}
  </>
);
