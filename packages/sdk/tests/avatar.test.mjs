import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { portraitUrl, readAvatar, watchAvatar } from '../dist/avatar.js';
import { harness, limits } from './harness.mjs';

const mock = { seed: 1, palette: 'sky', look: 'circle.classic.white', character: 'c4.classic.regular.hoodie.jeans.cape-watch.retro.avatar.avatar.avatar.avatar' };

test('head and facial hair colours survive the game avatar helper', () => {
  const look = 'shortfringe.classic.white.none.male.shortbeard.blonde.brown';
  const avatar = readAvatar({ look });
  assert.equal(avatar.head.recipe, look);
  assert.equal(avatar.head.hairColor, 'blonde');
  assert.equal(avatar.head.facialHairColor, 'brown');
  assert.equal(readAvatar({ look: 'shortfringe.classic.white.none.male.shortbeard.blue' }).head.facialHairColor, null);
});

test('hair worn over another shape is named apart from the shape', () => {
  const head = readAvatar({ look: 'egg.classic.white.none.male.none.blonde.default.bob' }).head;
  assert.equal(head.shape, 'egg');
  assert.equal(head.hair, 'bob');
  assert.equal(head.hairColor, 'blonde');
  assert.equal(readAvatar({ look: 'bob.classic.white' }).head.hair, null, 'a haircut stored as the shape is still the shape');
});
const white = '#F4F3EF';

test('the local signed-in OG reads as a named head and outfit, with its colours following the head', () => {
  const avatar = readAvatar(mock);
  assert.deepEqual(avatar, {
    head: { recipe: mock.look, shape: 'circle', eyes: 'classic', color: 'white', hex: white, finish: false, accessory: null, identity: 'male', facialHair: null, hairColor: null, facialHairColor: null, hair: null },
    outfit: {
      recipe: mock.character, version: 'c4', body: 'classic', legs: 'regular', shirt: 'hoodie', bottoms: 'jeans',
      accessories: ['cape', 'watch'], shoes: 'retro',
      colors: Object.fromEntries(['shirt', 'bottoms', 'shoes', 'accessories'].map(part => [part, { id: 'avatar', hex: white, followsHead: true }])),
    },
  });
  for (const part of [avatar, avatar.head, avatar.outfit, avatar.outfit.accessories, avatar.outfit.colors, avatar.outfit.colors.shirt]) assert.ok(Object.isFrozen(part));
});

