import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fictionalExtraction,
  extractionSchema,
  priorities,
  followUpDraft,
} from "../src/lib/assistant";
import { extractMessage, minimiseMessage } from "../src/lib/ai-provider";
import { pricedUnit } from "../src/lib/money";
import type { Dataset } from "../src/lib/data";
test("Hinglish fictional preview preserves unresolved dates and total INR budget", () => {
  const d = extractionSchema.parse(fictionalExtraction);
  assert.equal(d.budgetAmount, 120000);
  assert.equal(d.budgetBasis, "total");
  assert.equal(d.adults, 2);
  assert.equal(d.nights, 5);
  assert.equal(d.destination, "Bali");
  assert.equal(d.travelStart, null);
  assert.equal(d.departureCity, null);
  assert.match(d.travelPeriod!, /unresolved/);
  assert.equal(extractionSchema.safeParse({ ...d, adults: -1 }).success, false);
});
test("markup and margin use different deterministic denominators", () => {
  assert.equal(pricedUnit(10000, "Cost plus markup", 2000, 0), 12000);
  assert.equal(pricedUnit(10000, "Target margin", 2000, 0), 12500);
  assert.equal(pricedUnit(10000, "Recorded selling rate", 0, 13000), 13000);
  assert.throws(() => pricedUnit(10000, "Target margin", 10000, 0));
});
test("operational queue excludes closed sales and uses recorded due dates", () => {
  const leads = ["New", "Won", "Lost"].map((stage, i) => ({
    id: String(i),
    customer: "Test",
    stage,
    assignedId: "u",
    enquiryDate: "2026-10-01",
    firstResponseHours: null,
    followUp: "2026-10-01",
    destination: "Bali",
  }));
  const data = {
    leads,
    quotes: [],
    bookings: [],
    users: [],
  } as unknown as Dataset;
  const queue = priorities(data, "2026-10-28");
  assert.equal(queue.length, 2);
  assert.ok(queue.every((x) => x.leadId === "0"));
  assert.match(
    followUpDraft(data, "0", "Quotation follow-up", "English"),
    /No quotation/,
  );
  assert.throws(() =>
    followUpDraft(data, "other", "First response", "English"),
  );
});
test("AI absent, provider failure and invalid JSON never become fabricated drafts", async () => {
  const key = process.env.AI_API_KEY;
  try {
    delete process.env.AI_API_KEY;
    await assert.rejects(extractMessage("test message"), /not configured/);
    process.env.AI_API_KEY = "test-not-a-real-key";
    await assert.rejects(
      extractMessage(
        "test message",
        async () => new Response("{}", { status: 503 }),
      ),
      /unavailable/,
    );
    await assert.rejects(
      extractMessage("test message", async () =>
        Response.json({ choices: [{ message: { content: "{}" } }] }),
      ),
      /invalid draft/,
    );
    const result = await extractMessage("test message", async () =>
      Response.json({
        choices: [
          { message: { content: JSON.stringify(fictionalExtraction) } },
        ],
      }),
    );
    assert.equal(result.destination, "Bali");
    assert.ok(
      !minimiseMessage("a@example.com +919876543210").includes("9876543210"),
    );
  } finally {
    if (key) process.env.AI_API_KEY = key;
    else delete process.env.AI_API_KEY;
  }
});

test("WhatsApp uses explicit international phones and safely encodes the reviewed draft", async () => {
  const { whatsappNumber, whatsappUrl } = await import("../src/lib/whatsapp");
  assert.equal(whatsappNumber("+1 (202) 555-0123"), "12025550123");
  assert.equal(whatsappNumber("0012025550123"), "12025550123");
  for (const phone of [
    "",
    "9876543210",
    "+0123456789",
    "+123",
    "javascript:123456789",
    "+1234567890123456",
  ])
    assert.equal(whatsappNumber(phone), null);
  assert.equal(whatsappUrl("+12025550123", "   "), null);
  const draft = "नमस्ते & hello?\nTotal ₹10,000 #review";
  const url = new URL(whatsappUrl("+12025550123", draft)!);
  assert.equal(url.origin, "https://wa.me");
  assert.equal(url.pathname, "/12025550123");
  assert.equal(url.searchParams.get("text"), draft);
});
