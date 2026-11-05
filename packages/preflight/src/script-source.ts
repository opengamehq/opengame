import { parse } from 'acorn';

export type ScriptNode = { type: string; [key: string]: unknown };

/** Both module and classic script grammar occur in uploaded browser builds. */
export function parseScript(source: string): ScriptNode | null {
  try { return parse(source, { ecmaVersion: 'latest', sourceType: 'module', allowReturnOutsideFunction: true }) as unknown as ScriptNode; }
  catch {
    try { return parse(source, { ecmaVersion: 'latest', sourceType: 'script', allowReturnOutsideFunction: true }) as unknown as ScriptNode; }
    catch { return null; }
  }
}
