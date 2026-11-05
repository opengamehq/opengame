/**
 * Which parts of limits.json the CLI's bundles can read, worked out from the source.
 *
 * build.mjs ships only the paths in src/limits-allowlist.json, so a path that is read and not
 * listed arrives as `undefined` in a stranger's terminal, and a path that is listed and
 * never read is a number of ours on npm for no reason. This answers the question both
 * directions need, from the code rather than from memory: it takes every file esbuild puts
 * in the three bundles (the bundler's own input list, so a transitive read in
 * packages/shared, packages/protocol, packages/preflight or infra/worker is counted exactly
 * when it ships), and asks TypeScript which JSON property each property access, element
 * access and destructured name resolves to. Aliases such as `STUDIO = raw.studio` need no
 * special case, because the checker resolves `STUDIO.x` to the same declaration as
 * `raw.studio.x`.
 *
 * Where the code stops naming properties, the answer widens rather than guesses: an object
 * handed to a function, spread, cast, compared, iterated, indexed by a variable or otherwise
 * used whole counts as a read of everything under it, and so does every array. So the list
 * can be longer than what runs, never shorter. Two exceptions, each narrower than "whole":
 * a member taken past a cast (`(limits as X).name`) is read as that member whole, since the
 * checker cannot follow it further; and indexedReads below names, by hand and with a count,
 * the one object indexed by a key that limits itself supplies.
 *
 * LIMITS_READS_TRACE=1 prints every read with its file and line to stderr, which is how to
 * find why a path is on the list.
 *
 * `node --import tsx tests/limits-reads.ts` prints the paths; `--write` rewrites the list
 * in src/limits-allowlist.json, keeping its comment. tests/limits-allowlist.test.ts fails while
 * the two differ.
 */
import ts from "typescript";
import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("..", import.meta.url));
const shared = resolve(cli, "../shared");
const limitFiles = new Set([join(shared, "limits.json"), join(shared, "limits.values.json"), join(shared, "limits.browser.json")]);
export const allowlistFile = join(cli, "src/limits-allowlist.json");

/** The bundles build.mjs writes that can reach limits. Keep in step with buildCli. */
export const bundleEntries = ["src/cli.ts", "src/preflight-worker.ts", "runtime-builder.mjs"];

/**
 * Objects indexed by a value the checker cannot name, or used whole where the code takes only
 * some fields of each entry, narrowed by hand to the keys the data itself lets that use reach.
 * Each entry names the file, the object, how many whole uses of it the file has (so a new use
 * there is not narrowed silently: the count stops matching and this throws), and the keys,
 * read from limits so they follow the data. A key may be a dotted path under the object.
 */
interface IndexedRead { file: string; owner: string; uses: number; keys: (values: Record<string, any>) => string[]; why: string }

/* The fields of a lane's limits that largeAssetLimits and laneHeldBytes return. The rest of
   each object is the scan's own sizing (avWorkers, zipContainers, scanCompute, the image
   review's workers) and per-account scan quotas, which no exported code reads and which
   said how much scanning the platform will do for whom (5 Nov 2026). */
const LANE_FIELDS = ["storedBytesMax", "fileBytesMax", "decodedBytesMax", "fileCountMax", "combinedFileCountMax", "heldBytesPerAccountMax"];
/* What a text cap holds that a caller is held to. `constraint`, `alsoOn` and `columnMax` name
   database constraints and columns for the schema test, which no bundle reads. */
const TEXT_FIELDS = ["min", "max", "productMin"];
const textKeys = (values: Record<string, any>) => Object.entries(values.text as Record<string, Record<string, unknown>>)
  .filter(([key]) => !key.startsWith("_")).flatMap(([key, limit]) => TEXT_FIELDS.filter(field => Object.hasOwn(limit, field)).map(field => `${key}.${field}`));

