# Multi-Board & Multi-User Collaboration Plan

## Context

The app currently has one hardcoded user (`user`/`password`) and one implicit global board. The goal is to:

- Let each user create multiple boards and switch between them
- Make the board creator the "owner" (only owner can delete the board)
- Allow the owner to invite other users to a board
- Allow any board member to add cards
- Track who created each card and who it's assigned to, displayed on the card

The SQLite DB has no migration system, so schema changes require dropping and recreating `board.db` (handled automatically on Docker restart since the DB is not in a persistent volume).

---

## Database Schema Changes

### New tables

**`users`**

```text
id            TEXT  PRIMARY KEY  (UUID)
username      TEXT  NOT NULL UNIQUE
password_hash TEXT  NOT NULL      (bcrypt hash)
```

**`boards`**

```
id        TEXT  PRIMARY KEY  (UUID)
title     TEXT  NOT NULL
owner_id  TEXT  NOT NULL  FK → users.id  ON DELETE CASCADE
```

**`board_members`** (join table; owner is always inserted here too)

```
board_id  TEXT  NOT NULL  FK → boards.id  ON DELETE CASCADE
user_id   TEXT  NOT NULL  FK → users.id   ON DELETE CASCADE
PRIMARY KEY (board_id, user_id)
```

### Modified tables

**`kanban_columns`** — add `board_id TEXT NOT NULL FK → boards.id ON DELETE CASCADE`

**`kanban_cards`** — add:

- `created_by_id TEXT NULL FK → users.id ON DELETE SET NULL`
- `assigned_to_id TEXT NULL FK → users.id ON DELETE SET NULL`

### Seeded data

Three users seeded with bcrypt-hashed passwords: `user/password`, `alice/password`, `bob/password`.
One default board "Main Board" owned by `user`, with `alice` and `bob` as members.
Existing 5 columns and 8 cards seeded into that board, `created_by_id = user.id`.

---

## Backend Changes

### `backend/app/models/board.py`

1. Add `User`, `Board`, `BoardMember` ORM models.
2. Update `KanbanColumn`: add `board_id` FK column + `board` relationship.
3. Update `KanbanCard`: add `created_by_id`, `assigned_to_id` FK columns + relationships.
4. Update `CardSchema`: add `created_by: str | None` and `assigned_to: str | None` (usernames, not IDs).
5. Add `BoardSummary(id, title, owner_username)` and `MemberSchema(user_id, username)` Pydantic models.
6. Update `db_to_board(session, board_id)` to accept `board_id`, filter columns/cards by board, join user names for card fields.
7. Update `board_to_db(session, board_id, board, created_by_id)` to scope queries to `board_id` and set `created_by_id` on new card inserts only.

### `backend/app/auth/permissions.py`

Replace `_valid_tokens: dict[str, float]` and `issue_token() -> str` with:

```python
@dataclass
class SessionData:
    token: str
    user_id: str
    username: str
    expiry: float

_sessions: dict[str, SessionData] = {}

def issue_token(user_id: str, username: str) -> str: ...
async def require_auth(...) -> SessionData: ...  # returns full identity
```

`revoke_token` unchanged. All routes that previously used `_: str = Depends(require_auth)` now get `session: SessionData = Depends(require_auth)`.

### `backend/app/routes/auth.py`

- Replace hardcoded credential check with DB lookup: `SELECT * FROM users WHERE username = ?`
- Verify password using `bcrypt.checkpw(body.password.encode(), user.password_hash.encode())`
- `TokenResponse` gains `user_id: str` and `username: str` fields
- Call `issue_token(user.id, user.username)` instead of `issue_token()`
- `logout` receives `SessionData` and calls `revoke_token(session.token)`

### `backend/app/models/board.py` — password hashing helper

Add `hash_password(plain: str) -> str` using `bcrypt.hashpw`. Used only in `seed_db`. Add `bcrypt` to `pyproject.toml` dependencies.

### `backend/app/routes/board.py`

Remove entirely — all board access moves to `boards.py`.

### New `backend/app/routes/boards.py`

| Method | Path                                          | Auth       | Notes                                                   |
| ------ | --------------------------------------------- | ---------- | ------------------------------------------------------- |
| GET    | `/boards`                                     | any member | List boards for current user (via `board_members`)      |
| POST   | `/boards`                                     | any        | Create board; auto-adds owner as member                 |
| DELETE | `/boards/{board_id}`                          | owner only | 403 if not owner; CASCADE deletes all                   |
| GET    | `/boards/{board_id}`                          | member     | Returns `BoardData` (calls `db_to_board`)               |
| PATCH  | `/boards/{board_id}`                          | member     | Updates board (calls `board_to_db`)                     |
| GET    | `/boards/{board_id}/members`                  | member     | Returns `list[MemberSchema]`                            |
| POST   | `/boards/{board_id}/members`                  | owner only | Body: `{username}` → find user → insert member row      |
| DELETE | `/boards/{board_id}/members/{username}`       | owner only | Cannot remove self; 400                                 |
| PATCH  | `/boards/{board_id}/cards/{card_id}/assignee` | member     | Body: `{username: str\|null}` → update `assigned_to_id` |

All routes verify membership before proceeding (except creation and listing).

### `backend/app/routes/chat.py`

- `ChatRequest` gains `board_id: str`
- Pass `board_id` and `session.user_id` to `board_to_db` when saving AI-suggested updates

### `backend/app/database.py`

- Update `init_db()` to seed when `users` table is empty (not `kanban_columns`)
- Rewrite `seed_db()` to insert 3 users, 1 board, 3 board_members, 5 columns (with `board_id`), 8 cards (with `created_by_id`)

### `backend/app/main.py`

