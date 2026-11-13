/* The credential detector, switched back on for the file that imports this.
 *
 * Since 12 Nov 2026 a deploy and `opengame check` look for no credentials
 * (limits.json platform.deploy.minimalChecks; minimal-checks.test.ts pins that). The
 * detector is still in the source behind that switch, so these files keep proving what it
 * does if the switch is turned off again. node --test runs each file in a process of its
 * own, so this reaches no other file. */
import { LIMITS } from "@opengame/shared";

(LIMITS.platform.deploy as { minimalChecks?: boolean }).minimalChecks = false;
