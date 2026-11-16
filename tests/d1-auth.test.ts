import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import type { D1Database } from "@cloudflare/workers-types";
import { requestResources, closeResources } from "../src/lib/request-resources";
import { db } from "../src/lib/db";
const mf = new Miniflare(
  convertV4MiniflareOptions({
    modules: true,
    script: 'export default {fetch(){return new Response("test")}}',
    compatibilityDate: "2026-11-16",
    d1Databases: { DB: "d1-auth-tests" },
  }),
);
let binding: D1Database;
let auth: ReturnType<typeof import("../src/lib/auth").createTravelAuth>;
const originalFetch = globalThis.fetch;
const messages: { text: string }[] = [];
const password = "Fictional-D1-password-2026!";
const prefix = "d1-auth-" + Date.now();
const email = prefix + "@test.invalid";
async function scoped<T>(fn: () => Promise<T>) {
  const resources = {
    databaseUrl: "",
    databaseEngine: "d1" as const,
    d1: binding,
    values: new Map<symbol, unknown>(),
    cleanup: [] as (() => Promise<void>)[],
  };
  return requestResources.run(resources, async () => {
    try {
      return await fn();
    } finally {
      await closeResources(resources);
    }
  });
}
before(async () => {
  process.env.WRANGLER_LOG_PATH ||= ".local/cloudflare-logs";
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  process.env.BETTER_AUTH_SECRET =
    "fictional-D1-auth-test-secret-only-never-live-2026";
  process.env.REQUIRE_EMAIL_VERIFICATION = "true";
  process.env.RESEND_API_KEY = "fictional-not-sent";
  process.env.MAIL_FROM = "test@test.invalid";
  delete process.env.SMTP_HOST;
  binding = await mf.getD1Database("DB");
  const { unstable_splitSqlQuery } = await import("wrangler");
  for (const file of (await readdir("cloudflare/d1/migrations"))
    .filter((file) => file.endsWith(".sql"))
    .sort())
    await binding.batch(
      unstable_splitSqlQuery(
        await readFile("cloudflare/d1/migrations/" + file, "utf8"),
      ).map((sql) => binding.prepare(sql)),
    );
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://api.resend.com/emails");
    messages.push(JSON.parse(String(init?.body)));
    return Response.json({ id: "mock-not-delivered" });
  };
  const { createTravelAuth } = await import("../src/lib/auth");
  auth = createTravelAuth("sqlite");
});
after(async () => {
  globalThis.fetch = originalFetch;
  await mf.dispose();
});
test("D1 Better Auth signup atomically creates agency, user and credential while rejecting client tenant/role overrides", async () => {
  await assert.rejects(
    scoped(() =>
      auth.api.signUpEmail({
        body: {
          name: "D1 Owner",
          email,
          password,
          ...{ role: "MANAGER", agencyId: "attacker" },
        },
      }),
    ),
    /not allowed/,
  );
  const result = await scoped(() =>
    auth.api.signUpEmail({ body: { name: "D1 Owner", email, password } }),
  );
  assert.equal(result.token, null);
  await scoped(async () => {
    const user = await db.user.findUniqueOrThrow({
      where: { email },
      include: { agency: true, accounts: true },
    });
    assert.equal(user.role, "OWNER");
    assert.notEqual(user.agencyId, "attacker");
    assert.equal(user.agency?.name, "D1 Owner's agency");
    assert.equal(user.accounts.length, 1);
    assert.equal(user.accounts[0].providerId, "credential");
    assert.notEqual(user.accounts[0].password, password);
    assert.ok(user.createdAt instanceof Date);
  });
  assert.equal(messages.length, 1);
});
test("D1 verification and sign-in use the actual library, and sessions work across request scopes", async () => {
  await assert.rejects(
    scoped(() => auth.api.signInEmail({ body: { email, password } })),
    /verified/i,
  );
  const message = messages.find((message) =>
    message.text.includes("verify-email"),
  )!;
  const url = new URL(message.text.match(/http[^\s]+/)![0]);
  const response = await scoped(() =>
    auth.api.verifyEmail({
      query: {
        token: url.searchParams.get("token")!,
        callbackURL: "/workspace",
      },
      asResponse: true,
    }),
  );
  assert.ok([200, 302].includes(response.status));
  const result = await scoped(() =>
    auth.api.signInEmail({ body: { email, password } }),
  );
  assert.ok(result.token);
  const cookies = new Headers({
    cookie: `better-auth.session_token=${result.token}`,
  });
  // A signed cookie is tested separately; the raw token also persists server-side.
  await scoped(async () => {
    assert.ok(await db.session.findUnique({ where: { token: result.token } }));
    assert.equal(
      (await db.user.findUniqueOrThrow({ where: { email } })).emailVerified,
      true,
    );
  });
  assert.equal(
    await scoped(() => auth.api.getSession({ headers: cookies })),
    null,
  );
});
test("D1 password reset consumes one-time tokens, changes credentials and revokes sessions atomically", async () => {
  await scoped(() =>
    auth.api.requestPasswordReset({
      body: { email, redirectTo: "/reset-password" },
    }),
  );
  const message = messages.at(-1)!;
  const token = new URL(message.text.match(/http[^\s]+/)![0]).pathname
    .split("/")
    .at(-1)!;
  const nextPassword = "Fictional-D1-new-password-2026!";
  await scoped(() =>
    auth.api.resetPassword({ body: { token, newPassword: nextPassword } }),
  );
  await scoped(async () => {
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    assert.equal(await db.session.count({ where: { userId: user.id } }), 0);
  });
  await assert.rejects(
    scoped(() =>
      auth.api.resetPassword({ body: { token, newPassword: password } }),
    ),
  );
  await assert.rejects(
    scoped(() => auth.api.signInEmail({ body: { email, password } })),
  );
  assert.ok(
    (
      await scoped(() =>
        auth.api.signInEmail({ body: { email, password: nextPassword } }),
      )
    ).token,
  );
});
test("D1 signup failure after staging credentials rolls back all account and tenant records", async () => {
  const failingEmail = prefix + "-failure@test.invalid";
  await binding.exec(
    `CREATE TRIGGER fail_test_credential BEFORE INSERT ON "Account" BEGIN SELECT RAISE(ABORT,'injected failure'); END;`,
  );
  const beforeCount = await scoped(() => db.agency.count());
  try {
    await assert.rejects(
      scoped(() =>
        auth.api.signUpEmail({
          body: { name: "Failed D1 Owner", email: failingEmail, password },
        }),
      ),
    );
    await scoped(async () => {
      assert.equal(await db.agency.count(), beforeCount);
      assert.equal(await db.user.count({ where: { email: failingEmail } }), 0);
    });
  } finally {
    await binding.exec("DROP TRIGGER fail_test_credential;");
  }
});

