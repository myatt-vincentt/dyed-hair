// Shared state between the HUD (React DOM) and the dye layer (useFrame).
//
// The look is a tiny external store so the HUD re-renders on change; the dye
// layer just reads `dye.look` every frame. `hairState` goes the other way:
// the dye layer writes it, the HUD polls it for its status pill.
import { useSyncExternalStore } from "react";

import { createLook } from "./looks";
import type { Look } from "./looks";

const listeners = new Set<() => void>();

export const dye = {
  look: createLook(),
  /** Held by the compare button: show your natural hair. */
  compare: false,
};

export const setLook = (next: Look) => {
  dye.look = next;
  listeners.forEach((l) => l());
};

export const setCompare = (on: boolean) => {
  dye.compare = on;
  listeners.forEach((l) => l());
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export const useLook = () => useSyncExternalStore(subscribe, () => dye.look);
export const useCompare = () =>
  useSyncExternalStore(subscribe, () => dye.compare);

export const hairState = {
  status: "loading" as "loading" | "ready" | "error",
  /** Seconds since the mask last showed a usable amount of hair. */
  missing: 0,
};
