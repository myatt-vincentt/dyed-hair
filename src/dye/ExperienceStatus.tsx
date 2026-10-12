// Tells whoever is hosting the page when the experience is usable.
//
//   <html data-experience="loading | ready | error">   — for CSS, tests, crawlers
//   window "experience:status" CustomEvent             — same document
//   parent.postMessage({ type: "experience:status", experience, status, reason? })
//                                                      — when embedded in an iframe
//
// "ready" = the camera is running (the hair model loads alongside; the dye
// appears once it has a first mask).
// The message carries no user data, so it is posted to any origin ("*"): the
// embedder's origin isn't known in advance.
import { useEffect } from "react";
import { useXRError, useXRReady } from "@vincentt-xr/sdk/low-level";

import { isFramed } from "../framed";

export const EXPERIENCE_ID = "dyed-hair";

export type ExperienceStatusValue = "loading" | "ready" | "error";

export const ExperienceStatus = () => {
  const cameraReady = useXRReady();
  const cameraError = useXRError();

  let status: ExperienceStatusValue = "loading";
  if (cameraError) status = "error";
  else if (cameraReady) status = "ready";
  const reason = cameraError?.reason;

  useEffect(() => {
    document.documentElement.dataset.experience = status;
    const detail = {
      type: "experience:status",
      experience: EXPERIENCE_ID,
      status,
      reason,
    };
    window.dispatchEvent(new CustomEvent("experience:status", { detail }));
    if (isFramed()) {
      try {
        window.parent.postMessage(detail, "*");
      } catch {
        // A detached or sandboxed parent: nothing to tell.
      }
    }
  }, [status, reason]);

  return null;
};
