import { test } from "node:test";
import assert from "node:assert/strict";
import { readApiJson } from "../src/lib/api-response";
test("CRM client never exposes an HTML error body or JSON parser exception", async () => {
  for (const response of [
    new Response("<!DOCTYPE html>private diagnostics", {
      status: 500,
      headers: { "content-type": "text/html" },
    }),
    new Response("<!DOCTYPE html>", {
      headers: { "content-type": "application/json" },
    }),
  ]) {
    await assert.rejects(
      readApiJson(response),
      (e) =>
        e instanceof Error &&
        /not confirmed/.test(e.message) &&
        !/Unexpected token|DOCTYPE|private/.test(e.message),
    );
  }
});
test("CRM client keeps successful API records, permission errors and safe reference IDs", async () => {
  assert.deepEqual(await readApiJson(Response.json({ leadId: "example" })), {
    leadId: "example",
  });
  await assert.rejects(
    readApiJson(Response.json({ error: "Please sign in" }, { status: 401 })),
    /Please sign in/,
  );
  await assert.rejects(
    readApiJson(
      new Response("upstream", {
        headers: {
          "x-travelos-request-id": "test-reference",
          "content-type": "text/html",
        },
      }),
    ),
    /Reference: test-reference/,
  );
});
