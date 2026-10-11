/**
 * BackgroundManager — five GPU-shader space backgrounds, one per difficulty tier.
 *
 * Level → background mapping (wraps via modulo):
 *   0: Deep Space  1: Nebula  2: Pulsar Zone  3: Red Giant  4: Event Horizon
 *
 * Each environment supplies `vec3 scene(vec2 uv)`; a shared `main()` layers the
 * reactive effects on top so every environment responds to play the same way:
 * combo heat, the Perfect/Good ripple, the Miss fringe and drain, the focus pull,
 * per-layer star parallax and the living orb core. All of it is driven by the
 * AtmosphereFrame passed to update().
 *
 * Usage:
 *   const bg = new BackgroundManager(app.stage, app.screen.width, app.screen.height);
 *   app.ticker.add(() => { atmosphere.update(dt); bg.update(atmosphere.frame); });
 *   bg.setLevel(level);
 */

import * as PIXI from 'pixi.js';
import { ORB_RADIUS } from '../config.js';
import { SHOCK_DURATION_S, SHOCK_SPEED, type AtmosphereFrame } from './atmosphere.js';

// ─── Visual constants (presentation layer — not gameplay tuning knobs) ────────

/** Edge darkening applied to every environment (0 = none). */
const BASE_VIGNETTE = 0.3;
/** Peak UV displacement of the ripple. */
const SHOCK_DISPLACEMENT = 0.04;

/** Formats a number as a GLSL float literal. */
const glslFloat = (v: number): string => v.toFixed(4);

// ─── Default vertex shader (PixiJS v8) ────────────────────────────────────────

const DEFAULT_VERT = `
attribute vec2 aPosition;
varying vec2 vTextureCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition(void) {
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    return vec4(position, 0.0, 1.0);
}
vec2 filterTextureCoord(void) {
    return aPosition * (uOutputFrame.zw * uInputSize.zw);
}
void main(void) {
    gl_Position = filterVertexPosition();
    vTextureCoord = filterTextureCoord();
}`;

// ─── Shared GLSL ──────────────────────────────────────────────────────────────

const GLSL_HEADER = `
precision highp float;
varying vec2 vTextureCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform float uAspectRatio;
uniform float uTime;       // seconds, orb breathing
uniform float uTwinkle;    // star twinkle clock, faster with heat
uniform float uFlow;       // environment motion clock, faster with heat
uniform float uHeat;       // combo heat 0..1
uniform float uShockX;     // ripple origin, screen UV
uniform float uShockY;
uniform float uShockAge;   // seconds since the ripple fired
uniform float uShockGood;  // 0 = Perfect, 1 = Good
uniform float uMiss;       // miss fringe/drain 0..1
uniform float uFocus;      // focus pull 0..1
uniform float uCamX;       // parallax camera, screen UV
uniform float uCamY;
uniform float uOrbPresence;
uniform float uOrbR;       // orb radius / screen height
uniform float uOrbFlash;
uniform float uFlashR;
uniform float uFlashG;
uniform float uFlashB;
`;

const GLSL_NOISE = `
float hash21(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
vec2 hash22(vec2 p) { p=vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))); return fract(sin(p)*43758.5453); }
float vnoise(vec2 p) {
    vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),mix(hash21(i+vec2(0,1)),hash21(i+vec2(1,1)),f.x),f.y);
}
float fbm(vec2 p) {
    float v=0.0,a=0.5;
    for(int i=0;i<5;i++){v+=a*vnoise(p);p=p*2.1+vec2(1.7,9.2);a*=0.48;}
    return v;
}
`;

