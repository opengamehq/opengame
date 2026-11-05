import { cliVersionOlder } from "@opengame/protocol";
import { version } from "../package.json";

/** One source for the version: package.json. esbuild inlines it into the bundle,
 * and the header, help, --version and the minimum-version check all read this.
 * It used to be typed out in four places, which is how they drift. */
declare const __CLI_RELEASE_VERSION__: string | undefined;
export const CLI_VERSION: string = typeof __CLI_RELEASE_VERSION__ === "string" ? __CLI_RELEASE_VERSION__ : version;

/** True when `current` is older than `minimum`. The server compares the version this CLI
 * sends with the same function, so the two can never disagree about which is older. */
export const olderThan = cliVersionOlder;
