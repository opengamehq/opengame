# Netcode notes from LC

LC's four-player private lobbies were built in a few days and measured on headless pages
on one machine. They were never deployed, never played by people and no voice went
through them, so read every number here as what the protocol did under test, not what
players felt.

## Who owns what

| Thing | Owner | Why |
| --- | --- | --- |
| The map | Everyone, from one seed | Nothing to send, nothing to disagree about |
| A player's body, aim and own shots | That player's page | Their input never waits on the line |
| A hit on an enemy or another player | Claimed by the shooter, decided by the host | A claim 40 m off the round's line was refused on four pages |
| Enemies, waves, stations, doors, points, weather | The host page | One answer to every shared question |
| The room, seats, the host's checkpoint | The relay | It outlives any one page and never simulates |

## One protocol file

The page and the relay import the same module, so a size or rate cannot differ between
them. LC's limits:

| Kind | Direction | Size | Rate |
| --- | --- | --- | --- |
| Body (pose, aim, stance) | each page to all | exactly 28 B | 30 a second |
| Events (shot, reload, use) | each page to all | 6 to 32 B | as they happen |
| Wish (a client asks the host) | client to host | up to 29 B | paid only on the answer |
| Host world update | host to all | up to 1200 B | up to 80 a second |
| Host checkpoint | host to room | up to 4096 B | about once a second, kept by the room |
| Chat | any | up to 200 characters | |

Eight fouls close a line, and so does a frame over 4200 B or more than 300 frames a
second. A capability integer in the welcome message lets mixed builds share a room. At a
cap of 32 a second the room "dropped what was over without a word" until the cap was
raised and every drop was counted.

Bandwidth with three players: a guest received about 5,100 B/s and the host sent about
4,925. The relay's plan billed about 13,000 to 19,000 requests a room-hour; check how
your host bills WebSocket messages before you choose a send rate.

## Join codes

Six characters from an alphabet without look-alikes (for example, leave out 0 and O, and
1, I and L), and ten
wrong codes lock an address for a minute. A private room is reachable only by its code.

## Liveness, migration and rejoin

- The socket lives in a Web Worker, so a long main-thread frame cannot starve it.
- The room declares a page silent after 2 s, and the page declares the room silent after
  3 s.
- Reconnect attempts at 0, 0.2, 0.4 and 0.8 s, then every second.
- A seat is held 2 minutes. 30 s was shorter than one page's own boot on a busy machine.
- The host passes on close code 1001 (going away), or on an `away` message the page sends
  from `pagehide`, to the lowest seat still standing. Measured: the new host named 49 to
  91 ms after the close, enemies standing still at most 26 ms (they had stood 1.8 to
  2.0 s before the checkpoint was kept by the room).
- A rejoin token lives in `sessionStorage` and `localStorage` for 2.5 minutes, with a Web
  Lock per seat so two tabs cannot take one seat. A reload rejoins before the title with
  position, weapons and rounds kept.
- A loading player is not drawn and cannot be hit until their page says it is playing.

## Drawing other players

```js
// Per remote player, keep recent samples in send order: { sentAt, receivedAt, state }.
const BEHIND_MS = 100, OFFSET_WINDOW_MS = 2000, MAX_EXTRAPOLATE_MS = 150;

// The smallest arrival delay seen recently is the best estimate of the gap between the
// sender's clock and ours (it includes the fastest the line has been).
function clockOffset(samples, now) {
  let best = Infinity;
  for (const s of samples) if (now - s.receivedAt <= OFFSET_WINDOW_MS) best = Math.min(best, s.receivedAt - s.sentAt);
  if (best === Infinity) { const s = samples[samples.length - 1]; best = s.receivedAt - s.sentAt; }
  return best;
}

function drawnState(samples, now, lerpState) {
  if (!samples.length) return null;
  const t = now - clockOffset(samples, now) - BEHIND_MS;   // the moment to draw, in the sender's clock
  if (t <= samples[0].sentAt) return samples[0].state;     // older than anything kept
  for (let i = samples.length - 1; i > 0; i--) {
    const a = samples[i - 1], b = samples[i];
    if (a.sentAt <= t && t <= b.sentAt) {
      return lerpState(a.state, b.state, b.sentAt > a.sentAt ? (t - a.sentAt) / (b.sentAt - a.sentAt) : 1);
    }
  }
  const last = samples[samples.length - 1], prev = samples[samples.length - 2];
  if (!prev || last.sentAt <= prev.sentAt) return last.state;   // nothing to extrapolate from
  const ahead = Math.min(t - last.sentAt, MAX_EXTRAPOLATE_MS);   // never run far past the data
  return lerpState(prev.state, last.state, 1 + ahead / (last.sentAt - prev.sentAt));
}
```

