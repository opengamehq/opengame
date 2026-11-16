# Checking sound without ears

An agent cannot hear. It can record what the game actually sends to the speakers, line
that recording up with what the game did, and test stated relationships between sounds.
LC, OS and OH each built some of the tools below; together they found most of the sound
faults those games had before a person listened. None of them replaces the person, and
every report that uses them still opens with what nobody has heard.

## The master-bus tap

Record the output, not the files. An AudioWorklet in parallel with the destination sees
exactly what the player would hear after every bus, duck and limiter.

```js
// tap-worklet.js, loaded with audioContext.audioWorklet.addModule()
class MasterTap extends AudioWorkletProcessor {
  constructor() { super(); this.blocks = []; this.frames = 0; this.start = null; }
  process(inputs) {
    const input = inputs[0];
    // With nothing playing, an input can arrive with no channels. Record that quantum as
    // silence, so a batch stays continuous and every later event still lines up.
    const block = input && input.length
      ? input.map((channel) => channel.slice())
      : [new Float32Array(128), new Float32Array(128)];
    if (this.start === null) this.start = currentTime;     // the context time of this batch
    this.blocks.push(block);
    this.frames += block[0].length;
    if (this.frames >= sampleRate / 4) {                     // post about four times a second
      this.port.postMessage({ start: this.start, blocks: this.blocks });
      this.blocks = []; this.frames = 0; this.start = null;
    }
    return true;
  }
}
registerProcessor('master-tap', MasterTap);
```

```js
// in the game, behind a test flag that changes nothing else
await ctx.audioWorklet.addModule('tap-worklet.js');
const tap = new AudioWorkletNode(ctx, 'master-tap', {
  channelCount: 2, channelCountMode: 'explicit', outputChannelCount: [2],
});
const silent = new GainNode(ctx, { gain: 0 });
master.connect(tap).connect(silent).connect(ctx.destination);   // keeps the tap running, adds nothing
const batches = [];
tap.port.onmessage = (e) => batches.push(e.data);

const events = [];
// Call it with the same `when` you pass to `source.start(when)`, so the log holds the
// time the sound was placed on the audio clock, not the time the code ran.
export function logEvent(kind, when, detail = {}) {
  events.push({ t: when, kind, ...detail });
}
```

Place each batch at its `start` time; the worklet writes silent quanta itself, so batches
follow one another without gaps. Convert the samples to plain arrays or
base64 before returning them from the page, then write a WAV in Node:

```js
import { writeFileSync } from 'node:fs';
// 32-bit float WAV from interleaved samples
export function writeWav(path, interleaved, channels, rate) {
  const data = Buffer.from(interleaved.buffer, interleaved.byteOffset, interleaved.byteLength);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(3, 20);   // 3: IEEE float
  h.writeUInt16LE(channels, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * channels * 4, 28); h.writeUInt16LE(channels * 4, 32); h.writeUInt16LE(32, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  writeFileSync(path, Buffer.concat([h, data]));
}
```

The event log and the samples share the audio clock, so every shot, step and line can be
found in the recording to well under a frame. OS's tap lined up with its engine log to
about 0.2 s, close enough to expose a 1.7 to 3.6 s skew that had been producing wrong
numbers for days.

## The owner-path capture

Every repeated sound complaint LC had lived on a path nobody tested. Capture the path the
player takes:

- The built game, served the way it ships, with no autostart flag and no debug option
  that changes behaviour.
- A real key press through the browser's input pipeline, not a call into the game.
- Two runs: the browser's default autoplay policy and the strict one
  (`--autoplay-policy=user-gesture-required` in Chromium). Read the flags your test
  launcher adds; many allow autoplay, which hides exactly this fault.
- The game's own count of refused `play()` calls and suspended-context recoveries, kept in
  the shipped build too, read at the end. A wrapper the test injects into `play()` is a
  tool changing the game.
- One tap per bus as well as the master, so a muted bed and a quiet bed read differently.

