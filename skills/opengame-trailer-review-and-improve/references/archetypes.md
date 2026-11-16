# Archetypes: which trailer to make, and the decision when nobody knows

Most people asking for a trailer bring no music and no idea which kind of trailer they want. Decide from the repo, or
ask once with defaults. The OG Clash trailer was a map and launch trailer hybrid: 62 s of cinematic gameplay with the
structure of a zombies map trailer and the editing of a community montage.

## 1. The decision tree (run it yourself; ask at most one question)

Infer what you can first: store page drafts, release notes, version tags, the changelog, store ids, the README's
pitch, the game's own art and soundtrack. Ask only the release moment if you cannot infer it.

```
1. Where does it play first?
   iOS / iPadOS / Mac / tvOS store -> App Store preview (15-30 s, 30 fps max, 886x1920 or 1920x886) + 30 s social cut
   Google Play only                -> 30-45 s Play preview (the first 30 s carries it, muted) + 15 s vertical
   Meta Quest / VR                 -> 60-90 s 16:9 VR trailer (third-person avatar or mixed reality) + 30 s cut
   Browser game (OpenGame and the like) -> launch trailer 45-75 s 16:9 (1080p60 default, 4K60 on request)
                                       + raw gameplay montage + 15 / 30 s vertical
   Steam / PC / console            -> step 2
2. What is the release moment?
   first showing, no store page    -> gameplay reveal, 60-75 s
   launching now or within 30 days -> launch trailer, 60-90 s (a date or "play now", and a call to action)
   post-launch, 10 or more strong reviews -> accolades, 45-60 s; otherwise launch v2 with new content
   new map / season / DLC          -> map or season trailer, 60-90 s
3. Authored characters with faces, voices, cutscenes?
   yes, and story sells it  -> add a story trailer (90-120 s) as the second video; the first stays gameplay
   yes, a roster game       -> character spotlights (45-60 s each)
   no (abstract, puzzle, sim, pixel) -> tell-show-repeat (a card, then the footage); no voice; type and music carry it
4. Does the art hold up close (rigged faces, LODs at 35-85 mm)?
   yes -> a cinematic cold open of up to 8 s before gameplay is allowed
   no  -> gameplay from frame 1; cinematic language only through camera moves at gameplay distance
5. Tone (art, palette, store copy, soundtrack) -> genre and tempo (the music chapter)
6. Always deliver: the 16:9 master, 30 s and 15 s 9:16 cutdowns, a version readable muted, captions (.srt),
   a clean music-and-effects version (no music or voice) and stems.
```

## 2. The archetypes

| Archetype | When | Length | Beats | Text | Music | Voice |
|---|---|---|---|---|---|---|
| Cinematic story reveal | announcing a big season or character; authored characters | 60-180 s | cold open on a world detail or a line (0-10 s); a character and what they want (10-40 s); conflict escalates (40-75 %); climax image; title; slate 3-6 s; 0.17-0.27 cuts/s, 3-5 s shots | title and slate only | score-like, one big stop before the climax | character dialogue, 3-8 lines |
| Gameplay reveal | first showing; the first store video; showcase events | 60-90 s | 0-3 s hook is the core verb at its best (no logos); 3-15 s genre and player fantasy; 15-55 s show-tell-repeat of 2-3 pillars, escalating; montage with a rising cut rate; a stop and a hero moment; title at about 85 %; slate 4-6 s | 0-4 short cards about the fantasy | driving cue with a clear build and drop | optional |
| Launch trailer (OG Clash) | release week | 60-120 s | as the reveal, with the best late-game content held for the climax; slate with "out now" or a date, platforms and a call to action | date and call to action | the most anthemic cue | reprise iconic lines |
| Map, season or DLC | a new map, season or expansion | 60-100 s (the Black Ops 6/7 map trailers run about 62 s) | an establishing shot allowed in 0-5 s; first enemy by about 6-13 s; new weapon or boss mid-film; a boss tease and the loudest hit before the title; title at 84-90 %; end card 4-6.5 s; a 2-7 s stinger in 4 of 12 measured | the map's name only | composed or licensed, with stops | crew lines; the name spoken as the title lands |
| Montage or velocity edit | community energy, a skill showcase | 30-180 s | beat-locked motion; intro 0.4-0.9 cuts/s, body 1.0-1.45, one held breakdown, a slow outro; ends on a held slow image | none or minimal | one track, cut to it | none |
| Raw gameplay montage (OG Clash, launch day) | proof the game is real, next to the cinematic trailer | 45-90 s | the player's journey in order, 4-10 s per segment, hard cuts | none | the game's own score under the raw sound | none |
| Accolades | only with many strong reviews | 30-90 s | a montage with 3-6 long, clear quotes from known outlets, 2-3 s each; a wall of laurels at the end | quotes | the launch cue | none |
| Story trailer | narrative games; a second video | 90-150 s | a line at 0-5 s; world and want; antagonist; stakes; montage; an open question; title | minimal | emotive, wider dynamics | lines that generalise |
| Character spotlight | roster drops | 45-120 s | the hero's line at 0 s; signature pose by 3 s; one shot per ability (2-4 s); the ultimate is the drop; name and date | ability names optional | the hero's theme | the hero's lines only |
| Store page trailer (Steam and others) | every store listing | 45-90 s | frame 1 is recognisable gameplay from deep in the game; genre legible in 5-10 s muted; no studio logos up front; ends on the title and "Wishlist" | short, readable muted | structured (it often plays muted) | optional |
| Social 15 s / 30 s | ads, short-form feeds, replies | 15 or 30 s, 9:16 first | 0-1.5 s is the strongest moment, centred; escalation; the hero hit; title and call to action in the last 2-4 s | burned in, inside safe zones | a loop-friendly edit, downbeat at 0 | none or one captioned line |
| App Store preview | iOS stores | 15-30 s, 30 fps max, device sizes | the core interaction in 0-3 s; 3-5 features with copy; title or disclosure at the end; no hands, devices, prices or dates | required (it autoplays muted) | one track | optional |
| Google Play preview | Android | the first 30 s autoplay muted | real gameplay within 10 s, at least 80 % representative | no "#1" claims or calls to action | | |
| Console store | PlayStation, Xbox, eShop | 30-120 s | gameplay-forward, the platform's own footage, a rating card per region; no other platform's logos or button glyphs; captions (Xbox requires .srt) | | | |
| VR or mixed reality | VR titles | 30 s-2 min | a stabilised spectator camera, a third-person avatar or a mixed-reality composite; "Captured on [device]" | | | |

