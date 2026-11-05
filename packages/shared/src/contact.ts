/**
 * The address a person writes to when something has gone wrong.
 *
 * One constant because there were four copies, and the four had already started
 * meaning different things by accident: two page-local `CONTACT` consts on /privacy
 * and /terms, the `REPLY_TO` every email we send carries, and a hardcoded string in
 * the jam entry route's worst-case refusal. Change the mailbox and three of the four
 * get missed, which is a page telling somebody to write to a address that bounces at
 * the exact moment they most need an answer.
 *
 * Lives in `shared` rather than in `emails` because two of the four readers are web
 * pages, and a page should not pull in a mail client to render a mailto link.
 *
 * NOT a secret and not configuration. It is published on two public legal pages, so
 * there is nothing here that wants an environment variable.
 */
export const CONTACT_EMAIL = "team@opengame.io";

/** `mailto:` for the same address, so no call site builds the URL by hand. */
export const CONTACT_MAILTO = `mailto:${CONTACT_EMAIL}`;

/**
 * What every email field says when the address will not do: the waiting list, the deck
 * and preview doors, and the copyright notice.
 *
 * One sentence, one ending. The doors said it without a full stop and the waiting list and
 * the notice with one, so the same refusal read two ways depending on the door (launch e2e
 * area H, H-6; DECISIONS D66). The full stop is the one the rest of these messages carry.
 */
export const INVALID_EMAIL_MESSAGE = "Enter a valid email address.";
