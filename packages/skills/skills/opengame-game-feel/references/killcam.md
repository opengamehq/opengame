# Killcams that replay what happened

How OS built "Killcams replay recorded truth" and "The final killcam keeps its pace" in
`SKILL.md`. OS is a snipers-only shooter where every rival is a bot presented as a
person, so its killcams were watched for anything a person would not do. Its killcam took
about 11 days and seven rebuilds; most of that time went to the faults below. Partway
through, the owner turned ordinary killcams off by default and kept the logic, so the
later work was the recording and the final killcam.

## Record what was rendered, as state

A killcam is a recording, not a re-simulation. Re-simulating from inputs, or resampling
at a fixed rate with the live loadout, lost flips and swapped rifles ("it even change dthe
fucking gun that i had? and no hitmarkers").

Per rendered frame of each player who could appear in a replay, keep:

- the time on the game clock and the wall clock;
- the camera's position, rotation and field of view, taken from the frame as drawn, not
  from the live weapon's settings;
- the view model's pose, the aim progress and the scope state (in, out, which optic);
- the weapon, finish and attachments in hand, as identities with an explicit unset value,
  because 0 is a valid finish and "unset" must not read as the first one;
- for everyone in view, their root transform and animation state, so the renderer draws
  each frame's recorded pose instead of interpolating (slow-motion rivals had stood or
  jumped on 26 of 86 frames, then 0 of 56).

Beside it keep an event ring: shots, hits with zone and damage, hit markers, kills,
footsteps and every one-shot sound with its pitch.

## Size the ring by time

A frame count is not a duration at a variable refresh rate. OS's ring holds 2,048 frames,
which at up to 120 frames a second covers 17 s on any display. Reach back to the start of
the action, not a fixed lead: a fixed 4.0 s lead opened hardscopes already scoped ("final
killcams dont show the full ads / scope in and out etc anymore"), so the replay starts at
the last hip frame before the scope-in, up to 8 s back.

## Play it back

- Draw each recorded frame's transforms exactly. Never smooth or resample recorded motion:
  a smoothing pass is how a flip disappears.
- Sound is a tape of the live one-shots at their recorded times and pitches, not a new
  mix of what the replay thinks happened.
- Hit markers come from the recorded hit events.
- Ordinary killcams play at 1x. "normal killcams shoudl be normal killcams not slow mo or
  follow the bullet shit just normal cod style killcams..." reversed a bullet cam that
  judges and research had wanted; still judges went on polishing it after the ban.
- A recording that fixes what the simulation got wrong is not a replay. Fix the
  simulation: stand bots down after the final kill, make a respawn one same-frame
  transaction, and keep the dying figure alive in memory (that removed a 3.97 MB upload
  per death).

## The final killcam's beat sheet

Data keyed to the time of the deciding shot, paced on wall time:

| Beat | OS |
|---|---|
| Victory card over the held game | 2.3 s |
| Cut to the killer's eyes | from the recorded camera |
| Normal speed | the last seconds before the shot |
| Ease down | to 0.25x between 0.95 s and 0.22 s before the shot |
| Ease back | to 1x by 1.1 s after the shot |
| Hold | about a second at 1x |
| Scoreboard, then the winner scene | no button press needed |

Shown only when the local player wins. Before, the replay had been "complete immediately
on the first post-shot frame". After, no black frame in 848.

## Keep the victim in view

Ray-test the replay camera's line to the victim on every frame of the slow part. "a tree
trunk fills the scope and the victim never appears" was a replay that played perfectly
and showed nothing.

## One exit

Every way out (the end, a skip key, the menu) goes through one transaction
that picks the life, writes the spawn and clears the replay view on the same frame. Skip
broke five times in four days while each exit had its own code; a grey death card shown
after a skip was the last of them.

## Judge it against the reference clip

Critics who had not seen the reference clip scored the final killcam 8.4 to 9.4 while the
owner called it 1 of 10. Give judges the reference film and the owner's words, and judge
motion on film at speed (`SKILL.md`, "Motion is judged on film").
