/**
 * brush-stroke-shader-style: the engine-agnostic core.
 *
 * Two fragment stages, written in GLSL ES 3.00 and kept free of engine names so they
 * port line for line to HLSL, WGSL, Godot and Unreal custom nodes:
 *
 *   PAINT  turns the game's finished frame into laid brush strokes. Every stroke is a
 *          flat dab of one colour, read from the frame at the stroke's own centre, and
 *          it lives in ANCHOR space (the world, an object's rest pose, or a 2D world),
 *          so the paint stays on the surface when the camera moves.
 *   PRINT  finishes the painted frame as a print: lens, colour fringe, paper tooth,
 *          rush lines and hit frames. It never changes where a stroke is.
 *
 * An adapter supplies two functions before BRUSH_PAINT is compiled:
 *
 *   vec4 brushScene(vec2 uv, float lod)  the frame's colour, display referred, 0 to 1.
 *                                        lod is a mip level; return the nearest you have.
 *   vec4 brushAnchor(vec2 uv)            xyz: where this pixel is in anchor space, in
 *                                        world units. w: 0 sky or nothing, 1 the world,
 *                                        2 a figure (a moving thing with its own space).
 *
 * Everything else is uniforms. Nothing here reads a clock except uTime, and nothing
 * moves a stroke unless uLens.w (boil) is above zero.
 */

export const BRUSH_UNIFORMS = /* glsl */ `
uniform vec2 uRes;        // size of the output in pixels
uniform float uTime;      // seconds
uniform vec4 uStroke2;    // x the way strokes are pulled on the ground (radians from anchor x), y how bold the occasional accent stroke is, z how many sizes of stroke are laid (2 to 4), w 1 to keep the sky as the game drew it
uniform vec4 uStroke;     // x length of a broad stroke as a share of the frame height, y aspect, z wander (radians), w density
uniform vec4 uBristle;    // x dry brush, y streak contrast, z ragged ends, w bristles across a stroke
uniform vec4 uDetail;     // x colour difference that earns a medium stroke, y a touch, z a fine touch, w stroke scale on figures
uniform vec4 uColour;     // x saturation, y contrast, z hue jitter, w value jitter
uniform vec4 uTone2;      // x how far black is lifted toward the shade colour, y how far the picture is keyed (0 as the game drew it, 1 fully to the target), z the mean brightness a keyed picture comes to, w how strongly shade takes the shade colour
uniform vec4 uTone;       // x how hard values are stepped, y number of steps, z where shade begins, w where light begins
uniform vec3 uShadeTint;  // what shade is mixed toward
uniform vec3 uLightTint;  // what light is multiplied by
uniform vec3 uPaper;      // bare paper
uniform vec3 uInk;        // the line
uniform vec4 uAir;        // rgb what distance fades toward, a how far it goes
uniform vec4 uRole2;      // x how far a hero takes the shade colour, y how far a figure does, z a ring of paper round every hero (0 none, 1 full), w unused
uniform vec4 uRole;       // x how clean a figure stays (0 all strokes, 1 its own detail), y the same for hero things, z line weight on figures, w line weight on the world
uniform vec4 uPaperFx;    // x tooth, y bare paper between strokes, z paper at the frame edge, w painted in (0 bare, 1 finished)
uniform vec4 uInkFx;      // x line width in pixels of a 1080 frame, y strength, z wobble, w crease sensitivity
uniform vec4 uDots;       // x halftone strength, y cell in pixels of a 1080 frame, z angle, w how deep shade must be
uniform vec4 uLens;       // x fisheye, y colour fringe, z grain, w boil
uniform vec4 uSky;        // xy tan of half the field of view (x, y), z 1 when the camera is perspective, w sky stroke scale
uniform mat3 uSkyBasis;   // camera rotation, columns right, up, back
uniform vec4 uMode;       // x 1 when anchors carry depth (ink from the surface), 0 when they are flat (ink from the colour), y colour difference that stops a stroke crossing an edge (0 off), z the way strokes are pulled on a flat picture, w how far the second set of anchors has been painted in (two-field adapters only)
uniform vec4 uTemporal;   // x how much of last frame's paint is kept on each surface (0 none, 0.9 very steady), yzw unused
uniform mat4 uPrevViewProj; // the last frame's view-projection, for adapters that keep a history
uniform vec4 uReveal;     // x mode (0 none, 1 from the centre, 2 along a direction), y angle, z softness, w what is under unpainted areas (0 paper, 1 the game's frame)
`;

export const BRUSH_COMMON = /* glsl */ `
const float PI = 3.14159265;
float hash11(float n) { return fract(sin(n * 127.1 + 11.7) * 43758.5453123); }
float hash21(vec2 p) { vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
vec2 hash22(vec2 p) { vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); q += dot(q, q.yzx + 33.33); return fract((q.xx + q.yz) * q.zy); }
vec3 hash23(vec2 p) { vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); q += dot(q, q.yxz + 33.33); return fract((q.xxy + q.yzz) * q.zyx); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 hueTurn(vec3 c, float a) {
  // Rotates colour about the grey axis: a hue shift that keeps value.
  const vec3 k = vec3(0.57735);
  float ca = cos(a), sa = sin(a);
  return c * ca + cross(k, c) * sa + k * dot(k, c) * (1.0 - ca);
}
`;