LC measured a drawn-error median of 0.5 cm and a p95 of 18 to 22 cm, and 87 of 102 tail
samples came from the sender's own long frames, not the network. A simulation of a
smoothing change promised a p95 of 84 down to 27 cm; real pages showed 71.7 against
71.8. Measure smoothing on pages.

## The bad-network pipe

Browser network throttling does not hold WebSocket frames, so put a TCP relay between the
pages and the room server. Removing bytes from a TCP stream would corrupt it, so "loss"
here is what loss looks like to a WebSocket: a hold for a retransmission delay.

```js
// pipe.mjs: node pipe.mjs LISTEN_PORT TARGET_HOST TARGET_PORT
import net from 'node:net';
const [listen, host, port] = process.argv.slice(2);
const ONE_WAY_MS = 100, JITTER_MS = 20, LOSS = 0.02, RETRANSMIT_MS = 200;

function delayed(src, dst) {
  const queue = [];                  // { due, chunk } in arrival order; one timer drains it in order
  let timer = null, ended = false;
  const drain = () => {
    timer = null;
    const now = Date.now();
    while (queue.length && queue[0].due <= now) dst.write(queue.shift().chunk);
    if (queue.length) timer = setTimeout(drain, queue[0].due - now);
    else if (ended) dst.end();
  };
  src.on('data', (chunk) => {
    const hold = ONE_WAY_MS + (Math.random() * 2 - 1) * JITTER_MS + (Math.random() < LOSS ? RETRANSMIT_MS : 0);
    const after = queue.length ? queue[queue.length - 1].due : 0;   // never overtake, as TCP never does
    queue.push({ due: Math.max(Date.now() + hold, after), chunk });
    if (!timer) timer = setTimeout(drain, Math.max(0, queue[0].due - Date.now()));
  });
  src.on('end', () => { ended = true; if (!timer) drain(); });
  src.on('error', () => dst.destroy());
}

net.createServer((client) => {
  const server = net.connect(Number(port), host);
  delayed(client, server);
  delayed(server, client);
}).listen(Number(listen));
```

Point each page's socket at the pipe's port. 100 ms each way is the 200 ms round trip LC
tested at.

## The test rig

- **The room server alone.** Started by its own process, tested without a browser: joins,
  codes, caps, fouls, migration and rejoin. LC had 114 such tests.
- **N pages, one job.** Several headless, muted browsers in one test, run as a single job
  in your machine's job queue. Each page in its own guard, so one crash names itself.
- **One real-input player.** At least one page driven by real input events (key and
  pointer events through the browser's input pipeline), never only by calls into the game.
- **A script-only cheat.** Test players survive through a cheat only a script can turn
  on, and one stays vulnerable so damage, downs and revives are still tested.
- **Frames at the draw.** Count frames where the renderer submits, not at
  `requestAnimationFrame`, which ran at 57 a second on pages drawing 18.
- **No read-back in a timed window.** A canvas read-back froze a timed revive for 3 s.
- **Every lobby control pressed once.** LC's panel answered no real press until somebody
  pressed one.
- **Load.** Two rooms of two on one machine with one player reloading over a slow line.

## Voice, as designed

A WebRTC mesh, Opus, STUN only. The mic opens on the player's press. Proximity gain 0.7 at
40 m, then a raised cosine down to 0 at 90 m; through a wall x0.6 and a 900 Hz low-pass;
the game ducks 4 dB under any voice. No TURN server, so a player behind a strict NAT had
no path. A mesh also shares every player's IP address with every other player. Nobody
spoke or listened through any of it.