const GLSL_STARS = `
vec3 starField(vec2 uv, float density, float brightness) {
    vec3 col=vec3(0.0);
    for(int i=0;i<4;i++){
        // Parallax: layer 0 (largest cells) is nearest and moves most
        float depth=1.0/(1.0+float(i)*1.3);
        vec2 p=uv+vec2(uCamX,uCamY)*depth;
        float sc=60.0+float(i)*110.0;
        vec2 gv=p*sc, id=floor(gv), gf=fract(gv);
        if(hash21(id+float(i)*13.7)>density) continue;
        vec2 sp=hash22(id+float(i)*0.4)*0.9+0.05;
        float d=length(gf-sp);
        float br=pow(hash21(id+float(i)*2.3),2.5);
        float temp=hash21(id+float(i)*3.1);
        float sz=0.006+br*0.01;
        float glow=exp(-d*d/(sz*sz*3.0));
        float core=exp(-d*d/(sz*sz*0.3))*0.8;
        // Twinkle deepens and brightens with heat
        float tw=0.5-0.5*sin(uTwinkle*(1.5+br*3.0)+hash21(id)*6.28);
        float twinkle=1.0-(0.18+0.30*uHeat)*tw;
        vec3 sc2=mix(vec3(1.0,0.55,0.2),mix(vec3(1.0,1.0,0.95),vec3(0.6,0.8,1.0),temp),clamp(temp*1.4,0.0,1.0));
        col+=(glow+core)*br*brightness*sc2*twinkle*(1.0+0.35*uHeat);
    }
    return col;
}
`;

const GLSL_COMMON = GLSL_HEADER + GLSL_NOISE + GLSL_STARS;

/**
 * Shared main(): samples the environment's scene() and layers on the reactive
 * effects. Order matters — ripple displaces the lookup, miss splits it, then
 * heat, orb core, vignette/focus and the miss drain grade the result.
 */
const GLSL_MAIN = `
const float SHOCK_DURATION = ${glslFloat(SHOCK_DURATION_S)};
const float SHOCK_SPEED = ${glslFloat(SHOCK_SPEED)};
const float SHOCK_DISPLACEMENT = ${glslFloat(SHOCK_DISPLACEMENT)};
const float BASE_VIGNETTE = ${glslFloat(BASE_VIGNETTE)};
const float ORB_HALO_EXTENT = 3.0; // orb radii

void main() {
    vec2 uv0 = vTextureCoord * uInputSize.xy / uOutputFrame.zw;
    vec2 ar = vec2(uAspectRatio, 1.0);
    vec2 uv = uv0;

    // Ripple: derivative-of-Gaussian displacement travelling outward from the hit
    float rim = 0.0;
    if (uShockAge < SHOCK_DURATION) {
        vec2 p = (uv0 - vec2(uShockX, uShockY)) * ar;
        float r = length(p);
        float front = uShockAge * SHOCK_SPEED;
        float width = 0.03 + uShockAge * 0.05;
        float x = (r - front) / width;
        float env = 1.0 - uShockAge / SHOCK_DURATION;
        env *= env;
        float amp = mix(1.0, 0.55, uShockGood);
        float wave = x * exp(-x * x) * env * amp;
        uv -= (p / (r + 0.0001)) / ar * wave * SHOCK_DISPLACEMENT;
        rim = exp(-x * x * 1.5) * env * amp;
    }

    // Miss: chromatic split — three scene samples only while the miss decays
    vec3 col;
    if (uMiss > 0.01) {
        vec2 off = vec2(0.007, 0.002) * uMiss;
        col = vec3(scene(uv + off).r, scene(uv).g, scene(uv - off).b);
    } else {
        col = scene(uv);
    }

    vec2 c = (uv0 - 0.5) * ar;
    float dc = length(c);

    // Combo heat: saturation lift plus a teal glow building around the core
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(lum), col, 1.0 + uHeat * 0.55);
    col += vec3(0.0, 1.0, 0.8) * uHeat * 0.05 * exp(-dc * dc * 6.0);

    // Ripple rim tinted in the grade colour
    col += mix(vec3(0.0, 1.0, 0.8), vec3(0.53, 1.0, 0.27), uShockGood) * rim * 0.09;

    // Living orb: plasma core behind the orb stroke, plus a soft halo
    if (uOrbPresence > 0.001) {
        vec2 q = c / uOrbR;
        float d = length(q);
        if (d < ORB_HALO_EXTENT) {
            float breathe = 0.86 + 0.14 * sin(uTime * 1.7);
            vec3 flash = vec3(uFlashR, uFlashG, uFlashB);
            vec3 base = mix(vec3(1.0, 0.38, 0.06), flash, uOrbFlash * 0.75);
            vec3 glow = base * exp(-d * d * 0.35) * (0.05 + 0.05 * uHeat)
                      * smoothstep(ORB_HALO_EXTENT, ORB_HALO_EXTENT * 0.6, d);
            if (d < 1.0) {
                float swirl = fbm(q * 1.4 + vec2(uTime * 0.40, -uTime * 0.31) + fbm(q * 2.2 - uTime * 0.2));
                vec3 hot = mix(vec3(1.0, 0.38, 0.06), vec3(1.0, 0.86, 0.55), smoothstep(0.35, 0.8, swirl));
                hot = mix(hot, flash, uOrbFlash * 0.75);
                glow += hot * smoothstep(1.0, 0.55, d) * swirl * (0.55 + 0.5 * uHeat + 0.6 * uOrbFlash);
            }
            col += glow * breathe * uOrbPresence;
        }
    }

    // Vignette and focus pull: edges dim as the next hit approaches
    float vig = smoothstep(0.95 - uFocus * 0.3, 0.2, dc);
    col *= mix(1.0, vig, BASE_VIGNETTE + uFocus * 0.4);
    col *= 1.0 - uFocus * 0.22 * smoothstep(0.12, 0.45, dc);

    // Miss drain: brief desaturate and dim
    float lum2 = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(col, vec3(lum2) * vec3(0.92, 0.86, 0.98) * 0.75, uMiss * 0.8);

    gl_FragColor = vec4(col, 1.0);
}
`;

