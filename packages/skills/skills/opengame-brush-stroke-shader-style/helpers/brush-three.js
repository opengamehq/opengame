/**
 * brush-stroke-shader-style for three.js (WebGL2).
 *
 *   import { BrushStrokeStyle } from "./brush-three.js";
 *   const brush = new BrushStrokeStyle(renderer, { look: "wet" });
 *   // in the frame loop, in place of renderer.render(scene, camera):
 *   brush.render(scene, camera);
 *
 * With an EffectComposer or any pipeline of your own, keep your passes and hand the
 * finished frame over instead:
 *
 *   brush.renderAnchors(scene, camera);          // once a frame, any time before
 *   brush.paint(finishedFrameTexture, camera);   // draws to the current render target
 *
 * The anchor pass draws the scene once more with a cheap material that writes where
 * every pixel is: in the world for things that stay put, in the rest pose for skinned
 * and moving things, so paint stays on a character while it runs.
 */
import * as THREE from "three";
import { BRUSH_UNIFORMS, BRUSH_COMMON, BRUSH_PAINT, BRUSH_PRINT_UNIFORMS, BRUSH_PRINT, BRUSH_VEC4, BRUSH_VEC3, BrushState } from "./brush-core.js";
import { BRUSH_LOOKS } from "./brush-looks.js";