test("D1 concurrent password-reset requests cannot spend the same token twice", async () => {
  await scoped(() =>
    auth.api.requestPasswordReset({
      body: { email, redirectTo: "/reset-password" },
    }),
  );
  const message = messages.at(-1)!,
    token = new URL(message.text.match(/http[^\s]+/)![0]).pathname
      .split("/")
      .at(-1)!;
  const result = await Promise.allSettled(
    [1, 2].map(() =>
      scoped(() =>
        auth.api.resetPassword({
          body: { token, newPassword: "Fictional-D1-new-password-2026!" },
        }),
      ),
    ),
  );
  assert.equal(
    result.filter((value) => value.status === "fulfilled").length,
    1,
  );
});

test("D1 signed cookies, MFA enrollment, one-time recovery codes and disabled users retain authentication boundaries", async () => {
  const { totp } = await import("./helpers/totp");
  const cookies = new Map<string, string>();
  const headers = () =>
    new Headers({
      origin: "http://localhost:3000",
      cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join("; "),
    });
  const absorb = (response: Response) => {
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";")[0],
        index = pair.indexOf("=");
      if (index >= 0) {
        const value = pair.slice(index + 1);
        if (value) cookies.set(pair.slice(0, index), value);
        else cookies.delete(pair.slice(0, index));
      }
    }
  };
  const login = await scoped(() =>
    auth.api.signInEmail({
      body: { email, password: "Fictional-D1-new-password-2026!" },
      asResponse: true,
    }),
  );
  absorb(login);
  const before = await scoped(() =>
    auth.api.getSession({ headers: headers() }),
  );
  assert.ok(before);
  const enabled = await scoped(() =>
    auth.api.enableTwoFactor({
      headers: headers(),
      body: { password: "Fictional-D1-new-password-2026!" },
      asResponse: true,
    }),
  );
  assert.equal(enabled.status, 200);
  absorb(enabled);
  const setup = await enabled.json();
  const secret = new URL(setup.totpURI).searchParams.get("secret")!;
  const verified = await scoped(() =>
    auth.api.verifyTOTP({
      headers: headers(),
      body: { code: totp(secret) },
      asResponse: true,
    }),
  );
  assert.equal(verified.status, 200);
  absorb(verified);
  const current = await scoped(() =>
    auth.api.getSession({ headers: headers() }),
  );
  assert.ok(current);
  process.env.PLATFORM_ADMIN_EMAILS = email;
  const { requireOperator } = await import("../src/lib/operator-access");
  const { updateSubscription } =
    await import("../src/lib/operator-subscriptions");
  await scoped(() => requireOperator(current.user.id, current.session.token));
  await scoped(() =>
    updateSubscription(
      current.user.id,
      {
        agencyId: current.user.agencyId!,
        plan: "Growth",
        status: "Active",
        days: 30,
      },
      current.session.token,
    ),
  );
  await scoped(async () => {
    const proof = await db.session.findUniqueOrThrow({
      where: { token: current.session.token },
    });
    assert.ok(proof.mfaVerifiedAt);
  });
  absorb(
    await scoped(() =>
      auth.api.signOut({ headers: headers(), asResponse: true }),
    ),
  );
  cookies.clear();
  const challenged = await scoped(() =>
    auth.api.signInEmail({
      headers: headers(),
      body: { email, password: "Fictional-D1-new-password-2026!" },
      asResponse: true,
    }),
  );
  absorb(challenged);
  assert.equal((await challenged.json()).twoFactorRedirect, true);
  assert.equal(
    await scoped(() => auth.api.getSession({ headers: headers() })),
    null,
  );
  const recovered = await scoped(() =>
    auth.api.verifyBackupCode({
      headers: headers(),
      body: { code: setup.backupCodes[0] },
      asResponse: true,
    }),
  );
  assert.equal(recovered.status, 200);
  absorb(recovered);
  assert.ok(await scoped(() => auth.api.getSession({ headers: headers() })));
  absorb(
    await scoped(() =>
      auth.api.signOut({ headers: headers(), asResponse: true }),
    ),
  );
  cookies.clear();
  absorb(
    await scoped(() =>
      auth.api.signInEmail({
        headers: headers(),
        body: { email, password: "Fictional-D1-new-password-2026!" },
        asResponse: true,
      }),
    ),
  );
  const replay = await scoped(() =>
    auth.api.verifyBackupCode({
      headers: headers(),
      body: { code: setup.backupCodes[0] },
      asResponse: true,
    }),
  );
  assert.notEqual(replay.status, 200);
  await scoped(() =>
    db.user.update({
      where: { id: current.user.id },
      data: { disabled: true },
    }),
  );
  await assert.rejects(
    scoped(() =>
      auth.api.signInEmail({
        body: { email, password: "Fictional-D1-new-password-2026!" },
      }),
    ),
    /disabled|forbidden/i,
  );
});