export const BRUSH_PAINT = /* glsl */ `
#ifdef BRUSH_TWO_FIELDS
// Two sets of anchors, the second laid over the first as it comes in: how a picture
// with no depth is repainted a little at a time instead of letting its strokes smear.
int gField = 0;
vec4 brushAnchor(vec2 uv) { return brushAnchorIn(gField, uv); }
#else
const int gField = 0;
#endif

struct BrushSurface { vec3 p; vec3 dx; vec3 dy; vec3 n; float kind; float fp; float air; };

// The fourth anchor value carries two things: what the pixel is (0 sky, 1 the world,
// 2 a figure, 3 something the player must never lose sight of) and, in its fraction,
// how much air lies between it and the eye (0 near, 0.4 far).
float brushKind(float w) { return floor(w + 0.3); }
float brushAir(float w) { return clamp((w - floor(w + 0.3)) / 0.4, 0.0, 1.0); }

// The surface under a pixel: its place, how far one pixel moves across it, its normal.
// One-sided differences, so an edge between two things does not smear into both.
BrushSurface brushSurfaceAt(vec2 uv) {
  vec2 px = 1.0 / uRes;
  vec4 c = brushAnchor(uv);
  BrushSurface s;
  s.kind = brushKind(c.w);
  s.air = brushAir(c.w);
  s.p = c.xyz;
  if (s.kind < 0.5) {
    // Sky: placed by the direction it is seen in, so it turns with the camera and
    // never slides when the camera only moves. The direction is laid flat on the face
    // of a cube round the eye, which has no pole for strokes to wind round.
    vec2 ndc = uv * 2.0 - 1.0;
    vec3 dir = normalize(uSkyBasis * vec3(ndc * uSky.xy, -1.0));
    vec3 ad = abs(dir);
    int face = ad.y >= max(ad.x, ad.z) ? 1 : (ad.x > ad.z ? 0 : 2);
    float side = face == 1 ? sign(dir.y) : face == 0 ? sign(dir.x) : sign(dir.z);
    vec2 here = face == 1 ? dir.xz / ad.y : face == 0 ? dir.zy / ad.x : dir.xy / ad.z;
    vec3 dirx = normalize(uSkyBasis * vec3((ndc + vec2(2.0 * px.x, 0.0)) * uSky.xy, -1.0));
    vec3 diry = normalize(uSkyBasis * vec3((ndc + vec2(0.0, 2.0 * px.y)) * uSky.xy, -1.0));
    vec2 hx = face == 1 ? dirx.xz / abs(dirx.y) : face == 0 ? dirx.zy / abs(dirx.x) : dirx.xy / abs(dirx.z);
    vec2 hy = face == 1 ? diry.xz / abs(diry.y) : face == 0 ? diry.zy / abs(diry.x) : diry.xy / abs(diry.z);
    // Each face has its own stretch of the lattice, so no two faces repeat a pattern.
    s.p = vec3(here + vec2(float(face) * 37.0 + side * 11.0, side * 5.0), 0.0);
    s.dx = vec3(hx - here, 0.0);
    s.dy = vec3(hy - here, 0.0);
    s.n = vec3(0.0, 0.0, 1.0);
    s.fp = max(length(s.dx), length(s.dy));
    return s;
  }
  // Anchors carried by a measured flow are a little rough from pixel to pixel, so their
  // slope is read over a wider step; anchors drawn from real geometry are exact.
  float reach = uMode.x > 0.5 ? 1.0 : 2.0;
  vec4 l = brushAnchor(uv - vec2(px.x * reach, 0.0)), r = brushAnchor(uv + vec2(px.x * reach, 0.0));
  vec4 d = brushAnchor(uv - vec2(0.0, px.y * reach)), u = brushAnchor(uv + vec2(0.0, px.y * reach));
  vec3 dl = (c.xyz - l.xyz) / reach, dr = (r.xyz - c.xyz) / reach, dd = (c.xyz - d.xyz) / reach, du = (u.xyz - c.xyz) / reach;
  if (uMode.x < 0.5) { dl = dr = (r.xyz - l.xyz) / (2.0 * reach); dd = du = (u.xyz - d.xyz) / (2.0 * reach); }
  bool okl = brushKind(l.w) == s.kind, okr = brushKind(r.w) == s.kind, okd = brushKind(d.w) == s.kind, oku = brushKind(u.w) == s.kind;
  s.dx = (okl && (!okr || dot(dl, dl) < dot(dr, dr))) ? dl : dr;
  s.dy = (okd && (!oku || dot(dd, dd) < dot(du, du))) ? dd : du;
  vec3 n = cross(s.dx, s.dy);
  float nl = length(n);
  s.n = nl > 1e-12 ? n / nl : vec3(0.0, 1.0, 0.0);
  s.fp = max(length(s.dx), length(s.dy));
  return s;
}

// How much brighter the whole picture is painted than the game drew it. A painter
// keys a dark scene up so its shapes can be read; set once a pixel from the frame's mean.
float gKey = 1.0;
// How far the thing being painted takes the scheme's shade colour: the world wholly,
// a figure partly, a hero hardly, so what the player must find keeps its own colours.
float gScheme = 1.0;
// How hard values are stepped: the look's own strength for strokes, harder for the
// clean planes of a figure, which are drawn as flat cel tones.
float gStep = -1.0;
void brushSetKey() {
  float mean = luma(brushScene(vec2(0.5), 32.0).rgb);
  // Only ever up: a bright game is left as bright as it was drawn.
  gKey = mix(1.0, clamp(uTone2.z / max(mean, 0.02), 1.0, 2.6), uTone2.y);
}

// How light a colour looks as paint. Plain luminance calls a deep blue almost black, so
// lifting it "to the same value" as a grey makes it glow; half of the brightest channel
// is counted too, which is nearer to how the eye ranks a saturated colour.
float brushValue(vec3 c) { return 0.5 * luma(c) + 0.5 * max(c.r, max(c.g, c.b)); }

// Values stepped into planes, shade pulled toward a colour, light warmed.
vec3 brushTone(vec3 c, float h) {
  c *= gKey;
  // Keyed-up light rolls off instead of clipping.
  vec3 over = max(c - 0.8, 0.0);
  c = min(c, 0.8) + 0.2 * (1.0 - exp(-over * 5.0));
  float y = brushValue(c);
  // Value and colour are handled apart, so stepping the value never dirties the hue.
  // Near black there is no hue to keep, only noise that dividing would blow up into
  // patches of random colour: such a pixel is treated as grey.
  vec3 hue = mix(vec3(1.0), c / max(y, 1e-3), smoothstep(0.012, 0.06, y));
  float steps = max(uTone.y, 2.0);
  // Each step is a flat plane at the middle of its band, with a short turn into the next.
  // Only a little chance in which plane a stroke falls: a wall lit evenly is one plane,
  // and planes meet in a dabbed edge, not in a scatter of light and dark strokes.
  float b = clamp(y + (h - 0.5) * 0.12 / steps, 0.0, 0.9999) * steps;
  float fb = floor(b), fr = b - fb;
  float yq = (fb + 0.5 + 0.5 * (smoothstep(0.68, 1.0, fr) - (1.0 - smoothstep(0.0, 0.32, fr)))) / steps;
  float y2 = mix(y, yq, gStep < 0.0 ? uTone.x : gStep);
  // A wide turn into shade: a stroke whose value sits on the line leans, it does not flip.
  float shade = 1.0 - smoothstep(uTone.z - 0.16, uTone.z + 0.16, y2);
  float light = smoothstep(uTone.w - 0.1, uTone.w + 0.1, y2);
  // Shade is a colour. A grey or white surface in shade takes the shade colour almost
  // whole; a strongly coloured one keeps its own hue and only leans toward it. Mixing
  // the two halfway is what makes mud.
  float hi = max(c.r, max(c.g, c.b)), lo = min(c.r, min(c.g, c.b));
  float sat0 = (hi - lo) / max(hi, 1e-3);
  vec3 cool = uShadeTint / max(brushValue(uShadeTint), 1e-3);
  hue = mix(hue, cool, gScheme * uTone2.w * shade * mix(0.9, 0.25, smoothstep(0.12, 0.55, sat0)));
  // And shade is never black: it has a floor, so its shapes stay readable.
  // The floor is the scheme's, so a hero's black clothes stay black: lifted, a near-black
  // takes whatever hue its noise has (found on OG Snipes, where black trousers came out orange).
  y2 = mix(y2, max(y2, uTone2.x), shade * gScheme);
  c = hue * y2;
  c = mix(c, c * uLightTint, light);
  float y3 = luma(c);
  // Colour is strengthened where there is colour; a white wall stays white.
  float hi2 = max(c.r, max(c.g, c.b)), lo2 = min(c.r, min(c.g, c.b));
  float vib = smoothstep(0.03, 0.25, (hi2 - lo2) / max(hi2, 1e-3));
  c = mix(vec3(y3), c, mix(1.0, uColour.x, vib) * (1.0 + 0.3 * shade));
  c = (c - 0.5) * uColour.y + 0.5;
  return clamp(c, 0.0, 1.0);
}

// How much paint one stroke leaves at a point inside it. p is in the stroke's own
// frame: x along the pull from -1 (where the brush lands) to 1 (where it lifts),
// y across it. Returns coverage in x and the streak (which bristle) in y.
vec2 brushDab(vec2 p, float seed, float aaLong, float aaWide, float dry) {
  float bristles = uBristle.w;
  float row = (p.y * 0.5 + 0.5) * bristles;
  // Bristles clump: a clump of two or three shares one load of paint.
  float clump = floor(row + 0.6 * sin(row * 1.7 + seed * 40.0));
  float bh = hash11(clump * 3.17 + seed * 91.0);
  float bh2 = hash11(clump * 7.31 + seed * 37.0);
  float ragged = uBristle.z;
  float start = -1.0 + ragged * 0.16 * bh2;
  float stop = 1.0 - ragged * (0.06 + 0.5 * bh * bh) * (0.35 + 0.65 * dry);
  float along = smoothstep(start - aaLong, start + aaLong, p.x) * (1.0 - smoothstep(stop - aaLong, stop + aaLong, p.x));
  // The body narrows a little toward both ends and its sides wander.
  float wander = (vnoise(vec2(p.x * 2.3 + seed * 17.0, seed * 5.0)) - 0.5) * 0.16 * ragged;
  float halfw = 0.94 - 0.2 * p.x * p.x * p.x * p.x;
  float across = 1.0 - smoothstep(halfw - aaWide, halfw + aaWide, abs(p.y + wander));
  // A drying brush skips: toward the lift the paint breaks along the bristles.
  float tail = smoothstep(-0.2, 1.0, p.x);
  float skip = vnoise(vec2(p.x * 5.0 + seed * 9.0, clump * 1.91 + seed * 3.0));
  float gap = smoothstep(0.0, 0.14, skip + 0.42 * bh - dry * tail * 1.05 + (1.0 - dry) * 0.3);
  return vec2(along * across * gap, bh);
}

// What is under the strokes where no stroke lands: a thin wash of the frame's own
// colour, or bare paper.
vec3 brushWash(vec2 uv, float hsh) {
  return brushTone(brushScene(uv, 1.5).rgb, 0.5);
}

// How far from the frame's edge a point is, in shares of the frame height, with a
// wandering edge so the paint stops unevenly.
float brushEdge(vec2 uv) {
  vec2 a = vec2(uRes.x / uRes.y, 1.0);
  vec2 e = min(uv, 1.0 - uv) * a;
  float w = vnoise(uv * a * 5.0 + 3.7) * 0.6 + vnoise(uv * a * 13.0 + 9.1) * 0.4;
  return min(e.x, e.y) - (w - 0.25) * uPaperFx.z * 0.9;
}

// When a stroke is laid during a paint-in: 0 is first, 1 is last.
float brushOrder(vec2 uv, float level, float h) {
  float front = 0.0;
  vec2 a = vec2(uRes.x / uRes.y, 1.0);
  if (uReveal.x > 1.5) {
    vec2 dir = vec2(cos(uReveal.y), sin(uReveal.y));
    float span = abs(dir.x) * a.x + abs(dir.y);
    front = dot((uv - 0.5) * a, dir) / span + 0.5;
  } else {
    front = length((uv - 0.5) * a) / length(a * 0.5);
  }
  // Big strokes first, touches last, each as a front that moves across the frame.
  return clamp(front * 0.62 + clamp(level, -1.0, 3.0) * 0.07 + 0.07 + h * 0.17, 0.0, 1.0);
}

// prior: what is already painted here (rgb, and a = how much of it is paint).
// fade: the share of this layer's strokes that have been laid, 0 to 1.
vec4 brushPaint(vec2 uv, BrushSurface s, vec4 prior, float fade, bool over) {
  // Kept things are not painted at all: the game's own pixel, as it drew it. The sky
  // can be kept too, for a starfield or a sky that is already a painting.
  if (s.kind > 3.5 || (s.kind < 0.5 && uStroke2.w > 0.5)) return vec4(brushScene(uv, 0.0).rgb, 1.0);
  vec3 scene = brushScene(uv, 0.0).rgb;
  float sky = step(s.kind, 0.5);
  float figure = step(1.5, s.kind);
  float hero = step(2.5, s.kind);
  gScheme = hero > 0.5 ? uRole2.x : figure > 0.5 ? uRole2.y : 1.0;

  // The plane the strokes lie in: the axis the surface faces most.
  vec3 an = abs(s.n);
  int axis = an.y >= max(an.x, an.z) * 0.85 ? 1 : (an.x > an.z ? 0 : 2);
  if (sky > 0.5) axis = 2;
  vec2 q = axis == 1 ? s.p.xz : axis == 0 ? s.p.zy : s.p.xy;
  vec2 qx = axis == 1 ? s.dx.xz : axis == 0 ? s.dx.zy : s.dx.xy;
  vec2 qy = axis == 1 ? s.dy.xz : axis == 0 ? s.dy.zy : s.dy.xy;
  float det = qx.x * qy.y - qx.y * qy.x;
  float fpMin = min(length(qx), length(qy));
  float fpMax = max(length(qx), length(qy));
  // A plane seen on edge would be laid in slivers; size strokes nearer the long way.
  float fp = exp2(mix(log2(max(fpMin, 1e-9)), log2(max(fpMax, 1e-9)), 0.7));
  if (abs(det) < 1e-14 || fp < 1e-8) { return over ? prior : vec4(brushTone(scene, 0.5), 1.0); }

  float scale = uStroke.x * (sky > 0.5 ? uSky.w : 1.0) * mix(1.0, uDetail.w, figure);
  float target = scale * uRes.y * fp;          // length of a broad stroke, in anchor units
  float L = log2(target);
  float oTop = floor(L) + 1.0;
  float aspect = max(uStroke.y, 1.0);

  // Under everything: the wash, or paper.
  float washH = hash21(floor(q / exp2(oTop + 1.0)));
  vec3 wash = brushWash(uv, washH);
  float edgeHere = brushEdge(uv);
  float paperHere = 1.0 - smoothstep(-0.01, 0.03, edgeHere);
  vec3 under = mix(wash, uPaper, max(uPaperFx.y, paperHere));
  float painted = 1.0 - max(uPaperFx.y, paperHere);
  vec3 col = under;
  float revealOn = step(0.5, uReveal.x);
  if (over) { col = prior.rgb; painted = prior.a; }
  if (revealOn > 0.5 && !over) {
    // The strokes lead. The thin wash between them only fills in once they have passed,
    // so the front of a paint-in is made of strokes and never of a soft edge.
    float o = brushOrder(uv, 3.0, vnoise(uv * vec2(uRes.x / uRes.y, 1.0) * 60.0));
    float shown = smoothstep(o + 0.1, o + 0.1 + uReveal.z, uPaperFx.w * 1.3);
    vec3 bare = mix(uPaper, scene, uReveal.w);
    col = mix(bare, col, shown);
    painted *= shown;
  }

  float boilTick = uLens.w > 0.0 ? floor(uTime * 8.0) : 0.0;
  float streak = 0.5;
  float shadeAmt = 0.0;

  // Four sizes of stroke, the largest first: each smaller size is only laid where the
  // frame differs from what the larger ones already put there.
  for (int k = 0; k < 4; k++) {
    if (float(k) >= uStroke2.z) break;
    float o = oTop - float(k);
    float S = exp2(o);
    float level = L - o;                         // -1 too big .. 3 fine
    // Larger strokes go one way, the next size slants, touches cross.
    float turnBy = k == 0 ? 0.0 : k == 1 ? 0.0 : k == 2 ? 0.2 : 0.55;
    float base = (axis == 1 ? uStroke2.x : uMode.x > 0.5 ? PI * 0.5 : uMode.z) + turnBy;
    if (sky > 0.5) base = 0.06 + turnBy * 0.4;
    float cb = cos(base), sb = sin(base);
    // The lattice is turned to the pull and stretched along it; rows are staggered.
    vec2 g = vec2(cb * q.x + sb * q.y, -sb * q.x + cb * q.y) / vec2(S * aspect, S);
    float rowId = floor(g.y);
    g.x += 0.5 * mod(rowId, 2.0) + hash11(rowId * 1.37 + o * 7.0) * 0.6;
    vec2 cellId = floor(g);

    float best = -1.0, next = -1.0;
    vec4 bestA = vec4(0.0), nextA = vec4(0.0);   // xy centre in q, z coverage, w seed
    vec2 bestB = vec2(0.0), nextB = vec2(0.0);   // x streak, y dryness
    for (int j = -1; j <= 1; j++) {
      // Each row has its own stagger, so the neighbour rows are found again.
      float rj = rowId + float(j);
      vec2 gj = vec2(cb * q.x + sb * q.y, -sb * q.x + cb * q.y) / vec2(S * aspect, S);
      gj.x += 0.5 * mod(rj, 2.0) + hash11(rj * 1.37 + o * 7.0) * 0.6;
      float cx = floor(gj.x);
      for (int i = -1; i <= 1; i++) {
        vec2 id = vec2(cx + float(i), rj);
        vec3 h = hash23(id + vec2(o * 17.0 + float(axis) * 5.0 + float(gField) * 31.0, boilTick * 0.731 + figure * 3.0));
        float seed = h.x + h.y * 0.37 + o * 0.11;
        // Does this size of stroke belong here at all: too big fades out, right-sized stays.
        float keep = level < 0.0 ? clamp(2.0 * (level + 1.0), 0.0, 1.0) : 1.0;
        // A stroke comes and goes by degrees as the camera closes on it. Cutting it in or
        // out at a threshold is a pop, and a frame full of pops is flicker.
        float lay = smoothstep(0.0, 0.25, keep * uStroke.w * 1.25 - h.z);
        if (lay <= 0.0) continue;
        vec2 jit = (hash22(id * 1.31 + o) - 0.5) * vec2(0.5, 0.42);
        vec2 cg = id + 0.5 + jit;
        float turn = (h.y - 0.5) * 2.0 * uStroke.z;
        float ct = cos(turn), st = sin(turn);
        // Into the stroke's own frame, in lattice units, then normalised to -1..1.
        vec2 dg = (gj - cg) * vec2(aspect, 1.0);
        vec2 lp = vec2(ct * dg.x + st * dg.y, -st * dg.x + ct * dg.y);
        float lenH = aspect * (0.62 + 0.3 * h.x), widH = 0.6 + 0.22 * h.z;
        vec2 p = lp / vec2(lenH, widH);
        if (abs(p.x) > 1.05 || abs(p.y) > 1.1) continue;
        float dry = clamp(uBristle.x * (0.55 + 0.9 * hash11(seed * 13.0)), 0.0, 1.0);
        float aaL = fp / (S * lenH) * 1.2, aaW = fp / (S * widH) * 1.2;
        vec2 dab = brushDab(p, seed, aaL, aaW, dry);
        dab.x *= lay;
        if (dab.x < 0.02) continue;
        float pri = hash11(seed * 5.3) + 0.001;
        // Centre back in q.
        vec2 cl = (cg - vec2(0.5 * mod(rj, 2.0) + hash11(rj * 1.37 + o * 7.0) * 0.6, 0.0)) * vec2(S * aspect, S);
        vec2 cq = vec2(cb * cl.x - sb * cl.y, sb * cl.x + cb * cl.y);
        if (pri > best) { next = best; nextA = bestA; nextB = bestB; best = pri; bestA = vec4(cq, dab.x, seed); bestB = vec2(dab.y, dry); }
        else if (pri > next) { next = pri; nextA = vec4(cq, dab.x, seed); nextB = vec2(dab.y, dry); }
      }
    }

    // Lay the lower of the two first, then the upper over it.
    for (int t = 1; t >= 0; t--) {
      float pri = t == 1 ? next : best;
      if (pri < 0.0) continue;
      vec4 A = t == 1 ? nextA : bestA;
      vec2 B = t == 1 ? nextB : bestB;
      // Where the stroke's centre is on screen: step across the surface from here.
      vec2 dq = A.xy - q;
      vec2 ab = vec2(dq.x * qy.y - dq.y * qy.x, qx.x * dq.y - qx.y * dq.x) / det;
      vec2 cuv = uv + ab / uRes;
      if (cuv.x < -0.02 || cuv.x > 1.02 || cuv.y < -0.02 || cuv.y > 1.02) { cuv = clamp(cuv, 0.0, 1.0); }
      vec4 ca = brushAnchor(cuv);
      if (sky < 0.5) {
        // The centre must really be there, on this surface: not hidden, not another thing.
        if (brushKind(ca.w) != s.kind) continue;
        vec2 cq2 = axis == 1 ? ca.xz : axis == 0 ? ca.zy : ca.xy;
        float off = axis == 1 ? ca.y - s.p.y : axis == 0 ? ca.x - s.p.x : ca.z - s.p.z;
        if (length(cq2 - A.xy) > S * aspect * 0.42 || abs(off) > S * aspect * 0.9) continue;
      } else if (brushKind(ca.w) > 0.5) continue;
      float sizePx = S / fp;
      float lod = clamp(log2(max(sizePx * 0.3, 1.0)), 0.0, 6.0);
      vec3 sc = brushScene(cuv, lod).rgb;
      // With no depth to say where one thing ends, the colour says it: a stroke does
      // not reach across an edge to a place that looks nothing like its own centre.
      if (uMode.y > 0.0) { vec3 own = brushScene(uv, max(lod - 1.0, 0.0)).rgb - sc; if (length(own) > uMode.y * (1.0 + 0.6 * clamp(level, 0.0, 3.0))) continue; }
      vec3 hj = hash23(vec2(A.w * 311.0, A.w * 77.0 + 1.0));
      vec3 paint = brushTone(sc, hj.x);
      // No two loads of paint are mixed alike.
      paint = hueTurn(paint, (hj.y - 0.5) * 2.0 * uColour.z);
      // Loads differ in warmth more than in value, and lean lighter rather than dirtier.
      float dv = (hj.z - 0.42) * 2.0 * uColour.w;
      paint = paint * (1.0 + dv) + vec3(0.02, 0.0, -0.02) * (hj.x - 0.5) * 40.0 * uColour.w;
      // Air: what is far is laid paler and nearer the paper, in whole strokes.
      float air = brushAir(ca.w);
      paint = mix(paint, uAir.rgb, uAir.a * smoothstep(0.0, 1.0, air + (hj.y - 0.5) * 0.2));
      // Now and then a stroke of a bolder mix: one in eight, never more, so a plane stays a plane.
      float sat1 = max(paint.r, max(paint.g, paint.b)) - min(paint.r, min(paint.g, paint.b));
      float bold = step(0.875, hash11(A.w * 71.0)) * uStroke2.y * smoothstep(0.08, 0.3, sat1);
      paint = hueTurn(paint, (hj.y - 0.5) * 0.5 * bold) * (1.0 + (hj.x - 0.4) * 0.22 * bold);
      // Smaller strokes are earned: only where they say something the paint under them does not.
      float need = level < 0.5 ? 0.0 : level < 1.5 ? mix(0.0, uDetail.x, level - 0.5) : level < 2.5 ? mix(uDetail.x, uDetail.y, level - 1.5) : mix(uDetail.y, uDetail.z, clamp(level - 2.5, 0.0, 1.0));
      vec3 dc = paint - col;
      float differs = length(dc) + 0.5 * abs(luma(dc));
      float fade = level > 0.0 && level < 1.0 ? clamp(2.0 * (1.0 - level), 0.0, 1.0) : 1.0;
      float lod0 = hash11(A.w * 19.0);
      if (hash11(A.w * 43.0) > fade) continue;
      // A smaller stroke is laid in proportion to how much it has to say: at the threshold
      // it is faint, well past it it is whole. So a surface whose colour wavers across a
      // threshold gets a stroke that breathes a little instead of one that blinks.
      float said = differs * mix(1.0, 1.7, figure);
      float earned = need <= 0.0 ? 1.0 : smoothstep(need * 0.8, need * 1.6 + 0.02, said);
      if (level > 0.0 && level < 1.0) earned = max(earned * 0.0 + smoothstep(0.0, 0.25, fade * 1.25 - lod0), smoothstep(uDetail.x * 0.8, uDetail.x * 1.6, said));
      if (earned <= 0.0) continue;
      // The frame's edge: a stroke is whole or it is not there.
      float ce = brushEdge(cuv);
      if (ce < uPaperFx.z * (0.02 + 0.1 * lod0)) continue;
      float a = A.z * earned;
      if (revealOn > 0.5) {
        float ord = brushOrder(cuv, level, lod0);
        if (uPaperFx.w * 1.3 < ord) continue;
        // A stroke is drawn on along its length as it is laid.
        a *= smoothstep(0.0, 0.03, uPaperFx.w * 1.3 - ord);
      }
      // The streaks of the bristles: two values of the one colour.
      paint = paint * (1.0 + (B.x - 0.5) * uBristle.y) + (B.x - 0.5) * 0.35 * uBristle.y;
      col = mix(col, paint, a);
      painted = max(painted, a);
      streak = mix(streak, B.x, a);
    }
  }
  return vec4(col, painted);
}

// The ink line: wherever the surface breaks (an outline) or folds (a crease).
float brushInk(vec2 uv, BrushSurface s) {
  if (uInkFx.y <= 0.0) return 0.0;
  vec2 px = 1.0 / uRes;
  float k = uRes.y / 1080.0;
  vec2 a = vec2(uRes.x / uRes.y, 1.0);
  // The hand wavers and presses unevenly.
  float press = 0.55 + 0.9 * vnoise(uv * a * 26.0 + 5.0);
  vec2 wob = (vec2(vnoise(uv * a * 38.0 + 11.0), vnoise(uv * a * 38.0 + 47.0)) - 0.5) * uInkFx.z * 2.4 * k;
  // Figures carry the full line. The world's is lighter, and lighter still with distance,
  // so the line gathers on what moves and what matters.
  float weight = s.kind > 1.5 ? uRole.z : uRole.w * (1.0 - 0.75 * s.air);
  float r = max(uInkFx.x * k * press * 0.5 * max(weight, uRole.z * 0.6), 0.75);
  vec2 c = uv + wob * px;
  if (uMode.x < 0.5) {
    // No surface to read: the line follows where the picture's colour breaks.
    float rr0 = max(r, 1.0);
    vec3 l0 = brushScene(c - vec2(rr0, 0.0) * px, 1.0).rgb, r0 = brushScene(c + vec2(rr0, 0.0) * px, 1.0).rgb;
    vec3 d0 = brushScene(c - vec2(0.0, rr0) * px, 1.0).rgb, u0 = brushScene(c + vec2(0.0, rr0) * px, 1.0).rgb;
    float g = length(r0 - l0) + length(u0 - d0);
    return smoothstep(uInkFx.w * 0.42, uInkFx.w * 0.75, g);
  }
  vec4 m = brushAnchor(c);
  vec4 l = brushAnchor(c - vec2(r, 0.0) * px), rr = brushAnchor(c + vec2(r, 0.0) * px);
  vec4 d = brushAnchor(c - vec2(0.0, r) * px), u = brushAnchor(c + vec2(0.0, r) * px);
  float km = brushKind(m.w), kl = brushKind(l.w), kr = brushKind(rr.w), kd = brushKind(d.w), ku = brushKind(u.w);
  float kindEdge = step(0.5, abs(kl - km) + abs(kr - km) + abs(kd - km) + abs(ku - km));
  // An edge with a figure on either side is the figure's line.
  float figureEdge = kindEdge * step(1.5, max(max(km, kl), max(max(kr, kd), ku)));
  if (km < 0.5) return max(figureEdge * min(uRole.z, 1.0), kindEdge * min(uRole.w, 1.0));
  // On a flat surface the second difference lies in the surface, however steeply it
  // is seen, so only the part along the normal counts: that is a fold or a step.
  vec3 lap = (l.xyz + rr.xyz - 2.0 * m.xyz);
  vec3 lap2 = (d.xyz + u.xyz - 2.0 * m.xyz);
  float fp = max(s.fp, 1e-9) * r;
  float e = max(abs(dot(lap, s.n)), abs(dot(lap2, s.n))) / fp;
  // A step in depth far larger than the surface could make by turning.
  float far = max(length(lap), length(lap2)) / (max(s.fp, 1e-9) * uRes.y * 0.06);
  float line = max(smoothstep(uInkFx.w, uInkFx.w * 1.6, e), smoothstep(0.7, 1.2, far));
  return max(max(line, kindEdge) * min(weight, 1.0), figureEdge * min(uRole.z, 1.0));
}

// Brush entry point: paints, then inks, then prints the dot screen in the shade.
// rgb: the painted frame. a: how much of this pixel is paint (0 is bare paper).
vec4 brushFrame(vec2 uv) {
  brushSetKey();
  BrushSurface s = brushSurfaceAt(uv);
  vec4 paint = brushPaint(uv, s, vec4(0.0), 1.0, false);
#ifdef BRUSH_TWO_FIELDS
  if (uMode.w > 0.0) {
    gField = 1;
    BrushSurface s2 = brushSurfaceAt(uv);
    paint = brushPaint(uv, s2, paint, uMode.w, true);
    gField = 0;
  }
#endif
  vec3 col = paint.rgb;
  float k = uRes.y / 1080.0;
  // What the player must read stays itself: a figure keeps its own shapes under the
  // paint, in the same stepped values, and only its broad planes are given to strokes.
  if (s.kind > 1.5 && s.kind < 3.5) {
    float clean = s.kind > 2.5 ? uRole.y : uRole.x;
    if (clean > 0.0) { gStep = max(uTone.x, 0.9); col = mix(col, brushTone(brushScene(uv, 0.6).rgb, 0.5), clean * paint.a); gStep = -1.0; }
  }

  // Halftone: a dot screen, only where the paint is in shade.
  if (uDots.x > 0.0) {
    float y = luma(col);
    float deep = 1.0 - smoothstep(uDots.w - 0.12, uDots.w + 0.04, y);
    float cell = max(uDots.y * k, 2.5);
    float ca = cos(uDots.z), sa = sin(uDots.z);
    vec2 dq = mat2(ca, -sa, sa, ca) * (uv * uRes) / cell;
    float rad = 0.2 + 0.26 * deep;
    float dot1 = 1.0 - smoothstep(rad - 0.9 / cell, rad + 0.9 / cell, length(fract(dq) - 0.5));
    col = mix(col, col * mix(vec3(1.0), uShadeTint * 0.9, 0.75), dot1 * deep * uDots.x * paint.a);
  }

  // A hero is ringed in paper outside its line, so it stands off any ground, light or dark.
  if (uRole2.z > 0.0 && s.kind < 2.5) {
    vec2 px = 1.0 / uRes;
    float reach = uInkFx.x * k * uRole.z * (1.0 + 1.6 * uRole2.z);
    float near = 0.0;
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.7853982;
      float kk = brushKind(brushAnchor(uv + vec2(cos(a), sin(a)) * reach * px).w);
      near = max(near, step(2.5, kk) * step(kk, 3.5));
    }
    col = mix(col, uPaper, near * min(uRole2.z, 1.0));
  }
  float ink = s.kind > 3.5 ? 0.0 : brushInk(uv, s) * uInkFx.y;
  if (ink > 0.0) {
    // The line breaks on the tooth of the paper and is not laid before the paint is.
    float tooth = vnoise(uv * uRes * 0.55);
    ink *= smoothstep(0.08, 0.32, tooth + 0.3);
    ink *= mix(1.0, smoothstep(0.0, 0.25, paint.a), 0.85);
    vec3 line = mix(uInk, col * uInk * 1.6, 0.25);
    col = mix(col, line, clamp(ink, 0.0, 1.0));
  }
#ifdef BRUSH_HISTORY
  // Steady the picture on the surface. Where this pixel's surface was on screen a frame
  // ago is known exactly (the anchors say what it is, the last camera says where it
  // was), so the paint laid there last frame is carried forward and this frame's paint
  // is worked into it. A stroke that would have blinked on is laid over several frames.
  if (uTemporal.x > 0.0) {
    vec2 was = uv;
    bool held = false;
    if (s.kind < 0.5) {
      vec3 dir = normalize(uSkyBasis * vec3((uv * 2.0 - 1.0) * uSky.xy, -1.0));
      vec4 c = uPrevViewProj * vec4(dir, 0.0);
      if (c.w > 1e-5) { was = c.xy / c.w * 0.5 + 0.5; held = brushKind(brushAnchorWas(was).w) < 0.5; }
    } else if (s.kind < 1.5) {
      vec4 c = uPrevViewProj * vec4(s.p, 1.0);
      if (c.w > 1e-5) {
        was = c.xy / c.w * 0.5 + 0.5;
        vec4 a0 = brushAnchorWas(was);
        held = brushKind(a0.w) == 1.0 && length(a0.xyz - s.p) < max(s.fp * 4.0, 1e-4);
      }
    } else {
      // A figure carries its own space, so only one that has hardly moved on screen is held.
      vec4 a0 = brushAnchorWas(uv);
      held = brushKind(a0.w) == s.kind && length(a0.xyz - s.p) < max(s.fp * 2.5, 1e-4);
    }
    if (held && was.x > 0.0 && was.x < 1.0 && was.y > 0.0 && was.y < 1.0) col = mix(col, brushHistory(was).rgb, uTemporal.x);
  }
#endif
  return vec4(col, paint.a);
}
`;

