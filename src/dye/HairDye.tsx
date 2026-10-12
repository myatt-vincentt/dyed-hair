// The dye itself: one full-screen layer just above the camera picture that
// recolours only the hair.
//
// Where the hair is comes from the SDK's hair segmenter (useHairMask), sampled
// with a few taps for soft edges. The colour is "real dye": the camera's own
// strand detail (each pixel's brightness against its neighbourhood) shades the
// dye colour, so strands, shine and shadow survive whatever colour you pick.
// Gradients run root → tip across the hair's box (bounds.ts), and each style
// is a branch of the fragment shader below.
import { useEffect, useMemo, useRef } from "react";
import {
  LinearFilter,
  Matrix3,
  ShaderMaterial,
  SRGBColorSpace,
  Vector2,
  Vector3,
  Vector4,
} from "three";
import type { DataTexture, Texture } from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useHairMask } from "@vincentt-xr/sdk/face-effects";
import {
  computeMaskUvTransform,
  useSemanticMaskTexture,
  useXRCameraTexture,
} from "@vincentt-xr/sdk/low-level";

import { easeBox, measureHair } from "./bounds";
import type { HairBox } from "./bounds";
import { DYE } from "./config";
import { currentColors, hexToRgb, STRENGTHS, styleOf } from "./looks";
import { dye, hairState } from "./state";

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy * 2.0, 0.0, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  uniform sampler2D uCamera;
  uniform float uCameraLinear;
  uniform sampler2D uMask;
  uniform mat3 uMaskMat;
  uniform vec2 uMaskTexel;
  uniform float uHairIndex;
  uniform float uFeather;
  uniform float uStyle;
  uniform vec3 uC0;
  uniform vec3 uC1;
  uniform vec3 uC2;
  uniform float uStrength;
  uniform float uAmount;
  uniform float uTime;
  uniform vec4 uBox;
  uniform vec2 uRes;
  varying vec2 vUv;

  vec3 toSrgb(vec3 c) {
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055,
               step(0.0031308, c));
  }
  vec3 fromSrgb(vec3 c) {
    return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)),
               step(0.04045, c));
  }
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
               u.y);
  }
  float fbm(vec2 p) {
    float s = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      s += a * noise(p);
      p = p * 2.03 + 7.1;
      a *= 0.5;
    }
    return s;
  }
  vec3 hsv(float h, float s, float v) {
    vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0,
                   0.0, 1.0);
    return v * mix(vec3(1.0), k, s);
  }

  // How much of this pixel is hair (the mask is linearly filtered, so class
  // edges come out fractional).
  float cover(vec2 uv) {
    vec2 m = (uMaskMat * vec3(uv, 1.0)).xy;
    return clamp(1.0 - abs(texture2D(uMask, m).r * 255.0 - uHairIndex),
                 0.0, 1.0);
  }
  // Soft hair coverage: a ring of eight taps at radius r (mask texels).
  float hairAt(vec2 uv, float r) {
    float s = cover(uv) * 2.0;
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.7853982;
      s += cover(uv + vec2(cos(a), sin(a)) * uMaskTexel * r);
    }
    return s / 10.0;
  }
  vec3 camera(vec2 uv) {
    vec3 c = texture2D(uCamera, uv).rgb;
    return uCameraLinear > 0.5 ? toSrgb(c) : c;
  }
  float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

  void main() {
    vec2 uv = vUv;
    vec2 px = 1.0 / uRes;

    // Glitch: whole scan lines of hair jump sideways now and then.
    if (uStyle > 8.5) {
      float line = floor(uv.y * 70.0);
      float tick = floor(uTime * 12.0);
      float j = hash(vec2(line, tick));
      uv.x += j > 0.93 ? (hash(vec2(tick, line)) - 0.5) * 0.025 : 0.0;
    }

    // A lowish threshold: the mask sits a little inside the hair, so grow it a
    // touch to dye the outermost strands too.
    float raw = hairAt(uv, uFeather);
    float hair = smoothstep(0.08, 0.65, raw);
    // Neon also looks just inside (rim) and just outside (halo) the edge.
    bool neon = uStyle > 6.5 && uStyle < 7.5;
    float inner = neon ? hairAt(uv, uFeather * 2.5) : hair;
    float outer = neon ? hairAt(uv, uFeather * 6.0) : hair;
    if (hair < 0.002 && outer < 0.002) discard;

    // Root (0) → tip (1) down the hair's box; left (0) → right (1) across it.
    float t = clamp((uBox.w - uv.y) / max(uBox.w - uBox.y, 0.05), 0.0, 1.0);
    float hx = clamp((uv.x - uBox.x) / max(uBox.z - uBox.x, 0.05), 0.0, 1.0);
    // Pixels relative to the hair box, so patterns ride along with the head.
    vec2 q = (uv - uBox.xy) * uRes;

    // Real-dye shading: brightness against the neighbourhood keeps strands.
    vec3 cam = camera(uv);
    float l = luma(cam);
    float lm = 0.0;
    for (int i = 0; i < 6; i++) {
      float a = float(i) * 1.0471976 + 0.5;
      lm += luma(camera(uv + vec2(cos(a), sin(a)) * px * 9.0));
    }
    lm /= 6.0;
    // Detail relative to the local brightness, so dark hair keeps its strands.
    float detail = (l - lm) / (lm + 0.1);
    float shade = clamp(0.6 + (lm - 0.3) * 0.5 + detail * 0.5
                        + (uStrength - 0.8) * 0.35, 0.08, 1.35);
    float sheen = smoothstep(0.05, 0.4, detail);
    // On the soft edge, skip bright pixels: that's skin or background showing
    // through, and dyeing it draws a halo.
    hair *= 1.0 - (1.0 - smoothstep(0.55, 0.95, raw)) * smoothstep(0.3, 0.6, l);

    vec3 col;
    vec3 glow = vec3(0.0);
    float glowA = 0.0;
    float wave = 0.035 * sin(q.x * 0.03 + uTime * 1.3);

    if (uStyle < 0.5) {
      col = uC0 * shade;
    } else if (uStyle < 1.5) {
      col = mix(uC0, uC1, smoothstep(0.2, 0.85, t + wave)) * shade;
    } else if (uStyle < 2.5) {
      float s = t + wave;
      col = (s < 0.5 ? mix(uC0, uC1, smoothstep(0.12, 0.5, s))
                     : mix(uC1, uC2, smoothstep(0.5, 0.88, s))) * shade;
    } else if (uStyle < 3.5) {
      col = mix(uC0, uC1, smoothstep(-0.012, 0.012, hx - 0.5)) * shade;
    } else if (uStyle < 4.5) {
      col = hsv(fract(t * 0.85 + hx * 0.15 - uTime * 0.06), 0.78, 1.0) * shade;
    } else if (uStyle < 5.5) {
      // Strand-shaped streaks: noise stretched along the hair, more at tips.
      float n = 0.65 * noise(vec2(q.x / 15.0, q.y / 170.0))
              + 0.35 * noise(vec2(q.x / 5.0, q.y / 70.0));
      float streak = smoothstep(0.46, 0.62, n + sheen * 0.15)
                   * mix(0.5, 1.0, t);
      // Lightened streaks: brighter than the base, like real highlights.
      col = mix(uC0 * (shade * 0.85 + 0.15), uC1 * (shade * 0.6 + 0.55), streak);
    } else if (uStyle < 6.5) {
      // Holographic: a spectrum that slides with brightness and time.
      vec3 base = mix(uC0, uC1, t);
      float h = fract(l * 1.8 + (q.x + q.y) / 700.0 + uTime * 0.1);
      col = mix(base, hsv(h, 0.5, 1.0), 0.5) * (shade * 0.55 + 0.5);
      float glint = step(0.8, noise(q / 3.0 + uTime * 2.0)) * sheen;
      col += vec3(0.6) * glint;
    } else if (uStyle < 7.5) {
      // Neon: dark core, glowing rim, light pulses running down the strands,
      // and a halo just outside the hair.
      float rim = clamp(hair * (1.0 - inner) * 2.5, 0.0, 1.0);
      float pulse = pow(0.5 + 0.5 * sin(t * 16.0 - uTime * 4.0 + hx * 4.0), 8.0);
      col = uC0 * (0.35 + 0.45 * shade) + uC1 * (rim * 1.2 + pulse * 0.6 + sheen * 0.35);
      float beat = 0.85 + 0.15 * sin(uTime * 3.0);
      glowA = clamp(outer * (1.0 - hair) * 1.2, 0.0, 1.0) * beat;
      glow = uC1 * 1.15;
    } else if (uStyle < 8.5) {
      // Galaxy: nebula clouds over deep space, with twinkling stars.
      float neb = fbm(q / 140.0 + vec2(uTime * 0.03, uTime * 0.01));
      col = mix(uC0 * 0.22, uC0, smoothstep(0.25, 0.6, neb));
      col = mix(col, uC1, smoothstep(0.5, 0.85, neb));
      col *= shade * 0.7 + 0.45;
      vec2 cell = floor(q / 10.0);
      vec2 f = fract(q / 10.0) - 0.5
             - (vec2(hash(cell + 3.1), hash(cell + 8.7)) - 0.5) * 0.6;
      float star = step(0.9, hash(cell))
                 * smoothstep(0.3, 0.0, length(f))
                 * (0.55 + 0.45 * sin(uTime * 3.0 + hash(cell) * 60.0));
      col += vec3(star * 1.3);
    } else {
      // Glitch: colour blocks that reshuffle, scan lines, RGB split.
      float blk = floor(uv.y * 26.0 + hash(vec2(floor(uTime * 5.0), 1.0)) * 3.0);
      float pick = hash(vec2(blk, floor(uTime * 5.0)));
      vec3 c = pick > 0.5 ? uC0 : uC1;
      float sr = clamp(0.62 + (luma(camera(uv + vec2(px.x * 5.0, 0.0))) - 0.3)
                       * 1.2, 0.1, 1.3);
      float sb = clamp(0.62 + (luma(camera(uv - vec2(px.x * 5.0, 0.0))) - 0.3)
                       * 1.2, 0.1, 1.3);
      col = c * vec3(sr, shade, sb);
      col *= 0.82 + 0.18 * step(0.5, fract(uv.y * uRes.y / 3.0));
    }

    // Shine: bright strands lift toward a lighter version of the dye.
    col += sheen * 0.35 * (col * 0.5 + 0.25);
    col = clamp(col, 0.0, 1.0);

    float a = hair * uStrength * uAmount;
    float ga = glowA * uAmount * (1.0 - a);
    float outA = a + ga;
    if (outA < 0.002) discard;
    vec3 outC = (col * a + clamp(glow, 0.0, 1.0) * ga) / outA;
    gl_FragColor = vec4(fromSrgb(outC), outA);
    #include <colorspace_fragment>
  }
