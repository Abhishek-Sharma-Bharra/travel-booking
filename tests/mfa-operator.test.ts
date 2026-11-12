import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { totp } from "./helpers/totp";
import { db } from "../src/lib/db";
import { requireOperator } from "../src/lib/operator-access";
import { updateSubscription } from "../src/lib/operator-subscriptions";
const prefix = "mfa-" + randomUUID(),
  email = prefix + "@test.invalid";
let auth: typeof import("../src/lib/auth").auth;
const cookies = new Map<string, string>();
const previousAllowlist = process.env.PLATFORM_ADMIN_EMAILS;
function headers() {
  return new Headers({
    origin: "http://localhost:3000",
    cookie: [...cookies].map(([k, v]) => k + "=" + v).join("; "),
  });
}
function absorb(response: Response) {
  for (const line of response.headers.getSetCookie()) {
    const pair = line.split(";")[0],
      i = pair.indexOf("=");
    if (i >= 0) {
      const name = pair.slice(0, i),
        value = pair.slice(i + 1);
      if (value) cookies.set(name, value);
      else cookies.delete(name);
    }
  }
}

before(async () => {
  ({ auth } = await import("../src/lib/auth"));
  process.env.PLATFORM_ADMIN_EMAILS = email;
});
after(async () => {
  if (previousAllowlist === undefined) delete process.env.PLATFORM_ADMIN_EMAILS;
  else process.env.PLATFORM_ADMIN_EMAILS = previousAllowlist;
  for (const a of await db.agency.findMany({
    where: { name: { startsWith: prefix } },
  })) {
    await db.activity.deleteMany({ where: { agencyId: a.id } });
    await db.user.deleteMany({ where: { agencyId: a.id } });
    await db.agency.delete({ where: { id: a.id } });
  }
  await db.$disconnect();
});
test("authenticator enrollment, login challenge, recovery codes and privileged session proof", async () => {
  const password = "Fictional-MFA-test-password-2026";
  const account = await auth.api.signUpEmail({
    body: { name: prefix, email, password },
    asResponse: true,
  });
  assert.equal(account.status, 200);
  absorb(account);
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  await db.user.update({
    where: { id: user.id },
    data: { emailVerified: true },
  });
  await assert.rejects(requireOperator(user.id, "not-a-session"));
  const oldSession = await auth.api.getSession({ headers: headers() });
  assert.ok(oldSession);
  const enabled = await auth.api.enableTwoFactor({
    headers: headers(),
    body: { password },
    asResponse: true,
  });
  assert.equal(enabled.status, 200);
  absorb(enabled);
  const setup = await enabled.json();
  assert.ok(setup.totpURI);
  assert.ok(setup.backupCodes.length > 0);
  const secret = new URL(setup.totpURI).searchParams.get("secret")!;
  const verified = await auth.api.verifyTOTP({
    headers: headers(),
    body: { code: totp(secret) },
    asResponse: true,
  });
  assert.equal(verified.status, 200);
  absorb(verified);
  const current = await auth.api.getSession({ headers: headers() });
  assert.ok(current);
  const proof = await db.session.findUniqueOrThrow({
    where: { token: current.session.token },
  });
  assert.ok(proof.mfaVerifiedAt);
  await requireOperator(user.id, current.session.token);
  await assert.rejects(requireOperator(user.id, oldSession!.session.token));
  await updateSubscription(
    user.id,
    { agencyId: user.agencyId!, plan: "Growth", status: "Active", days: 30 },
    current.session.token,
  );
  const agency = await db.agency.findUniqueOrThrow({
    where: { id: user.agencyId! },
  });
  assert.equal(agency.plan, "Growth");
  assert.equal(agency.subscription, "Active");
  assert.ok(agency.subscriptionExpiresAt);
  const out = await auth.api.signOut({ headers: headers(), asResponse: true });
  absorb(out);
  cookies.clear();
  const login = await auth.api.signInEmail({
    headers: headers(),
    body: { email, password },
    asResponse: true,
  });
  assert.equal(login.status, 200);
  absorb(login);
  assert.equal((await login.json()).twoFactorRedirect, true);
  assert.equal(await auth.api.getSession({ headers: headers() }), null);
  const otp = await auth.api.verifyTOTP({
    headers: headers(),
    body: { code: totp(secret) },
    asResponse: true,
  });
  assert.equal(otp.status, 200);
  absorb(otp);
  const signed = await auth.api.getSession({ headers: headers() });
  assert.ok(signed);
  await requireOperator(user.id, signed.session.token);
  absorb(await auth.api.signOut({ headers: headers(), asResponse: true }));
  cookies.clear();
  absorb(
    await auth.api.signInEmail({
      headers: headers(),
      body: { email, password },
      asResponse: true,
    }),
  );
  const backup = await auth.api.verifyBackupCode({
    headers: headers(),
    body: { code: setup.backupCodes[0] },
    asResponse: true,
  });
  assert.equal(backup.status, 200);
  absorb(backup);
  assert.ok(await auth.api.getSession({ headers: headers() }));
  absorb(await auth.api.signOut({ headers: headers(), asResponse: true }));
  cookies.clear();
  absorb(
    await auth.api.signInEmail({
      headers: headers(),
      body: { email, password },
      asResponse: true,
    }),
  );
  const replay = await auth.api.verifyBackupCode({
    headers: headers(),
    body: { code: setup.backupCodes[0] },
    asResponse: true,
  });
  assert.notEqual(replay.status, 200);
  assert.equal(await auth.api.getSession({ headers: headers() }), null);
});
