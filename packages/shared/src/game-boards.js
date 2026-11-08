/**
 * What a leaderboard is, in one place: the board a game declares, the run it submits, and
 * how a value is drawn.
 *
 * Until 7 Nov 2026 a board was a key, a label, a direction and one number per player. Der
 * Koloss's own site ranked 2,239 runs with round, kills, downs, revives, score and time,
 * split into solo and co-op, and Smash Royale's had a dozen stats; OpenGame showed one number
 * and fifty rows of it. So a board now declares three more things, and every reader of a
 * board (og-api, the SDK, the deploy check, the game page, the import) asks this file what
 * they mean rather than deciding again:
 *
 *   - `columns`: stats beside the score. Each has a key, a label, a format, a direction and
 *     optional plausible bounds held exactly as the score's are. The score stays the board's
 *     primary column and keeps its own `order`, `min` and `max`, so a board declared before
 *     this file is a board with no extra columns.
 *   - `variants`: tags a run carries and the page filters by, such as mode solo or co-op.
 *     "All" is not a value; it is the board read with no filter.
 *   - `keep`: `best` keeps one row per player for each combination of tags (a player's best
 *     solo run and best co-op run), and every read shows each player once, by their best row
 *     for the column being sorted. `runs` keeps every run, up to `runsPerPlayer` per player
 *     per combination, replacing that player's worst once they are at the cap, and every
 *     read shows every run. Neither is a default a reader can guess, so it is written down.
 *
 * Plain JavaScript with a declaration file beside it, like game-scores.js, because the SDK's
 * build folds it into the game-side bundle and og-api imports it by relative path.
 *
 * EVERY NUMBER HERE IS STILL THE GAME'S CLAIM. A stat column is as forgeable as the score
 * (AGENTS.md); bounds keep a forgery quiet, and the board is labelled as the game's report.
 */

export const BOARD_FORMATS = Object.freeze(['number', 'integer', 'duration_ms', 'duration_s', 'percent', 'distance_m']);
export const BOARD_KEEPS = Object.freeze(['best', 'runs', 'career']);
/* A career board (keep `career`) holds one row per player that aggregates every accepted run
   of the board it is fed `from`: the score with `scoreAgg`, each column with its `agg`. */
export const SCORE_AGGS = Object.freeze(['sum', 'count', 'max', 'min']);
export const COLUMN_AGGS = Object.freeze(['count', 'sum', 'max', 'min', 'avg', 'ratio']);
export const WHERE_OPS = Object.freeze(['eq', 'lt', 'lte', 'gt', 'gte']);
/** The sort key that means the board's own score, so no column may take it. */
export const SCORE_SORT = 'score';
const RESERVED_COLUMN_KEYS = new Set([SCORE_SORT, 'rank', 'player', 'name', 'all']);
const KEY = /^[a-z][a-z0-9_]*$/;
const VALUE = /^[a-z0-9][a-z0-9_-]*$/;

const object = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const finite = value => typeof value === 'number' && Number.isFinite(value);
const label = (value, max) => typeof value === 'string' && value.trim().length > 0 && [...value.trim()].length <= max;
const fail = reason => ({ ok: false, reason });

/**
 * A board declaration (an `opengame.json` `leaderboards[]` entry), checked and normalised.
 * `caps` is `LIMITS.platform.manifest`. Unknown keys are refused, as the manifest's own
 * strict schema refuses them, so the SDK's local mode and a deploy agree.
 */
