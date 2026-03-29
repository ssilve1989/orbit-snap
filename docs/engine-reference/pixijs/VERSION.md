# PixiJS — Version Reference

| Field | Value |
|-------|-------|
| **Engine Version** | PixiJS v8.17.1 |
| **Release Date** | ~Early 2026 |
| **Project Pinned** | 2026-03-29 |
| **Last Docs Verified** | 2026-03-29 |
| **LLM Knowledge Cutoff** | May 2025 |
| **Risk Level** | HIGH — v8.x is beyond LLM training data |

## CDN Import

```html
<script type="module">
import * as PIXI from 'https://cdn.jsdelivr.net/npm/pixi.js@8.17.1/dist/pixi.min.mjs';
</script>
```

## Knowledge Gap Warning

LLM training likely covers PixiJS up to ~v7.x. PixiJS v8 is a major breaking
release. Always cross-reference this file before using any PixiJS API.

## Breaking Changes from v7 → v8 (Verified in Project)

### Application

| v7 | v8 |
|----|----|
| `new PIXI.Application({ ...options })` (sync) | `const app = new PIXI.Application(); await app.init({ ...options })` (async) |
| `app.view` (HTMLCanvasElement) | `app.canvas` |
| `app.renderer.width/height` | `app.screen.width/height` |

### Filters

v7:
```javascript
const f = new PIXI.Filter(vertSrc, fragSrc, { uTime: 0 });
f.uniforms.uTime = value;
```

v8:
```javascript
const f = new PIXI.Filter({
  glProgram: new PIXI.GlProgram({ vertex: vertSrc, fragment: fragSrc }),
  resources: {
    globals: {
      uTime: { value: 0.0, type: 'f32' },
      uMyVec2: { value: [0, 0], type: 'vec2<f32>' },
    }
  }
});
// Update uniforms:
f.resources.globals.uniforms.uTime = value;
```

### GLSL Shaders in Filters

- PixiJS v8 uses a **WebGL 1 context** for filters — write GLSL ES 1.00
- Do NOT use `#version 300 es` — PixiJS prepends its own preamble
- Do NOT use `in`/`out` varyings or `out vec4 fragColor`

| GLSL ES 3.00 (wrong) | GLSL ES 1.00 (correct) |
|----------------------|------------------------|
| `in vec2 aPosition` | `attribute vec2 aPosition` |
| `out vec2 vTextureCoord` | `varying vec2 vTextureCoord` |
| `in vec2 vTextureCoord` | `varying vec2 vTextureCoord` |
| `out vec4 fragColor` | _(remove — use `gl_FragColor`)_ |
| `fragColor = vec4(...)` | `gl_FragColor = vec4(...)` |

### Filter UV Coordinates

`vTextureCoord` is NOT guaranteed to be `[0,1]` screen space — it maps to the
PixiJS texture pool allocation, which may be larger than the output frame.

**Always normalise to screen UV in fragment shaders:**
```glsl
// Declare in fragment shader (PixiJS binds these automatically):
uniform vec4 uInputSize;    // .xy = texture size, .zw = 1/texture size
uniform vec4 uOutputFrame;  // .xy = frame offset, .zw = frame size

// In main():
vec2 uv = vTextureCoord * uInputSize.xy / uOutputFrame.zw; // [0,1] screen UV
```

### Default Filter Vertex Shader (v8)

```glsl
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
}
```

### Graphics API

v7:
```javascript
g.beginFill(0xff0000, 0.5);
g.drawCircle(x, y, r);
g.endFill();
g.lineStyle(2, 0xffffff);
g.drawCircle(x, y, r);
```

v8 (fluent):
```javascript
g.circle(x, y, r).fill({ color: 0xff0000, alpha: 0.5 });
g.circle(x, y, r).stroke({ width: 2, color: 0xffffff, alpha: 1 });
g.poly([x0,y0, x1,y1, x2,y2]).fill({ color: 0x1199ff, alpha: 0.22 });
g.rect(x, y, w, h).fill({ color: 0x000000 });
```

### BlurFilter

v7: `new PIXI.filters.BlurFilter(strength)`
v8: `new PIXI.BlurFilter({ strength: 8, quality: 2 })`

**Warning**: High `strength` values create large filter padding, causing the
blur render area to extend beyond canvas bounds and produce rendering artifacts.
Keep `strength` ≤ 12 for full-screen Graphics objects, or move effects into
GLSL shaders to avoid the issue entirely.

### Other Renamed APIs

| v7 | v8 |
|----|----|
| `PIXI.filters.BlurFilter` | `PIXI.BlurFilter` |
| `app.ticker.add(fn)` | `app.ticker.add(fn)` _(unchanged)_ |
| `app.ticker.deltaMS` | `app.ticker.deltaMS` _(unchanged)_ |
| `PIXI.Texture.WHITE` | `PIXI.Texture.WHITE` _(unchanged)_ |

## GLSL Gotchas Discovered in Project

### atan() Discontinuity
`atan(y, x)` has a `±π` wrap discontinuity directly to the LEFT of the origin.
If the discontinuity line crosses a visible region (e.g., a corona around a star
positioned near the top of the screen), it renders as a sharp horizontal seam.

**Fix**: Use normalised direction components instead:
```glsl
vec2 dir = normalize(d + vec2(0.001)); // continuous, no seam
float corona = fbm(vec2(dir.x * 2.2 + dir.y * 0.7 + uTime * 0.03, ...));
```
