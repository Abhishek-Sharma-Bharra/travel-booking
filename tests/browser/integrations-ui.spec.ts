import { test, expect } from "./fixtures";
test("integration, official messaging and automation demo screens are read-only and do not request credentials", async ({
  page,
  request,
}) => {
  await page.goto("/demo");
  for (const name of ["Integrations", "Messaging", "Automation"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(page.locator('[data-tour-page="' + name + '"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
  }
  await expect(
    page.getByRole("button", { name: "Save automation controls" }),
  ).toBeDisabled();
  for (const api of ["integrations", "messaging", "automation", "tour"])
    expect((await request.get("/api/" + api)).status()).toBe(401);
  expect(
    (
      await request.post("/api/automation/run", {
        data: { schedule: true, cursor: "" },
      })
    ).status(),
  ).toBe(401);
});