export function parseBoardShape(raw, caps) {
  if (!object(raw)) return fail('A leaderboard must be an object.');
  const known = new Set(['key', 'label', 'order', 'min', 'max', 'scoreLabel', 'format', 'keep', 'runsPerPlayer', 'columns', 'variants', 'from', 'scoreAgg']);
  for (const key of Object.keys(raw)) if (!known.has(key)) return fail(`Unknown leaderboard field: ${key.slice(0, 32)}.`);
  if (typeof raw.key !== 'string' || !KEY.test(raw.key) || raw.key.length > caps.boardKeyCharsMax) return fail('Use a lowercase board key.');
  if (raw.order !== 'asc' && raw.order !== 'desc') return fail(`${raw.key}: order must be asc or desc.`);
  if (raw.label !== undefined && !label(raw.label, caps.boardLabelCharsMax)) return fail(`${raw.key}: label is empty or too long.`);
  const bounds = checkBounds(raw, raw.key); if (bounds) return fail(bounds);
  if (raw.scoreLabel !== undefined && !label(raw.scoreLabel, caps.boardColumnLabelCharsMax)) return fail(`${raw.key}: scoreLabel is empty or too long.`);
  if (raw.format !== undefined && !BOARD_FORMATS.includes(raw.format)) return fail(`${raw.key}: format must be one of ${BOARD_FORMATS.join(', ')}.`);
  if (raw.keep !== undefined && !BOARD_KEEPS.includes(raw.keep)) return fail(`${raw.key}: keep must be best, runs or career.`);
  const keep = raw.keep ?? 'best';
  const career = keep === 'career';
  /* A career board is fed by another board's runs, never submitted to, so it names that board
     and how its score aggregates, and only a career board may. Its rows are sums and counts of
     runs the source already held to its own bounds, so bounds of its own would mean nothing. */
  if (career !== (raw.from !== undefined) || career !== (raw.scoreAgg !== undefined)) {
    return fail(`${raw.key}: a career board names the board it is fed from and its scoreAgg, and only a career board does.`);
  }
  if (career) {
    if (typeof raw.from !== 'string' || !KEY.test(raw.from) || raw.from.length > caps.boardKeyCharsMax || raw.from === raw.key) {
      return fail(`${raw.key}: from names another board of this game by its key.`);
    }
    if (!SCORE_AGGS.includes(raw.scoreAgg)) return fail(`${raw.key}: scoreAgg must be one of ${SCORE_AGGS.join(', ')}.`);
    if (raw.min !== undefined || raw.max !== undefined) return fail(`${raw.key}: a career board has no bounds of its own; its source board's bounds hold every run it counts.`);
  }
  /* Required on a runs board rather than defaulted: how many rows one player may hold is the
     board's own decision, and the database that stores a release's boards cannot read a
     default out of limits.json, so a default would be a number copied into SQL. */
  if ((keep === 'runs') !== (raw.runsPerPlayer !== undefined) || (raw.runsPerPlayer !== undefined
    && (!Number.isSafeInteger(raw.runsPerPlayer) || raw.runsPerPlayer < 1 || raw.runsPerPlayer > caps.boardRunsPerPlayerMax))) {
    return fail(`${raw.key}: a board that keeps runs sets runsPerPlayer, a whole number from 1 to ${caps.boardRunsPerPlayerMax}, and only such a board sets it.`);
  }
  const columns = [];
  if (raw.columns !== undefined) {
    if (!Array.isArray(raw.columns) || raw.columns.length > caps.boardColumnsMax) return fail(`${raw.key}: at most ${caps.boardColumnsMax} columns.`);
    for (const column of raw.columns) {
      const parsed = parseColumn(column, caps, raw.key, career); if (!parsed.ok) return parsed;
      if (columns.some(item => item.key === parsed.column.key)) return fail(`${raw.key}: column ${parsed.column.key} is declared twice.`);
      // A ratio divides two columns declared before it that are not ratios themselves, so the
      // database can compute every column of a row in one pass, in order.
      const ratio = parsed.column.agg === 'ratio' ? parsed.column : null;
      if (ratio && ratio.of.some(key => !columns.some(item => item.key === key && item.agg !== 'ratio'))) {
        return fail(`${raw.key}.${ratio.key}: a ratio divides two columns declared before it.`);
      }
      if (ratio?.requires && !columns.some(item => item.key === ratio.requires.column && item.agg !== 'ratio')) {
        return fail(`${raw.key}.${ratio.key}: requires names a column declared before it.`);
      }
      columns.push(parsed.column);
    }
  }
  /* The budget platform_board_shape_ok (20261108010000) applies to a career row's 1024 bytes
     of stats: each key at its length plus 30 bytes, an average three keys (its value and two
     accumulators). It fits a double as usually written, not every double: 1e300 is written out
     as 301 digits, and the database keeps the row it had rather than store one that does not
     fit. Refused here too, or a declaration this accepted would be skipped by the database and
     its board never appear. */
  if (career) {
    let budget = 2;
    for (const column of columns) {
      budget += column.agg === 'avg' ? 3 * column.key.length + 8 + 90 : column.key.length + 30;
    }
    if (budget > 1024) return fail(`${raw.key}: its columns could outgrow a row's 1024 bytes of stats; use fewer columns, shorter keys or fewer averages.`);
  }
  const variants = [];
  if (raw.variants !== undefined) {
    if (!Array.isArray(raw.variants) || raw.variants.length > caps.boardVariantsMax) return fail(`${raw.key}: at most ${caps.boardVariantsMax} variants.`);
    let combos = 1;
    for (const variant of raw.variants) {
      const parsed = parseVariant(variant, caps, raw.key); if (!parsed.ok) return parsed;
      if (variants.some(item => item.key === parsed.variant.key)) return fail(`${raw.key}: variant ${parsed.variant.key} is declared twice.`);
      variants.push(parsed.variant);
      // A run may leave a dimension out, which is one more combination than its values.
      combos *= parsed.variant.values.length + 1;
    }
    if (combos > caps.boardVariantCombosMax) return fail(`${raw.key}: its variants make ${combos} combinations, more than ${caps.boardVariantCombosMax}.`);
  }
  return { ok: true, shape: Object.freeze({
    key: raw.key, label: raw.label?.trim() ?? null, order: raw.order,
    min: finite(raw.min) ? raw.min : null, max: finite(raw.max) ? raw.max : null,
    scoreLabel: raw.scoreLabel?.trim() ?? null, format: raw.format ?? 'number', keep,
    runsPerPlayer: keep === 'runs' ? raw.runsPerPlayer : 1,
    columns: Object.freeze(columns), variants: Object.freeze(variants),
    ...(career ? { from: raw.from, scoreAgg: raw.scoreAgg } : {}),
  }) };
}

