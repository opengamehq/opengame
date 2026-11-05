import test from "node:test";
import assert from "node:assert/strict";
import {
  CLOSE_COPY, COMMITTED_ENTRIES_CLOSE_AT, COMMITTED_JAM_KICKOFF_AT, COMMITTED_LAUNCH_AT, KICKOFF_COPY, LAUNCH_COPY,
} from "@opengame/shared/launch-clock";
import { whenPacific } from "../src/jam-time";

/* The committed instants, with the copy whenPacific says them as by default. */
const COMMITTED = [
  ["the launch", COMMITTED_LAUNCH_AT, LAUNCH_COPY],
  ["the kickoff", COMMITTED_JAM_KICKOFF_AT, KICKOFF_COPY],
  ["the close", COMMITTED_ENTRIES_CLOSE_AT, CLOSE_COPY],
] as const;

/* Design review of the clock lane, 5 Nov 2026: a deploy landing on one of the clock's instants
   to the millisecond printed as that moment's day copy ("18 November", no time) in a list of
   deploys that each carry a time. `instant` prints it as the moment it is. */
for (const [name, at, copy] of COMMITTED) {
  test(`${name} is its copy by default, and a moment with a time when it is an instant`, () => {
    assert.equal(whenPacific(at.toISOString()), copy);
    /* The same formatter a minute later, with the minute put back: one way of writing a time. */
    const minuteLater = whenPacific(at.getTime() + 60_000);
    assert.match(minuteLater, /:01 (am|pm) PT$/);
    const expected = minuteLater.replace(":01 ", ":00 ");
    assert.equal(whenPacific(at.toISOString(), { instant: true }), expected);
    assert.equal(whenPacific(at.getTime(), { instant: true }), expected);
    assert.notEqual(expected, copy);
  });
}

test("instant changes nothing for a time that is not one of the clock's", () => {
  for (const at of [COMMITTED_JAM_KICKOFF_AT.getTime() + 60_000, COMMITTED_ENTRIES_CLOSE_AT.getTime() - 120_000, "2027-01-03T17:00:00Z"]) {
    assert.equal(whenPacific(at, { instant: true }), whenPacific(at));
    assert.equal(whenPacific(at, { instant: true, year: true }), whenPacific(at, { year: true }));
  }
  assert.equal(whenPacific("not a time", { instant: true }), "not a time");
});

test("instant and year together write the year into the moment", () => {
  const at = COMMITTED_JAM_KICKOFF_AT.getTime();
  const withYear = whenPacific(at + 60_000, { year: true }).replace(":01 ", ":00 ");
  assert.match(withYear, /^\d{1,2} \p{L}+ \d{4}, /u);
  assert.equal(whenPacific(at, { instant: true, year: true }), withYear);
});
