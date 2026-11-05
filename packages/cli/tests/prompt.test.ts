import test from "node:test";
import assert from "node:assert/strict";
import { GAME_KINDS, GENRES } from "@opengame/shared";
import { labelWidth, menuRow, menuWindow, type PromptOption } from "../src/prompt";

/* The jam's model list is 36 options. Printed whole in a 30-row terminal, the menu
   could not be redrawn in place and every keypress printed another copy. */
test("a long menu shows a window that fits the terminal and keeps the cursor in it", () => {
  assert.deepEqual(menuWindow(36, 0, 0, 30), { top: 0, size: 22 });
  assert.deepEqual(menuWindow(36, 30, 0, 30), { top: 9, size: 22 });
  assert.deepEqual(menuWindow(36, 35, 9, 30), { top: 14, size: 22 });
  assert.deepEqual(menuWindow(36, 2, 14, 30), { top: 2, size: 22 });
  // Short lists and short terminals.
  assert.deepEqual(menuWindow(3, 1, 0, 30), { top: 0, size: 3 });
  assert.deepEqual(menuWindow(36, 0, 0, 6), { top: 0, size: 3 });
});

/* "World  A place to explore" one row and "Decomp  A rebuilt..." the next put the hints in
   four columns, one per label length. Each menu pads its labels to its own longest, so the
   hints start in one column; the genre menu had the same ragged edge. */
test("every hint in a menu starts in one column, the kinds' and the genres' alike", () => {
  const column = (options: PromptOption[]) => {
    const width = labelWidth(options);
    return options.filter(option => option.hint).map(option => menuRow(option, width).indexOf(option.hint!));
  };
  for (const options of [
    GAME_KINDS.map(row => ({ value: row.slug, label: row.label, hint: row.help })),
    GENRES.map(row => ({ value: row.slug, label: row.label, hint: row.includes.slice(0, 3).join(", ") })),
  ]) {
    const starts = column(options);
    assert.equal(new Set(starts).size, 1, JSON.stringify(starts));
    assert.equal(starts[0], labelWidth(options) + 2, "two spaces after the longest label");
  }
  /* Measured per menu: the kinds are not padded out to the genres' longest label. */
  assert.equal(labelWidth(GAME_KINDS.map(row => ({ value: row.slug, label: row.label, hint: row.help }))), Math.max(...GAME_KINDS.map(row => row.label.length)));
  /* A row with no hint ("Decide later") is not padded, and does not widen the column. */
  assert.equal(menuRow({ value: "", label: "Decide later" }, 30), "Decide later");
  assert.equal(labelWidth([{ value: "a", label: "Ab", hint: "x" }, { value: "", label: "A much longer label" }]), 2);
  /* The multi-select mark sits before the label and the pad after it. */
  assert.equal(menuRow({ value: "a", label: "Ab", hint: "x" }, 4, "[ ] "), "[ ] Ab    x");
});