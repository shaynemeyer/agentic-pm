# Code Review Report

**Date**: 2026-02-24
**Reviewer**: Claude Code (claude-sonnet-4-6)
**Scope**: Full repository review

---

## Summary

The application is a well-structured single-board Kanban app with AI chat integration. The code demonstrates a clean separation of concerns, good use of modern tooling (FastAPI, Next.js, Zustand, TanStack Query, dnd-kit), and adequate test coverage for the happy path. However, there are several critical security and reliability issues that should be addressed.

**Issue counts**: 3 Critical · 3 High · 4 Medium · 5 Low

---

## Critical Issues

### C1 — In-memory token storage with no expiration

**File**: `backend/app/auth/permissions.py`

Tokens are stored in a module-level Python `set`. This means:

- All sessions are invalidated on every server restart.
- Tokens never expire — once issued, they are valid forever (until restart).
- The token store grows without bound if `logout` is never called.
- No way to audit or revoke sessions.

```python
# permissions.py:4
_valid_tokens: set[str] = set()

def issue_token() -> str:
    token = str(uuid4())
    _valid_tokens.add(token)  # grows forever
    return token
```

**Action**: Implement JWT with short expiry (e.g. 1 hour) and a refresh token flow, or at minimum store tokens in SQLite with an `expires_at` column and a cleanup job.

---

### C2 — Unhandled JSON parsing on AI responses

**File**: `backend/app/ai.py`

The AI response is passed directly to `json.loads()` with no error handling. If the model returns a non-JSON string, a markdown block, or a partial response, the entire chat request fails with an unhandled 500.

```python
# ai.py:27-34
content = response.choices[0].message.content
return json.loads(content)  # crashes on malformed response
```

There is also no validation that `board_update` in the parsed response conforms to the `BoardData` schema before it is applied.

**Action**: Wrap `json.loads` in a `try/except json.JSONDecodeError` block. Return a safe fallback message on failure. Validate `board_update` with `BoardData.model_validate()` before returning it to the caller.

---

### C3 — Missing API key validation at startup

**File**: `backend/app/config.py`, `backend/app/ai.py`

`OPENROUTER_API_KEY` defaults to an empty string. The OpenAI client is constructed successfully with an empty key, so the misconfiguration is not detected until the first chat request, which then fails with a cryptic provider error.

```python
# config.py:7
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
```

**Action**: Remove the default empty string. Add a startup check (in the FastAPI `lifespan` or directly in `config.py`) that raises a clear `RuntimeError` if the key is absent.

---

## High Priority Issues

### H1 — Race condition in optimistic board updates

**File**: `frontend/src/components/KanbanBoard.tsx`

The `persist` helper applies an optimistic update to the query cache before the API call, but does not roll back on failure:

```typescript
// KanbanBoard.tsx:22-26
queryClient.setQueryData(['board'], newBoard); // optimistic update
await updateBoard(newBoard); // could fail
queryClient.invalidateQueries({ queryKey: ['board'] });
```

If `updateBoard` throws, the UI shows the new state but the server has the old state. The user sees incorrect data with no indication of the failure.

**Action**: Capture the previous value before the optimistic update and restore it on error:

```typescript
const previous = queryClient.getQueryData(['board']);
queryClient.setQueryData(['board'], newBoard);
try {
  await updateBoard(newBoard);
  queryClient.invalidateQueries({ queryKey: ['board'] });
} catch (err) {
  queryClient.setQueryData(['board'], previous);
  throw err;
}
```

---

### H2 — Orphaned user messages on chat failure

**File**: `frontend/src/components/chat/ChatSidebar.tsx`

The user message is added to the Zustand store before the API call is made. If the call fails, the message stays in the chat history permanently with no way to retry or remove it:

```typescript
// ChatSidebar.tsx:38-52
addMessage(userMsg); // added immediately
setIsLoading(true);
try {
  const response = await sendChat([...messages, userMsg], board);
  addMessage({ role: 'assistant', content: response.message });
} catch {
  setError('Failed to get a response. Please try again.');
  // userMsg is now permanently in the store
}
```

**Action**: Track a `pendingMessage` in local state. Only commit it to the store on success, or mark it as failed so it can be retried or removed.

---

### H3 — Silent 401 errors in the board component

**File**: `frontend/src/lib/api.ts`, `frontend/src/components/KanbanBoard.tsx`

`handleResponse` throws on non-OK HTTP status, but the error message does not distinguish a 401 (expired/invalid token) from a network failure. The board shows a generic "Failed to load board" message, leaving the user stranded with no redirect to login.

**Action**: In `handleResponse`, check `resp.status === 401` and call the auth store's `logout()` + `router.push("/login")` before throwing, so the user is redirected automatically.

---

## Medium Priority Issues

### M1 — No logging infrastructure

**Files**: All backend files

There is no logging configured anywhere in the backend. Errors are returned as HTTP responses but nothing is written to a log. This makes debugging production issues very difficult.

**Action**: Add `logging.basicConfig(level=logging.INFO)` in `main.py`. Add `logger = logging.getLogger(__name__)` in each module and log exceptions before re-raising or returning error responses.

---

### M2 — Database seed has no error handling or transaction safety

**File**: `backend/app/database.py`

`seed_db` adds rows and commits without a `try/except`. A failure mid-seed leaves partial data and no rollback:

```python
# database.py:28-54
for col in columns:
    session.add(col)
for card in cards:
    session.add(card)
await session.commit()  # no rollback on failure
```