const indexedReads: IndexedRead[] = [{
  file: "../shared/src/large-assets.ts", owner: "platform", uses: 2,
  keys: values => Object.entries(values.platform.largeAssetPlans as Record<string, { limits?: string }>)
    .filter(([kind, plan]) => !kind.startsWith("_") && typeof plan?.limits === "string")
    .flatMap(([, plan]) => LANE_FIELDS.filter(field => Object.hasOwn(values.platform[plan.limits!] ?? {}, field)).map(field => `${plan.limits}.${field}`)),
  why: "largeAssetLimits and laneHeldBytes read LANE_FIELDS of platform[plan.limits], and plan comes from platform.largeAssetPlans",
}, {
  file: "../shared/src/limits-browser.ts", owner: "text", uses: 1, keys: textKeys,
  why: "TEXT is built from Object.entries(raw.text), and every reader of it takes TEXT_FIELDS (TextLimit, BrowserTextLimit)",
}, {
  file: "../shared/src/limits.ts", owner: "text", uses: 1, keys: textKeys,
  why: "the server's TEXT, built the same way; nothing the CLI bundles reads a constraint name from it",
}];

/** Every file esbuild puts in any of the bundles, dependencies and JSON included. */
export async function bundleInputs(): Promise<string[]> {
  const files = new Set<string>();
  for (const entry of bundleEntries) {
    const result = await build({
      entryPoints: [join(cli, entry)], bundle: true, write: false, metafile: true, logLevel: "silent",
      platform: "node", format: "esm", target: "node18",
      define: { __CLI_RELEASE_VERSION__: JSON.stringify("0.0.0") }, absWorkingDir: cli,
    });
    for (const input of Object.keys(result.metafile.inputs)) files.add(resolve(cli, input));
  }
  return [...files].sort();
}

/** The source files of ours among them, which are what can read limits. */
export async function bundledSources(): Promise<string[]> {
  return (await bundleInputs()).filter(file => !file.includes("node_modules") && !file.endsWith(".json"));
}

/** The dotted path of a property declared in a limits file, or null for anything else. */
function jsonPath(declaration: ts.Declaration): string[] | null {
  const file = declaration.getSourceFile();
  if (!limitFiles.has(resolve(file.fileName))) return null;
  const path: string[] = [];
  let node: ts.Node | undefined = declaration;
  while (node && !ts.isSourceFile(node)) {
    if (ts.isPropertyAssignment(node)) path.unshift(ts.isStringLiteral(node.name) ? node.name.text : node.name.getText(file));
    else if (ts.isArrayLiteralExpression(node.parent)) return null; // inside an array: the array is read whole
    node = node.parent;
  }
  return path;
}

/**
 * The JSON properties behind a symbol (a union's can stand for several) whose values are
 * read by naming them: numbers, strings, booleans and arrays. A member holding an object is
 * left to the uses of that object, so `LIMITS.studio.foo` is a read of `studio.foo` and not
 * of everything under `studio`.
 */
function symbolPaths(symbol: ts.Symbol | undefined): string[][] {
  return (symbol?.declarations ?? []).filter(declaration => !holdsObject(declaration))
    .map(jsonPath).filter((path): path is string[] => path !== null);
}

function holdsObject(declaration: ts.Declaration): boolean {
  return ts.isPropertyAssignment(declaration) && ts.isObjectLiteralExpression(declaration.initializer);
}

/** The JSON object an expression's value is, when it is one of ours: its declaring literal. */
function objectPaths(checker: ts.TypeChecker, node: ts.Node): string[][] {
  const type = checker.getTypeAtLocation(node);
  const types = type.isUnion() ? type.types : [type];
  const out: string[][] = [];
  for (const each of types) {
    for (const declaration of each.getSymbol()?.declarations ?? []) {
      if (!limitFiles.has(resolve(declaration.getSourceFile().fileName))) continue;
      if (!ts.isObjectLiteralExpression(declaration)) continue;
      // The root object, a named member, or (inside an array, read whole already) nothing.
      if (ts.isExpressionStatement(declaration.parent) || ts.isSourceFile(declaration.parent)) out.push([]);
      else if (ts.isPropertyAssignment(declaration.parent)) {
        const path = jsonPath(declaration.parent);
        if (path) out.push(path);
      }
    }
  }
  return out;
}