/* A bound may be left out or null. When given it is a number a database double holds without
   rounding to infinity or zero, the rule 20261006200100 applies to a release's bounds: a bound
   this accepted and the database refused would publish a board that silently never appears. */
const boundOk = value => value === undefined || value === null
  || (finite(value) && (value === 0 || (Math.abs(value) >= 1e-300 && Math.abs(value) <= 1e300)));
function checkBounds(raw, where) {
  if (!boundOk(raw.min)) return `${where}: min must be a number between -1e300 and 1e300.`;
  if (!boundOk(raw.max)) return `${where}: max must be a number between -1e300 and 1e300.`;
  if (finite(raw.min) && finite(raw.max) && raw.min > raw.max) return `${where}: min is greater than max.`;
  return null;
}

function parseColumn(raw, caps, board, career = false) {
  if (!object(raw)) return fail(`${board}: a column must be an object.`);
  const fields = ['key', 'label', 'format', 'order', 'sortable', 'min', 'max', 'decimals', ...(career ? ['agg', 'of', 'where', 'scale', 'requires'] : [])];
  for (const key of Object.keys(raw)) if (!fields.includes(key)) return fail(`${board}: unknown column field ${key.slice(0, 32)}${career ? '' : ' (agg, of and where belong to career boards)'}.`);
  if (typeof raw.key !== 'string' || !KEY.test(raw.key) || raw.key.length > caps.boardColumnKeyCharsMax) return fail(`${board}: use a lowercase column key.`);
  if (RESERVED_COLUMN_KEYS.has(raw.key)) return fail(`${board}: ${raw.key} is reserved; pick another column key.`);
  if (!label(raw.label, caps.boardColumnLabelCharsMax)) return fail(`${board}.${raw.key}: label is empty or too long.`);
  if (raw.format !== undefined && !BOARD_FORMATS.includes(raw.format)) return fail(`${board}.${raw.key}: format must be one of ${BOARD_FORMATS.join(', ')}.`);
  if (raw.order !== undefined && raw.order !== 'asc' && raw.order !== 'desc') return fail(`${board}.${raw.key}: order must be asc or desc.`);
  if (raw.sortable !== undefined && typeof raw.sortable !== 'boolean') return fail(`${board}.${raw.key}: sortable must be true or false.`);
  const bounds = checkBounds(raw, `${board}.${raw.key}`); if (bounds) return fail(bounds);
  const base = { key: raw.key, label: raw.label.trim(), format: raw.format ?? 'number',
    order: raw.order ?? 'desc', sortable: raw.sortable ?? true,
    min: finite(raw.min) ? raw.min : null, max: finite(raw.max) ? raw.max : null };
  /* `decimals` fixes how many decimals every value in the column is drawn with, so a column
     reads as one set of numbers that line up ("13.0%" beside "22.1%", "6.0" beside "3.2").
     Kept only when declared, or defaulted (one) on a career average or ratio, whose values are
     fractions by construction; a board from before it is unchanged. */
  if (raw.decimals !== undefined && (!Number.isSafeInteger(raw.decimals) || raw.decimals < 0 || raw.decimals > 4)) {
    return fail(`${board}.${raw.key}: decimals is a whole number from 0 to 4.`);
  }
  if (raw.decimals !== undefined) base.decimals = raw.decimals;
  if (!career) return { ok: true, column: Object.freeze(base) };
  if (base.decimals === undefined && (raw.agg === 'avg' || raw.agg === 'ratio')) base.decimals = 1;
  const agg = parseAggregate(raw, `${board}.${raw.key}`); if (!agg.ok) return agg;
  if (raw.min !== undefined || raw.max !== undefined) return fail(`${board}.${raw.key}: a career column has no bounds; the runs it counts were held to the source board's.`);
  return { ok: true, column: Object.freeze({ ...base, ...agg.agg }) };
}