test('colours come from the catalogues that own them, and an id this build does not know has no hex', () => {
  const outfit = (colors) => readAvatar({ look: 'panda.dots.tangerine', character: `c3.tall.regular.hoodie.jeans.cape.jumpcourt.${colors}` });
  const { head, outfit: dressed } = outfit('blue.ink.match.chalk');
  assert.equal(head.hex, '#FF7A2F');
  assert.deepEqual(dressed.colors, {
    shirt: { id: 'blue', hex: '#0054FF', followsHead: false }, bottoms: { id: 'ink', hex: '#252522', followsHead: false },
    shoes: { id: 'match', hex: '#FF7A2F', followsHead: true }, accessories: { id: 'chalk', hex: '#EEEDE6', followsHead: false },
  });
  // Every cloth id resolves, and none borrows the head palette's colour of the same name.
  const source = readFileSync(new URL('../../shared/src/character-look.ts', import.meta.url), 'utf8');
  const cloth = [...source.matchAll(/\{ id: "([a-z]+)", label: "[^"]+", hex: (?:"(#[0-9A-F]{6})"|null) \}/g)];
  assert.ok(cloth.length >= 20, 'the outfit colour catalogue was found');
  for (const [, id, hex] of cloth) {
    const color = outfit(`${id}.ink.chalk.chalk`).outfit.colors.shirt;
    assert.equal(color.hex, hex ?? '#FF7A2F', id);
  }
  assert.deepEqual(outfit('aurora.ink.chalk.constructor').outfit.colors.shirt, { id: 'aurora', hex: null, followsHead: false });
  assert.deepEqual(outfit('aurora.ink.chalk.constructor').outfit.colors.accessories, { id: 'constructor', hex: null, followsHead: false });
  const unknownHead = readAvatar({ look: 'panda.dots.constructor', character: mock.character });
  assert.equal(unknownHead.head.hex, null);
  assert.deepEqual(unknownHead.outfit.colors.shirt, { id: 'avatar', hex: null, followsHead: true });
});

test('a colour renamed in 2026 reads as its current id, as OpenGame draws it', () => {
  assert.deepEqual(readAvatar({ look: 'circle.classic.ink' }).head, {
    recipe: 'circle.classic.ink', shape: 'circle', eyes: 'classic', color: 'black', hex: '#1E1E1E', finish: false, accessory: null, identity: 'male', facialHair: null, hairColor: null, facialHairColor: null, hair: null });
  assert.equal(readAvatar({ look: 'circle.classic.paper.none.female' }).head.color, 'white');
  assert.equal(readAvatar({ look: 'circle.classic.paper.none.female' }).head.identity, 'female');
});

test('a patterned or metallic head colour is marked, for every finish the mascot catalogue has', () => {
  const source = readFileSync(new URL('../../ui/src/components/mascot/colors.ts', import.meta.url), 'utf8');
  const entries = [...source.matchAll(/^  \{ id: "([a-z]+)", label: "[^"]+", swatch: "#[0-9A-F]{6}"(.*)\},?$/gm)];
  assert.ok(entries.length >= 60, 'the mascot colour catalogue was found');
  const finishes = entries.filter(([, , rest]) => /\bfinish:/.test(rest)).map(([, id]) => id);
  assert.ok(finishes.includes('gold') && finishes.includes('plaid') && finishes.length >= 20, finishes.join());
  for (const [, id, rest] of entries) {
    assert.equal(readAvatar({ look: `circle.classic.${id}` }).head.finish, /\bfinish:/.test(rest), id);
  }
  assert.equal(readAvatar({ look: 'circle.classic.constructor' }).head.finish, false);
});

test('a part the game has never seen still arrives, so the game swaps in its own default for that part alone', () => {
  const avatar = readAvatar({ look: 'dragon.laser.aurora.halo', character: 'c3.classic.regular.glitterjacket.jeans.jetpack.retro.avatar.avatar.avatar.avatar' });
  assert.equal(avatar.head.shape, 'dragon');
  assert.equal(avatar.head.accessory, 'halo');
  assert.equal(avatar.outfit.shirt, 'glitterjacket');
  assert.deepEqual(avatar.outfit.accessories, ['jetpack']);
});

test('older outfits carry the defaults their version implies, and a version with no known layout leaves only the head', () => {
  const c1 = readAvatar({ look: mock.look, character: 'c1.round.long.tee.kilt.none' }).outfit;
  assert.equal(c1.version, 'c1'); assert.equal(c1.shoes, 'classic'); assert.deepEqual(c1.accessories, []);
  assert.equal(c1.colors.bottoms.id, 'avatar');
  const c2 = readAvatar({ look: mock.look, character: 'c2.slim.short.hoodie.jeans.scarf.platform' }).outfit;
  assert.equal(c2.shoes, 'platform'); assert.deepEqual(c2.accessories, ['scarf']); assert.equal(c2.colors.shirt.id, 'avatar');
  const future = readAvatar({ look: mock.look, character: 'c5.classic.regular.hoodie.jeans.cape.retro.avatar.avatar.avatar.avatar.glitter' });
  assert.equal(future.head.shape, 'circle');
  assert.equal(future.outfit, null);
  assert.equal(readAvatar({ look: mock.look }).outfit, null);
  assert.equal(readAvatar({ look: mock.look, character: 'c3.classic.regular.hoodie.jeans.cape-watch.retro.avatar.avatar.avatar.avatar' }).outfit, null);
});

test('no look means no OG to draw, whatever else is there', () => {
  for (const recipe of [null, undefined, {}, { look: null }, { look: '' }, { look: 'circle.classic' }, { look: 'Circle.classic.white' },
    { look: 'circle.classic.white\n' }, { character: mock.character }, { look: 7, character: mock.character }]) {
    assert.equal(readAvatar(recipe), null, JSON.stringify(recipe));
  }
});

test('watchAvatar calls once now and then only when the recipe changes, through sign-in and sign-out', () => {
  // harness() runs the classic opengame.js, so this is the OpenGame.og a game with no bundler passes.
  const h = harness(); h.og.init();
  const seen = [];
  const stop = watchAvatar(h.og, avatar => seen.push(avatar && `${avatar.head.recipe} ${avatar.outfit?.recipe ?? ''}`));
  assert.deepEqual(seen, [null]);
  const player = { id: 'per-game', handle: 'mira', ogNumber: 7, signedIn: true };
  // The page sends the outfit beside the avatar, not inside it.
  const face = { seed: 1, palette: 'sky', look: mock.look };
  const session = (avatar, character, handle = 'mira') => h.send({ type: 'session', token: 'test-only', capabilities: ['identity', 'avatar'],
    player: { ...player, handle, ...(avatar ? { avatar, character } : {}) } });
  const changes = []; h.og.player.onChange(next => changes.push(next.handle));
  session(face, 'c3.classic.regular.hoodie.jeans.cape.retro.avatar.avatar.avatar.avatar');
  assert.deepEqual(seen, [null, 'circle.classic.white c3.classic.regular.hoodie.jeans.cape.retro.avatar.avatar.avatar.avatar']);
  // A new handle is a player change and not an OG change.
  session(face, 'c3.classic.regular.hoodie.jeans.cape.retro.avatar.avatar.avatar.avatar', 'mira_2');
  assert.equal(changes.at(-1), 'mira_2', 'the page did report a player change');
  assert.equal(seen.length, 2);
  session(face, 'c3.classic.regular.hoodie.jeans.scarf.retro.avatar.avatar.avatar.avatar');
  assert.equal(seen.at(-1), 'circle.classic.white c3.classic.regular.hoodie.jeans.scarf.retro.avatar.avatar.avatar.avatar');
  session(null);
  assert.equal(seen.at(-1), null);
  assert.equal(seen.length, 4);
  stop();
  session(face, mock.character);
  assert.equal(seen.length, 4);
  h.og.dispose();
});

test('a listener that throws is reported on the console, because the SDK swallows onChange errors', () => {
  const h = harness(); h.og.init();
  const errors = [], original = console.error;
  console.error = (...args) => errors.push(args);
  try {
    watchAvatar(h.og, () => { throw new Error('the model build failed'); });
    h.send({ type: 'session', token: 'test-only', capabilities: ['identity', 'avatar'],
      player: { id: 'per-game', handle: 'mira', ogNumber: 7, signedIn: true, avatar: { seed: 1, palette: 'sky', look: mock.look } } });
  } finally { console.error = original; }
  assert.equal(errors.length, 2, 'once for the first call and once for the sign-in');
  assert.ok(errors.every(([label, error]) => /watchAvatar/.test(label) && error.message === 'the model build failed'));
  h.og.dispose();
});

test('the avatar helper has its own budget and stays out of the core and the injected global', () => {
  const read = (name) => readFileSync(new URL(`../dist/${name}`, import.meta.url));
  const bytes = gzipSync(read('avatar.js')).byteLength;
  assert.ok(bytes <= limits.platform.sdk.avatarGzipBytesMax, `avatar.js is ${bytes} bytes gzip, over ${limits.platform.sdk.avatarGzipBytesMax}`);
  const size = JSON.parse(read('size.json'));
  assert.equal(size.avatarGzipBytes, bytes);
  assert.equal(size.avatarBudget, limits.platform.sdk.avatarGzipBytesMax);
  for (const name of ['index.js', 'opengame.js', 'opengame-global.js']) {
    assert.ok(!read(name).includes('#0054FF') && !read(name).includes('tangerine'), `${name} carries the avatar colour tables`);
  }
});

test('portraitUrl names the look and nothing else, at a size and drawing the route answers without a redirect', () => {
  // The same address the portrait route on opengame.io treats as canonical; its own test pins the
  // other half, so a change to either is a red test rather than a redirect on every load.
  const sizes = limits.portrait.sizes, size = limits.portrait.sizeDefault, v = limits.portrait.version;
  const avatar = readAvatar(mock);
  assert.equal(portraitUrl(avatar), `https://opengame.io/api/avatars/circle.classic.white/portrait?size=${size}&theme=light&v=${v}`);
  assert.equal(portraitUrl(avatar, { size: 1, theme: 'dark' }), `https://opengame.io/api/avatars/circle.classic.white/portrait?size=${sizes[0]}&theme=dark&v=${v}`);
  assert.equal(new URL(portraitUrl(avatar, { size: 1e6 })).searchParams.get('size'), String(sizes.at(-1)));
  for (const listed of sizes) assert.equal(new URL(portraitUrl(avatar, { size: listed })).searchParams.get('size'), String(listed));
  assert.equal(new URL(portraitUrl(avatar, { size: sizes[0] + 1 })).searchParams.get('size'), String(sizes[1]));
  assert.equal(new URL(portraitUrl(avatar, { size: -3 })).searchParams.get('size'), String(size));
  // A player's per-game id, handle and OG number never reach the address.
  const url = portraitUrl(readAvatar({ look: 'panda.dots.tangerine.crown', character: mock.character }));
  assert.match(url, /^https:\/\/opengame\.io\/api\/avatars\/panda\.dots\.tangerine\.crown\/portrait\?/);
  assert.equal(portraitUrl(null), null);
  assert.equal(portraitUrl(readAvatar({ look: null })), null);
});