/** An identifier that names something rather than reading a value. */
function namesSomething(node: ts.Node): boolean {
  const parent = node.parent;
  if (!ts.isIdentifier(node) || !parent) return false;
  if (ts.isPropertyAccessExpression(parent)) return parent.name === node;
  if (ts.isShorthandPropertyAssignment(parent)) return false;
  return "name" in parent && (parent as { name?: ts.Node }).name === node
    || ("propertyName" in parent && (parent as { propertyName?: ts.Node }).propertyName === node);
}

function inTypePosition(node: ts.Node): boolean {
  for (let at: ts.Node | undefined = node; at; at = at.parent) {
    if (ts.isTypeNode(at) && !ts.isExpressionWithTypeArguments(at)) return true;
    if (ts.isStatement(at) || ts.isSourceFile(at)) return false;
  }
  return false;
}

/**
 * How an expression whose value is one of our objects is used. "named" when it only reaches
 * a member TypeScript can follow, or is bound to a name whose own uses are followed. A key
 * when it is cast and then a member is taken: past `as` the checker no longer knows the
 * member is ours, so that member is read whole. "whole" for everything else.
 */
function useOf(checker: ts.TypeChecker, node: ts.Expression): "named" | "whole" | { member: string } | { members: string[] } {
  let top: ts.Expression = node;
  let cast = false;
  for (;;) {
    const parent: ts.Node = top.parent;
    if (ts.isParenthesizedExpression(parent) || ts.isNonNullExpression(parent) || ts.isSatisfiesExpression(parent)) top = parent;
    else if (ts.isAsExpression(parent) || ts.isTypeAssertionExpression(parent)) { top = parent; cast = true; }
    else break;
  }
  const parent = top.parent;
  const member = ts.isPropertyAccessExpression(parent) && parent.expression === top ? parent.name.text
    : ts.isElementAccessExpression(parent) && parent.expression === top && ts.isStringLiteralLike(parent.argumentExpression) ? parent.argumentExpression.text
    : undefined;
  if (member !== undefined) return cast ? { member } : "named";
  if (cast && ts.isVariableDeclaration(parent) && parent.initializer === top && ts.isIdentifier(parent.name)) {
    const members = castAliasMembers(checker, parent.name);
    return members ? { members } : "whole";
  }
  if (cast) return "whole";
  if (ts.isVariableDeclaration(parent) && parent.initializer === top && !parent.type) {
    if (ts.isIdentifier(parent.name)) return "named";
    if (ts.isObjectBindingPattern(parent.name) && parent.name.elements.every(element => !element.dotDotDotToken)) return "named";
  }
  if (ts.isExportAssignment(parent) || ts.isExportSpecifier(parent) || ts.isImportClause(parent) || ts.isImportSpecifier(parent)) return "named";
  return "whole";
}

/**
 * `const raw_ = raw as unknown as {...}` followed by `raw_.name`: the members the cast name
 * is used to reach, or null when it is used any other way, which reads it whole.
 */
function castAliasMembers(checker: ts.TypeChecker, name: ts.Identifier): string[] | null {
  const symbol = checker.getSymbolAtLocation(name);
  const members: string[] = [];
  let whole = false;
  const look = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && node !== name && checker.getSymbolAtLocation(node) === symbol) {
      const parent = node.parent;
      if (ts.isPropertyAccessExpression(parent) && parent.expression === node) members.push(parent.name.text);
      else if (ts.isElementAccessExpression(parent) && parent.expression === node && ts.isStringLiteralLike(parent.argumentExpression)) members.push(parent.argumentExpression.text);
      else whole = true;
    }
    ts.forEachChild(node, look);
  };
  look(name.getSourceFile());
  return whole ? null : members;
}

