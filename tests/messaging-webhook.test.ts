import { test } from "node:test";
import assert from "node:assert/strict";
import { GET, POST } from "../src/app/api/messaging/webhook/route";
test("webhook verification uses configured token and raw payload signatures; missing and malformed credentials fail closed", async () => {
  const old = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  try {
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN =
      "fictional-verify-token-more-than-32-characters";
    const url = new URL("https://staging.example.test/api/messaging/webhook");
    url.search = new URLSearchParams({
      "hub.mode": "subscribe",
      "hub.verify_token": process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
      "hub.challenge": "123456",
    }).toString();
    const ok = await GET(new Request(url));
    assert.equal(ok.status, 200);
    assert.equal(await ok.text(), "123456");
    url.searchParams.set("hub.verify_token", "अ".repeat(45));
    assert.equal((await GET(new Request(url))).status, 403);
    delete process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    assert.equal((await GET(new Request(url))).status, 403);
    assert.equal(
      (await POST(new Request(url, { method: "POST", body: "{}" }))).status,
      401,
    );
    assert.equal(
      (
        await POST(
          new Request(url, { method: "POST", body: " ".repeat(262145) }),
        )
      ).status,
      413,
    );
  } finally {
    if (old === undefined) delete process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    else process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = old;
  }
});