- Register new `boards_router` with prefix `/api`
- Remove old `board_router`

---

## Frontend Changes

### `frontend/src/lib/kanban.ts`

```typescript
export type Card = {
  id: string;
  title: string;
  details: string;
  created_by: string | null;
  assigned_to: string | null;
};

export type BoardSummary = {
  id: string;
  title: string;
  owner_username: string;
};

export type Member = {
  user_id: string;
  username: string;
};
```

### `frontend/src/lib/auth.ts`

Extend store state: add `userId: string | null` and `username: string | null`.
Replace `setToken(token)` with `setSession(token, userId, username)`.
`clearToken()` also clears `userId` and `username`.

### New `frontend/src/lib/boardStore.ts`

Persisted Zustand store:

```typescript
type BoardState = {
  activeBoardId: string | null;
  setActiveBoardId: (id: string) => void;
};
```

### `frontend/src/lib/api.ts`

Replace existing board functions and add new ones:

```typescript
fetchBoards(): Promise<BoardSummary[]>
createBoard(title: string): Promise<BoardSummary>
deleteBoard(boardId: string): Promise<void>
fetchBoard(boardId: string): Promise<BoardData>
updateBoard(boardId: string, board: BoardData): Promise<BoardData>
fetchMembers(boardId: string): Promise<Member[]>
inviteMember(boardId: string, username: string): Promise<Member>
removeMember(boardId: string, username: string): Promise<void>
assignCard(boardId: string, cardId: string, username: string | null): Promise<Card>
sendChat(messages, board, boardId): Promise<ChatResponse>
```

### `frontend/src/app/login/page.tsx`

Change `setToken(data.token)` → `setSession(data.token, data.user_id, data.username)`.

### `frontend/src/components/KanbanBoard.tsx`

- Read `activeBoardId` from `useBoardStore`; query key becomes `["board", activeBoardId]`
- Replace `fetchBoard()` → `fetchBoard(activeBoardId)`
- Replace `updateBoard(board)` → `updateBoard(activeBoardId, board)` in `persist()`
- Replace static header title with `<BoardSelector />` component
- Add "Members" button in header that opens `<MembersPanel />` in a Sheet
- Add "Delete board" button (only visible when `username === board.owner_username`); calls `deleteBoard`, then selects first remaining board

### New `frontend/src/components/BoardSelector.tsx`

- `useQuery(["boards"], fetchBoards)`
- Dropdown showing all boards by title; selecting one calls `setActiveBoardId`
- "New board" inline option: text input on expand, calls `createBoard` on submit, then activates the new board
- On mount: if `activeBoardId` is null or stale, auto-select first board from list

### New `frontend/src/components/MembersPanel.tsx`

Rendered inside a shadcn `Sheet`:

- `useQuery(["members", boardId], () => fetchMembers(boardId))`
- Owner sees: invite input + button (calls `inviteMember`), remove button per non-owner member
- Non-owners see: read-only member list

### `frontend/src/components/KanbanCard.tsx`

Below `card.details`, add two lines conditionally:

- `Created by: {card.created_by}` (only if not null)
- `Assigned to:` + shadcn `Select` (clicking opens dropdown of board members + "Unassigned")
  - On change: calls `assignCard(boardId, card.id, value)`, invalidates `["board", boardId]`
- Card receives `boardId` as a prop

### `frontend/src/components/KanbanColumn.tsx`

Pass `boardId` prop down to each `KanbanCard`.

### `frontend/src/components/chat/ChatSidebar.tsx`

- Pull `activeBoardId` from `useBoardStore`
- Update all board API calls and query invalidations to use `activeBoardId`
- Pass `boardId` to `sendChat`

---

## Execution Order

1. `backend/app/models/board.py` — add User, Board, BoardMember models; update Column/Card
2. `backend/app/database.py` — rewrite seed with users, board, members
3. `backend/app/auth/permissions.py` + `routes/auth.py` — SessionData, DB user lookup, enriched token response
4. New `backend/app/routes/boards.py` + update `main.py`
5. Delete `backend/app/routes/board.py`
6. Update `backend/app/routes/chat.py` for board_id
7. `frontend/src/lib/kanban.ts` — update Card type, add BoardSummary/Member types
8. `frontend/src/lib/auth.ts` — add userId/username to store
9. New `frontend/src/lib/boardStore.ts`
10. `frontend/src/lib/api.ts` — parameterized board functions + new endpoints
11. `frontend/src/app/login/page.tsx` — call setSession
12. `frontend/src/components/KanbanBoard.tsx` — board switching, delete, MembersPanel integration
13. New `frontend/src/components/BoardSelector.tsx`
14. New `frontend/src/components/MembersPanel.tsx`
15. `frontend/src/components/KanbanCard.tsx` + `KanbanColumn.tsx` — creator/assignee display + assign interaction
16. `frontend/src/components/chat/ChatSidebar.tsx` — update query keys and API calls

---

## Verification

1. Run `./scripts/start.sh` (fresh container recreates `board.db` with new schema)
2. Log in as `user`/`password` at `http://localhost:8000`
3. Verify "Main Board" appears in the board selector with seeded cards
4. Create a second board — confirm it appears in dropdown and switching works
5. On a card, verify "Created by: user" is shown
6. Open Members panel — invite `alice` — confirm she appears in member list
7. On a card, assign to `alice` — confirm card shows "Assigned to: alice"
8. Log in as `alice`/`password` — confirm "Main Board" is visible (was pre-invited)
9. As `alice`, add a card — confirm it shows "Created by: alice"
10. Confirm `alice` does not see the "Delete board" button
11. Log in as `user`, delete the second board — confirm it disappears from selector
12. Test AI chat still works and updates the correct board
