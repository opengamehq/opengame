type Release = { scopeOwned?: unknown; published?: unknown; packages?: { cli?: string; sdk?: string; skills?: string } } | null | undefined;
type InstallName = "cli" | "sdk" | "skills";
/** An install step: a package, or `cli-agent` and `sdk-agent`, the same steps addressed to a coding agent. */
type InstallStep = InstallName | "cli-agent" | "sdk-agent";
export declare const installsOpen: (release: Release) => boolean;
export declare const RELEASE_REF: string;
export declare const releaseWorkflowApproved: (env: Record<string, string | undefined> | undefined) => boolean;
export declare function npmReleaseForBuild<R extends Release>(release: R, env: Record<string, string | undefined> | undefined): R;
export declare const INSTALL_CLOSED: Readonly<Record<InstallStep, string>>;
export declare function installCommand(name: InstallName, release: Release, options?: { starter?: boolean }): string | null;
export declare function installMarkdown(name: InstallStep, release: Release): string;
export declare function writeInstallBlocks(text: string, release: Release): string;
export declare const installBlocks: (text: string) => string[];
export declare function closedWordingProblems(text: string, release: Release): string[];
