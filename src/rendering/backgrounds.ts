/**
 * BackgroundManager — five GPU-shader space backgrounds, one per difficulty tier.
 *
 * Level → background mapping (wraps via modulo):
 *   0: Deep Space  1: Nebula  2: Pulsar Zone  3: Red Giant  4: Event Horizon
 *
 * Usage:
 *   const bg = new BackgroundManager(app.stage, app.screen.width, app.screen.height);
 *   app.ticker.add(() => bg.update(performance.now()));
 *   bg.setLevel(level);
 */

import * as PIXI from 'pixi.js';

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
uniform float uTime;
uniform float uAspectRatio;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
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
        float sc=60.0+float(i)*110.0;
        vec2 gv=uv*sc, id=floor(gv), gf=fract(gv);
        if(hash21(id+float(i)*13.7)>density) continue;
        vec2 sp=hash22(id+float(i)*0.4)*0.9+0.05;
        float d=length(gf-sp);
        float br=pow(hash21(id+float(i)*2.3),2.5);
        float temp=hash21(id+float(i)*3.1);
        float sz=0.006+br*0.01;
        float glow=exp(-d*d/(sz*sz*3.0));
        float core=exp(-d*d/(sz*sz*0.3))*0.8;
        float twinkle=0.82+0.18*sin(uTime*(1.5+br*3.0)+hash21(id)*6.28);
        vec3 sc2=mix(vec3(1.0,0.55,0.2),mix(vec3(1.0,1.0,0.95),vec3(0.6,0.8,1.0),temp),clamp(temp*1.4,0.0,1.0));
        col+=(glow+core)*br*brightness*sc2*twinkle;
    }
    return col;
}
`;

const GLSL_COMMON = GLSL_HEADER + GLSL_NOISE + GLSL_STARS;

// ─── Shader fragments ─────────────────────────────────────────────────────────

const FRAG_DEEP_SPACE = GLSL_COMMON + `
void main() {
    vec2 uv = vTextureCoord * uInputSize.xy / uOutputFrame.zw;
    vec3 col = vec3(0.02, 0.025, 0.065);

    // Milky Way band — dense star region along a diagonal
    float band = exp(-pow(uv.y - uv.x * 0.5 - 0.25, 2.0) * 12.0);
    col += starField(uv + vec2(0.37, 0.81), 0.72, 1.8) * (1.0 + band * 1.2);
    col += starField(uv, 0.55, 1.0);

    // Galaxy smear
    vec2 gp = (uv - vec2(0.28, 0.69)) * vec2(uAspectRatio, 1.0);
    float gal = exp(-dot(gp, gp) * 10.0);
    col += gal * vec3(0.4, 0.45, 1.0) * 0.10;

    gl_FragColor = vec4(col, 1.0);
}
`;

const FRAG_NEBULA = GLSL_COMMON + `
void main() {
    vec2 uv = vTextureCoord * uInputSize.xy / uOutputFrame.zw;

    // Two rounds of FBM domain warping (reduced scale for calmer motion)
    vec2 q = vec2(fbm(uv * 2.5 + uTime * 0.010),
                  fbm(uv * 2.5 + vec2(5.2, 1.3) + uTime * 0.008));
    vec2 r = vec2(fbm(uv * 2.5 + 3.0 * q + vec2(1.7, 9.2) + uTime * 0.006),
                  fbm(uv * 2.5 + 3.0 * q + vec2(8.3, 2.8) + uTime * 0.005));
    float f = fbm(uv * 2.0 + 3.0 * r + uTime * 0.004);

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
    float dust = fbm(uv * 4.0 + vec2(3.0, 7.0));
    col *= 0.68 + 0.32 * (1.0 - smoothstep(0.45, 0.55, dust));

    col += starField(uv, 0.52, 0.85);

    gl_FragColor = vec4(col, 1.0);
}
`;

const FRAG_PULSAR = GLSL_COMMON + `
uniform float uPulse;
void main() {
    vec2 uv = vTextureCoord * uInputSize.xy / uOutputFrame.zw;
    vec2 d = uv - vec2(0.5);
    d.x *= uAspectRatio;
    float dist = length(d);
    float phi = atan(d.y, d.x);

    vec3 col = vec3(0.005, 0.025, 0.030);
    col += starField(uv, 0.38, 0.28);

    // Rotating emission beams (computed in shader — avoids Canvas blur overflow)
    float beamAngle = uTime * 0.45;
    for (int i = 0; i < 2; i++) {
        float ba = beamAngle + float(i) * 3.14159265;
        float da = phi - ba;
        // Wrap to [-pi, pi]
        da = da - 6.28318530 * floor((da + 3.14159265) / 6.28318530);
        float falloff = 1.0 / max(dist * 2.2 + 0.18, 0.18);
        float bloom = exp(-da * da * 5.0) * 0.20 * falloff;
        float sharp = exp(-da * da * 90.0) * 0.65 * falloff;
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
    float rings = sin(dist * 80.0 - uTime * 2.0) * 0.5 + 0.5;
    col += vec3(0.1, 0.6, 1.0) * rings * ringMask * 0.18 * uPulse;

    gl_FragColor = vec4(col, 1.0);
}
`;

const FRAG_RED_GIANT = GLSL_COMMON + `
void main() {
    vec2 uv = vTextureCoord * uInputSize.xy / uOutputFrame.zw;
    vec2 starPos = vec2(0.84, 0.10);
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
    float corona = fbm(vec2(dir.x * 2.2 + dir.y * 0.7 + uTime * 0.03, dist * 6.0 - uTime * 0.1));
    float coronaRing = exp(-pow(dist - 0.18, 2.0) * 40.0) * corona;
    col += vec3(1.0, 0.45, 0.05) * coronaRing * 1.4;

    // Star surface
    float surface = smoothstep(0.18, 0.0, dist);
    col += surface * vec3(1.0, 0.85, 0.4) * 12.0;

    // Solar prominences
    float promMask = smoothstep(0.35, 0.12, dist) * smoothstep(0.04, 0.18, dist);
    float prom = fbm(vec2(dir.x * 3.0 + dir.y * 1.1 + uTime * 0.06, dist * 8.0 - uTime * 0.15));
    col += vec3(1.0, 0.35, 0.05) * prom * promMask * 0.6;

    col += starField(uv, 0.42, 0.35);

    gl_FragColor = vec4(col, 1.0);
}
`;

const FRAG_EVENT_HORIZON = GLSL_COMMON + `
void main() {
    vec2 uv = vTextureCoord * uInputSize.xy / uOutputFrame.zw;
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

    gl_FragColor = vec4(col, 1.0);
}
`;

// ─── Types ────────────────────────────────────────────────────────────────────

interface BackgroundEntry {
  readonly name: string;
  readonly container: PIXI.Container;
  update(timestamp: number): void;
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

// ─── Sprite factory ───────────────────────────────────────────────────────────

interface BgSprite {
  sprite: PIXI.Sprite;
  uniforms: Record<string, number>;
}

function makeBgSprite(
  frag: string,
  ar: number,
  w: number,
  h: number,
  extraUniforms: Record<string, number> = {},
): BgSprite {
  const uniformDefs: Record<string, { value: number; type: string }> = {
    uTime: { value: 0.0, type: 'f32' },
    uAspectRatio: { value: ar, type: 'f32' },
  };
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

// ─── Background factories ─────────────────────────────────────────────────────

function buildDeepSpace(
  parent: PIXI.Container,
  w: number,
  h: number,
  ar: number,
): BackgroundEntry {
  const container = new PIXI.Container();
  const { sprite, uniforms } = makeBgSprite(FRAG_DEEP_SPACE, ar, w, h);
  container.addChild(sprite);
  parent.addChild(container);
  return {
    name: 'DEEP SPACE',
    container,
    update(timestamp: number): void {
      uniforms['uTime'] = timestamp * 0.001;
    },
  };
}

function buildNebula(
  parent: PIXI.Container,
  w: number,
  h: number,
  ar: number,
): BackgroundEntry {
  const container = new PIXI.Container();
  const { sprite, uniforms } = makeBgSprite(FRAG_NEBULA, ar, w, h);
  container.addChild(sprite);
  parent.addChild(container);
  return {
    name: 'NEBULA',
    container,
    update(timestamp: number): void {
      uniforms['uTime'] = timestamp * 0.001;
    },
  };
}

function buildPulsarZone(
  parent: PIXI.Container,
  w: number,
  h: number,
  ar: number,
): BackgroundEntry {
  const container = new PIXI.Container();
  const { sprite, uniforms } = makeBgSprite(FRAG_PULSAR, ar, w, h, { uPulse: 0.5 });
  container.addChild(sprite);
  parent.addChild(container);
  return {
    name: 'PULSAR ZONE',
    container,
    update(timestamp: number): void {
      const t = timestamp * 0.001;
      uniforms['uTime'] = t;
      uniforms['uPulse'] = 0.5 + 0.5 * Math.sin(t * 3.0);
    },
  };
}

function buildRedGiant(
  parent: PIXI.Container,
  w: number,
  h: number,
  ar: number,
): BackgroundEntry {
  const container = new PIXI.Container();
  const { sprite, uniforms } = makeBgSprite(FRAG_RED_GIANT, ar, w, h);
  container.addChild(sprite);
  parent.addChild(container);
  return {
    name: 'RED GIANT',
    container,
    update(timestamp: number): void {
      uniforms['uTime'] = timestamp * 0.001;
    },
  };
}

function buildEventHorizon(
  parent: PIXI.Container,
  w: number,
  h: number,
  ar: number,
): BackgroundEntry {
  const container = new PIXI.Container();
  const { sprite, uniforms } = makeBgSprite(FRAG_EVENT_HORIZON, ar, w, h);
  container.addChild(sprite);
  parent.addChild(container);
  return {
    name: 'EVENT HORIZON',
    container,
    update(timestamp: number): void {
      uniforms['uTime'] = timestamp * 0.001;
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
    const ar = width / height;
    this.#backgrounds = [
      buildDeepSpace(parent, width, height, ar),
      buildNebula(parent, width, height, ar),
      buildPulsarZone(parent, width, height, ar),
      buildRedGiant(parent, width, height, ar),
      buildEventHorizon(parent, width, height, ar),
    ];
    this.#applyVisibility(0);
  }

  /** Switch to the background tier for the given difficulty level. */
  setLevel(level: number): void {
    this.#applyVisibility(level % this.#backgrounds.length);
  }

  /** Advance shader time. Call once per frame with performance.now(). */
  update(timestamp: number): void {
    this.#backgrounds[this.#activeIndex]?.update(timestamp);
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
