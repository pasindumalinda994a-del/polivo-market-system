import { expect, test } from "@playwright/test";

test("loads the Polivo web foundation home page", async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => {
    pageErrors.push(error);
  });

  const response = await page.goto("/");
  expect(response?.ok()).toBe(true);

  await expect(page.getByRole("heading", { name: "Polivo", level: 1 })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Web application foundation", level: 2 }),
  ).toBeVisible();
  await expect(page.getByText("The web application is running.")).toBeVisible();

  expect(pageErrors).toEqual([]);
});

test("dashboard shell supports keyboard skip link and keeps planned nav unavailable", async ({
  page,
}) => {
  await page.goto("/dashboard");

  await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
  await expect(page.getByText("No dashboard data yet")).toBeVisible();

  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "Skip to content" });
  await expect(skipLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();

  const reports = page.getByText("Reports", { exact: true });
  await expect(reports).toBeVisible();
  await expect(page.getByRole("link", { name: "Reports" })).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  await page.getByRole("button", { name: "Close navigation", exact: true }).click();
  await expect(page.getByRole("button", { name: "Open navigation" })).toBeVisible();
});

test("dashboard dialog moves focus and restores it after close", async ({ page }) => {
  await page.goto("/dashboard");

  const trigger = page.getByRole("button", { name: "Shell details" });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect
    .poll(async () => {
      return page.evaluate(() => {
        const active = document.activeElement;
        const dialogElement = document.querySelector('[role="dialog"]');
        return dialogElement !== null && active !== null && dialogElement.contains(active);
      });
    })
    .toBe(true);

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("production build does not expose the development UI preview", async ({ page }) => {
  const response = await page.goto("/dev/ui");
  expect(response?.status()).toBe(404);
});
