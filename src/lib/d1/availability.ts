import { d1Binding } from "../db";
import { HttpError } from "../http";

// Fail before OAuth, provider requests or writes. Keeping Node/PostgreSQL paths
// available does not imply their lock-based transactions are supported by D1.
export function requirePostgresIntegration(feature: string) {
  if (d1Binding())
    throw new HttpError(
      503,
      `${feature} is not enabled on this D1 staging environment.`,
    );
}
