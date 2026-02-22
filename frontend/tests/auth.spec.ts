import { expect, test } from "@playwright/test";

// Mock the backend auth API so these tests run against the dev server (no Docker required).
test.beforeEach(async ({ page }) => {
  await page.route("/api/auth/login", async (route) => {
    const body = route.request().postDataJSON();
    if (body?.username === "user" && body?.password === "password") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ token: "test-token" }),
      });
    } else {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Invalid credentials" }),
      });
    }
  });

  await page.route("/api/auth/logout", async (route) => {
    await route.fulfill({ status: 204 });
  });
});

test("unauthenticated / redirects to /login", async ({ page }) => {
  await page.goto("/");
  await page.waitForURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("wrong credentials shows error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("wrongpassword");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator("p[role='alert']")).toBeVisible();
});

test("valid login shows kanban board", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/");
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
});

test("sign out returns to login", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/");
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("already logged in / shows board without redirect", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/");

  // Navigate away and back — should stay on board, not redirect to login
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
});
