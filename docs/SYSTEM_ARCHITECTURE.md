# System Architecture

## Overview

Agentic-PM is a single-board Kanban app with an AI chat sidebar. The entire stack runs in one Docker container: a FastAPI server that serves the statically-built Next.js frontend at `/` and exposes a REST API at `/api/*`. State is persisted in a SQLite database. AI features are powered by OpenRouter.

```
Browser → Docker container (port 8000)
              └── FastAPI
                    ├── /           → serves Next.js static export (frontend/out/)
                    ├── /api/*      → REST API
                    └── board.db    → SQLite (auto-created on startup)
                              ↕
                        OpenRouter API (AI)
```

---

## Deployment Layout

```mermaid
graph TD
    User["Browser\n(localhost:8000)"]

    subgraph Docker["Docker Container"]
        FastAPI["FastAPI / Uvicorn\n(port 8000)"]
        Static["Static Files\nfrontend/out/"]
        SQLite["SQLite\nboard.db"]
    end

    OpenRouter["OpenRouter API\nopenai/gpt-oss-120b"]

    User -->|"HTTP"| FastAPI
    FastAPI -->|"GET / (html)"| Static
    FastAPI -->|"GET/PATCH /api/board\nPOST /api/chat"| SQLite
    FastAPI -->|"POST (JSON)"| OpenRouter
```

The Dockerfile uses a two-stage build:

- **Stage 1** (`oven/bun:1`) — installs frontend deps and runs `bun run build`, producing `frontend/out/` (static HTML/JS/CSS)
- **Stage 2** (`python:3.12-slim`) — installs backend with `uv sync`, copies `frontend/out/` in, starts uvicorn

---

## Backend Architecture

### Module Structure

```
backend/app/
  main.py            # FastAPI app, router registration, lifespan, static mount
  config.py          # Reads DATABASE_URL and OPENROUTER_API_KEY from .env
  database.py        # Async SQLAlchemy engine, session factory, init_db(), seed_db()
  ai.py              # OpenRouter client, call_ai()
  auth/
    permissions.py   # In-memory token store, issue_token(), require_auth dependency
  models/
    board.py         # ORM models (KanbanColumn, KanbanCard)
                     # Pydantic schemas (BoardData, CardSchema, ColumnSchema)
                     # Pydantic chat schemas (ChatMessage, ChatRequest, ChatResponse)
                     # db_to_board(), board_to_db()
  routes/
    auth.py          # POST /api/auth/login, POST /api/auth/logout
    board.py         # GET /api/board, PATCH /api/board
    chat.py          # POST /api/chat
```

### Startup Sequence

```mermaid
sequenceDiagram
    participant U as Uvicorn
    participant A as FastAPI (lifespan)
    participant DB as SQLite

    U->>A: startup
    A->>DB: create_all (CREATE TABLE IF NOT EXISTS)
    DB-->>A: tables ready
    A->>DB: SELECT COUNT(*) FROM kanban_columns
    alt tables empty
        A->>DB: INSERT 5 columns + 8 cards (seed data)
    end
    A->>A: mount StaticFiles at /
    A-->>U: ready — serving on :8000
```

### Authentication

Auth is **stateless from the client's perspective** but **in-memory on the server**. Tokens are UUID4 strings stored in a Python `set[str]` for the lifetime of the process. They are not persisted to the database — a server restart invalidates all sessions.

```mermaid
sequenceDiagram
    participant C as Client
    participant A as POST /api/auth/login
    participant P as permissions.py

    C->>A: {"username":"user","password":"password"}
    A->>P: issue_token()
    P->>P: uuid4() → add to _valid_tokens
    P-->>A: token string
    A-->>C: {"token": "<uuid>"}

    Note over C,P: All subsequent requests send Authorization: Bearer <token>

    C->>A: POST /api/auth/logout (Bearer <token>)
    A->>P: _valid_tokens.discard(token)
    A-->>C: 204 No Content
```

`require_auth` is a FastAPI dependency injected on every protected route. It reads the `Authorization` header, strips `Bearer `, and checks the token against `_valid_tokens`. Returns 401 if absent or invalid.

### Database Layer

SQLite file (`board.db`) lives in `backend/`. SQLAlchemy async engine with `aiosqlite` driver. All DB I/O is non-blocking.

