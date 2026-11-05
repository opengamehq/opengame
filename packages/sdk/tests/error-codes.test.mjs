import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import ts from 'typescript';

/**
 * Every error code the source can hand a game is in src/errors.ts.
 *
 * On 3 Nov 2026 the room codes left the catalogue with multiplayer, and two of them,
 * `unavailable_in_preview` and `network`, went too while achievements.ts went on
 * returning both. The README stopped naming them and the plugins that take a hint from
 * the table had none to give. Nothing failed, because nothing compared the codes the
 * source returns with the codes the table names (5 Nov 2026).
 *
 * This reads the source with the TypeScript parser rather than a regular expression,
 * because codes are chosen in ternaries (`signal.aborted ? 'network' : 'invalid_response'`)
 * and a ternary's condition holds string literals that are not codes (`typeof x ===
 * 'string'`). A code reaches a game as the value of an `error` or `code` property, as the
 * first argument of the leaderboards' `fail`, or as what `cancelLink` is called with. A
 * code the page sends and the SDK passes through (`reply.error`) is the page's to name.
 */
const src = new URL('../src/', import.meta.url);
const files = readdirSync(src, { recursive: true }).map(String).filter(name => name.endsWith('.ts'));

/** The string literals an expression can evaluate to, not the ones it compares against. */
function values(node) {
  if (ts.isStringLiteralLike(node)) return [node.text];
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) return values(node.expression);
  if (ts.isConditionalExpression(node)) return [...values(node.whenTrue), ...values(node.whenFalse)];
  if (ts.isBinaryExpression(node) && [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(node.operatorToken.kind))
    return [...values(node.left), ...values(node.right)];
  return [];
}
const named = (node, names) => {
  const callee = ts.isCallExpression(node) ? node.expression : null;
  const name = callee && (ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : null);
  return name !== null && names.includes(name);
};

/** Every code returned or thrown in one source file, with the line it is on. */
function returnedCodes(text, file = 'source.ts') {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const found = [];
  const add = (node, codes) => {
    const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
    for (const code of codes) found.push({ code, where: `${file}:${line}` });
  };
  const visit = node => {
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && ['error', 'code'].includes(node.name.text)) add(node, values(node.initializer));
    if (named(node, ['fail', 'failed', 'cancelLink']) && node.arguments.length) add(node, values(node.arguments[0]));
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

const catalogue = new Set([...readFileSync(new URL('errors.ts', src), 'utf8').matchAll(/code: '([a-z_]+)'/g)].map(match => match[1]));
const returned = files.flatMap(file => returnedCodes(readFileSync(new URL(file, src), 'utf8'), file));

test('every code the SDK source returns or throws is in the error catalogue', () => {
  const missing = returned.filter(({ code }) => !catalogue.has(code));
  assert.deepEqual(missing, [], `add these to src/errors.ts:\n${missing.map(({ code, where }) => `  ${code} (${where})`).join('\n')}`);
});

test('the reading finds codes in each of the shapes they are written in, so a blind parse cannot pass', () => {
  const codes = new Set(returned.map(({ code }) => code));
  // A plain property, both arms of a ternary, the leaderboards' fail(), a cancelLink call,
  // the else arm of openLink's pass-through, and the inert room error's `code`.
  for (const code of ['invalid_event', 'unavailable_in_preview', 'network', 'invalid_achievement', 'achievement_unavailable',
    'board_unavailable', 'session_changed', 'cancelled', 'unavailable']) assert.ok(codes.has(code), `${code} was not read`);
  assert.equal(codes.has('string'), false, "a typeof comparison is not a code");
  const planted = returnedCodes(`
    const a = { ok: false, error: ready ? 'made_up_one' : 'made_up_two' };
    const b = fail('made_up_three', 'a reason, not a code');
    this.cancelLink?.('made_up_four');
    throw Object.assign(new Error(), { code: 'made_up_five' });
    const c = { error: typeof x === 'string' ? x : 'made_up_six' };`);
  assert.deepEqual(planted.map(({ code }) => code), ['made_up_one', 'made_up_two', 'made_up_three', 'made_up_four', 'made_up_five', 'made_up_six']);
});
