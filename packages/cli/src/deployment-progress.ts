import { deploymentSteps, type DeploymentProgressInput, type DeployStepState } from "@opengame/protocol";

const MARKS: Record<DeployStepState, string> = { waiting: "[ ]", running: "[>]", done: "[x]", held: "[! ]", failed: "[!]" };

/** Plain marks survive redirected terminals. Rich output adds its usual spinner, while
 * JSON continues to carry the existing operation events without presentation changes. */
export function terminalDeploymentChecklist(input: DeploymentProgressInput): string {
  return deploymentSteps(input).map(step => `${step.label} ${MARKS[step.state]}`).join("  ");
}