// ─── Environment scenes ───────────────────────────────────────────────────────
// Each returns the environment colour at a (possibly displaced) screen UV.
// Motion uses uFlow so it speeds up with combo heat.

const FRAG_DEEP_SPACE = GLSL_COMMON + `
vec3 scene(vec2 uv) {
    vec3 col = vec3(0.02, 0.025, 0.065);
    vec2 far = uv + vec2(uCamX, uCamY) * 0.15; // band and galaxy sit far back

    // Milky Way band — dense star region along a diagonal
    float band = exp(-pow(far.y - far.x * 0.5 - 0.25, 2.0) * 12.0);
    col += starField(uv + vec2(0.37, 0.81), 0.72, 1.8) * (1.0 + band * 1.2);
    col += starField(uv, 0.55, 1.0);

    // Galaxy smear
    vec2 gp = (far - vec2(0.28, 0.69)) * vec2(uAspectRatio, 1.0);
    float gal = exp(-dot(gp, gp) * 10.0);
    col += gal * vec3(0.4, 0.45, 1.0) * 0.10;

    return col;
}
` + GLSL_MAIN;

const FRAG_NEBULA = GLSL_COMMON + `
vec3 scene(vec2 uv) {
    vec2 cuv = uv + vec2(uCamX, uCamY) * 0.3; // clouds sit at mid depth

    // Two rounds of FBM domain warping (reduced scale for calmer motion)
    vec2 q = vec2(fbm(cuv * 2.5 + uFlow * 0.010),
                  fbm(cuv * 2.5 + vec2(5.2, 1.3) + uFlow * 0.008));
    vec2 r = vec2(fbm(cuv * 2.5 + 3.0 * q + vec2(1.7, 9.2) + uFlow * 0.006),
                  fbm(cuv * 2.5 + 3.0 * q + vec2(8.3, 2.8) + uFlow * 0.005));
    float f = fbm(cuv * 2.0 + 3.0 * r + uFlow * 0.004);

    // Sharpen contrast: only bright peaks become cloud, rest stays dark
    f = smoothstep(0.42, 0.78, f);

    // Color: mostly void, sparse wisps, rare bright filaments
    vec3 col = mix(vec3(0.01, 0.005, 0.025),
               mix(vec3(0.20, 0.03, 0.32),
               mix(vec3(0.06, 0.04, 0.58),
                   vec3(0.80, 0.85, 1.0),
               smoothstep(0.6, 0.9, f)),
               smoothstep(0.3, 0.62, f)),
               smoothstep(0.0, 0.42, f));

    // Dust lanes
    float dust = fbm(cuv * 4.0 + vec2(3.0, 7.0));
    col *= 0.68 + 0.32 * (1.0 - smoothstep(0.45, 0.55, dust));

    col += starField(uv, 0.52, 0.85);

    return col;
}
` + GLSL_MAIN;

