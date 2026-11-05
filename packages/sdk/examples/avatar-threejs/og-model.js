/*
 * The player's OG as a Three.js group, built from `readAvatar`'s parts with geometry made here:
 * the head is the shape's real outline inflated into a soft pillow, painted with the real eye
 * style, markings and facial hair, and the body is spheres, capsules, lathes and discs. It
 * follows AVATAR-SPEC.md, and its lengths, colors and drawings come from og-spec.js, which is
 * generated from the same catalogue as the spec.
 *
 * The figure stands on y = 0, faces +z, and is 1 unit per H (the default round head's
 * height), about 2.5 units tall. Scale the group to your world.
 *
 * Copy this file and og-spec.js into your game and change the style freely: the spec's
 * "What makes it an OG" list is what has to survive.
 */
import * as THREE from 'three';
import { SPEC, SHAPES, HEADS, HATS, CLOTH, HAIR, HAIRSTYLES, DRAW, OUTLINES, FACES, EYES, FACIAL_HAIR } from './og-spec.js';

/* What to draw for a part this file does not know: the spec's defaults. */
const FALLBACK = { shape: 'circle', head: 'white', body: 'classic', legs: 'regular', shoes: 'classic', garment: CLOTH.slate };

/** Relative luminance, 0 for black and 1 for white. */
function luminance(hex) {
  const [r, g, b] = rgb(hex).map(c => c / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
/** A head color newer than og-spec.js gets eyes by the spec's rule, dark on a pale head and white on a dark one. The
    cut and the darkening here are this example's approximation of OpenGame's. */
function eyeInks(hex) {
  return luminance(hex) > 0.42 ? [mix(hex, '#08080C', 0.86), '#FFFFFF'] : ['#FFFFFF', '#08080C'];
}
const rgb = (hex) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const toHex = (channels) => `#${channels.map(c => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
const mix = (a, b, t) => { const x = rgb(a), y = rgb(b); return toHex(x.map((c, i) => c + (y[i] - c) * t)); };
/** `avatar` colors: the head's color darkened by garment (AVATAR-SPEC.md, "Colors that follow the head"). */
const darken = (hex, f) => toHex(rgb(hex).map(c => c * f + SPEC.followOffset * (1 - f)));

/** A run-length mask from og-spec.js back into one value per cell. */
function unmask(text, length) {
  const cells = new Uint8Array(length);
  let at = 0;
  for (const character of text) {
    const index = DRAW.alphabet.indexOf(character);
    const run = index % DRAW.runs + 1;
    cells.fill(Math.floor(index / DRAW.runs), at, at + run);
    at += run;
  }
  return cells;
}
/** A cropped drawing (eyes, facial hair) as a lookup: the value at a point in its own units, 0 outside it. */
function drawing(entry, step) {
  if (!entry) return () => 0;
  const [left, top, columns, rows, text] = entry;
  const cells = unmask(text, columns * rows);
  return (x, y) => {
    const i = Math.floor((x - left) / step), j = Math.floor((y - top) / step);
    return i < 0 || j < 0 || i >= columns || j >= rows ? 0 : cells[j * columns + i];
  };
}
/**
 * The head's paint, in the head's body units over DRAW.frame: the head color, its markings,
 * facial hair and eyes, as OpenGame paints them flat before lighting. Returns three canvases:
 * the front, a glow map that keeps the eyes their exact color under any light, and the back,
 * which has no face.
 */
function paintHead(head, colors) {
  const { cells: size, left, top, span } = DRAW.frame;
  const outline = unmask(OUTLINES[head.shape] ?? OUTLINES.circle, size * size);
  const [fx, fy, scale, spread, eyeLine, chin, jaw] = FACES[head.shape] ?? FACES.circle;
  const eyes = drawing(EYES[head.eyes] ?? EYES.classic, DRAW.eyeStep);
  const beard = drawing(head.facialHair ? FACIAL_HAIR[head.facialHair] : null, DRAW.hairStep);
  /* In face units: `u` across, 1 at the jaw; `t` down, 0 on the eye line and 1 at the chin. */
  const face = (x, y) => [(x - fx) / jaw, (y - eyeLine) / Math.max(chin - eyeLine, 0.2)];
  /* A beard that fills out the jaw adds to the outline (bit 2 of its drawing), so the head
     is inflated with it and the hair painted on it. */
  if (head.facialHair) for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const at = j * size + i;
    if (!outline[at] && beard(...face(left + (i + 0.5) * span / size, top + (j + 0.5) * span / size)) & 2) outline[at] = 1;
  }
  const haircut = HAIRSTYLES.includes(head.shape);
  /* The back of a hairstyle is hair on every row that has hair in it, so long hair falls down
     the back rather than showing a face-shaped patch of skin. */
  const hairRows = new Uint8Array(size);
  if (haircut) for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) if (outline[j * size + i] === 2) hairRows[j] = 1;
  const TEXELS = 256, texel = span / TEXELS, cell = span / size;
  const canvases = [0, 1, 2].map(() => Object.assign(document.createElement('canvas'), { width: TEXELS, height: TEXELS }));
  const [front, glow, back] = canvases.map(canvas => canvas.getContext('2d'));
  const images = [front, glow, back].map(context => context.createImageData(TEXELS, TEXELS));
  const put = (image, k, hex) => { const [r, g, b] = rgb(hex); image.data.set([r, g, b, 255], k); };
  const eyeInk = [null, colors.eyes, colors.light, DRAW.googly[0], DRAW.googly[1]];
  for (let row = 0; row < TEXELS; row++) for (let column = 0; column < TEXELS; column++) {
    const x = left + (column + 0.5) * texel, y = top + (row + 0.5) * texel;
    const j = Math.min(size - 1, Math.floor((y - top) / cell)), i = Math.min(size - 1, Math.floor((x - left) / cell));
    const value = outline[j * size + i], k = (row * TEXELS + column) * 4;
    /* Past the outline the texture keeps the head color, so a filtered edge never darkens. */
    const marked = value === 2;
    const hair = value !== 0 && (beard(...face(x, y)) & 1) === 1;
    const ground = hair ? colors.facial : marked ? colors.mark : colors.head;
    put(images[2], k, haircut && hairRows[j] ? colors.mark : marked ? colors.mark : colors.head);
    /* Eyes: the style around the face anchor, moved by the resting turn, with each half of
       the pair moved out on a face whose eyes sit wider apart. */
    let ex = (x - fx - DRAW.turn[0]) / scale;
    const ey = (y - fy - DRAW.turn[1]) / scale;
    if (spread !== 1) ex -= Math.sign(ex) * Math.min(Math.abs(ex), (spread - 1) * DRAW.eyeSpread);
    const ink = value === 0 ? 0 : eyes(ex, ey);
    if (!ink) { put(images[0], k, ground); put(images[1], k, '#000000'); continue; }
    let hex = eyeInk[ink];
    /* An eye on a patch keeps its colors while they read against the patch, and otherwise
       takes the head color, with a lighter patch color for its light. */
    if ((marked || hair) && ink <= 2 && contrast(colors.eyes, ground) < DRAW.eyeKeep) hex = ink === 1 ? colors.head : mix(ground, '#FFFFFF', 0.3);
    put(images[0], k, '#000000');
    put(images[1], k, hex);
  }
  images.forEach((image, index) => [front, glow, back][index].putImageData(image, 0, 0));
  return { outline, canvases };
}

/**
 * The outline inflated: each point inside it is `2 × √(inflate × d)` thick, `d` its distance
 * from the edge, so the head is soft at the rim and nearly flat across the face, as AVATAR-SPEC.md
 * describes. Built on the outline's own cell grid, with the edge vertices moved onto the smoothed
 * outline so it does not step. Returns a front and a back surface in H, placed on the body.
 */
function inflateHead(outline, middleY) {
  const { cells: size, left, top, span } = DRAW.frame;
  const cell = span / size, n = size + 1;
  const solid = (i, j) => i >= 0 && j >= 0 && i < size && j < size && outline[j * size + i] ? 1 : 0;
  /* How much of each cell corner is inside, then once more smoothed, cut at a half. */
  const raw = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) raw[j * n + i] = (solid(i - 1, j - 1) + solid(i, j - 1) + solid(i - 1, j) + solid(i, j)) / 4;
  const field = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    let sum = 0, count = 0;
    for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
      const x = i + a, y = j + b;
      if (x >= 0 && y >= 0 && x < n && y < n) { sum += raw[y * n + x] * (a || b ? 1 : 2); count += a || b ? 1 : 2; }
    }
    field[j * n + i] = sum / count;
  }
  const inside = (i, j) => field[j * n + i] > 0.5;
  const points = new Float32Array(n * n * 2), kind = new Uint8Array(n * n); // 1 inside, 2 on the edge
  const edge = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const at = j * n + i;
    points[at * 2] = left + i * cell; points[at * 2 + 1] = top + j * cell;
    if (inside(i, j)) { kind[at] = 1; continue; }
    let sx = 0, sy = 0, count = 0;
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = i + a, y = j + b;
      if (x < 0 || y < 0 || x >= n || y >= n || !inside(x, y)) continue;
      const t = (0.5 - field[at]) / (field[y * n + x] - field[at]);
      sx += left + (i + a * t) * cell; sy += top + (j + b * t) * cell; count++;
    }
    if (!count) continue;
    kind[at] = 2;
    points[at * 2] = sx / count; points[at * 2 + 1] = sy / count;
    edge.push(sx / count, sy / count);
  }
  /* Each inside corner's distance to the edge, then softened a few times with its neighbours:
     the raw distance has a crease along the middle of every shape, which lighting picks out. */
  const distance = new Float32Array(n * n);
  for (let at = 0; at < n * n; at++) {
    if (kind[at] !== 1) continue;
    const x = points[at * 2], y = points[at * 2 + 1];
    let d = Infinity;
    for (let e = 0; e < edge.length; e += 2) d = Math.min(d, (x - edge[e]) ** 2 + (y - edge[e + 1]) ** 2);
    distance[at] = Math.sqrt(d);
  }
  for (let pass = 0; pass < 4; pass++) {
    const last = distance.slice();
    for (let at = 0; at < n * n; at++) {
      if (kind[at] !== 1) continue;
      let sum = last[at] * 2, count = 2;
      for (const step of [1, -1, n, -n]) if (kind[at + step]) { sum += last[at + step]; count++; }
      distance[at] = sum / count;
    }
  }
  const unit = DRAW.unit;
  const front = [], back = [], uv = [], index = new Int32Array(n * n).fill(-1);
  let count = 0;
  for (let at = 0; at < n * n; at++) {
    if (!kind[at]) continue;
    const x = points[at * 2], y = points[at * 2 + 1], d = distance[at];
    const z = Math.sqrt(DRAW.inflate * d) * unit;
    const X = x * unit, Y = middleY - (y - DRAW.middle) * unit;
    front.push(X, Y, z); back.push(X, Y, -z);
    uv.push((x - left) / span, 1 - (y - top) / span);
    index[at] = count++;
  }
  /* Two triangles a cell, or one where a corner is outside, wound to face +z on the front. */
  const faces = [];
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const corners = [j * n + i, (j + 1) * n + i, (j + 1) * n + i + 1, j * n + i + 1].filter(at => kind[at]);
    if (corners.length < 3 || !corners.some(at => kind[at] === 1)) continue;
    const [a, b, c, d] = corners.map(at => index[at]);
    faces.push(a, b, c);
    if (d !== undefined) faces.push(a, c, d);
  }
  const surface = (positions, triangles) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(triangles);
    geometry.computeVertexNormals();
    return geometry;
  };
  const reversed = [];
  for (let f = 0; f < faces.length; f += 3) reversed.push(faces[f], faces[f + 2], faces[f + 1]);
  let topY = -Infinity, sumX = 0;
  for (let v = 0; v < front.length; v += 3) { topY = Math.max(topY, front[v + 1]); sumX += front[v]; }
  return { front: surface(front, faces), back: surface(back, reversed), top: topY, centreX: sumX / count };
}

/**
 * `theme` is the ground the OG stands on, as in a portrait: `dark` draws the inks OpenGame uses
 * on a dark page, which turns the Auto color (`mono`) white and changes nothing else. OpenGame
 * draws no light outline around a dark head on a dark page, in 2D or 3D, so neither does this.
 */
export function buildOg(avatar, { theme = 'light' } = {}) {
  const { head, outfit } = avatar;
  const dark = theme === 'dark';
  const group = new THREE.Group();
  group.name = 'og';
  const owned = { geometries: [], materials: new Map(), textures: [] };
  const material = (hex, options = {}) => {
    const key = `${hex}/${options.flat ? 1 : 0}/${options.double ? 1 : 0}`;
    const side = options.double ? THREE.DoubleSide : THREE.FrontSide;
    if (!owned.materials.has(key)) owned.materials.set(key, options.flat
      ? new THREE.MeshBasicMaterial({ color: hex, side })
      : new THREE.MeshStandardMaterial({ color: hex, roughness: 0.62, metalness: 0, side }));
    return owned.materials.get(key);
  };
  const add = (geometry, hex, parent = group, options) => {
    owned.geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, material(hex, options));
    parent.add(mesh);
    return mesh;
  };
  /* A capsule from one point down to another along -y in its parent, `length` end to end. */
  const capsule = (parent, hex, radius, length, top = 0) => {
    const mesh = add(new THREE.CapsuleGeometry(radius, Math.max(0.001, length - radius * 2), 6, 16), hex, parent);
    mesh.position.y = top - length / 2;
    return mesh;
  };

  /* Colors. The skin is the head: neck, hands and bare limbs. A head with its own inks for a
     dark ground carries them as a second three in HEADS. */
  const known = HEADS[head.color];
  const onGround = dark && known?.length === 6 ? known.slice(3) : known;
  const headHex = onGround?.[0] ?? head.hex ?? HEADS[FALLBACK.head][0];
  const [eyeHex, lightHex] = onGround?.slice(1, 3) ?? eyeInks(headHex);
  const skin = headHex;
  /* Markings and hair: a chosen hair color, or the head's own color pulled most of the way
     toward the marking ink the shape names (`contrast` picks dark on a pale head). Facial hair
     takes its own color, then the hair color, then the same rule leaning dark. */
  const tone = FACES[head.shape]?.[7];
  const markInk = (which) => mix(headHex, which === 'contrast' || !which ? (luminance(headHex) > 0.18 ? DRAW.marks.dark : DRAW.marks.light) : DRAW.marks[which], DRAW.markMix);
  const haircut = HAIRSTYLES.includes(head.shape);
  const markHex = haircut && HAIR[head.hairColor] ? HAIR[head.hairColor] : markInk(tone);
  let facialHex = HAIR[head.facialHairColor] ? mix(HAIR[head.facialHairColor], '#FFFFFF', DRAW.facialLift)
    : haircut && HAIR[head.hairColor] ? HAIR[head.hairColor] : markInk(tone ?? 'dark');
  if (DRAW.soft[head.facialHair]) facialHex = mix(headHex, facialHex, DRAW.soft[head.facialHair]);
  const paint = (color, factor) => color.followsHead ? (color.id === 'match' ? headHex : darken(headHex, factor)) : color.hex ?? FALLBACK.garment;
  const shirtId = outfit?.shirt ?? 'none';
  const shirt = shirtId === 'none' ? skin : paint(outfit.colors.shirt, SPEC.follow.shirts[shirtId] ?? SPEC.follow.shirts.tee);
  const bottoms = outfit ? paint(outfit.colors.bottoms, SPEC.follow.bottoms) : skin;
  const shoes = outfit ? paint(outfit.colors.shoes, SPEC.follow.shoes) : skin;
  const extra = outfit ? paint(outfit.colors.accessories, SPEC.follow.accessories) : skin;

  /* Proportions. */
  const [width, height, depth, armRadius, upperArm, lowerArm, legSpacing] = SPEC.bodies[outfit?.body] ?? SPEC.bodies[FALLBACK.body];
  const leg = SPEC.legs[outfit?.legs] ?? SPEC.legs[FALLBACK.legs];
  const hip = leg + SPEC.ankle;
  const collar = hip + height;

  /* Torso: the spec's profile, turned, with an oval cross-section. */
  const torso = add(new THREE.LatheGeometry(SPEC.torso.map(([r, y]) => new THREE.Vector2(r * width / 2, y * height)), 40), shirt);
  torso.position.y = hip;
  torso.scale.z = depth / width;
  /* The waistband the legs hang from. */
  const band = add(new THREE.CylinderGeometry(width * 0.4, width * 0.38, 0.12, 32), bottoms);
  band.position.y = hip;
  band.scale.z = depth / width;
  const neck = capsule(group, skin, SPEC.neck, 0.2, collar + 0.06);
  neck.scale.z = 0.9;

  /* Head: the shape's outline inflated, standing where OpenGame stands it, with the face
     painted on. The front carries the eyes and facial hair; the back has the hair alone. The
     glow map holds the eyes, so they keep their exact colors whatever the light does. */
  const { outline, canvases } = paintHead({ ...head, shape: OUTLINES[head.shape] ? head.shape : FALLBACK.shape },
    { head: headHex, eyes: eyeHex, light: lightHex, mark: markHex, facial: facialHex });
  const headMiddle = collar + SPEC.head.centreAboveTorso;
  const skull = inflateHead(outline, headMiddle);
  const texture = (canvas) => {
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.magFilter = THREE.NearestFilter;
    owned.textures.push(map);
    return map;
  };
  const [frontMap, glowMap, backMap] = canvases.map(texture);
  const painted = (map, glow) => {
    const each = new THREE.MeshStandardMaterial({ map, roughness: 0.62, metalness: 0, ...(glow ? { emissive: 0xffffff, emissiveMap: glow } : {}) });
    owned.materials.set(`head/${owned.materials.size}`, each);
    return each;
  };
  for (const [geometry, material] of [[skull.front, painted(frontMap, glowMap)], [skull.back, painted(backMap)]]) {
    owned.geometries.push(geometry);
    group.add(new THREE.Mesh(geometry, material));
  }
  const [shapeW] = SHAPES[head.shape] ?? SHAPES[FALLBACK.shape];

  /* Arms, hung from the shoulders and angled out a little. Long sleeves cover the whole arm,
     short ones the upper arm, and a sleeveless top leaves both bare. */
  const longSleeve = SPEC.sleeves.long.includes(shirtId);
  const sleeveless = shirtId === 'none' || SPEC.sleeves.none.includes(shirtId);
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * width * SPEC.shoulder[0], hip + height * SPEC.shoulder[1], 0);
    shoulder.rotation.z = side * SPEC.armOut;
    group.add(shoulder);
    capsule(shoulder, sleeveless ? skin : shirt, armRadius * (sleeveless ? 1 : 1.15), upperArm + armRadius, armRadius / 2);
    capsule(shoulder, longSleeve ? shirt : skin, armRadius * (longSleeve ? 1.1 : 0.96), lowerArm + armRadius, -upperArm + armRadius / 2);
    /* A mitten: one rounded shape and a thumb, in the head's color. */
    const hand = add(new THREE.SphereGeometry(0.5, 24, 16), skin, shoulder);
    hand.position.set(0, -upperArm - lowerArm - SPEC.hand * 0.3, 0.01);
    hand.scale.set(armRadius * 2.2, SPEC.hand, armRadius * 1.5);
    const thumb = add(new THREE.SphereGeometry(0.5, 16, 12), skin, shoulder);
    thumb.position.set(-side * armRadius * 0.9, -upperArm - lowerArm - SPEC.hand * 0.1, armRadius * 0.4);
    thumb.scale.set(armRadius * 0.9, SPEC.hand * 0.55, armRadius * 0.9);
    if (side === 1 && outfit?.accessories.some(id => id.endsWith('watch'))) {
      /* The everyday watch takes the accessory color; the others are steel. */
      const watch = add(new THREE.CylinderGeometry(armRadius * 1.12, armRadius * 1.12, 0.06, 24), outfit.accessories.includes('watch') ? extra : CLOTH.silver, shoulder);
      watch.position.y = -upperArm - lowerArm + 0.08;
    }
  }

  /* Legs. Trousers cover them, shorts cover the thighs, a skirt flares from the hip. */
  const cut = SPEC.cuts.full.includes(outfit?.bottoms) ? 'full' : SPEC.cuts.skirt.includes(outfit?.bottoms) ? 'skirt' : 'shorts';
  const legRadius = armRadius * 1.05;
  const [shoeLength, shoeWidth, sole, upper] = SPEC.shoes[outfit?.shoes] ?? SPEC.shoes[FALLBACK.shoes];
  for (const side of [-1, 1]) {
    const thigh = new THREE.Group();
    thigh.position.set(side * legSpacing, hip, 0);
    group.add(thigh);
    capsule(thigh, cut === 'full' ? bottoms : skin, legRadius, leg + legRadius, legRadius / 2);
    if (cut === 'shorts') capsule(thigh, bottoms, legRadius * 1.25, leg * 0.5, legRadius / 2);
    /* A sneaker: a flat sole the length of the shoe, round at toe and heel, and an upper
       sunk into it so the two read as one shoe, toe forward, flat on the ground. */
    const footWidth = Math.min(shoeWidth, legSpacing * 2 - 0.01);
    const soleMesh = add(new THREE.CapsuleGeometry(0.5, 1, 6, 24), SPEC.sole);
    soleMesh.rotation.x = Math.PI / 2;
    soleMesh.position.set(side * legSpacing, sole / 2, shoeLength * 0.16);
    soleMesh.scale.set(footWidth, shoeLength / 2, sole);
    const upperMesh = add(new THREE.SphereGeometry(0.5, 24, 16), shoes);
    upperMesh.position.set(side * legSpacing, sole * 0.6 + SPEC.upperRise * upper / 2, shoeLength * 0.12);
    upperMesh.scale.set(footWidth * 0.96, upper, shoeLength * 0.88);
  }
  if (cut === 'skirt') {
    const skirt = add(new THREE.CylinderGeometry(width * 0.42, width * 0.62, leg * 0.7, 32, 1, true), bottoms, group, { double: true });
    skirt.position.y = hip - leg * 0.35;
    skirt.scale.z = depth / width * 1.08;
  }

  /* A few body accessories, to show the pattern. The spec lists every one with its slot;
     skip what you do not draw. */
  const worn = new Set(outfit?.accessories ?? []);
  if (worn.has('backpack')) {
    const pack = add(new THREE.CapsuleGeometry(width * 0.32, height * 0.35, 6, 16), extra);
    pack.position.set(0, hip + height * 0.55, -depth * 0.62);
    pack.scale.z = 0.55;
  }
  if (worn.has('cape')) {
    const cape = add(new THREE.CylinderGeometry(width * 0.42, width * 0.62, height * 0.95, 24, 1, true, Math.PI * 0.62, Math.PI * 0.76), extra, group, { double: true });
    cape.position.set(0, hip + height * 0.5, -0.02);
    cape.scale.z = depth / width * 1.25;
  }
  if (worn.has('scarf')) {
    const scarf = add(new THREE.TorusGeometry(SPEC.neck * 1.5, SPEC.neck * 0.7, 12, 32), extra);
    scarf.position.y = collar;
    scarf.rotation.x = Math.PI / 2;
  }
  if (worn.has('belt')) {
    const belt = add(new THREE.CylinderGeometry(width * 0.41, width * 0.41, 0.06, 32), extra);
    belt.position.y = hip + 0.06;
    belt.scale.z = depth / width;
  }

  /* Head accessories: a halo here, and your own art for the rest. */
  if (head.accessory === 'halo') {
    const halo = add(new THREE.TorusGeometry(shapeW * 0.32, 0.03, 12, 48), HATS.halo[0], group, { flat: true });
    halo.position.set(skull.centreX, skull.top + 0.12, 0);
    halo.rotation.x = Math.PI / 2.4;
  }

  group.userData.height = skull.top;
  group.userData.dispose = () => {
    for (const geometry of owned.geometries) geometry.dispose();
    for (const each of owned.materials.values()) each.dispose();
    for (const each of owned.textures) each.dispose();
  };
  return group;
}
