// The radial glass HUD, as HTML over the scene.
//
// One floating frosted bubble at the bottom shows the current look. Tap it
// and two rings fan out above it:
//   outer  the ten styles (each previewed with its own colours)
//   inner  hold-to-compare · the style's colour slots · strength · shuffle
// Tap a colour slot and the outer ring turns into the dye palette for that
// slot; tap the slot again (or the ✓ bubble) to go back to the styles.
// Top: a status pill (loading / show your hair / first-time hint) and a short
// toast naming the style or colour you just picked.
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Html } from "@react-three/drei";

import { DYE, HUD } from "./config";
import {
  currentColors,
  nextStrength,
  PALETTE,
  setColor,
  setStyle,
  shuffleLook,
  STRENGTHS,
  STYLES,
  styleOf,
  swatchCss,
} from "./looks";
import {
  dye,
  hairState,
  setCompare,
  setLook,
  useCompare,
  useLook,
} from "./state";

const CSS = `
.dh-root { position: absolute; inset: 0; pointer-events: none;
  font-family: "Poppins", "Space Grotesk", system-ui, sans-serif; color: #fff;
  -webkit-tap-highlight-color: transparent; user-select: none; -webkit-user-select: none; }
.dh-glass {
  background: linear-gradient(140deg, rgba(255,255,255,0.32), rgba(255,255,255,0.07));
  backdrop-filter: blur(16px) saturate(170%);
  -webkit-backdrop-filter: blur(16px) saturate(170%);
  border: 1px solid rgba(255,255,255,0.5);
  box-shadow: 0 10px 28px rgba(16, 4, 40, 0.3),
    inset 0 1px 1px rgba(255,255,255,0.75),
    inset 0 -8px 14px rgba(255,255,255,0.08);
}
.dh-pill { position: absolute; left: 50%; top: 16px; transform: translate(-50%, 0);
  display: flex; align-items: center; gap: 8px; padding: 9px 16px; border-radius: 999px;
  font-size: 14px; font-weight: 600; white-space: nowrap; letter-spacing: 0.01em;
  text-shadow: 0 1px 2px rgba(0,0,0,0.35); transition: opacity .35s, transform .35s; }
.dh-pill.off { opacity: 0; transform: translate(-50%, -10px); }
.dh-toast { position: absolute; left: 50%; top: 64px; transform: translate(-50%, 0) scale(1);
  padding: 7px 14px; border-radius: 14px; font-size: 13px; font-weight: 600;
  text-shadow: 0 1px 2px rgba(0,0,0,0.35); transition: opacity .3s, transform .3s; }
.dh-toast.off { opacity: 0; transform: translate(-50%, 0) scale(0.9); }
.dh-anchor { position: absolute; left: 50%; width: 0; height: 0; }
.dh-item { position: absolute; left: 0; top: 0; border-radius: 50%; padding: 0;
  display: grid; place-items: center; cursor: pointer; pointer-events: auto; outline: none;
  transition: transform .5s cubic-bezier(.2,1.45,.4,1), opacity .3s, box-shadow .25s;
  touch-action: manipulation; color: #fff; }
.dh-item.closed { opacity: 0; pointer-events: none; }
.dh-item .dh-fill { position: absolute; inset: 5px; border-radius: 50%;
  box-shadow: inset 0 2px 5px rgba(255,255,255,0.45), inset 0 -3px 6px rgba(0,0,0,0.25); }
.dh-item.active { box-shadow: 0 0 0 2px #fff, 0 0 18px 4px rgba(255,255,255,0.55),
  0 10px 28px rgba(16,4,40,0.3); }
.dh-item:active { filter: brightness(1.15); }
.dh-tag { position: absolute; top: 100%; margin-top: 3px; font-size: 9.5px; font-weight: 600;
  white-space: nowrap; text-shadow: 0 1px 2px rgba(0,0,0,0.6); opacity: 0.95; }
.dh-float { position: absolute; left: 0; top: 0; animation: dh-float 3.2s ease-in-out infinite; }
.dh-float.open { animation-play-state: paused; }
@keyframes dh-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
.dh-main { position: absolute; border-radius: 50%; cursor: pointer; pointer-events: auto;
  display: grid; place-items: center; padding: 0; transition: transform .3s; outline: none;
  touch-action: manipulation; }
.dh-main:active { transform: translate(-50%, -50%) scale(0.92) !important; }
.dh-main .dh-fill { position: absolute; inset: 7px; border-radius: 50%;
  box-shadow: inset 0 3px 8px rgba(255,255,255,0.5), inset 0 -4px 9px rgba(0,0,0,0.3); }
.dh-main .dh-mark { position: relative; font-size: 22px; font-weight: 700;
  text-shadow: 0 1px 4px rgba(0,0,0,0.55); }
.dh-halo { position: absolute; border-radius: 50%; pointer-events: none;
  background: radial-gradient(circle, rgba(255,255,255,0.18), rgba(255,255,255,0) 70%);
  transition: opacity .4s, transform .5s cubic-bezier(.2,1.2,.4,1); }
`;