const FRAG_PULSAR = GLSL_COMMON + `
uniform float uPulse;
vec3 scene(vec2 uv) {
    // Centred on the orb, so no parallax offset — only the stars drift
    vec2 d = uv - vec2(0.5);
    d.x *= uAspectRatio;
    float dist = length(d);
    vec2 dNorm = normalize(d + vec2(0.001, 0.0));

    vec3 col = vec3(0.005, 0.025, 0.030);
    col += starField(uv, 0.38, 0.28);

    // Rotating emission beams (computed in shader — avoids Canvas blur overflow)
    float beamAngle = uFlow * 0.45;
    for (int i = 0; i < 2; i++) {
        float ba = beamAngle + float(i) * 3.14159265;
        vec2 beamDir = vec2(cos(ba), sin(ba));
        // Cross product gives sin(angular diff) — continuous everywhere, no ±π seam
        float sinDa = dNorm.x * beamDir.y - dNorm.y * beamDir.x;
        float falloff = 1.0 / max(dist * 2.2 + 0.18, 0.18);
        float bloom = exp(-sinDa * sinDa * 5.0) * 0.20 * falloff;
        float sharp = exp(-sinDa * sinDa * 90.0) * 0.65 * falloff;
        float pulse = 0.55 + uPulse * 0.45;
        col += vec3(0.05, 0.50, 1.0) * bloom * pulse;
        col += vec3(0.55, 0.85, 1.0) * sharp * pulse;
    }

    // Central core glow
    float core = exp(-dist * dist * 60.0);
    col += vec3(0.3, 0.8, 1.0) * core * (0.6 + uPulse * 0.4);

    // Outer halo
    float halo = exp(-dist * dist * 4.0) * 0.12;
    col += vec3(0.1, 0.45, 0.7) * halo;

    // Faint magnetosphere rings
    float ringMask = exp(-pow(dist - 0.22, 2.0) * 180.0);
    float rings = sin(dist * 80.0 - uFlow * 2.0) * 0.5 + 0.5;
    col += vec3(0.1, 0.6, 1.0) * rings * ringMask * 0.18 * uPulse;

    return col;
}
` + GLSL_MAIN;

const FRAG_RED_GIANT = GLSL_COMMON + `
vec3 scene(vec2 uv) {
    vec2 starPos = vec2(0.84, 0.10) - vec2(uCamX, uCamY) * 0.1; // distant body
    vec2 d = uv - starPos;
    d.x *= uAspectRatio;
    float dist = length(d);
    // Use normalized direction components instead of atan — avoids the
    // ±pi wrap discontinuity that draws a hard horizontal seam leftward
    // from the star across the screen.
    vec2 dir = d / (dist + 0.001);

    vec3 col = vec3(0.05, 0.015, 0.004);

    // Wide warm glow across scene
    float warmGlow = exp(-dist * dist * 1.2);
    col += vec3(0.55, 0.12, 0.02) * warmGlow * 0.45;

    // FBM corona ring — dir.x/dir.y are continuous, no seam
    float corona = fbm(vec2(dir.x * 2.2 + dir.y * 0.7 + uFlow * 0.03, dist * 6.0 - uFlow * 0.1));
    float coronaRing = exp(-pow(dist - 0.18, 2.0) * 40.0) * corona;
    col += vec3(1.0, 0.45, 0.05) * coronaRing * 1.4;

    // Star surface
    float surface = smoothstep(0.18, 0.0, dist);
    col += surface * vec3(1.0, 0.85, 0.4) * 12.0;

    // Solar prominences
    float promMask = smoothstep(0.35, 0.12, dist) * smoothstep(0.04, 0.18, dist);
    float prom = fbm(vec2(dir.x * 3.0 + dir.y * 1.1 + uFlow * 0.06, dist * 8.0 - uFlow * 0.15));
    col += vec3(1.0, 0.35, 0.05) * prom * promMask * 0.6;

    col += starField(uv, 0.42, 0.35);

    return col;
}
` + GLSL_MAIN;

