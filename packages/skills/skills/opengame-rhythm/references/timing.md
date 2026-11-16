# Timing

The song clock, calibration, the count-in and codec delay, as OH built them. Values are
OH's reference configuration.

## The song clock

The clock is the audio hardware's, never the frame's: a key press is stamped by the
browser when it happens and converted to song time afterwards, so a slow frame cannot
make a hit late.

```js
const ctx = new AudioContext({ latencyHint: "interactive" });
let zero = 0;          // context time at which song time is 0
let offset = 0;        // the player's calibration, in seconds
let smoothed = 0;

function start(buffer, leadIn) {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  zero = ctx.currentTime + Math.max(0.05, leadIn);
  source.start(zero);
}

/** Song time for a performance.now()-based timestamp, such as event.timeStamp. */
function timeAt(perfMs) {
  const ts = ctx.getOutputTimestamp?.();
  if (ts && ts.contextTime > 0) return ts.contextTime + (perfMs - ts.performanceTime) / 1000 - zero - offset;
  const latency = ctx.outputLatency || ctx.baseLatency || 0;
  return ctx.currentTime - zero - latency - offset;
}

/** Once a frame: predict forward, glide, and snap only when far off. */
function frameTime(dt) {
  const measured = timeAt(performance.now());
  smoothed += dt;
  if (Math.abs(measured - smoothed) > 0.040) smoothed = measured;
  else smoothed += (measured - smoothed) * 0.08;
  return smoothed;
}

addEventListener("keydown", (event) => judge(laneOf(event.code), timeAt(event.timeStamp)));
```

- Judge in the handler; the frame loop only marks a note missed once it is past the last
  window.
- Stamp key releases the same way, so holds end at the real release.
- Self-play cannot test any of this: it lands every note at zero.

**Measured in OH** with real key presses sent through the browser's debugging protocol at
times scheduled off the game's own audio clock, on one 105-note Expert song: mean 1.1 ms,
p95 2.5 ms, no misses; a 250 ms stall every 1.5 s gave 1.8 ms mean and no misses; 4x CPU
throttling gave 2.1 ms; offsets of ±80 ms gave 105 of 105 Perfect; the drawn clock
stayed within 4 ms of the heard one.

## Count-in and resume

- Count in on the song's own beat grid, carried back from its first beat. OH's composed
  songs all had their first beat at 0.30 s while the count-in counted from 0, which put
  the clicks about 62% of a beat off at 124 bpm until a sweep of every song found it.
- Lead-in 2.6 s. On resume, restart the audio after `max(1.2, min(2.4, 3 beats))` s of
  count-in.

## Calibration

- A dot falls onto a ring while a click plays on the play clock. Left and right move the
  offset 10 ms, up and down 1 ms, over -200 to +400 ms.
- Offer it before the first song, in plain words. Do not use a tap test: it measures the
  tapper as much as the speakers.
- `[` and `]` nudge the audio offset 10 ms during play. A separate picture offset (-100
  to +100 ms) moves only the drawn notes.
- The ring must be fully drawn at the moment of landing; OH's first version faded it in
  at exactly that moment.

## Codec delay and loudness

- MP3 encoders pad the start. OH's 256 kbit/s CBR files carried 1,105 samples (25.06 ms)
  of codec silence. Trim it only when the encoder tag is unambiguous and the decoded audio
  agrees within 0.3 ms; otherwise leave it and say so.
- Master to one integrated loudness and true peak, measured on the decoded file, not the
  master: OH used -14 LUFS ±0.6 with a ceiling of -0.99 dBTP, and re-mastered any song
  whose decoded MP3 overshot. Pad the last frame.
- Check by decoding clicks placed at 1.000 s and 60.000 s in every browser you can run,
  within 2 ms. Name the browsers you could not run; OH never ran Safari.

## Recording proof

Screencasts from a headless browser are not real time: OH's ran at 25 fps with a 1 to
4.6 s offset between video and page, and had no audio stream. Prove timing with in-page
logs on the song clock and with the real-key timing run above. Audio is judged by a
person, or by recordings of the master bus aligned to game events (`opengame-audio`).
