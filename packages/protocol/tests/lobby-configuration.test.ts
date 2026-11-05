import test from 'node:test';
import assert from 'node:assert/strict';
import { parseManifest } from '../src/manifest';
const game = { title: 'Night shift', description: 'Survive until dawn with a light and a dwindling battery.', genre: 'shooter-survival', controls: ['keyboard'] };
const lobby = { settings: [{ key: 'map', kind: 'map', label: 'Map', default: 'yard', choices: [{ id: 'yard', label: 'Courtyard', description: 'A small arena with a central fountain.' }] }] };
test('frozen manifests accept typed room settings without assuming a game configuration', () => {
  const manifest = parseManifest({ ...game, multiplayer: { mode: 'p2p', maxPlayers: 4, lobby } });
  assert.deepEqual(manifest.multiplayer?.lobby, lobby);
  assert.throws(() => parseManifest({ ...game, multiplayer: { mode: 'none', maxPlayers: 1, lobby } }));
});
test('room metadata rejects remote paths, secret fields, ambiguous IDs and lexical slurs', () => {
  for (const settings of [
    [{ ...lobby.settings[0], default: 'missing' }],
    [lobby.settings[0], lobby.settings[0]],
    [{ ...lobby.settings[0], choices: [{ id: 'yard', label: 'Yard', url: 'https://other.example' }] }],
    [{ ...lobby.settings[0], label: 'n1gg3r' }],
    [{ ...lobby.settings[0], choices: [{ id: 'yard', label: 'Yard', description: 'f@gg0t' }] }],
  ]) assert.throws(() => parseManifest({ ...game, multiplayer: { mode: 'p2p', maxPlayers: 4, lobby: {settings} } }));
});