/* How a career column aggregates a player's accepted runs, normalised. `of` is `score` (the
   source run's score) or a column key of the source board; whether that key exists is the
   cross-check's to say (crossCheckBoards), since one declaration cannot see another. */
function parseAggregate(raw, where) {
  if (!COLUMN_AGGS.includes(raw.agg)) return fail(`${where}: agg must be one of ${COLUMN_AGGS.join(', ')}.`);
  const field = value => value === SCORE_SORT || (typeof value === 'string' && KEY.test(value) && value.length <= 32);
  if (raw.agg === 'ratio') {
    if (!Array.isArray(raw.of) || raw.of.length !== 2 || !raw.of.every(field) || raw.of[0] === raw.of[1]) return fail(`${where}: a ratio's of is two column keys, [numerator, denominator].`);
    if (raw.where !== undefined) return fail(`${where}: a ratio has no where.`);
    if (raw.scale !== undefined && (!finite(raw.scale) || raw.scale <= 0 || raw.scale > 1e6)) return fail(`${where}: scale is a positive number, such as 100 for a percentage.`);
    let requires = null;
    if (raw.requires !== undefined) {
      if (!object(raw.requires) || Object.keys(raw.requires).some(key => key !== 'column' && key !== 'atLeast')
        || !field(raw.requires.column) || !finite(raw.requires.atLeast) || raw.requires.atLeast < 0) {
        return fail(`${where}: requires is { column, atLeast }, such as { "column": "matches", "atLeast": 5 }.`);
      }
      requires = { column: raw.requires.column, atLeast: raw.requires.atLeast };
    }
    return { ok: true, agg: { agg: 'ratio', of: [...raw.of], scale: raw.scale ?? 1, requires } };
  }
  if (raw.scale !== undefined || raw.requires !== undefined) return fail(`${where}: scale and requires belong to a ratio.`);
  if (raw.agg === 'count' ? raw.of !== undefined && !field(raw.of) : !field(raw.of)) {
    return fail(`${where}: of names what is aggregated, score or a column of the source board${raw.agg === 'count' ? ' (a count may leave it out)' : ''}.`);
  }
  let filter = null;
  if (raw.where !== undefined) {
    if (!object(raw.where) || Object.keys(raw.where).some(key => !['of', 'op', 'value'].includes(key)) || !field(raw.where.of)
      || !WHERE_OPS.includes(raw.where.op) || !finite(raw.where.value)) {
      return fail(`${where}: where is { of, op, value }, op one of ${WHERE_OPS.join(', ')}, such as { "of": "placement", "op": "eq", "value": 1 }.`);
    }
    filter = { of: raw.where.of, op: raw.where.op, value: raw.where.value };
  }
  return { ok: true, agg: { agg: raw.agg, of: raw.of ?? null, where: filter } };
}

