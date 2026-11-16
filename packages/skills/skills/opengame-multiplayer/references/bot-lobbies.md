# A lobby of bots that reads as online (OS)

OS had no networking. Every seat but the player's was a bot, and the owner's test was
whether it felt like "playing online multipalyer wiht real people". Most of that feeling
came from things around the match rather than from aim: who arrives, who leaves, what
they are called, and whether the match stops when you open a menu.

## Arrivals

Real lobbies fill in bursts with a long tail, and are not always full.

```js
// A standard normal from two uniforms (Box-Muller), then a lognormal delay in seconds.
const normal = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
const arrivalDelay = (medianSeconds, spread) => medianSeconds * Math.exp(spread * normal());

function lobbyFill(cap, fullShare = 0.7) {
  // OS filled to exactly the cap only 70% of the time: "always exactly 32 looks scripted"
  return Math.random() < fullShare ? cap : cap - 1 - Math.floor(Math.random() * Math.max(1, Math.round(cap * 0.1)));
}
```

Seat the bots at their delays while the map streams in the lobby, so the list grows the
way a real one does.

## Leaving and staying

- 5 to 20% of bots leave during a match, each with a killfeed line, after the owner's "we
  should have bots leave the game throughout (not many of them maybe 10% of them)".
- About 80% stay into the next match; the rest are replaced by new arrivals.
- A paused or idle human stays in the world and can be killed, as online.

## Names

The owner asked for "realistic handles from playstation/steam/xbox ... mix of all
lowercase", "not garbage", with numbers "maybe 10-15%". OS's generator mixes word
fragments, lowercase by default, with digits or underscores in 12.7% of names, and it took
three retunes to hold. Check a sample of a thousand: no real person's name, no slur, no
trademark, no repeats within a lobby. Never reuse the names of real players you have seen.

## Talking

Leave every bot's mic slot empty. OS's rule was "never fake talking": a speaking icon with
no voice, or a canned voice line, gives the bots away faster than their aim does.

## Powers

Bots get only what a person would plausibly use, on the match clock. OS's bots got only a
counter-UAV, "at most once every 5 minutes for at most 30 seconds", and one shield per
5 minutes. A jam that was spaced on match time but timed on frame time lasted 90 s, not
30, so put every rule on one clock.

## What kill cams change

Once the player can watch a bot's view, bots need human timing everywhere: no teleport
out of sight, no one-frame head lock ("tells the player it was a bot"), reactions with a
floor, flicks that undershoot and correct. OS's early bots were aimbots: 26 of the
player's 37 deaths were quickscopes. Aim, movement and getting unstuck are in
`opengame-enemies`.

## Saying so

Players have a right to know who they are playing against. Put a plain line somewhere they
can find it, such as the store page or a settings screen, that bots fill empty seats. It
costs the feeling nothing in a match.

## Cost

Frame time follows live bodies: in OS, 3.0 ms with one, 14.4 ms at 24 and up to 39 ms at
32. A frame-rate drop in a match's first minute is the lobby filling, so size seats per
map from both its area and that table (OS: 32 on the big maps, 14 on the smallest).
