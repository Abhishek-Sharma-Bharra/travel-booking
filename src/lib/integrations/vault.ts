import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { HttpError } from "../http";
function keys() {
  try {
    const map = JSON.parse(
      process.env.INTEGRATION_ENCRYPTION_KEYS || "{}",
    ) as Record<string, string>;
    const active = process.env.INTEGRATION_ACTIVE_KEY || "";
    if (
      !active ||
      !map[active] ||
      !Object.values(map).every((k) => /^[a-f0-9]{64}$/i.test(k))
    )
      throw Error();
    if (Object.values(map).includes(process.env.BETTER_AUTH_SECRET || ""))
      throw Error();
    return { map, active };
  } catch {
    throw new HttpError(503, "Integration encryption keys are not configured.");
  }
}
export function vaultReady() {
  try {
    keys();
    return true;
  } catch {
    return false;
  }
}
export function seal(secret: unknown, context: string) {
  const { map, active } = keys(),
    iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", Buffer.from(map[active], "hex"), iv);
  cipher.setAAD(Buffer.from(context));
  const data = Buffer.concat([
    cipher.update(JSON.stringify(secret), "utf8"),
    cipher.final(),
  ]);
  return JSON.stringify({
    v: 1,
    key: active,
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    data: data.toString("base64url"),
  });
}
export function unseal<T>(value: string, context: string): T {
  try {
    const { map } = keys(),
      e = JSON.parse(value);
    if (e.v !== 1 || !map[e.key]) throw Error();
    const cipher = createDecipheriv(
      "aes-256-gcm",
      Buffer.from(map[e.key], "hex"),
      Buffer.from(e.iv, "base64url"),
    );
    cipher.setAAD(Buffer.from(context));
    cipher.setAuthTag(Buffer.from(e.tag, "base64url"));
    return JSON.parse(
      Buffer.concat([
        cipher.update(Buffer.from(e.data, "base64url")),
        cipher.final(),
      ]).toString("utf8"),
    );
  } catch {
    throw new HttpError(
      503,
      "Integration credentials could not be decrypted. Contact the service administrator.",
    );
  }
}
export const credentialContext = (
  agencyId: string,
  provider: string,
  id: string,
) => `travelos:credentials:v1:${agencyId}:${provider}:${id}`;