const FRAG_EVENT_HORIZON = GLSL_COMMON + `
vec3 scene(vec2 uv) {
    // Centred on the orb, so no parallax offset — lensed stars still drift
    vec2 d = uv - vec2(0.5);
    float r = length(d * vec2(uAspectRatio, 1.0));
    float rs = 0.08;

    // Gravitational lensing
    float lensStr = rs * rs / (r * r + 0.001);
    vec2 lensedUV = uv + normalize(d + vec2(0.0001)) * lensStr * 0.35;

    vec3 col = vec3(0.0);

    // Stars with lensing outside the Schwarzschild radius
    if (r > rs) {
        col += starField(lensedUV, 0.55, 0.55);
    }

    // Accretion disk — kept dim so game elements stay readable
    vec2 diskD = d * vec2(1.5 * uAspectRatio, 0.28);
    float diskDist = length(diskD);
    float diskBright  = exp(-pow(diskDist - 0.09, 2.0) * 320.0);
    float diskBright2 = exp(-pow(diskDist - 0.15, 2.0) * 180.0);
    float diskBright3 = exp(-pow(diskDist - 0.22, 2.0) *  90.0);
    float doppler = d.x * uAspectRatio / (diskDist + 0.001) * 0.5 + 0.5;
    vec3 diskColor = mix(vec3(0.2, 0.4, 1.0), vec3(1.0, 0.55, 0.1), doppler);
    col += diskColor * (diskBright * 0.55 + diskBright2 * 0.28 + diskBright3 * 0.12);

    // Photon ring — subtle
    float photonR = rs * 1.5;
    float photonGlow = exp(-pow(r - photonR, 2.0) * 1800.0);
    col += vec3(0.9, 0.75, 1.0) * photonGlow * 0.65;

    // Event horizon shadow
    float shadow = smoothstep(rs * 0.9, rs, r);
    col *= shadow;

    // Strong vignette — keeps center clear for gameplay
    float vignette = 1.0 - smoothstep(0.18, 0.52, length(d));
    col *= vignette * vignette;

    return col;
}
` + GLSL_MAIN;

// ─── Types ────────────────────────────────────────────────────────────────────

interface BackgroundEntry {
  readonly name: string;
  readonly container: PIXI.Container;
  update(frame: AtmosphereFrame): void;
}

// ─── Uniform accessor ─────────────────────────────────────────────────────────

/**
 * Returns the live uniform value bag from a Filter's named resource group.
 * PixiJS v8 wraps the resource definition object in a UniformGroup; its
 * `.uniforms` property is a plain Record of current scalar values.
 * We narrow structurally rather than casting to `any`.
 */
function getUniformValues(filter: PIXI.Filter, group: string): Record<string, number> {
  // filter.resources is Record<string, BindResource> — widen value type for
  // structural narrowing below.
  const resources = filter.resources as Record<string, unknown>;
  const entry = resources[group];
  if (
    entry !== null &&
    typeof entry === 'object' &&
    'uniforms' in entry &&
    typeof (entry as { uniforms: unknown }).uniforms === 'object' &&
    (entry as { uniforms: unknown }).uniforms !== null
  ) {
    return (entry as { uniforms: Record<string, number> }).uniforms;
  }
  throw new Error(`BackgroundManager: no UniformGroup found for resource "${group}"`);
}

// ─── Shared uniforms ──────────────────────────────────────────────────────────

/** Uniforms every environment declares via GLSL_HEADER, fed from AtmosphereFrame. */
const FRAME_UNIFORMS = [
  'uTime', 'uTwinkle', 'uFlow', 'uHeat',
  'uShockX', 'uShockY', 'uShockAge', 'uShockGood',
  'uMiss', 'uFocus', 'uCamX', 'uCamY',
  'uOrbPresence', 'uOrbFlash', 'uFlashR', 'uFlashG', 'uFlashB',
] as const;

/** Copy one frame of atmosphere state into a background's uniforms. */
function applyFrame(uniforms: Record<string, number>, frame: AtmosphereFrame): void {
  uniforms['uTime'] = frame.time;
  uniforms['uTwinkle'] = frame.twinkle;
  uniforms['uFlow'] = frame.flow;
  uniforms['uHeat'] = frame.heat;
  uniforms['uShockX'] = frame.shockX;
  uniforms['uShockY'] = frame.shockY;
  uniforms['uShockAge'] = frame.shockAge;
  uniforms['uShockGood'] = frame.shockGood;
  uniforms['uMiss'] = frame.miss;
  uniforms['uFocus'] = frame.focus;
  uniforms['uCamX'] = frame.camX;
  uniforms['uCamY'] = frame.camY;
  uniforms['uOrbPresence'] = frame.orbPresence;
  uniforms['uOrbFlash'] = frame.orbFlash;
  uniforms['uFlashR'] = frame.flashR;
  uniforms['uFlashG'] = frame.flashG;
  uniforms['uFlashB'] = frame.flashB;
}