LC called this capture "the single best check" for sound that never starts: its rain was
silent under strict autoplay while every earlier capture, run with autostart, had it.

## The offline mix render

For fast level work, build the game's real audio graph (the same factory functions, the
same buses) inside an `OfflineAudioContext`, schedule a scripted scene (a fight, a quiet
walk, a reload beside a crowd) and render it in well under real time. Measure integrated,
short-term and momentary loudness, true peak oversampled, band levels and duck depth. Wait
for streamed sources to load before rendering, and take the median of three renders for
anything streamed. LC's version fails the build if rain at rest reads under its floor in
its band.

## Bands a laptop can play

Laptop and phone speakers give back little of the lowest octaves, so a cue that is all
low end can measure loud and be silent on the player's machine. Measure each bed and cue
in the band that carries it (LC: rain at rest in 200 Hz to 6 kHz at or over -33 dBFS;
enemy steps and voices in 100 Hz to 1 kHz against the rain). Give a low cue harmonics: a
parallel softly clipped path through the low mids made LC's heartbeat audible where it had
read -59 dBFS in 300 Hz to 4 kHz.

## A gate table of relationships

Absolute levels drift with every change; relationships are what the player hears. LC's
table, read from a three-minute real run after every bank change:

| Relationship | LC bar |
| --- | --- |
| The player's shot over an enemy voice at arm's length | at least 4 LU |
| Footsteps over rain, most steps | at least 6 dB |
| A surge of enemies | heard before it is seen |
| A fight, integrated | -16 LUFS ±1.5 |
| A quiet night, integrated | -28 LUFS ±3 |
| Output true peak | under -2 dBTP |
| Mouth sounds in three minutes without a fight | zero |

OS's equivalent was a hierarchy: the player's shot 4.8 LU over anything in a fight, rivals
at least 6 dB under, reloads never within 6 LU, the announcer 2 to 3 LU under.

## Spoken lines

Run every line through the game's final chain (radio, helmet, distance) into a local
speech recogniser, and compare it with the script. Recognisers lean towards dictionary
words, so add a phoneme comparison for names and invented words, and flag a line when the
two disagree with the text. OS's recogniser passed two invented place names that a
phoneme check caught, and could not tell /laɪv/ from /lɪv/, which the owner heard at once. LC reworded lines the recogniser misheard through the radio ("take an arm from
Iraq" 11 times in 12).

## Spectrograms read as images

Render the shipped file first and each candidate after it on the same scale and range.
Look for horizontal lines (fixed tones and whines), vertical lines (clicks), tails cut
square, energy before the attack (codec pre-echo) and a top band that never moves. OS
found that its metrics alone preferred synthetic beeps to real takes; the picture with the
shipped file beside it did not.

## Ledgers for cut-offs, delay and position

- **Stop ledger.** Every voice that ended before its file, with the reason: stolen, ended
  by a rule, a queue overflow, never started. OS's showed 1,110 cut-offs in a ten-minute
  fight that no level meter could see.
- **Delay probe.** The press, stamped from the input event and mapped to the audio clock
  with `getOutputTimestamp()`, against the first sample over a threshold in the tap. OS's
  found a 690 ms backlog; after the fix, press-to-output read 67 ms.
- **Position log.** Every world sound with its true distance and bearing and its level
  against the ambience in its band. LC's found steps 32 times in 34 and a 2 degree bearing
  error; OS's found rival reloads playing centred at full level.

## A/B tapes for the person

Name each clip `<date>-<what>-{NEW|AS-IT-WAS|NOT-TAKEN}-<what to listen for>.mp3` and
render each pair from one boot, so the only difference is the change. Send two or three
pairs with one plain question each. Record the answer against the cue.

## What none of this proves

Whether a sound is pleasant, whether it fits the world, whether a voice suits its
character, whether the game sounds finished. Those are a person's calls, made by
listening. Report the measurements as measurements, and keep the list of what nobody has
heard at the top.
