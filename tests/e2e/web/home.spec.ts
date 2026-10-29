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
