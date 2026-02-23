# Implementation Plan

## Current State

The frontend Kanban board is fully built (Next.js, @dnd-kit, Tailwind 4, Vitest + Playwright tests). No backend, Docker setup, or auth exists yet.

```
frontend/src/
  app/page.tsx               # renders <KanbanBoard />
  components/
    KanbanBoard.tsx          # root component, holds BoardData state
    KanbanColumn.tsx         # droppable
    KanbanCard.tsx           # sortable/draggable
    KanbanCardPreview.tsx    # DragOverlay clone
    NewCardForm.tsx          # inline add-card form
  lib/kanban.ts              # BoardData types + moveCard() + initialData
backend/                     # empty (CLAUDE.md + docs/ only)
scripts/                     # empty (CLAUDE.md only)
docs/PLAN.md                 # high-level parts list
```

---

## Part 2: Docker + FastAPI Scaffolding

Goal: Docker container running FastAPI, serving static HTML "hello world" that also makes an API call. Confirms the full stack wires up locally.

### Steps

- [x] Create `backend/pyproject.toml` with dependencies: `fastapi`, `uvicorn[standard]`, `sqlalchemy[asyncio]`, `aiosqlite`, `openai`, `python-dotenv`, `python-multipart`, `httpx`, and pytest/pytest-asyncio dev deps
- [x] Create `backend/app/__init__.py`
- [x] Create `backend/app/config.py` — reads `DATABASE_URL` and `OPENROUTER_API_KEY` from `.env` at project root via `python-dotenv`
- [x] Create `backend/app/main.py` — minimal FastAPI app with:
  - `GET /api/health` returning `{"status": "ok"}`
  - Static file mount at `/` serving `../frontend/out` (html=True)
  - Hello-world fallback: if `frontend/out` doesn't exist yet, serve an inline HTML string from `GET /`
- [x] Create `Dockerfile` at project root:
  - Stage 1: build Next.js static export (`bun run build`) from `frontend/`
  - Stage 2: Python image, copy `backend/` and `frontend/out/`, run `uv sync`, start uvicorn on port 8000
- [x] Create `.dockerignore`
- [x] Create `scripts/start.sh` — `docker build -t agentic-pm . && docker run -p 8000:8000 --env-file .env agentic-pm`
- [x] Create `scripts/stop.sh` — `docker stop` / `docker rm` the running container
- [x] Make scripts executable (`chmod +x`)
- [x] Create `.env.example` at project root with `OPENROUTER_API_KEY=`

### Success Criteria

- `./scripts/start.sh` builds and starts without error
- `curl http://localhost:8000/api/health` returns `{"status":"ok"}`
- `curl http://localhost:8000/` returns HTML that loads and makes a visible `fetch("/api/health")` call (logged to console or displayed on page)
- `./scripts/stop.sh` cleanly stops the container

---

## Part 3: Frontend Served by FastAPI

Goal: Static Next.js build served by FastAPI. Kanban board visible at `http://localhost:8000/`.

### Steps

- [x] Ensure `frontend/next.config.ts` has `output: "export"` set
- [x] Verify `bun run build` in `frontend/` produces `frontend/out/`
- [x] Update `Dockerfile` so Stage 2 copies `frontend/out/` into the image
- [x] Confirm `app/main.py` mounts `StaticFiles(directory="frontend/out", html=True)` at `/`
- [x] Rebuild Docker image and confirm Kanban board loads at `http://localhost:8000/`

### Tests

- [x] Frontend unit tests: `bun run test` passes (already written — `kanban.test.ts`, `KanbanBoard.test.tsx`)
- [x] Playwright e2e: `bun run test:e2e` — existing `kanban.spec.ts` passes against `http://localhost:3000` dev server
- [x] Add a smoke e2e test: `tests/docker-smoke.spec.ts` — Playwright hits `http://localhost:8000/`, asserts the board heading/columns are visible

### Success Criteria

- `http://localhost:8000/` shows the Kanban board
- `bun run test` (unit) passes
- Playwright smoke test against port 8000 passes

---

## Part 4: Login / Logout

Goal: Unauthenticated users hitting `/` are redirected to a login page. `user` / `password` grants access. Logout returns to login.

### Steps

**Backend**

- [x] Create `backend/app/auth/__init__.py`
- [x] Create `backend/app/auth/permissions.py`:
  - `_valid_tokens: set[str]`
  - `issue_token() -> str` (uuid4)
  - `require_auth` FastAPI dependency (reads `Authorization: Bearer <token>`, raises 401 if invalid)
