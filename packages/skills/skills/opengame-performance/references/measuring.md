# Measuring without fooling yourself

World at War (AW) built a frame-budget harness and a gate that grades its newest
measurement. Before it could be trusted it had reported a clean bill of health three
ways that were all wrong. Each is a check worth copying.

## A run that cannot be evaluated is not a pass

1. **The map did not load.** A map whose loader threw fell back to a grey stand-in arena.
   The match still started, the HUD still came up, a screenshot still came back, and the
   harness measured a grey box under the map's name. Fewer draws and triangles made the
   wrong run look better than the truth. Check the loaded map's identity before
   measuring, and abort with the page's own error.
2. **The shell did not boot.** One module-level syntax error emptied the menu, every
   menu selection did nothing, with no error, and every capture was of a dead menu. Gate the
   run on a boot check that names the error.
3. **The match ended under the sample.** Menu frames are cheap, so a sample that outlives
   the match reports a better median. Assert the game is still in play at the end of the
   sample.

## The gate fails in four cases that used to read as green

- No measurement at all.
- A measurement older than the newest source file: it grades a build that no longer
  exists.
- A level missing from the measurement.
- A level whose arms declared themselves unevaluable.

## Read the machine before the milliseconds

Print the load average before and after, the CPU throttle actually achieved (time a fixed
workload at rate 1 and at the requested rate), and the display's frame period. On a box
running several other browsers, AW asked for 4x and measured 1.56x; that run's
milliseconds are a pessimistic bound, not a cost. Counts (draw calls, triangles, bytes,
allocation sites) do not move with load; milliseconds do.

## Prove the instrument bites

Plant a busy-wait and require the frame budget to fail; plant a full-screen flash and
require the flash check to fire. A harness that has never failed has not been shown to
measure anything.

## Phases the frame harness never saw

Twenty seconds of live play leaves out boot, the menu, the match build and the
countdown, which is where AW's players' complaints were. A phase timeline under one
continuous profile found the countdown hitching for 3.6 s of long tasks, the map being
built twice, and 266.9 MB of decoded audio against a 200 MB budget. Measure every phase a
player sits through, not only the one that is easiest to sample.

## Contention that read as a regression

OC (OG Clash) built, captured, rendered a launch film and measured performance on one
16-core machine shared by many agents, with load averages from 100 to over 360. Three
things went wrong in its numbers, and each has a check.

1. **Other browsers on the same machine.** R143 was held as a regression. Other Chrome
   processes were at 131%, 107% and 55% CPU. Comparing load averages alone missed it.
   Log competing CPU per process for every run, matched on the full command line, and
   reject runs where other work used more than about half the cores. Test the filter
   once by starting a known busy process and checking that it shows up.
2. **Process priority.** A background-priority daemon put headless Chrome into the
   background scheduling class, and it fell from 105 to 5.6 fps for about 4.5 h. Check
   the browser's scheduling class before a run; on macOS, OC restored it with
   `taskpolicy -B`.
3. **Screenshots in the sample.** Frames that overlap a screenshot are slow for reasons
   that have nothing to do with the game. Exclude them, or capture in a separate run.

The protocol that held up alternates the two builds (A, B, A, B) in one session, warms
up for 30 s, samples for 120 s, keeps the pixel ratio and settings fixed, and uses quiet
windows booked for measurement alone. Run A against A first to learn the noise. OC
caught the R143 contention this way and reverted R159 after it lost 6 of 9 pairs.
