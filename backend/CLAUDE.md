# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Stack

- Python FastAPI
- SQLite (via the standard `sqlite3` module or SQLAlchemy — created on first run if missing)
- OpenRouter for AI calls (model: `openai/gpt-oss-120b`)
- uv for package management and virtual environments

## Commands

```bash
uv sync                  # Install dependencies
uv run uvicorn main:app --reload   # Start dev server
uv run pytest            # Run tests
uv run pytest tests/test_foo.py    # Run a single test file
```

## Planned architecture

The backend serves two roles:

1. Serves the statically-built Next.js frontend at `/`
2. Exposes a REST API for the Kanban board and AI chat

Key API surface (to be built):

- `POST /api/auth/login` — validate hardcoded credentials (`user` / `password`), return session token
- `GET /api/board` — return the current user's Kanban board as JSON
- `PATCH /api/board` — update board state (move/edit/add/delete cards or columns)
- `POST /api/chat` — accept user message + conversation history, call OpenRouter, return AI response and optional board update

## AI integration

- Calls OpenRouter via the OpenAI-compatible SDK
- Always passes the current board JSON + conversation history as context
- Responds with structured output: `{ message: string, board_update?: BoardData }`
- `OPENROUTER_API_KEY` is loaded from `.env` at the project root

## Conventions

- One concern per file (routes, models, db, ai)
- No unnecessary abstraction — keep it flat until complexity demands otherwise
- Database is created on startup if it doesn't exist