- [x] Create `backend/app/routes/__init__.py`
- [x] Create `backend/app/routes/auth.py`:
  - `POST /api/auth/login` — validates `{"username":"user","password":"password"}`, returns `{"token":"<uuid>"}`
  - `POST /api/auth/logout` — removes token from `_valid_tokens`, returns 204
- [x] Register auth router in `app/main.py` under prefix `/api`
- [x] Add a protected test route `GET /api/me` (temporary, for testing) that requires auth and returns `{"username":"user"}`

**Frontend**

- [x] Install `zustand` (client state) via bun
- [x] Create `src/lib/auth.ts` — Zustand store with `token: string | null`, `setToken()`, `clearToken()`; persists to `localStorage`
- [x] Create `src/app/login/page.tsx` — login form (username + password fields, submit button), calls `POST /api/auth/login`, stores token, redirects to `/`
- [x] Update `src/app/page.tsx` — reads token from store; if null, redirect to `/login`; renders `<KanbanBoard />` otherwise
- [x] Add a "Sign out" button (in layout or board header) that calls `POST /api/auth/logout`, clears token, redirects to `/login`
- [x] Update `frontend/next.config.ts` to ensure static export still works (no server-side auth — all auth is client-side via API token)

### Tests

**Backend**

- [x] `tests/routes/test_auth.py`:
  - Valid login → 200 + token in response
  - Wrong password → 401
  - Missing `Authorization` header on protected route → 401
  - Invalid token → 401
  - Valid token after login → 200 on `/api/me`
  - Logout → 204; subsequent request with that token → 401

**Frontend**

- [x] Unit test for auth Zustand store (`src/lib/auth.test.ts`)
- [x] Playwright e2e — `tests/auth.spec.ts`:
  - Visit `/` unauthenticated → redirected to `/login`
  - Submit wrong credentials → error message shown
  - Submit `user` / `password` → board visible at `/`
  - Click "Sign out" → redirected to `/login`
  - Visit `/` while logged in → board shown (no redirect)

### Success Criteria

- `uv run pytest tests/routes/test_auth.py` — all pass
- `bun run test` — all pass
- Playwright auth e2e — all pass
- No plaintext passwords in source code or logs

---

## Part 5: Database Schema

Goal: Document and get sign-off on the SQLite schema before writing any DB code.

### Steps

- [x] Create `docs/schema.json` — JSON description of the schema:
  ```json
  {
    "tables": {
      "kanban_columns": {
        "columns": { "id": "TEXT PK", "title": "TEXT", "position": "INTEGER" }
      },
      "kanban_cards": {
        "columns": {
          "id": "TEXT PK",
          "title": "TEXT",
          "details": "TEXT DEFAULT ''",
          "column_id": "TEXT FK→kanban_columns.id ON DELETE CASCADE",
          "position": "INTEGER"
        }
      }
    }
  }
  ```
- [x] Create `docs/DATABASE.md` documenting:
  - Why SQLite (local, zero-config, single-user)
  - ORM: SQLAlchemy async (`aiosqlite`)
  - Schema diagram (ASCII table)
  - `BoardData` JSON ↔ DB mapping: `columns` array = ordered by `position`; `cards` dict = keyed by `id`, ordered per column by `position`
  - Seeding strategy: on startup if tables empty, insert `initialData` columns + cards
- [x] **User sign-off — approved, proceeding to Part 6**

### Success Criteria

- `docs/schema.json` and `docs/DATABASE.md` exist and are reviewed/approved by user

---

## Part 6: Backend API (Kanban CRUD)

Goal: Full REST API for reading and mutating the Kanban board, backed by SQLite.

### Steps

- [x] Create `backend/app/database.py`:
  - Async engine (`sqlite+aiosqlite:///./board.db`)
  - `async_session_maker` via `sessionmaker(..., class_=AsyncSession, expire_on_commit=False)`
  - `Base = declarative_base()`
  - `get_session()` dependency (yields `AsyncSession`)
  - `init_db()` — `Base.metadata.create_all`, then calls `seed_db()` if tables empty
  - `seed_db(session)` — inserts the 5 columns + 8 cards from `initialData`
- [x] Create `backend/app/models/__init__.py`
- [x] Create `backend/app/models/board.py`:
  - ORM: `KanbanColumn` (id, title, position), `KanbanCard` (id, title, details, column_id FK, position)
  - Pydantic: `CardSchema`, `ColumnSchema`, `BoardData`
  - `async def db_to_board(session) -> BoardData`
  - `async def board_to_db(session, board: BoardData)` — diff-based upsert (delete removed IDs, INSERT OR REPLACE rest)
- [x] Create `backend/app/routes/board.py`:
  - `GET /api/board` — returns `BoardData`, requires auth
  - `PATCH /api/board` — accepts `BoardData`, calls `board_to_db`, returns updated `BoardData`, requires auth