/**
 * What one declaration cannot check about another, for a manifest that declares a career board
 * beside its source: the source exists, keeps runs or bests (a career board is not fed by a
 * career board), every `of` is its score or one of its columns, and every variant of the career
 * board is a variant of the source with values it has. Null when they agree.
 */
export function crossCheckBoards(shapes) {
  for (const career of shapes.filter(shape => shape.keep === 'career')) {
    const source = shapes.find(shape => shape.key === career.from);
    if (!source) return `${career.key}: it is fed from ${career.from}, which this game does not declare.`;
    if (source.keep === 'career') return `${career.key}: a career board is fed by a board of runs or bests, not by ${career.from}, another career board.`;
    const fields = new Set([SCORE_SORT, ...source.columns.map(column => column.key)]);
    for (const column of career.columns) {
      const refs = column.agg === 'ratio' ? [] : [column.of, column.where?.of].filter(Boolean);
      const missing = refs.find(ref => !fields.has(ref));
      if (missing) return `${career.key}.${column.key}: ${missing} is not ${career.from}'s score or one of its columns.`;
    }
    for (const variant of career.variants) {
      const theirs = source.variants.find(item => item.key === variant.key);
      if (!theirs || variant.values.some(value => !theirs.values.some(item => item.key === value.key))) {
        return `${career.key}: variant ${variant.key} must be one of ${career.from}'s, with values it has.`;
      }
    }
  }
  return null;
}

function parseVariant(raw, caps, board) {
  if (!object(raw)) return fail(`${board}: a variant must be an object.`);
  for (const key of Object.keys(raw)) if (!['key', 'label', 'values'].includes(key)) return fail(`${board}: unknown variant field ${key.slice(0, 32)}.`);
  if (typeof raw.key !== 'string' || !KEY.test(raw.key) || raw.key.length > caps.boardColumnKeyCharsMax) return fail(`${board}: use a lowercase variant key.`);
  if (!label(raw.label, caps.boardColumnLabelCharsMax)) return fail(`${board}.${raw.key}: label is empty or too long.`);
  if (!Array.isArray(raw.values) || raw.values.length < 1 || raw.values.length > caps.boardVariantValuesMax) {
    return fail(`${board}.${raw.key}: declare from 1 to ${caps.boardVariantValuesMax} values.`);
  }
  const values = [];
  for (const value of raw.values) {
    if (!object(value) || Object.keys(value).some(key => key !== 'key' && key !== 'label')
      || typeof value.key !== 'string' || !VALUE.test(value.key) || value.key.length > caps.boardColumnKeyCharsMax
      || value.key === 'all' || !label(value.label, caps.boardColumnLabelCharsMax)) {
      return fail(`${board}.${raw.key}: each value needs a lowercase key (not "all") and a label.`);
    }
    if (values.some(item => item.key === value.key)) return fail(`${board}.${raw.key}: value ${value.key} is declared twice.`);
    values.push(Object.freeze({ key: value.key, label: value.label.trim() }));
  }
  return { ok: true, variant: Object.freeze({ key: raw.key, label: raw.label.trim(), values: Object.freeze(values) }) };
}

