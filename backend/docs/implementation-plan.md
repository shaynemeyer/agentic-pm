# Plan: Backend Implementation (FastAPI + SQLAlchemy + SQLite)

## Context

The backend directory currently contains only `CLAUDE.md` — no Python code exists yet. The user updated `CLAUDE.md` to add SQLAlchemy as the ORM. This plan implements the full backend following the patterns from the user's `fastapi-boilerplate`: `app/` package, `routes/` for handlers, `auth/` for security, `models/` co-locating ORM models + Pydantic schemas, `config.py` for env settings, async sessions via `AsyncSession`.

---

## File Structure

```
backend/
  pyproject.toml
  app/
    __init__.py
    main.py           # FastAPI app, lifespan, router registration, static files
    config.py         # Settings via os.getenv() + load_dotenv()
    database.py       # Async engine, AsyncSession, Base, init_db(), seed_db()
    ai.py             # OpenRouter client
    models/
      __init__.py
      board.py        # KanbanColumn + KanbanCard ORM models, Pydantic schemas,
                      #   and CRUD helpers: db_to_board(), board_to_db()
    routes/
      __init__.py
      auth.py         # POST /api/auth/login
      board.py        # GET /api/board, PATCH /api/board
      chat.py         # POST /api/chat
    auth/
      __init__.py
      permissions.py  # require_auth dependency, issue_token(), _valid_tokens set
  tests/
    conftest.py       # TestClient + in-memory async DB fixture, auth headers
    routes/
      test_auth.py
      test_board.py
      test_chat.py
```

---

## 1. `pyproject.toml`

```toml
[project]
name = "backend"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "fastapi",
    "uvicorn[standard]",
    "sqlalchemy[asyncio]",
    "aiosqlite",
    "openai",
    "python-dotenv",
    "python-multipart",
    "httpx",
]

[tool.pytest.ini_options]
testpaths = ["tests"]
asyncio_mode = "auto"

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"
```

`aiosqlite` provides async SQLite support; `asyncio_mode = "auto"` removes the need for `@pytest.mark.asyncio` on every test.

---

## 2. `app/config.py`

Mirrors boilerplate pattern — reads from `.env` at project root:

```python
from dotenv import load_dotenv
import os

load_dotenv(dotenv_path="../.env")

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./board.db")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
```

---

## 3. `app/database.py`

Async engine pattern matching boilerplate:

- `engine = create_async_engine(DATABASE_URL, echo=False)`
- `async_session_maker = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)`
- `Base = declarative_base()`
- `async def get_session()` — yields `AsyncSession`, used via `Depends(get_session)`
- `async def init_db()` — `async with engine.begin() as conn: await conn.run_sync(Base.metadata.create_all)`, then seeds if empty
- `async def seed_db(session)` — inserts 5 columns (Backlog, Discovery, In Progress, Review, Done) + 8 sample cards matching frontend mock data

---

## 4. `app/models/board.py`

Co-locates ORM models, Pydantic schemas, and CRUD helpers (mirrors boilerplate `models/item.py`):

**SQLAlchemy ORM Models:**

`KanbanColumn` — table `kanban_columns`

- `id`: String PK
- `title`: String
- `position`: Integer

`KanbanCard` — table `kanban_cards`

- `id`: String PK
- `title`: String
- `details`: String, default `""`
- `column_id`: String FK → `kanban_columns.id` (`ondelete="CASCADE"`)
- `position`: Integer

**Pydantic Schemas:**

- `CardSchema(id, title, details)`
- `ColumnSchema(id, title, cardIds: list[str])`
- `BoardData(columns: list[ColumnSchema], cards: dict[str, CardSchema])`
- `LoginRequest(username, password)`
- `TokenResponse(token)`
- `ChatRequest(messages: list[dict], board: BoardData)`
- `ChatResponse(message: str, board_update: BoardData | None = None)`

**CRUD Helpers:**

- `async def db_to_board(session) -> BoardData` — query columns + cards ordered by position, assemble `BoardData`
- `async def board_to_db(session, board: BoardData)` — diff-based upsert:
  - Columns: delete removed IDs, upsert changed/new (position = array index)
  - Cards: delete removed IDs, upsert changed/new (column_id + position = array index in cardIds)

---

## 5. `app/auth/permissions.py`

Mirrors boilerplate `auth/permissions.py`:

```python
_valid_tokens: set[str] = set()

def issue_token() -> str:
    token = str(uuid4())
    _valid_tokens.add(token)
    return token

async def require_auth(authorization: str = Header(...)):
    if not authorization.startswith("Bearer "):
        raise HTTPException(401)
    token = authorization.removeprefix("Bearer ")
    if token not in _valid_tokens:
        raise HTTPException(401)
```

---

## 6. `app/routes/auth.py`

```python
router = APIRouter()

@router.post("/auth/login", response_model=TokenResponse)
async def login(body: LoginRequest):
    if body.username != "user" or body.password != "password":
        raise HTTPException(401)
    return TokenResponse(token=issue_token())
```

---

## 7. `app/routes/board.py`

```python
router = APIRouter()

@router.get("/board", response_model=BoardData)
async def get_board(session=Depends(get_session), _=Depends(require_auth)):
    return await db_to_board(session)

@router.patch("/board", response_model=BoardData)
async def update_board(body: BoardData, session=Depends(get_session), _=Depends(require_auth)):
    await board_to_db(session, body)
    return await db_to_board(session)
```

---

## 8. `app/ai.py`

```python
client = openai.OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=config.OPENROUTER_API_KEY,
)

def call_ai(board: dict, messages: list[dict]) -> dict:
    # system prompt includes board JSON
    # returns parsed { message: str, board_update?: dict }
```

---

## 9. `app/routes/chat.py`

```python
router = APIRouter()

@router.post("/chat", response_model=ChatResponse)
async def chat(body: ChatRequest, session=Depends(get_session), _=Depends(require_auth)):
    result = call_ai(body.board.model_dump(), body.messages)
    if result.get("board_update"):
        await board_to_db(session, BoardData(**result["board_update"]))
    return ChatResponse(**result)
```

---

## 10. `app/main.py`

Minimal, mirrors boilerplate:

```python
@asynccontextmanager
async def lifespan(app):
    await init_db()
    yield

app = FastAPI(lifespan=lifespan)

app.include_router(auth_router, prefix="/api")
app.include_router(board_router, prefix="/api")
app.include_router(chat_router, prefix="/api")

app.mount("/", StaticFiles(directory="../frontend/out", html=True), name="static")
```

---

## 11. `tests/conftest.py`

Mirrors boilerplate `tests/conftest.py`:

- `session_fixture` — in-memory `sqlite+aiosqlite:///:memory:` engine, runs `init_db()`
- `client_fixture` — `TestClient` with `get_session` overridden to use in-memory session
- `auth_headers` — logs in via `/api/auth/login`, returns `{"Authorization": "Bearer <token>"}`

---

## 12. Test Files

- `tests/routes/test_auth.py` — valid login → 200 + token; wrong password → 401; missing/invalid token → 401 on protected routes
- `tests/routes/test_board.py` — GET returns seeded data; PATCH persists diff; subsequent GET reflects changes
- `tests/routes/test_chat.py` — POST returns `ChatResponse`; `board_update` in AI response is persisted (monkeypatch `call_ai`)

---

## Data Flow

Frontend `BoardData`:

```json
{
  "columns": [
    { "id": "col-backlog", "title": "Backlog", "cardIds": ["card-1"] }
  ],
  "cards": { "card-1": { "id": "card-1", "title": "Task", "details": "" } }
}
```

`db_to_board`: `SELECT * FROM kanban_columns ORDER BY position` → for each, `SELECT * FROM kanban_cards WHERE column_id=? ORDER BY position` → assemble dict.

`board_to_db`: compute `incoming_col_ids`, `incoming_card_ids`; `DELETE WHERE id NOT IN (...)` for each table; then `MERGE / INSERT OR REPLACE` for remaining rows.

---

## Notes on CLAUDE.md Update

The uvicorn command in `backend/CLAUDE.md` needs updating from `main:app` to `app.main:app` since `main.py` now lives inside the `app/` package.

---

## Verification

1. `cd backend && uv sync`
2. Create `.env` at project root: `OPENROUTER_API_KEY=sk-...`
3. `uv run uvicorn app.main:app --reload` — `board.db` created and seeded
4. `POST /api/auth/login {"username":"user","password":"password"}` → token
5. `GET /api/board` with `Authorization: Bearer <token>` → seeded board (5 columns, 8 cards)
6. `PATCH /api/board` with modified board → diff applied, returns updated board
7. `GET /api/board` → reflects persisted changes
8. `POST /api/chat` with message + board → AI response returned
9. `uv run pytest` — all tests pass