/** Angles (degrees) for `n` items spread over an arc centred on straight up. */
const arcAngles = (n: number, from: number, to: number): number[] => {
  if (n <= 1) return [90];
  return Array.from(
    { length: n },
    (_, i) => from + ((to - from) * i) / (n - 1),
  );
};

/** Inner ring: ~44° apart, never wider than a half circle. */
const innerAngles = (n: number) => {
  const span = Math.min(180, (n - 1) * 44);
  return arcAngles(n, 90 + span / 2, 90 - span / 2);
};

const place = (
  angle: number,
  radius: number,
  size: number,
  open: boolean,
  order: number,
): CSSProperties => {
  const a = (angle * Math.PI) / 180;
  const x = open ? Math.cos(a) * radius : 0;
  const y = open ? -Math.sin(a) * radius : 0;
  return {
    width: size,
    height: size,
    transform: `translate(${x - size / 2}px, ${y - size / 2}px) scale(${open ? 1 : 0.2})`,
    transitionDelay: open ? `${order * 16}ms` : "0ms",
  };
};

const Icon = ({ children }: { children: ReactNode }) => (
  <svg
    viewBox="0 0 24 24"
    width={20}
    height={20}
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{
      position: "relative",
      filter: "drop-shadow(0 1px 2px rgba(0,0,0,.45))",
    }}
    aria-hidden="true"
  >
    {children}
  </svg>
);

type Status = { icon: string; text: string } | null;

const statusNow = (opened: boolean): Status => {
  if (hairState.status === "error")
    return { icon: "⚠️", text: "Hair model couldn't load — try reloading" };
  if (hairState.status === "loading")
    return { icon: "✨", text: "Getting the dye ready…" };
  if (hairState.missing > DYE.missingHint)
    return { icon: "💇", text: "Show your hair to the camera" };
  if (!opened) return { icon: "🫧", text: "Tap the bubble to dye your hair" };
  return null;
};

