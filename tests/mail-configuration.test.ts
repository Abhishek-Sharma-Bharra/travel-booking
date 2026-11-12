import { test } from "node:test";
import assert from "node:assert/strict";
import { MailNotConfiguredError, requireMail } from "../src/lib/mail";
import { POST } from "../src/app/api/auth/[...all]/route";
test("verified signup reports an actionable missing-mail code before attempting account creation", async () => {
  const keys = [
      "REQUIRE_EMAIL_VERIFICATION",
      "SMTP_HOST",
      "SMTP_USER",
      "SMTP_PASS",
      "MAIL_FROM",
      "RESEND_API_KEY",
    ],
    old = { ...process.env };
  try {
    for (const k of keys) delete process.env[k];
    process.env.REQUIRE_EMAIL_VERIFICATION = "true";
    assert.throws(() => requireMail(), MailNotConfiguredError);
    const response = await POST(
      new Request("http://localhost:3000/api/auth/sign-up/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Test",
          email: "configuration@test.invalid",
          password: "fictional-not-submitted-password",
        }),
      }),
    );
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, "EMAIL_DELIVERY_NOT_CONFIGURED");
  } finally {
    for (const k of keys) {
      if (old[k] === undefined) delete process.env[k];
      else process.env[k] = old[k];
    }
  }
});
