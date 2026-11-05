# Post that reacts, and the lens finish

All values here are reference configurations from our games. Start from them, then tune
by eye against the look bible, at play distance, while moving.

## Lens finish

A restrained lens pass on the graded frame, in display space, after the tone curve:

- **Chromatic aberration** that grows toward the edge and is nearly zero at the centre:
  offset `k * (0.35 + 2.6 r^2)`.
- **Vignette** `smoothstep(0.05, 0.75, r^2)`.
- **Grain** weighted to the shadows, highlights clean, with a new pattern 24 times a
  second. A new pattern every frame reads as noise; 24 Hz reads as film.

| Game | Vignette | Aberration | Grain |
| --- | --- | --- | --- |
| AW | 0.22 | 0.02 | 0.01 |
| DK | 0.34 | 0.11 | 0.014 |

AW is the restrained end, DK the hotter one. Pick one for the game and keep it.

## Post that responds to play

- **Sprint:** vignette +0.12 and aberration +0.05, eased in and out.
- **Missing health:** up to vignette +0.3, aberration +0.16, and saturation down 35%.
- **Damage:** tint the frame edge by (1.25, 0.22, 0.18), decaying at 3.2 per second.
- **Exposure flash:** each shot adds 0.07 of exposure (a heavy shot 0.16), decaying at 7
  per second.

These are DK and AW's numbers. Every one of them must stay inside the flash limits in
`opengame-accessibility`: a full-screen change is bounded per frame however it is driven.

## The ST starter's look

Studio games start from a `createLook` with ACES at exposure 0.8, sRGB output, a warm
shadow-casting key that follows the player, a cool hemisphere fill plus a PMREM of the
sky (shadowed ground about a sixth of lit), a grade (an S-curve, saturation x1.25, cool
shadows, warm highlights), bloom above linear 1, and ambient occlusion on the top
quality tier. Lower tiers drop occlusion, then bloom and multisampling. Stylised art
drops the grade; pixel and flat art drop tone mapping, lights and post so colours stay
exact.

A hand-written `ShaderMaterial` does not apply the output transforms for you.
For direct rendering, write linear color, then include `tonemapping_fragment` and
`colorspace_fragment` at the end of the fragment shader when that material needs
the renderer's output transforms. The `toneMapped` flag controls tone mapping; it
does not insert either chunk. `RawShaderMaterial` also needs its own declarations.

For a post pipeline, keep intermediate render targets linear and apply the output
transforms in the final pass. Inspect the game's actual shader and render path
before changing either; applying a transform twice changes the color again.

## The look pass

At play distance, on the real route:

1. No white or grey haze; fog matches the sky's horizon.
2. Shadowed surfaces sit well below lit ones (see `opengame-lighting`).
3. One warm key casts shadows over a cool fill.
4. Every grounded object shows a contact shadow.
5. The brightest diffuse surface stays below white; highlights roll off.
6. The grade adds contrast without hiding threats, UI or team colours.
7. Only emissive and specular sources bloom.
8. A capture with the grade off is compared, and the clearer one kept.
9. The lowest quality tier still reads.
