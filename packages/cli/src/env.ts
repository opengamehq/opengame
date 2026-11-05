/** `CI=false` is a common way to switch CI behaviour OFF (Create React App documents it),
 * and reading it as set made a person's terminal go plain and stop asking questions. */
export function flagSet(value: string | undefined): boolean {
  return value !== undefined && value !== "" && !/^(?:0|false|no)$/i.test(value);
}
