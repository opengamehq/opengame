import { bootstrapSchema } from "@opengame/protocol";
import { CliError } from "./output";
import { Api, ApiError } from "./http";

/** Keep older deployments usable during the bootstrap endpoint's compatibility period.
 * Only an absent route permits fallback; authentication and outages keep their meaning. */
export async function readBootstrap(api: Api, token: string | undefined, legacy: "limits" | "cli", anyVersion = false) {
  // Anonymous upgrade metadata remains available on the existing public endpoint.
  if (!token) return api.json("/api/v1/cli", { anyVersion });
  try {
    const parsed = bootstrapSchema.safeParse(await api.json("/api/v1/bootstrap", { token, anyVersion }));
    if (!parsed.success) throw new CliError("invalid_response", "The server returned incomplete startup information. Contact the OpenGame team, then retry.", 5);
    return parsed.data;
  }
  catch (error) {
    if (!(error instanceof ApiError) || error.status !== 404) throw error;
    return api.json(`/api/v1/${legacy}`, { token, anyVersion });
  }
}