```mermaid
erDiagram
    kanban_columns {
        TEXT id PK
        TEXT title
        INTEGER position
    }

    kanban_cards {
        TEXT id PK
        TEXT title
        TEXT details
        TEXT column_id FK
        INTEGER position
    }

    kanban_columns ||--o{ kanban_cards : "has (ON DELETE CASCADE)"
```

**`db_to_board(session) → BoardData`** — queries all columns ordered by `position`, all cards ordered by `position`, builds the `BoardData` JSON structure the frontend expects.

**`board_to_db(session, board)`** — diff-based upsert: deletes removed column/card IDs, then INSERT-or-UPDATE the rest. Positions are derived from array index order.

### API Routes

| Method  | Path               | Auth | Description                                                  |
| ------- | ------------------ | ---- | ------------------------------------------------------------ |
| `GET`   | `/api/health`      | No   | Health check → `{"status":"ok"}`                             |
| `POST`  | `/api/auth/login`  | No   | Validates credentials, returns token                         |
| `POST`  | `/api/auth/logout` | Yes  | Invalidates token, returns 204                               |
| `GET`   | `/api/board`       | Yes  | Returns full `BoardData` from DB                             |
| `PATCH` | `/api/board`       | Yes  | Accepts `BoardData`, persists, returns updated state         |
| `POST`  | `/api/chat`        | Yes  | Accepts messages + board, calls AI, optionally updates board |

### AI Layer (`ai.py`)

```mermaid
sequenceDiagram
    participant R as POST /api/chat
    participant AI as call_ai()
    participant OR as OpenRouter API

    R->>AI: board dict + messages list
    AI->>OR: system prompt (board JSON) + conversation history
    Note over AI,OR: model: openai/gpt-oss-120b\nresponse_format: json_object
    OR-->>AI: {"message":"...", "board_update": <BoardData|null>}
    AI-->>R: parsed dict
    R->>R: if board_update → board_to_db()
    R-->>Client: ChatResponse
```

The system prompt embeds the full board JSON so the model has complete context. The model is instructed to return only valid JSON with `message` (string) and `board_update` (BoardData or null).

---

## Frontend Architecture

### Technology Stack

| Concern         | Library                                      |
| --------------- | -------------------------------------------- |
| Framework       | Next.js 16 (static export)                   |
| Language        | TypeScript + React 19                        |
| Styling         | Tailwind CSS v4 + CSS custom properties      |
| UI components   | shadcn/ui (Sheet, Button, Input, ScrollArea) |
| Drag and drop   | @dnd-kit/core + @dnd-kit/sortable            |
| Server state    | TanStack Query v5                            |
| Client state    | Zustand v5                                   |
| Package manager | bun                                          |

### Component Tree

```mermaid
graph TD
    Layout["RootLayout\nlayout.tsx\n(Providers wrapper)"]
    Providers["Providers.tsx\nQueryClientProvider"]
    Page["page.tsx\n'use client'\nauth guard"]
    KB["KanbanBoard.tsx\nuseQuery board\nDndContext"]
    KC["KanbanColumn.tsx\nuseDroppable\nSortableContext"]
    KCard["KanbanCard.tsx\nuseSortable"]
    KPrev["KanbanCardPreview.tsx\nDragOverlay clone"]
    NCF["NewCardForm.tsx\ninline add form"]
    CS["ChatSidebar.tsx\nSheet panel\nuseQuery board"]
    CM["ChatMessage.tsx\nmessage bubble"]

    Layout --> Providers
    Providers --> Page
    Page --> KB
    Page --> CS
    KB --> KC
    KB --> KPrev
    KC --> KCard
    KC --> NCF
    CS --> CM
```

### State Management

There are two state domains, kept separate:

**Server state** (TanStack Query, key: `["board"]`):

- Single source of truth for `BoardData`
- Fetched on mount via `GET /api/board`
- Optimistically updated via `setQueryData` then confirmed with `invalidateQueries` after any mutation
- Used by both `KanbanBoard` and `ChatSidebar`

**Client state** (Zustand):

| Store | File          | Contents                                                 |
| ----- | ------------- | -------------------------------------------------------- |
| Auth  | `lib/auth.ts` | `token: string \| null` — persisted to `localStorage`    |
| Chat  | `lib/chat.ts` | `messages: ChatMessage[]` — session only (not persisted) |

### Data Flow — Board Mutation