- [x] Register board router in `app/main.py`
- [x] Update `app/main.py` lifespan to call `init_db()` on startup
- [x] Remove the temporary `GET /api/me` route

### Tests

- [x] `tests/conftest.py`:
  - In-memory SQLite engine + `init_db()` fixture
  - `TestClient` with `get_session` overridden
  - `auth_headers` fixture (logs in, returns `{"Authorization": "Bearer <token>"}`)
- [x] `tests/routes/test_board.py`:
  - `GET /api/board` without auth → 401
  - `GET /api/board` after login → 200, returns seeded `BoardData` (5 columns, 8 cards)
  - `PATCH /api/board` with a mutation (move card to different column) → 200, response reflects change
  - `GET /api/board` after patch → returns the mutated state (persistence confirmed)
  - `PATCH /api/board` with added column → 200, new column present
  - `PATCH /api/board` with deleted card → 200, card absent
  - `PATCH /api/board` without auth → 401

### Success Criteria

- `uv run pytest` — all tests pass
- `GET /api/board` returns valid `BoardData` JSON matching the seeded data
- `PATCH /api/board` persists changes across requests
- DB created automatically on first startup (no manual migration step)

---

## Part 7: Frontend + Backend Integration

Goal: The frontend reads from and writes to the backend API. Board state is persistent across page reloads.

### Steps

- [x] Install `@tanstack/react-query` via bun (server/async state)
- [x] Create `src/lib/api.ts`:
  - `fetchBoard(): Promise<BoardData>` — `GET /api/board` with auth token
  - `updateBoard(board: BoardData): Promise<BoardData>` — `PATCH /api/board` with auth token
  - Reads token from auth Zustand store; throws if 401 (triggers logout)
- [x] Create `src/lib/queryClient.ts` — exports a singleton `QueryClient`
- [x] Wrap app in `QueryClientProvider` in `src/app/layout.tsx` (via `Providers.tsx` client wrapper)
- [x] Refactor `KanbanBoard.tsx`:
  - Replace `useState(initialData)` with `useQuery({ queryKey: ["board"], queryFn: fetchBoard })`
  - On DnD drop / rename / add / delete: call `updateBoard(newBoard)` then `queryClient.invalidateQueries(["board"])`
  - Show a loading skeleton while fetching; show an error state if fetch fails
- [x] Confirm `next.config.ts` still produces a static export (all API calls are client-side `fetch`)

### Tests

**Frontend unit/component tests** (mock `fetch` via `vi.fn()`):

- [x] `KanbanBoard.test.tsx` — mock `fetchBoard` returns seeded data; assert columns render
- [x] `KanbanBoard.test.tsx` — simulate drag-drop; assert `updateBoard` called with correct new board
- [x] `api.test.ts` — `fetchBoard` calls correct URL with Authorization header; handles 401 by clearing token

**Playwright e2e — `tests/integration.spec.ts`**:

- [ ] Login → board loads from API (verify network call to `/api/board` returns 200)
- [ ] Move a card to another column → board re-fetches; reload page → card still in new column
- [ ] Add a card → reload → card persists
- [ ] Rename a column → reload → name persists

### Success Criteria

- Board data persists across full page reloads
- `bun run test` — all unit/component tests pass
- `bun run test:e2e` — integration Playwright tests pass
- No hardcoded `initialData` used in production code paths (still used in seeding only)

---

## Part 8: AI Connectivity

Goal: Backend can make an OpenRouter call. Verified with a simple arithmetic test.

### Steps

- [ ] Create `backend/app/ai.py`:
  - Instantiate `openai.OpenAI(base_url="https://openrouter.ai/api/v1", api_key=config.OPENROUTER_API_KEY)`
  - `def call_ai(board: dict, messages: list[dict]) -> dict` — placeholder that sends system + user messages to `openai/gpt-oss-120b`, parses and returns the response dict
- [ ] Add `OPENROUTER_API_KEY=<key>` to `.env` (not committed — `.env` is in `.gitignore`)
- [ ] Create a standalone connectivity test script `backend/scripts/test_ai.py`:
  - Sends `"What is 2+2?"` to OpenRouter
  - Prints the response
  - Exit code 0 if response received, 1 if error

### Tests

- [ ] `tests/test_ai_connectivity.py` (integration, skipped if no API key):
  - Sends a `"2+2"` message
  - Asserts response contains `"4"`
  - Marked `@pytest.mark.skipif(not config.OPENROUTER_API_KEY, reason="no API key")`

### Success Criteria

- `uv run python backend/scripts/test_ai.py` prints a response containing `"4"`
- Integration test passes when `OPENROUTER_API_KEY` is set