/**
 * The tags a run carries, or a filter a read asks for: an object of declared variant keys to
 * declared values. A dimension left out is allowed, and means the run appears only under the
 * views that do not filter by it. An undeclared key or value is refused, because a run filed
 * under a mode the board does not have would be counted under "All" and nowhere else, which
 * is a silent loss a game developer would never see.
 */
export function validateRunTags(raw, variants) {
  if (raw === undefined || raw === null) return { ok: true, tags: {} };
  if (!object(raw)) return fail('tags must be an object');
  const tags = {};
  for (const [key, value] of Object.entries(raw)) {
    const variant = variants.find(item => item.key === key);
    if (!variant) return fail(`tags.${key.slice(0, 32)} is not a variant of this board`);
    if (typeof value !== 'string' || !variant.values.some(item => item.key === value)) return fail(`tags.${key} must be one of ${variant.values.map(item => item.key).join(', ')}`);
    tags[key] = value;
  }
  return { ok: true, tags };
}

/**
 * The stats a run carries, checked against the board's columns.
 *
 * A key the board does not declare is dropped and named in `ignored`, as og-api drops an
 * unknown body key: a game built against a newer board than the live one still lands its
 * score. A value that is not a finite number
 * is refused. Each kept value is classified against its column's bounds exactly as the score
 * is, and the run takes the worst of those states with the score's, so an implausible stat
 * keeps the whole run off the board rather than standing on it at its cap.
 */
export function validateRunStats(raw, columns, policy) {
  if (raw === undefined || raw === null) return { ok: true, stats: {}, ignored: [], state: 'ok' };
  if (!object(raw)) return fail('stats must be an object');
  const stats = {}, ignored = [];
  let state = 'ok';
  for (const [key, value] of Object.entries(raw)) {
    const column = columns.find(item => item.key === key);
    if (!column) { if (ignored.length < 8) ignored.push(`stats.${key.slice(0, 24)}`); continue; }
    if (!statOk(value)) return fail(`stats.${key} must be a finite number from -1e15 to 1e15, and 0 or at least 1e-6 from it`);
    const checked = classifyValue(value, column.min, column.max, policy.clampTolerance);
    stats[key] = checked.stored;
    state = worse(state, checked.state);
  }
  if (new TextEncoder().encode(JSON.stringify(stats)).byteLength > policy.statsBytesMax) return fail(`stats is larger than ${policy.statsBytesMax} bytes`);
  return { ok: true, stats, ignored, state };
}

/* The range a stat may take. The database stores stats as jsonb and measures them as its own
   text, which writes a number out in full: {"a":1e300} is 308 bytes there and 11 here, so four
   such stats passed statsBytesMax and failed the column's 1024-byte check as a 502 (review,
   7 Nov 2026). Inside this range a value is at most about forty characters either way, so
   statsBytesMax measured here is a true bound on what the database is asked to store. */
const statOk = value => finite(value) && Math.abs(value) <= 1e15 && (value === 0 || Math.abs(value) >= 1e-6);

/** classifyGameScore's rule for one value, kept beside it so a stat and a score agree. */
export function classifyValue(value, min, max, tolerance) {
  if (!finite(value)) return { state: 'rejected', stored: 0 };
  if (max !== null && value > max) return { state: value > max * tolerance ? 'rejected' : 'clamped', stored: max };
  if (min !== null && value < min) return { state: value * tolerance < min ? 'rejected' : 'clamped', stored: min };
  return { state: 'ok', stored: value };
}

const RANK = { ok: 0, clamped: 1, rejected: 2 };
export function worse(a, b) { return RANK[b] > RANK[a] ? b : a; }

/**
 * Tags as one string, so a database index can hold "one best row per player per
 * combination". Sorted by key, `key=value` joined with `;`, and empty for no tags. The
 * migration's `private.platform_variant_key` computes the same string; a test holds the two
 * together.
 */