`;

const EMPTY_BOX: HairBox = { x0: 0.25, y0: 0.4, x1: 0.75, y1: 0.95, cover: 0 };

export const HairDye = () => {
  const hair = useHairMask({ quality: DYE.quality });
  const { sync } = useSemanticMaskTexture(hair.mask);
  const cameraTexture = useXRCameraTexture() as Texture | null;
  const size = useThree((s) => s.size);

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          uCamera: { value: null },
          uCameraLinear: { value: 0 },
          uMask: { value: null },
          uMaskMat: { value: new Matrix3() },
          uMaskTexel: { value: new Vector2(1 / 256, 1 / 256) },
          uHairIndex: { value: 1 },
          uFeather: { value: DYE.feather },
          uStyle: { value: 0 },
          uC0: { value: new Vector3() },
          uC1: { value: new Vector3() },
          uC2: { value: new Vector3() },
          uStrength: { value: 1 },
          uAmount: { value: 0 },
          uTime: { value: 0 },
          uBox: { value: new Vector4() },
          uRes: { value: new Vector2(1, 1) },
        },
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);

  const live = useRef({
    box: { ...EMPTY_BOX },
    target: { ...EMPTY_BOX },
    version: -1,
    texture: null as DataTexture | null,
  });

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const u = material.uniforms;
    const L = live.current;
    const { mask } = hair;
    hairState.status = hair.status;

    const texture = sync();
    if (texture !== L.texture) {
      // Linear filtering turns hard class edges into fractional coverage.
      texture.magFilter = LinearFilter;
      texture.minFilter = LinearFilter;
      texture.needsUpdate = true;
      L.texture = texture;
    }
    u.uMask.value = texture;
    const hairIndex = Math.max(0, hair.labels.indexOf("hair"));
    u.uHairIndex.value = hairIndex;

    let ready = false;
    if (mask && mask.version > 0) {
      ready = true;
      u.uMaskTexel.value.set(1 / mask.width, 1 / mask.height);
      const img = cameraTexture?.image as
        | {
            videoWidth?: number;
            width?: number;
            videoHeight?: number;
            height?: number;
          }
        | undefined;
      computeMaskUvTransform(
        {
          space: mask.space,
          maskWidth: mask.width,
          maskHeight: mask.height,
          feedWidth: img?.videoWidth || img?.width || mask.width,
          feedHeight: img?.videoHeight || img?.height || mask.height,
        },
        u.uMaskMat.value,
      );
      if (mask.version !== L.version) {
        L.version = mask.version;
        const found = measureHair(
          mask.indices,
          mask.width,
          mask.height,
          hairIndex,
        );
        if (found && found.cover >= DYE.minCover) {
          // First sighting snaps; after that the box eases.
          if (L.box.cover === 0) Object.assign(L.box, found);
          Object.assign(L.target, found);
          hairState.missing = 0;
        }
      }
    }
    if (hairState.status === "ready") hairState.missing += dt;
    easeBox(L.box, L.target, dt, DYE.boxEase);
    u.uBox.value.set(L.box.x0, L.box.y0, L.box.x1, L.box.y1);

    u.uCamera.value = cameraTexture;
    u.uCameraLinear.value =
      cameraTexture?.colorSpace === SRGBColorSpace ? 1 : 0;
    u.uRes.value.set(size.width, size.height);
    u.uTime.value = state.clock.elapsedTime;

    const { look } = dye;
    const style = styleOf(look.style);
    u.uStyle.value = style.index;
    const colors = currentColors(look);
    [u.uC0, u.uC1, u.uC2].forEach((c, i) => {
      const hex = colors[Math.min(i, colors.length - 1)] ?? "#ffffff";
      (c.value as Vector3).set(...hexToRgb(hex));
    });
    u.uStrength.value = STRENGTHS[look.strength].amount;

    // Fade in on the first mask; fade out while comparing.
    const goal = ready && cameraTexture && !dye.compare ? 1 : 0;
    const k = 1 - Math.exp(-DYE.fade * dt);
    u.uAmount.value += (goal - u.uAmount.value) * k;
  });

  return (
    <mesh frustumCulled={false} renderOrder={-900}>
      <planeGeometry args={[1, 1]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
};