```mermaid
sequenceDiagram
    participant U as User
    participant KB as KanbanBoard
    participant QC as QueryClient
    participant API as api.ts
    participant BE as FastAPI

    U->>KB: drag card / rename / add / delete
    KB->>QC: setQueryData(["board"], newBoard)  ← optimistic
    KB->>API: updateBoard(newBoard)
    API->>BE: PATCH /api/board (Bearer token)
    BE-->>API: updated BoardData
    KB->>QC: invalidateQueries(["board"])  ← triggers re-fetch
    QC->>BE: GET /api/board
    BE-->>QC: confirmed BoardData
```

### Data Flow — AI Chat

```mermaid
sequenceDiagram
    participant U as User
    participant CS as ChatSidebar
    participant ZS as useChatStore
    participant API as api.ts
    participant BE as FastAPI
    participant OR as OpenRouter

    U->>CS: types message + clicks Send
    CS->>ZS: addMessage({role:"user", content})
    CS->>API: sendChat(messages, board)
    API->>BE: POST /api/chat (Bearer token)
    BE->>OR: GPT call with board + history
    OR-->>BE: {message, board_update}
    alt board_update present
        BE->>BE: board_to_db(board_update)
    end
    BE-->>API: ChatResponse
    CS->>ZS: addMessage({role:"assistant", content})
    alt board_update present
        CS->>API: updateBoard(board_update)
        CS->>QC: invalidateQueries(["board"])
    end
```

### Auth Flow

```mermaid
sequenceDiagram
    participant B as Browser
    participant P as page.tsx
    participant LS as localStorage
    participant BE as FastAPI

    B->>P: navigate to /
    P->>LS: read auth store token
    alt no token
        P->>B: router.replace("/login")
        B->>BE: POST /api/auth/login
        BE-->>B: {token}
        B->>LS: setToken(token)
        B->>P: navigate to /
    end
    P->>BE: GET /api/board (Bearer token)
    BE-->>P: BoardData
    P->>B: render KanbanBoard + ChatSidebar
```

### Data Model (`lib/kanban.ts`)

```
BoardData
  columns: Column[]        ← ordered array drives column render order
    id: string
    title: string
    cardIds: string[]      ← ordered, drives card render order within column
  cards: Record<id, Card>  ← flat lookup map
    id: string
    title: string
    details: string
```

Cards are normalised — `cards` is a flat map keyed by ID, and columns only hold ordered arrays of IDs. `moveCard()` is a pure function that handles both same-column reorder and cross-column moves, returning a new `columns` array without mutating state.

---

## Request Authentication Sequence (Full)

```mermaid
sequenceDiagram
    participant C as Client (browser)
    participant FE as Static Files (/)
    participant BE as FastAPI (/api)
    participant DB as SQLite
    participant AI as OpenRouter

    C->>FE: GET /  →  HTML + JS bundle
    C->>BE: POST /api/auth/login
    BE-->>C: {token}
    C->>BE: GET /api/board  (Bearer token)
    BE->>DB: SELECT columns + cards
    DB-->>BE: rows
    BE-->>C: BoardData JSON
    C->>C: render board
    C->>BE: PATCH /api/board  (Bearer token + updated BoardData)
    BE->>DB: upsert/delete
    DB-->>BE: ok
    BE-->>C: updated BoardData
    C->>BE: POST /api/chat  (Bearer token + messages + board)
    BE->>AI: GPT request
    AI-->>BE: {message, board_update}
    opt board_update
        BE->>DB: upsert board
    end
    BE-->>C: ChatResponse
```

---

## Cross-Cutting Constraints

| Constraint             | Detail                                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------------------------- |
| Static export          | Next.js `output: "export"` — no server-side rendering, all API calls are client-side `fetch`          |
| No hardcoded colors    | All colors reference CSS custom properties (`--navy-dark`, `--primary-blue`, etc.) from `globals.css` |
| Single auth credential | Hardcoded `user` / `password`; tokens are in-memory, not persisted across restarts                    |
| Zero migration step    | `init_db()` runs on every startup; tables are created and seeded automatically                        |
| Package managers       | `bun` for frontend only, `uv` for backend only — never mixed                                          |
| AI model               | `openai/gpt-oss-120b` via OpenRouter's OpenAI-compatible API                                          |
| Token storage          | `localStorage` via Zustand `persist` middleware; cleared on logout                                    |
