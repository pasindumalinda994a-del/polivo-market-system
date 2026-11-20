import { expect, test } from "@playwright/test";

test("loads the Polivo public home page", async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => {
    pageErrors.push(error);
  });

  const response = await page.goto("/");
  expect(response?.ok()).toBe(true);

  await expect(page.getByRole("heading", { level: 1 })).toContainText("Market stall billing");
  await expect(page.getByRole("link", { name: "Get started" }).first()).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Download desktop application" }).first(),
  ).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Public" })).toBeVisible();

  expect(pageErrors).toEqual([]);
});

test("downloads page shows unavailable state without fake installers", async ({ page }) => {
  await page.goto("/downloads");
  await expect(page.getByRole("heading", { name: "Downloads", level: 1 })).toBeVisible();
  await expect(page.getByText("Desktop downloads are not available yet.")).toBeVisible();
});

test("unauthenticated dashboard access redirects to sign-in", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByRole("heading", { name: "Sign in", level: 1 }).first()).toBeVisible();
  await expect(page.getByText("Use your Polivo online account").first()).toBeVisible();
});

test("sign-in page renders with the Polivo theme", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { name: "Sign in", level: 1 }).first()).toBeVisible();
  await expect(page.getByText("Polivo").first()).toBeVisible();
  await expect(page.locator("main")).toBeVisible();
});

test("untrusted redirect destinations are rejected", async ({ page }) => {
  await page.goto("/sign-in?redirect_url=https://evil.example/phish");
  await expect(page.getByRole("heading", { name: "Sign in", level: 1 }).first()).toBeVisible();
  // Force redirect target must stay on an approved same-origin path (default dashboard).
  await expect(page.getByText("Use your Polivo online account").first()).toBeVisible();
  await expect(
    page.locator(".cl-signIn-root, [data-clerk-component='SignIn']").first(),
  ).toBeVisible();
});

test("unauthenticated private API access returns 401", async ({ request }) => {
  const response = await request.get("/api/auth/session");
  expect(response.status()).toBe(401);
  const body = await response.json();
  expect(body).toMatchObject({
    code: "UNAUTHENTICATED",
  });
});

test("unauthenticated onboarding and tenant APIs are protected", async ({ page, request }) => {
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/sign-in/);

  const createStall = await request.post("/api/tenants", {
    data: {
      idempotencyKey: "e2e-unauth",
      displayName: "Should Fail",
      timezone: "Asia/Colombo",
    },
  });
  expect(createStall.status()).toBe(401);

  const acceptInvite = await request.post("/api/invitations/accept", {
    data: { token: "a".repeat(32) },
  });
  expect(acceptInvite.status()).toBe(401);
});

test("production build does not expose the development UI preview", async ({ page }) => {
  const response = await page.goto("/dev/ui");
  expect(response?.status()).toBe(404);
});
