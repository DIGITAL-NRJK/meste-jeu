import { expect, test } from "@playwright/test";

test("la fondation mobile et le health check répondent", async ({
  page,
  request,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Héritage Congo" }),
  ).toBeVisible();

  const health = await request.get("/api/health");

  expect(health.ok()).toBe(true);
  await expect(health.json()).resolves.toMatchObject({ status: "ok" });
});
