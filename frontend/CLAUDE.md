# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Use **bun** (not npm) for all package management and script execution.

```bash
bun run dev          # Start dev server at localhost:3000
bun run build        # Build for production
bun run lint         # Run ESLint
bun run test         # Run unit/component tests (vitest, single run)
bun run test:unit:watch  # Run vitest in watch mode
bun run test:e2e     # Run Playwright e2e tests (requires dev server)
bun run test:all     # Run unit + e2e tests
```

Run a single test file:

```bash
bun run test src/lib/kanban.test.ts
bun run test src/components/KanbanBoard.test.tsx
```

## Preferences

- **API layer**: tRPC (not server actions)
- **Components**: shadcn/ui
- **Server/async state**: Tanstack Query
- **Client state**: Zustand
- **File structure**: one component per file at `src/components/{domain}/{Component}.tsx`

## Architecture

**Data model** (`src/lib/kanban.ts`):

- `Card`: `{ id, title, details }`
- `Column`: `{ id, title, cardIds[] }` — columns own ordered card IDs
- `BoardData`: `{ columns: Column[], cards: Record<string, Card> }` — cards normalized by id

**Component hierarchy**:

- `KanbanBoard` — single stateful root; holds `BoardData` in `useState`; owns all DnD logic via `@dnd-kit/core`, passes callbacks for rename/add/delete to children
- `KanbanColumn` — droppable via `useDroppable`; wraps cards in `SortableContext`
- `KanbanCard` — sortable/draggable via `useSortable`
- `KanbanCardPreview` — non-interactive clone rendered in `DragOverlay` during drag
- `NewCardForm` — inline toggle form at the bottom of each column

**Drag-and-drop**: `@dnd-kit/core` with `closestCorners` collision detection. `moveCard()` in `kanban.ts` is a pure function handling same-column reorder and cross-column moves.

**Styling**: Tailwind 4 with CSS custom properties in `globals.css`. Always use variables — never hardcode hex values:

| Variable             | Hex       | Use                               |
| -------------------- | --------- | --------------------------------- |
| `--accent-yellow`    | `#ecad0a` | accent lines, highlights          |
| `--primary-blue`     | `#209dd7` | links, key sections               |
| `--purple-secondary` | `#753991` | submit buttons, important actions |
| `--dark-navy`        | `#032147` | main headings                     |
| `--gray-text`        | `#888888` | supporting text, labels           |

Fonts: Space Grotesk (`--font-display`), Manrope (`--font-body`) via `next/font/google`.
Path alias: `@/` resolves to `src/` in both Next.js and Vitest.

## Testing setup

- Unit/component tests: Vitest + jsdom + `@testing-library/react`. Files matching `src/**/*.{test,spec}.{ts,tsx}`.
- E2E tests: Playwright targeting Chromium only, `baseURL: http://127.0.0.1:3000`, test files in `tests/`.
- Test setup file: `src/test/setup.ts` (imports `@testing-library/jest-dom`).
- Note: `playwright.config.ts` uses `npm run dev` in `webServer.command` — this should be `bun run dev` if changed.
