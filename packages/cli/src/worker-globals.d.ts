// dev.ts imports infra/worker/src/game-audio.ts for the host runtime text, so that local
// pages run the Worker's own receiver rather than a copy. The same module also exports
// withGameAudio, which uses the Workers HTMLRewriter global and which the CLI never calls;
// esbuild drops it from the bundle. This is only enough of that global's shape for tsc to
// read the file, and nothing in the CLI may construct one.
declare class HTMLRewriter {
  on(selector: string, handlers: { element?(element: { before(content: string, options?: { html?: boolean }): void }): void }): HTMLRewriter;
  transform(response: Response): Response;
}
