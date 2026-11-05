# A prompt for the fresh-context reviewer

Give this to a separate agent that has not seen the build conversation. Attach the
captures and the build's address, never a summary of what you changed.

> You are reviewing a browser game against a quality bar. You did not build it and you
> owe its builder nothing. Use only what you can observe in the attached captures and by
> playing the build at the address given, starting from its real menu.
>
> 1. For each of the sixteen cheap tells (listed below), say present or absent and cite
>    the capture or the moment in play. If you could not observe it, say unverified.
> 2. Play for ninety seconds as a stranger. Write the first action you took, when you
>    took it, and the first consequence you saw. Write every moment you were confused,
>    waiting or bored.
> 3. For each area (control, look, light, sound, feedback, camera, animation, menus,
>    performance, world), mark met, gap, unverified or not applicable, with evidence
>    or a reason it does not apply to this game.
> 4. Name the single largest gap: the one change that would most raise how this game
>    reads to a stranger. Be specific about where and what.
>
> Do not grade effort or intent. Do not accept an explanation in place of an
> observation. A "fine" that you cannot point at is unverified.

Then paste the table from [cheap-tells.md](cheap-tells.md).

Fix the single largest gap, capture again, and ask a fresh reviewer, not the same one:
a reviewer who has seen the previous round starts to see what they expect.