const VERT = /* glsl */ `
out vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const PAINT_FRAG = /* glsl */ `
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 outColour;
uniform sampler2D tScene;
uniform sampler2D tAnchor;
uniform sampler2D tAnchorWas;
uniform sampler2D tHistory;
uniform float uSceneLod;
#define BRUSH_HISTORY
${BRUSH_UNIFORMS}
${BRUSH_COMMON}
vec4 brushScene(vec2 uv, float lod) { return textureLod(tScene, uv, min(lod, uSceneLod)); }
vec4 brushAnchor(vec2 uv) { return textureLod(tAnchor, uv, 0.0); }
vec4 brushAnchorWas(vec2 uv) { return textureLod(tAnchorWas, uv, 0.0); }
vec4 brushHistory(vec2 uv) { return textureLod(tHistory, uv, 0.0); }
${BRUSH_PAINT}
void main() { outColour = brushFrame(vUv); }
`;

const PRINT_FRAG = /* glsl */ `
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 outColour;
uniform sampler2D tPainted;
uniform float uSrgbOut;
${BRUSH_UNIFORMS}
${BRUSH_PRINT_UNIFORMS}
${BRUSH_COMMON}
vec4 brushPainted(vec2 uv) { return texture(tPainted, clamp(uv, 0.0, 1.0)); }
${BRUSH_PRINT}
void main() { outColour = brushPrint(vUv); }
`;

// Develops three's linear frame for display: the renderer's own tone curve, then the
// sRGB transfer, exactly as OutputPass does. Paint is mixed in display values.
const DEVELOP_FRAG = /* glsl */ `
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 outColour;
uniform sampler2D tLinear;
#define gl_FragColor outColour
#include <tonemapping_pars_fragment>
void main() {
  vec4 c = texture(tLinear, vUv);
  #ifdef LINEAR_TONE_MAPPING
    c.rgb = LinearToneMapping(c.rgb);
  #elif defined(REINHARD_TONE_MAPPING)
    c.rgb = ReinhardToneMapping(c.rgb);
  #elif defined(CINEON_TONE_MAPPING)
    c.rgb = CineonToneMapping(c.rgb);
  #elif defined(ACES_FILMIC_TONE_MAPPING)
    c.rgb = ACESFilmicToneMapping(c.rgb);
  #elif defined(AGX_TONE_MAPPING)
    c.rgb = AgXToneMapping(c.rgb);
  #elif defined(NEUTRAL_TONE_MAPPING)
    c.rgb = NeutralToneMapping(c.rgb);
  #endif
  c = sRGBTransferOETF(vec4(clamp(c.rgb, 0.0, 1.0), 1.0));
  outColour = vec4(c.rgb, 1.0);
}
`;
const TONE_DEFINES = { [THREE.LinearToneMapping]: "LINEAR_TONE_MAPPING", [THREE.ReinhardToneMapping]: "REINHARD_TONE_MAPPING", [THREE.CineonToneMapping]: "CINEON_TONE_MAPPING", [THREE.ACESFilmicToneMapping]: "ACES_FILMIC_TONE_MAPPING", [THREE.AgXToneMapping]: "AGX_TONE_MAPPING", [THREE.NeutralToneMapping]: "NEUTRAL_TONE_MAPPING" };

// Writes anchor space. Uses three's own chunks so skinning, morphs, instancing and
// batching all land where the visible mesh does.
const ANCHOR_VERT = /* glsl */ `
#include <common>
#include <batching_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
uniform vec4 uObject;   // xyz scale of the object, w its kind: 1 the world, 2 a figure, 3 a hero
uniform float uAirFar;  // the distance at which air is complete
uniform vec3 uOffset;   // keeps two things from sharing one pattern of strokes
out vec4 vAnchor;
out vec2 vCut;
void main() {
  vCut = uv;
  #include <batching_vertex>
  #include <begin_vertex>
  vec3 rest = transformed;
  #include <morphtarget_vertex>
  #include <skinbase_vertex>
  #include <skinning_vertex>
  #include <project_vertex>
  #include <logdepthbuf_vertex>
  #include <clipping_planes_vertex>
  vec4 world = vec4(transformed, 1.0);
  #ifdef USE_BATCHING
    world = batchingMatrix * world;
  #endif
  #ifdef USE_INSTANCING
    world = instanceMatrix * world;
  #endif
  world = modelMatrix * world;
  float air = 0.4 * clamp(length(mvPosition.xyz) / uAirFar, 0.0, 1.0);
  vAnchor = uObject.w > 1.5 ? vec4(rest * uObject.xyz + uOffset, uObject.w + air) : vec4(world.xyz, 1.0 + air);
}
`;
const ANCHOR_FRAG = /* glsl */ `
precision highp float;
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
in vec4 vAnchor;
in vec2 vCut;
uniform sampler2D tCut;      // the thing's own texture (map), when its shape is cut out of it: alpha
uniform sampler2D tCutMask;  // its alphaMap, read from green as three.js reads one
uniform vec2 uCutFrom;       // x: tCut is set, y: tCutMask is set
uniform float uCut;          // the alpha below which a pixel is not there (0 when the shape is the mesh)
out vec4 outAnchor;
void main() {
  #include <clipping_planes_fragment>
  #include <logdepthbuf_fragment>
  if (uCut > 0.0) {
    // As the visible material cuts it: the map's alpha times the alphaMap's green.
    float alpha = 1.0;
    if (uCutFrom.x > 0.5) alpha *= texture(tCut, vCut).a;
    if (uCutFrom.y > 0.5) alpha *= texture(tCutMask, vCut).g;
    if (alpha < uCut) discard;
  }
  outAnchor = vAnchor;
}
`;

/**
 * What a thing is to the painter: 1 the world (strokes stay in the world), 2 a figure
 * (strokes stay on it as it moves and bends), 3 a hero (a figure the player must never
 * lose: an enemy, a pickup, the ball), 4 kept (drawn exactly as the game drew it, with
 * no strokes and no line: a sight's reticle, lettering on a sign, a screen). Say it with
 * object.userData.brushRole = "world" | "figure" | "hero" | "keep" | "skip" on the thing or any
 * parent, or with a role function. Unsaid, skinned meshes and anything seen to move are
 * figures. `moved` is a WeakMap this function keeps its memory of positions in.
 */
export function brushRoleOf(object, say, moved) {
  let role = say?.(object);
  for (let o = object; role === undefined && o; o = o.parent) role = o.userData?.brushRole;
  if (role === "hero") return 3;
  if (role === "figure") return 2;
  if (role === "keep") return 4;
  if (role === "world") return 1;
  if (object.isSkinnedMesh) return 2;
  if (object.isInstancedMesh || object.isBatchedMesh) return 1;
  // Anything seen to move keeps its own space from then on, so its paint moves with it.
  // Once a figure, always a figure: a thing that stops must not have its strokes re-laid.
  let seen = moved.get(object);
  const e = object.matrixWorld.elements;
  const key = e[12] * 3.1 + e[13] * 5.7 + e[14] * 7.3 + e[0] * 11.1 + e[5] * 13.7 + e[10] * 17.9 + e[1] + e[2] + e[4] + e[6] + e[8] + e[9];
  if (!seen) { seen = { key, moving: false }; moved.set(object, seen); }
  else if (!seen.moving && Math.abs(seen.key - key) > 1e-5) seen.moving = true;
  seen.key = key;
  return seen.moving ? 2 : 1;
}

/**
 * Plants the faults the role rules exist to prevent: a role that does not reach a
 * child, a thing that moves and then stops flipping back to the world (which re-lays
 * its strokes), and a hero losing its role to the moving-thing default.
 */
/**
 * How the anchor pass cuts a material's shape, as the visible material does: `map` is read
 * for its alpha and `mask`, the alphaMap, for its GREEN, which is the channel three.js reads
 * an alphaMap from. A grey mask has opaque alpha everywhere, so reading its alpha painted
 * over the holes in a fence or a leaf card (Greptile on opengamehq/opengame#27). `cut` is the
 * alpha below which a pixel is not there, 0 when the shape is the mesh's own.
 */
export function brushCutOf(mat) {
  const map = mat?.map ?? null, mask = mat?.alphaMap ?? null;
  const cut = (map || mask) && (mat.alphaTest > 0 || mat.transparent) ? (mat.alphaTest > 0 ? mat.alphaTest : 0.5) : 0;
  return cut > 0 ? { map, mask, cut } : { map: null, mask: null, cut: 0 };
}

export function selfTest() {
  const failures = [];
  let examined = 0;
  // A grey alphaMap is read from green, never as the map's alpha.
  const mask = { isTexture: true }, colour = { isTexture: true };
  const fence = brushCutOf({ alphaMap: mask, alphaTest: 0.4 });
  examined++; if (fence.map !== null || fence.mask !== mask || fence.cut !== 0.4) failures.push("an alphaMap was not cut by its green channel");
  const leaves = brushCutOf({ map: colour, alphaMap: mask, transparent: true });
  examined++; if (leaves.map !== colour || leaves.mask !== mask || leaves.cut !== 0.5) failures.push("a map and an alphaMap together did not both cut");
  examined++; if (brushCutOf({ map: colour }).cut !== 0) failures.push("an opaque material was cut");
  examined++; if (!/texture\(tCutMask, vCut\)\.g/.test(ANCHOR_FRAG) || /texture\(tCutMask, vCut\)\.a/.test(ANCHOR_FRAG)) failures.push("the anchor shader does not read the alphaMap's green");
  const thing = (extra = {}) => { const o = new THREE.Object3D(); Object.assign(o, extra); o.updateMatrixWorld(true); return o; };
  const moved = new WeakMap();
  const enemy = thing(); enemy.userData.brushRole = "hero";
  const limb = thing(); enemy.add(limb); limb.updateMatrixWorld(true);
  examined++; if (brushRoleOf(limb, undefined, moved) !== 3) failures.push("a role on a parent did not reach its child");
  const wall = thing();
  examined++; if (brushRoleOf(wall, undefined, moved) !== 1) failures.push("a still thing was not the world");
  const door = thing();
  brushRoleOf(door, undefined, moved);
  door.position.x = 2; door.updateMatrixWorld(true);
  examined++; if (brushRoleOf(door, undefined, moved) !== 2) failures.push("a thing that moved did not become a figure");
  examined++; if (brushRoleOf(door, undefined, moved) !== 2) failures.push("a thing that moved and stopped went back to the world");
  // Planted: judging by this frame's motion alone forgets the door the moment it stops.
  const byThisFrame = (object, memory) => { const k = object.matrixWorld.elements[12]; const was = memory.get(object); memory.set(object, k); return was !== undefined && was !== k ? 2 : 1; };
  const memory = new Map(); const planted = thing();
  byThisFrame(planted, memory); planted.position.x = 2; planted.updateMatrixWorld(true); byThisFrame(planted, memory);
  if (byThisFrame(planted, memory) !== 1) failures.push("the planted forgetful rule was not caught");
  const skinned = thing({ isSkinnedMesh: true });
  examined++; if (brushRoleOf(skinned, undefined, moved) !== 2) failures.push("a skinned mesh was not a figure");
  examined++; if (brushRoleOf(skinned, () => "world", moved) !== 1) failures.push("the role function did not win");
  return { ok: failures.length === 0, examined, failures };
}

const _scale = new THREE.Vector3();
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();

export class BrushStrokeStyle {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {object} [options]
   * @param {string} [options.look]      a name from BRUSH_LOOKS ("wet" is the reference)
   * @param {number} [options.scale]     paint resolution as a share of the canvas (1 = full)
   * @param {(object: THREE.Object3D) => "world" | "figure" | "hero" | "skip" | undefined} [options.role]
   *        say what a thing is to the painter; return undefined to let
   *        object.userData.brushRole or the defaults decide (see _kind)
   * @param {(object: THREE.Object3D) => boolean} [options.skip]
   *        things left out of the anchor pass (they are painted as part of what is behind them)
   */
  constructor(renderer, options = {}) {
    this.renderer = renderer;
    this.options = options;
    this.state = new BrushState(BRUSH_LOOKS);
    this.enabled = true;
    this.scale = options.scale ?? 1;
    this._moved = new WeakMap();
    this._size = new THREE.Vector2();
    const floatOk = renderer.capabilities.isWebGL2 && renderer.extensions.has("EXT_color_buffer_float");
    if (!floatOk) console.warn("brush-stroke-shader-style: no float render targets here; strokes fall back to the screen tier.");
    this.floatOk = floatOk;

    const target = (type, mips, depth) => new THREE.WebGLRenderTarget(4, 4, {
      type, format: THREE.RGBAFormat, depthBuffer: depth, stencilBuffer: false,
      minFilter: mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: mips,
      colorSpace: THREE.NoColorSpace,
    });
    // The game's frame, drawn exactly as it would reach the canvas. three only applies its
    // tone curve and output transfer when it believes it is drawing to the screen, and a
    // render target flagged this way is treated as one: the same pixels the player saw,
    // in display values, with mips for the strokes to read.
    this.capture = options.capture ?? "display";
    if (this.capture === "display") {
      this.sceneTarget = new THREE.WebGLRenderTarget(4, 4, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: true, samples: 0, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true, colorSpace: THREE.SRGBColorSpace });
      this.sceneTarget.isXRRenderTarget = true;
    } else {
      // "linear": a half-float frame in working space, developed by the pass below.
      this.sceneTarget = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: true, samples: options.samples ?? 4, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
    }
    this.frameTarget = target(THREE.UnsignedByteType, true, false);
    // Two of each: this frame's and the last one's, swapped every frame, so the paint can
    // be steadied against where each surface was a frame ago.
    const anchors = () => new THREE.WebGLRenderTarget(4, 4, { type: floatOk ? THREE.FloatType : THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: true, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false });
    this.anchorTarget = anchors(); this.anchorWas = anchors();
    this.paintTarget = target(THREE.UnsignedByteType, false, false); this.paintWas = target(THREE.UnsignedByteType, false, false);
    this.prevViewProj = new THREE.Matrix4(); this.viewProj = new THREE.Matrix4();
    this._history = 0;

    this.anchorMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: ANCHOR_VERT, fragmentShader: ANCHOR_FRAG,
      uniforms: { uObject: { value: new THREE.Vector4(1, 1, 1, 1) }, uOffset: { value: new THREE.Vector3() }, uAirFar: { value: 120 }, tCut: { value: null }, tCutMask: { value: null }, uCutFrom: { value: new THREE.Vector2() }, uCut: { value: 0 } },
      side: THREE.DoubleSide, blending: THREE.NoBlending, toneMapped: false, fog: false,
    });

    const u = {};
    const v4 = () => ({ value: new THREE.Vector4() }), v3 = () => ({ value: new THREE.Vector3() });
    for (const name of BRUSH_VEC4) u[name] = v4();
    for (const name of BRUSH_VEC3) u[name] = v3();
    u.uRes = { value: new THREE.Vector2(4, 4) };
    u.uTime = { value: 0 };
    u.uSkyBasis = { value: new THREE.Matrix3() };
    u.uSceneLod = { value: 8 };
    u.tScene = { value: null }; u.tAnchor = { value: null }; u.tPainted = { value: null };
    u.tAnchorWas = { value: null }; u.tHistory = { value: null }; u.uPrevViewProj = { value: new THREE.Matrix4() };
    this.uniforms = u;
    const quad = (fragmentShader) => new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader, uniforms: u, depthTest: false, depthWrite: false, toneMapped: false, blending: THREE.NoBlending }));
    this.paintQuad = quad(PAINT_FRAG);
    this.printQuad = quad(PRINT_FRAG);
    this.developQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: DEVELOP_FRAG, uniforms: { tLinear: { value: null }, toneMappingExposure: { value: 1 } }, defines: {}, depthTest: false, depthWrite: false, toneMapped: false, blending: THREE.NoBlending }));
    this._tone = null;
    this.paintQuad.frustumCulled = this.printQuad.frustumCulled = this.developQuad.frustumCulled = false;
    this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    if (options.look) this.look(options.look);
    if (options.values) this.set(options.values);
  }

  /** The look's values, live: read them, or change them with set(). */
  get values() { return this.state.values; }
  get time() { return this.state.time; }

  /** Takes a named look whole, then any values given on top. */
  look(name, extra) { this.state.look(name, extra); return this; }

  /** Changes some values and keeps the rest. */
  set(values) { this.state.set(values); return this; }

  /** Rush lines: amount 0 to 1, from a point in uv (0,0 bottom left). */
  rush(amount, centre, count) { this.state.rush(amount, centre, count); return this; }

  /**
   * A hit frame: ink, then one flat colour, then the picture wiped back, with a lens push.
   * @param { { at?: [number, number], colour?: [number, number, number], ink?: number, flat?: number, wipe?: number, push?: number } } [hit]
   */
  hit(hit) { return this.state.hit(hit); }

  /** Paints the picture in, stroke by stroke. See BrushState.paintIn. */
  paintIn(options) { this.state.paintIn(options); return this; }

  /** No flashes: for players who ask for it. */
  set calm(value) { this.state.calm = !!value; }
  get calm() { return this.state.calm; }

  setSize(width, height) {
    const w = Math.max(2, Math.round(width * this.scale)), h = Math.max(2, Math.round(height * this.scale));
    this.sceneTarget.setSize(w, h);
    this.frameTarget.setSize(w, h);
    this.anchorTarget.setSize(w, h); this.anchorWas.setSize(w, h);
    this.paintTarget.setSize(w, h); this.paintWas.setSize(w, h);
    this._history = 0;
    this.uniforms.uRes.value.set(w, h);
    this.uniforms.uSceneLod.value = Math.floor(Math.log2(Math.max(w, h)));
  }

  _sync() {
    const size = this.renderer.getDrawingBufferSize(this._size);
    const w = Math.max(2, Math.round(size.x * this.scale)), h = Math.max(2, Math.round(size.y * this.scale));
    if (this.paintTarget.width !== w || this.paintTarget.height !== h) this.setSize(size.x, size.y);
  }

  _kind(object) { return brushRoleOf(object, this.options.role, this._moved); }

  /**
   * Draws anchor space for this frame. Call once a frame before paint().
   * For a second scene or camera drawn over the first (a first-person weapon, a
   * character viewer), call it again with { clear: false, figure: true }: depth is
   * cleared so it lands on top, and everything in it carries its own space.
   * Give layers (a THREE.Layers) when the things to anchor are not on the layers the
   * camera normally sees, such as a first-person body kept on its own layer.
   * @param { { clear?: boolean, figure?: boolean, layers?: THREE.Layers } } [layer]
   */
  renderAnchors(scene, camera, layer = {}) {
    const clear = layer.clear ?? true;
    if (clear) {
      // A new frame: what was this frame's anchors and camera becomes the last frame's.
      const t = this.anchorWas; this.anchorWas = this.anchorTarget; this.anchorTarget = t;
      this.prevViewProj.copy(this.viewProj);
      this.viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    }
    const forceFigure = layer.figure ?? false;
    this._sync();
    const renderer = this.renderer;
    const material = this.anchorMaterial;
    const hidden = [];
    const patched = [];
    scene.traverseVisible((object) => {
      if (!(object.isMesh || object.isSkinnedMesh)) {
        if (object.isPoints || object.isLine || object.isSprite) { hidden.push(object); object.visible = false; }
        return;
      }
      const mat = Array.isArray(object.material) ? object.material[0] : object.material;
      // A role said out loud always decides. Unsaid, things with no surface of their own
      // (smoke, sparks, glass, additive glows) are left out, so they are painted as part
      // of what is behind them.
      let said;
      for (let o = object; said === undefined && o; o = o.parent) said = o.userData.brushRole;
      said = this.options.role?.(object) ?? said;
      const ghost = !mat || (mat.transparent && mat.opacity < 0.9 && !mat.alphaTest) || mat.depthWrite === false || mat.blending === THREE.AdditiveBlending || mat.side === THREE.BackSide;
      const skip = this.options.skip?.(object) ?? (said === "skip" || object.userData.brushSkip || (said === undefined && ghost));
      if (skip) { hidden.push(object); object.visible = false; return; }
      // A shape cut out of a texture (leaves, a fence, a reticle) is cut the same way here.
      const { map: cutMap, mask: cutMask, cut } = brushCutOf(mat);
      const kind = Math.max(this._kind(object), forceFigure ? 2 : 1);
      const before = object.onBeforeRender;
      patched.push([object, before]);
      object.onBeforeRender = function (r, s, c, g, m, group) {
        if (m === material) {
          const u = material.uniforms;
          u.tCut.value = cutMap; u.tCutMask.value = cutMask; u.uCut.value = cut;
          u.uCutFrom.value.set(cutMap ? 1 : 0, cutMask ? 1 : 0);
          if (kind > 1) { object.matrixWorld.decompose(_position, _quaternion, _scale); u.uObject.value.set(_scale.x, _scale.y, _scale.z, kind); const id = object.id; u.uOffset.value.set((id * 7.31) % 23, (id * 3.77) % 19, (id * 5.13) % 17); }
          else u.uObject.value.set(1, 1, 1, 1);
          material.uniformsNeedUpdate = true;
        }
      };
    });
    const state = { target: renderer.getRenderTarget(), override: scene.overrideMaterial, background: scene.background, clear: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha(), auto: renderer.autoClear, shadow: renderer.shadowMap.autoUpdate, fog: scene.fog };
    material.uniforms.uAirFar.value = this.state.values.airDistance;
    scene.overrideMaterial = material;
    scene.background = null;
    scene.fog = null;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(this.anchorTarget);
    renderer.setClearColor(0x000000, 0);
    renderer.autoClear = true;
    if (clear) renderer.clear(true, true, false); else renderer.clear(false, true, false);
    renderer.autoClear = false;
    const seen = camera.layers.mask;
    if (layer.layers) camera.layers.mask = layer.layers.mask;
    renderer.render(scene, camera);
    camera.layers.mask = seen;
    scene.overrideMaterial = state.override;
    scene.background = state.background;
    scene.fog = state.fog;
    renderer.shadowMap.autoUpdate = state.shadow;
    renderer.setClearColor(state.clear, state.alpha);
    renderer.autoClear = state.auto;
    renderer.setRenderTarget(state.target);
    for (const object of hidden) object.visible = true;
    for (const [object, before] of patched) object.onBeforeRender = before;
  }

  _uniforms(camera, dt) {
    const u = this.uniforms;
    let sky;
    if (camera) {
      const p = camera.projectionMatrix.elements;
      sky = [1 / p[0], 1 / p[5], camera.isPerspectiveCamera ? 1 : 0];
      u.uSkyBasis.value.setFromMatrix4(camera.matrixWorld);
    }
    // History is only trusted once there is a last frame, and never while a paint-in runs.
    const packed = this.state.pack(dt, { depth: true, sky, history: this._history > 1 && !this.state.painting });
    this._history++;
    u.uTime.value = packed.uTime;
    for (const name of BRUSH_VEC4) u[name].value.fromArray(packed[name]);
    for (const name of BRUSH_VEC3) u[name].value.fromArray(packed[name]);
  }

  /** Paints a finished frame (a texture, display referred) to the current render target. */
  paint(frameTexture, camera, dt = 1 / 60) {
    this._sync();
    const renderer = this.renderer, u = this.uniforms;
    this._uniforms(camera, dt);
    const state = { target: renderer.getRenderTarget(), auto: renderer.autoClear };
    renderer.autoClear = false;
    this._before = frameTexture;
    u.tScene.value = frameTexture; u.tAnchor.value = this.anchorTarget.texture;
    { const t = this.paintWas; this.paintWas = this.paintTarget; this.paintTarget = t; }
    u.tAnchorWas.value = this.anchorWas.texture; u.tHistory.value = this.paintWas.texture;
    u.uPrevViewProj.value.copy(this.prevViewProj);
    renderer.setRenderTarget(this.paintTarget);
    renderer.render(this.paintQuad, this.quadCamera);
    u.tPainted.value = this.paintTarget.texture;
    renderer.setRenderTarget(state.target);
    renderer.render(this.printQuad, this.quadCamera);
    renderer.autoClear = state.auto;
  }

  /**
   * Draws the last frame again to the current render target without rendering the
   * scene: "after" is the painted frame, "before" the game's own. One run then gives a
   * before and an after of the very same moment.
   */
  present(which = "after") {
    const renderer = this.renderer;
    const auto = renderer.autoClear;
    renderer.autoClear = false;
    if (which === "before") {
      if (!this.copyQuad) {
        this.copyQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: "precision highp float; in vec2 vUv; out vec4 o; uniform sampler2D tFrame; void main() { o = vec4(textureLod(tFrame, vUv, 0.0).rgb, 1.0); }", uniforms: { tFrame: { value: null } }, depthTest: false, depthWrite: false, toneMapped: false, blending: THREE.NoBlending }));
        this.copyQuad.frustumCulled = false;
      }
      this.copyQuad.material.uniforms.tFrame.value = this._before;
      renderer.render(this.copyQuad, this.quadCamera);
    } else renderer.render(this.printQuad, this.quadCamera);
    renderer.autoClear = auto;
  }

  /** In place of renderer.render(scene, camera): the whole thing. */
  render(scene, camera, dt = 1 / 60) {
    const renderer = this.renderer;
    if (!this.enabled) { renderer.render(scene, camera); return; }
    this._sync();
    const state = { target: renderer.getRenderTarget(), auto: renderer.autoClear };
    renderer.setRenderTarget(this.sceneTarget);
    renderer.clear();
    renderer.render(scene, camera);
    let frame = this.sceneTarget.texture;
    if (this.capture !== "display") {
      // Develop: tone curve and transfer, once, into a frame with mips for the strokes to read.
      const develop = this.developQuad.material;
      if (this._tone !== renderer.toneMapping) {
        this._tone = renderer.toneMapping;
        develop.defines = TONE_DEFINES[renderer.toneMapping] ? { [TONE_DEFINES[renderer.toneMapping]]: "" } : {};
        develop.needsUpdate = true;
      }
      develop.uniforms.tLinear.value = this.sceneTarget.texture;
      develop.uniforms.toneMappingExposure.value = renderer.toneMappingExposure;
      renderer.autoClear = false;
      renderer.setRenderTarget(this.frameTarget);
      renderer.render(this.developQuad, this.quadCamera);
      renderer.autoClear = state.auto;
      frame = this.frameTarget.texture;
    }
    renderer.setRenderTarget(state.target);
    this.renderAnchors(scene, camera);
    this.paint(frame, camera, dt);
  }

  dispose() {
    for (const t of [this.sceneTarget, this.frameTarget, this.anchorTarget, this.anchorWas, this.paintTarget, this.paintWas]) t.dispose();
    for (const q of [this.paintQuad, this.printQuad, this.developQuad, this.copyQuad].filter(Boolean)) { q.geometry.dispose(); q.material.dispose(); }
    this.anchorMaterial.dispose();
  }
}