export const Hud = () => {
  const look = useLook();
  const comparing = useCompare();
  const [open, setOpen] = useState(false);
  const [slot, setSlot] = useState<number | null>(null);
  const [opened, setOpened] = useState(false);
  const [status, setStatus] = useState<Status>(() => statusNow(false));
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef(0);

  const style = styleOf(look.style);
  const colors = currentColors(look);

  useEffect(() => {
    const id = window.setInterval(() => {
      const next = statusNow(opened);
      setStatus((s) => (s?.text === next?.text ? s : next));
    }, 250);
    return () => window.clearInterval(id);
  }, [opened]);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const say = (text: string) => {
    setToast(text);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 1400);
  };

  const toggleMain = () => {
    if (slot !== null) {
      setSlot(null);
      return;
    }
    setOpen((o) => !o);
    setOpened(true);
  };

  const pickStyle = (id: (typeof STYLES)[number]["id"]) => {
    setLook(setStyle(dye.look, id));
    say(styleOf(id).name);
  };

  const pickSwatch = (hex: string, name: string) => {
    if (slot === null) return;
    setLook(setColor(dye.look, slot, hex));
    say(`${style.slotNames[slot]} · ${name}`);
  };

  const shuffle = () => {
    setSlot(null);
    const next = shuffleLook(dye.look, Math.random);
    setLook(next);
    say(`🎲 ${styleOf(next.style).name}`);
  };

  const cycleStrength = () => {
    const next = nextStrength(dye.look);
    setLook(next);
    say(`${STRENGTHS[next.strength].name} dye`);
  };

  const hold = (on: boolean) => () => setCompare(on);

  const showRingOpen = open && !comparing;
  const outerAngles = arcAngles(
    slot === null ? STYLES.length : PALETTE.length,
    HUD.arcFrom,
    HUD.arcTo,
  );
  const tools = 3 + style.slots;
  const toolAngles = innerAngles(tools);
  const B = HUD.bubble;

  return (
    <Html fullscreen zIndexRange={[30, 0]} style={{ pointerEvents: "none" }}>
      <style>{CSS}</style>
      <div className="dh-root">
        <div
          className={`dh-pill dh-glass ${status ? "" : "off"}`}
          aria-live="polite"
        >
          <span>{status?.icon}</span>
          <span>{status?.text}</span>
        </div>
        <div
          className={`dh-toast dh-glass ${toast || comparing ? "" : "off"}`}
          aria-live="polite"
        >
          {comparing ? "Natural hair" : toast}
        </div>

        <div className="dh-anchor" style={{ bottom: HUD.bottom }}>
          <div
            className="dh-halo"
            style={{
              width: HUD.outerRadius * 2 + 70,
              height: HUD.outerRadius * 2 + 70,
              transform: `translate(-50%, -50%) scale(${showRingOpen ? 1 : 0.3})`,
              opacity: showRingOpen ? 1 : 0,
            }}
          />

          {/* Outer ring: styles, or the palette while a colour slot is picked. */}
          {slot === null
            ? STYLES.map((s, i) => (
                <button
                  type="button"
                  key={s.id}
                  aria-label={s.name}
                  title={s.name}
                  className={`dh-item dh-glass ${showRingOpen ? "" : "closed"} ${
                    s.id === look.style ? "active" : ""
                  }`}
                  style={place(
                    outerAngles[i],
                    HUD.outerRadius,
                    HUD.styleSize,
                    showRingOpen,
                    i,
                  )}
                  onClick={() => pickStyle(s.id)}
                >
                  <span
                    className="dh-fill"
                    style={{ background: swatchCss(s.id, look.colors[s.id]) }}
                  />
                </button>
              ))
            : PALETTE.map((p, i) => (
                <button
                  type="button"
                  key={p.hex}
                  aria-label={p.name}
                  title={p.name}
                  className={`dh-item dh-glass ${showRingOpen ? "" : "closed"} ${
                    colors[slot] === p.hex ? "active" : ""
                  }`}
                  style={place(
                    outerAngles[i],
                    HUD.outerRadius,
                    HUD.swatchSize + 8,
                    showRingOpen,
                    i,
                  )}
                  onClick={() => pickSwatch(p.hex, p.name)}
                >
                  <span
                    className="dh-fill"
                    style={{ background: p.hex, inset: 4 }}
                  />
                </button>
              ))}

          {/* Inner ring: compare · colour slots · strength · shuffle. */}
          <button
            type="button"
            aria-label="Hold to compare with your natural hair"
            title="Hold to compare"
            className={`dh-item dh-glass ${open ? "" : "closed"} ${comparing ? "active" : ""}`}
            style={place(toolAngles[0], HUD.innerRadius, HUD.toolSize, open, 0)}
            onPointerDown={hold(true)}
            onPointerUp={hold(false)}
            onPointerLeave={hold(false)}
            onPointerCancel={hold(false)}
            onContextMenu={(e) => e.preventDefault()}
          >
            <Icon>
              <circle cx="12" cy="12" r="8" />
              <path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor" />
            </Icon>
          </button>
          {style.slotNames.map((name, i) => (
            <button
              type="button"
              key={`${style.id}-${name}`}
              aria-label={`${name} colour`}
              title={`${name} colour`}
              className={`dh-item dh-glass ${showRingOpen ? "" : "closed"} ${
                slot === i ? "active" : ""
              }`}
              style={place(
                toolAngles[i + 1],
                HUD.innerRadius,
                HUD.toolSize,
                showRingOpen,
                i + 1,
              )}
              onClick={() => setSlot((s) => (s === i ? null : i))}
            >
              <span
                className="dh-fill"
                style={{ background: colors[i], inset: 6 }}
              />
              <span className="dh-tag">{name}</span>
            </button>
          ))}
          <button
            type="button"
            aria-label={`Dye strength: ${STRENGTHS[look.strength].name}`}
            title="Dye strength"
            className={`dh-item dh-glass ${showRingOpen ? "" : "closed"}`}
            style={place(
              toolAngles[tools - 2],
              HUD.innerRadius,
              HUD.toolSize,
              showRingOpen,
              tools - 2,
            )}
            onClick={cycleStrength}
          >
            <Icon>
              {STRENGTHS.map((s, i) => (
                <rect
                  key={s.name}
                  x={5 + i * 5.5}
                  y={14 - i * 4}
                  width={3.6}
                  height={5 + i * 4}
                  rx={1.2}
                  fill={i <= look.strength ? "currentColor" : "none"}
                />
              ))}
            </Icon>
          </button>
          <button
            type="button"
            aria-label="Shuffle a random look"
            title="Shuffle"
            className={`dh-item dh-glass ${showRingOpen ? "" : "closed"}`}
            style={place(
              toolAngles[tools - 1],
              HUD.innerRadius,
              HUD.toolSize,
              showRingOpen,
              tools - 1,
            )}
            onClick={shuffle}
          >
            <Icon>
              <rect x="4" y="4" width="16" height="16" rx="4" />
              <circle cx="9" cy="9" r="1.1" fill="currentColor" />
              <circle cx="15" cy="15" r="1.1" fill="currentColor" />
              <circle cx="15" cy="9" r="1.1" fill="currentColor" />
              <circle cx="9" cy="15" r="1.1" fill="currentColor" />
            </Icon>
          </button>

          {/* The bubble itself. */}
          <div className={`dh-float ${open ? "open" : ""}`}>
            <button
              type="button"
              aria-label={open ? "Close dye menu" : "Open dye menu"}
              aria-expanded={open}
              className="dh-main dh-glass"
              style={{
                width: B,
                height: B,
                transform: "translate(-50%, -50%)",
              }}
              onClick={toggleMain}
            >
              <span
                className="dh-fill"
                style={{ background: swatchCss(style.id, colors) }}
              />
              <span className="dh-mark">
                {slot !== null ? "✓" : open ? "✕" : ""}
              </span>
            </button>
          </div>
        </div>
      </div>
    </Html>
  );
};
