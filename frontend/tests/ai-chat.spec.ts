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
      await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ detail: "Invalid credentials" }) });
    }
  });

  await page.route("/api/auth/logout", async (route) => {
    await route.fulfill({ status: 204 });
  });

  await page.route("/api/board", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(board) });
    } else if (route.request().method() === "PATCH") {
      board = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(board) });
    }
  });

  await page.route("/api/chat", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ message: "The board has 5 columns and 8 cards.", board_update: null }),
    });
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

test("login → open sidebar → type message → AI responds", async ({ page }) => {
  await login(page);

  await page.getByRole("button", { name: /open ai chat/i }).click();
  await expect(page.getByTestId("chat-input")).toBeVisible();

  await page.getByTestId("chat-input").fill("What is on the board?");
  await page.getByTestId("chat-send").click();

  await expect(
    page.getByText("The board has 5 columns and 8 cards.")
  ).toBeVisible();
});

test("AI response with board_update refreshes the board without page reload", async ({ page }) => {
  const updatedBoard = JSON.parse(JSON.stringify(INITIAL_BOARD));
  updatedBoard.columns[0].title = "AI Updated Backlog";
  updatedBoard.columns[0].cardIds = ["card-1"];
  updatedBoard.columns[2].cardIds = ["card-2", "card-4", "card-5"];
  updatedBoard.cards["card-2"] = { id: "card-2", title: "Gather customer signals", details: "" };

  await page.route("/api/chat", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        message: "I moved card-2 to In Progress.",
        board_update: updatedBoard,
      }),
    });
  });

  // Also update the board mock so the re-fetch returns the updated board
  await page.route("/api/board", async (route) => {
    if (route.request().method() === "PATCH") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(updatedBoard),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(updatedBoard),
      });
    }
  });

  await login(page);

  await page.getByRole("button", { name: /open ai chat/i }).click();
  await page.getByTestId("chat-input").fill("Move card-2 to In Progress");

  // Register before click to avoid race condition with fast mocks
  const patchDone = page.waitForResponse(
    (r) => r.url().includes("/api/board") && r.request().method() === "PATCH"
  );
  await page.getByTestId("chat-send").click();

  await expect(page.getByText("I moved card-2 to In Progress.")).toBeVisible();
  await patchDone;
});