export function variantKey(tags) {
  return Object.keys(tags ?? {}).sort().map(key => `${key}=${tags[key]}`).join(';');
}

/** A career row's stats as a reader shows them: without the accumulators the database keeps
    beside the columns (keys starting `_`, such as an average's running sum), which no column
    key can start with. */
export function publicStats(stats) {
  const out = {};
  for (const [key, value] of Object.entries(stats ?? {})) if (!key.startsWith('_')) out[key] = value;
  return out;
}

/** The sort a read asked for, or null when the board has no such sortable column. */
export function resolveSort(sort, shape) {
  if (sort === undefined || sort === null || sort === '' || sort === SCORE_SORT) return { key: SCORE_SORT, order: shape.order };
  const column = shape.columns.find(item => item.key === sort && item.sortable);
  return column ? { key: column.key, order: column.order } : null;
}

/** A filter written as `mode:solo,map:dunes` (a query string), as the tags it means. */
export function parseFilterParam(value) {
  if (value === undefined || value === null || value === '') return {};
  /* A null-prototype object, and every key and value in the shapes a declaration allows: a
     plain object drops "__proto__" on assignment, so `filter=__proto__:solo` read as no filter
     at all and served the whole board as though it had been filtered (review, 7 Nov 2026). */
  const out = Object.create(null);
  for (const part of String(value).split(',')) {
    const at = part.indexOf(':');
    if (at < 1) return null;
    const key = part.slice(0, at), tag = part.slice(at + 1);
    if (!KEY.test(key) || !VALUE.test(tag) || Object.hasOwn(out, key)) return null;
    out[key] = tag;
  }
  return { ...out };
}
export function filterParam(tags) {
  return Object.keys(tags ?? {}).sort().map(key => `${key}:${tags[key]}`).join(',');
}

/**
 * How a value reads on a board. en-GB grouping, like the score always used. A duration is
 * m:ss (or h:mm:ss) with tenths only when it is under a minute and the source had them;
 * a percent is 0 to 100 with at most one decimal; a distance is metres under a kilometre.
 */
export function formatBoardValue(value, format = 'number', decimals) {
  if (!finite(value)) return '';
  const fixed = Number.isSafeInteger(decimals) && decimals >= 0 && decimals <= 4 ? decimals : null;
  const group = (n, digits = 0, least = 0) => n.toLocaleString('en-GB', { maximumFractionDigits: digits, minimumFractionDigits: least });
  // A column's declared decimals, every value drawn with exactly that many; a percent is one
  // fixed decimal unless it says otherwise, so a column of rates lines up.
  const exact = n => group(n, fixed, fixed);
  switch (format) {
    case 'integer': return fixed === null ? group(Math.round(value)) : exact(value);
    case 'duration_ms': return duration(value / 1000, value < 60_000 && value % 1000 !== 0);
    case 'duration_s': return duration(value, value < 60 && !Number.isInteger(value));
    case 'percent': return `${fixed === null ? group(value, 1, 1) : exact(value)}%`;
    case 'distance_m': return value >= 1000 ? `${fixed === null ? group(value / 1000, 2) : exact(value / 1000)} km` : `${fixed === null ? group(value, 1) : exact(value)} m`;
    default: return fixed === null ? group(value, 2) : exact(value);
  }
}

function duration(seconds, tenths) {
  const sign = seconds < 0 ? '-' : '';
  let rest = Math.abs(seconds);
  const hours = Math.floor(rest / 3600); rest -= hours * 3600;
  const minutes = Math.floor(rest / 60); rest -= minutes * 60;
  const secs = tenths ? (Math.floor(rest * 10) / 10).toFixed(1) : String(Math.floor(rest));
  const padded = secs.padStart(tenths ? 4 : 2, '0');
  return hours ? `${sign}${hours}:${String(minutes).padStart(2, '0')}:${padded}` : `${sign}${minutes}:${padded}`;
}
