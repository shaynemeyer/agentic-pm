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

This is a pure frontend-only demo (no backend yet). All state is ephemeral — no persistence.

**Data model** (`src/lib/kanban.ts`):

- `Card`: `{ id, title, details }`
- `Column`: `{ id, title, cardIds[] }` — columns own ordered card IDs
- `BoardData`: `{ columns: Column[], cards: Record<string, Card> }` — cards normalized by id

**Component hierarchy**:

- `KanbanBoard` — single stateful component holding all `BoardData` in `useState`. Handles drag-and-drop via `@dnd-kit/core`, and passes callbacks for rename/add/delete down to children.
- `KanbanColumn` — droppable via `useDroppable`; wraps cards in `SortableContext`
- `KanbanCard` — sortable/draggable via `useSortable`
- `KanbanCardPreview` — non-interactive clone rendered in `DragOverlay` during drag
- `NewCardForm` — inline toggle form at the bottom of each column

**Drag-and-drop**: Uses `@dnd-kit/core` with `closestCorners` collision detection. `moveCard()` in `kanban.ts` is a pure function — handles same-column reorder and cross-column moves.

**Styling**: Tailwind 4 utility classes with CSS custom properties defined in `globals.css`. Reference colors via `var(--accent-yellow)`, `var(--primary-blue)`, etc. — never hardcode hex values. Fonts are Space Grotesk (`--font-display`) and Manrope (`--font-body`) loaded via `next/font/google`.

**Path alias**: `@/` resolves to `src/` in both Next.js and Vitest.

## Testing setup

- Unit/component tests: Vitest + jsdom + `@testing-library/react`. Files matching `src/**/*.{test,spec}.{ts,tsx}`.
- E2E tests: Playwright targeting Chromium only, `baseURL: http://127.0.0.1:3000`, test files in `tests/`.
- Test setup file: `src/test/setup.ts` (imports `@testing-library/jest-dom`).
- Note: `playwright.config.ts` uses `npm run dev` in `webServer.command` — this should be `bun run dev` if changed.