// ─── Sprite factory ───────────────────────────────────────────────────────────

interface BgSprite {
  sprite: PIXI.Sprite;
  uniforms: Record<string, number>;
}

function makeBgSprite(
  frag: string,
  w: number,
  h: number,
  extraUniforms: Record<string, number> = {},
): BgSprite {
  const uniformDefs: Record<string, { value: number; type: string }> = {
    uAspectRatio: { value: w / h, type: 'f32' },
    uOrbR: { value: ORB_RADIUS / h, type: 'f32' },
  };
  for (const k of FRAME_UNIFORMS) {
    uniformDefs[k] = { value: 0.0, type: 'f32' };
  }
  // Start with the ripple idle so nothing fires on the first frame
  uniformDefs['uShockAge'] = { value: SHOCK_DURATION_S, type: 'f32' };
  for (const [k, v] of Object.entries(extraUniforms)) {
    uniformDefs[k] = { value: v, type: 'f32' };
  }

  const filter = new PIXI.Filter({
    glProgram: new PIXI.GlProgram({ vertex: DEFAULT_VERT, fragment: frag }),
    resources: { globals: uniformDefs },
  });
  filter.padding = 0;

  const sprite = new PIXI.Sprite(PIXI.Texture.WHITE);
  sprite.width = w;
  sprite.height = h;
  sprite.filters = [filter];

  return { sprite, uniforms: getUniformValues(filter, 'globals') };
}

// ─── Background factory ───────────────────────────────────────────────────────

/**
 * Builds one environment layer. `extraUpdate` sets environment-specific
 * uniforms after the shared frame uniforms are applied.
 */
function buildBackground(
  parent: PIXI.Container,
  name: string,
  frag: string,
  w: number,
  h: number,
  extraUniforms: Record<string, number> = {},
  extraUpdate?: (uniforms: Record<string, number>, frame: AtmosphereFrame) => void,
): BackgroundEntry {
  const container = new PIXI.Container();
  const { sprite, uniforms } = makeBgSprite(frag, w, h, extraUniforms);
  container.addChild(sprite);
  parent.addChild(container);
  return {
    name,
    container,
    update(frame: AtmosphereFrame): void {
      applyFrame(uniforms, frame);
      extraUpdate?.(uniforms, frame);
    },
  };
}

// ─── BackgroundManager ────────────────────────────────────────────────────────

export class BackgroundManager {
  readonly #backgrounds: BackgroundEntry[];
  #activeIndex: number = 0;

  /**
   * @param parent  Container to add background layers to (typically app.stage).
   * @param width   Canvas width in pixels.
   * @param height  Canvas height in pixels.
   */
  constructor(parent: PIXI.Container, width: number, height: number) {
    this.#backgrounds = [
      buildBackground(parent, 'DEEP SPACE', FRAG_DEEP_SPACE, width, height),
      buildBackground(parent, 'NEBULA', FRAG_NEBULA, width, height),
      buildBackground(parent, 'PULSAR ZONE', FRAG_PULSAR, width, height, { uPulse: 0.5 },
        (uniforms, frame) => {
          uniforms['uPulse'] = 0.5 + 0.5 * Math.sin(frame.flow * 3.0);
        }),
      buildBackground(parent, 'RED GIANT', FRAG_RED_GIANT, width, height),
      buildBackground(parent, 'EVENT HORIZON', FRAG_EVENT_HORIZON, width, height),
    ];
    this.#applyVisibility(0);
  }

  /** Switch to the background tier for the given difficulty level. */
  setLevel(level: number): void {
    this.#applyVisibility(level % this.#backgrounds.length);
  }

  /** Push this frame's atmosphere state into the active background's shader. */
  update(frame: AtmosphereFrame): void {
    this.#backgrounds[this.#activeIndex]?.update(frame);
  }

  /** Returns the display name of the currently active background. */
  get activeName(): string {
    return this.#backgrounds[this.#activeIndex]?.name ?? '';
  }

  #applyVisibility(index: number): void {
    this.#activeIndex = index;
    for (let i = 0; i < this.#backgrounds.length; i++) {
      const bg = this.#backgrounds[i];
      if (bg !== undefined) {
        bg.container.visible = i === index;
      }
    }
  }
}
