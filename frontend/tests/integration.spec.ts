import { expect, test } from "@playwright/test";

const INITIAL_BOARD = {
  columns: [
    { id: "col-backlog", title: "Backlog", cardIds: ["card-1", "card-2"] },
    { id: "col-discovery", title: "Discovery", cardIds: ["card-3"] },
    { id: "col-progress", title: "In Progress", cardIds: ["card-4", "card-5"] },
    { id: "col-review", title: "Review", cardIds: ["card-6"] },
    { id: "col-done", title: "Done", cardIds: ["card-7", "card-8"] },
  ],
  cards: {
    "card-1": { id: "card-1", title: "Align roadmap themes", details: "" },
    "card-2": { id: "card-2", title: "Gather customer signals", details: "" },
    "card-3": { id: "card-3", title: "Prototype analytics view", details: "" },
    "card-4": { id: "card-4", title: "Refine status language", details: "" },
    "card-5": { id: "card-5", title: "Design card layout", details: "" },
    "card-6": { id: "card-6", title: "QA micro-interactions", details: "" },
    "card-7": { id: "card-7", title: "Ship marketing page", details: "" },
    "card-8": { id: "card-8", title: "Close onboarding sprint", details: "" },
  },
};

test.beforeEach(async ({ page }) => {
  // Each test gets its own mutable board state that persists across reloads
  let board = JSON.parse(JSON.stringify(INITIAL_BOARD));

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

  await page.route("/api/board", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(board),
      });
    } else if (route.request().method() === "PATCH") {
      board = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(board),
      });
    }
  });
});

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/");
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
}

test("login → board loads from API", async ({ page }) => {
  const boardRequest = page.waitForResponse(
    (r) => r.url().includes("/api/board") && r.request().method() === "GET"
  );
  await login(page);
  const resp = await boardRequest;
  expect(resp.status()).toBe(200);
  await expect(page.getByTestId("column-col-backlog")).toBeVisible();
  await expect(page.getByTestId("column-col-done")).toBeVisible();
});

test("add a card → reload → card persists", async ({ page }) => {
  await login(page);

  const backlog = page.getByTestId("column-col-backlog");
  await backlog.getByRole("button", { name: /add a card/i }).click();
  await backlog.getByPlaceholder(/card title/i).fill("Integration test card");
  await backlog.getByRole("button", { name: /add card/i }).click();

  await page.waitForResponse(
    (r) => r.url().includes("/api/board") && r.request().method() === "PATCH"
  );

  await page.reload();
  await expect(page.getByTestId("column-col-backlog")).toBeVisible();
  await expect(page.getByText("Integration test card")).toBeVisible();
});

test("rename a column → reload → name persists", async ({ page }) => {
  await login(page);

  const backlog = page.getByTestId("column-col-backlog");
  const titleInput = backlog.getByLabel("Column title");
  await titleInput.fill("Renamed Column");
  await titleInput.blur();

  await page.waitForResponse(
    (r) => r.url().includes("/api/board") && r.request().method() === "PATCH"
  );

  await page.reload();
  await expect(page.getByTestId("column-col-backlog").getByLabel("Column title")).toHaveValue(
    "Renamed Column"
  );
});

test("move a card → reload → card in new column", async ({ page }) => {
  await login(page);

  const backlog = page.getByTestId("column-col-backlog");
  const progress = page.getByTestId("column-col-progress");

  const card = backlog.getByText("Align roadmap themes");
  await expect(card).toBeVisible();

  const cardBox = await card.boundingBox();
  const targetBox = await progress.boundingBox();
  if (!cardBox || !targetBox) throw new Error("Could not get element bounds");

  // Drag with slow mouse movement to satisfy the dnd-kit activation distance
  const startX = cardBox.x + cardBox.width / 2;
  const startY = cardBox.y + cardBox.height / 2;
  const endX = targetBox.x + targetBox.width / 2;
  const endY = targetBox.y + targetBox.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX, startY + 10, { steps: 5 });
  await page.mouse.move(endX, endY, { steps: 20 });
  await page.mouse.up();

  await page.waitForResponse(
    (r) => r.url().includes("/api/board") && r.request().method() === "PATCH"
  );

  await page.reload();
  await expect(progress.getByText("Align roadmap themes")).toBeVisible();
  await expect(backlog.getByText("Align roadmap themes")).not.toBeVisible();
});
