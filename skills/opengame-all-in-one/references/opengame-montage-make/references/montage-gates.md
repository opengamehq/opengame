# Montage gates: what caught real problems, what was noise, and the review sources

The approved OG Snipers final failed 34 of its 87 gates. From the fifth cut to the nineteenth the count sat at 27-30
FAILs and never predicted the owner's verdicts. 26 gates failed on every cut, and they hid the two that mattered. A gate
is only worth running if it catches what the owner would catch, so build montage gates this way.

## 1. What caught real problems

Each of these was built after the owner named a defect family, or measures a pipeline invariant, and was calibrated on
the owner's own frames:

- **Hero jitter:** the hero's projected position against a quadratic fit in game time over 9 frames, pass at 1.5-2.0 px
  RMS (51-68 px RMS before the draw-sync hook, 0.2-0.4 px after; the measuring chapter has the method).
- **Slow-motion smoothness:** every frame its own evenly spaced state of every body and the camera.
- **The hard sound-sync gate:** every payoff frame has its sound, attack within a frame.
- **The mix carries the edit list's signature** and is muxed only on a match.
- **Payoff order:** no reaction shown before its cause; no payoff shown twice.
- **Feed names and uniqueness**; **medals** on multi-payoffs only, each on its own frame.
- **No hard scope** (or your genre's low-skill form), **no dead time**, **every grid point carries an event**.
- **Opponents not stuck:** an opponent ordered to move covers at least a fifth of the distance over any 6 frames.
- Near-still bodies; a stop on the trigger (flow through the payoff frame); the scope housing's share of the frame; a
  penetration probe for anything passing through anything.
- **The flicker scan** in its final form (flow-compensated, calibrated on the owner's flagged frame).
- **The title box** on the finished file against its approved comp.
- **A speech recogniser on the mix** for callouts.
- **The rig's own take checks:** frame count, duplicate signatures, clock skips, a quality preset that was not the top
  one, a payoff the spec asked for that did not happen.

## 2. What was noise, or wrong

- Eleven versions of the flicker check passed the take the owner called "way too much z flickering"; the first
  flow-compensated pass ranked the one real z-fight 658th under camera motion; a flicker hold spent 19 of 25 minutes
  drawing strips before giving its verdict.
- Invented thresholds ("the hero travels 20 m").
- Gates on logged body points that disagreed with the picture: one passed a head flipping on alternate frames and failed
  an even fall.
- An onset-grouping cut gate; a critic's "the grid is 20-44 ms late" (measured 0 ms); critics' "mannequin" verdicts on
  shots the owner liked.
- **Every number calibrated on the reference edit** failed on the approved final: seam speed (9.2 against 13.5 px/f),
  the payoff-cycle ratio, cuts per second (0.43 against 0.6), tied-shot length, first-person share, section shape,
  flashes per minute, loudness spread, title width. The owner approved the film anyway.

## 3. Rules for montage gates

1. **Two tiers.** Hard: pipeline invariants (frame count, sync within a frame, the mix signature, no duplicate or frozen
   frames, colour tags) and one gate per owner defect family, each proved to FAIL on the frame the owner flagged and to
   PASS on a frame they praised. Informational: every number derived from the reference.
2. **Report the delta,** not the total: new FAILs since the last cut, newly fixed, standing. A gate that failed on every
   cut and that the owner never asked about is informational until someone takes on its family.
3. **Measure the picture where the complaint is visual,** and sound as heard on the delivered mix.
4. **A gate must not contradict the owner:** designed-silence and loudness-spread gates go when they ban dropouts.
5. **Clear once, by take:** a cleared list keyed by take, frames and box; a re-shot take inherits nothing.
6. **Bind repairs and exceptions to takes, and warn loudly when a slot's take changes:** a z-fight repair silently
   stopped applying for five cuts while the owner was told those cuts were checked.
7. **Verdict first, evidence after.**
8. **Cross-clip sheets** for every recurring element (feed, markers, medals, the hero's weapon and skin, the title on
   each finished file; in other genres the score bug, position change, health bars, combo counter, livery), with anchors
   diffed in pixels.
9. **Every frame** for any shot with a body, a fall or a hero move; never every-2nd-frame sheets, which hid an
   alternate-frame head flip until after the cut was called final.

## 4. The owner's never-list, gated

Ask the owner what they will never accept on screen, and gate each item on their own flagged frames before any cut is
sent. The OG Snipers never-list: hard scopes, clipping, jitter, z-fighting, stuck AI, a reaction before its action, the
wrong receiver, dead time after the last payoff, a floating first-person arm. Add your genre's fake tells (the genre
chapter).

## 5. Review sources, measured

The OG Snipers owner sent 62 notes that named a defect in a delivered cut. Something in the review machinery had flagged
28 of them first (45 %), and all 28 still reached the owner.

| Source | Hit rate on the owner's notes | Times it pushed the film the wrong way | Good at |
|---|---|---|---|
| An independent every-frame sweep | **50 %** (14.5 of the 29 it could see) | once (it recommended cutting praised shots) | visual defect families on outside shots; one sweep matched the owner's notes on six death shots exactly, ten minutes after the owner sent them |
| Blind scored critics | 10 % | 4 times (hard scopes, varied gaps, silences, short tails) | craft relative to the reference (transitions, ramps, grade, names) |
| Gates | 10 % | once, plus one false PASS on gun levels | the owner's named families, once calibrated |
| The director's own rulings | 8 % | twice | exact, frame-numbered reasons; never watched a cut in motion |
| A scoring panel of judges | 0 % | none | it never ran: it was held for "the bar is met" at every cut |

The owner repeated themselves at least six times, each time on a note believed fixed and never verified where they look.
The loop that converged the film was the owner's eye. The review skill's procedure, the sweep brief and the judge brief
exist to move that hit rate before the send.