Platform rules change: check the store's current preview and trailer requirements before you render, and keep a
link to the page you checked in the plan.

## 3. The launch package (offer it up front)

For a launch, offer the package and ask which pieces are wanted. OG Clash produced all of them over two days, mostly
unplanned:

1. The cinematic trailer (16:9; master 1080p60 by default, 4K60 if asked).
2. A raw gameplay montage (full HUD, real time, 45-90 s).
3. A share card: a real graded game frame at 2400x1260 with debug overlays painted out, the game's logo, a call to
   action and the URL; exported as a 1200x630 JPEG under about 300 KB plus a PNG, a 1200x1200 square and a favicon set
   made from the mark alone (legible at 16 px); `og:*` and `twitter:card` tags with width, height and alt text
   describing the actual frame; cross-origin resource and cache headers on the images; checked on each platform's link
   debugger.
4. Social cuts: 30 s and 15 s in 9:16 with burned-in captions, and an inline 720p preview under 50 MB.

Check the end card's "play now" claim against the game's real first-load time on typical connections, and test the
trailer link landing in the in-app browsers of the networks it will be posted to.

## 4. The raw gameplay montage: the proof next to the fantasy

The OG Clash owner's brief for it, on launch day: "make sure its good gameplay not like a noob or not able to play
etc ... i want the full hud ... just from their spawning in and killing first zombies and running and jumping and side
flipping too just like a real person etc... can be 45-90 seconds long". Their only content note: "why werent u hitting
and shooting its weak spots? Ur shooting the visor when thats not the objective there?"

- **Spec:** 45-90 s at the target resolution; full HUD with frame counters and debug overlays off; real time, no slow
  motion, hard cuts, no text; segments of 4-10 s in the order a player meets them (menu, character, loadout, spawn and
  first kills, movement, aimed kills, the game's signature systems, an objective, the boss); first person for aiming,
  the game's own third-person view for acrobatics (first-person flips read as a camera spin).
- **Play the game correctly on camera.** For every beat, read the on-screen objective, prompt and subtitle, and make
  the action fulfil it with visible success feedback. Check it in a 720p rehearsal before the master take.
- **Skilled play only.** Drive play with a capture-only aim and fire helper, not a playtest bot (OG Clash's bot got
  stuck on rubble): fire only when the aim is on a visible target, the nearest threat under about 7 m first, aim down
  sights past about 7 m, pulse semi-automatic triggers, aim at a visible point rather than the centre of mass. Never get hit on camera (cut before contact). No player stuck, firing at nothing, or
  score jumps between cuts that reveal developer setups. God mode and fixtures stay off camera.
- **Audio:** record with the game music muted, and verify the mute by loudness (a mute that failed silently cost a full
  nine-segment reshoot). Lay the game's own score per act (menu, play, boss) with crossovers of about 0.3 s under the
  raw effects, 12 ms fades at each cut, about −16 LUFS, true peak at or under −1 dBTP.
- **Delivery:** OG Clash delivered a 4K60 HEVC master at about 32 Mbps (`hvc1` tag, `+faststart`), a 1080p60 x264 CRF
  17 copy and a 720p inline preview at about 6.5 Mbps. Post a preview sheet per segment as each
  lands, and the inline preview the moment a cut exists.
- **It is a QA pass on the game.** Watch subtitles and voice for duplicates or bugs (one line was said and subtitled
  twice) and file each as a game note.
- **Launch media loses to the release.** "dont worry about montage v2 put all ur power into just getting this out".
  There may be no second pass: rehearse objectives and get it right the first time.
- **Uploads share the network.** Do not upload a large video while the game is deploying; a 130 MB upload broke a
  production deploy. Warn the game team first.

## 5. The share card

A real in-game hero frame at 2400x1260 with debug overlays painted out, graded (an S-curve, a split tone, a vignette, bloom on
lights, fine grain), the game's lockup, the call to action and the URL. Flat brand type, no gradient or shimmer. Export
the sizes above, alt text that describes the real frame, cache headers on the images, and validate on the link
debuggers of every network it will be shared to. Verify every URL against the live domain before it ships (a request
once named the wrong domain). Show the owner the card before it goes out.
