import { test } from "node:test";
import assert from "node:assert/strict";
import gateway from "../cloudflare/pages/gateway";
import {
  requestResources,
  closeResources,
  type RequestResources,
} from "../src/lib/request-resources";
const origin = "https://vashisht-travelos-staging.pages.dev";
test("Pages gateway preserves payment bytes, cookies, origin and private streaming responses", async () => {
  const request = new Request(`${origin}/api/payment?retry=1`, {
    method: "POST",
    body: '{ "raw": true }',
    headers: { Origin: origin, Cookie: "session=abc", "x-signature": "signed" },
  });
  const env = {
    PUBLIC_ORIGIN: origin,
    ASSETS: {
      fetch: async () => {
        throw Error("not static");
      },
    },
    TRAVELOS_BACKEND: {
      fetch: async (received: Request) => {
        assert.equal(received.url, request.url);
        assert.equal(received.headers.get("cookie"), "session=abc");
        assert.equal(received.headers.get("origin"), origin);
        assert.equal(received.headers.get("x-signature"), "signed");
        assert.equal(await received.text(), '{ "raw": true }');
        const headers = new Headers({ "Content-Type": "text/x-component" });
        headers.append("Set-Cookie", "first=1; HttpOnly");
        headers.append("Set-Cookie", "second=2; HttpOnly");
        return new Response("stream", { headers });
      },
    },
  };
  const response = await gateway.fetch(request, env);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.getSetCookie().length, 2);
  assert.equal(await response.text(), "stream");
});
test("Pages gateway rejects preview/custom origins and serves hashed assets separately", async () => {
  let calls = 0;
  const binding = {
    fetch: async () => {
      calls++;
      return new Response("asset");
    },
  };
  const env = {
    PUBLIC_ORIGIN: origin,
    ASSETS: binding,
    TRAVELOS_BACKEND: {
      fetch: async () => {
        throw Error("backend should not be called");
      },
    },
  };
  assert.equal(
    (await gateway.fetch(new Request("https://evil.example/"), env)).status,
    421,
  );
  assert.equal(calls, 0);
  assert.equal(
    await (
      await gateway.fetch(new Request(`${origin}/_next/static/app.js`), env)
    ).text(),
    "asset",
  );
  assert.equal(calls, 1);
});
test("request resource scopes stay isolated across concurrent async operations and cleanup once", async () => {
  let closed = 0;
  const scopes: RequestResources[] = ["a", "b"].map((databaseUrl) => ({
    databaseUrl,
    values: new Map(),
    cleanup: [
      async () => {
        closed++;
      },
    ],
  }));
  await Promise.all(
    scopes.map((scope) =>
      requestResources.run(scope, async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        assert.equal(requestResources.getStore(), scope);
        await closeResources(scope);
        await closeResources(scope);
      }),
    ),
  );
  assert.equal(closed, 2);
  assert.equal(requestResources.getStore(), undefined);
});

test("Workers mail requires HTTPS delivery even when legacy SMTP variables are present", async () => {
  const keys = [
    "TRAVELOS_RUNTIME",
    "MAIL_FROM",
    "SMTP_HOST",
    "SMTP_USER",
    "SMTP_PASS",
    "RESEND_API_KEY",
  ];
  const previous = Object.fromEntries(
    keys.map((key) => [key, process.env[key]]),
  );
  const originalFetch = globalThis.fetch;
  try {
    Object.assign(process.env, {
      TRAVELOS_RUNTIME: "cloudflare",
      MAIL_FROM: "test@example.invalid",
      SMTP_HOST: "legacy.invalid",
      SMTP_USER: "fictional",
      SMTP_PASS: "fictional",
    });
    delete process.env.RESEND_API_KEY;
    const { mailReady, sendMail } = await import("../src/lib/mail");
    assert.equal(mailReady(), false);
    process.env.RESEND_API_KEY = "fictional-not-sent";
    globalThis.fetch = async (input) => {
      assert.equal(String(input), "https://api.resend.com/emails");
      return Response.json({ id: "mock" });
    };
    assert.equal(mailReady(), true);
    await sendMail("customer@example.invalid", "Test", "Fictional");
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