/**
 * Every cast of an object from limits.browser.json in `files`, as the object's dotted path and
 * where. A cast hides the projection from the checker: `limits.studio.delegation as unknown as
 * { enabled: boolean; ... }` typechecks whether or not the allowlist kept `enabled`, and every
 * server reading the module then gets undefined (found in review, 5 Nov 2026, with Studio
 * delegation off as the result). The web app's browser limits test requires the allowlist
 * to keep each of these objects whole, so nothing a cast promises can be missing.
 */
export function browserCastsIn(files: string[], base: string): { path: string; at: string }[] {
  const program = ts.createProgram(files, {
    allowJs: true, checkJs: false, resolveJsonModule: true, esModuleInterop: true, noEmit: true, skipLibCheck: true,
    module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX, types: ["node"],
  });
  const checker = program.getTypeChecker();
  const browser = join(shared, "limits.browser.json");
  const out: { path: string; at: string }[] = [];
  for (const fileName of files) {
    const file = program.getSourceFile(fileName);
    if (!file) throw new Error(`TypeScript could not load ${fileName}; its casts would go unchecked.`);
    const visit = (node: ts.Node): void => {
      if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) {
        let inner: ts.Expression = node.expression;
        while (ts.isParenthesizedExpression(inner) || ts.isNonNullExpression(inner)) inner = inner.expression;
        const type = checker.getTypeAtLocation(inner);
        for (const each of type.isUnion() ? type.types : [type]) {
          for (const declaration of each.getSymbol()?.declarations ?? []) {
            if (resolve(declaration.getSourceFile().fileName) !== browser || !ts.isObjectLiteralExpression(declaration)) continue;
            const owner = ts.isPropertyAssignment(declaration.parent) ? jsonPath(declaration.parent)?.join(".") : "";
            if (owner === undefined) continue;
            const at = `${relative(base, fileName)}:${file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1}`;
            // The root cast to reach one member (`(limits as unknown as {...}).gamePolicy`, or an
            // alias read only by name) is a cast of those members; any other use is of the root.
            let top: ts.Node = node;
            while (ts.isParenthesizedExpression(top.parent) || ts.isAsExpression(top.parent) || ts.isTypeAssertionExpression(top.parent)) top = top.parent;
            const members = owner !== "" ? null
              : ts.isPropertyAccessExpression(top.parent) && top.parent.expression === top ? [top.parent.name.text]
              : ts.isVariableDeclaration(top.parent) && ts.isIdentifier(top.parent.name) ? castAliasMembers(checker, top.parent.name)
              : null;
            for (const path of members ?? [owner]) out.push({ path, at });
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  return out;
}

export interface LimitReads { paths: string[]; files: string[]; where: Map<string, string> }

/** The smallest set of dotted paths whose subtrees cover every read in the bundled sources. */
export async function limitReads(): Promise<LimitReads> {
  return readsIn(await bundledSources(), cli);
}

/**
 * The same question for any list of source files, which is how the public mirror works out
 * the limits its whole exported tree reads (scripts/public-mirror-limits.mjs). Only the
 * files named are walked; what they import is resolved for types and not visited, so a
 * read in a file that is not on the list does not count. `base` is what `where` and the
 * trace print paths relative to.
 */
export async function readsIn(files: string[], base: string): Promise<LimitReads> {
  const program = ts.createProgram(files, {
    allowJs: true, checkJs: false, resolveJsonModule: true, esModuleInterop: true, noEmit: true, skipLibCheck: true,
    module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX, types: ["node"],
  });
  const checker = program.getTypeChecker();
  const values = JSON.parse(await readFile(join(shared, "limits.values.json"), "utf8"));
  const indexedUses = new Map<IndexedRead, number>();
  const read = new Set<string>();
  const where = new Map<string, string>();
  let at = "";
  const add = (path: string[]) => {
    if (path.some(segment => segment.includes("."))) throw new Error(`${at} reads ${JSON.stringify(path)}, whose key holds a dot, which a dotted allowlist path cannot name.`);
    const key = path.join(".");
    read.add(key);
    if (!where.has(key)) where.set(key, at);
    if (process.env.LIMITS_READS_TRACE) console.error(`${key}\t${at}`);
  };

  for (const fileName of files) {
    const file = program.getSourceFile(fileName);
    if (!file) throw new Error(`TypeScript could not load ${fileName}, which esbuild bundles; the read list would be incomplete.`);
    const visit = (node: ts.Node): void => {
      if (inTypePosition(node)) return;
      at = `${relative(base, fileName)}:${file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1}`;
      if (ts.isPropertyAccessExpression(node) || (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression))) {
        for (const path of symbolPaths(checker.getSymbolAtLocation(ts.isPropertyAccessExpression(node) ? node.name : node.argumentExpression))) add(path);
      } else if (ts.isBindingElement(node) && ts.isObjectBindingPattern(node.parent) && !node.dotDotDotToken) {
        const name = node.propertyName ?? node.name;
        const key = ts.isIdentifier(name) || ts.isStringLiteralLike(name) ? name.text : undefined;
        // Bound to an object, the name's own uses are followed; bound to a value, it is read.
        const property = key === undefined ? undefined : checker.getTypeAtLocation(node.parent).getProperty(key);
        if (key && !property?.declarations?.some(holdsObject)) {
          for (const owner of objectPaths(checker, node.parent)) add([...owner, key]);
        }
      }
      // Whole-value uses: an object of ours reaching anything other than a named member.
      if (ts.isExpression(node) && !namesSomething(node) && (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node) || ts.isCallExpression(node))) {
        const owners = objectPaths(checker, node);
        if (owners.length) {
          const use = useOf(checker, node);
          for (const owner of owners) {
            const indexed = use === "whole" && indexedReads.find(entry => resolve(cli, entry.file) === resolve(fileName) && entry.owner === owner.join("."));
            if (indexed) {
              indexedUses.set(indexed, (indexedUses.get(indexed) ?? 0) + 1);
              for (const key of indexed.keys(values)) add([...owner, ...key.split(".")]);
            } else if (use === "whole") add(owner);
            else if (use === "named") continue;
            else if ("member" in use) add([...owner, use.member]);
            else for (const member of use.members) add([...owner, member]);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }

  for (const entry of indexedReads) {
    // An entry for a file that is not on the list has nothing to count.
    if (!files.some(fileName => resolve(fileName) === resolve(cli, entry.file))) continue;
    if (indexedUses.get(entry) !== entry.uses) throw new Error(`${entry.file} uses ${entry.owner} whole ${indexedUses.get(entry) ?? 0} times, not the ${entry.uses} narrowed by hand (${entry.why}). Check the new use and update indexedReads.`);
  }
  // `""` is the root itself, read whole (LIMITS handed somewhere entire), which would ship
  // everything; refuse rather than write an allowlist of one empty path.
  if (read.has("")) throw new Error(`${where.get("")} uses the whole limits object, which would ship every value. Read the parts it needs by name.`);
  // A member reached past a cast can name a key limits.json does not have (an optional
  // field nobody has set); it reads undefined with or without the list, so it is left out.
  // When limits.json gains it, this list gains it and the test asks for a regeneration.
  const exists = (path: string) => path.split(".").reduce<any>((node, key) =>
    node && typeof node === "object" && !Array.isArray(node) && Object.hasOwn(node, key) ? node[key] : undefined, values) !== undefined;
  const sorted = [...read].filter(exists).sort();
  const paths = sorted.filter(path => !sorted.some(other => other !== path && path.startsWith(other + ".")));
  return { paths, files, where };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { paths } = await limitReads();
  if (process.argv.includes("--write")) {
    const current = JSON.parse(await readFile(allowlistFile, "utf8").catch(() => "{}"));
    await writeFile(allowlistFile, JSON.stringify({ _comment: current._comment ?? "", paths }, null, 2) + "\n");
    console.log(`Wrote ${paths.length} paths to ${allowlistFile}.`);
  } else {
    const { where } = await limitReads();
    console.log(paths.map(path => `${path}\t${where.get(path)}`).join("\n"));
  }
}
