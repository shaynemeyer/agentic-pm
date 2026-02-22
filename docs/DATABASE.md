# Database

## Why SQLite

SQLite is the right fit here: the app runs locally in a single Docker container with one user. It requires zero configuration, stores everything in a single file (`board.db`), and is supported natively by SQLAlchemy's async stack. There is no need for a separate database process.

## ORM

SQLAlchemy async with `aiosqlite` as the driver:

- Engine: `sqlite+aiosqlite:///./board.db`
- Sessions: `AsyncSession` via `async_session_maker`
- Base: `declarative_base()` shared by all models

## Schema

Two tables. Columns are ordered by `position`. Cards are ordered within their column by `position`. Both IDs are user-defined strings (matching the frontend `id` values).

```
kanban_columns
┌─────────────┬─────────────┬──────────────┐
│ id (PK)     │ title       │ position     │
│ TEXT        │ TEXT        │ INTEGER      │
└─────────────┴─────────────┴──────────────┘

kanban_cards
┌─────────────┬─────────────┬─────────────┬──────────────────────────┬──────────────┐
│ id (PK)     │ title       │ details     │ column_id (FK)           │ position     │
│ TEXT        │ TEXT        │ TEXT        │ TEXT → kanban_columns.id │ INTEGER      │
│             │             │ DEFAULT ''  │ ON DELETE CASCADE        │              │
└─────────────┴─────────────┴─────────────┴──────────────────────────┴──────────────┘
```

Foreign key: `kanban_cards.column_id` → `kanban_columns.id ON DELETE CASCADE` — deleting a column removes its cards automatically.

## BoardData JSON ↔ DB Mapping

The frontend `BoardData` type is:

```ts
type BoardData = {
  columns: Column[]; // ordered array
  cards: Record<string, Card>; // normalized by id
};

type Column = { id: string; title: string; cardIds: string[] };
type Card = { id: string; title: string; details: string };
```

Mapping rules:

| Frontend                     | Database                                                  |
| ---------------------------- | --------------------------------------------------------- |
| `columns` array order        | `kanban_columns.position` (0-based index)                 |
| `column.cardIds` array order | `kanban_cards.position` (0-based index within the column) |
| `cards` dict key             | `kanban_cards.id`                                         |
| `column.cardIds` membership  | `kanban_cards.column_id`                                  |

**Reading** (`db_to_board`): query all columns ordered by `position`, then all cards ordered by `column_id, position`. Reconstruct `columns` array and `cards` dict from query results.

**Writing** (`board_to_db`): diff incoming `BoardData` against current DB state. Delete rows whose IDs are absent from the incoming data. `INSERT OR REPLACE` all remaining rows with updated `position` values derived from array index.

## Seeding

On startup, `init_db()` calls `Base.metadata.create_all` (no-op if tables exist), then checks whether `kanban_columns` is empty. If empty, it inserts the 5 columns and 8 cards from `initialData`:

| Column id     | Title       | Cards          |
| ------------- | ----------- | -------------- |
| col-backlog   | Backlog     | card-1, card-2 |
| col-discovery | Discovery   | card-3         |
| col-progress  | In Progress | card-4, card-5 |
| col-review    | Review      | card-6         |
| col-done      | Done        | card-7, card-8 |

Seeding only runs once — subsequent startups find rows already present and skip it.
