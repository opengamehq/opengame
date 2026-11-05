/* The one reading of engine-guides.json. The CLI (engines.ts engineGuide, which init and the
   size refusal print) and the docs generator (scripts/docs-engine-support.mjs, which groups
   the generated pages) both call this, because until 5 Nov 2026 each wrote the same rule
   over the same lists in its own words, and a list read one way in one place and another
   way in the other is how a guide link and the page it lands on drift apart. */
import GUIDES from "./engine-guides.json" with { type: "json" };

/** The family page that covers an id the docs do not name: emscripten, webassembly,
 * javascript, or null for none. */
export function guideFamily(id) {
  return GUIDES.emscripten.includes(id) ? "emscripten" : GUIDES.webassembly.includes(id) ? "webassembly"
    : GUIDES.javascript.includes(id) ? "javascript" : null;
}

/** The docs page for an engine id: its own when the docs name it, else its family's, else the overview. */
export function guidePage(id) {
  return GUIDES.public.includes(id) ? id : guideFamily(id) ?? "overview";
}

/** True for an engine the docs name, whose recipe the docs stand behind. */
export function namedEngine(id) {
  return GUIDES.public.includes(id);
}
