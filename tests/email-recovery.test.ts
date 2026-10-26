import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
const prefix = "email-" + randomUUID(),
  email = prefix + "@test.invalid";
let auth: typeof import("../src/lib/auth").auth;
const messages: { text: string; to: string[] }[] = [];
const originalFetch = global.fetch;
let oldEnv: Record<string, string | undefined>;
before(async () => {
  oldEnv = {
    REQUIRE_EMAIL_VERIFICATION: process.env.REQUIRE_EMAIL_VERIFICATION,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    MAIL_FROM: process.env.MAIL_FROM,
    SMTP_HOST: process.env.SMTP_HOST,
  };
  process.env.REQUIRE_EMAIL_VERIFICATION = "true";
  process.env.RESEND_API_KEY = "fictional-test-not-sent";
  process.env.MAIL_FROM = "TravelOS <mail@test.invalid>";
  delete process.env.SMTP_HOST;
  global.fetch = (async (input, init) => {
    assert.equal(String(input), "https://api.resend.com/emails");
    messages.push(JSON.parse(String(init?.body)));
    return Response.json({ id: "mock-delivery" });
  }) as typeof fetch;
  ({ auth } = await import("../src/lib/auth"));
});
after(async () => {
  global.fetch = originalFetch;
  for (const [k, v] of Object.entries(oldEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  const users = await db.user.findMany({ where: { email } });
  for (const u of users) {
    const agencyId = u.agencyId;
    await db.user.delete({ where: { id: u.id } });
    if (agencyId) await db.agency.delete({ where: { id: agencyId } });
  }
  await db.verification.deleteMany({
    where: { identifier: { contains: prefix } },
  });
  await db.$disconnect();
});
test("verified signup and one-time password recovery use actual library flows with mocked delivery", async () => {
  const first = "Fictional-original-password-2026",
    second = "Fictional-replacement-password-2026";
  const account = await auth.api.signUpEmail({
    body: { name: prefix, email, password: first, callbackURL: "/workspace" },
  });
  assert.equal(account.token, null);
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { email } })).emailVerified,
    false,
  );
  assert.ok(messages.length > 0);
  await assert.rejects(
    auth.api.signInEmail({ body: { email, password: first } }),
    /verified/i,
  );
  const verification = messages.find((m) => m.text.includes("verify-email"))!;
  assert.ok(verification);
  const url = new URL(verification.text.match(/http[^\s]+/)![0]),
    token = url.searchParams.get("token")!;
  const response = await auth.api.verifyEmail({
    query: { token, callbackURL: "/workspace" },
    asResponse: true,
  });
  assert.ok(response.status === 200 || response.status === 302);
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { email } })).emailVerified,
    true,
  );
  const login = await auth.api.signInEmail({
    body: { email, password: first },
  });
  assert.ok(login.token);
  assert.ok(await db.session.count({ where: { userId: account.user.id } }));
  await auth.api.requestPasswordReset({
    body: { email, redirectTo: "/reset-password" },
  });
  const resetMessage = messages.at(-1)!;
  assert.ok(resetMessage.text.includes("password reset"));
  const resetUrl = new URL(resetMessage.text.match(/http[^\s]+/)![0]),
    resetToken = resetUrl.pathname.split("/").at(-1)!;
  await auth.api.resetPassword({
    body: { token: resetToken, newPassword: second },
  });
  assert.equal(
    await db.session.count({ where: { userId: account.user.id } }),
    0,
  );
  await assert.rejects(
    auth.api.resetPassword({ body: { token: resetToken, newPassword: first } }),
  );
  await assert.rejects(
    auth.api.signInEmail({ body: { email, password: first } }),
  );
  assert.ok(
    (await auth.api.signInEmail({ body: { email, password: second } })).token,
  );
  const before = messages.length;
  await auth.api.requestPasswordReset({
    body: {
      email: "nonexistent-" + prefix + "@test.invalid",
      redirectTo: "/reset-password",
    },
  });
  assert.equal(messages.length, before);
});
