# Mix notes

## Why the helper's soft clip differs from AW's

AW's master chain ends in a WaveShaper with a tanh curve scaled to reach 0.97 at full
scale (`tanh(x * 1.6) * 0.97 / tanh(1.6)`). Its comment describes the curve as within
0.1 dB of unity below -8 dBFS. Computed, the curve adds about 4.5 dB to quiet signals
(+4.52 dB at -30 dBFS, +3.45 dB at -8 dBFS) and only reaches unity near full scale,
because scaling a tanh to its ceiling also scales its slope at zero. Sitting after the
limiter, it lifts everything quiet and moves the true ceiling.

The helper's curve is exactly unity below a knee and a tanh shoulder above it that
approaches the ceiling without passing it, continuous in value and slope at the knee.
`chainProperties` checks a -8 dBFS signal passes within 0.1 dB, and the self-test plants
AW's curve to prove that check sees the difference. Measure any curve you write the same
way; a comment about a curve is a claim, not a measurement.

## Sound families for a shooter

Plan the families from the whole game before production, not from the few actions in an
early blockout. For a shooter (ST's list):

- Weapons: report, body and tail; dry fire; equip and holster; magazine out, in and seat;
  bolt, slide or pump; shell insert and eject; casings by surface.
- Movement: walk, run, land and jump by the terrain actually walked; ladders as rungs,
  not one sound at the top (AW).
- Impacts and ricochets by material.
- Damage, shield and low health; enemy anticipation, action and reaction.
- Pickups, interaction, objectives; interface focus, confirm and back; results.
- Ambience per place: a quiet bed plus sparse local events, crossfaded between zones,
  stopped on pause and restarted from the current state on resume, never as a backlog.
- Music states (menu, exploration, tension, combat, resolution) as tracks or layers with
  deliberate transitions.

Other genres need the equivalent depth for their own mechanics. Do not invent weapons or
materials to reach a count.

## Recorded or designed, never a placeholder

Our originals ban procedural sound entirely: no runtime oscillators, no synthesised
fallback, because a fallback that never fires in testing ships as the real sound on
somebody else's machine. A game whose style is synthesis can design synthesis on purpose;
what no game should ship is a beep standing in for a sound nobody made.

Designed synthesis is a sound somebody made. LC computed its low thump, heartbeat, hums,
CRT buzz, reverbs and flamethrower in the audio graph on purpose, each measured like any
recorded file, and OH synthesised its hit ticks from band-passed noise. Neither is a
fallback: each is the only version of that sound, and each was checked through the same
gates.

## Real recordings first, where they exist

LC's gunshots came from a CC0 firearm recording library (it rebuilt the first 2 ms of the
crack, which the archive had clipped, and kept the recorded tails), and its rain from
public-domain field recordings with credits; a file with no recorded author was dropped.
Recorded gunshots peak in about 1.5 ms where LC's generated ones peaked in 10 to 35 ms, and
no level change closes that gap. Licences and credits: `opengame-assets`.

## Generated sound

Write prompts like directions to a recordist: source and material, attack, body, tail,
distance, duration and whether it loops. Keep one acoustic space per family. Trim
unwanted silence before an attack, keep real tails, and remeasure after every edit. A
delayed gunshot or footstep is a failed cue when its visible contact already happened.
See `opengame-assets` for the generation services themselves.

Prompts LC found worked for voices of the dead: "one long low growling roar from deep in
the chest, bass voice, swelling to its end", and for effort, "effort, breath, the throat
closing, no words". A throat prompted as a woman's came back shrill in 144 of 243 takes. A
bed prompt names only the bed: OS's ambience prompted with "gravel crunching far away"
played as footsteps in the menu for three days.

## LC's generation pipeline

1. A manifest of specs per bank.
2. A generator that hashes each spec and skips one it has made, checks the cap and the
   credits, reads each call's cost from the response into a sidecar beside the take,
   writes the ledger line before the call and stops when the service fails.
3. A mastering step: de-clip, de-harsh (a 3.6 kHz bell, a 7 kHz shelf), notch whines,
   limit onsets, fold loops, normalise loudness under a true-peak ceiling, encode Opus,
   then decode and measure again, rejecting with a reason and falling back to the next
   take. Masters are kept.
4. Banks of at most 80 s, named by content hash.
5. An audit and a mix render through the game's own graph.

It turned 1,891 takes into 520 sounds and 24.6 MB in its first phase, about half the
takes refused by measurement. Bad takes are removed, never re-pitched.

## Listening is a result of its own

A recording of the busiest moment, listened to at a consistent level, is a separate
result from every measurement. Peak and loudness readings, cue counts and a compressor
in the code do not establish that the game sounds good. Record listening, final-output
measurement and missing cues as separate lines in a report.

## What the libraries cost

OC generated its sound with ElevenLabs. Rates as measured on 16 Oct: sound effects about
11 credits a second, speech 0.43 credits a character, music 13.8 credits a second, at
$0.000183 a credit. The first library was 1,275 files for $11.70; ElevenLabs spend reached
$27.56 by 19 Oct against a $500 cap, and the shipped library was 2,895 files. Takes per cue
were 2 to 4, curated by measurement and then by ear.

LC spent $52.17 on ElevenLabs in all, at about $22 per 100,000 credits: a sound-effect bank
of about 2,650 takes for $20.10, a recast of the dead's voices (about 3,210 readings) for
$18.56, and a leap set for $7.16; a recast of the radio voices from library voices cost
$3.17. OS spent $12.15 on music, $9.84 on 2,541 sound-effect takes and $1.82 on speech,
after the owner asked for a sound identity of its own: "not same voices and music and sfx
NONE of it the same there pls!".

Generated one-shots often peak late. Ask for "one single event that starts instantly at
0 ms" and cut to the transient. Loop stems need a join with no lag: a loop cut on the beat
grid stuttered by 45-68 ms.

Log the spend before each paid call, and keep the generated files with the prompt that made
them, so a remake starts from the prompt instead of from memory.

## Phones

OC's iPhone fixes, most important first, were these. Ship the build that carries audio on
that device (only the threaded build did). Resume the context on touch, visibility change and
interruption. Keep the player's weapon in the highest priority class so a busy horde cannot
take its voices. Never clamp output latency below the mixer's own lead, which garbled every
device. Test each fix on the phone itself. Emulation passed every build that was silent on the
real device.