**Action**: Wrap the body of `seed_db` in a `try/except` that calls `await session.rollback()` on failure and re-raises.

---

### M3 — ID collision risk in `createId`

**File**: `frontend/src/lib/kanban.ts`

Card and column IDs are generated with `Date.now()` (millisecond precision) plus a short `Math.random()` fragment. With rapid card creation (e.g. AI inserting multiple cards in one response), collisions are possible.

```typescript
// kanban.ts:164-168
const randomPart = Math.random().toString(36).slice(2, 8);
const timePart = Date.now().toString(36);
return `${prefix}-${randomPart}${timePart}`;
```

**Action**: Use `crypto.randomUUID()` (available in all modern browsers and Node):

```typescript
export const createId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
```

---

### M4 — Hardcoded column count in grid layout

**File**: `frontend/src/components/KanbanBoard.tsx`

The board grid is hardcoded to 5 columns (`lg:grid-cols-5`). If the AI adds a sixth column, the layout breaks. If the board has fewer than 5 columns, there are empty grid cells.

**Action**: Use a dynamic inline style or compute a Tailwind class from the column count. Alternatively, use `grid-cols-[repeat(auto-fill,minmax(280px,1fr))]` for a fully responsive layout.

---

## Low Priority Issues

### L1 — Dockerfile missing HEALTHCHECK

**File**: `Dockerfile`

There is no `HEALTHCHECK` instruction. Docker (and any orchestrator) cannot detect an unhealthy container and will continue routing traffic to it.

**Action**: Add a health check. The backend already exposes `/api/health` (or add it if missing):

```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8000/api/health || exit 1
```

---

### L2 — Missing input validation in API layer

**File**: `frontend/src/lib/api.ts`

`fetchBoard()` returns the raw parsed JSON without schema validation. If the backend returns an unexpected shape, TypeScript's type-casting masks the issue until a runtime error occurs elsewhere.

**Action**: Parse the response through the `BoardData` Zod schema (or equivalent) at the API boundary.

---

### L3 — No frontend loading indicator on login button click

**File**: `frontend/src/app/login/page.tsx`

The button text already changes to "Signing in…" during the request (good), but there is no spinner or visual affordance beyond the text change and disabled opacity.

**Action**: Add a spinner icon inside the button when `loading` is true. Low effort, noticeable UX improvement.

---

### L4 — Unused imports in board model

**File**: `backend/app/models/board.py`

`delete` and `select` are imported from SQLAlchemy but appear to be used in routes, not in the model file. Review and remove any that are genuinely unused to keep imports clean.

---

### L5 — Token set grows on repeated logins without logout

**File**: `backend/app/auth/permissions.py`

Each call to `issue_token()` adds a new entry. If a client logs in repeatedly without logging out (e.g. page refresh, cookie cleared), the token set grows indefinitely for the lifetime of the process.

**Action**: Addressed by C1 (switching to JWT or a DB-backed token store with expiry). No separate fix needed once C1 is resolved.

---

## Testing Gaps

The existing test suite covers happy-path scenarios well. The following cases are not covered:

| Gap                                            | File to add tests in                          |
| ---------------------------------------------- | --------------------------------------------- |
| `call_ai` with malformed JSON from provider    | `backend/tests/test_ai.py`                    |
| Board update API call failure (rollback check) | `frontend/src/__tests__/KanbanBoard.test.tsx` |
| 401 response triggers redirect to login        | `frontend/src/__tests__/api.test.ts`          |
| `seed_db` failure causes rollback              | `backend/tests/test_database.py`              |
| Concurrent drag-and-drop operations            | E2E test                                      |
| Chat failure leaves no orphaned messages       | `frontend/src/__tests__/ChatSidebar.test.tsx` |

---

## Positive Observations

- Clean separation of concerns: routes, models, auth, and AI are each in their own module.
- Good use of TanStack Query for server state and Zustand for client state — no mixing.
- The dnd-kit integration is correct: `DndContext` wraps all columns, `SortableContext` scopes each column, sensors are configured for pointer and keyboard.
- Python type hints are used consistently throughout the backend.
- The `handleResponse` helper in `api.ts` provides a single place to handle HTTP errors — good foundation for the 401 fix (H3).
- Scripts auto-detect Docker vs Podman — thoughtful for developer portability.
- The AI system prompt is well-structured and constrains the model to return a consistent JSON schema.

---

## Action Priority Summary

| ID  | Issue                                 | Priority | Effort        |
| --- | ------------------------------------- | -------- | ------------- |
| C1  | Token expiration / persistent storage | Critical | High          |
| C2  | AI JSON parse error handling          | Critical | Low           |
| C3  | API key validation at startup         | Critical | Low           |
| H1  | Optimistic update rollback            | High     | Low           |
| H2  | Orphaned chat messages on failure     | High     | Medium        |
| H3  | Silent 401 → no redirect              | High     | Low           |
| M1  | Add logging infrastructure            | Medium   | Low           |
| M2  | seed_db transaction safety            | Medium   | Low           |
| M3  | ID collision risk                     | Medium   | Low           |
| M4  | Hardcoded grid column count           | Medium   | Low           |
| L1  | Dockerfile HEALTHCHECK                | Low      | Low           |
| L2  | API response schema validation        | Low      | Low           |
| L3  | Login button spinner                  | Low      | Low           |
| L4  | Unused imports cleanup                | Low      | Low           |
| L5  | Token set unbounded growth            | Low      | (fixed by C1) |