/**
 * PRINT. The adapter supplies:
 *   vec4 brushPainted(vec2 uv)   the PAINT stage's output.
 * and the uniforms above plus the event uniforms below.
 */
export const BRUSH_PRINT_UNIFORMS = /* glsl */ `
uniform vec4 uRush;       // x amount, yz centre (uv), w how many lines
uniform vec4 uHit;        // x stage (0 none, 1 ink, 2 flat, 3 wipe), y progress through the stage, zw where it landed (uv)
uniform vec3 uHitColour;  // the flat frame's one colour
uniform vec4 uPunch;      // x lens push, y shake x, z shake y, w unused
`;

export const BRUSH_PRINT = /* glsl */ `
vec2 brushLens(vec2 uv, float bend) {
  // A wide lens bends straight lines round the centre. Scaled so the corners stay put.
  vec2 a = vec2(uRes.x / uRes.y, 1.0);
  vec2 c = (uv - 0.5) * a;
  float r2 = dot(c, c), rm = dot(a * 0.5, a * 0.5);
  float f = (1.0 + bend * r2) / (1.0 + bend * rm);
  return c * f / a + 0.5;
}

// Rush lines: hand-pulled rays from a point, each a tapered bristle stroke, redrawn
// on threes so they read as drawn and not as an overlay.
vec2 brushRush(vec2 uv, float amount, vec2 centre, float count) {
  if (amount <= 0.0) return vec2(0.0);
  vec2 a = vec2(uRes.x / uRes.y, 1.0);
  vec2 d = (uv - centre) * a;
  float r = length(d), ang = atan(d.y, d.x);
  // Redrawn twelve times a second: often enough to read as drawn, seldom enough not to strobe.
  float drawing = floor(uTime * 12.0);
  float n = count;
  float slot = (ang / (2.0 * PI) + 0.5) * n;
  float id = floor(slot);
  float white = 0.0, dark = 0.0;
  for (int i = -1; i <= 1; i++) {
    float sid = mod(id + float(i), n);
    vec3 h = hash23(vec2(sid * 7.13, drawing * 3.7 + 1.0));
    if (h.x > 0.35 + 0.6 * amount) continue;
    float centreA = (sid + 0.5 + (h.y - 0.5) * 0.7) / n;
    float da = (ang / (2.0 * PI) + 0.5) - centreA;
    da -= floor(da + 0.5);
    float inner = 0.26 + 0.34 * h.z - 0.14 * amount;
    float outer = inner + 0.25 + 0.7 * hash11(sid * 3.3 + drawing);
    float t = (r - inner) / max(outer - inner, 1e-3);
    if (t < 0.0 || t > 1.0) continue;
    // A wedge: fine where it starts near the centre, broad where it leaves the frame.
    float half_ = (0.0016 + 0.0075 * h.y * h.y) * (0.25 + 1.6 * t) * (0.6 + amount);
    float across = abs(da) * 2.0 * PI * r;
    float hair = vnoise(vec2(da * n * 60.0, sid * 5.0 + drawing));
    float body = 1.0 - smoothstep(half_ * (0.55 + 0.5 * hair), half_ * (0.75 + 0.5 * hair) + 1.2 / uRes.y, across);
    float ends = smoothstep(0.0, 0.07, t) * (1.0 - smoothstep(0.82 - 0.3 * hair, 1.0, t));
    float v = body * ends;
    if (hash11(sid * 11.7 + drawing * 0.31) < 0.24) dark = max(dark, v); else white = max(white, v);
  }
  return vec2(white, dark);
}

vec4 brushPrint(vec2 uv0) {
  vec2 a = vec2(uRes.x / uRes.y, 1.0);
  vec2 uv = uv0 + uPunch.yz;
  // The lens: bend, and a push toward where a blow landed.
  vec2 centre = uHit.x > 0.5 ? uHit.zw : vec2(0.5);
  uv = centre + (uv - centre) * (1.0 - uPunch.x);
  vec2 luv = brushLens(uv, uLens.x);
  vec4 p = brushPainted(luv);
  vec3 col = p.rgb;
  // Colour fringe: the red and blue plates printed a little off register, more at the edges.
  if (uLens.y > 0.0) {
    vec2 c = (luv - 0.5);
    float r2 = dot(c * a, c * a);
    float amt = uLens.y * 0.012 * r2;
    amt = min(amt, 5.0 / uRes.y);
    col.r = mix(col.r, brushPainted(0.5 + c * (1.0 + amt)).r, 0.85);
    col.b = mix(col.b, brushPainted(0.5 + c * (1.0 - amt)).b, 0.85);
  }
  if (luv.x < 0.0 || luv.x > 1.0 || luv.y < 0.0 || luv.y > 1.0) col = uPaper;

  // Hit frames. Ink: the frame floods with ink and paper rays burst from the blow.
  // Flat: one colour in two values. Wipe: the picture comes back behind a toothed edge.
  if (uHit.x > 0.5) {
    float y = luma(col);
    vec2 burst = brushRush(uv0, 1.0, uHit.zw, 46.0);
    vec3 inked = mix(uInk, uPaper, max(burst.x, step(0.62, y) * 0.0));
    inked = mix(inked, uPaper, smoothstep(0.55, 0.75, y) * 0.9 * p.a * step(0.5, 1.0 - burst.x));
    vec3 flat_ = mix(uHitColour * 0.62, uHitColour, smoothstep(0.34, 0.4, y));
    flat_ = mix(flat_, uPaper, smoothstep(0.78, 0.84, y));
    flat_ = mix(flat_, uInk, burst.y * 0.9);
    flat_ = mix(flat_, uPaper, burst.x);
    if (uHit.x < 1.5) col = inked;
    else if (uHit.x < 2.5) col = flat_;
    else {
      vec2 d = (uv0 - uHit.zw) * a;
      float ang = atan(d.y, d.x);
      float teeth = vnoise(vec2(ang * 9.0, 3.0)) * 0.22 + vnoise(vec2(ang * 31.0, 7.0)) * 0.08;
      float front = uHit.y * 1.9 - teeth;
      float edge = length(d) - front;
      col = mix(col, flat_, step(0.0, edge));
      col = mix(col, uInk, (1.0 - smoothstep(0.0, 0.012, abs(edge))) * 0.9);
    }
  }

  // Rush lines over the picture.
  vec2 rush = brushRush(uv0, uRush.x, uRush.yz, uRush.w);
  col = mix(col, uInk, rush.y * 0.92);
  col = mix(col, vec3(1.0, 0.99, 0.96), rush.x * 0.95);

  // Paper tooth: bites the light paint most. Then still grain.
  float tooth = vnoise(uv0 * uRes * 0.7) * 0.6 + vnoise(uv0 * uRes * 0.23) * 0.4;
  float fibre = vnoise(uv0 * uRes * vec2(0.05, 0.6));
  float y2 = luma(col);
  col *= 1.0 - uPaperFx.x * ((0.07 + 0.07 * smoothstep(0.15, 0.7, y2)) * (tooth - 0.5) * 2.0 + 0.04 * (fibre - 0.5));
  col += (hash21(uv0 * uRes + floor(uTime * 12.0) * 7.0) - 0.5) * uLens.z * 0.06;
  return vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

/** Every look value, with what it means, its range and the reference default ("wet"). */
export const BRUSH_DEFAULTS = Object.freeze({
  strokeSize: 0.32, strokeAspect: 2.6, strokeWander: 0.14, strokeDensity: 1.0, accent: 0.25, sizes: 3,
  dry: 0.35, streak: 0.05, ragged: 1.0, bristles: 9,
  detailMedium: 0.2, detailTouch: 0.3, detailFine: 0.42, figureScale: 0.45,
  saturation: 1.45, contrast: 1.08, hueJitter: 0.02, valueJitter: 0.022, steady: 0.86,
  toneSteps: 4, toneStrength: 0.8, shadeLevel: 0.3, lightLevel: 0.8, blackLift: 0.16, key: 1.0, keyTarget: 0.36, shadeColour: 0.9,
  shadeTint: [0.36, 0.34, 0.78], lightTint: [1.02, 1.01, 0.98],
  paper: [0.937, 0.902, 0.839], ink: [0.133, 0.125, 0.227],
  paperTooth: 0.2, paperGaps: 0.0, paperEdge: 0.0, paintedIn: 1.0,
  inkWidth: 2.6, inkStrength: 0.9, inkWobble: 1.0, inkCrease: 2.4,
  dotsStrength: 0.45, dotsCell: 9.0, dotsAngle: 0.49, dotsLevel: 0.2,
  fisheye: 0.0, fringe: 0.25, grain: 0.1, boil: 0.0,
  skyScale: 2.0, skyKeep: 0, groundPull: 1.5708,
  revealMode: 0, revealAngle: 0.0, revealSoft: 0.06, revealBase: 0.0,
  flatEdge: 0.22, flatPull: 0.6,
  air: 0.45, airColour: [0.93, 0.92, 0.9], airDistance: 120,
  figureClean: 0.45, heroClean: 0.8, figureLine: 1.25, worldLine: 0.8, heroShade: 0.15, figureShade: 0.6, heroHalo: 0.0,
});


export const BRUSH_VEC4 = Object.freeze(["uTemporal", "uAir", "uRole", "uRole2", "uStroke", "uStroke2", "uBristle", "uDetail", "uColour", "uTone", "uTone2", "uPaperFx", "uInkFx", "uDots", "uLens", "uSky", "uReveal", "uMode", "uRush", "uHit", "uPunch"]);
export const BRUSH_VEC3 = Object.freeze(["uShadeTint", "uLightTint", "uPaper", "uInk", "uHitColour"]);

/**
 * The look and its events, with no engine in it. An adapter owns one, calls pack()
 * once a frame and copies the arrays into its uniforms.
 */
export class BrushState {
  constructor(looks = {}) {
    this.looks = looks;
    this.values = { ...BRUSH_DEFAULTS };
    this.events = { rush: 0, rushCentre: [0.5, 0.5], rushCount: 64, hit: null };
    this.time = 0;
    this.hitColour = [0.92, 0.36, 0.3];
    /** No flashes: hit frames are not drawn and rush lines are held low. For players who ask for it. */
    this.calm = false;
    this.lastHit = -1e9;
    /** The least time between two hit frames, in seconds. A hit asked for sooner is dropped. */
    this.hitGap = 3;
    this.painting = null;
  }

  /** Takes a named look whole, then any values given on top. */
  look(name, extra) {
    const look = this.looks[name];
    if (!look) throw new Error(`brush-stroke-shader-style: no look called "${name}". Have: ${Object.keys(this.looks).join(", ")}`);
    this.values = { ...BRUSH_DEFAULTS, ...look, ...(extra ?? {}) };
  }

  /** Changes some values and keeps the rest. */
  set(values) { Object.assign(this.values, values); }

  /** Rush lines: amount 0 to 1, from a point in uv (0,0 bottom left). */
  rush(amount, centre = [0.5, 0.5], count = 64) { this.events.rush = amount; this.events.rushCentre = centre; this.events.rushCount = count; }

  /**
   * A hit frame: ink, then one flat colour, then the picture wiped back, with a lens
   * push. Durations are seconds and each stage lasts at least one drawn frame.
   */
  hit(hit = {}) {
    if (this.calm || this.events.hit || this.time - this.lastHit < this.hitGap) return false;
    this.lastHit = this.time;
    this.events.hit = { at: hit.at ?? [0.5, 0.5], colour: hit.colour ?? null, ink: hit.ink ?? 0.07, flat: hit.flat ?? 0.07, wipe: hit.wipe ?? 0.12, push: hit.push ?? 0.05, started: this.time };
    return true;
  }

  /**
   * Paints the picture in, stroke by stroke: at a level start, a respawn, a cut.
   * from: "centre", or an angle in radians for a front that crosses the frame.
   * over: "paper" starts from a bare sheet, "game" paints over the game's own frame.
   */
  paintIn({ seconds = 1.2, from = "centre", over = "paper" } = {}) {
    this.painting = { started: this.time, seconds, mode: from === "centre" ? 1 : 2, angle: from === "centre" ? 0 : from, base: over === "game" ? 1 : 0 };
  }

  /**
   * @param {number} dt seconds since the last frame
   * @param { { depth?: boolean, sky?: [number, number, number], edge?: number, pull?: number, history?: boolean } } [mode]
   *        depth: anchors carry real depth. sky: tan of half the field of view (x, y)
   *        and 1 for a perspective camera. edge and pull: for flat pictures.
   */
  pack(dt, mode = {}) {
    const v = this.values, e = this.events;
    this.time += dt;
    let reveal = [v.revealMode, v.revealAngle, v.revealSoft, v.revealBase], paintedIn = v.paintedIn;
    if (this.painting) {
      const t = (this.time - this.painting.started) / this.painting.seconds;
      if (t >= 1) this.painting = null;
      // Quick to start, slow to finish: the last touches take the longest.
      else { reveal = [this.painting.mode, this.painting.angle, v.revealSoft, this.painting.base]; paintedIn = 1 - (1 - t) * (1 - t); }
    }
    const out = {
      uTime: this.time,
      uStroke: [v.strokeSize, v.strokeAspect, v.strokeWander, v.strokeDensity],
      uStroke2: [v.groundPull, v.accent, v.sizes, v.skyKeep],
      uBristle: [v.dry, v.streak, v.ragged, v.bristles],
      uDetail: [v.detailMedium, v.detailTouch, v.detailFine, v.figureScale],
      uColour: [v.saturation, v.contrast, v.hueJitter, v.valueJitter],
      uTone: [v.toneStrength, v.toneSteps, v.shadeLevel, v.lightLevel],
      uTone2: [v.blackLift, v.key, v.keyTarget, v.shadeColour],
      uShadeTint: v.shadeTint, uLightTint: v.lightTint, uPaper: v.paper, uInk: v.ink,
      uPaperFx: [v.paperTooth, v.paperGaps, v.paperEdge, paintedIn],
      uInkFx: [v.inkWidth, v.inkStrength, v.inkWobble, v.inkCrease],
      uTemporal: [mode.history ? v.steady : 0, 0, 0, 0],
      uAir: [...v.airColour, v.air], uRole: [v.figureClean, v.heroClean, v.figureLine, v.worldLine], uRole2: [v.heroShade, v.figureShade, v.heroHalo, 0],
      uDots: [v.dotsStrength, v.dotsCell, v.dotsAngle, v.dotsLevel],
      uLens: [v.fisheye, this.calm ? 0 : v.fringe, v.grain, v.boil],
      uReveal: reveal,
      uMode: [mode.depth === false ? 0 : 1, mode.depth === false ? (mode.edge ?? v.flatEdge) : 0, mode.pull ?? v.flatPull, mode.fade ?? 0],
      uSky: [mode.sky ? mode.sky[0] : 1, mode.sky ? mode.sky[1] : 1, mode.sky ? mode.sky[2] : 1, v.skyScale],
      uRush: [this.calm ? Math.min(e.rush, 0.25) : e.rush, e.rushCentre[0], e.rushCentre[1], e.rushCount],
      uHit: [0, 0, 0.5, 0.5], uPunch: [0, 0, 0, 0], uHitColour: this.hitColour,
    };
    // Calm turned on with a hit already asked for, or part drawn: it is dropped, flash and
    // push alike, not played out (Greptile on opengamehq/opengame#27).
    if (this.calm) e.hit = null;
    const hit = e.hit;
    if (hit) {
      // A stage ends when its time is up AND it has been drawn once, so a slow frame
      // cannot swallow the ink or the flat colour: three drawings, always.
      const lengths = [hit.ink, hit.flat, hit.wipe];
      if (hit.stage === undefined) { hit.stage = 0; hit.stageStarted = this.time; hit.drawn = false; }
      while (hit.stage < 3 && hit.drawn && this.time - hit.stageStarted >= lengths[hit.stage]) { hit.stage++; hit.stageStarted = this.time; hit.drawn = false; }
      if (hit.stage >= 3) e.hit = null;
      else {
        hit.drawn = true;
        const progress = Math.min(1, (this.time - hit.stageStarted) / Math.max(lengths[hit.stage], 1e-6));
        out.uHit = [hit.stage + 1, progress, hit.at[0], hit.at[1]];
        // The push lands at once and eases out over the whole hit.
        const total = hit.ink + hit.flat + hit.wipe;
        const k = Math.max(0, 1 - (this.time - hit.started) / total);
        out.uPunch = [hit.push * k * k, 0, 0, 0];
        if (hit.colour) this.hitColour = hit.colour;
        out.uHitColour = this.hitColour;
      }
    }
    return out;
  }
}

/**
 * Plants the faults this file exists to prevent and fails unless each is caught: a
 * uniform declared in the shader that pack() never fills, a hit frame whose drawings a
 * slow frame swallows, hit frames fired back to back, and a flash in calm mode.
 */
export function selfTest() {
  const failures = [];
  let examined = 0;
  const declared = [...(BRUSH_UNIFORMS + BRUSH_PRINT_UNIFORMS).matchAll(/uniform\s+(vec[34]|float|mat3|vec2)\s+(u[A-Za-z0-9]+)/g)].map((m) => ({ type: m[1], name: m[2] }));
  const adapterOwned = new Set(["uRes", "uTime", "uSkyBasis"]);
  const unpacked = (packed) => declared.filter((u) => !adapterOwned.has(u.name) && !(Array.isArray(packed[u.name]) && packed[u.name].length === Number(u.type.slice(3)) && packed[u.name].every(Number.isFinite)));
  const packed = new BrushState().pack(1 / 60);
  examined += declared.length;
  for (const u of unpacked(packed)) failures.push(`pack() does not fill ${u.name} (${u.type})`);
  for (const name of [...BRUSH_VEC4, ...BRUSH_VEC3]) if (!declared.some((u) => u.name === name)) failures.push(`${name} is packed but no shader declares it`);
  // Planted: the same pack with one uniform dropped must be noticed.
  const planted = { ...packed }; delete planted.uRole;
  if (unpacked(planted).length !== 1) failures.push("a dropped uniform was not noticed");

  // Three drawings at any frame time, even one frame longer than the whole hit.
  for (const dt of [1 / 144, 1 / 60, 1 / 20, 0.5]) {
    const state = new BrushState();
    state.pack(dt); state.hit();
    const seen = [];
    for (let i = 0; i < 400 && (i === 0 || state.events.hit); i++) seen.push(state.pack(dt).uHit[0]);
    examined++;
    for (const stage of [1, 2, 3]) if (!seen.includes(stage)) failures.push(`at ${Math.round(1 / dt)} fps the hit frame skipped drawing ${stage}`);
  }
  // Planted: stages advanced by the clock alone lose drawings at a slow frame.
  const byClock = (dt) => { const seen = new Set(); for (let t = 0; t < 0.26; t += dt) seen.add(t < 0.07 ? 1 : t < 0.14 ? 2 : 3); return seen.size; };
  if (byClock(0.5) === 3) failures.push("the planted clock-only hit frame was not caught");

  // No two hit frames back to back, and none in calm mode.
  const gap = new BrushState();
  gap.pack(1 / 60);
  examined += 3;
  if (gap.hit() !== true) failures.push("the first hit was refused");
  for (let i = 0; i < 60; i++) gap.pack(1 / 60);
  if (gap.hit() !== false) failures.push("a second hit inside the gap was allowed");
  for (let i = 0; i < 200; i++) gap.pack(1 / 60);
  if (gap.hit() !== true) failures.push("a hit after the gap was refused");
  const calm = new BrushState(); calm.calm = true; calm.pack(1 / 60);
  if (calm.hit() !== false) failures.push("calm mode drew a hit frame");
  calm.rush(1);
  if (calm.pack(1 / 60).uRush[0] > 0.25) failures.push("calm mode drew full rush lines");
  // Calm turned on with a hit queued, and with one part drawn: neither flashes again.
  examined += 1;
  for (const drawnFirst of [false, true]) {
    const late = new BrushState(); late.pack(1 / 60);
    late.hit();
    if (drawnFirst) late.pack(1 / 60);
    late.calm = true;
    const after = late.pack(1 / 60);
    if (after.uHit[0] !== 0 || after.uPunch[0] !== 0 || late.events.hit) failures.push(`calm mode kept drawing a hit ${drawnFirst ? "already showing" : "queued before it"}`);
  }
  return { ok: failures.length === 0, examined, failures };
}
