import { test } from "node:test";
import assert from "node:assert/strict";
import { paidAiEnabled } from "../src/lib/paid-services";
import { extractMessage } from "../src/lib/ai-provider";
test("paid AI is disabled by default even when a key is present; no provider request is sent", async () => {
  const flag = process.env.PAID_AI_ENABLED,
    key = process.env.AI_API_KEY;
  try {
    delete process.env.PAID_AI_ENABLED;
    process.env.AI_API_KEY = "fictional-not-used";
    assert.equal(paidAiEnabled(), false);
    let calls = 0;
    await assert.rejects(
      extractMessage("fictional message", async () => {
        calls++;
        return Response.json({});
      }),
      /not configured/,
    );
    assert.equal(calls, 0);
    process.env.PAID_AI_ENABLED = "false";
    assert.equal(paidAiEnabled(), false);
  } finally {
    if (flag === undefined) delete process.env.PAID_AI_ENABLED;
    else process.env.PAID_AI_ENABLED = flag;
    if (key === undefined) delete process.env.AI_API_KEY;
    else process.env.AI_API_KEY = key;
  }
});