---

## Part 9: AI Chat Endpoint with Structured Outputs

Goal: `POST /api/chat` accepts conversation history + board state, calls the AI with structured output, optionally updates the board.

### Steps

- [ ] Define Pydantic schemas in `backend/app/models/board.py`:
  - `ChatMessage(role: Literal["user","assistant"], content: str)`
  - `ChatRequest(messages: list[ChatMessage], board: BoardData)`
  - `ChatResponse(message: str, board_update: BoardData | None = None)`
- [ ] Update `backend/app/ai.py` — `call_ai` uses structured output (OpenAI `response_format` / JSON mode):
  - System prompt includes: board JSON, instructions to return `{ "message": "...", "board_update": <BoardData or null> }`
  - Parse response; if `board_update` present and valid, include it in return value
- [ ] Create `backend/app/routes/chat.py`:
  - `POST /api/chat` — requires auth; calls `call_ai(body.board.model_dump(), body.messages)`; if `board_update` returned, calls `board_to_db(session, BoardData(...))` to persist; returns `ChatResponse`
- [ ] Register chat router in `app/main.py`

### Tests

- [ ] `tests/routes/test_chat.py` (monkeypatch `call_ai`):
  - POST without auth → 401
  - POST with valid request, `call_ai` mocked to return `{"message": "Done", "board_update": null}` → 200, `message` in response
  - POST where `call_ai` returns a `board_update` → 200; subsequent `GET /api/board` reflects the board update
  - POST with malformed messages → 422

### Success Criteria

- `uv run pytest tests/routes/test_chat.py` — all pass
- Manual test: send `"Move card-1 to In Progress"` with current board → AI returns a `board_update` that includes `card-1` in the In Progress column
- Board persisted after AI update

---

## Part 10: AI Chat Sidebar

Goal: A collapsible sidebar in the UI with full chat UI. AI responses can update the Kanban board, which refreshes automatically.

### Steps

- [ ] Install `shadcn/ui` into the frontend project (run shadcn init, add `Sheet`, `Button`, `Input`, `ScrollArea` components)
- [ ] Create `src/lib/chat.ts` — Zustand store:
  - `messages: ChatMessage[]`
  - `addMessage(msg: ChatMessage)`
  - `clearMessages()`
- [ ] Create `src/lib/api.ts` addition — `sendChat(messages, board): Promise<ChatResponse>`
- [ ] Create `src/components/chat/ChatSidebar.tsx`:
  - Collapsible panel (open/close toggle button visible on board)
  - `ScrollArea` showing message history (user messages right-aligned, assistant left-aligned)
  - Input field + send button at the bottom
  - On send: append user message to store; call `sendChat`; append assistant message; if `board_update` in response, call `updateBoard(board_update)` and `queryClient.invalidateQueries(["board"])` to refresh the Kanban
  - Loading indicator while waiting for AI response
  - Error state if request fails
- [ ] Create `src/components/chat/ChatMessage.tsx` — renders a single message bubble
- [ ] Update `src/app/page.tsx` (or layout) to render `<ChatSidebar />` alongside `<KanbanBoard />`
- [ ] Style using Tailwind CSS variables (no hardcoded colors)

### Tests

**Unit/component**

- [ ] `ChatSidebar.test.tsx`:
  - Renders toggle button
  - Opening sidebar shows empty message list
  - Typing and submitting calls `sendChat` with correct payload
  - AI response message appears in message list
  - If `board_update` returned, `updateBoard` is called
- [ ] `ChatMessage.test.tsx` — renders user vs assistant messages with correct alignment

**Playwright e2e — `tests/ai-chat.spec.ts`**:

- [ ] Login → open sidebar → type "What is on the board?" → AI responds (mock server or real key)
- [ ] AI response that includes a `board_update` → board columns/cards visually update without page reload

### Success Criteria

- Sidebar opens/closes without page reload
- Chat history is maintained within the session
- AI response that includes `board_update` updates the Kanban board in real time
- `bun run test` — all unit tests pass
- Playwright e2e chat tests pass

---

## Cross-Cutting Notes

- **Package managers**: `bun` for frontend, `uv` for backend — never mix
- **Static export**: Next.js must remain a static export (`output: "export"`); all API calls are client-side `fetch`
- **Token storage**: JWT/token in `localStorage` via Zustand persist; cleared on logout
- **No hardcoded colors**: always use CSS custom property variables from `globals.css`
- **One concern per file**: routes, models, db, ai each in their own module
- **Database auto-created**: `init_db()` runs on startup; no manual migration needed
- **AI model**: `openai/gpt-oss-120b` via OpenRouter
- **`.env` never committed**: `.gitignore` must include `.env`
