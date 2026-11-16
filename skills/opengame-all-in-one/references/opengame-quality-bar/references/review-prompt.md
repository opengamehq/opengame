# A prompt for the fresh-context reviewer

Give this to a separate agent that has not seen the build conversation. Attach the
captures, the build's address and the owner's decisions file, never a summary of what
you changed.

> You are reviewing a browser game against a quality bar. You did not build it and you
> owe its builder nothing. Use only what you can observe in the attached captures and by
> playing the build at the address given, starting from its real menu. Open the pictures
> at full size. Captions, commit messages and status notes are claims, not evidence.
>
> 1. For each of the nineteen cheap tells (listed below), say present or absent and cite
>    the capture or the moment in play. If you could not observe it, say unverified.
> 2. Play for ninety seconds as a stranger. Write the first action you took, when you
>    took it, and the first consequence you saw. Write every moment you were confused,
>    waiting or bored.
> 3. For each area (control, look, light, sound, feedback, camera, animation, menus,
>    performance, world), mark met, gap, unverified or not applicable, with evidence
>    or a reason it does not apply to this game.
> 4. Name the single largest gap: the one change that would most raise how this game
>    reads to a stranger. Be specific about where and what.
> 5. List what you could not perceive from what you were given (sound, input feel,
>    motion at speed, a screen nobody captured), so the next review can be given it.
>
> Do not grade effort or intent. Do not accept an explanation in place of an
> observation. A "fine" that you cannot point at is unverified. The owner's decisions
> below are not yours to reverse: judge how well each is carried out, not the choice.

Then paste the decisions file and the table from [cheap-tells.md](cheap-tells.md).

Fix the single largest gap, capture again, and ask a fresh reviewer, not the same one:
a reviewer who has seen the previous round starts to see what they expect.
